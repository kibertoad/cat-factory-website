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

- **Hosted**, at `POST /api/v1/mcp` on your deployment. Nothing to install: give the host a URL and
  a key. Reach for this first if your host speaks HTTP MCP.
- **The `@cat-factory/mcp-server` package**, over stdio. It needs no deployment of your own beyond
  the one you are calling, it is the only path for a host that cannot speak HTTP MCP, and it is the
  only one with per-host tool filters.

A deployment mounts the hosted endpoint from that same package, so the tool table, the instructions,
and the result rendering are identical on both paths.

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
| `services_*` | The board's service frames. |
| `tasks_*` | A task's whole lifecycle: create, edit, start, stop, retry, read its run. |
| `pipelines_*` | Which pipelines a task can be started with. |
| `notifications_*` | The human-actionable inbox, including the merge tail. |
| `usage_*` | The billing period's metered budget position. |
| `decisions_*` | A parked run's human decisions. |
| `debug_*` | A run's recorded telemetry: model calls, agent context, infrastructure logs. |

The server reports the live count on startup and lists the tools over the protocol, which is the one
place the list cannot go stale.

**The API's two event-stream operations are deliberately absent**, and the server says so rather
than leaving a model to conclude the platform cannot do it. A tool call returns one result over no
streaming channel, so poll `jobs_get` and `tasks_get_run` instead, or consume the streams through an
SDK. A bounded "wait for the run" tool would not fix this: a run parked on a human decision waits
indefinitely by design, so any such tool is a timeout dressed up as an answer.

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
