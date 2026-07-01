# Run Locally

Local mode runs the whole product on one machine: the orchestrator as a Node process, each agent
job as a local Docker container, GitHub or GitLab through a personal access token, and persistence on
a local PostgreSQL. It is the fastest way to try Cat Factory end to end, and unlike a pure dev setup
it does real work: agent containers clone, commit, and push to real repositories, CI gates on real
GitHub Actions, and PRs (or GitLab merge requests) merge for real.

Use it for evaluation, demos, and single-operator workflows. For a shared or production deployment,
use [Cloudflare](./cloudflare.md) or [Node.js](./nodejs.md).

## How it differs from the Node.js deployment

Local mode is the same runtime-neutral backend as the [Node.js deployment](./nodejs.md), wired for a
developer machine instead of a server:

| Concern | Node.js deployment | Local mode |
| --- | --- | --- |
| **Agent jobs** | Self-hosted [runner pool](./runner-pools.md) | Local containers (Docker, Podman, OrbStack, Colima, or Apple `container`) |
| **Source-control access** | GitHub App (per-installation tokens) | A personal access token (`GITHUB_PAT`, or `GITLAB_PAT` for GitLab) |
| **Sign-in** | Real OAuth sessions | Sign in with the configured PAT, or email/password. See [Signing in](#signing-in). |
| **Database** | Your PostgreSQL | A local PostgreSQL (docker-compose) |

## Prerequisites

- Node.js 24+.
- A [container runtime](#choosing-a-container-runtime) running locally, used both for the
  PostgreSQL service and for agent jobs. Docker is the default; Podman, OrbStack, Colima, and Apple's
  `container` are also supported.
- A source-control personal access token for the repositories you want agents to work in. For
  GitHub, a fine-grained token scoped to those repos with **contents: write** and
  **pull-requests: write** is recommended; for GitLab, a token with the **api** scope. The same token
  is how you [sign in](#signing-in).
- Stable `ENCRYPTION_KEY` and `AUTH_SESSION_SECRET` values. Local mode requires both and fails to boot
  without them; generate the pair with `pnpm secrets` (run in `deploy/local`). See
  [Configuration](#configuration).
- The executor-harness image. Leave `LOCAL_HARNESS_IMAGE` unset and the version-matched image is
  pulled at boot automatically; see [The executor-harness image](#the-executor-harness-image). It is
  published to both [GHCR](https://github.com/kibertoad/cat-factory/pkgs/container/cat-factory-executor)
  (`ghcr.io/kibertoad/cat-factory-executor`) and
  [Docker Hub](https://hub.docker.com/r/kibertoad/cat-factory-executor)
  (`docker.io/kibertoad/cat-factory-executor`), or you can build it locally.
- A way to serve models (see [Models in local mode](#models-in-local-mode)). Local mode ships with
  **no** model provider configured, so the picker is empty until you set one up: connect a provider
  key in the UI, point it at Cloudflare Workers AI, or add a local runner.

## Bootstrap with the CLI

The fastest way to a runnable local deployment is `@cat-factory/cli`, which scaffolds a standalone
project on the **published** libraries (no monorepo checkout needed) in one command:

```bash
npm create @cat-factory/cli@latest      # or: pnpm dlx @cat-factory/cli, npx @cat-factory/cli
```

It asks for a project name, lets you pick the source-control provider (GitHub or GitLab) and
[container runtime](#choosing-a-container-runtime), generates the crypto secrets in the formats the
server needs (`AUTH_SESSION_SECRET` as hex, `ENCRYPTION_KEY` as base64), mints a PAT by opening the
provider's token page with the right scopes pre-selected and reading the token you paste back, and
writes the populated, git-ignored `.env` files. Drive it non-interactively with flags (`--yes`,
`--provider`, `--token`, `--db-url`, `--container-runtime`, …) for scripts or CI. The generated
`README.md` lists the remaining steps (pull the executor image, configure a model provider) with your
chosen values. See [`@cat-factory/cli`](../reference/packages.md).

After scaffolding, run the backend and frontend:

```bash
cd <dir>/local && npm install && npm run db:up && npm start     # backend on :8787
cd ../frontend && npm install && npm run dev                    # SPA on :3000
```

## Quick start (from the repo)

To run from a clone of the `deploy/local` example directory instead:

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
pnpm secrets   # prints ENCRYPTION_KEY + AUTH_SESSION_SECRET to paste in
# Set GITHUB_PAT (or GITLAB_PAT) and LOCAL_HARNESS_IMAGE; add a model key if you want a specific provider

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
| `LOCAL_HARNESS_IMAGE` | no | The executor-harness image run per agent job. Optional: unset, it defaults to the version-matched image the backend recommends, which is pulled at boot (see [The executor-harness image](#the-executor-harness-image)). Set it to pin a specific tag or digest, or to a bare local tag you build yourself. |
| `LOCAL_HARNESS_IMAGE_REFRESH` | no | Set to `off` (or `false`/`0`/`no`/`none`/`disabled`) to skip the boot-time image pull. Any other value keeps the default refresh on. |
| `ENCRYPTION_KEY` | yes | Base64 key (≥ 32 bytes decoded) sealing UI-connected credentials (provider keys, subscriptions, local runners) at rest. Required and must stay stable: a fresh key each boot orphans every credential sealed under the previous one, and boot fails loudly when it is unset. Generate it with `pnpm secrets`. |
| `AUTH_SESSION_SECRET` | yes | Signs the session token. Required and must stay stable: a fresh value each boot invalidates your session and forces a re-login. Generate it with `pnpm secrets`. |
| `GITHUB_PAT` | one of | Personal access token agent containers use to clone, push branches, and open PRs, and the credential you [sign in](#signing-in) with. |
| `GITLAB_PAT` | one of | GitLab personal access token (scope `api`). Drives clone/push, the CI gate, merge-request creation and merge, and GitLab sign-in. Set at least one of `GITHUB_PAT` / `GITLAB_PAT`. |
| `GITLAB_API_BASE` | no | GitLab REST v4 base for a self-managed instance, e.g. `https://gitlab.example.com/api/v4`. |
| `PORT` | no | Listen port. Defaults to 8787. |
| `LOCAL_CONTAINER_RUNTIME` | no | Which runtime to use: `docker` (default), `podman`, `orbstack`, `colima`, or `apple`. See [Choosing a container runtime](#choosing-a-container-runtime). |
| `LOCAL_DOCKER_BINARY` | no | Override the CLI binary the runtime profile selects, e.g. a non-default `podman` path. |
| `LOCAL_DOCKER_NETWORK` | no | Attach job containers to a specific Docker network (Docker-family runtimes). |
| `LOCAL_DOCKER_ADD_HOST_GATEWAY` | no | Add the `host-gateway` host alias on Linux. Defaults per runtime (`true` for Docker/Podman/OrbStack, `false` for Colima). |
| `LOCAL_DOCKER_PRIVILEGED_TEST_JOBS` | no | Run Tester jobs privileged so they can stand up docker-compose infra (Docker-in-Docker). Defaults to `true`; set `false` for rootless Podman. |
| `LOCAL_HARNESS_HOST_ALIAS` | no | Override the hostname agent containers use to reach the LLM proxy. Defaults per runtime (see the table below). |
| `CAT_FACTORY_STATE_DIR` | no | Where local mode keeps its state directory. Defaults to `~/.cat-factory`. |
| `AUTH_PASSWORD_ENABLED` | no | Offer email/password sign-in. On by default in local mode. |
| `AUTH_OPEN_SIGNUP` | no | Allow creating a local account with no invite. On by default in local mode. |
| `AUTH_DEV_OPEN` | no | Keep the API open for unauthenticated reads. Defaults to `true`; see [A note on security](#a-note-on-security). |

Model keys, observability, and Slack work exactly as in the
[shared configuration reference](./configuration.md).

## The executor-harness image

`LOCAL_HARNESS_IMAGE` is optional. Unset, local mode runs the executor-harness image that matches the
backend version and refreshes it at boot, so a fresh checkout runs a compatible harness with no manual
pull:

- A **registry ref** (e.g. `ghcr.io/kibertoad/cat-factory-executor:1.27.6`) is pulled at boot so a
  mutable tag stays current. If the registry is unreachable, boot falls back to the local copy.
- A **digest-pinned ref** (`…@sha256:…`) is already immutable, so the pull is a fast no-op.
- A **bare local tag** (e.g. `cat-factory-executor:local`) is checked for presence; the boot log
  reminds you to rebuild it after harness changes with
  `docker build -t cat-factory-executor:local backend/internal/executor-harness`.

Set `LOCAL_HARNESS_IMAGE_REFRESH=off` to skip the boot pull. The refresh is skipped on the Apple
`container` runtime (its CLI differs); refresh that image out of band.

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

To run agents and previews on a local Kubernetes cluster instead, use the native **Kubernetes**
backends. The `cat-factory k3s` command provisions a local k3d/kind/k3s cluster, wires least-privilege
access, and hands off to the app to fill the connect form. See
[Kubernetes → Local k3s guided setup](./kubernetes.md#local-k3s-guided-setup).

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
Local mode reaches source control through `GITHUB_PAT` (or `GITLAB_PAT`) and has no GitHub App connect
flow, so without one every repo-operating step (clone, push, open PR or MR, CI gate, merge) is bound to
fail at runtime. If you boot without one, Cat Factory does not leave you guessing: it logs a warning
with a click-through token-creation link (scopes pre-selected) and shows the same one-click link as a
dismissible banner over the board. Create the token, set the variable, and restart.
:::

## Signing in

Local mode requires sign-in. Per-user features (personal subscriptions, your own provider keys) need
a real identity to attach to, so the SPA shows a login screen rather than running anonymous. You sign
in one of two ways:

- **With the configured PAT** (recommended). When `GITHUB_PAT` or `GITLAB_PAT` is set, the login
  screen shows a one-click "Sign in with configured GitHub/GitLab PAT" button, and the token's account
  becomes your identity. The token stays on the server; it is never typed into or shown in the browser.
  Your choice is remembered, so a refresh, and a server restart, keep you signed in (the
  `AUTH_SESSION_SECRET` is stable, so the session survives reboots).
- **With email and password**. On by default in local mode with open signup, so you can create a local
  account with no invite. Turn signup off with `AUTH_OPEN_SIGNUP=false` and password sign-in off with
  `AUTH_PASSWORD_ENABLED=false`.

The API itself still serves unauthenticated reads under `AUTH_DEV_OPEN=true`; a real session is what
unlocks the per-user features. With no PAT configured, the login screen shows scopes-preset
token-creation links for GitHub and GitLab so you can mint one.

## GitLab in local mode

Local mode treats GitLab as a first-class source-control backend, not just a sign-in provider. Set
`GITLAB_PAT` (scope `api`; add `GITLAB_API_BASE` for a self-managed instance) and a GitLab repo gets
the same flow a GitHub repo does: the agent containers clone and push with the token, the CI gate
reads pipeline status, mergeability and the real merge run against GitLab, and the executor opens a
real **merge request** (reusing an open one on a resumed run). The provider is picked per repo from
the clone-URL host, so a deployment can drive both.

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
`linkRepo` helper still works and points at the same place. A `GITLAB_PAT` links GitLab repositories
the same way. After linking, [run pipelines](../guide/running-pipelines.md) as usual.

---

Next: set your model keys and toggles in [Configuration](./configuration.md).
