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
| **Agent jobs** | Self-hosted [runner pool](./runner-pools.md) | Local containers (Docker, Podman, OrbStack, Colima, or Apple `container`) |
| **GitHub access** | GitHub App (per-installation tokens) | A personal access token (`GITHUB_PAT`) |
| **Auth gate** | Real GitHub OAuth sessions | Open by default (`AUTH_DEV_OPEN=true`) |
| **Database** | Your PostgreSQL | A local PostgreSQL (docker-compose) |

## Prerequisites

- Node.js 24+.
- A [container runtime](#choosing-a-container-runtime) running locally, used both for the
  PostgreSQL service and for agent jobs. Docker is the default; Podman, OrbStack, Colima, and Apple's
  `container` are also supported.
- A GitHub personal access token for the repositories you want agents to work in. A fine-grained
  token scoped to those repos with **contents: write** and **pull-requests: write** is recommended.
- The executor-harness image, either pulled from a registry or built locally. It is published to
  both [GHCR](https://github.com/kibertoad/cat-factory/pkgs/container/cat-factory-executor)
  (`ghcr.io/kibertoad/cat-factory-executor`) and
  [Docker Hub](https://hub.docker.com/r/kibertoad/cat-factory-executor)
  (`docker.io/kibertoad/cat-factory-executor`). Pull whichever your runtime prefers.
- A way to serve models (see [Models in local mode](#models-in-local-mode)). Local mode ships with
  **no** model provider configured, so the picker is empty until you set one up: connect a provider
  key in the UI, point it at Cloudflare Workers AI, or add a local runner.

## Quick start

From the `deploy/local` example directory:

```bash
# 1. Start PostgreSQL
docker compose up -d

# 2. Build the executor-harness image locally...
docker build -t cat-factory-executor:local backend/internal/executor-harness
#    ...or pull a published one (GHCR or Docker Hub):
#    docker pull ghcr.io/kibertoad/cat-factory-executor:latest
#    docker pull docker.io/kibertoad/cat-factory-executor:latest

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
| `LOCAL_CONTAINER_RUNTIME` | no | Which runtime to use: `docker` (default), `podman`, `orbstack`, `colima`, or `apple`. See [Choosing a container runtime](#choosing-a-container-runtime). |
| `LOCAL_DOCKER_BINARY` | no | Override the CLI binary the runtime profile selects, e.g. a non-default `podman` path. |
| `LOCAL_DOCKER_NETWORK` | no | Attach job containers to a specific Docker network (Docker-family runtimes). |
| `LOCAL_DOCKER_ADD_HOST_GATEWAY` | no | Add the `host-gateway` host alias on Linux. Defaults per runtime (`true` for Docker/Podman/OrbStack, `false` for Colima). |
| `LOCAL_DOCKER_PRIVILEGED_TEST_JOBS` | no | Run Tester jobs privileged so they can stand up docker-compose infra (Docker-in-Docker). Defaults to `true`; set `false` for rootless Podman. |
| `LOCAL_HARNESS_HOST_ALIAS` | no | Override the hostname agent containers use to reach the LLM proxy. Defaults per runtime (see the table below). |
| `ENCRYPTION_KEY` | no | Seals UI-connected credentials (provider keys, subscriptions, local runners) at rest. In local mode a per-process key is generated when this is unset, so the app boots without it, but those credentials are then lost on every restart. Set a stable `ENCRYPTION_KEY` (`openssl rand -base64 32`) to keep them across restarts. |

Model keys, observability, and Slack work exactly as in the
[shared configuration reference](./configuration.md).

## Choosing a container runtime

Set `LOCAL_CONTAINER_RUNTIME` to pick how agent jobs and PostgreSQL run. There is no auto-detection:
an unset or unrecognized value falls back to `docker` (logged as a misconfiguration at boot). At
startup Cat Factory logs the resolved runtime, its CLI binary, the host alias, and whether
Docker-in-Docker is available, so you can confirm the choice took effect.

| Runtime | CLI binary | Reaches the proxy via | Docker-in-Docker | Notes |
| --- | --- | --- | --- | --- |
| `docker` | `docker` | `host.docker.internal` | yes | The default. Docker Desktop or Docker Engine. |
| `podman` | `podman` | `host.docker.internal` | yes | Image refs must be fully qualified (`ghcr.io/…`, `localhost/…`). For rootless Podman set `LOCAL_DOCKER_PRIVILEGED_TEST_JOBS=false`. |
| `orbstack` | `docker` | `host.docker.internal` | yes | Drop-in `docker` CLI; nothing else to configure. |
| `colima` | `docker` | `host.lima.internal` | yes | Runs dockerd inside a Lima VM. If the harness can't reach the proxy, set `PUBLIC_URL` or `LOCAL_HARNESS_HOST_ALIAS` to your machine's LAN IP. |
| `apple` | `container` | `192.168.64.1` | **no** | macOS Apple `container` CLI; one lightweight VM per container. See the Tester limitation below. |

::: warning Apple `container` can't run the Tester's local infra
The `apple` runtime has no Docker-in-Docker, so the **Tester** cannot stand up local docker-compose
infrastructure. Tasks must either use an [ephemeral environment](./environments.md) or be marked as
having no infra dependencies; the boot log warns about this when the `apple` runtime is selected.
:::

Whatever the runtime, agent containers reach the backend's LLM proxy through a host alias rather than
a baked-in key. If that alias doesn't route on your machine, override it with `PUBLIC_URL` or
`LOCAL_HARNESS_HOST_ALIAS` (commonly your LAN IP).

## Delegating infrastructure off the host

By default local mode does everything on the host container runtime: agent jobs run as local
containers and the Tester stands up its dependencies with Docker-in-Docker. A workspace can opt out
of either, **independently**, and hand that work to an external service instead. Both toggles live on
the **Ephemeral environments** screen (local mode only) and each lights up only once its provider is
registered:

- **Delegate agents to a runner pool**: container agent jobs dispatch to the registered
  [runner pool](./runner-pools.md) instead of host Docker. With the toggle on and no pool registered,
  a run is refused at start with a clear message (register a pool first) rather than an opaque error.
- **Delegate the test environment to a provider**: flips the local-mode **default** Tester
  environment from local (host DinD) to ephemeral, provisioned through your registered
  [environment provider](./environments.md). Per-service and per-task choices still win over the
  default. An ephemeral run is refused at start if the toggle is on with no provider connected.

Both default off. A single wrapper package can implement the `EnvironmentProvider` and
`RunnerPoolProvider` ports together (Kargo, for example) to serve both concerns; see
[Custom Providers](./custom-providers.md). Ephemeral environments are enabled by default in local
mode (`ENVIRONMENTS_ENABLED=true`), and an un-pinned Tester task defaults to the local environment
until you delegate.

## Models in local mode

A stock local install configures no model provider, so nothing is selectable until you set one up.
You have several options, in rough order of "no cloud account needed":

- **Your own local LLM** is the natural fit for local mode. Run Ollama, LM Studio, llama.cpp, or
  vLLM on the same machine and add it under **Settings → My local runners**; the enabled models
  appear in the picker with no key and no spend. See
  [Running on a local LLM](../guide/model-providers.md#running-on-a-local-llm-ollama-lm-studio).
- **A provider key or subscription**: connect an OpenAI/Anthropic/etc. key, or your personal
  Claude/GLM/Codex subscription, in the UI exactly as on a hosted deployment. See
  [Model Providers & Subscriptions](../guide/model-providers.md).
- **Cloudflare Workers AI over REST**: off-Worker there is no `AI` binding, so Workers AI is served
  through Cloudflare's REST API and is gated on **`CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`**
  (mint a Workers AI API token; find the account id with `wrangler whoami`). Set both and the
  `workers-ai` models become selectable.
- **AWS Bedrock**: local mode shares the Node runtime's provider setup, so Bedrock registers when
  you set **`BEDROCK_REGION`** plus AWS credentials (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`,
  and `AWS_SESSION_TOKEN` if you use one). `BEDROCK_MODELS` is the comma-separated allow-list
  (`""` allows all). See [Configuration → LLM providers](./configuration.md#llm-providers).

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
scopes light the flow up; CLI- and UI-linked repos share one synthetic installation, so the
`linkRepo` helper still works and points at the same place. After linking, [run
pipelines](../guide/running-pipelines.md) as usual.

---

Next: set your model keys and toggles in [Configuration](./configuration.md).
