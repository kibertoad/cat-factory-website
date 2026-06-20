# Self-Hosted Runner Pools

By default, per-run coding work executes in Cloudflare Containers. For full control over where
agents run — and to bring your own compute — Cat-Factory supports **self-hosted runner pools**.

## When to use a runner pool

Reach for a runner pool when you need to:

- Run agent jobs on **your own infrastructure** (Kubernetes, Nomad, or another scheduler).
- Meet **data-residency or network** requirements that rule out managed containers.
- Reuse **existing compute** capacity for execution.

## How it works

A runner pool is described by a **manifest URL** you configure on the deployment. Cat-Factory
dispatches per-run jobs to the pool, which executes the **executor-harness** container image —
the same payload that runs the coding agent, performs Git operations, and opens pull requests.

```
Backend  ──dispatch──▶  Runner pool (K8s / Nomad / scheduler)
                          └─ executor-harness container
                               → coding agent
                               → Git operations & PR creation
```

## Configuration

| Setting | Purpose |
| --- | --- |
| Runner pool **manifest URL** | Describes the pool to the backend. |
| Container image registry + pull credentials | Where the executor-harness image is pulled from. |

These are part of the **Infrastructure** configuration — see
[Configuration → Infrastructure](./configuration.md#infrastructure).

## Bring-your-own infrastructure

Runner pools are one half of Cat-Factory's **deployment flexibility**. Combined with the Node.js
backend and your own PostgreSQL, they let you run the entire platform on infrastructure you
control, while keeping the same board UI, API, and agent pipelines.

---

Next: give agents somewhere to test their work with [Ephemeral Environments](./environments.md).
