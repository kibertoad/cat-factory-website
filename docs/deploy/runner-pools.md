# Self-Hosted Runner Pools

On Cloudflare, per-run coding work executes in Cloudflare Containers by default. If you want control
over where agents run, or you want to bring your own compute, Cat Factory supports self-hosted runner
pools. On the Node.js runtime there is no built-in per-run container, so repo-operating agent
kinds (coder, mocker, blueprints, ci-fixer, conflict-resolver, merger, spec-writer,
analysis) run on a runner pool. Wiring one up is what turns those kinds on there.

## When to use a runner pool

Reach for a runner pool when you need to:

- Run agent jobs on your own infrastructure (Kubernetes, Nomad, or another scheduler).
- Meet data-residency or network requirements that rule out managed containers.
- Reuse existing compute capacity for execution.

## How it works

A runner pool is described by a declarative manifest you register on the deployment. It holds request
templates for dispatching a job, polling its status, and (optionally) releasing it, plus the auth
scheme and a mapping from your scheduler's responses onto the canonical job view. A single generic
adapter interprets any manifest, so there's no per-org code. See
[Integration Manifests](../reference/manifests.md#runner-pool-manifest) for the shape.

### Routing and sizing jobs

Each dispatch and poll exposes the job's metadata as first-class template variables, so your
manifest can route or size a job without decoding the embedded job spec:

| Variable | What it carries |
| --- | --- |
| `{{input.kind}}` | The agent kind being dispatched (`run`, `blueprint`, `spec`, `explore`, `ci-fix`, `resolve-conflicts`, `merge`, `on-call`, `test`, `fix-tests`, `bootstrap`). Route different kinds to different handlers or queues. |
| `{{input.instanceType}}` | The instance type a service pins (e.g. `c7g.xlarge`), or empty when unpinned. Use it for node selection. |
| `{{input.cloudProvider}}` | The cloud provider a service pins (e.g. `aws`), or empty when unpinned. |
| `{{input.jobId}}` | The execution id the pool is keyed on (sticky routing target). |
| `{{input.job}}` | The full harness job spec as JSON; embed it verbatim to forward the whole payload. |

These let one pool serve every agent kind and size each job from the service's pinned provider and
instance type, all from the manifest. See
[Integration Manifests](../reference/manifests.md#runner-pool-manifest) for the full list.

### Custom adapters

The generic manifest adapter covers any HTTP scheduler and is the supported path for almost every
deployment. If your scheduler can't be driven over HTTP at all, the Node.js runtime exposes the
runner-pool and environment-provisioning ports as code seams: you can build the container with your
own adapter implementation instead of the manifest-driven one. This is an advanced, code-level
extension; reach for the manifest first.

Cat Factory dispatches per-run jobs to the pool, which executes the executor-harness container
image. That's the same payload that runs the coding agent, performs Git operations, and produces the
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
| Runner pool **manifest** | Describes your scheduler's dispatch/poll/release API declaratively. |
| Pool API credentials | Supplied at registration by logical key, stored encrypted at rest. |
| Container image registry + pull credentials | Where the executor-harness image is pulled from. |

The manifest's structure is documented in
[Integration Manifests](../reference/manifests.md#runner-pool-manifest); registration is part of the
Infrastructure configuration. See [Configuration → Infrastructure](./configuration.md#infrastructure).

## Bring-your-own infrastructure

Combined with the Node.js backend and your own PostgreSQL, runner pools let you run the entire
platform on infrastructure you control, while keeping the same board UI, API, and agent pipelines.

---

Next: give agents somewhere to test their work with [Ephemeral Environments](./environments.md).
