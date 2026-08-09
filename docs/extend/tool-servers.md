# Give Agents External Tools (MCP)

For a deployment author who wants agents to reach something outside the checkout: an issue tracker,
an advisory database, a vendor's hosted MCP server, an internal service. You register the server in
your own composition root, attach it to the agent kinds that should have it, and supply credentials
per workspace. No fork of the platform, and no rebuild of the runner image.

::: tip Two MCP surfaces, and this is the consuming one
This page is about agents CALLING MCP servers. Exposing Cat Factory's own API as an MCP server, so
your editor or an agent of yours can drive the board, is the other direction:
[MCP Server](./mcp-server.md).
:::

## Register a server

A tool server is deployment-static data registered on the same `AgentKindRegistry` you already
inject for [custom agents](./custom-agents.md). All three facades are published packages whose
entry points take the registry as an option, so you depend on a facade and compose your own entry
point:

```ts
import { defaultAgentKindRegistry } from '@cat-factory/agents'
import { createWorker } from '@cat-factory/worker'
// Node: `start` from '@cat-factory/node-server'; local: `startLocal` from '@cat-factory/local-server'.
// All three take the same `agentKindRegistry` / `createToolSecretResolver` options.

const registry = defaultAgentKindRegistry()

registry.registerToolServer({
  id: 'org-advisories',
  label: 'Org advisory database',
  guidance: 'Look up a dependency here before judging whether a version bump is risky.',
  transport: { kind: 'stdio', command: 'npx', args: ['-y', '@example-org/advisories-mcp@1.4.2'] },
  allowedTools: ['lookup_advisory'],
  secretKeys: [
    { key: 'MCP_ORG_ADVISORY_TOKEN', usage: 'A read token from the advisory admin page.' },
  ],
})

// Attach it to a BUILT-IN kind without redefining it, or list it in a custom kind's `toolServers`.
registry.assignToolServers('coder', ['org-advisories'])

export default createWorker({ agentKindRegistry: registry })
```

Registration is code-first on purpose. The deployment declares WHAT exists (url, command,
transport, credentials by name) and a workspace supplies credential VALUES, so a tenant can bring
its own vendor account and cannot point the deployment at a different endpoint.

`registerToolServer` replaces by id, last write wins, which is how you repoint a server that an
installed third-party package registered.

`guidance` is what the agent is told the server is FOR. It goes into the prompt verbatim, so write
it as an instruction ("Read the issue behind a task before guessing at its intent. Never file or
edit."), not as a description.

## Which harness can serve what

Which transports each agent CLI can reach is a fact about the CLI:

| Harness | `stdio` | `http` | Notes |
| --- | --- | --- | --- |
| `claude-code` | yes | yes | Config rides a per-run file, so runs on a developer's own CLI login are served too. |
| `codex` | yes | no | Stdio-only client. An ambient Codex run has no per-run config home, so it is not served at all. |
| `pi` | no | no | Pi has no MCP client, by design. Tool servers never apply on Pi runs. |

A definition's `harnesses` field may NARROW this (a server that only makes sense under one CLI) and
never widen it. Narrowing to a combination no harness can serve, such as an `http` server on
`['codex']`, is dead configuration that no run can even report as dropped, so boot warns about it.

Tool servers also need a container: an inline LLM step has no agent CLI to wire one into, and boot
validation warns about that combination too.

The same is true of a step that runs as a [multi-model consensus
panel](../guide/choosing-a-pipeline.md#multi-model-consensus), and boot cannot warn about that one:
the kind has a container surface, and the panel is a per-step choice. A diverted step withholds
every declared server under `consensus_panel` below, tells its participants so, and records it, so
the ceiling shows up where the run does rather than as a tool that quietly went unused.

## Why a run did not get the server

A declared server that could not be wired is STATED to the agent, in the prompt, and recorded on the
step. It is never silently missing: an agent told nothing would plan around a tool that was never
there and discover the gap halfway through. Each reason is its own value because each needs a
different fix.

| Reason | What happened | The fix |
| --- | --- | --- |
| `harness_unsupported` | This CLI speaks no MCP (Pi), the definition's `harnesses` excludes it, or it is an ambient Codex run with no per-run config home | The run's harness, the `harnesses` list, or a leased credential instead of the developer's own CLI login |
| `transport_unsupported` | The CLI speaks MCP but cannot reach this transport (Codex is stdio-only) | A second declaration for the other transport |
| `missing_secret` | A `required` credential did not resolve | Set the variable, or store the workspace value |
| `reserved_secret` | The credential's LOOKUP key names a platform configuration variable | The DECLARATION. Setting the variable must not help |
| `unusable_secret` | A credential resolved and had nowhere to go: it named a channel its transport does not have | The DECLARATION. The value is set and the key is fine, so neither of those helps |
| `oauth_not_connected` | The server authenticates with OAuth and this workspace holds no grant, or the deployment has no `ENCRYPTION_KEY` to keep one in | Press Connect on the board and sign in at the vendor. Set `ENCRYPTION_KEY` first if the deployment has no grant store |
| `oauth_token_failed` | A grant is on file and produced no access token: a revoked or expired refresh, an authorization server that refused, discovery that failed | Reconnect, or wait out the vendor's outage |
| `over_budget` | Nothing is wrong with the server. The kind declares more than one dispatch carries | Trim the kind's declarations |
| `consensus_panel` | Nothing is wrong with the server either. The step ran as a multi-model consensus panel, whose participants are single model calls with no agent CLI | Turn consensus off for that step if it needs the tool, or accept that the panel judges without it |

Where you see this: each step of a run records the servers it WIRED (with the tool list the
declaration narrowed it to) and the ones it DROPPED with the reason above. The step detail renders
them as chips, so a run that quietly went without its issue tracker says so where you are already
looking.

On `claude-code` the step also carries what the CLI itself reported at startup, which is the only
evidence that a wired server actually connected rather than merely being handed over. Codex
publishes no such report, so a Codex run records the platform's half alone. That is shown as
absent, never as healthy.

## What the agent may call

`allowedTools` narrows a server to the tools you want a kind to reach.

- **Each entry is a single tool NAME.** The harness joins the list into one argument with commas,
  so `['search_issues,get_issue']` is one malformed pattern, not two names. It is refused at
  registration and dropped again at dispatch.
- **It is SCOPING, not a security boundary.** It is always stated in the prompt and additionally
  passed to claude-code's `--allowedTools`, but whether that CLI list gates depends on the run's
  permission mode, and Codex cannot express a per-tool restriction at all. If an agent kind must
  never reach a server's other tools, do not wire that server for that kind, and take the
  capability away at the vendor as well.

## Credentials

A declaration names the credentials it needs; values are supplied per workspace or from the
deployment environment.

- **An `http` server must be `https`, or loopback.** Its credential rides the request as a header,
  so a cleartext off-box endpoint is refused at registration and again at the run boundary. A
  sidecar on `http://127.0.0.1:…` is fine. Loopback is decided by the url parser that will resolve
  the request, so `http://127.1` counts and `http://evil.example\@127.0.0.1` does not. A url
  carrying a control character or a space is refused rather than trimmed: what was admitted and
  what gets started must not differ.
- **`required` defaults to true.** A tool whose first call 401s is worse than one the agent was
  told it does not have.
- **Give each credential a `usage` line.** It is shown beside the key in the operator's checklist,
  and the checklist can only say what your declaration says. A bare `SLACK_MCP_TOKEN` names neither
  the token type nor the scopes it needs, so without a `usage` line the operator has to go and read
  your source, which is the one trip the checklist exists to remove. One sentence, naming where to
  get the value, and naming no value.
- **A credential may not be LOOKED UP BY a platform configuration variable.** A declaration names
  both the key it wants and the endpoint that key is sent to, so `{ key: 'ENCRYPTION_KEY', header:
  'Authorization' }` would boot clean and ship the deployment's master sealing key to a third
  party. Every variable on the [Environment Variables](../reference/environment-variables.md)
  reference is reserved, case-insensitively. Such a declaration is refused at boot and refused
  again at dispatch, under its own `reserved_secret` reason rather than `missing_secret`, because
  the two need opposite fixes and setting the variable is precisely what must not help.
- **Use `envName` when the server's own client insists on a specific variable.** The floor above
  binds the LOOKUP key, not the variable the value is injected under inside the server's process,
  which reads nothing on this side. That distinction is what keeps the floor affordable: GitHub's
  MCP server reads `GITHUB_PERSONAL_ACCESS_TOKEN` and Slack's reads `SLACK_BOT_TOKEN`, and the
  platform reads neither while reserving both families. So declare
  `{ key: 'ACME_GITHUB_TOKEN', envName: 'GITHUB_PERSONAL_ACCESS_TOKEN' }`: looked up under a name
  of your own, injected under the one the vendor's SDK wants. `envName` has its own narrower rule
  (not `PATH`, `NODE_OPTIONS`, `npm_config_*`, or anything else that would reconfigure the process
  instead of authenticating a call).
- **The transport decides where a credential goes, so declare the matching one.** A `stdio` server
  is a child process with an environment and no request to put a header on; an `http` server is a
  remote url with headers and no process to set a variable in. So a `stdio` credential is injected
  as a variable (its key, or its `envName`), and an `http` credential rides the `header` it names,
  with an optional `headerTemplate` such as `Bearer {value}` for the scheme. Naming the other one
  fails boot, in both directions: a `header` on `stdio` is `unusable_credential_header`, and an
  `http` credential with no `header` is `missing_credential_header`. They are errors rather than
  warnings because such a declaration does not work at all. The value resolves, is folded into
  nothing, and the server is wired, advertised to the agent, and started unauthenticated, with the
  first evidence a failing tool call minutes into a run. Declaring an `envName` on an `http` server
  that DOES name a header is the harmless case, and only warned about: the value still arrives as
  the header, and the injection name is read by nothing.
- **A workspace's own value wins over the deployment's.** The per-workspace credential store sits
  in front of the environment, per key, so a tenant supplies its own vendor account and a workspace
  that has stored nothing resolves exactly as it did before the store existed. The surface is a
  CHECKLIST rather than a blank form: Infrastructure → Capability credentials projects the
  credentials this deployment's registered capabilities declare, so nobody has to read the source
  to learn what to fill in. It appears only for someone holding `secrets.manage`.
- **Mind what a credential key can reach beyond that floor.** Everything outside the platform's own
  configuration is your tooling, and only you know which of it an integration may see. If your
  deployment installs agent packages it did not author, pass
  `createToolSecretResolver: (env) => createEnvToolSecretResolver(env, { allowKeys: [...] })` and
  keep credentials behind a dedicated prefix. Two things to know about that: a deployment resolver
  REPLACES the built-in chain rather than being wrapped by it, and the allow-list gates every
  subject that resolver serves, not only tool servers. An allow-list holding only `MCP_…` keys
  silently resolves nothing for a registered image or music generator, and nothing in the run will
  name the allow-list as the cause.

## OAuth-protected servers

Most of the hosted MCP ecosystem (Linear, Atlassian, Figma, Slack's remote server) authenticates
with OAuth rather than a static token, so a declaration that can only name a key reaches none of
it. A remote (`http`) server may declare `oauth` instead of, or beside, its `secretKeys`:

```ts
registry.registerToolServer({
  id: 'linear',
  label: 'Linear',
  guidance: 'Read the issue behind a task before guessing at its intent. Never file or edit.',
  transport: { kind: 'http', url: 'https://mcp.linear.app/mcp' },
  oauth: {
    grant: 'authorization_code',
    clientId: 'the client id you registered at the vendor',
    // Public client (PKCE only) when omitted, which is what most remote MCP servers expect.
    clientSecretKey: 'MCP_LINEAR_CLIENT_SECRET',
    scopes: ['read'],
    // authorizationUrl / tokenUrl omitted means they are DISCOVERED from the server url.
  },
})
registry.assignToolServers('coder', ['linear'])
```

The split is the same one the static path has, one level up: a `secretKeys` declaration names a
credential and the workspace supplies its VALUE, while an `oauth` declaration names a CLIENT and
the workspace supplies its GRANT.

**Two grants, and only one of them involves a person.**

| Grant | Who authorises | What a board does |
| --- | --- | --- |
| `authorization_code` | A person with `secrets.manage`, in the vendor's own UI | Presses Connect once; the grant is then refreshed |
| `client_credentials` | Nobody: the deployment's own client authenticates | Nothing; the token is minted on first dispatch |

`client_credentials` is what makes an OAuth-protected internal or partner server reachable on a
deployment with nobody around to press a button. It needs no redirect url and shows no Connect
button.

### Endpoints: discovered, or declared

Omit `authorizationUrl` and `tokenUrl` and they are discovered the way the MCP authorization spec
prescribes: the server's protected-resource metadata names its authorization server, and that
server's metadata names the endpoints. A server publishing no protected-resource document is
treated as its own issuer, which is what makes the older generation of servers reachable.

Declaring an endpoint WINS over discovery, half a pair included: pinning one and discovering the
other is a legitimate declaration for a vendor whose metadata is right about one and stale about
the other. Pin both when you do not want a third party's metadata document deciding where your
client secret is sent.

A discovered endpoint is held to the same url floor a declared one is, on every candidate and every
redirect hop. And the token endpoint's redirects are refused rather than followed: that request
body carries the client secret, and while a cross-origin redirect drops an `Authorization` header
it never drops a form body.

### What you have to configure

- **`ENCRYPTION_KEY`**, because a grant is sealed at rest like every other credential here. Without
  it there is nowhere to keep one, and every OAuth server is reported to its agent as
  `oauth_not_connected`.
- **`MCP_OAUTH_REDIRECT_URL`**, for the interactive grant only: your deployment's public app url
  followed by `/mcp-oauth-callback`, and the same string registered as the client's redirect URI at
  the vendor. It is operator-set rather than derived from the request, because a value derived from
  the `Host` header differs behind every proxy and preview url, and the vendor then refuses the
  exchange with `redirect_uri_mismatch`, which names nothing on this side. Unset, Connect refuses
  with a message naming the variable, before the browser leaves the app.
- **The client secret**, when your client has one. It resolves through the same credential chain a
  `secretKeys` entry uses, so a tenant can bring its own OAuth client through the same checklist.

### What a board sees

The tool-server row in Infrastructure → Capability credentials carries the connection: Connect,
Reconnect, Disconnect, who granted it, the scopes the vendor actually granted, and, beside
`connected` rather than instead of it, the last token renewal that failed. That pairing is the
point: a grant that is on file and no longer producing tokens is exactly the state that reads as
working and is not.

Three things worth knowing before you wire one:

- **A refresh token the vendor did not rotate is carried forward.** Dropping it would turn a
  working grant on a non-rotating server into a single-use one.
- **A grant with no refresh token is reported as such** before its access token expires, rather
  than after. It has to be granted again by hand when it does.
- **Disconnect is not gated on the declaration still existing.** A grant outlives the registration
  that created it, and the row would otherwise be a live vendor token nobody can reach.

### Security notes specific to OAuth

- **The vendor's redirect lands on the app, and the backend never receives one.** A redirect target
  is reached by a top-level browser navigation that a third party triggers, and sessions here are
  bearer tokens, which such a navigation cannot carry. A backend route receiving the redirect
  directly would see no user on every request, and any "same user" check written there would be
  unreachable code that reads like protection. The callback page re-presents the code to ordinary
  session-gated API instead, so the checks below actually run.
- **The `state` is sealed, not signed.** It carries the PKCE verifier, so it is encrypted rather
  than merely authenticated. It also carries the person who STARTED the flow, and completion
  refuses anyone else: without that binding, getting an admin to open an attacker's authorization
  link plants the attacker's vendor account as the board's connection.
- **`secrets.manage` is re-resolved when the token is stored**, not assumed from the Connect press.
  A grant takes minutes of human time and the permission can be revoked inside that window.
- **A grant is reclaimed with the board.** Deleting a workspace does not leave live vendor tokens
  behind. Neither disconnect nor delete revokes AT the vendor, so revoke there too when it matters.
- **A token minted for one server is not replayable against another** behind the same authorization
  server: the resource indicator is always sent.
- **OAuth changes who the run authenticates AS, and makes nothing about the server trusted.**
  Everything under [Security posture](#security-posture) still applies, and the granted scopes are
  the boundary you actually control. Grant read-only scopes at the vendor.

## Test a server for real

Boot validation rules on the declaration and a dispatch reports what it dropped. Neither can tell
you whether a server that survives both actually answers, so a dead url, a rotated token or a
mistyped tool name would otherwise surface only as an agent quietly working without a tool it was
promised.

Infrastructure → Capability credentials lists every registered server with a **Test** button. A
test resolves credentials through the same chain a dispatch uses, then speaks `initialize` and
`tools/list` to the server, so the verdict is about THIS board rather than about whoever set the
deployment's variable.

| Verdict | What it means | The fix |
| --- | --- | --- |
| `ok` | The handshake completed and the tool list came back | Nothing. The row names the server, its version and its tool count |
| `credentials_missing` | A `required` credential did not resolve, so nothing was sent | Store the value for this board, or set the variable |
| `credential_refused` | A credential's lookup key names a platform configuration variable | The declaration. Setting the variable must not help |
| `credential_unusable` | A credential resolved and named no header, so an `http` server would never receive it | The declaration. The probe stops here rather than letting the server answer `401`, which would read as a wrong value |
| `oauth_not_connected` | The server uses OAuth and this board has not granted it, so nothing was sent | Press Connect and sign in at the vendor |
| `oauth_token_failed` | A grant is on file and produced no token | Reconnect. The row's detail carries the cause |
| `unreachable` | No answer at all: DNS, TLS, connection refused, or the 10s deadline | The endpoint, or the network between here and it |
| `http_error` | Something answered with a status rather than an MCP frame (`401` means a WRONG token) | The credential's value, or the url's path |
| `protocol_error` | It answered, but not as an MCP server | The url almost certainly names something else |
| `not_probeable` | There is no vantage point to probe from | Verify from a run, or change the transport |

Three declarations are refused by name instead of probed, because a probe from the backend would
answer about the wrong process: a `stdio` server is a child of the harness inside the run
container; a loopback url means "beside the agent, in its own container", and the backend's
`127.0.0.1` is a different machine (a SUCCESS there would be the more misleading outcome); and a
url that fails the transport rule is held to the same floor a dispatch holds it to.

A redirect is followed, but a credential stops at its own origin. Each hop is re-checked against
the transport rule, and a hop that leaves the declared origin while a credential is riding is
refused outright. That is not extra caution: the Web platform removes `Authorization` across
origins, so an agent's own MCP client would reach that hop unauthenticated and report a 401.
Naming the origin change instead points at the fix, which is declaring the final url.

The probe is also the only thing that can check `allowedTools` against reality, since every other
layer holds an entry to a name pattern and none can tell a well-formed name from a real one. When
the tool list came back complete, the result names any declared tool the server does not expose.
When it did not, the check reports itself as unchecked rather than calling a working tool missing.

## Operating a `stdio` server

A `stdio` server is a child process the agent CLI spawns INSIDE the run container, which shapes
everything about operating one:

- **It cannot be tested from the button.** There is no vantage point on the backend that would
  answer about the right process. Verify from a run instead: read the prompt's tool-server section,
  or the run's agent-context snapshot.
- **An `npx`-launched server resolves and installs its package at CLI startup, on every run.** That
  spends the run container's network and the registry's availability every time, and a resolution
  failure surfaces from the CLI mid-run rather than through the platform's own vocabulary, which
  has already said the server was wired. **Pin the package version in `args`**
  (`@example-org/advisories-mcp@1.4.2`, never a bare name or a dist-tag), so every run executes the
  same code and a vendor's bad publish cannot change agent behaviour mid-week.
- **Pre-installing the package into your runner image** removes the cold start and the registry
  dependence, at the cost of an image-affecting change.
- **Non-secret process config rides `transport.env`; anything secret rides `secretKeys`.** The
  harness redacts exactly the resolved credential values from its logs, by name, so putting a token
  into `transport.env` or an `--api-key=…` argument bypasses both the credential chain and the
  redaction.

## Security posture

The threat model is the one on [Security Model](../reference/security-model.md): assume an agent
whose instructions have been subverted by text it read. Three things follow for tool servers.

- **A wired server's RESULTS are untrusted input**, exactly like repository contents and issue
  text. A third-party server, or anything it proxies, can inject instructions through a tool
  result, so wiring one extends the set of parties who can attempt injection to that server's
  operator and its own upstreams.
- **`allowedTools` does not contain a subverted agent**, and the run container applies no egress
  bound on which wired servers such an agent may call with what it has read. A wired server is
  therefore also a potential exfiltration channel for everything else in the agent's context.
- **The credential is the boundary you actually control.** Wire third-party servers with read-only,
  minimally-scoped tokens, prefer the per-workspace store over deployment environment variables,
  and set `allowKeys` when you run agent packages you did not author.

## Current limits

Worth knowing before you adopt, so the ceiling comes from this page rather than from a run.

- **No dynamic client registration.** OAuth works from a client you registered at the vendor and
  named in code; a server offering only dynamic registration cannot be connected.
- **No per-workspace or per-step server selection.** A registered server applies to every
  workspace's runs of the kinds it is declared on. Only the credential half is per-workspace today,
  and capability credentials are app-only, absent from the public API.
- **Only the claude-code harness reports what it reached.** Codex publishes no startup report, so a
  Codex run records the platform's half alone. It is stated as absent rather than as healthy, and a
  wired-but-broken server is still diagnosed with the Test button.
- **Pi has no MCP client.** A deployment whose model provisioning resolves to Pi gets no tool
  servers there, reported per run as `harness_unsupported`.
- **`http` means streamable HTTP.** The legacy HTTP+SSE transport is not supported, so an SSE-only
  server is unreachable.
- **Tools only.** MCP resources, prompts, elicitation and progress notifications are not consumed.
- **A self-hosted runner pool that maps no capability path gets no handshake**, so its dispatches
  are counted as unverifiable rather than confirmed. Keeping pool images on the current pinned tag
  stays your obligation. A pool with no release template also cannot prove it stopped a refused
  job, which is stated on the failure rather than hidden.

## Worked example: give `coder` the Slack MCP server

A real vendor server end to end, because every interesting rule shows up once a vendor fixes the
names. Slack's MCP server is `stdio` (an npm package) and its client reads `SLACK_BOT_TOKEN` and
`SLACK_TEAM_ID`, both inside a prefix family the platform reserves and neither of which the
platform reads.

1. **Register it and attach it to a built-in kind**, in your composition root:

   ```ts
   registry.registerToolServer({
     id: 'slack',
     label: 'Slack',
     guidance:
       'Read Slack history to find the discussion behind a task. Prefer it over guessing at ' +
       'intent from the ticket alone. Never post.',
     transport: {
       kind: 'stdio',
       command: 'npx',
       args: ['-y', '@modelcontextprotocol/server-slack'],
     },
     allowedTools: ['slack_list_channels', 'slack_get_channel_history', 'slack_get_thread_replies'],
     secretKeys: [
       {
         key: 'ORG_SLACK_BOT_TOKEN',
         envName: 'SLACK_BOT_TOKEN',
         usage: 'A Slack bot token (xoxb-…) with channels:history and channels:read.',
       },
       {
         key: 'ORG_SLACK_TEAM_ID',
         envName: 'SLACK_TEAM_ID',
         required: false,
         usage: 'The workspace id (T…), from Slack’s About this workspace page.',
       },
     ],
   })
   registry.assignToolServers('coder', ['slack'])
   ```

   Three things in there are rules rather than taste. The lookup keys are prefixed `ORG_` because
   `SLACK_` is a reserved family. `envName` carries the names Slack's own client insists on, which
   is allowed because the floor binds what may be READ off the deployment's environment and an
   injection name reads nothing. And `allowedTools` lists the three read tools and omits
   `slack_post_message`, which is scoping: if `coder` must never post, the real answer is a Slack
   app without `chat:write`.

2. **Fill in the values.** Infrastructure → Capability credentials shows both keys as a checklist
   with the `usage` lines beside them. Store them for the board, sealed and per workspace, or set
   the variables on the deployment. The store wins per key.

3. **Check the row.** The tool-server list above the checklist should say `Given to: coder` and
   `Works on: claude-code, codex`. An empty `Given to:` means the `assignToolServers` call did not
   run.

4. **Verify from a run, not from the Test button.** The button is absent for a `stdio` server and
   the row says why. Start a `coder` run and read the prompt's tool-server section, or the run's
   context snapshot. A remote (`http`) vendor server is the case the Test button exists for.

5. **If the run says the server is unavailable**, the reason names the fix. `missing_secret` is a
   value to supply, `reserved_secret` and `unusable_secret` are declarations to change,
   `harness_unsupported` means the run used Pi, and `over_budget` means `coder` has accreted more
   servers than one dispatch carries.

## Adoption checklist

1. Register the server, and `assignToolServers` it onto the kinds that should reach it, in your
   composition root. Read the boot log: a bad id, an insecure url, a reserved key or an unservable
   harness/transport combination is named there.
2. Supply credential values, through the per-workspace store (preferred on anything multi-tenant)
   or the deployment environment. Set `allowKeys` if you run third-party agent packages.
3. Check the inventory row (`Given to:` / `Works on:`), then verify: the Test button for an `http`
   server, a real run's prompt section or context snapshot for `stdio`.
4. Keep self-hosted runner pools on the current pinned image.
5. For third-party servers, read [Security posture](#security-posture) before wiring: minimal
   scopes, read-only tokens, and the store over the environment.

---

Next: [Add a Custom Agent](./custom-agents.md) for the kinds a tool server attaches to, or
[Security Model](../reference/security-model.md) for what an agent can reach once it has one.
