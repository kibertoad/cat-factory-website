---
redirectFrom:
  - /reference/manifests.html
---

# Integration Manifests

The reference for the declarative documents an operator writes to point Cat Factory at their own
infrastructure. Where the platform reaches out to something you run, whether to provision a preview
environment or to dispatch a coding job to your own runners, you describe it with a manifest. A
single generic adapter interprets any manifest, so there is no per-organization code and no fixed
vendor to integrate with.

There are two manifests, and they share the same building blocks:

- Ephemeral environment provider: your provision / status / teardown API. See
  [Provision Ephemeral Environments](../operate/environments.md).
- Runner pool: your container/runner scheduler's dispatch / poll / release API. See
  [Run Jobs on Your Own Runners](../operate/runner-pools.md).

You author both in-app, in the top-level **Infrastructure** window (a **Container agents**
tab for the runner pool, a **Test environments** tab for the environment provider). Each tab has a
JSON manifest editor and a write-only secrets sub-form, validates your input client-side against the
same Valibot contract the backend enforces, and offers a test call before you save.

This page is the authority for the manifest **format**: every field, both auth-scheme tables, the
template-variable namespaces, worked examples and the response-mapping rules. Nothing about writing
one needs a checkout of the platform's source.

## Shared building blocks

Both manifests are built from the same pieces:

| Piece | What it is |
| --- | --- |
| **`baseUrl`** | The root of your management API. Operation paths are appended to it. |
| **Auth scheme** | How Cat Factory authenticates to your API: `none`, `api_key` (custom header), `bearer`, `basic`, `oauth2_client_credentials`, or `custom_headers`. |
| **Request templates** | One HTTP call per operation (method, path, optional query/headers/body) with `{{var}}` interpolation from a bounded variable namespace. |
| **Response mapping** | Dot-paths that pull values out of *your* arbitrary response shape onto the canonical handle Cat Factory expects. |

Both also carry a `providerId` (lowercase letters, digits and hyphens, up to 64 characters) and a
human-readable `label`, which is what the Infrastructure window shows.

### Auth schemes

Identical for both manifests. Each scheme names the credentials it needs by **logical key**; you
supply the values once at registration and they are stored encrypted at rest, so no scheme puts a
secret value in the manifest itself.

| `auth.type` | Fields | Effect |
| --- | --- | --- |
| `none` | (none) | No auth header. |
| `api_key` | `headerName`, `secretRef`, `valuePrefix?` | `headerName: <prefix><secret>` |
| `bearer` | `secretRef` | `Authorization: Bearer <secret>` |
| `basic` | `usernameSecretRef`, `passwordSecretRef` | `Authorization: Basic base64(user:password)` |
| `oauth2_client_credentials` | `tokenUrl`, `clientIdSecretRef`, `clientSecretSecretRef`, `scope?`, `audience?` | Posts for a token (cached until it expires), then `Authorization: Bearer <token>` |
| `custom_headers` | `headers: [{ name, secretRef }]` | Each named header set from its own secret |

A `secretRef` is `{ "key": "API_TOKEN" }`: the logical name you will supply a value for. The
`tokenUrl` of the OAuth scheme is fetched by the platform, so it is subject to the same URL policy
as `baseUrl`.

### Secrets are referenced, never embedded

A manifest never carries a secret value. It references each credential by a logical key; you
supply the actual values once at registration, where they are stored encrypted at rest and
resolved in memory only at call time. This keeps raw secrets out of the manifest, out of logs, and
out of the per-run container.

Registration refuses a manifest that references a key you have not supplied a value for, so a typo
in a `secretRef` fails at save time rather than on the first real call.

### Request templates

Every operation is one HTTP call: a `method`, a `pathTemplate` appended to `baseUrl`, and optional
`queryTemplate`, `headersTemplate` and `bodyTemplate`. Each of those interpolates `{{var}}`
references from a **bounded** namespace, listed per manifest below.

Two properties follow from the namespace being bounded, and both are deliberate:

- **An unknown reference resolves to the empty string**, so a manifest can never reach arbitrary
  host state, and a typo produces a request with an empty field rather than an error you have to
  correlate back.
- **A JSON body is a string template, not an object.** Embed a raw JSON value (the whole job spec,
  a number) by writing the placeholder unquoted:
  `"{\"spec\":{{input.job}},\"pr\":{{input.pullNumber}}}"`.

### Response mapping

Your API answers in whatever shape it already has. `response` is a set of **dot-paths** that pull
the values Cat Factory needs out of that shape: `data.url`, or an array index like
`data.links.0.href`. A path that does not resolve is treated as absent, never as an error.

`statusMap` translates your own status vocabulary onto the platform's. Matching is
case-insensitive and ignores surrounding whitespace, and an explicit mapping always wins.

### Per-workspace config for code adapters

A manifest can also carry an optional **`providerConfig`**, an opaque key/value bag that the
generic HTTP adapter ignores, but a [custom code adapter](./custom-providers.md) reads for
settings the standard fields don't cover (a project name, a target service, status-vocabulary
overrides). Because it rides the connection, it is **per workspace**: one deployment-wide code
adapter can serve many workspaces, each with its own `providerConfig`, while deployment-wide
defaults come from the environment. See
[Add a Custom Provider → How configuration reaches your adapter](./custom-providers.md#how-configuration-reaches-your-adapter).

### Limits and network policy

- Every URL a manifest names (the `baseUrl`, an OAuth `tokenUrl`, and for environments the
  provisioned environment's own URL) must be `https`, carry no embedded credentials, and resolve to
  a public host. An operator can widen that per integration to reach an internal or VPN-hosted
  platform: [environments](../operate/environments.md#reaching-an-internal-provider) and
  [runner pools](../operate/runner-pools.md) each have their own allow-list, and neither widening
  reaches the other.
- Per-call timeouts are bounded: `timeoutMs`, at most 60 seconds, defaulting to 30.
- Responses larger than about 200 KB are rejected.

## Environment provider manifest

After a `deployer` step provisions an environment, the resulting handle (notably a live URL) is
surfaced to downstream `tester` / `playwright` agents so they run against it. The manifest
describes three operations:

| Operation | Purpose |
| --- | --- |
| **provision** | Spin up an isolated environment for the run. |
| **status** | Poll until the environment is ready. |
| **teardown** | Tear it down on completion or timeout. |

`status` is optional: a platform whose create call returns a live URL can omit it. `teardown` is
optional in the schema and worth declaring anyway, because without it nothing reclaims the
environment before its TTL.

### Fields

```jsonc
{
  "providerId": "acme-envs", // [a-z0-9-]
  "label": "Acme Ephemeral Envs",
  "baseUrl": "https://envs.acme.example", // https, public host
  "auth": { "type": "bearer", "secretRef": { "key": "API_TOKEN" } },

  // provision/status/teardown: arbitrary method + path + body, with templating.
  "provision": {
    "method": "POST",
    "pathTemplate": "/environments",
    "bodyTemplate": "{\"ref\":\"{{input.blockId}}\",\"title\":\"{{input.title}}\"}",
  },
  "status": { "method": "GET", "pathTemplate": "/environments/{{provision.externalId}}" },
  "teardown": { "method": "DELETE", "pathTemplate": "/environments/{{provision.externalId}}" },

  // Map YOUR response shape onto the canonical handle via dot-paths.
  "response": {
    "urlPath": "data.url",
    "statusPath": "data.state",
    "statusMap": [
      { "from": "running", "to": "ready" },
      { "from": "building", "to": "provisioning" },
      { "from": "error", "to": "failed" },
    ],
    "externalIdPath": "data.id",
    "expiresAtPath": "data.expires_at", // epoch-ms, numeric string, or ISO
    // How the *provisioned env* itself is reached by the tester (per-env creds,
    // read from the provision response, distinct from the management-API auth):
    "access": { "scheme": "bearer", "tokenPath": "data.access_token" },
  },

  "defaultTtlMs": 3600000, // fallback TTL when no expiry is returned
}
```

The canonical statuses `statusMap` targets are `provisioning`, `ready`, `failed`, `tearing_down`
and `torn_down`.

`response.access` is worth separating from `auth` in your head: `auth` is how the platform calls
**your management API**, while `access` is how the **tester agent** reaches the environment that
was just provisioned. The tester's prompt names the scheme, never the token.

### Template variables

- `{{input.*}}`: the provision inputs. On a pipeline `deployer` step these are derived from the
  board block (`blockId`, `title`, `type`, `description`, `features`) plus the git/PR/repo context
  below. On a manual provision they come from the request's own `inputs`, plus `blockId`. An
  explicit request input always wins over a derived value.
- `{{provision.*}}`: fields captured from the provision response (`externalId`, `url`), available
  to the `status` and `teardown` templates.

#### Git, pull request and repository context

A preview-environment platform almost always keys an environment on **the git ref it is building**
and **the repository it belongs to**, rather than on an opaque block id. So a `deployer` step
derives that context from the block's open pull request and exposes it as flattened `{{input.*}}`
strings. Each is present only when known: a manual provision, or a block with no pull request,
carries fewer.

| Variable | Value |
| --- | --- |
| `{{input.blockId}}` | The board block being deployed (always present). |
| `{{input.branch}}` | The head branch the agent pushed its work to. |
| `{{input.pullNumber}}` | The pull request number within the repository (for example `42`). |
| `{{input.pullUrl}}` | The pull request web URL. |
| `{{input.repoOwner}}` | The repository owner (org or user login), parsed from the pull request URL. |
| `{{input.repoName}}` | The repository name, parsed from the pull request URL. |

This is what lets a manifest build a "create an environment for PR #N of owner/repo" request with
no per-block configuration. An identifier your platform needs that is **not** derivable from a
block (a project, team or tenant slug, a target cluster) is not in this namespace: bake it into the
manifest as a literal in the path or body template, or pass it as a manual-provision input.
Register one manifest per project if they differ.

### Worked example: a PR-environment platform

Most preview-environment platforms expose three calls, "create an environment for this pull
request", "get its status", "delete it", and key the environment on the pull request's git ref.
Here is a complete manifest for that shape. The project slug the platform requires (`my-project`)
is not derivable from a block, so it lives as a literal in the paths.

```jsonc
{
  "providerId": "preview-envs",
  "label": "Preview Environments",
  "baseUrl": "https://envs.example.com/v2",
  "auth": { "type": "bearer", "secretRef": { "key": "API_TOKEN" } },

  // Create: target the pull request by number + repo. The platform returns a stable
  // "ref" (or id) that we capture and reuse on status and teardown.
  "provision": {
    "method": "POST",
    "pathTemplate": "/projects/my-project/environments",
    "bodyTemplate": "{\"git_ref\":{\"pr_number\":{{input.pullNumber}}},\"github\":{\"owner\":\"{{input.repoOwner}}\",\"repo\":\"{{input.repoName}}\"}}",
  },
  // Status and teardown address the env by the ref captured from the provision response.
  "status": {
    "method": "GET",
    "pathTemplate": "/projects/my-project/environments/{{provision.externalId}}",
  },
  "teardown": {
    "method": "DELETE",
    "pathTemplate": "/projects/my-project/environments/{{provision.externalId}}",
  },

  "response": {
    "externalIdPath": "data.ref", // the per-PR ref, reused as {{provision.externalId}}
    "urlPath": "data.url",
    "statusPath": "data.status",
    "statusMap": [
      { "from": "pending", "to": "provisioning" },
      { "from": "online", "to": "ready" },
      { "from": "failed", "to": "failed" },
      { "from": "deleting", "to": "tearing_down" },
      { "from": "deleted", "to": "torn_down" },
    ],
  },
  "defaultTtlMs": 3600000,
}
```

Two things to check against your platform's real API:

- **Where the URL lives.** `urlPath` reads a single string via a dot-path (`data.url`, or an array
  index like `data.links.0.href`). If your platform returns the reachable URL only inside a nested,
  array-valued or templated structure that a dot-path cannot pull out cleanly, you have outgrown
  the manifest path: use a
  [custom provider](./custom-providers.md).
- **Asynchronous provisioning.** If create returns before the environment is live, supply a
  `status` template. A background sweep polls it until `statusMap` yields `ready` or `failed`. A
  synchronous platform that returns a ready URL can omit `status` entirely.

A `teardown` call that returns cleanly is **not** proof the environment is gone: an asynchronous
delete is accepted while the resource is still terminating, and a manifest with no `teardown`
reports success having done nothing. A deployment that needs positive proof writes a
[custom provider](./custom-providers.md) with a confirmation probe.

## Runner-pool manifest

The harness job protocol the runner executes is fixed; what is organization-specific is the
scheduler in front of your pool: how a job is assigned to a runner and how its status is read
back. The manifest describes:

| Operation | Purpose |
| --- | --- |
| **dispatch** | Start a coding job on the pool. |
| **poll** | Read a job's status until it finishes. |
| **release** (optional) | Release / clean up a finished job. |

Every coding job dispatches through the one `dispatch` template: the harness reads the specific
work mode from the job body, so a manifest never needs a template per agent kind.

### Template variables

Template variables expose the job's metadata as first-class `{{input.*}}` values, so dispatch and
poll templates can route and size a job without decoding the job spec:

| Variable | Value |
| --- | --- |
| `{{input.jobId}}` | The execution id the pool is keyed on (the sticky-routing target). |
| `{{input.job}}` | The full harness job spec as a JSON string. Embed it raw to forward it verbatim. |
| `{{input.kind}}` | The harness dispatch kind. Every coding job dispatches a single generic `agent` kind, so this is `agent`; the harness reads the specific work mode (coding, explore, merge, bootstrap, and the rest) from the job body, so a manifest does not route by it. It is exposed flat for completeness alongside the sizing hints. |
| `{{input.instanceType}}` | Concrete instance-type id, when the service pins a size (empty when unpinned). |
| `{{input.cloudProvider}}` | The cloud the service selected, when pinned (empty when unpinned). |

The last three are convenience projections of fields that also live inside `{{input.job}}`. They
exist so a path, query or header template can route or size **without parsing** the embedded JSON.

### Example A: transparent proxy

The recommended shape. Your scheduler exposes the harness routes behind a sticky-routed gateway
and the manifest forwards everything:

```jsonc
{
  "providerId": "acme-pool", // [a-z0-9-], up to 64 characters
  "label": "Acme Runner Pool",
  "baseUrl": "https://runners.acme.example/api", // public https
  "auth": { "type": "bearer", "secretRef": { "key": "API_TOKEN" } },

  "dispatch": {
    "method": "POST",
    "pathTemplate": "/dispatch/{{input.kind}}",
    "bodyTemplate": "{\"id\":\"{{input.jobId}}\",\"job\":{{input.job}}}",
  },
  "poll": { "method": "GET", "pathTemplate": "/jobs/{{input.jobId}}" },
  "release": { "method": "DELETE", "pathTemplate": "/jobs/{{input.jobId}}" },

  "response": {
    "resultPath": "result", // forward the WHOLE harness result envelope
    "statusPath": "state",
    "statusMap": [
      { "from": "in_progress", "to": "running" },
      { "from": "succeeded", "to": "done" },
      { "from": "errored", "to": "failed" },
    ],
    "progressCompletedPath": "progress.completed",
    "progressInProgressPath": "progress.inProgress",
    "progressTotalPath": "progress.total",
    "callMetricsPath": "callMetrics", // per-poll model-call telemetry
    "sliceReviewsPath": "sliceReviews", // a PR review's finished slices
    "toolServersPath": "toolServers", // what the agent's CLI said about its MCP servers
    "dispatchCapabilitiesPath": "capabilities", // read off the DISPATCH response
    "errorPath": "error",
  },
}
```

### Example B: opaque envelope

Your scheduler accepts one generic "create job" call, queues it, and exposes its own status shape.
A sidecar reads the kind from the embedded job and routes internally:

```jsonc
{
  "providerId": "acme-k8s",
  "label": "Acme k8s jobs",
  "baseUrl": "https://jobs.acme.example",
  "auth": {
    "type": "oauth2_client_credentials",
    "tokenUrl": "https://auth.acme.example/oauth/token",
    "clientIdSecretRef": { "key": "CLIENT_ID" },
    "clientSecretSecretRef": { "key": "CLIENT_SECRET" },
    "scope": "jobs:write",
  },
  "dispatch": {
    "method": "POST",
    "pathTemplate": "/v1/jobs",
    "bodyTemplate": "{\"name\":\"{{input.jobId}}\",\"kind\":\"{{input.kind}}\",\"instanceType\":\"{{input.instanceType}}\",\"spec\":{{input.job}}}",
  },
  "poll": { "method": "GET", "pathTemplate": "/v1/jobs/{{input.jobId}}" },
  "release": { "method": "DELETE", "pathTemplate": "/v1/jobs/{{input.jobId}}" },
  "response": {
    "resultPath": "data.result",
    "statusPath": "data.phase",
    "statusMap": [
      { "from": "Pending", "to": "running" },
      { "from": "Running", "to": "running" },
      { "from": "Succeeded", "to": "done" },
      { "from": "Failed", "to": "failed" },
    ],
    "errorPath": "data.message",
  },
}
```

### Response mapping notes

The response mapping translates your scheduler's own status strings onto the harness states
(`running` / `done` / `failed`) and pulls out the work product (pull request URL, branch, summary)
and any live subtask progress. The rules below are where a working manifest and a subtly lossy one
differ.

- **`resultPath` is the field most schedulers want.** Point it at the object holding the harness
  `result` envelope and Cat Factory forwards **every** structured product (blueprint tree, spec
  document, merge assessment, test report, bootstrap branch), not just the pull request scalars.
  Known fields are coerced by type and unknown ones ignored.
- The scalar paths (`prUrlPath`, `branchPath`, `summaryPath`) still apply and **override**
  `resultPath` when set, for schedulers that surface those outside any envelope.
- **Map your terminal states explicitly.** A status your manifest does not map is matched against a
  built-in vocabulary of common scheduler words (`done` / `completed` / `succeeded` and friends map
  to `done`; `failed` / `error` / `cancelled` / `timeout` and friends to `failed`), and anything
  still unrecognised falls back to `running`, which keeps the driver waiting rather than wrongly
  failing a live run. That vocabulary is a safety net, not a substitute for a mapping: only words
  that are terminal in every vocabulary they could come from are in it, so a word that can also
  mean "still waiting for capacity" (Kubernetes' `Unschedulable`, for one) is deliberately absent
  and reads as `running`.
- **Report a reclaimed runner with a reclaim word and the step is retried on a fresh runner.**
  `evicted` / `preempted` / `oomkilled` / `node_lost` and friends are read as the runner going away
  rather than the job failing, so the step is re-dispatched onto a new pool member instead of
  failing the run. This applies to a mapped status too: `{"from": "evicted", "to": "failed"}` still
  gets the retry. Words that usually mean a human intervened (`cancelled`, `killed`, `aborted`) are
  deliberately not treated this way: they fail the step, they never resurrect it.
- **A poll that answers 404 or 410 is read the same way.** If your scheduler forgets a job whose
  runner died, answering the poll with a 404 is the simplest way to say so. Any other non-2xx is
  read as *your scheduler* being unwell (retried a few times, then the run fails), so do not 404 a
  job that merely has not been scheduled yet: report it as `running`. The run's failure detail
  records the raw status line, because a 404 can equally mean a mistyped `poll` path or an endpoint
  that hides an unauthorized read behind a 404.
- **A re-dispatched step arrives as a NEW `jobId`.** Both retry paths (a tester-to-fixer or
  gate-helper round, and a recovery after a reclaimed runner) suffix the id. Combined with sticky
  routing, that is what makes an eviction recovery land on a fresh pool member instead of back on
  the dead job: treat an unseen id as a new job and place it accordingly.
- **Set `callMetricsPath` if your poll response proxies the harness view verbatim** (it is
  `callMetrics` there). The harness drains per-model-call telemetry on every poll, so mapping it
  lands a run's token spend while the run is in flight, and keeps it when a run dies before it can
  return a terminal result. Leave it unset and those calls are recorded only from the terminal
  result envelope, which an evicted or out-of-memory run never produces. Recording is idempotent,
  so the terminal envelope repeating them costs nothing.
- **Set `sliceReviewsPath` too** (it is `sliceReviews` on the harness view). A pull request review
  fans its slices out across parallel subagents and emits findings only in the terminal output, so
  this channel is the only thing that makes a finished slice durable while the review is still
  running. Leave it unset and a pool-backed review that wedges has nothing for a manual resume to
  work from: it can only be re-run from zero.
- **Set `toolServersPath` too** (it is `toolServers` on the harness view). It carries what the
  agent's own CLI said about the tool servers (MCP) it loaded: one row per server, with a status and
  how many tools it exposed. The platform already records what it wired and what it withheld; this
  is the only evidence of the other failure, a server that passed every check and then failed to
  come up in the runner. Leave it unset and the step reports no observation rather than a false one.
- **Set `dispatchCapabilitiesPath` if your dispatch response proxies the harness's acceptance
  body** (it is `capabilities` there, and it is the one mapping read off the dispatch response
  rather than the poll one). It is what lets the platform refuse a blind run: a runner image older
  than an optional job-body capability does not reject the field, it ignores it, and the prompt has
  already told the agent it has tools that were never installed. It is deliberately not read by
  name without this mapping, because `capabilities` is an ordinary word for a scheduler to use
  about its own runners.
- **Declare a `release` template even if your runners are ephemeral.** It is also the only cancel
  the platform has on a pool: when a dispatch is refused as blind, the harness has already started
  an agent, and without `release` it runs to completion and can open a pull request for a step the
  engine already failed. Calling `release` on an already-finished job must be a no-op.

A manifest with no `release`, or no `response.statusPath`, reports the gap on its connection test in
the Infrastructure window, and logs it once at registration.

---

Next: the deployment steps that register these, in
[Run Jobs on Your Own Runners](../operate/runner-pools.md) and
[Provision Ephemeral Environments](../operate/environments.md), or
[Add a Custom Provider](./custom-providers.md) when a manifest cannot describe your platform.
