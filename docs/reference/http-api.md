# HTTP API

The backend exposes its functionality through **Hono controllers** in `@cat-factory/server`. The
same API is served by both the Cloudflare and Node.js runtimes. This page lists the endpoints by
area.

::: tip Authentication
All endpoints operate within an authenticated session established through the GitHub identity
flow. See [Configuration → Authentication](../deploy/configuration.md#authentication).
:::

## Board operations

| Method & path | Description |
| --- | --- |
| `GET /workspaces/:id/board` | Retrieve board structure with blocks and edges. |
| `POST /blocks` | Create a block (service / module / task). |
| `PATCH /blocks/:id` | Update block properties. |
| `DELETE /blocks/:id` | Remove a block and cascade to its children. |
| `POST /blocks/:id/reparent` | Move a block to a new parent. |

## Execution

| Method & path | Description |
| --- | --- |
| `POST /blocks/:id/runs` | Initiate an agent pipeline for a block. |
| `GET /runs/:id` | Fetch run metadata and step history. |
| `GET /runs/:id/events` | WebSocket upgrade for live progress streaming. |
| `POST /runs/:id/steps/:stepId/decision` | Submit a human decision at a prompt. |

## Requirements

| Method & path | Description |
| --- | --- |
| `POST /blocks/:id/review-requirements` | Trigger the async reviewer agent. |
| `PATCH /blocks/:id/requirements` | Record human answers to identified gaps. |

## GitHub integration

| Method & path | Description |
| --- | --- |
| `POST /accounts/github-app-callback` | Complete the GitHub App OAuth flow. |
| `POST /webhooks/github` | Receive repository push / PR / issue events. |
| `GET /repos` | List connected repositories for the workspace. |

## Models & spend

| Method & path | Description |
| --- | --- |
| `GET /accounts/spend/current` | Organization budget utilization. |
| `GET /models` | Available models with their providers. |
| `PATCH /workspace/:id/settings` | Per-block model selection and workspace settings. |

---

For the shapes returned and accepted by these endpoints, see the [Data Model](./data-model.md).
