# Self-Hosted Runner Pools

On Cloudflare, per-run coding work executes in Cloudflare Containers by default. For full control
over where agents run — and to bring your own compute — Cat-Factory supports **self-hosted runner
pools**. On the **Node.js runtime there is no built-in per-run container**, so repo-operating agent
kinds (coder, mocker, blueprints, ci-fixer, conflict-resolver, merger, requirements-writer,
analysis) run on a runner pool — wiring one is what turns those kinds on there.

## When to use a runner pool

Reach for a runner pool when you need to:

- Run agent jobs on **your own infrastructure** (Kubernetes, Nomad, or another scheduler).
- Meet **data-residency or network** requirements that rule out managed containers.
- Reuse **existing compute** capacity for execution.

## How it works

A runner pool is described by a **declarative manifest** you register on the deployment — request
templates for dispatching a job, polling its status, and (optionally) releasing it, plus the auth
scheme and a mapping from your scheduler's responses onto the canonical job view. A single generic
adapter interprets any manifest, so there's no per-org code. See
[Integration Manifests](../reference/manifests.md#runner-pool-manifest) for the shape.

Cat-Factory dispatches per-run jobs to the pool, which executes the **executor-harness** container
image — the same payload that runs the coding agent, performs Git operations, and produces the
branch the platform opens a pull request from.

```
Backend  ──dispatch──▶  Runner pool (K8s / Nomad / scheduler)
                          └─ executor-harness container
                               → coding agent
                               → Git operations & PR creation
```

## Configuration

| Setting | Purpose |
| --- | --- |
| Runner pool **manifest** | Declaratively describes your scheduler's dispatch/poll/release API. |
| Pool API credentials | Supplied at registration by logical key, stored encrypted at rest. |
| Container image registry + pull credentials | Where the executor-harness image is pulled from. |

The manifest's structure is documented in
[Integration Manifests](../reference/manifests.md#runner-pool-manifest); registration is part of the
**Infrastructure** configuration — see [Configuration → Infrastructure](./configuration.md#infrastructure).

## Bring-your-own infrastructure

Runner pools are one half of Cat-Factory's **deployment flexibility**. Combined with the Node.js
backend and your own PostgreSQL, they let you run the entire platform on infrastructure you
control, while keeping the same board UI, API, and agent pipelines.

---

Next: give agents somewhere to test their work with [Ephemeral Environments](./environments.md).
