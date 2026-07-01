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
extension; reach for the manifest first. For a full walkthrough (the `RunnerPoolProvider` port,
a worked example, wiring, and gotchas), see [Custom Providers (Code Adapters)](./custom-providers.md).

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

You register the pool in-app. Open the top-level **Infrastructure** window, **Agent containers** tab,
select the **HTTP manifest** backend, and use the in-app JSON manifest editor to paste or edit the
manifest, fill the write-only secrets sub-form, and run a test dispatch. The editor validates against
the same wire contract the backend enforces. The **Test environments** tab in the same window
registers an [environment provider](./environments.md); a single pool can back both jobs.

### Native Kubernetes backend

If your compute is a Kubernetes cluster, you don't need a manifest at all. Select the **Kubernetes**
backend on the **Agent containers** tab and fill in a form (apiserver URL, namespace, a ServiceAccount
token, and the executor-harness image): Cat Factory creates one pod per run directly, no HTTP
scheduler in between. See [Kubernetes → Agent containers](./kubernetes.md#agent-containers-on-kubernetes).
On a developer machine, [`cat-factory k3s`](./kubernetes.md#local-k3s-guided-setup) wires a local
cluster into this backend in one command.

### Reaching an internal pool

The pool URL must be `https` and a public host by default; private, internal, and cloud-metadata
addresses are blocked (SSRF protection). To dispatch to a scheduler on an internal host, widen the
allow-list:

| Variable | Purpose |
| --- | --- |
| `RUNNERS_ALLOW_URL_HOSTS` | Comma-separated hostnames exempt from the private/internal-host block. Each matches the URL host exactly (`pool.corp`, `10.1.2.3`) or as a dot suffix when it starts with `.` (`.internal`). |
| `RUNNERS_ALLOW_HTTP_URLS` | Set to `true` to also permit plain `http` (not just `https`). |

This is scoped **independently** from the [environment integration](./environments.md#reaching-an-internal-provider)'s
`ENVIRONMENTS_*` allow-list: a host you allow here is not thereby reachable by the environment
provider.

## Bring-your-own infrastructure

Combined with the Node.js backend and your own PostgreSQL, runner pools let you run the entire
platform on infrastructure you control, while keeping the same board UI, API, and agent pipelines.

---

Next: give agents somewhere to test their work with [Ephemeral Environments](./environments.md).
