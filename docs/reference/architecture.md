# Architecture

A high-level map of how Cat Factory is put together. You don't need this to *use* the platform,
but it helps when deploying, extending, or debugging it.

## The big picture

Cat Factory has three tiers:

- A Nuxt single-page app rendering the board on a Vue Flow canvas, with Pinia stores.
- A runtime-neutral backend (a Hono HTTP layer) that runs on Cloudflare Workers or Node.js.
- Per-run containers that execute coding work and Git operations.

Runs are durable and observable: they advance through checkpointed steps and stream live
progress over WebSockets rather than polling.

## Runtime abstraction

The backend stays runtime-neutral through port abstraction. The same `@cat-factory/server` HTTP
layer serves both runtimes; only the infrastructure adapters differ, and a conformance suite
validates feature parity between them.

| Concern | Cloudflare adapter | Node.js adapter |
| --- | --- | --- |
| Repositories (data) | D1 | Drizzle / PostgreSQL |
| Event hubs | Durable Objects | In-memory / HTTP WebSocket |
| Durable execution | Cloudflare Workflows | pg-boss |
| Agent jobs | Cloudflare Containers | Self-hosted [runner pool](../deploy/runner-pools.md) (Docker / Kubernetes / custom) |

The chosen adapters are wired in at startup, following a hexagonal flow: controllers to services to
ports, with infra adapters plugged in at the edges. The execution machinery is shared, so both
runtimes run container agents: on Cloudflare via per-run Containers, on Node by dispatching to a
registered [runner pool](../deploy/runner-pools.md).

## Extending a deployment

When you assemble your own deployment you can mix in capabilities without forking the platform:
additional model providers (e.g. AWS Bedrock), custom agent kinds with their own prompts,
and predefined pipelines that seed into every new workspace. These are opt-in, and the stock
deployment ships with none of them, so an organization can layer in proprietary agents while
tracking upstream.

## Durable execution model

- A durable executor (Cloudflare Workflows or pg-boss) checkpoints step completions.
- Per-run containers execute coding work asynchronously.
- A Durable Object per workspace collects all run events.
- WebSocket connections push the event stream to connected clients.
- State changes are broadcast immediately, with no polling.

## Real-time event streaming

Each workspace has an event hub (a Durable Object, or in-memory on Node.js). Events include:

- Step transitions
- Subtask updates
- Decision prompts
- Failures
- Spend notifications

Clients subscribe when a board opens and unsubscribe when it closes. A persistent event log
is retained for debugging.

## Observability

- LLM call metering feeds spend tracking, including cached prompt tokens and the per-run
  prompt-cache hit rate. Prompts are stored as deltas (only the appended messages each call,
  not the re-sent prefix) and rebuilt on export.
- Container execution time and resource usage are captured.
- Step duration and retry attempts are counted.
- GitHub API quota is monitored.
- Decision prompt response times are recorded.

The dashboard surfaces live run execution, decision-prompt forms, a spend gauge, searchable
historical logs, and access to container/job logs.

## Agent isolation

The agent that runs in a per-run container never holds your credentials, never connects to your
linked systems, and never pushes to GitHub itself. It reads and edits a single checkout; trusted
backend code does everything else. Outbound calls go through the backend, never the container
directly: an LLM proxy meters every model call without a provider key entering the sandbox, and the
short-lived GitHub token a run uses lives in the harness, not the model.

See [Agent Isolation Model](./agent-isolation.md) for the full treatment of the trust boundary, the
narrow pathways in and out, and what the model never gets.

## Multi-tenant isolation

- GitHub identity is the primary user credential.
- Organization membership determines workspace access.
- Repositories and credentials are isolated per workspace.
- Budgets are segregated by organization.
- Prompt-fragment visibility is configurable by scope.

## In-org shared services

A service is account-owned and keyed independently of any one workspace, so the same service
(its blocks, state, runs) is one shared copy that several workspaces in an org can
[mount](../guide/shared-services.md). Two mechanisms keep shared boards consistent: a block's live
events are fanned out to every workspace that mounts its service, and GitHub sync is
deduplicated to once per repo per org, then distributed to each linked workspace.

---

See also: [Integration Manifests](./manifests.md) for the runner-pool and environment-provider
surfaces you author.
