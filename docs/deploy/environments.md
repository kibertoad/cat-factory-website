# Ephemeral Environments

To validate agent-built changes against a running system, Cat Factory can provision ephemeral
preview environments on demand and tear them down when the run finishes.

## What they're for

Tests that need a live instance, such as integration tests, Playwright end-to-end runs, and
acceptance checks, get an isolated environment spun up just for that run, then cleaned up automatically.

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

---

That covers deployment and operations. For internals, see the [Reference](../reference/architecture.md).
