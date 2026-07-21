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
| **Read only** (`read`) | Reads and streams: list services, tasks, pipelines, and notifications; poll a job or run; open an SSE stream. |
| **Read and write** (`write`) | Everything `read` can do, plus non-destructive mutations: create a task, edit its title/description, start, stop, or retry a run, break down an initiative, and dismiss a notification. This is the default for a new key. |
| **Full access** (`admin`) | Everything `write` can do, plus destructive and merge-adjacent actions: delete a task and its run history, and act on a notification (which can perform a real GitHub merge). |

## Managing keys

Create and revoke keys from the app. Open the **Integrations** hub, find **API access tokens** under
the **Development** group, and manage keys there:

- **Create a token**: enter a label (for example "CI pipeline") and pick a scope (Read only, Read and
  write, or Full access; Read and write is the default). The secret is revealed once on a "Copy your
  token now" panel and cannot be recovered afterward.
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
| `GET` | `/api/v1/services/{serviceId}/tasks` | read | List a service's tasks (its whole subtree). |
| `GET` | `/api/v1/tasks/{taskId}` | read | Get a task's status projection. |
| `PATCH` | `/api/v1/tasks/{taskId}` | write | Edit the task's title or description. |
| `POST` | `/api/v1/tasks/{taskId}/start` | write | Start the task's pipeline. Body `{ pipelineId? }`, falling back to the task's pinned pipeline. |
| `POST` | `/api/v1/tasks/{taskId}/stop` | write | Stop the in-flight run (idempotent; the run stays retryable). |
| `POST` | `/api/v1/tasks/{taskId}/retry` | write | Retry a failed run. |
| `DELETE` | `/api/v1/tasks/{taskId}` | admin | Delete a task and its run history (destructive). |
| `GET` | `/api/v1/tasks/{taskId}/run` | read | Rich run projection: per-step state, progress, subtasks, failure, and the PR URL and branch. |
| `GET` | `/api/v1/tasks/{taskId}/events` | read | Stream the run as Server-Sent Events (`progress`, `done`, `error`, `timeout`), for up to five minutes. |
| `GET` | `/api/v1/pipelines` | read | Discover pipelines: each entry is `{ pipelineId, name, steps, public, headlessStartable }`. Use it to find a valid `pipelineId` and confirm a pipeline can start headlessly. |

A few refusals are worth planning for:

- Starting, retrying, or acting on a run whose steps use an **individual-usage** (personal-credential)
  model returns `409 individual_model_unsupported`: a headless key cannot unlock a personal
  subscription. Use a pipeline whose models come from the account/workspace pools.
- Starting a task under an archived service returns `409 service_archived`; a task with no pipeline
  returns `400 pipeline_required`.

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
  `error`, `stopped`, `timeout`), for up to five minutes.

Only pipelines published as public inline pipelines are accepted; `pl_initiative_breakdown`
("Break down initiative") is the built-in one. Discover the eligible ones through
`GET /api/v1/pipelines` (they carry `public: true`). A workspace may have at most five initiative runs
in flight at once (a sixth returns `429`). External initiative runs never appear on any board, and a
key can only read the jobs it started.

---

For the board-level initiative feature (interactive planning, execution, the tracker), see
[Initiatives](../guide/initiatives.md).
