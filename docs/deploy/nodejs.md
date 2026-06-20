# Deploy to Node.js

Prefer to run on your own infrastructure? Cat-Factory ships a **runtime-neutral backend** that
runs as a standard Node.js service backed by PostgreSQL, with the **same HTTP API** as the
Cloudflare deployment.

## Prerequisites

- **Node.js 24+** — required for native type stripping and `--env-file` support.
- A **PostgreSQL** database.
- A **GitHub App** for authentication and repository operations.
- **LLM provider API keys**.
- A container runtime (Docker/Kubernetes/your scheduler) for per-run coding jobs.

## Run directly with Node.js

```bash
cd deploy/node
cp .env.example .env
# Configure: DATABASE_URL, authentication, model keys
pnpm start
```

The service listens on port **8787** by default.

## Run with Docker

```bash
docker build -f deploy/node/Dockerfile -t cat-factory-node .

docker run --rm -p 8787:8787 \
  --env-file deploy/node/.env \
  cat-factory-node
```

## How the Node.js runtime differs

The backend is runtime-neutral through **port abstraction** — the same `@cat-factory/server` HTTP
layer serves both targets, and a conformance suite validates feature parity. The
infrastructure adapters differ:

| Concern | Cloudflare | Node.js |
| --- | --- | --- |
| **Database** | D1 | PostgreSQL (via Drizzle) |
| **Durable execution** | Cloudflare Workflows | pg-boss |
| **Event streaming** | Durable Objects | HTTP WebSocket support |
| **Run jobs** | Cloudflare Containers | Self-hosted [runner pool](./runner-pools.md) |

## Running coding agents

The Node runtime has **no built-in per-run container**. Inline agent kinds (architect, reviewer,
…) work out of the box, but the repo-operating kinds (coder, mocker, blueprints, ci-fixer,
conflict-resolver, merger, requirements-writer, analysis) need a [runner pool](./runner-pools.md) to
run in. Container execution turns on once the deployment has the GitHub App credentials, a public
URL, a session secret, and a runner-pool encryption key configured; until then, container kinds
**fail loudly** rather than faking success. See [Configuration](./configuration.md#node-container-execution).

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

For self-hosted execution at scale, point the service at a **runner pool** — see
[Runner Pools](./runner-pools.md).

---

Next: set your secrets and toggles in [Configuration](./configuration.md).
