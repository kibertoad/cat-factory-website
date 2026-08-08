---
redirectFrom:
  - /deploy/environments.html
---

# Ephemeral Environments

To validate agent-built changes against a running system, Cat Factory can provision ephemeral
preview environments on demand and tear them down when the run finishes.

## What they're for

Tests that need a live instance, such as integration tests, Playwright end-to-end runs, and
acceptance checks, get an isolated environment spun up just for that run, then cleaned up automatically.

## One provisioner: the Deployer

A preview needs two decisions: **what** to stand up and **how/where** to run it. A service owns the
first by declaring a **provision type** (`docker-compose`, `kubernetes`, `custom`, or `infraless`).
The workspace owns the second by mapping each type to a **handler** on the **Test environments** tab.
There is no per-task `local` vs `ephemeral` toggle: a service declares a type and the workspace says
how that type is handled.

A single **Deployer** step provisions the environment. Every step that runs *against* a live system,
the API and UI Testers, the `playwright` acceptance runner, and the human-test gate, consumes what
the Deployer stood up: it reads the environment's coordinates and never provisions its own. So a
pipeline that reaches one of those steps on a `docker-compose`/`kubernetes`/`custom` service must
place a Deployer before it. Cat Factory checks this at start:

- A pipeline that reaches a Tester or human-test step on a provisioned service with no earlier
  Deployer is refused (`deployer_required_before_tester`).
- A `docker-compose`/`kubernetes`/`custom` service whose type has no resolvable workspace handler is
  refused, with a deep link to configure one (an `infraless` service always passes).
- A Deployer whose service config is incomplete for its type is refused up front, naming the missing
  fields and linking to the service's environment config, rather than failing mid-provision.

An `infraless` service (or a task that declares no infra) stands nothing up and runs directly.

## What the Tester receives

When a Tester (or `playwright`) step runs against an ephemeral environment, its prompt carries the
environment's coordinates so the agent can reach it: the live **URL**, and the **host**, **port**, and
**scheme** parsed from it. If the environment exposes an access handle, that is passed too, in one of
three forms: a bearer token, HTTP Basic username/password, or a custom header name and value.

These are the credentials that reach the endpoint (an ingress token or basic-auth pair), treated as
non-sensitive test-environment data and rendered directly into the prompt. They are not application
login accounts, and you should not wire real or production secrets through them.

## Sealed test credentials

For the real secrets a test genuinely needs (an API key a suite calls out with, a seeded login), use
the **Test credentials (sensitive)** panel on a **service frame's inspector** rather than the
environment-access handles above. It is a per-service, write-only editor: add named entries of a
**variable name**, a **description**, and a **value**, then **Save credentials**. Values are
encrypted at rest under [`ENCRYPTION_KEY`](../deploy/configuration.md#credential-encryption) and never read
back (only the name and description return), so the panel hides itself entirely on a deployment with
no encryption key set.

The point is that these secrets reach the Tester **out of band**: at dispatch they are decrypted and
injected into the Tester container as **environment variables** (the agent reads `$YOUR_VAR`), while
the agent's prompt and the run's telemetry only ever see the variable **name and description**, never
the value. Entries resolve up the frame chain to the service frame, and reserved toolchain names
(`PATH`, `NODE_OPTIONS`, `npm_config_*`, …) are refused. Saving **replaces the whole set** for the
service, and Save stays disabled until every row has a value, so an existing secret can't be blanked
by accident. Only wire secrets you can rotate; the warning banner says as much.

## Testing provisioning before a real run

To confirm a service's ephemeral-environment config actually works before a pipeline depends on it,
open the service's inspector and click **Test environment creation** in the environment-provisioning
section. It runs the whole lifecycle against a throwaway branch, streaming each stage live
(**creating branch → provisioning environment → tearing down environment → deleting branch → done**),
and the button turns into **Stop** while it runs. It reports **Test passed** in green when the
environment came up and tore down cleanly and the branch was deleted, or **Test failed** in red
naming the failing stage. The button is disabled on an `infraless` service (there is nothing to
provision) with a hint to configure a provision type first.

The test proves the environment actually stood up, not merely that the create call returned:

- Before it creates anything, it runs the resolved provider's **connection probe**. A connection-level
  problem (a rejected token, a wrong project or endpoint id) is reported up front, carrying the
  provider's own message, with no throwaway branch created and nothing to tear back down. Providers
  that expose no connection test skip this step.
- For a provider whose `provision()` returns before the environment is up, the test **polls its status
  until it reaches ready** and only then tears down. A terminal not-ready status fails the test with
  the provider's reported reason rather than a generic "provisioning failed".
- A service whose provision type resolves to no workspace handler fails with a specific remedy
  (nothing configured, versus an ambiguous match) and a **Configure infrastructure** button that opens
  **Infrastructure → Test environments**.
- A dispatch failure is attributed to the provisioning stage rather than mislabelled as branch
  creation, and is logged server-side with the workspace, run, stage, and the underlying error, so a
  provider throw leaves a trace beyond the run record.

## Configured but dead

Asking whether a connection row exists cannot tell a healthy provider from one that was set up and has
since died, which is how an outage sits unnoticed for a day while every testing agent fails and the
board reports a perfectly healthy setup.

A periodic reachability sweep probes each configured provider and reports **unreachable** as its own
status, distinct from never-configured. The infrastructure banner and the board pick it up live, so a
dead runner pool or environment provider announces itself instead of waiting for the next run to
discover it.

## Seeding handlers from the deployment

A deployment that knows its own infrastructure can declare environment handlers in code, so a
service's provision type resolves without an operator visiting **Infrastructure → Test environments**
first. Pass `seedEnvironmentHandlers` to `start()` or `startLocal()`:

```ts
start({
  buildContainer: buildNodeContainer,
  seedEnvironmentHandlers: [
    {
      provisionType: 'kubernetes',
      config: { /* the handler's engine + connection config */ },
      secrets: { kubeconfig: process.env.PREVIEW_KUBECONFIG! },
    },
  ],
})
```

Each entry takes a `provisionType`, its `config` and write-only `secrets`, an optional `manifestId`
(for a `custom` type keyed to a specific manifest), and an optional `backendKind` to pin a specific
backend that rides a shared engine. Seeding is idempotent by `(provisionType, manifestId)`: the server
ensures each handler exists for every existing workspace at boot and for each newly-created workspace,
and one failing seed never blocks the others. An operator can still edit a seeded handler in the UI.

## Choosing a backend

The **Test environments** tab in the top-level **Infrastructure** window offers several backend kinds.
Pick the one that matches how your previews run:

| Backend | Runtimes | What it does |
| --- | --- | --- |
| **Kubernetes** | all | Applies the repo's own manifests into a per-PR namespace. Native, form-driven. See [Kubernetes](../deploy/kubernetes.md#ephemeral-environments-on-kubernetes). |
| **Docker Compose** | local | Stands the repo's compose file up on the host Docker daemon. See [below](#docker-compose-environments). |
| **HTTP manifest** | all | Drives your own management API through request/response templates. See [below](#registering-an-http-manifest-provider). |
| **Custom code adapter** | Node, local | Implements the `EnvironmentProvider` port when a manifest can't express your platform. See [Custom Providers](../extend/custom-providers.md). |

Which backend a given service uses is decided by its [provision type](#per-service-provision-types),
so one workspace can preview a Kubernetes service and a Compose service side by side.

### A default for new services

A workspace records a **default test environment**: a provision type and, for a custom provider, its
manifest id. Every newly created service frame is stamped with it, so a new service arrives already
routed.

Until an operator chooses one, a banner offers a link to the **Test environments** tab to set it.
Choosing **infraless** is a real answer and silences the banner; leaving it unset is not. The section
preselects the first registered custom provider when the deployment ships one and nothing is stored
yet.

The default is applied at creation only, so changing it never retroactively rewrites an existing
service. A `custom` default with no manifest id is refused, and switching away from `custom` clears
the stale id.

## Per-service provision types

A preview needs two decisions: **what** to stand up and **where/how** to run it. A service owns the
first by declaring a **provision type** (`kubernetes`, `docker-compose`, `custom`, or `infraless`).
The workspace owns the second by mapping each provision type to a **handler** (an engine plus its
connection) on the **Test environments** tab. A `kubernetes` service routes to Local k3s or Remote
Kubernetes, a `docker-compose` service to Local Docker, a `custom` service to its remote-custom
handler. When you add a service from a repo, Cat Factory auto-detects a recommended provisioning
config (manifest roots, overlays, monorepo slices) and offers candidates to accept or change. In a
monorepo it finds the service's own manifest slice inside a `base`/`overlays`/per-service layout and
no longer offers the service's source directory (one carrying a Backstage `catalog-info.yaml`, say)
as a bogus deploy target. Point it at non-standard house layouts through the `manifestDirs` and
`serviceManifestPaths` keys of `ENVIRONMENTS_DETECTION_CONVENTIONS`. The full model, including custom
manifest types and the generate/fix repair agent, is on the
[Kubernetes](../deploy/kubernetes.md#per-service-provision-types) page.

## Docker Compose environments

In [local mode](../deploy/local.md), select the **Docker Compose** backend to stand a service up from the
compose file already in its repo, on the host Docker daemon. It reads the PR repo's compose file,
rewrites it into a per-PR project with isolated host ports, runs `docker compose up -d --wait`, and
returns `http://localhost:<port>` as the preview URL. Teardown runs `docker compose down -v`.

| Field | Purpose |
| --- | --- |
| **Service** | The service key in the compose file to target (it must publish its port). |
| **Port** | The container port that service publishes. |
| **Compose path** | The compose file's path relative to the repo root. |
| **Image template** | Optional. A CI-built image tag to substitute in. |
| **Env template** | Optional. Extra env vars passed to `docker compose up`. |
| **Scheme** | Optional. `http` (default) or `https`. |
| **Default TTL** | Optional. Fallback lifetime for auto-teardown. |

Build contexts, host bind mounts, relative `env_file`s, and privileged services are rejected: the
compose stack is meant for preview, not to mirror production. It needs a host Docker daemon, so it is
local-mode only.

### Building from source

Some repos build their own images from Dockerfiles rather than pulling published ones. Set the
compose backend's **Image source** field to **Build from source (clone the PR head)** for those. In
build mode the provider clones the PR head, runs `docker compose build` before `up`, and relaxes the
three restrictions a checkout makes safe: `build:` contexts, in-checkout relative bind mounts, and
relative `env_file`s. Host-escaping binds and `privileged` services are still rejected. A separate
**Build timeout** (default 15 minutes) bounds the build, apart from the health-wait budget. Building a
private base image still needs `docker login` on the host; the provider doesn't manage registry auth.
Like the rest of Compose, build mode needs a host Docker daemon and is local-mode only.

## The environment setup wizard

For anything past a single compose file with published images, configure the compose handler through
the **environment setup wizard** rather than the raw form. Reach it from the sidebar
(**Environment setup**) or the nudge on a docker-compose service's inspector. It walks a service
frame through: **detect** (read the repo and prefill a recipe), an optional **deep analysis** pass,
**preflight** checks, **save** (registers the workspace's `docker-compose` handler and writes the
recipe onto the frame), and an optional **trial provision** you watch live. Nothing detected or
drafted is applied until you save it, so the wizard only ever proposes.

## Stack recipes

A plain `composePath` handles a simple repo. A **stack recipe** describes a more involved bring-up
declaratively, so a repo that needs layered compose files, profiles, materialized env files, or seed
steps still provisions without bespoke code. A recipe extends a `docker-compose` service's config
with any of:

| Field | What it does |
| --- | --- |
| **Compose files** | An ordered list of `-f` layers (base plus overrides), replacing a single `composePath`. |
| **Compose profiles** | `COMPOSE_PROFILES` to activate for the project. |
| **Env files** | Committed templates (for example `.env.dev.local-dist`) materialized into git-ignored targets inside the checkout before `up`. |
| **External networks** | Networks the project expects to already exist. |
| **Shared stack refs** | Ids of [shared stacks](#shared-stacks) that must be up first. |
| **Setup steps** | Ordered post-`up` steps: `compose-exec` (optionally piping a `.sql` seed on stdin), `copy-file`, `wait-http`, `wait-file`, `host-command`, each with an optional timeout. |
| **Health gate** | The terminal readiness check: compose health (the default), an HTTP probe, or a `compose-exec` command. |
| **Prerequisites** | [Preflight checks](#preflight-checks) re-run at provision start. |

Detection reads the repo checkout-free (no clone, no host daemon) and produces a **non-binding**
recommendation: it layers `*.override.yml`, points `external: true` networks at a shared-stack nudge,
turns `*-dist`/`.example` templates into env-file entries, and flags `*.sql` seed dumps and a
`Makefile`/`bin/*console*` CLI hint. It can only ever suggest more; you accept, change, or drop each
candidate. A deployment can extend detection with house conventions through
`ENVIRONMENTS_DETECTION_CONVENTIONS` (a JSON env var).

Recipe execution is bound to the local-mode compose facade (it needs a host Docker daemon), like the
rest of Compose. Each step's outcome streams to the [provisioning log](./observability.md#the-provisioning-event-log);
a failing step tears the half-up stack down and surfaces its tail as the environment's error.

### Drafting a recipe with the analyst

Detection is deterministic and never parses shell, so it can't see a bring-up that lives in a
`Makefile` or a `bin/` script. The wizard's **deep analysis** step runs an **environment analyst**
agent that clones the repo read-only, reads the README, Makefile, and setup scripts, and returns a
**draft recipe**, setup steps, prerequisites, and a health gate, each grounded in a source citation.
It is opt-in (the deterministic detector is the only thing that runs unprompted) and needs the frame
to have a linked repo. The draft is merged **detector-wins**: where both produce a field, the
deterministic reading of the compose files wins; the analyst fills the gaps, and each field is
tagged with where it came from so you can review provenance before saving.

## Shared stacks

A **shared stack** is long-lived infrastructure that runs once and that per-PR previews attach to,
the compose analogue of shared cluster infra: a database, a message broker, an auth service that is
wasteful to stand up fresh per run. You define one in the **Shared stacks** panel of the
Infrastructure window (an **Autodetect** button prefills its compose files, managed networks, and
profiles from the repo). It uses the same recipe vocabulary and runs its committed compose files as
authored, with host ports kept, since it is trusted operator infra rather than an isolated preview.

Bring-up (`ensure up`) is idempotent and coalesces concurrent callers; teardown is explicit and never
swept with a run or reaped on a timer, and its managed networks outlive it so attached consumers keep
working. A per-PR compose recipe references shared stacks by id in its **shared stack refs**: at
provision the Deployer brings each referenced stack up first (in order), then attaches the per-PR
project to the union of the recipe's external networks and the stacks' managed networks. Like the
compose provider, shared stacks are local-mode only.

### Where a compose layer comes from

A compose layer, on a stack recipe or a shared stack, is one of three things:

- A **path in the repository being provisioned**. This is the shorthand the autodetector emits and the
  panel authors.
- An **inline document**, written out at provision time. The layer names where it is materialized, and
  that path is confined to the checkout.
- A **file in another repository**, resolved once per foreign repo.

The last two let a stack that does not live in the repo being provisioned still compose. A
stack with no repository of its own materializes an empty working tree rather than cloning anything.

### Declaring stacks from the deployment

A deployment can declare its infrastructure dependencies in code instead of in a form, with
`seedSharedStacks` on `start()` or `startLocal()`, alongside
[`seedEnvironmentHandlers`](#seeding-handlers-from-the-deployment). Both run over the same workspace
enumeration at boot and again for each newly-created workspace. See
[Your Deployment Repository](../deploy/deployment-repository.md#_5-register-your-platform-data-in-code).

## Preflight checks

A recipe or shared stack can declare **prerequisites**, mechanical checks that run first, at the top
of provisioning and live in the wizard. Built-in checks cover the Docker daemon, disk space, memory,
registry auth, TCP/HTTP reachability, a local mkcert CA, `/etc/hosts` entries, and an env-secrets
marker. Each carries operator-authored remediation text. A failing **required** check fails the
provision fast with its remediation instead of a stuck attempt; a non-required one degrades to a
warning. A recipe that declares prerequisites on a deployment with no host-probe runtime fails
loudly rather than skipping them silently.

## How it works

The generic HTTP manifest provider spins environments up by calling your management API. During a run:

1. The deployer agent calls your provider endpoints to spin up an isolated environment.
2. The tester (and `playwright`) agents run against the preview instance.
3. The environment is cleaned up automatically on run completion or timeout.

```
Run starts
   └─ deployer agent → provision environment (your HTTP API)
        └─ tester / playwright → run against preview
             └─ run completes or times out → environment torn down
```

## Registering an HTTP manifest provider

You describe your provider declaratively with a manifest. There are no per-provider presets
and no per-org code:

| Field | Purpose |
| --- | --- |
| Base **URL** + auth scheme | Where to reach your management API and how to authenticate to it. |
| **provision** template | Called to spin up an environment. |
| **status** template | Polled until the environment is ready. |
| **teardown** template | Called to tear the environment down. |
| Response mapping | Maps your API's responses onto a canonical environment handle (e.g. its live URL). |

Credentials are referenced by logical key, never embedded. You supply the values at
registration, where they're stored encrypted at rest. The manifest's structure is documented in
[Integration Manifests](../extend/manifests.md#environment-provider-manifest), and it's enabled
through the **Environment provider manifest** feature toggle. See
[Configuration → Feature Toggles](../deploy/configuration.md#feature-toggles).

You register, test, and rotate the provider entirely in-app. The top-level **Infrastructure** window
has two tabs, **Agent containers** (the [runner pool](./runner-pools.md)) and **Test environments**
(this provider); open the **Test environments** tab, select the **HTTP manifest** backend, and use the
in-app JSON manifest editor to paste or edit the manifest, fill the write-only secrets sub-form, and
run a test connection. The editor validates against the same wire contract the backend enforces, so a
malformed manifest is caught before you save. In [local mode](../deploy/local.md), the delegation toggles sit
at the top of the same window.

::: tip Automatic cleanup
Environments are removed on completion or timeout, so a stuck run won't leave preview
infrastructure (and cost) running indefinitely.
:::

### Reaching an internal provider

By default the provider URL must be `https` and a public host: private, internal, and
cloud-metadata addresses are blocked (SSRF protection). If your provisioning API lives on an
internal host, widen the allow-list with two operator env vars:

| Variable | Purpose |
| --- | --- |
| `ENVIRONMENTS_ALLOW_URL_HOSTS` | Comma-separated hostnames exempt from the private/internal-host block. Each entry matches the URL host exactly (`envs.corp`, `10.1.2.3`), or as a dot suffix when it starts with `.` (`.internal` matches `a.b.internal`). |
| `ENVIRONMENTS_ALLOW_HTTP_URLS` | Set to `true` to also permit plain `http` (not just `https`). |

The [runner-pool integration](./runner-pools.md#reaching-an-internal-pool) has matching `RUNNERS_*`
knobs. The two are scoped **independently**: a host you allow for environments is not thereby
reachable by the runner pool, and vice versa.

## When the manifest isn't enough

If your platform's API can't be expressed as request/response templates (asynchronous provisioning,
a live URL buried in a dynamic response shape, a status vocabulary of its own, or a non-HTTP
protocol), implement the `EnvironmentProvider` port in code instead and inject it when you build the
container. See [Custom Providers (Code Adapters)](../extend/custom-providers.md) for a worked example,
per-workspace configuration via `providerConfig`, and the gotchas (status mapping, async provision,
idempotent teardown).

## Managing the provider's repo config

Some platforms keep their environment definition in a config file inside the deployed repository. A
code adapter can opt into managing that file, so the UI helps you get a repo to a provisionable state
instead of failing the first run:

- **Validate**: mechanical repo-config validation, run on demand and as a pre-flight gate before each
  provision. An invalid config fails synchronously with a clear reason rather than as a stuck
  provisioning attempt.
- **Bootstrap**: the adapter generates the config file from variables you supply in the UI; the engine
  commits it (idempotently, optionally as a PR) and re-validates.
- **Agent repair**: when the mechanical generation can't produce a valid config, the engine dispatches
  a coding agent that clones the repo at the write branch, fixes the config file in place, pushes the
  fix onto the same branch, and the connection re-validates. The agent only edits an existing repo; it
  never re-initialises history or force-pushes.

All repo I/O goes through the same VCS-neutral file abstraction the rest of the platform uses, so the
adapter never sees a host or a token. These are optional adapter capabilities: a stock deployment
running the generic manifest provider is unaffected. See
[Custom Providers (Code Adapters)](../extend/custom-providers.md).

---

That covers deployment and operations. For internals, see the [Reference](../reference/architecture.md).
