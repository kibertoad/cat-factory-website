# Public API

Cat Factory exposes a key-authenticated HTTP API under `/api/v1` for driving work from outside the
app. It covers breaking down an [initiative](../guide/initiatives.md), the full board workload
(list services, create and read tasks, start/stop/retry/delete runs, stream progress), pipeline
discovery, and a notification inbox (list, act, dismiss). Every operation is scoped to one workspace
and authenticated by a bearer key.

The full request/response schemas ship as an OpenAPI 3.1 document at `docs/openapi.json` in the code
repo (title "cat-factory Public API", version 1.0.0). Point your client generator at it rather than
hand-transcribing every field.

::: tip Availability
The public API is available on any deployment that has [`ENCRYPTION_KEY`](../deploy/configuration.md#credential-encryption)
set (it seals key hashes at rest); without it the surface returns `503`. Keys are managed in the app
UI (see [Managing keys](#managing-keys)), and each key carries a scope.
:::

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
| **Read only** (`read`) | Reads and streams: list services, tasks, jobs, pipelines, and notifications; list a run's parked decisions; poll a job or run; open an SSE stream. |
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
[custom providers](../deploy/custom-providers.md) draw on.

## Board workloads

The bulk of the surface drives the board headlessly. Nothing here spins up a browser session; a run
started over the API executes exactly as one started from the board and appears on it.

| Method | Path | Scope | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/services` | read | List the workspace's services. |
| `POST` | `/api/v1/services/{serviceId}/tasks` | write | Create a task. Body `{ title, description?, taskType? }`; `taskType` is one of `feature`, `bug`, `document`, `spike`, `review`, `ralph` (default `feature`). |
| `GET` | `/api/v1/services/{serviceId}/tasks` | read | List a service's tasks (its whole subtree), newest first. Paged; see [Paging](#paging). Filter with `?status=`. |
| `GET` | `/api/v1/tasks/{taskId}` | read | Get a task's status projection. |
| `PATCH` | `/api/v1/tasks/{taskId}` | write | Edit the task's title or description. |
| `POST` | `/api/v1/tasks/{taskId}/start` | write | Start the task's pipeline. Body `{ pipelineId? }`, falling back to the task's pinned pipeline. |
| `POST` | `/api/v1/tasks/{taskId}/stop` | write | Stop the in-flight run (idempotent; the run stays retryable). |
| `POST` | `/api/v1/tasks/{taskId}/retry` | write | Retry a failed run. |
| `DELETE` | `/api/v1/tasks/{taskId}` | admin | Delete a task and its run history (destructive). |
| `GET` | `/api/v1/tasks/{taskId}/run` | read | Rich run projection: per-step state, progress, subtasks, failure, and the PR URL and branch. |
| `GET` | `/api/v1/tasks/{taskId}/events` | read | Stream the run as Server-Sent Events (`progress`, `done`, `error`, `timeout`), for up to five minutes. |
| `GET` | `/api/v1/pipelines` | read | Discover pipelines: each entry is `{ pipelineId, name, steps, public, headlessStartable }`. Use it to find a valid `pipelineId` and confirm a pipeline can start headlessly. |

`taskType` also accepts a namespaced custom task type (`<namespace>:<name>`) the deployment
[registered](../deploy/frontend-extensions.md#custom-task-types), so an "incident" or
"compliance-audit" is creatable over the API like any built-in type.

A few refusals are worth planning for:

- Starting, retrying, or acting on a run whose steps use an **individual-usage** (personal-credential)
  model returns `409 individual_model_unsupported`: a headless key cannot unlock a personal
  subscription. Use a pipeline whose models come from the account/workspace pools.
- Starting a task under an archived service returns `409 service_archived`; a task with no pipeline
  returns `400 pipeline_required`.
- Starting a run on a pipeline that can **park** on a human decision needs the `decide` scope. A
  `write` key is refused at admission. Pipelines that would need a human answer with no way to give
  one (inline-only kinds) are refused at every scope.

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
  See [Notifications → Outbound webhooks](../deploy/notifications.md#outbound-webhooks).

You can also echo the open questions onto the task's linked tracker issue, so the clarification
reaches whoever asked for the work. See
[Issue Sources → Writing back to the tracker](../guide/issue-sources.md#writing-back-to-the-tracker).

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

## Breaking down an initiative

```
POST /api/v1/initiatives
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
`GET /api/v1/pipelines` (they carry `public: true`). A workspace may have at most five initiative runs
in flight at once (a sixth returns `429`). External initiative runs never appear on any board, and a
key can only read the jobs it started.

---

For the board-level initiative feature (interactive planning, execution, the tracker), see
[Initiatives](../guide/initiatives.md).
