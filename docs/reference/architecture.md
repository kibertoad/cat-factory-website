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
| Agent jobs | Cloudflare Containers | Docker / Kubernetes / custom runner |

The composition root wires the chosen adapters into the services (`container.ts`), following a
hexagonal flow: **controllers → services → ports**, with infra adapters plugged in at the edges.

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

- **LLM call metering** feeds spend tracking.
- **Container execution** time and resource usage are captured.
- **Step duration** and retry attempts are counted.
- **GitHub API quota** is monitored.
- **Decision prompt response times** are recorded.

The dashboard surfaces live run execution, decision-prompt forms, a spend gauge, searchable
historical logs, and access to container/job logs.

## Multi-tenant isolation

- **GitHub identity** is the primary user credential.
- **Organization membership** determines workspace access.
- **Repositories and credentials** are isolated per workspace.
- **Budgets** are segregated by organization.
- **Prompt-fragment** visibility is configurable by scope.

---

See also: [Packages](./packages.md) for the module layout, [HTTP API](./http-api.md) for
endpoints, and [Data Model](./data-model.md) for the wire contracts.
