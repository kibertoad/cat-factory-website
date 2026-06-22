# Run Locally

Local mode runs the whole product on one machine: the orchestrator as a Node process, each agent
job as a local Docker container, GitHub through a personal access token, and persistence on a local
PostgreSQL. It is the fastest way to try Cat Factory end to end, and unlike a pure dev setup it does
real work: agent containers clone, commit, and push to real repositories, CI gates on real GitHub
Actions, and PRs merge for real.

Use it for evaluation, demos, and single-operator workflows. For a shared or production deployment,
use [Cloudflare](./cloudflare.md) or [Node.js](./nodejs.md).

## How it differs from the Node.js deployment

Local mode is the same runtime-neutral backend as the [Node.js deployment](./nodejs.md), wired for a
developer machine instead of a server:

| Concern | Node.js deployment | Local mode |
| --- | --- | --- |
| **Agent jobs** | Self-hosted [runner pool](./runner-pools.md) | Local Docker / Podman containers |
| **GitHub access** | GitHub App (per-installation tokens) | A personal access token (`GITHUB_PAT`) |
| **Auth gate** | Real GitHub OAuth sessions | Open by default (`AUTH_DEV_OPEN=true`) |
| **Database** | Your PostgreSQL | A local PostgreSQL (docker-compose) |

## Prerequisites

- Node.js 24+.
- Docker (or Podman) running locally, used both for the PostgreSQL service and for agent jobs.
- A GitHub personal access token for the repositories you want agents to work in. A fine-grained
  token scoped to those repos with **contents: write** and **pull-requests: write** is recommended.
- The executor-harness image, either pulled from GHCR or built locally.
- At least one model provider key, or rely on the default Cloudflare Workers AI routing.

## Quick start

From the `deploy/local` example directory:

```bash
# 1. Start PostgreSQL
docker compose up -d

# 2. Build (or pull) the executor-harness image
docker build -t cat-factory-executor:local backend/internal/executor-harness

# 3. Configure
cp .env.example .env
# Set GITHUB_PAT and LOCAL_HARNESS_IMAGE; add a model key if you want a specific provider

# 4. Run
pnpm start
```

The schema migrates on boot and the service listens on port 8787. Agent containers reach the
backend's LLM proxy at `http://host.docker.internal:<PORT>`, so no provider key ever enters a job
container.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string (the docker-compose service). |
| `LOCAL_HARNESS_IMAGE` | yes | The executor-harness image run per agent job. |
| `GITHUB_PAT` | yes | Personal access token agent containers use to clone, push branches, and open PRs. |
| `PORT` | no | Listen port. Defaults to 8787. |
| `LOCAL_DOCKER_BINARY` | no | Container CLI to use, e.g. `podman`. Defaults to `docker`. |
| `LOCAL_DOCKER_NETWORK` | no | Attach job containers to a specific Docker network. |
| `LOCAL_DOCKER_ADD_HOST_GATEWAY` | no | Add the `host.docker.internal` gateway alias on Linux. Defaults to `true`. |
| `LOCAL_DOCKER_PRIVILEGED_TEST_JOBS` | no | Run Tester jobs privileged so they can stand up docker-compose infra (Docker-in-Docker). Defaults to `true`. |

Model keys, observability, and Slack work exactly as in the
[shared configuration reference](./configuration.md).

## A note on security

With the auth gate open, the server binds to all interfaces so that agent containers on native
Linux Docker can reach the LLM proxy through the bridge gateway. That means anyone on your network
can reach the API. Two ways to lock it down:

- Close the gate: set `AUTH_DEV_OPEN=false` and configure a real session secret.
- Bind to loopback: set `HOST=127.0.0.1`.

::: warning Loopback breaks native Linux Docker
`HOST=127.0.0.1` is fine on Docker Desktop (`host.docker.internal` still resolves to the host) but
not on native Linux Docker, where job containers reach the proxy via the bridge gateway IP. On
native Linux, keep the default bind and close the gate instead.
:::

## Linking repositories

Local mode discovers repositories through your `GITHUB_PAT` rather than a GitHub App installation,
so the `linkRepo` helper seeds the repository projections from the token. After that, [link a
repository](../guide/repositories.md) to a service and run pipelines as usual.

---

Next: set your model keys and toggles in [Configuration](./configuration.md).
