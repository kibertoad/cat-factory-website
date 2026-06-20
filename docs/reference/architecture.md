# Architecture

A high-level map of how Cat-Factory is put together. You don't need this to *use* the platform,
but it helps when deploying, extending, or debugging it.

## The big picture

Cat-Factory has three tiers:

- A **Nuxt single-page app** rendering the board on a Vue Flow canvas, with Pinia stores.
- A **runtime-neutral backend** (a Hono HTTP layer) that runs on Cloudflare Workers or Node.js.
- **Per-run containers** that execute coding work and Git operations.

The system is **durable and observable**: runs advance through checkpointed steps and stream live
progress over WebSockets rather than polling.

## Runtime abstraction

The backend is **runtime-neutral through port abstraction**. The same `@cat-factory/server` HTTP
layer serves both runtimes; only the infrastructure adapters differ, and a **conformance suite**
validates feature parity between them.

| Concern | Cloudflare adapter | Node.js adapter |
| --- | --- | --- |
| Repositories (data) | D1 | Drizzle / PostgreSQL |
| Event hubs | Durable Objects | In-memory / HTTP WebSocket |
| Durable execution | Cloudflare Workflows | pg-boss |
| Agent jobs | Cloudflare Containers | Self-hosted [runner pool](../deploy/runner-pools.md) (Docker / Kubernetes / custom) |

The chosen adapters are wired in at startup, following a hexagonal flow: **controllers → services →
ports**, with infra adapters plugged in at the edges. The execution machinery is shared, so **both
runtimes run container agents** — on Cloudflare via per-run Containers, on Node by dispatching to a
registered [runner pool](../deploy/runner-pools.md).

## Extending a deployment

When you assemble your own deployment you can mix in capabilities without forking the platform:
additional **model providers** (e.g. AWS Bedrock), custom **agent kinds** (with their own prompts),
and predefined **pipelines** that seed into every new workspace. These are opt-in — the stock
deployment ships with none of them — so an organization can layer in proprietary agents while
tracking upstream.

## Durable execution model

- A durable executor (Cloudflare Workflows or pg-boss) **checkpoints step completions**.
- **Per-run containers** execute coding work asynchronously.
- A **Durable Object per workspace** collects all run events.
- **WebSocket** connections push the event stream to connected clients.
- State changes are **broadcast immediately** — there is no polling.

## Real-time event streaming

Each workspace has an **event hub** (a Durable Object, or in-memory on Node.js). Events include:

- Step transitions
- Subtask updates
- Decision prompts
- Failures
- Spend notifications

Clients **subscribe when a board opens** and unsubscribe when it closes. A persistent **event log**
is retained for debugging.

## Observability

- **LLM call metering** feeds spend tracking, including **cached prompt tokens** and the per-run
  prompt-cache hit rate. Prompts are stored as **deltas** (only the appended messages each call,
  not the re-sent prefix) and rebuilt on export.
- **Container execution** time and resource usage are captured.
- **Step duration** and retry attempts are counted.
- **GitHub API quota** is monitored.
- **Decision prompt response times** are recorded.

The dashboard surfaces live run execution, decision-prompt forms, a spend gauge, searchable
historical logs, and access to container/job logs.

## Outbound services

Outbound calls go through the backend, never the per-run container directly. An **LLM proxy** meters
every model call and injects the prompt-cache key, and an optional **web-search proxy** lets
container agents use `web_search`/`web_fetch` without a provider key ever entering the sandbox. See
[Configuration → Web search](../deploy/configuration.md#web-search).

## Multi-tenant isolation

- **GitHub identity** is the primary user credential.
- **Organization membership** determines workspace access.
- **Repositories and credentials** are isolated per workspace.
- **Budgets** are segregated by organization.
- **Prompt-fragment** visibility is configurable by scope.

## In-org shared services

A **service** is account-owned and keyed independently of any one workspace, so the same service
(its blocks, state, runs) is **one shared copy** that several workspaces in an org can
[mount](../guide/shared-services.md). Two mechanisms keep shared boards consistent: a block's live
events are **fanned out** to every workspace that mounts its service, and GitHub **sync is
deduplicated to once per repo per org**, then distributed to each linked workspace.

---

See also: [Integration Manifests](./manifests.md) for the runner-pool and environment-provider
surfaces you author, and [Data Model](./data-model.md) for the core domain shapes.
