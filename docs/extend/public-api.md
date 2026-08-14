---
redirectFrom:
  - /reference/public-api.html
---

# Public API

The reference for driving Cat Factory from outside the app: CI, a script, another service, an agent
of your own. Cat Factory exposes a key-authenticated HTTP API under `/api/v1`. It covers headless
jobs (breaking down an [initiative](../guide/initiatives.md) and other inline pipelines), the full
board workload (list services, create and read tasks, start/stop/retry/
delete runs, stream progress), pipeline discovery, parked human decisions, a notification inbox, the
workspace's spend, and a read-only run-debugging surface. Every operation is scoped to one workspace
and authenticated by a bearer key.

Reach for an [official SDK](#client-sdks) before hand-rolling HTTP: clients ship for TypeScript,
Python, Go and Java/Kotlin.

This page is the narrative: what to do, in what order, and which of the surface's rules will bite.
Every operation's exact parameters, payload shapes and constraints are on the
[API Endpoint Reference](../reference/api-reference.md), which is generated from the same OpenAPI
3.1 document the SDK clients are, so it cannot fall behind the running surface. Point a generator at
[the spec itself](https://github.com/kibertoad/cat-factory/blob/main/docs/openapi.json) rather than
hand-transcribing any of it.

::: tip Availability
The public API is available on any deployment that has [`ENCRYPTION_KEY`](../deploy/configuration.md#credential-encryption)
set (it seals key hashes at rest); without it the surface returns `503`. Keys are managed in the app
UI (see [Managing keys](#managing-keys)), and each key carries a scope.
:::

## Stability

`/api/v1`, the official SDK clients, and the outbound webhook delivery contract are a stable
surface. Build on them with the same expectations you would bring to any versioned public API:

- Changes are additive. New endpoints, new optional fields, new enum values, and new error codes
  arrive without warning and bump the OpenAPI `info.version` minor. Write clients that tolerate
  fields and enum members they do not recognise; the official SDKs already do.
- A breaking change never lands in place. It ships as a migration path plus a version change: the
  old shape keeps working while the new one is served beside it (a new field next to the old, a new
  `/api/v2` prefix for a changed path or semantics), the deprecation is documented, and the old half
  is removed only in a later release.
- Scope semantics only ever widen on their own. Narrowing what a key may do counts as a break and
  follows the same migration rule.

## Authenticating

Every `/api/v1` request carries a bearer key:

```
Authorization: Bearer cf_live_<keyId>.<secret>
```

The server stores only a one-way hash of the secret (`HMAC-SHA256` under `ENCRYPTION_KEY`), never
the secret itself, so a key is shown in full exactly once when you create it. The `<keyId>` is a
non-secret `pak_…` identifier embedded in the key. A key is scoped to one account and workspace;
every call it makes is bound to that workspace. An unknown or absent key fails closed as `401`; a
valid key whose scope is too low for the operation returns `403 insufficient_scope`.

## Scopes

Each key carries one scope on an inclusive ladder, so a higher scope also grants everything below it:

| Scope | Grants |
| --- | --- |
| **Read only** (`read`) | Reads and streams: list services, tasks, jobs, pipelines, and notifications; list a run's parked decisions; poll a job or run; open an SSE stream; read the workspace's [usage and budget](#usage-and-budget); the whole [run-debugging surface](#run-debugging). |
| **Read and write** (`write`) | Everything `read` can do, plus non-destructive mutations: create a task, edit its title/description, start, stop, retry, or cancel a run, break down an initiative, and dismiss a notification. This is the default for a new key. |
| **Decide** (`decide`) | Everything `write` can do, plus answering a run's [parked decisions](#answering-a-parked-run), and therefore starting a run on a pipeline that can park at all. |
| **Full access** (`admin`) | Everything `decide` can do, plus destructive and merge-adjacent actions: delete a task and its run history, and act on a notification (which can perform a real merge). |

`decide` is a deliberate rung of its own. Answering a decision injects caller-supplied prose into the
requirements every downstream agent then implements, and un-parks the run. A plain `write` key sees
exactly the previous behaviour, including the refusal of parking pipelines. Two things to weigh before
minting one:

- The grant is **workspace-wide, not limited to runs the key started**. The decision surface is keyed
  by run id and resolves any run in the key's workspace, including a board task a person started in
  the app. That is the same reach a `write` key already has over board runs, one rung up.
- Prefer `write` for an integration that only needs to author and launch work.

Handing out even a `read` key is not free: the [run-debugging surface](#run-debugging) reaches prompt
and response bodies that the app gates behind workspace roles.

## Who a key runs as

A scope says what a key may **do**. A second, independent choice says **whose** credentials, spend,
and merge-policy role its runs answer to, and you make it when you mint the key ("Runs as"):

| | **This workspace** (system token) | **Me** (personal token) |
| --- | --- | --- |
| Runs it starts belong to | the workspace, attributed to no person | you |
| Your [personal subscription](../guide/model-providers.md#personal-individual-usage-subscriptions) | never reachable | reachable, with your password on each call |
| A task pinned to Claude, Codex, or GLM | refused with `409 individual_model_unsupported` | runs |
| `GET /api/v1/models` | leaves out every user-scoped model, and says so | resolves under you |

**A system token is the default and usually the right one.** It belongs to the workspace rather than
to a person, so a CI job or a shared integration holding one cannot spend anybody's individual
subscription, and neither can a leak of it. That is also why such a task is refused rather than
quietly run on something else: charging a person who is not present, on a credential their vendor
licenses to them alone, is the outcome the refusal exists to prevent.

**Mint a personal token when the runs genuinely are yours** — driving your own headless work from a
script, for instance. Then:

- Every call that starts, retries, or answers a decision on such a run must carry your personal
  password in the `X-Personal-Password` header. Not only the first one: answering a parked decision
  wakes the run's next step, which needs the credential again.
- A call that needs the password and does not carry it is refused with `428 credential_required`,
  and the body's `details` names the `vendor` and whether the password was missing or wrong. Prompt
  for it and retry.
- **The password is never stored** — not by the server, and not on the key. Keeping a copy in a
  config file beside the token would put both halves of a two-factor credential in one place, which
  is exactly what the [personal password](../guide/model-providers.md#why-a-personal-password)
  exists to prevent. Ask for it when your program starts and hold it in memory.

A key can only ever be bound to **the person minting it**. There is no field for naming anyone else,
so nobody can mint a token onto a colleague's subscription, and a token minted through the API
(`POST /api/v1/keys`) is always a system token.

## Managing keys

Create and revoke keys from the app. Open the **Integrations** hub, find **API access tokens** under
the **Development** group, and manage keys there:

- **Create a token**: enter a label (for example "CI pipeline"), pick a scope (Read only, Read and
  write, Decide, or Full access; Read and write is the default), and pick **Runs as** (this
  workspace, or you — see [Who a key runs as](#who-a-key-runs-as)). The secret is revealed once on a
  "Copy your token now" panel and cannot be recovered afterward.
- **Active tokens** lists each key with its label, scope badge, creation date, last-used time, and
  who created it. A personal token also carries a "Your subscription" badge, so you can tell at a
  glance which of your tokens reaches your own credentials. Revoke a key from its row (you confirm
  first). To rotate a key, revoke it and mint a new one; there is no edit-in-place.

A workspace may hold up to 50 live keys.

The same operations are available on session-authenticated endpoints (called with the app's own
session, guarded by the `secrets.manage` permission) for scripting key management:

| Method & path | What it does |
| --- | --- |
| `GET /workspaces/:workspaceId/public-api-keys` | List live keys (metadata only: id, label, scope, creator, timestamps). |
| `POST /workspaces/:workspaceId/public-api-keys` | Mint a key. Body `{ "label": "…", "scope": "read\|write\|admin", "actsAsSelf": false }` (both optional; scope defaults to `write`, `actsAsSelf` to `false`, a [system token](#who-a-key-runs-as)). Returns `{ key, secret }`; the raw secret is shown once and is not recoverable. |
| `DELETE /workspaces/:workspaceId/public-api-keys/:id` | Revoke a key (idempotent). |

These inbound `public-api-keys` are distinct from the outbound `api-keys` provider-key pool that
[custom providers](./custom-providers.md) draw on.

## Client SDKs

Official clients ship for four languages, so an integration does not have to write HTTP by hand:

| Language | Install |
| --- | --- |
| TypeScript | `npm install @cat-factory/sdk` |
| Python | `pip install cat-factory-sdk` |
| Go | `go get github.com/kibertoad/cat-factory/sdk/go@latest` |
| Java / Kotlin | `ai.catfactory:cat-factory-sdk` on Maven Central (one artifact serves both) |

Their models and operation methods are generated from the same OpenAPI document the server
publishes, so a client cannot drift from the deployment it talks to. Each client's transport is
hand-written on top and implements the conventions on this page for you: keyset auto-pagination,
SSE framing, bounded retries on idempotent requests only, and an exception type per HTTP status
class with the machine-readable `code` exposed verbatim as a string rather than narrowed to a
closed enum.

There is no separate Kotlin client. The Java artifact is annotated (`@NullMarked`/`@Nullable`),
escapes Kotlin's hard keywords, exposes a sealed error hierarchy, and offers builders in place of
default arguments, so it is idiomatic from Kotlin without a second client to keep in step.

The SDKs are a typed skin over exactly the endpoints below. Scopes, error codes and paging rules
are identical whichever you use.

## Error codes

Every failure is `{ "error": { "code", "message", "details"?, "issues"? } }`. Branch on `code`,
never on `message`. Two families appear:

- Status-class codes: `validation` (400 for a malformed body or query, 422 for a domain rule),
  `not_found`, `conflict`, `unauthorized`, `forbidden`, `credential_required` (428),
  `rate_limited` (429), `unavailable` (503), `internal`. A 400 validation failure also carries
  `issues: [{ path, message }]`.
- Surface-specific codes unique to `/api/v1`:

| Code | Status | Raised by |
| --- | --- | --- |
| `insufficient_scope` | 403 | any route, when the key's scope is below the minimum |
| `invalid_cursor` | 400 | any paginated list, on a malformed `cursor` |
| `pipeline_not_public` | 400 | `POST /jobs` with an unknown or non-public pipeline |
| `pipeline_not_inline` | 400 | `POST /jobs` with a pipeline that has container or GitHub steps |
| `pipeline_requires_decide_scope` | 403 | `POST /jobs` and `POST /tasks/:id/start` when the pipeline can park on a human |
| `too_many_active_runs` | 429 | `POST /jobs` when five headless jobs are already in flight |
| `pipeline_required` | 400 | `POST /tasks/:id/start` with no pinned pipeline and no `pipelineId` |
| `service_archived` | 409 | `POST /tasks/:id/start` under an archived service |
| `service_has_unfinished_tasks` | 422 | `DELETE /services/:serviceId` on a frame still holding work in flight. `details.unfinishedTasks` is the count; nothing is deleted. See [Taking a service back down](#taking-a-service-back-down) |
| `individual_model_unsupported` | 409 | a [system token](#who-a-key-runs-as) starting, retrying, or `act`ing on a run that would use a personal-credential model. A personal token gets `428 credential_required` instead, which it can answer with the password |
| `no_run` | 404 / 409 | run reads (404: never started) and stop/retry (409: nothing to act on) |
| `no_review` | 404 | requirements decision routes when the run has no live review |
| `notification_not_actionable` | 409 | `POST /notifications/:id/act` on a card with no automated action |

## Setting a workspace up

Everything under [Board workloads](#board-workloads) assumes a workspace that already has a
repository, a cluster to deploy onto and a wired model. Getting there is on the surface too, so a
deployment can provision itself end to end without anyone opening the app.

| Method | Path | Scope | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/repos/available` | admin | The repositories the connection can reach, linked here or not. |
| `POST` | `/api/v1/repos/link` | admin | Adopt a reachable repository by `owner`/`name`. Idempotent. |
| `POST` | `/api/v1/repos/bootstrap` | admin | Create a repository and let the bootstrapper agent write it. Returns a job to poll. |
| `GET` | `/api/v1/repos/bootstrap/{jobId}` | admin | Poll one bootstrap. |
| `POST` | `/api/v1/environments/connections/test` | admin | Probe a cluster connection without saving it. |
| `POST` | `/api/v1/environments/connections` | admin | Bind per-run environments to a cluster. Re-connecting replaces. |
| `PATCH` | `/api/v1/services/{serviceId}` | admin | Patch a service, including where its manifests live. |
| `DELETE` | `/api/v1/services/{serviceId}` | admin | Take a service back down: its subtree and the run history under it (destructive). See [Taking a service back down](#taking-a-service-back-down). |
| `GET` | `/api/v1/models` | admin | Which models a run here could actually dispatch to. |
| `GET` | `/api/v1/vcs/connection` | admin | The source-control connection, and what it is permitted to do. |
| `GET` | `/api/v1/risk-policies` | admin | The risk policies a task can pin, and which one an unpinned task of **yours** resolves. |
| `GET` | `/api/v1/model-presets` | admin | The model presets a task can pin, and which one an unpinned task resolves. |

These reads are `admin` rather than `read`, unlike `GET /api/v1/repos`. They name what the
**deployment** has wired, including the permissions its source-control credential holds, where the
board reads name board content, and anyone able to read that is already at the rung that could
change it.

### Check what is wired before you spend anything

Each of these reads exists because the alternative is discovering the same fact forty minutes into a
run you have already paid for.

- `GET /api/v1/models` separates states that need **opposite** fixes. `available: false` with
  `policyBlocked: false` means nothing is configured for that model, so add a provider key.
  `policyBlocked: true` means it is configured and your account's model-family policy refuses it, so
  a key changes nothing and the fix is the policy. A third case is neither, and is covered under
  [Models a key cannot spend](#models-a-key-cannot-spend) below.
- `GET /api/v1/vcs/connection` exists for `canCreateRepos` and `canManageWorkflows`. Both are
  enforced by the provider at **push** time, so skipping this check turns a missing workflow
  permission into a repository that bootstrapped and then failed to gain its CI workflow, which
  reads like a broken bootstrap rather than a permission you can grant.
- `GET /api/v1/risk-policies`: read the **`isUnattendedDefault`** row, not the `isDefault` one. A
  workspace carries two defaults, and `isDefault` is the policy a task resolves when a person starts
  it in the app; every run this API starts resolves the unattended one, as do tracker dispatches and
  schedule fires. `isDefault` still means exactly what it always did, so an existing client is not
  wrong about anything it was told, it was told about the other scope. See
  [Whether your runs can finish on their own](#whether-your-runs-can-finish-on-their-own).
  On that row, `autoMergeEnabled` decides whether a run can land its pull request with no person
  involved. Two caveats this API cannot settle for you, because
  it does not report which workspace role your key's runs are admitted under: a non-empty
  `dryRunRoles` means the policy merges for some roles and not others, and a non-empty
  `submissionRestrictedRoles` means a run outside an allowed change class is held for a person
  however good its scores are. Report those rather than concluding "this policy merges".
- `GET /api/v1/model-presets`: which model each agent step runs on, so what a run costs. Read
  `overrides` as well as `baseModelId`: two presets often differ only in what the **coder** gets.
  Whether a preset's model can be dispatched to is not repeated here; join `baseModelId` onto
  `GET /api/v1/models`, which keeps unconfigured and policy-refused apart.

### Models a key cannot spend

Some models run on a credential that belongs to a **person** rather than to the workspace, and those
read `available: false` with `policyBlocked: false` even though the model is perfectly well wired.
Adding a provider key does nothing for them. Two fields on each row of `GET /api/v1/models` tell that
case apart from a genuinely unconfigured one:

- **`personalSubscription`** is true when the model declares a subscription route whose vendor is
  licensed for individual use only (Claude, Codex, GLM). Its credential is stored per person, so a
  key that resolves no user never consults it. Poolable vendors are deliberately excluded: their
  token belongs to the workspace, so every key can already see it, and the fix there is a pooled
  token or a provider key rather than a re-minted key.
- **`subscriptionConfigured`** is whether a live personal subscription for that vendor is actually
  stored for the person this key belongs to: its `actsAsUserId` when the key is bound, otherwise the
  person who minted it.

Read together, `available: false` beside `subscriptionConfigured: true` means the subscription is
there and **this** token is not bound to it. The remedy is a key minted with **Runs as: me** by the
subscription's owner, plus the `X-Personal-Password` header on the calls that spend it (see
[Using your subscription from a script](../guide/model-providers.md#using-your-subscription-from-a-script)).
Availability itself is unchanged by all this: it still resolves under the key's bound user alone, so
the two statements coexist honestly.

`subscriptionConfigured` is `null` when nobody was asked, and `null` is **not** a shy `false`. It
means there was no person to ask about (a key provisioned headlessly through `POST /api/v1/keys`),
the deployment stores no personal subscriptions, or the row is not a personal-subscription model at
all. "Asked, and there is none" is a subscription to connect; "there was nobody to ask" is a token to
mint in the app. A client that collapses the two sends an operator to a screen that was already
correct.

::: warning What an unbound key learns
On a key with no bound user the person asked about is its **minter**, who need not be whoever holds
the key, and that provenance is never re-validated against current membership. So an `admin`-scoped
key handed to CI learns one bit (a live subscription for this vendor exists, or does not) about a
named colleague, including one who has since left. The bit is existence only, never the person, the
vendor account, or the credential, and the route floors at `admin` scope.
:::

`userScoped` still appears on every row and still answers what it always did, the subscription route
**in force**. Prefer `personalSubscription`, which is read off what the model declares and so is
correct for a model reachable both by subscription and by a metered gateway. `userScoped` is
superseded and goes away in a future major version.

Separately, `excludesUserScopedModels` on the envelope is not about subscriptions. It reports that
the deployment serves per-user **locally-run** endpoints this read could not enumerate, because they
belong to one person's machine and an unbound key cannot be handed someone else's. Those models are
absent from the list entirely, where a personal subscription's model is present and merely
unavailable.

### Whether your runs can finish on their own

Nothing is watching a run this API starts, so a checkpoint raised for a person stops it until somebody
opens the app. `autonomy` on `GET /api/v1/risk-policies` is the field that answers whether that can
happen, and the row to read it on is `isUnattendedDefault` (or the policy your task pins as
`riskPolicyId`).

- **`attended`**: a run can park on a judgement call `GET /api/v1/runs/{runId}/decisions` will list
  and only a human can settle — a companion at its rework cap, a judge at its bounce cap, an iterative
  review at its pass cap, follow-up items nobody triaged. With nobody to escalate to, the run waits
  indefinitely. This is what every policy created without saying otherwise gets, and what an
  unrecognised value reads as.
- **`unattended`**: the platform takes the documented "proceed" answer to each of those and records on
  the step that it did.

Neither value covers a checkpoint the **pipeline** asks for. A `human-test` step, a review gate or an
approval gate stops the run either way, which is what keeps this a statement about waiting rather than
about oversight. When you report what a policy will do, keep the two apart.

Every workspace seeds an **Unattended delivery** policy (`mp_unattended`) as its unattended default:
identical to that workspace's own in-app default in every ceiling, budget and per-role restriction,
with `autonomy` the only difference. A deployment that wants its API-started runs to keep parking
re-points `isUnattendedDefault` at a policy whose `autonomy` is `attended`. See
[Runs nobody is watching](../guide/pull-requests.md#runs-nobody-is-watching).

### Adopting a repository you already have

`GET /api/v1/repos` lists the repositories this workspace has **linked**, and linking is an explicit
per-workspace act: the provider webhook for an added repository does not project one, and a resync
refreshes what is already linked rather than rediscovering the installation. So a repository that
exists and is perfectly reachable is absent from that list in exactly the way one that was never
created is, and `POST /api/v1/services` answers `404` for its `repoId` either way. Two reads and one
write settle it:

```
GET  /api/v1/repos/available?q=acme/payments-api
POST /api/v1/repos/link
{ "owner": "acme", "name": "payments-api" }
```

The two reads are a **population pair**, not a duplicate. `/repos` is what is linked, so every row
carries a `repoId` a service can be created against; `/repos/available` is what the connection can
reach, with `linked` as the join. A repository missing from both does not exist, where one present in
the second with `linked: false` is waiting to be adopted. Pass `q` as an exact `owner/name` for an
authoritative point-read, as a substring to search, or omit it to browse.

Four things to plan for:

- **The adopt takes a name, not a `repoId`.** A caller setting a workspace up from configuration
  knows the name and cannot know a provider id no public read lists. The response carries the
  `repoId` for the service-creation call that follows.
- **It is idempotent and answers `200` either way.** A repository this workspace already links comes
  back as its existing row, so a setup script re-running itself needs no special case. That is
  resolved from what the workspace links before the provider is consulted, so it holds even for a
  repository the credential can no longer see.
- **Both reads report whether the repository is spoken for**, through `serviceId` and
  `linkedElsewhere`. A repository nobody here has linked can still back a service on another board of
  the account, and service creation refuses it either way, so check the flags before adopting.
- **`truncated: true` on the available read means the rows are a prefix.** The provider legs behind
  it stop at a page cap and a search cap, so on a wide connection a reachable repository can be
  missing from a browse. Narrow with `q` rather than concluding it does not exist; a point-read is
  never truncated.

A repository the connection cannot reach is a `404` with `details.reason: repo_not_reachable`, which
covers both "it does not exist" and "your credential is not granted it": a provider answers those
identically. A credential the provider **rejects** is kept apart from both, as `503` with
`details.reason: vcs_credential_rejected` (re-connect the workspace; an app installation may have
been removed or a token revoked), and a throttled connection as `429`
`details.reason: vcs_rate_limited`, which is the one failure here worth retrying.

### Bootstrapping a repository

```
POST /api/v1/repos/bootstrap
{ "repoName": "payments-api", "type": "service",
  "instructions": "A Fastify service exposing a paginated catalog over Postgres." }
```

Supply either `instructions` or a `referenceArchitectureId` (a repository the platform clones and
adapts); a request with neither describes no work and is refused. The response is a job, and its
`serviceId` is the board service the run materialises. That id exists immediately, so you can file
work against the service while its repository is still being written.

Poll `GET /api/v1/repos/bootstrap/{jobId}` until `status` is `succeeded` or `failed`. On a failure,
read `failureKind` before retrying: a `preflight` refusal (the repository already has content,
nothing is connected) cannot be retried into success, where an `evicted` container can.
`failureDetail` and `failureHint` carry the platform's own diagnosis, so relay them rather than
paraphrasing.

### Connecting a cluster, and pointing a service at its manifests

These are two halves on purpose: the **engine** is one cluster per workspace, and the **source** is
one set of manifests per service. A cluster on its own provisions nothing. Connect one and skip the
per-service half and every deploy reads an empty manifest source, which surfaces as an empty
environment that looks like a cluster fault.

```
POST /api/v1/environments/connections/test
{ "connection": { "engine": "kubernetes",
    "kubernetes": { "label": "Staging", "apiServerUrl": "https://cluster.example:6443",
      "namespaceTemplate": "env-{{pullNumber}}",
      "url": { "source": "ingressTemplate", "hostTemplate": "{{namespace}}.preview.example.com" } } },
  "secrets": { "apiToken": "..." } }
```

A cluster that refuses the credential is an **answer**, not an error, so that comes back as `200`
with `ok: false` and a message. Send the same body to `POST /api/v1/environments/connections` to
persist it. The response lists which secret **keys** were stored and never their values, and no read
returns them: a credential goes in and does not come back out.

```
PATCH /api/v1/services/{serviceId}
{ "provisioning": { "type": "kubernetes",
    "manifestSource": { "type": "colocated", "path": "deploy/k8s", "renderer": "raw" } } }
```

`provisioning` is a tagged union whose non-matching branches are ignored, so read it back off the
response rather than trusting the `200`: a wrong-shaped patch is accepted and stored as something the
deploy step later reads as "no manifests". An omitted `provisioning` leaves the stored one alone, so
correcting a title cannot silently un-deploy a service.

### Taking a service back down

Whoever raises a service is whoever has to reclaim it: an environment rebuilt per test pass, a
repository retired, a frame created against the wrong one. That is the same rung as raising it, so
the delete is `admin` too, and it is the last board write that used to need a person in the app.

```
GET    /api/v1/services/blk_api/tasks     # what is under it
DELETE /api/v1/tasks/blk_task             # each unfinished task, if you mean it
DELETE /api/v1/services/blk_api           # 204: the frame, its subtree, its run history
```

It takes the frame, its modules, its tasks and the run history recorded under them. A run still going
underneath is stopped and its container killed first, so nothing is left idling. Two answers to
branch on rather than retry:

- **`422`, `reason: service_has_unfinished_tasks`.** A frame holding a task that has not finished is
  refused, because deleting one discards work in flight along with its history. `details` carries
  `unfinishedTasks`, the count. The refusal is decided **before** anything is torn down, so a `422`
  leaves the frame, its tasks and their runs exactly as they were: retrying changes nothing, and the
  runs still going are still yours to stop or resume. Deleting those tasks first is you saying you
  mean it.
- **`404` for an ARCHIVED service.** Every per-service endpoint addresses exactly the population
  `GET /api/v1/services` reports, and an archived frame is absent from it. Archiving is the app's
  answer to "keep it but hide it", and this surface publishes neither the archive nor the restore, so
  a frame you archived is one to handle in the app.

## Board workloads

The bulk of the surface drives the board headlessly. Nothing here spins up a browser session; a run
started over the API executes exactly as one started from the board and appears on it.

The table below is the shape of the workload, annotated with what each call is FOR. It is not the
complete parameter list for any of them: that is the
[API Endpoint Reference](../reference/api-reference.md#operations), which enumerates every operation
on the surface, including the ones no narrative here reaches for.

| Method | Path | Scope | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/services` | read | List the workspace's services. |
| `POST` | `/api/v1/services/{serviceId}/tasks` | write | Create a task. Body `{ title, description?, taskType?, ticket?, modelPresetId?, riskPolicyId? }`; `taskType` is one of `feature`, `bug`, `document`, `spike`, `review`, `ralph` (default `feature`). See [Filing a task from a tracker ticket](#filing-a-task-from-a-tracker-ticket) and [Pinning a model preset and a risk policy](#pinning-a-model-preset-and-a-risk-policy). |
| `GET` | `/api/v1/services/{serviceId}/tasks` | read | List a service's tasks (its whole subtree), newest first. Paged; see [Paging](#paging). Filter with `?status=`. |
| `GET` | `/api/v1/tasks/{taskId}` | read | Get a task's status projection: `{ taskId, serviceId, title, description, taskType, status, progress, runId, pullRequestUrl, modelPresetId, riskPolicyId }`. |
| `PATCH` | `/api/v1/tasks/{taskId}` | write | Edit the task's title or description, or correct either pin. |
| `POST` | `/api/v1/tasks/{taskId}/start` | write | Start the task's pipeline. Body `{ pipelineId? }`, falling back to the task's pinned pipeline. |
| `POST` | `/api/v1/tasks/{taskId}/stop` | write | Stop the in-flight run (idempotent; the run stays retryable). |
| `POST` | `/api/v1/tasks/{taskId}/retry` | write | Retry a failed run. |
| `DELETE` | `/api/v1/tasks/{taskId}` | admin | Delete a task and its run history (destructive). |
| `GET` | `/api/v1/tasks/{taskId}/run` | read | Rich run projection: per-step state, progress, subtasks, failure, and the PR URL and branch. |
| `GET` | `/api/v1/tasks/{taskId}/events` | read | Stream the run as Server-Sent Events (`progress`, `done`, `error`, `timeout`), for up to five minutes. |
| `GET` | `/api/v1/pipelines` | read | Discover pipelines: each entry is `{ pipelineId, name, steps, public, headlessStartable }`. Use it to find a valid `pipelineId` and confirm a pipeline can start headlessly. |

`taskType` also accepts a namespaced custom task type (`<namespace>:<name>`) the deployment
[registered](./frontend-extensions.md#custom-task-types), so an "incident" or
"compliance-audit" is creatable over the API like any built-in type.

A few refusals are worth planning for:

- Starting, retrying, or acting on a run whose steps use an **individual-usage** (personal-credential)
  model returns `409 individual_model_unsupported`: a headless key cannot unlock a personal
  subscription. Use a pipeline whose models come from the account/workspace pools.
- Starting a task under an archived service returns `409 service_archived`; a task with no pipeline
  returns `400 pipeline_required`.
- Starting a run on a pipeline that can **park** on a human decision needs the `decide` scope. A
  `write` key is refused at admission with `403 pipeline_requires_decide_scope`, and the message
  names which of the pipeline's park surfaces the API can answer and which it cannot.

A pipeline counts as parking in any of three ways:

- an **approval gate** on an enabled step;
- an inline **review or brainstorm** kind (`requirements-review`, `clarity-review`, and the two
  brainstorms), which sets the run `blocked` awaiting an answer;
- an unbounded **human-wait gate** (`human-review`), a gate step whose poll never times out because
  it is waiting for a person to look at the PR.

The third case covers the shipped **Adaptive build** preset, which carries a risk-gated
`human-review`, so a `write`-only key cannot start it. The unconditional presets (**Standard build**,
**Simple build**) never park and stay `write`-startable. Parks raised dynamically mid-run (an
agent-raised decision, a judge park) are not knowable in advance and do not gate the start.

The inline-only restriction applies to headless jobs, not board tasks: a `decide` key may start
container pipelines on board tasks.

### Filing a task from a tracker ticket

An intake integration usually already holds the ticket the work came from. Name it on the create
call and the platform imports the issue and attaches it to the new task, instead of you flattening
it into `description`:

```http
POST /api/v1/services/svc_api/tasks
Content-Type: application/json

{ "title": "Fix cat photo 404s", "taskType": "bug",
  "ticket": { "source": "jira", "ref": "https://acme.atlassian.net/browse/PROJ-1" } }
```

`source` is a tracker this workspace has connected and enabled (`jira`, `github`, `linear`, or a
`<namespace>:<name>` source the deployment [registered](../guide/issue-sources.md#registering-a-tracker-from-a-deployment)).
`ref` is the issue's canonical key or its full URL; the provider's own parser resolves either, so
you can forward whichever form your webhook carried.

That link, not the ticket's text, is what the rest of the platform runs on. Every agent step
re-reads the live issue as context (status, labels, description, comments), the run's clarification
questions are written back onto the issue, a reply typed there resolves against the parked run, and
the recurring intake sweep treats the issue as taken. `description` stays your own framing and is
never overwritten.

Two refusals matter:

- The ticket is resolved **before** the task is created. An unconfigured or disabled source, a ref
  the provider cannot parse, or an issue the tracker will not serve refuses the whole request and
  leaves the board untouched, rather than handing you a `201` for a task that runs on its title
  alone.
- **One task per ticket.** A ticket already linked comes back `409` with
  `details.reason: "ticket_already_linked"` and `details.taskId` naming the task that holds it, so a
  redelivered webhook follows the existing task instead of filing a duplicate. You need no
  bookkeeping of your own to stay idempotent, and that holds under concurrency: two deliveries of
  one ticket in flight together are decided by a conditional write, so exactly one gets a task and
  the other gets the `409` naming it. The losing filing is rolled back off the board rather than
  left behind ticket-less.

### Reading and setting tracker writeback

Filing a task from a ticket is half the loop. The other half is whether the platform ever tells that
ticket what happened, which is workspace configuration, and a deployment driven entirely over the API
can read and move it without opening the app:

```http
GET   /api/v1/tracker/writeback
PATCH /api/v1/tracker/writeback

{ "writeback": { "resolveOnMerge": false } }
```

Both answer the same body: a `writeback` object of three independent booleans, plus `updatedAt`.

- **`commentOnPrOpen`**: comment on the linked issue when the task's pull request opens.
- **`resolveOnMerge`**: comment on and **close** the linked issue when that pull request merges.
- **`questionsOnPark`**: post a headless run's parked requirements-review findings on the linked
  issue, each with the id an answer names, so the reporter can answer where they filed. Only
  consulted for runs started through this API or dispatched from a ticket.

Three flags rather than one switch, because they are separately answerable: a workspace can want the
merge recorded on the ticket without wanting a parked review's questions asked there.

All three **default on**. Writeback only ever touches an issue a task is linked to, and nothing links
one by accident, so the default closes the loop rather than leaving a merged pull request beside an
open issue with nothing on it. Note this when you file ticket-linked tasks: unless the workspace has
chosen otherwise, the platform will comment on and close the issues you name.

Two properties worth planning for:

- **The `PATCH` merges.** An omitted action keeps whatever the workspace holds, so one decision moves
  one action and a caller acting on `resolveOnMerge` cannot silently move the other two. An empty
  patch is a no-op and does not stamp `updatedAt`. That is unlike the in-app save, which has all
  three rendered in front of it and replaces the row wholesale.
- **`updatedAt` is `null` when nobody has ever chosen.** The values you read are then this
  deployment's defaults rather than anyone's decision, which is what lets you tell a workspace you
  are safe to configure from one whose choice you are about to overwrite. It is `null` and not an
  epoch timestamp precisely so it cannot be formatted as a setting saved in 1970.

Both calls need an `admin`-scoped key: this is workspace-wide configuration, so enabling
`resolveOnMerge` changes what happens to every other task's ticket on the board too.

The read covers the writeback half only, not the **filing** tracker (which tracker the tech-debt
recurring pipeline raises its ticket on, and that vendor's project key or team). The two are
independent: writeback follows each linked issue's own source, so a workspace with no filing tracker
selected still writes back to the GitHub issue a task was filed from. See
[Writing back to the tracker](../guide/issue-sources.md#writing-back-to-the-tracker) for the in-app
panel and the per-task override.

### Pinning a model preset and a risk policy

A task can name what it runs on and how much oversight landing it takes, instead of inheriting both
from the workspace default:

```http
POST /api/v1/services/svc_api/tasks

{ "title": "Fix cat photo 404s", "taskType": "bug",
  "modelPresetId": "mdp_claude", "riskPolicyId": "mp_manual_review" }
```

Read the ids off `GET /api/v1/model-presets` and `GET /api/v1/risk-policies` rather than deriving
them: the built-in model presets are `mdp_kimi`, `mdp_glm` and `mdp_claude`, and the built-in risk
policies are `mp_balanced`, `mp_unattended` and `mp_manual_review`, so the two libraries do not share
a prefix and a workspace that has edited either carries ids of its own. Both pins are optional, both
come back on the task read, and `PATCH /api/v1/tasks/{taskId}` corrects either. Omitting one means
what it always meant: the task follows the workspace default rather than holding a copy of its id, so
moving that default moves the task. For `riskPolicyId` that default is the **unattended** one, since
nothing is watching a run this API starts.

Pinning is what makes an automated pass reproducible. Without it, the only way to run one task on a
different model is to move the workspace default, which changes every other caller's runs to settle
one task.

What matters to a caller is the **refusal**, not the fields:

- An id no library in this workspace carries is `422` with
  `details.reason: model_preset_not_found` / `risk_policy_not_found`, never a quiet fall back to the
  default. The two outcomes are indistinguishable afterwards from anything you can read, and a run
  that succeeded on another model is worse than one that refused.
- A deployment with the library unwired answers `503` with
  `details.reason: model_presets_unwired` / `risk_policies_unwired` for a caller that pinned one.
  That is a different fact from an unknown id and needs a different fix, so the two list endpoints
  answer with the same two reasons.
- **The refusal does not name the library's contents.** Pinning takes `write` and both lists take
  `admin`, so a `422` carrying the available ids would let the lower rung enumerate by typo exactly
  what the higher one gates. It names the id that missed and which library it missed.

Pinning a model preset does not widen what the account allows: the base model still resolves through
the account's model-family policy, so a preset naming a blocked model fails at dispatch with the same
refusal it would have had on the workspace default. `riskPolicyId` is the pin that changes what a run
may **do**, since a policy carries `autoMergeEnabled`, the score ceilings and `autonomy`. An `admin`
key may pin any policy its workspace holds, which is the authority it already had by editing one.
That is a wider licence than a board member has: in the app, somebody who does not manage the policy
library cannot re-point a task from an attended policy onto an `unattended` one, because dropping the
run's human checkpoints is a permission rather than a preference.

## Paging

The two list endpoints that can grow without bound, `GET /api/v1/services/{serviceId}/tasks` and
`GET /api/v1/jobs`, are **keyset-paginated**. Each response carries its array (`tasks` or `jobs`) plus
a `nextCursor`, and you page until `nextCursor` is `null`:

| Parameter | Meaning |
| --- | --- |
| `limit` | 1–100. The server caps a page at 50 entries regardless. |
| `cursor` | The previous response's `nextCursor`. Omit for the first page. |
| `status` | Filter by status. Tasks: `planned`, `ready`, `in_progress`, `blocked`, `pr_ready`, `done`. Jobs: `running`, `succeeded`, `failed`. |
| `since` | Jobs only. Epoch milliseconds; return jobs created at or after this. |

The cursor is a keyset (a sort key plus an id), not an offset, so a page can't shift under concurrent
inserts and silently skip a row, and a burst of runs sharing a millisecond pages correctly. A
malformed cursor is a `400 invalid_cursor` rather than a silent re-serve of page 1.

`GET /api/v1/jobs` lists the workspace's headless initiative jobs newest first. It exists so an
integration that lost its stored job ids can rediscover its own in-flight runs. Its scoping is applied
in SQL, so an external key can never enumerate ordinary board runs through it.

## Answering a parked run

A run started over the API can pause on a human decision, the same requirements-review and
implementation-fork parks the app surfaces. A `decide`-scoped key answers them over
`/api/v1/runs/{runId}/decisions`. Every route delegates to the same service methods the app's own
controllers call, so the arbitration between the two surfaces is identical whichever answers first.

| Method | Path (under `/api/v1/runs/{runId}/decisions`) | Scope | Purpose |
| --- | --- | --- | --- |
| `GET` | (base) | read | List the run's parked decisions: review findings with stable item ids, the iteration and its cap, the incorporated document, the proposed implementation forks, and any judge verdict. |
| `POST` | `/requirements/findings/{itemId}/reply` | decide | Answer one review finding. |
| `PATCH` | `/requirements/findings/{itemId}` | decide | Dismiss or reopen a finding. |
| `POST` | `/requirements/incorporate` | decide | Incorporate the answers into the requirements. |
| `POST` | `/requirements/re-review` | decide | Re-review the incorporated document. |
| `POST` | `/requirements/proceed` | decide | Proceed with the requirements as they stand. |
| `POST` | `/requirements/resolve-exceeded` | decide | Resolve a review that hit its iteration cap. |
| `POST` | `/fork/choose` | decide | Choose one of the proposed implementation approaches. |
| `POST` | `/judge/resolve` | decide | Resolve a judge step's parked verdict. |

Every route returns the refreshed decision list, so you can drive the loop without a separate poll.

A parked run waits for a human **indefinitely** by design, and it holds one of the workspace's
in-flight slots while it waits. `POST /api/v1/jobs/{id}/cancel` (`write`) is there so the cap stays a
recoverable `429` rather than a wall with no door.

### Learning that a run parked

Polling is the fallback, not the design. Two pushes carry a park outward:

- **SSE**: both public streams stay open across a park and emit a `decision` frame.
- **Outbound webhook**: a per-workspace HTTPS endpoint that receives notifications as they are raised.
  See [Set Up Notifications → Outbound webhooks](../operate/notifications.md#outbound-webhooks).

You can also echo the open questions onto the task's linked tracker issue, so the clarification
reaches whoever asked for the work. See
[Connect Issue & Document Sources → Writing back to the tracker](../guide/issue-sources.md#writing-back-to-the-tracker).

## Notification inbox

A key can read and clear the workspace's notification inbox, so an external system can react to
merge-review requests, completed pipelines, and gate failures.

| Method | Path | Scope | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/notifications` | read | List the workspace's open notifications. |
| `POST` | `/api/v1/notifications/{id}/act` | admin | Run the card's automated side-effect (merge the PR, retry the run), then resolve it. |
| `POST` | `/api/v1/notifications/{id}/dismiss` | write | Dismiss a card without acting on it. |

`act` only accepts cards with an automated action: `merge_review`, `pipeline_complete`, `ci_failed`,
`test_failed`, and `deploy_blocked`. Any other open card returns `409 notification_not_actionable`;
dismiss it instead.
A merge triggered through `act` uses the deployment's GitHub installation token.

## Headless jobs

A headless job runs a public, inline pipeline against a supplied brief. It is not a board task,
never touches a repository, and never appears on any board. Breaking down an initiative is the
built-in case:

```
POST /api/v1/jobs
Authorization: Bearer cf_live_<keyId>.<secret>
Content-Type: application/json

{ "pipelineId": "pl_initiative_breakdown", "input": "<the brief>", "title": "optional" }
```

The `input` is the brief (1–50,000 characters). The platform plans it headlessly (no container, no
checkout, nothing pushed to a repo). The call returns `202` with a `jobId` and links to poll:

```json
{ "jobId": "…", "status": "running", "links": { "self": "/api/v1/jobs/…", "events": "/api/v1/jobs/…/events" } }
```

Poll for the result:

- `GET /api/v1/jobs/:id` returns `{ jobId, status, pipelineId, createdAt, result, error }`. `status` is
  `running`, `succeeded`, or `failed`; `result` (the agent's prose plus an optional structured
  decomposition) is present once the job has succeeded.
- `GET /api/v1/jobs/:id/events` streams the same job as Server-Sent Events (`progress`, `done`,
  `error`, `stopped`, `timeout`, and `decision` when the run parks), for up to five minutes.
- `GET /api/v1/jobs` lists your jobs, newest first. See [Paging](#paging).
- `POST /api/v1/jobs/:id/cancel` (`write`) cancels an in-flight job and frees its concurrency slot.

Only pipelines published as public inline pipelines are accepted; `pl_initiative_breakdown`
("Break down initiative") is the built-in one. Discover the eligible ones through
`GET /api/v1/pipelines` (they carry `public: true`). A workspace may have at most five headless jobs
in flight at once (a sixth returns `429 too_many_active_runs`). Headless jobs never appear on any
board, and this surface only ever sees the jobs it created, never the workspace's ordinary board
runs.

The **coarse job status** hides board internals: internal `done` maps to `succeeded`, `failed` to
`failed`, and everything else (running, spend-paused, parked) to `running`. The `?status=` filter
uses the same mapping, so it always agrees with the field it filters on.

Headless jobs emit no run-lifecycle webhooks; the job read and its SSE stream already serve them.

## Usage and budget

| Method | Path | Scope | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/usage` | read | The current period's spend and budget position, as one resource. |

The response is `{ periodStart, currency, budget, rows }`. `budget` is the metered position the
spend safeguard acts on: `costSpent`, `costLimit`, and `exceeded: true` when runs are paused at the
cap. `rows` breaks spend down per `(billing, vendor, provider, model)`.

Do not sum the two billing kinds. A `subscription` row's `costEstimate` is illustrative, because a
flat-rate plan bills nothing per token; only `metered` rows are money. The endpoint is workspace-tier
by design, so a workspace key never learns a sibling workspace's spend. See
[Control Spend with Budgets](../guide/budgets.md).

## Run debugging

Eight read-only endpoints under `/api/v1/debug/*` diagnose a run from outside the browser: a run
index, a per-run overview with precomputed signals, and budgeted drill-downs into model calls, agent
context, searches, and provisioning logs. They use the same keys at `read` scope and are keyset
paginated like the other lists.

Because they reach prompt and response bodies, treat a key that can call them as sensitive even
though it is only `read`.

## Streaming

Both `/events` endpoints are `text/event-stream` responses driven by a one-second poll of the
persisted run. Frames are de-duplicated (a frame is sent only when the payload changed) and there is
no heartbeat, so a quiet run produces a quiet stream.

| Event | Meaning |
| --- | --- |
| `progress` | The run advanced. Data is the full job or run projection, the same shape as the GET. |
| `decision` | The run just parked on a human decision. Answer it through `/runs/{runId}/decisions`; the stream stays open, and a later park after a resume is announced again. |
| `done` | Terminal success. The stream closes. |
| `error` | Terminal failure. The stream closes. |
| `stopped` | Jobs stream only: the run ended in a state that still projects as `running`, such as a cancellation. The stream closes. |
| `timeout` | The stream hit its five-minute cap; data is `{}`. Nothing is wrong. Reconnect to keep watching. |

Revoking a key cuts a live stream within about five seconds. Streams are per-run reads bounded by
their own poll; for push at scale, register the
[outbound webhook](../operate/notifications.md#outbound-webhooks) instead.

---

Next: the [API Endpoint Reference](../reference/api-reference.md) for every operation's exact
fields, the [Official SDKs](./sdks.md) if you would rather not hand-roll a client, the
[MCP Server](./mcp-server.md) to give an MCP host the same surface, or the
[Cloudflare OS Gatekeeper](./cloudflare-os.md) to install Cat Factory into a Cloudflare OS workspace
without handing any agent a key.
