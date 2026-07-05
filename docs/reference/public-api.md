# Public API

Cat Factory exposes a small, key-authenticated HTTP API under `/api/v1` for driving work from outside
the app. Today its one operation is breaking down an [initiative](../guide/initiatives.md): an external
system posts a brief, the platform plans it headlessly (no container, no checkout, nothing pushed to a
repo), and the caller polls for the result.

::: tip Availability
The public API is available on any deployment that has [`ENCRYPTION_KEY`](../deploy/configuration.md#credential-encryption)
set (it seals key hashes at rest); without it the surface returns `503`. Key management is currently
API-only, there is no UI for it yet, and the initiative breakdown is the only built-in operation.
:::

## Authenticating

Every `/api/v1` request carries a bearer key:

```
Authorization: Bearer cf_live_<keyId>.<secret>
```

The server stores only a one-way hash of the secret, never the secret itself, so a key is shown in
full exactly once when you create it. A key is scoped to one account and workspace; every call it makes
is bound to that workspace, and it can only read the jobs it started. An unknown key and a wrong secret
both fail closed as `401`.

## Managing keys

Keys are created and revoked through session-authenticated endpoints on the workspace (call them with
the app's own session; there is no UI yet):

| Method & path | What it does |
| --- | --- |
| `GET /workspaces/:workspaceId/public-api-keys` | List live keys (metadata only). |
| `POST /workspaces/:workspaceId/public-api-keys` | Mint a key. Body `{ "label": "…" }`. Returns `{ key, secret }`; the raw secret is shown once and is not recoverable. |
| `DELETE /workspaces/:workspaceId/public-api-keys/:id` | Revoke a key (idempotent). |

A workspace may hold up to 50 live keys.

## Breaking down an initiative

```
POST /api/v1/initiatives
Authorization: Bearer cf_live_<keyId>.<secret>
Content-Type: application/json

{ "pipelineId": "pl_initiative_breakdown", "input": "<the brief>", "title": "optional" }
```

The `input` is the brief (1–50,000 characters). The call returns `202` with a `jobId` and links to poll:

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
("Break down initiative") is the built-in one. A workspace may have at most five initiative runs in
flight at once (a sixth returns `429`). External runs never appear on any board.

---

For the board-level initiative feature (interactive planning, execution, the tracker), see
[Initiatives](../guide/initiatives.md).
