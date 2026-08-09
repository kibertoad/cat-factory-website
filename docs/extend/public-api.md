---
redirectFrom:
  - /reference/public-api.html
---

# Public API

The reference for driving Cat Factory from outside the app: CI, a script, another service, an agent
of your own. Cat Factory exposes a key-authenticated HTTP API under `/api/v1`. It covers headless
jobs (breaking down an [initiative](../guide/initiatives.md) and other inline pipelines), the full
board workload (list services, create and read tasks, start/stop/retry/
delete runs, stream progress), pipeline discovery, parked human decisions, a notification inbox, the
workspace's spend, and a read-only run-debugging surface. Every operation is scoped to one workspace
and authenticated by a bearer key.

Reach for an [official SDK](#client-sdks) before hand-rolling HTTP: clients ship for TypeScript,
Python, Go and Java/Kotlin.

This page is the narrative: what to do, in what order, and which of the surface's rules will bite.
Every operation's exact parameters, payload shapes and constraints are on the
[API Endpoint Reference](./api-reference.md), which is generated from the same OpenAPI 3.1 document
the SDK clients are, so it cannot fall behind the running surface. Point a client generator at
[the spec itself](https://github.com/kibertoad/cat-factory/blob/main/docs/openapi.json) rather than
hand-transcribing any of it.

::: tip Availability
The public API is available on any deployment that has [`ENCRYPTION_KEY`](../deploy/configuration.md#credential-encryption)
set (it seals key hashes at rest); without it the surface returns `503`. Keys are managed in the app
UI (see [Managing keys](#managing-keys)), and each key carries a scope.
:::

## Stability

`/api/v1`, the official SDK clients, and the outbound webhook delivery contract are a stable
surface. Build on them with the same expectations you would bring to any versioned public API:

- Changes are additive. New endpoints, new optional fields, new enum values, and new error codes
  arrive without warning and bump the OpenAPI `info.version` minor. Write clients that tolerate
  fields and enum members they do not recognise; the official SDKs already do.
- A breaking change never lands in place. It ships as a migration path plus a version change: the
  old shape keeps working while the new one is served beside it (a new field next to the old, a new
  `/api/v2` prefix for a changed path or semantics), the deprecation is documented, and the old half
  is removed only in a later release.
- Scope semantics only ever widen on their own. Narrowing what a key may do counts as a break and
  follows the same migration rule.

## Authenticating

Every `/api/v1` request carries a bearer key:

```
Authorization: Bearer cf_live_<keyId>.<secret>
```

The server stores only a one-way hash of the secret (`HMAC-SHA256` under `ENCRYPTION_KEY`), never
the secret itself, so a key is shown in full exactly once when you create it. The `<keyId>` is a
non-secret `pak_…` identifier embedded in the key. A key is scoped to one account and workspace;
every call it makes is bound to that workspace. An unknown or absent key fails closed as `401`; a
valid key whose scope is too low for the operation returns `403 insufficient_scope`.

## Scopes

Each key carries one scope on an inclusive ladder, so a higher scope also grants everything below it:

| Scope | Grants |
| --- | --- |
| **Read only** (`read`) | Reads and streams: list services, tasks, jobs, pipelines, and notifications; list a run's parked decisions; poll a job or run; open an SSE stream; read the workspace's [usage and budget](#usage-and-budget); the whole [run-debugging surface](#run-debugging). |
| **Read and write** (`write`) | Everything `read` can do, plus non-destructive mutations: create a task, edit its title/description, start, stop, retry, or cancel a run, break down an initiative, and dismiss a notification. This is the default for a new key. |
| **Decide** (`decide`) | Everything `write` can do, plus answering a run's [parked decisions](#answering-a-parked-run), and therefore starting a run on a pipeline that can park at all. |
| **Full access** (`admin`) | Everything `decide` can do, plus destructive and merge-adjacent actions: delete a task and its run history, and act on a notification (which can perform a real merge). |

`decide` is a deliberate rung of its own. Answering a decision injects caller-supplied prose into the
requirements every downstream agent then implements, and un-parks the run. A plain `write` key sees
exactly the previous behaviour, including the refusal of parking pipelines. Two things to weigh before
minting one:

- The grant is **workspace-wide, not limited to runs the key started**. The decision surface is keyed
  by run id and resolves any run in the key's workspace, including a board task a person started in
  the app. That is the same reach a `write` key already has over board runs, one rung up.
- Prefer `write` for an integration that only needs to author and launch work.

Handing out even a `read` key is not free: the [run-debugging surface](#run-debugging) reaches prompt
and response bodies that the app gates behind workspace roles.

## Managing keys

Create and revoke keys from the app. Open the **Integrations** hub, find **API access tokens** under
the **Development** group, and manage keys there:

- **Create a token**: enter a label (for example "CI pipeline") and pick a scope (Read only, Read and
  write, Decide, or Full access; Read and write is the default). The secret is revealed once on a
  "Copy your token now" panel and cannot be recovered afterward.
- **Active tokens** lists each key with its label, scope badge, creation date, last-used time, and
  who created it. Revoke a key from its row (you confirm first). To rotate a key, revoke it and mint
  a new one; there is no edit-in-place.

A workspace may hold up to 50 live keys.

The same operations are available on session-authenticated endpoints (called with the app's own
session, guarded by the `secrets.manage` permission) for scripting key management:

| Method & path | What it does |
| --- | --- |
| `GET /workspaces/:workspaceId/public-api-keys` | List live keys (metadata only: id, label, scope, creator, timestamps). |
| `POST /workspaces/:workspaceId/public-api-keys` | Mint a key. Body `{ "label": "…", "scope": "read\|write\|admin" }` (scope optional, defaults to `write`). Returns `{ key, secret }`; the raw secret is shown once and is not recoverable. |
| `DELETE /workspaces/:workspaceId/public-api-keys/:id` | Revoke a key (idempotent). |

These inbound `public-api-keys` are distinct from the outbound `api-keys` provider-key pool that
[custom providers](./custom-providers.md) draw on.

## Client SDKs

Official clients ship for four languages, so an integration does not have to write HTTP by hand:

| Language | Install |
| --- | --- |
| TypeScript | `npm install @cat-factory/sdk` |
| Python | `pip install cat-factory-sdk` |
| Go | `go get github.com/kibertoad/cat-factory/sdk/go@latest` |
| Java / Kotlin | `ai.catfactory:cat-factory-sdk` on Maven Central (one artifact serves both) |

Their models and operation methods are generated from the same OpenAPI document the server
publishes, so a client cannot drift from the deployment it talks to. Each client's transport is
hand-written on top and implements the conventions on this page for you: keyset auto-pagination,
SSE framing, bounded retries on idempotent requests only, and an exception type per HTTP status
class with the machine-readable `code` exposed verbatim as a string rather than narrowed to a
closed enum.

There is no separate Kotlin client. The Java artifact is annotated (`@NullMarked`/`@Nullable`),
escapes Kotlin's hard keywords, exposes a sealed error hierarchy, and offers builders in place of
default arguments, so it is idiomatic from Kotlin without a second client to keep in step.

The SDKs are a typed skin over exactly the endpoints below. Scopes, error codes and paging rules
are identical whichever you use.

## Error codes

Every failure is `{ "error": { "code", "message", "details"?, "issues"? } }`. Branch on `code`,
never on `message`. Two families appear:

- Status-class codes: `validation` (400 for a malformed body or query, 422 for a domain rule),
  `not_found`, `conflict`, `unauthorized`, `forbidden`, `credential_required` (428),
  `rate_limited` (429), `unavailable` (503), `internal`. A 400 validation failure also carries
  `issues: [{ path, message }]`.
- Surface-specific codes unique to `/api/v1`:

| Code | Status | Raised by |
| --- | --- | --- |
| `insufficient_scope` | 403 | any route, when the key's scope is below the minimum |
| `invalid_cursor` | 400 | any paginated list, on a malformed `cursor` |
| `pipeline_not_public` | 400 | `POST /jobs` with an unknown or non-public pipeline |
| `pipeline_not_inline` | 400 | `POST /jobs` with a pipeline that has container or GitHub steps |
| `pipeline_requires_decide_scope` | 403 | `POST /jobs` and `POST /tasks/:id/start` when the pipeline can park on a human |
| `too_many_active_runs` | 429 | `POST /jobs` when five headless jobs are already in flight |
| `pipeline_required` | 400 | `POST /tasks/:id/start` with no pinned pipeline and no `pipelineId` |
| `service_archived` | 409 | `POST /tasks/:id/start` under an archived service |
| `individual_model_unsupported` | 409 | any start, retry, or notification `act` that would run a personal-credential model headlessly |
| `no_run` | 404 / 409 | run reads (404: never started) and stop/retry (409: nothing to act on) |
| `no_review` | 404 | requirements decision routes when the run has no live review |
| `notification_not_actionable` | 409 | `POST /notifications/:id/act` on a card with no automated action |

## Board workloads

The bulk of the surface drives the board headlessly. Nothing here spins up a browser session; a run
started over the API executes exactly as one started from the board and appears on it.

The table below is the shape of the workload, annotated with what each call is FOR. It is not the
complete parameter list for any of them: that is the
[API Endpoint Reference](./api-reference.md#operations), which enumerates every operation on the
surface, including the ones no narrative here reaches for.

| Method | Path | Scope | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/services` | read | List the workspace's services. |
| `POST` | `/api/v1/services/{serviceId}/tasks` | write | Create a task. Body `{ title, description?, taskType?, ticket? }`; `taskType` is one of `feature`, `bug`, `document`, `spike`, `review`, `ralph` (default `feature`). See [Filing a task from a tracker ticket](#filing-a-task-from-a-tracker-ticket). |
| `GET` | `/api/v1/services/{serviceId}/tasks` | read | List a service's tasks (its whole subtree), newest first. Paged; see [Paging](#paging). Filter with `?status=`. |
| `GET` | `/api/v1/tasks/{taskId}` | read | Get a task's status projection: `{ taskId, serviceId, title, description, taskType, status, progress, runId, pullRequestUrl }`. |
| `PATCH` | `/api/v1/tasks/{taskId}` | write | Edit the task's title or description. |
| `POST` | `/api/v1/tasks/{taskId}/start` | write | Start the task's pipeline. Body `{ pipelineId? }`, falling back to the task's pinned pipeline. |
| `POST` | `/api/v1/tasks/{taskId}/stop` | write | Stop the in-flight run (idempotent; the run stays retryable). |
| `POST` | `/api/v1/tasks/{taskId}/retry` | write | Retry a failed run. |
| `DELETE` | `/api/v1/tasks/{taskId}` | admin | Delete a task and its run history (destructive). |
| `GET` | `/api/v1/tasks/{taskId}/run` | read | Rich run projection: per-step state, progress, subtasks, failure, and the PR URL and branch. |
| `GET` | `/api/v1/tasks/{taskId}/events` | read | Stream the run as Server-Sent Events (`progress`, `done`, `error`, `timeout`), for up to five minutes. |
| `GET` | `/api/v1/pipelines` | read | Discover pipelines: each entry is `{ pipelineId, name, steps, public, headlessStartable }`. Use it to find a valid `pipelineId` and confirm a pipeline can start headlessly. |

`taskType` also accepts a namespaced custom task type (`<namespace>:<name>`) the deployment
[registered](./frontend-extensions.md#custom-task-types), so an "incident" or
"compliance-audit" is creatable over the API like any built-in type.

A few refusals are worth planning for:

- Starting, retrying, or acting on a run whose steps use an **individual-usage** (personal-credential)
  model returns `409 individual_model_unsupported`: a headless key cannot unlock a personal
  subscription. Use a pipeline whose models come from the account/workspace pools.
- Starting a task under an archived service returns `409 service_archived`; a task with no pipeline
  returns `400 pipeline_required`.
- Starting a run on a pipeline that can **park** on a human decision needs the `decide` scope. A
  `write` key is refused at admission with `403 pipeline_requires_decide_scope`, and the message
  names which of the pipeline's park surfaces the API can answer and which it cannot.

A pipeline counts as parking in any of three ways:

- an **approval gate** on an enabled step;
- an inline **review or brainstorm** kind (`requirements-review`, `clarity-review`, and the two
  brainstorms), which sets the run `blocked` awaiting an answer;
- an unbounded **human-wait gate** (`human-review`), a gate step whose poll never times out because
  it is waiting for a person to look at the PR.

The third case covers the shipped **Adaptive build** preset, which carries a risk-gated
`human-review`, so a `write`-only key cannot start it. The unconditional presets (**Standard build**,
**Simple build**) never park and stay `write`-startable. Parks raised dynamically mid-run (an
agent-raised decision, a judge park) are not knowable in advance and do not gate the start.

The inline-only restriction applies to headless jobs, not board tasks: a `decide` key may start
container pipelines on board tasks.

### Filing a task from a tracker ticket

An intake integration usually already holds the ticket the work came from. Name it on the create
call and the platform imports the issue and attaches it to the new task, instead of you flattening
it into `description`:

```http
POST /api/v1/services/svc_api/tasks
Content-Type: application/json

{ "title": "Fix cat photo 404s", "taskType": "bug",
  "ticket": { "source": "jira", "ref": "https://acme.atlassian.net/browse/PROJ-1" } }
```

`source` is a tracker this workspace has connected and enabled (`jira`, `github`, `linear`, or a
`<namespace>:<name>` source the deployment [registered](../guide/issue-sources.md#registering-a-tracker-from-a-deployment)).
`ref` is the issue's canonical key or its full URL; the provider's own parser resolves either, so
you can forward whichever form your webhook carried.

That link, not the ticket's text, is what the rest of the platform runs on. Every agent step
re-reads the live issue as context (status, labels, description, comments), the run's clarification
questions are written back onto the issue, a reply typed there resolves against the parked run, and
the recurring intake sweep treats the issue as taken. `description` stays your own framing and is
never overwritten.

Two refusals matter:

- The ticket is resolved **before** the task is created. An unconfigured or disabled source, a ref
  the provider cannot parse, or an issue the tracker will not serve refuses the whole request and
  leaves the board untouched, rather than handing you a `201` for a task that runs on its title
  alone.
- **One task per ticket.** A ticket already linked comes back `409` with
  `details.reason: "ticket_already_linked"` and `details.taskId` naming the task that holds it, so a
  redelivered webhook follows the existing task instead of filing a duplicate. You need no
  bookkeeping of your own to stay idempotent, and that holds under concurrency: two deliveries of
  one ticket in flight together are decided by a conditional write, so exactly one gets a task and
  the other gets the `409` naming it. The losing filing is rolled back off the board rather than
  left behind ticket-less.

## Paging

The two list endpoints that can grow without bound, `GET /api/v1/services/{serviceId}/tasks` and
`GET /api/v1/jobs`, are **keyset-paginated**. Each response carries its array (`tasks` or `jobs`) plus
a `nextCursor`, and you page until `nextCursor` is `null`:

| Parameter | Meaning |
| --- | --- |
| `limit` | 1–100. The server caps a page at 50 entries regardless. |
| `cursor` | The previous response's `nextCursor`. Omit for the first page. |
| `status` | Filter by status. Tasks: `planned`, `ready`, `in_progress`, `blocked`, `pr_ready`, `done`. Jobs: `running`, `succeeded`, `failed`. |
| `since` | Jobs only. Epoch milliseconds; return jobs created at or after this. |

The cursor is a keyset (a sort key plus an id), not an offset, so a page can't shift under concurrent
inserts and silently skip a row, and a burst of runs sharing a millisecond pages correctly. A
malformed cursor is a `400 invalid_cursor` rather than a silent re-serve of page 1.

`GET /api/v1/jobs` lists the workspace's headless initiative jobs newest first. It exists so an
integration that lost its stored job ids can rediscover its own in-flight runs. Its scoping is applied
in SQL, so an external key can never enumerate ordinary board runs through it.

## Answering a parked run

A run started over the API can pause on a human decision, the same requirements-review and
implementation-fork parks the app surfaces. A `decide`-scoped key answers them over
`/api/v1/runs/{runId}/decisions`. Every route delegates to the same service methods the app's own
controllers call, so the arbitration between the two surfaces is identical whichever answers first.

| Method | Path (under `/api/v1/runs/{runId}/decisions`) | Scope | Purpose |
| --- | --- | --- | --- |
| `GET` | (base) | read | List the run's parked decisions: review findings with stable item ids, the iteration and its cap, the incorporated document, the proposed implementation forks, and any judge verdict. |
| `POST` | `/requirements/findings/{itemId}/reply` | decide | Answer one review finding. |
| `PATCH` | `/requirements/findings/{itemId}` | decide | Dismiss or reopen a finding. |
| `POST` | `/requirements/incorporate` | decide | Incorporate the answers into the requirements. |
| `POST` | `/requirements/re-review` | decide | Re-review the incorporated document. |
| `POST` | `/requirements/proceed` | decide | Proceed with the requirements as they stand. |
| `POST` | `/requirements/resolve-exceeded` | decide | Resolve a review that hit its iteration cap. |
| `POST` | `/fork/choose` | decide | Choose one of the proposed implementation approaches. |
| `POST` | `/judge/resolve` | decide | Resolve a judge step's parked verdict. |

Every route returns the refreshed decision list, so you can drive the loop without a separate poll.

A parked run waits for a human **indefinitely** by design, and it holds one of the workspace's
in-flight slots while it waits. `POST /api/v1/jobs/{id}/cancel` (`write`) is there so the cap stays a
recoverable `429` rather than a wall with no door.

### Learning that a run parked

Polling is the fallback, not the design. Two pushes carry a park outward:

- **SSE**: both public streams stay open across a park and emit a `decision` frame.
- **Outbound webhook**: a per-workspace HTTPS endpoint that receives notifications as they are raised.
  See [Set Up Notifications → Outbound webhooks](../operate/notifications.md#outbound-webhooks).

You can also echo the open questions onto the task's linked tracker issue, so the clarification
reaches whoever asked for the work. See
[Connect Issue & Document Sources → Writing back to the tracker](../guide/issue-sources.md#writing-back-to-the-tracker).

## Notification inbox

A key can read and clear the workspace's notification inbox, so an external system can react to
merge-review requests, completed pipelines, and gate failures.

| Method | Path | Scope | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/notifications` | read | List the workspace's open notifications. |
| `POST` | `/api/v1/notifications/{id}/act` | admin | Run the card's automated side-effect (merge the PR, retry the run), then resolve it. |
| `POST` | `/api/v1/notifications/{id}/dismiss` | write | Dismiss a card without acting on it. |

`act` only accepts cards with an automated action: `merge_review`, `pipeline_complete`, `ci_failed`,
and `test_failed`. Any other open card returns `409 notification_not_actionable`; dismiss it instead.
A merge triggered through `act` uses the deployment's GitHub installation token.

## Headless jobs

A headless job runs a public, inline pipeline against a supplied brief. It is not a board task,
never touches a repository, and never appears on any board. Breaking down an initiative is the
built-in case:

```
POST /api/v1/jobs
Authorization: Bearer cf_live_<keyId>.<secret>
Content-Type: application/json

{ "pipelineId": "pl_initiative_breakdown", "input": "<the brief>", "title": "optional" }
```

The `input` is the brief (1–50,000 characters). The platform plans it headlessly (no container, no
checkout, nothing pushed to a repo). The call returns `202` with a `jobId` and links to poll:

```json
{ "jobId": "…", "status": "running", "links": { "self": "/api/v1/jobs/…", "events": "/api/v1/jobs/…/events" } }
```

Poll for the result:

- `GET /api/v1/jobs/:id` returns `{ jobId, status, pipelineId, createdAt, result, error }`. `status` is
  `running`, `succeeded`, or `failed`; `result` (the agent's prose plus an optional structured
  decomposition) is present once the job has succeeded.
- `GET /api/v1/jobs/:id/events` streams the same job as Server-Sent Events (`progress`, `done`,
  `error`, `stopped`, `timeout`, and `decision` when the run parks), for up to five minutes.
- `GET /api/v1/jobs` lists your jobs, newest first. See [Paging](#paging).
- `POST /api/v1/jobs/:id/cancel` (`write`) cancels an in-flight job and frees its concurrency slot.

Only pipelines published as public inline pipelines are accepted; `pl_initiative_breakdown`
("Break down initiative") is the built-in one. Discover the eligible ones through
`GET /api/v1/pipelines` (they carry `public: true`). A workspace may have at most five headless jobs
in flight at once (a sixth returns `429 too_many_active_runs`). Headless jobs never appear on any
board, and this surface only ever sees the jobs it created, never the workspace's ordinary board
runs.

The **coarse job status** hides board internals: internal `done` maps to `succeeded`, `failed` to
`failed`, and everything else (running, spend-paused, parked) to `running`. The `?status=` filter
uses the same mapping, so it always agrees with the field it filters on.

Headless jobs emit no run-lifecycle webhooks; the job read and its SSE stream already serve them.

## Usage and budget

| Method | Path | Scope | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/usage` | read | The current period's spend and budget position, as one resource. |

The response is `{ periodStart, currency, budget, rows }`. `budget` is the metered position the
spend safeguard acts on: `costSpent`, `costLimit`, and `exceeded: true` when runs are paused at the
cap. `rows` breaks spend down per `(billing, vendor, provider, model)`.

Do not sum the two billing kinds. A `subscription` row's `costEstimate` is illustrative, because a
flat-rate plan bills nothing per token; only `metered` rows are money. The endpoint is workspace-tier
by design, so a workspace key never learns a sibling workspace's spend. See
[Control Spend with Budgets](../guide/budgets.md).

## Run debugging

Eight read-only endpoints under `/api/v1/debug/*` diagnose a run from outside the browser: a run
index, a per-run overview with precomputed signals, and budgeted drill-downs into model calls, agent
context, searches, and provisioning logs. They use the same keys at `read` scope and are keyset
paginated like the other lists.

Because they reach prompt and response bodies, treat a key that can call them as sensitive even
though it is only `read`.

## Streaming

Both `/events` endpoints are `text/event-stream` responses driven by a one-second poll of the
persisted run. Frames are de-duplicated (a frame is sent only when the payload changed) and there is
no heartbeat, so a quiet run produces a quiet stream.

| Event | Meaning |
| --- | --- |
| `progress` | The run advanced. Data is the full job or run projection, the same shape as the GET. |
| `decision` | The run just parked on a human decision. Answer it through `/runs/{runId}/decisions`; the stream stays open, and a later park after a resume is announced again. |
| `done` | Terminal success. The stream closes. |
| `error` | Terminal failure. The stream closes. |
| `stopped` | Jobs stream only: the run ended in a state that still projects as `running`, such as a cancellation. The stream closes. |
| `timeout` | The stream hit its five-minute cap; data is `{}`. Nothing is wrong. Reconnect to keep watching. |

Revoking a key cuts a live stream within about five seconds. Streams are per-run reads bounded by
their own poll; for push at scale, register the
[outbound webhook](../operate/notifications.md#outbound-webhooks) instead.

---

Next: the [API Endpoint Reference](./api-reference.md) for every operation's exact fields, the
[Official SDKs](./sdks.md) if you would rather not hand-roll a client, the
[MCP Server](./mcp-server.md) to give an MCP host the same surface, or the
[Cloudflare OS Gatekeeper](./cloudflare-os.md) to install Cat Factory into a Cloudflare OS workspace
without handing any agent a key.
