# Integration Manifests

Cat Factory is self-hosted and has no public API to integrate against. Where it *does* reach out
to infrastructure you own, whether to provision a preview environment or to dispatch a coding job to your
own runners, you describe that infrastructure declaratively with a manifest. A single generic
adapter interprets any manifest, so there is no per-organization code and no fixed vendor to
integrate with.

There are two manifests, and they share the same building blocks:

- Ephemeral environment provider: your provision / status / teardown API. See
  [Ephemeral Environments](../deploy/environments.md).
- Runner pool: your container/runner scheduler's dispatch / poll / release API. See
  [Runner Pools](../deploy/runner-pools.md).

## Shared building blocks

Both manifests are built from the same pieces:

| Piece | What it is |
| --- | --- |
| **`baseUrl`** | The root of your management API. Operation paths are appended to it. |
| **Auth scheme** | How Cat Factory authenticates to your API: `none`, `api_key` (custom header), `bearer`, `basic`, `oauth2_client_credentials`, or `custom_headers`. |
| **Request templates** | One HTTP call per operation (method, path, optional query/headers/body) with `{{var}}` interpolation from a bounded variable namespace. |
| **Response mapping** | Dot-paths that pull values out of *your* arbitrary response shape onto the canonical handle Cat Factory expects. |

### Secrets are referenced, never embedded

A manifest never carries a secret value. It references each credential by a logical key; you
supply the actual values once at registration, where they are stored encrypted at rest and
resolved in memory only at call time. This keeps raw secrets out of the manifest, out of logs, and
out of the per-run container.

### Per-workspace config for code adapters

A manifest can also carry an optional **`providerConfig`**, an opaque key/value bag that the
generic HTTP adapter ignores, but a [custom code adapter](../deploy/custom-providers.md) reads for
settings the standard fields don't cover (a project name, a target service, status-vocabulary
overrides). Because it rides the connection, it is **per workspace**: one deployment-wide code
adapter can serve many workspaces, each with its own `providerConfig`, while deployment-wide
defaults come from the environment. See
[Custom Providers → How configuration reaches your adapter](../deploy/custom-providers.md#how-configuration-reaches-your-adapter).

## Environment provider manifest

After a `deployer` step provisions an environment, the resulting handle (notably a live URL) is
surfaced to downstream `tester` / `playwright` agents so they run against it. The manifest
describes three operations:

| Operation | Purpose |
| --- | --- |
| **provision** | Spin up an isolated environment for the run. |
| **status** | Poll until the environment is ready. |
| **teardown** | Tear it down on completion or timeout. |

Template variables come from `{{input.*}}` (provision inputs) and `{{provision.*}}` (fields
extracted from the provision response, available to status and teardown).

## Runner-pool manifest

The harness job protocol the runner executes is fixed; what is organization-specific is the
scheduler in front of your pool: how a job is assigned to a runner and how its status is read
back. The manifest describes:

| Operation | Purpose |
| --- | --- |
| **dispatch** | Start a coding job on the pool. |
| **poll** | Read a job's status until it finishes. |
| **release** (optional) | Release / clean up a finished job. |

Template variables expose the job's metadata as first-class `{{input.*}}` values, so dispatch and
poll templates can route and size a job without decoding the job spec:

- `{{input.jobId}}`: the execution id the pool is keyed on (sticky routing target).
- `{{input.job}}`: the full harness job spec as JSON; embed it raw to forward it verbatim.
- `{{input.kind}}`: the harness dispatch kind. Every coding job dispatches a single generic `agent`
  kind, so this is `agent`; the harness reads the specific work mode (coding, explore, merge,
  bootstrap, and the rest) from the job body, so a manifest does not route by it. It is exposed flat
  for completeness alongside the sizing hints.
- `{{input.instanceType}}` / `{{input.cloudProvider}}`: the instance type and cloud provider a
  service pins (empty when unpinned), for node selection and sizing.

The response mapping translates your scheduler's own status strings onto the harness states
(`running` / `done` / `failed`) and pulls out the work product (PR URL, branch, summary) and any
live subtask progress.

---

For the deployment steps that register these, see [Runner Pools](../deploy/runner-pools.md) and
[Ephemeral Environments](../deploy/environments.md).
