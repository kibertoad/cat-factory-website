# Deploy to Node.js

Prefer to run on your own infrastructure? Cat Factory ships a runtime-neutral backend that
runs as a standard Node.js service backed by PostgreSQL, with the same HTTP API as the
Cloudflare deployment.

::: tip Just evaluating?
To try the whole product on one machine with Docker and a GitHub token, see
[Run Locally](./local.md). It is the same runtime wired for a developer machine.
:::

## Your deployment project

As with the [Cloudflare deployment](./cloudflare.md#your-deployment-project), you assemble a small
project on top of the published libraries: a thin package that depends on `@cat-factory/node-server`
and calls its `start()`, plus your own `.env` and (if you containerize) a `Dockerfile`. To scaffold
it, copy the `deploy/node` example directory, swap its `workspace:*` dependency for the published
npm version, and point the config at your resources. You can layer in
[proprietary agents and providers](../reference/architecture.md#extending-a-deployment) the same way.
For a step-by-step on the workspace layout, the local dev loop, and where custom code plugs in, see
[Your Deployment Repository](./deployment-repository.md).

## Prerequisites

- Node.js 24+, required for native type stripping and `--env-file` support.
- A PostgreSQL database.
- Your own deployment project (see above), depending on the published `@cat-factory/node-server`.
- A GitHub App for authentication and repository operations (see [GitHub App](./github-app.md)).
- LLM provider API keys.
- A container runtime (Docker/Kubernetes/your scheduler) for per-run coding jobs.

## Run directly with Node.js

From your deployment project:

```bash
cp .env.example .env
# Configure: DATABASE_URL, authentication, model keys
pnpm start
```

The schema migrates on boot, and the service listens on port 8787 by default.

## Run with Docker

```bash
docker build -t cat-factory-node .

docker run --rm -p 8787:8787 \
  --env-file .env \
  cat-factory-node
```

## How the Node.js runtime differs

The backend is runtime-neutral through port abstraction: the same `@cat-factory/server` HTTP
layer serves both targets, and a conformance suite validates feature parity. The
infrastructure adapters differ:

| Concern | Cloudflare | Node.js |
| --- | --- | --- |
| **Database** | D1 | PostgreSQL (via Drizzle) |
| **Durable execution** | Cloudflare Workflows | pg-boss |
| **Event streaming** | Durable Objects | HTTP WebSocket support |
| **Run jobs** | Cloudflare Containers | Self-hosted [runner pool](./runner-pools.md) |

## Running coding agents

The Node runtime has no built-in per-run container. Inline agent kinds (architect, reviewer,
…) work out of the box, but the repo-operating kinds (coder, mocker, blueprints, ci-fixer,
conflict-resolver, merger, spec-writer, analysis) need a [runner pool](./runner-pools.md) to
run in. Container execution turns on once the deployment has the GitHub App credentials, a public
URL, a session secret, and a runner-pool encryption key configured. Until then, container kinds
fail loudly rather than faking success. See [Configuration](./configuration.md#node-container-execution).

## Node.js topology

```
┌─────────────────────────────────────┐
│ Node.js HTTP Service (port 8787)    │
│ ├─ @cat-factory/node-server         │
│ ├─ PostgreSQL database              │
│ ├─ pg-boss job queue                │
│ └─ HTTP WebSocket support           │
└──────────────┬──────────────────────┘
               │ spawn container jobs
┌──────────────▼──────────────────────┐
│ Docker / Kubernetes / Custom Runner │
│ executor-harness container image    │
│ → coding agent execution            │
└─────────────────────────────────────┘
```

For self-hosted execution at scale, point the service at a runner pool. See
[Runner Pools](./runner-pools.md).

---

Next: set your secrets and toggles in [Configuration](./configuration.md).
