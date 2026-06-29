# Ephemeral Environments

To validate agent-built changes against a running system, Cat Factory can provision ephemeral
preview environments on demand and tear them down when the run finishes.

## What they're for

Tests that need a live instance, such as integration tests, Playwright end-to-end runs, and
acceptance checks, get an isolated environment spun up just for that run, then cleaned up automatically.

## Local vs ephemeral, per service and per task

The Tester stands the system under test up one of two ways:

- **local**: the dependencies run alongside the job via the service's docker-compose file (or the
  task declares no infra).
- **ephemeral**: the job runs against a provisioned ephemeral environment, as described below.

A service frame carries a default test environment that the tasks under it inherit. Set it in the
service's **Test infrastructure** panel; the task inspector shows the inherited value. A task can
override the inherited default through its Tester agent config (`tester.environment`). At run time
the engine resolves the effective environment in this order: the task's own pin, then the service
default, then ephemeral. Cloud provider and instance size are ephemeral-provisioning hints and only
apply when the resolved environment is ephemeral.

Local infrastructure needs Docker-in-Docker on the runtime. A [local-mode runtime without
it](./local.md#choosing-a-container-runtime) (Apple `container`) refuses a local-infra Tester run at
start and steers it to an ephemeral environment or a no-infra service.

In [local mode](./local.md), an un-pinned Tester task defaults to the **local** environment. Turn on
**Delegate the test environment to a provider** (see
[Delegating infrastructure off the host](./local.md#delegating-infrastructure-off-the-host)) to make
the local-mode default ephemeral instead; per-service and per-task pins still override it.

## How it works

You register a preview environment provider via a declarative HTTP manifest that points at
your provisioning and cleanup endpoints. During a run:

1. The deployer agent calls your provider endpoints to spin up an isolated environment.
2. The tester (and `playwright`) agents run against the preview instance.
3. The environment is cleaned up automatically on run completion or timeout.

```
Run starts
   └─ deployer agent → provision environment (your HTTP API)
        └─ tester / playwright → run against preview
             └─ run completes or times out → environment torn down
```

## Registering a provider

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
[Integration Manifests](../reference/manifests.md#environment-provider-manifest), and it's enabled
through the **Environment provider manifest** feature toggle. See
[Configuration → Feature Toggles](./configuration.md#feature-toggles).

You register, test, and rotate the provider entirely in-app. The Integrations hub has a single
**Infrastructure** window with two tabs, **Container agents** (the [runner pool](./runner-pools.md))
and **Test environments** (this provider); open the **Test environments** tab and use the in-app JSON
manifest editor to paste or edit the manifest, fill the write-only secrets sub-form, and run a test
connection. The editor validates against the same wire contract the backend enforces, so a malformed
manifest is caught before you save. In [local mode](./local.md), the delegation toggles sit at the top
of the same window.

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
container. See [Custom Providers (Code Adapters)](./custom-providers.md) for a worked example,
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
[Custom Providers (Code Adapters)](./custom-providers.md).

---

That covers deployment and operations. For internals, see the [Reference](../reference/architecture.md).
