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
- A way to serve models (see [Models in local mode](#models-in-local-mode)). Local mode ships with
  **no** model provider configured, so the picker is empty until you set one up — connect a provider
  key in the UI, point it at Cloudflare Workers AI, or add a local runner.

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

## Models in local mode

A stock local install configures no model provider, so nothing is selectable until you set one up.
You have three options, in rough order of "no cloud account needed":

- **Your own local LLM** — the natural fit for local mode. Run Ollama, LM Studio, llama.cpp, or
  vLLM on the same machine and add it under **Settings → My local runners**; the enabled models
  appear in the picker with no key and no spend. See
  [Running on a local LLM](../guide/model-providers.md#running-on-a-local-llm-ollama-lm-studio).
- **A provider key or subscription** — connect an OpenAI/Anthropic/etc. key, or your personal
  Claude/GLM/Codex subscription, in the UI exactly as on a hosted deployment. See
  [Model Providers & Subscriptions](../guide/model-providers.md).
- **Cloudflare Workers AI over REST** — off-Worker there is no `AI` binding, so Workers AI is served
  through Cloudflare's REST API and is gated on **`CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`**
  (mint a Workers AI API token; find the account id with `wrangler whoami`). Set both and the
  `workers-ai` models become selectable.

::: tip Forgot the PAT?
Local mode reaches GitHub through `GITHUB_PAT` and has no GitHub App connect flow, so without it
every repo-operating step (clone, push, open PR, CI gate, merge) is bound to fail at runtime. If you
boot without one, Cat Factory does not leave you guessing: it logs a warning with a click-through
GitHub token-creation link (scopes `repo` and `workflow` pre-selected) and shows the same one-click
link as a dismissible banner over the board. Create the token, set `GITHUB_PAT`, and restart.
:::

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

Local mode discovers repositories through your `GITHUB_PAT` rather than a GitHub App installation.
With a PAT set, the **Add from existing repo** board flow works just like on a hosted deployment: the
picker lists your repos (via `/user/repos`), with a search/filter box for accounts that expose many,
and importing links and syncs the repo behind a service frame. The PAT's `repo` and `workflow`
scopes light the flow up — CLI- and UI-linked repos share one synthetic installation, so the
`linkRepo` helper still works and points at the same place. After linking, [run
pipelines](../guide/running-pipelines.md) as usual.

---

Next: set your model keys and toggles in [Configuration](./configuration.md).
