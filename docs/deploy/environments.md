# Ephemeral Environments

To validate agent-built changes against a running system, Cat-Factory can provision **ephemeral
preview environments** on demand and tear them down when the run finishes.

## What they're for

Tests that need a live instance — integration tests, Playwright end-to-end runs, acceptance checks
— get a **real, isolated environment** spun up just for that run, then cleaned up automatically.

## How it works

You register a preview environment **provider** via a declarative **HTTP manifest** that points at
your provisioning and cleanup endpoints. During a run:

1. The **deployer agent** calls your provider endpoints to **spin up** an isolated environment.
2. The **tester** (and `playwright`) agents run **against the preview instance**.
3. The environment is **cleaned up automatically** on run completion or timeout.

```
Run starts
   └─ deployer agent → provision environment (your HTTP API)
        └─ tester / playwright → run against preview
             └─ run completes or times out → environment torn down
```

## Registering a provider

Provide a manifest describing your environment provider:

| Field | Purpose |
| --- | --- |
| Provider **URL** | Base endpoint for the provider. |
| **Provisioning API** | Called to spin up an environment. |
| **Cleanup endpoints** | Called to tear the environment down. |

This is enabled through the **Environment provider endpoints** feature toggle — see
[Configuration → Feature Toggles](./configuration.md#feature-toggles).

::: tip Automatic cleanup
Environments are removed on completion **or timeout**, so a stuck run won't leave preview
infrastructure (and cost) running indefinitely.
:::

---

That covers deployment and operations. For internals, see the [Reference](../reference/architecture.md).
