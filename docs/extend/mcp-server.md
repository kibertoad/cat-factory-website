# MCP Server

Cat Factory's [public API](./public-api.md) is also available as a
[Model Context Protocol](https://modelcontextprotocol.io) server, so an MCP host (Claude Desktop, an
IDE, an agent framework) can plan work on a board, start and watch runs, answer parked decisions,
and read a run's telemetry.

It is a facade rather than a separate product: every tool is one call on the
[TypeScript SDK](./sdks.md), and the tool table is generated from the same OpenAPI spec, so a tool
cannot describe a request shape the deployment would reject.

## Two ways to reach it

Both serve the same tools.

- **Hosted**, at `POST /api/v1/mcp` on your deployment. Nothing to install: give the host the URL
  and let it connect over OAuth, or hand it a key. Reach for this first if your host speaks HTTP
  MCP.
- **The `@cat-factory/mcp-server` package**, over stdio. It needs no deployment of your own beyond
  the one you are calling, it is the only path for a host that cannot speak HTTP MCP, and it is the
  only one with per-host tool filters.

A deployment mounts the hosted endpoint from that same package, so the tool table, the instructions,
and the result rendering are identical on both paths.

## Connecting a host over OAuth

The hosted endpoint accepts a key, and it also speaks the MCP authorization spec, so a host can
connect the way it connects to any other remote MCP server: you press Connect in the host, a browser
opens, you choose what it may have, and the host gets its own credential. Nothing is pasted anywhere,
and no long-lived key sits in a config file on disk.

Hosts that discover authorization themselves (claude.ai, Claude Desktop, the IDE clients, the MCP
Inspector) need only the URL:

```
https://cat-factory.example.com/api/v1/mcp
```

What happens, and what you are deciding:

1. The host asks the endpoint, gets a `401` naming where this deployment's authorization metadata
   lives, and registers itself as a client. Registration on its own grants nothing.
2. Your browser opens on the deployment's consent screen. Sign in if you are not already: the
   screen is part of the app, so an SSO deployment authenticates you through its own identity
   provider here.
3. You pick the **board** the host may act on and **what it may do** (`read`, `write`, `decide` or
   `admin`, the same ladder every API key carries). The screen names the host and the address your
   browser will be sent back to; that address was matched against what the host registered, so it
   is the fact worth reading. What is preselected is `read and write`, never whatever the host asked
   for: any host can register itself and ask for full access, so an ask above the default is shown
   to you as a note and raising the grant stays something you do deliberately.
4. The host receives an API key scoped to exactly that. It appears in the board's API-key settings
   as `MCP: <host name>`, and **revoking it there disconnects the host**.

Two things to know before you rely on it:

- **The issued token does not expire**, so there is nothing to refresh and no renewal to schedule.
  It is an ordinary public-API key with the usual lifecycle: it lives until someone revokes it.
- **Approving twice issues two keys.** Reconnecting a host that lost its token leaves the old key
  behind; revoke it when you are done.

### What a deployment needs for it

- `ENCRYPTION_KEY`, which every value the flow carries between requests is sealed under.
- The public API enabled, since what a host is issued is a public-API key.
- `APP_BASE_URL`, **only** if the app is served from a different origin than the API. Same value the
  invite and password-reset links already use, path prefix included if the app sits under one.

Without the first two, nothing is advertised: the discovery documents and the authorization routes
alike answer `503` naming what is missing, and a host falls back to asking you for a key. That is
deliberate, because a deployment that described a complete authorization server it cannot run would
send every host down a chain that fails at the last step. Approving a connection requires the `secrets.manage` permission on the board you pick, which is
the same permission minting an API key by hand requires.

### If your host cannot do OAuth

Give it a key, exactly as before:

```sh
claude mcp add --transport http cat-factory https://cat-factory.example.com/api/v1/mcp \
  --header "Authorization: Bearer cf_live_..."
```

Both credentials are the same kind of key, so the scope ladder, the tool list and the audit trail
behave identically whichever way the host got one.

## Running the stdio server

With Claude Code, in one line:

```sh
claude mcp add cat-factory \
  --env CAT_FACTORY_BASE_URL=https://cat-factory.example.com \
  --env CAT_FACTORY_API_KEY_FILE=$HOME/.config/cat-factory/api-key \
  -- npx -y @cat-factory/mcp-server
```

Or in any host's own config format:

```jsonc
{
  "mcpServers": {
    "cat-factory": {
      "command": "npx",
      "args": ["-y", "@cat-factory/mcp-server"],
      "env": {
        "CAT_FACTORY_BASE_URL": "https://cat-factory.example.com",
        "CAT_FACTORY_API_KEY_FILE": "/home/you/.config/cat-factory/api-key",
      },
    },
  },
}
```

| Variable | Meaning |
| --- | --- |
| `CAT_FACTORY_BASE_URL` | The deployment's origin. Required. |
| `CAT_FACTORY_API_KEY` | A public-API key. Required, unless the file below is given. |
| `CAT_FACTORY_API_KEY_FILE` | A file holding the key instead. Either one, never both. |
| `CAT_FACTORY_MCP_GROUPS` | Comma-separated resource groups to expose. Unset means all of them. |
| `CAT_FACTORY_MCP_TOOLS` | Comma-separated tool names to expose. |
| `CAT_FACTORY_MCP_EXCLUDE_TOOLS` | Tool names to withhold, applied after every other filter. |
| `CAT_FACTORY_MCP_READ_ONLY` | `true` exposes only the tools that change nothing. |
| `CAT_FACTORY_MCP_MAX_RESULT_CHARS` | Ceiling on one tool result. Default 100,000. |
| `CAT_FACTORY_MCP_TIMEOUT_MS` | Per-request deadline. `0` disables it. |
| `CAT_FACTORY_MCP_MAX_RETRIES` | Retries for a retriable failure. |

Missing credentials, an unknown group or tool name, a filter combination that would expose nothing,
and a non-numeric ceiling all **fail at startup**. A server that comes up and then fails every call
is reported by the host as connected, and the model spends turns discovering otherwise.

### Keep the key out of the host's config

A stdio server's environment is the host's config file, so an inline key means a long-lived
credential in plaintext in a home directory, present in every backup and every screen share of it.
`CAT_FACTORY_API_KEY_FILE` names a file to read it from instead, which can live somewhere locked
down. Setting both is refused rather than resolved by precedence: two live sources for one
credential means a rotation can land on the half nobody reads.

### Choosing what a model can reach

Three filters, narrowest last, all of them a convenience rather than a boundary. The key's scope is
the boundary.

- `CAT_FACTORY_MCP_GROUPS` is the coarse unit an operator thinks in: "no debug tools on this one".
- `CAT_FACTORY_MCP_TOOLS` exposes an explicitly chosen set. Precise, but it has to be re-edited
  whenever the API grows, and a forgotten edit silently withholds the new capability.
- `CAT_FACTORY_MCP_EXCLUDE_TOOLS` withholds named tools and keeps admitting everything else,
  including ones added later. This is the one to reach for to keep a single capability away from a
  model: excluding `notifications_act` keeps the pull-request-merging tool away without costing the
  inbox it belongs to.

Whatever is switched off, the server says so in its instructions, naming the withheld tools and
stating that the deployment still supports them. An unexplained absence reads to a model as a
platform that cannot do the thing, which it then reports to its user or works around.

## The tool surface

One tool per exposed operation, named `<group>_<method>` to match the SDK call
(`client.tasks.create()` becomes `tasks_create`).

| Group | What it covers |
| --- | --- |
| `jobs_*` | Headless runs of a public inline pipeline against a brief. |
| `services_*` | The board's service frames: list them, or create one (optionally repo-backed). |
| `spec_*` | A service's in-repo requirement tree and the Gherkin rendered from it. Read-only. |
| `repos_*` | The repositories a service can be backed with, and which service each already backs. |
| `tasks_*` | A task's whole lifecycle: create, edit, start, stop, retry, read its run, plus its dependencies and requirement links. |
| `pipelines_*` | Which pipelines a task can be started with. |
| `task_types_*` | What a task can be created as in this workspace, and the fields each kind accepts. |
| `notifications_*` | The human-actionable inbox, including the merge tail. |
| `webhook_*` | The workspace's outbound endpoints for notifications and run-lifecycle events. |
| `usage_*` | The billing period's metered budget position, and spend sliced by repository, ticket or run. |
| `me_*` | What the calling key is and what it may do. |
| `decisions_*` | A parked run's human decisions. |
| `debug_*` | A run's recorded telemetry: model calls, agent context, infrastructure logs. |
| `evidence_*` | What a run proved: the verification report, the outcome summary, the captured artifacts. |
| `merge_records_*` | The evidence behind the auto-merge policy, with its per-class rollups. |
| `keys_*` | The workspace's own API keys: provision, list, revoke. |

The server reports the live count on startup and lists the tools over the protocol, which is the one
place the list cannot go stale.

**Three operations are deliberately absent**, and the server says so rather than leaving a model to
conclude the platform cannot do it. The two event streams have no home here (a tool call returns one
result over no streaming channel), so poll `jobs_get` and `tasks_get_run` instead, or consume the
streams through an SDK; a bounded "wait for the run" tool would not fix this, because a run parked
on a human decision waits indefinitely by design, so any such tool is a timeout dressed up as an
answer. The artifact byte download is the third: a tool result is text or a declared content block,
not an arbitrary byte stream, so list the artifacts with `evidence_list_artifacts` and fetch the
bytes over HTTP or an SDK with the same key.

## A worked flow

Create a task, run it, watch it, answer the park. This is the shape of nearly every session:

1. **`services_list`**: the board's service frames. A task is created under one, and its id comes
   from here rather than being guessable.
2. **`pipelines_list`**: which pipelines a task can start with.
3. **`tasks_create`** returns the task id. Nothing runs yet; this is a board card.
4. **`tasks_start`** spends: it begins a real agent run against a real repository. Confirm with the
   person first. The tool is annotated as destructive, so most hosts will ask anyway.
5. **`tasks_get_run`**: poll it every 15 to 30 seconds and say so instead of going quiet. An agent
   step takes minutes. Keep going until the status is terminal or a decision is parked.
6. **`decisions_list`**: a run that stops advancing has usually parked on a human decision. Answer
   it with the other `decisions_*` tools, or leave it for a person.
7. **`notifications_list`**: the human-actionable tail, including the merge decision.
   `notifications_act` can merge a pull request, which is the other tool that spends.

For a run against a supplied brief with no board card and nothing pushed to a repository, the
`jobs_*` group is the same loop in one step.

## Things a caller should know

- **Read-only mode is a convenience, not a boundary.** It removes tools from the stdio server; the
  key still carries whatever scope it was minted with. Mint a `read`-scoped key for the boundary.
  The hosted endpoint runs this the other way round: it derives read-only from the key's scope, and
  says so, which prompts a model to ask for a wider key rather than a config edit.
- **A result that does not fit is refused, not truncated.** The message names the size, the limit,
  and the ways out from either side: `limit` and `cursor` on the list operations, `offset` on the
  debug reads, or a bigger ceiling. Half an object cannot satisfy the schema it was cut out of.
- **A failure is tool content, not a protocol error.** A validation failure carries the code, the
  machine-readable reason, and the per-field issues, and is passed through verbatim rather than
  re-worded, because that is the most actionable thing this layer ever returns.
- **The output schema is deliberately looser than the API's own.** Hosts validate results against
  it and the API is additive forever, so the published schema asserts nothing that a newer
  deployment's honest answer could violate.

---

Next: [Public API](./public-api.md) for the operations behind these tools, or
[Official SDKs](./sdks.md) to call them from code.

## See also

- [Cloudflare OS Gatekeeper](./cloudflare-os.md), which serves the same operations to a Cloudflare
  OS workspace as an object capability, with per-person keys and an approval queue in front of every
  call
