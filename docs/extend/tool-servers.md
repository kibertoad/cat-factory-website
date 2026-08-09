# Give Agents External Tools (MCP)

For the deployment author who wants their agents to reach something the platform does not ship: an
issue tracker, an advisory database, an internal service, a vendor's hosted MCP server. You register
the server in your own package, attach it to the agent kinds that should reach it, and supply the
credentials. No fork, and no rebuilt runner image.

::: tip Two MCP surfaces, opposite directions
This page is the **consuming** side: your agents calling MCP servers you registered. The
**serving** side, Cat Factory's own API exposed *as* an MCP server for Claude Desktop or Cursor to
drive, is [Use the MCP Server](./mcp-server.md).
:::

## Register a server

A tool server is static data, registered in your composition root on the same registry
[custom agents](./custom-agents.md) use:

```ts
import { defaultAgentKindRegistry } from '@cat-factory/agents'
import { createWorker } from '@cat-factory/worker'
// Node: `start` from '@cat-factory/node-server'; local: `startLocal` from '@cat-factory/local-server'.

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

Registration is code-first on purpose: **you** declare what exists (the URL or command, the
transport, the credentials by name) and a **workspace** supplies credential values. A tenant can
bring its own vendor account; it cannot point your deployment at a different endpoint.

`guidance` is what turns a wired server into a used one. Without it an agent tends to ignore a tool
it was handed.

`registerToolServer` replaces by id, last write wins, which is how you repoint a server that an
installed third-party package registered.

::: warning A registered server today reaches every workspace
Only the credential half is per workspace. Per-workspace or per-step selection of *which* servers
apply is not built yet.
:::

## Which harnesses can serve what

Which transports a CLI's MCP client can reach is a fact about that CLI:

| Harness | `stdio` | `http` | Notes |
| --- | --- | --- | --- |
| `claude-code` | yes | yes | Config rides a per-run file, so runs on a developer's own login are served too. |
| `codex` | yes | no | Stdio-only client. A run on a developer's own Codex login has no per-run config home, so it is not served at all. |
| `pi` | no | no | Pi has no MCP client. Tool servers never apply on Pi runs. |

A definition's `harnesses` field may **narrow** this (a server that only makes sense under one CLI)
but never widen it. Narrowing to a combination no harness can serve, such as an `http` server
restricted to `codex`, is dead configuration and boot warns about it.

Tool servers also need a **container** agent: an inline LLM step has no agent CLI to wire them into,
and boot warns about that combination too.

## Why a run did not get the server

A declared server that could not be wired is **stated to the agent** in its prompt and recorded on
the step, never silently missing. Each reason needs a different fix:

| Reason | What happened | The fix |
| --- | --- | --- |
| `harness_unsupported` | The run's CLI speaks no MCP, the `harnesses` list excludes it, or it is a Codex run on a developer login | The run's harness, the `harnesses` list, or a leased credential instead of the developer's own CLI login |
| `transport_unsupported` | The CLI speaks MCP but cannot reach this transport (Codex is stdio-only) | A second declaration for the other transport |
| `missing_secret` | A required credential did not resolve | Set the variable, or store the workspace value |
| `reserved_secret` | The credential's **lookup key** names a platform configuration variable | The declaration. Setting the variable must not help |
| `oauth_not_connected` | The server uses OAuth and this workspace holds no grant | Press Connect on the board and sign in at the vendor |
| `oauth_token_failed` | A grant is on file and produced no token: revoked or expired refresh, an authorization server that refused | Reconnect, or wait out the vendor's outage |
| `over_budget` | Nothing is wrong with the server; the kind declares more than one dispatch carries | Trim the kind's declarations |

The step detail renders both lists as chips, so a run that quietly went without its issue tracker
says so where you are already looking.

## Credentials

Declare each credential **by name**. The value is resolved at dispatch and rides the job body only:
never a prompt, never the stored agent-context snapshot.

- **Give each one a `usage` line.** It is shown beside the key in the operator's checklist, and the
  checklist can only say what the declaration says. A bare `SLACK_MCP_TOKEN` names neither the token
  type nor the scopes it needs, which sends the operator back to your source, the one trip the
  checklist exists to remove. One sentence, naming where to get the value. It is operator-facing and
  non-secret, so it must name no value.
- **`required` defaults to true**, because a tool whose first call returns 401 is worse than one the
  agent was told it does not have. A credential that does not resolve drops the whole server, with a
  note in the prompt.
- **A credential may not be looked up by a platform configuration variable.** A definition names
  both the key it wants and the endpoint that key is sent to, so
  `{ key: 'ENCRYPTION_KEY', header: 'Authorization' }` would otherwise boot clean and ship your
  master sealing key to a third party. Every variable in the
  [environment-variable reference](../reference/environment-variables.md) is reserved. The
  declaration is refused at boot and again at dispatch, under its own `reserved_secret` reason
  rather than `missing_secret`, because the two need opposite fixes.
- **Use `envName` when the server's own client insists on a variable name.** The floor binds the
  **lookup** key, not the name the value is injected under in the server's own process, which reads
  nothing of yours. The GitHub MCP server reads `GITHUB_PERSONAL_ACCESS_TOKEN` and the Slack one
  `SLACK_BOT_TOKEN`; Cat Factory reads neither while reserving both families. So declare
  `{ key: 'ACME_GITHUB_TOKEN', envName: 'GITHUB_PERSONAL_ACCESS_TOKEN' }`. `envName` has its own
  narrower rule: not `PATH`, `NODE_OPTIONS`, `npm_config_*` or anything else that would reconfigure
  the process rather than authenticate a call. It applies to `stdio` servers only.
- **A workspace's own value wins over the deployment's, per key.** Infrastructure → **Capability
  credentials** is a checklist of what your registered capabilities declare, not a blank form, so an
  operator never reads your source to learn what to fill in. It needs `secrets.manage`.
- **An `http` server must be `https`, or loopback.** Its credential rides a header, so a cleartext
  off-box endpoint is refused at registration and again at the job boundary. A sidecar on
  `http://127.0.0.1:…` is fine.
- **Non-secret process configuration rides `transport.env`; anything secret rides `secretKeys`.**
  The harness redacts resolved credential values from its logs by name, so a token placed in
  `transport.env`, or in a `--api-key=…` argument, bypasses both the credential chain and the
  redaction.

If your deployment installs agent packages it did not author, constrain what their credentials can
reach:

```ts
createToolSecretResolver: (env) => createEnvToolSecretResolver(env, { allowKeys: ['MCP_…'] })
```

Two things to know before you do. A deployment resolver **replaces** the built-in chain rather than
wrapping it. And the allow-list gates every subject that resolver serves, not only tool servers: a
generative binary integration's credential goes through the same port, so an allow-list holding only
`MCP_…` keys silently resolves nothing for a registered image or music generator.

## What the agent may call

`allowedTools` is a list of single tool **names**. The harness joins them into one argument, so
`['search_issues,get_issue']` is one malformed pattern rather than two names; that is refused at
registration and dropped again at dispatch.

**It is scoping, not a security boundary.** It is always stated in the prompt and passed to the
claude-code CLI, but whether that CLI treats it as a gate depends on the run's permission mode, and
Codex cannot express a per-tool restriction at all. If an agent kind must never reach a server's
other tools, do not wire that server for that kind.

## OAuth-protected servers

Most of the hosted MCP ecosystem (Linear, Atlassian, Figma, Slack's remote server) authenticates
with OAuth rather than a static token. A remote server may declare `oauth` instead of, or beside,
its `secretKeys`:

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
    // authorizationUrl / tokenUrl omitted, so they are DISCOVERED from the server url.
  },
})
```

The split is the same one the static path has, one level up: `secretKeys` names a credential and the
tenant supplies its **value**; `oauth` names a client and the tenant supplies its **grant**.

| Grant | Who authorises | What a board does |
| --- | --- | --- |
| `authorization_code` | A person with `secrets.manage`, in the vendor's own UI | Presses Connect once; the grant is refreshed from then on |
| `client_credentials` | Nobody: your own client authenticates | Nothing. The token is minted on first dispatch |

`client_credentials` is what makes an OAuth-protected internal or partner server reachable on a
deployment with nobody to press a button, such as a cron-driven install.

### Endpoints

Omit `authorizationUrl` and `tokenUrl` and they are discovered the way the MCP authorization spec
prescribes. A server that publishes no protected-resource document is treated as its own issuer,
which is what makes the older generation of servers reachable.

**Declaring an endpoint wins over discovery**, half a pair included: pinning one and discovering the
other is legitimate for a vendor whose metadata is right about one and stale about the other. Pin
both when you do not want a third party's metadata document deciding where your client secret is
sent. A discovered endpoint is held to the same URL rule a declared one is.

### What the deployment must configure

| Variable | Why |
| --- | --- |
| `ENCRYPTION_KEY` | A grant is sealed at rest like every other credential. Without it there is nowhere to keep one, and every OAuth server reports `oauth_not_connected`. |
| `MCP_OAUTH_REDIRECT_URL` | Interactive grant only. Your public app URL followed by `/mcp-oauth-callback`, and the **same string** registered as the client's redirect URI at the vendor. |
| The client secret | When the client has one. Looked up through the same credential chain a `secretKeys` entry uses, so a tenant can bring its own OAuth client. |

`MCP_OAUTH_REDIRECT_URL` is operator-set rather than derived from the request, because a value
derived from the `Host` header differs behind every proxy and preview URL, and the vendor then
refuses the exchange with `redirect_uri_mismatch`, which names nothing on your side. Unset, Connect
refuses with a message naming the variable before the browser leaves the app.

### What a board sees

The tool-server row carries Connect, Reconnect and Disconnect, who granted it, the scopes the vendor
actually granted, and, **beside** `connected` rather than instead of it, the last token renewal that
failed. That pairing is the point: a grant on file that no longer produces tokens is exactly the
state that reads as working and is not.

Three more things worth knowing:

- **A grant with no refresh token is reported as such** before its access token expires rather than
  after. It has to be granted again by hand when it does.
- **Disconnect is not gated on the declaration still existing.** A grant outlives the registration
  that created it, and the row would otherwise be a live vendor token nobody can reach.
- **Neither disconnect nor deleting the workspace revokes at the vendor.** Revoke there too when
  that matters.

## Test a server for real

Boot validation rules on the declaration and a dispatch reports what it dropped. Neither can tell you
whether a server that survives both actually answers, so a dead URL, a rotated token or a mistyped
tool name used to surface only as an agent quietly working without a tool it was promised.

Infrastructure → **Capability credentials** gives each registered server a **Test** button. A test
resolves credentials through the same chain a dispatch uses, then speaks `initialize` and
`tools/list`, so the verdict is about **this board** rather than about whoever set the deployment's
variable.

| Verdict | What it means | The fix |
| --- | --- | --- |
| `ok` | The handshake completed and the tool list came back | Nothing. The row names the server, its version and its tool count |
| `credentials_missing` | A required credential did not resolve, so nothing was sent | Store the value for this board, or set the variable |
| `credential_refused` | A credential's lookup key names a platform configuration variable | The declaration. Setting the variable must not help |
| `oauth_not_connected` | The server uses OAuth and this board has not granted it | Press Connect and sign in at the vendor |
| `oauth_token_failed` | A grant is on file and produced no token | Reconnect. The row's detail carries the cause |
| `unreachable` | No answer at all: DNS, TLS, connection refused, or the deadline | The endpoint, or the network between here and it |
| `http_error` | Something answered with a status rather than an MCP frame. A `401` means a **wrong** token | The credential's value, or the URL's path |
| `protocol_error` | It answered, but not as an MCP server | The URL almost certainly names something else |
| `not_probeable` | There is no vantage point to probe from | Verify from a run, or change the transport |

Three declarations are refused by name rather than probed, because a probe from the backend would
answer about the wrong process: a `stdio` server (a child of the harness inside the run container), a
loopback URL (the backend's `127.0.0.1` is a different machine, and a *success* there is the more
misleading outcome), and a URL that fails the transport rule.

**The probe is also the only thing that can check `allowedTools` against reality.** Every other layer
holds an entry to a name pattern, and none can tell a well-formed name from a real one. When the tool
list came back complete, the result names any declared tool the server does not expose; when it did
not, the check reports itself as unchecked rather than calling a working tool missing.

## Operating a `stdio` server

A `stdio` server is a child process the agent CLI spawns **inside the run container**, which shapes
everything about operating one:

- **It cannot be tested from the button.** There is no vantage point here. Verify from a run: read
  the prompt's tool-server section, or the run's context snapshot.
- **Pin the package version in `args`** (`@example-org/advisories-mcp@1.4.2`, never a bare name or a
  dist-tag). An `npx`-launched server resolves and installs at CLI startup on **every run**, so
  without a pin a vendor's bad publish changes agent behaviour mid-week, and a resolution failure
  surfaces from the CLI mid-run rather than through the unavailability reasons above.
- **Pre-installing the package into your runner image** removes the cold start and the registry
  dependence, at the cost of an image bump.

## Security posture

Assume an agent whose instructions have been subverted by text it read. Three things follow:

- **A wired server's results are untrusted input**, exactly like repository contents and issue text.
  Wiring a server extends the set of parties who can attempt an injection to that server's operator
  and its own upstreams.
- **`allowedTools` does not contain a subverted agent**, and nothing bounds which wired servers such
  an agent may call with what it has read. A wired server is also a potential exfiltration channel.
- **The credential is the boundary you actually control.** Use read-only, minimally-scoped tokens,
  prefer the per-workspace store over deployment variables, and set `allowKeys` when you run agent
  packages you did not author.

For OAuth specifically, the granted **scopes** are the boundary. Grant read-only at the vendor.

See [Agent Isolation](../reference/agent-isolation.md) and the
[Security Model](../reference/security-model.md).

## Current limits

- **No dynamic client registration.** OAuth works from a client you registered at the vendor and
  named in code; a server offering only dynamic registration cannot be connected.
- **No per-workspace or per-step server selection.** A registered server applies to every
  workspace's runs of the kinds it is declared on. Capability credentials are also UI-only, absent
  from the public API.
- **Only the claude-code harness reports what it reached.** Codex's CLI publishes no startup report,
  so a Codex run records the platform's half alone, stated as *absent* rather than as a healthy or
  failed server.
- **Pi has no MCP client**, stated per run as `harness_unsupported`.
- **`http` means streamable HTTP.** An SSE-only server is unreachable.
- **Tools only.** MCP resources, prompts, elicitation and progress notifications are not consumed.

## Worked example: give `coder` the Slack MCP server

A real vendor server end to end, because every interesting rule shows up when a vendor fixes the
names. Slack's server is `stdio`, and its client reads `SLACK_BOT_TOKEN` and `SLACK_TEAM_ID`, both
inside a prefix family Cat Factory reserves and neither of which it reads.

**1. Register and attach**, in your composition root:

```ts
registry.registerToolServer({
  id: 'slack',
  label: 'Slack',
  guidance:
    'Read Slack history to find the discussion behind a task. Prefer it over guessing at ' +
    'intent from the ticket alone. Never post.',
  transport: { kind: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-slack'] },
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

Three things there are rules rather than taste. The lookup keys are prefixed `ORG_` because `SLACK_`
is a reserved family. `envName` carries the names Slack's own client insists on. And `allowedTools`
lists the three read tools and omits `slack_post_message`, which is scoping: if `coder` must never
post, the real answer is a Slack app without `chat:write`.

**2. Fill in the values.** Infrastructure → Capability credentials shows both keys as a checklist
with your `usage` lines beside them.

**3. Check the row.** It should say `Given to: coder` and `Works on: claude-code, codex`. An empty
`Given to:` means the `assignToolServers` call did not run.

**4. Verify from a run**, not from the Test button: this is a `stdio` server. Start a `coder` run and
read the prompt's tool-server section.

**5. If the run says the server is unavailable**, the reason names the fix, per the table above.

## Adoption checklist

1. Register the server and attach it to the kinds that should reach it. Read the boot log: a bad id,
   an insecure URL, a reserved key or an unservable harness combination is named there.
2. Supply credential values, through the per-workspace store on anything multi-tenant.
3. Check the inventory row, then verify: the Test button for an `http` server, a real run for
   `stdio`.
4. Keep self-hosted [runner pools](../operate/runner-pools.md) on the current pinned image.
5. For third-party servers, read the security posture above before wiring: minimal scopes, read-only
   tokens, the store over the environment.

---

Next: [Add a Custom Agent](./custom-agents.md) for the kinds that carry these servers, or
[Use the MCP Server](./mcp-server.md) for the opposite direction, driving Cat Factory from an MCP
host.
