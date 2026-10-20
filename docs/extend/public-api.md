---
redirectFrom:
  - /reference/public-api.html
---

# Public API

For developers who drive Cat Factory from outside the app: from CI, a script, another service, or an
agent of your own. Cat Factory has a key-authenticated HTTP API under `/api/v1`. Every operation is
scoped to one workspace and authenticated by a bearer key.

The API covers:

- headless jobs, such as breaking down an [initiative](../guide/initiatives.md) and other inline
  pipelines,
- the full board workload: list services, create and read tasks, start, stop, retry and delete runs,
  and stream progress,
- pipeline discovery,
- parked human decisions,
- a notification inbox,
- the workspace's spend,
- a read-only run-debugging API.

## Start here

1. **Make sure the API is on.** The public API needs
   [`ENCRYPTION_KEY`](../deploy/configuration.md#credential-encryption), because the key hashes are
   sealed with it. Without it, every call returns `503`.
2. **Create a key** in the app. Pick its scope and whose credentials it uses. See
   [Managing keys](#managing-keys), [Scopes](#scopes) and [Who a key runs as](#who-a-key-runs-as).
3. **Use an [official SDK](#client-sdks)** instead of writing HTTP by hand. Clients ship for
   TypeScript, Python, Go and Java/Kotlin.
4. **Set the workspace up**, if it has no repository, cluster or model yet. See
   [Setting a workspace up](#setting-a-workspace-up).
5. **Drive the board.** See [Board workloads](#board-workloads).

This page tells you what to do, in what order, and which rules can cause problems. For the exact
parameters, payload shapes and constraints of each operation, see the
[API Endpoint Reference](../reference/api-reference.md). That page is generated from the same
OpenAPI 3.1 document as the SDK clients, so it always matches the running API. If you generate a
client, point the generator at [the spec itself](https://github.com/kibertoad/cat-factory/blob/main/docs/openapi.json).
Do not copy it by hand.

## Stability

You can build on these as a stable, versioned public API:

- `/api/v1`,
- the official SDK clients,
- the outbound webhook delivery contract.

How each kind of change arrives:

| Change | How it arrives |
| --- | --- |
| Additive: a new endpoint, optional field, enum value, or error code | Without warning. It increases the minor part of the OpenAPI `info.version`. |
| Breaking | Never in place. See the steps below. |
| Wider scope semantics (a key may do more) | Scope semantics change on their own only by widening. |
| Narrower scope semantics (a key may do less) | As a breaking change, with the same steps. |

Write clients that accept fields and enum members they do not recognise. The official SDKs already
do this.

A breaking change ships as a migration path plus a version change:

1. The new shape is served next to the old one, and the old shape keeps working. For example, a new
   field next to the old one, or a new `/api/v2` prefix for a changed path or changed semantics.
2. The deprecation is documented.
3. The old shape is removed only in a later release.

## Authenticating

Send a bearer key on every `/api/v1` request:

```
Authorization: Bearer cf_live_<keyId>.<secret>
```

- **You see the key in full only once**, when you create it. The server stores only a one-way hash
  of the secret (`HMAC-SHA256` under `ENCRYPTION_KEY`), never the secret itself.
- The `<keyId>` is a `pak_…` identifier inside the key. It is not secret.
- A key belongs to one account and workspace. Every call it makes is bound to that workspace.
- An unknown or missing key fails closed with `401`.
- A valid key whose scope is too low for the operation gets `403 insufficient_scope`.

## Scopes

Each key has one scope. The scopes are levels: a higher scope also grants everything below it.

| Scope | Grants |
| --- | --- |
| **Read only** (`read`) | Reads and streams: list services, tasks, jobs, pipelines, and notifications; list a run's parked decisions; poll a job or run; open an SSE stream; read the workspace's [usage and budget](#usage-and-budget); the whole [run-debugging API](#run-debugging). |
| **Read and write** (`write`) | Everything `read` can do, plus changes that destroy nothing: create a task, edit its title or description, start, stop, retry, or cancel a run, break down an initiative, and dismiss a notification. This is the default for a new key. |
| **Decide** (`decide`) | Everything `write` can do, plus answering a run's [parked decisions](#answering-a-parked-run). So it can also start a run on a pipeline that can park. |
| **Full access** (`admin`) | Everything `decide` can do, plus destructive and merge-related actions: delete a task and its run history, and act on a notification (which can do a real merge). |

A run **parks** when it stops to wait for a person to make a [decision](../reference/glossary.md#d).

### Choosing a scope

- **For an integration that only creates and starts work, use `write`.** A `write` key cannot answer
  decisions, and it is refused when it tries to start a pipeline that can park.
- **Give `decide` only when the integration must answer decisions.** An answer puts text from the
  caller into the requirements that every later agent implements, and it lets the run continue.
- **`decide` covers the whole workspace, not only the runs the key started.** The decision endpoints
  find a run by its id, so they reach any run in the key's workspace. This includes a board task that
  a person started in the app. A `write` key already has the same reach over board runs, one level
  lower.
- **Treat even a `read` key as sensitive.** The [run-debugging API](#run-debugging) returns prompt
  and response bodies, which the app shows only to certain workspace roles.

## Who a key runs as

When you create a key, you also choose **Runs as**. This is separate from the scope. The scope says
what a key may **do**. **Runs as** says **whose** credentials, spend, and merge-policy role its runs
use.

| | **This workspace** (system token) | **Me** (personal token) |
| --- | --- | --- |
| Runs it starts belong to | the workspace, attributed to no person | you |
| Your [personal subscription](../guide/model-providers.md#personal-individual-usage-subscriptions) | never reachable | reachable, with your password on each call |
| A task pinned to Claude, Codex, or GLM | refused with `409 individual_model_unsupported` | runs |
| `GET /api/v1/models` | leaves out every user-scoped model, and says so | resolves under you |

### Use a system token by default

A system token is the default, and it is usually the right choice. It belongs to the workspace, not
to a person. So a CI job or a shared integration that holds one cannot spend anybody's individual
subscription, and neither can someone who steals it.

For the same reason, a task that needs a personal subscription is refused. The platform does not run
it on something else. Without the refusal, the platform would charge a person who is not present, on
a credential that their vendor licenses to them alone.

### Use a personal token only for your own runs

Create a personal token when the runs really are yours, for example when a script drives your own
headless work. Then:

1. **Ask for your personal password when your program starts, and keep it in memory.** Never store
   it: the server does not store it, and it is not on the key. Do not keep a copy in a config file
   next to the token. The [personal password](../guide/model-providers.md#why-a-personal-password)
   is the second factor of a two-factor credential, and a file with both defeats it.
2. **Send it in the `X-Personal-Password` header on every call that starts, retries, or answers a
   decision on such a run.** Not only on the first call: answering a parked decision starts the run's
   next step, and that step needs the credential again.
3. **If you get `428 credential_required`, prompt for the password and retry.** The body's `details`
   names the `vendor`, and says whether the password was missing or wrong.

A key can only be bound to **the person who creates it**. There is no field to name anyone else, so
nobody can create a token that uses a colleague's subscription. A token created through the API
(`POST /api/v1/keys`) is always a system token.

## Managing keys

To create a key in the app:

1. Open the **Integrations** hub.
2. Under the **Development** group, open **API access tokens**.
3. Click **Create token**, and enter:
   - a label, for example "CI pipeline",
   - a scope: Read only, Read and write, Decide, or Full access. Read and write is the default.
   - **Runs as**: this workspace, or you. See [Who a key runs as](#who-a-key-runs-as).
4. Copy the secret from the "Copy your token now" panel. It is shown only once, and you cannot get
   it back later.

**Active tokens** lists each key with its label, scope badge, creation date, last-used time, and who
created it. A personal token also has a "Your subscription" badge, so you can see which of your
tokens reach your own credentials.

- **To revoke a key**, use its row. You confirm first.
- **To rotate a key**, revoke it and create a new one. You cannot edit a key in place.

A workspace can hold up to 50 live keys.

### Managing keys from a script

The same operations are available on session-authenticated endpoints. You call them with the app's
own session, and they need the `secrets.manage` permission.

| Method & path | What it does |
| --- | --- |
| `GET /workspaces/:workspaceId/public-api-keys` | List live keys (metadata only: id, label, scope, creator, timestamps). |
| `POST /workspaces/:workspaceId/public-api-keys` | Mint a key. Body `{ "label": "…", "scope": "read\|write\|admin", "actsAsSelf": false }` (both optional; scope defaults to `write`, `actsAsSelf` to `false`, a [system token](#who-a-key-runs-as)). Returns `{ key, secret }`; the raw secret is shown once and is not recoverable. |
| `DELETE /workspaces/:workspaceId/public-api-keys/:id` | Revoke a key (idempotent). |

These inbound `public-api-keys` are not the same as the outbound `api-keys` provider-key pool that
[custom providers](./custom-providers.md) use.

## Client SDKs

Official clients ship for four languages:

| Language | Install |
| --- | --- |
| TypeScript | `npm install @cat-factory/sdk` |
| Python | `pip install cat-factory-sdk` |
| Go | `go get github.com/kibertoad/cat-factory/sdk/go@latest` |
| Java / Kotlin | `ai.catfactory:cat-factory-sdk` on Maven Central (one artifact serves both) |

The SDKs are a typed layer over the same endpoints as on this page. Scopes, error codes and paging
rules are the same whichever you use.

Their models and operation methods are generated from the OpenAPI document that the server
publishes, so a client always matches the deployment it talks to. Each client's transport is written
by hand, and handles these conventions for you:

- keyset auto-pagination,
- SSE framing,
- limited retries, on idempotent requests only,
- one exception type per HTTP status class, with the machine-readable `code` as a plain string, not
  a closed enum.

There is no separate Kotlin client. The Java artifact works naturally from Kotlin:

- it is annotated with `@NullMarked` and `@Nullable`,
- it escapes Kotlin's hard keywords,
- it has a sealed error hierarchy,
- it offers builders instead of default arguments.

## Error codes

Every failure has this shape: `{ "error": { "code", "message", "details"?, "issues"? } }`. Branch on
`code`, never on `message`.

There are two families of codes. The first is status-class codes:

- `validation`: 400 for a malformed body or query, 422 for a domain rule. A 400 validation failure
  also has `issues: [{ path, message }]`.
- `not_found`, `conflict`, `unauthorized`, `forbidden`,
- `credential_required` (428), `rate_limited` (429), `unavailable` (503),
- `internal`.

The second is codes that only `/api/v1` uses:

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
| `service_has_unfinished_tasks` | 422 | `DELETE /services/:serviceId` on a frame that still holds work in flight. `details.unfinishedTasks` is the count; nothing is deleted. See [Taking a service back down](#taking-a-service-back-down) |
| `individual_model_unsupported` | 409 | a [system token](#who-a-key-runs-as) that starts, retries, or `act`s on a run that would use a personal-credential model. A personal token gets `428 credential_required` instead, which it can answer with the password |
| `no_run` | 404 / 409 | run reads (404: never started) and stop/retry (409: nothing to act on) |
| `no_review` | 404 | requirements decision routes when the run has no live review |
| `notification_not_actionable` | 409 | `POST /notifications/:id/act` on a card with no automated action |
| `kaizen_entry_not_found` | 404 | Kaizen entry reads and `POST /kaizen/entries/:entryId/acknowledge` with an id this workspace does not hold |
| `kaizen_entry_not_settled` | 409 | `POST /kaizen/entries/:entryId/acknowledge` on an entry whose grading is still queued or running. `details.status` says where it is; retry once it settles |

## Setting a workspace up

Before you use [Board workloads](#board-workloads), the workspace needs a repository, a cluster to
deploy onto, and a working model. You can set all of this up through the API, so a deployment can
provision itself from start to end without anyone opening the app.

Do it in this order:

1. [Check what is wired before you spend anything](#check-what-is-wired-before-you-spend-anything).
2. [Adopt a repository you already have](#adopting-a-repository-you-already-have), or
   [bootstrap a new one](#bootstrapping-a-repository).
3. [Connect a cluster, and point the service at its manifests](#connecting-a-cluster-and-pointing-a-service-at-its-manifests).

When you no longer need a service, [take it back down](#taking-a-service-back-down).

| Method | Path | Scope | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/repos/available` | admin | The repositories the connection can reach, linked here or not. |
| `POST` | `/api/v1/repos/link` | admin | Adopt a reachable repository by `owner`/`name`. Idempotent. |
| `POST` | `/api/v1/repos/bootstrap` | admin | Create a repository and let the bootstrapper agent write it. Returns a job to poll. |
| `GET` | `/api/v1/repos/bootstrap/{jobId}` | admin | Poll one bootstrap. |
| `POST` | `/api/v1/environments/connections/test` | admin | Probe a cluster connection without saving it. |
| `POST` | `/api/v1/environments/connections` | admin | Bind per-run environments to a cluster. Connecting again replaces the old connection. |
| `GET` | `/api/v1/environments/manifest-types` | admin | The custom manifest types a service's `custom` provisioning may pin. |
| `PATCH` | `/api/v1/services/{serviceId}` | admin | Patch a service, including where its manifests live. |
| `DELETE` | `/api/v1/services/{serviceId}` | admin | Take a service back down: its subtree and the run history under it (destructive). See [Taking a service back down](#taking-a-service-back-down). |
| `GET` | `/api/v1/models` | admin | Which models a run here could actually dispatch to. |
| `GET` | `/api/v1/vcs/connection` | admin | The source-control connection, and what it is permitted to do. |
| `GET` | `/api/v1/risk-policies` | admin | The risk policies a task can pin, and which one an unpinned task of **yours** resolves. |
| `GET` | `/api/v1/model-presets` | admin | The model presets a task can pin, and which one an unpinned task resolves. |

These reads need `admin`, unlike `GET /api/v1/repos`, which needs `read`. Board reads return board
content. These reads return what the **deployment** has set up, including the permissions of its
source-control credential. Anyone who may read that already has the level that could change it.

### Check what is wired before you spend anything

Do these reads before you start paid work. Each one reports a problem that you would otherwise find
only during a run that you already paid for.

| Read | What to check |
| --- | --- |
| `GET /api/v1/models` | Whether each model can be dispatched to, and if not, why. See below. |
| `GET /api/v1/vcs/connection` | `canCreateRepos` and `canManageWorkflows`. |
| `GET /api/v1/risk-policies` | The row with **`isUnattendedDefault`**, not the one with `isDefault`. |
| `GET /api/v1/model-presets` | Which model each agent step runs on, and so what a run costs. |

#### Models

`GET /api/v1/models` separates states that need **opposite** fixes:

| `available` | `policyBlocked` | Meaning | What to do |
| --- | --- | --- | --- |
| `false` | `false` | Usually, nothing is configured for the model. | Add a provider key. But first, check whether it is a model on a personal subscription. See [Models a key cannot spend](#models-a-key-cannot-spend). |
| `false` | `true` | The model is configured, but your account's model-family policy refuses it. | Change the policy. A provider key changes nothing. |

#### Source-control connection

Check `canCreateRepos` and `canManageWorkflows` on `GET /api/v1/vcs/connection`. The provider enforces
both only at **push** time. If you skip this check, a missing workflow permission shows up as a
repository that bootstrapped and then did not get its CI workflow. That looks like a broken
bootstrap, but it is a permission that you can grant.

#### Risk policies

Read the row with **`isUnattendedDefault`**. A workspace has two default policies:

- `isDefault` is the policy that a task uses when a person starts it in the app.
- `isUnattendedDefault` is the policy that every run started through this API uses. Tracker
  dispatches and schedule fires use it too.

See [Whether your runs can finish on their own](#whether-your-runs-can-finish-on-their-own).

On that row, `autoMergeEnabled` says whether a run can merge its pull request with no person
involved. Two fields can change that answer, and this API cannot settle them for you, because it does
not report which workspace role your key's runs are admitted under:

- A non-empty `dryRunRoles` means that the policy merges for some roles and not for others.
- A non-empty `submissionRestrictedRoles` means that a run outside an allowed change class is held
  for a person, however good its scores are.

If either is non-empty, report it. Do not conclude "this policy merges".

#### Model presets

`GET /api/v1/model-presets` tells you which model each agent step runs on, and so what a run costs.
Read `overrides` as well as `baseModelId`: two presets often differ only in the model that the
**coder** gets.

This read does not say whether a preset's model can be dispatched to. To find out, join `baseModelId`
onto `GET /api/v1/models`, which keeps "not configured" and "refused by policy" apart.

### Models a key cannot spend

If `GET /api/v1/models` returns `available: false` and `policyBlocked: false` for a model, do not add
a provider key yet. The model may run on a credential that belongs to a **person**, not to the
workspace. Such a model reads the same way even when it is correctly set up, and a provider key does
not help it.

Read two more fields on the row to find the fix:

| `personalSubscription` | `subscriptionConfigured` | Meaning | What to do |
| --- | --- | --- | --- |
| `true` | `true` | The person has a live subscription for this vendor, but this key is not bound to them. | Ask the subscription's owner to create a key with **Runs as: me**, and send the `X-Personal-Password` header on the calls that spend it. See [Using your subscription from a script](../guide/model-providers.md#using-your-subscription-from-a-script). |
| `true` | `false` | The platform checked, and the person has no live subscription for this vendor. | Connect a personal subscription for this vendor. |
| `true` | `null` | There was no person to check, or the deployment stores no personal subscriptions. | If the key was created headlessly, create a token in the app. |
| `false` | `null` | The model is not a personal-subscription model. | Configure its provider. For a poolable vendor, use a pooled token or a provider key. |

What the fields mean:

- **`personalSubscription`** is `true` when the model has a subscription route whose vendor is licensed
  for individual use only: Claude, Codex, or GLM. That credential is stored for each person, so a
  key that resolves to no user never uses it. Poolable vendors are left out on purpose: their token
  belongs to the workspace, so every key can already see it.
- **`subscriptionConfigured`** says whether a live personal subscription for that vendor is stored
  for the person this key belongs to. That person is the key's `actsAsUserId` when the key is bound,
  and otherwise the person who created the key.
- **`subscriptionConfigured` is `null` when nobody was checked.** This happens when:
  - there was no person to check, for example a key created headlessly through `POST /api/v1/keys`,
  - the deployment stores no personal subscriptions,
  - the row is not a personal-subscription model.

**Do not treat `null` as `false`.** They need different fixes. `false` means a subscription to
connect. `null` means a token to create in the app. A client that treats them as the same sends an
operator to a screen that was already correct.

`available` still resolves under the key's bound user only. `subscriptionConfigured` does not change
it. So `available: false` next to `subscriptionConfigured: true` is correct: the subscription exists,
and this key cannot spend it.

::: warning What an unbound key learns
On a key with no bound user, the person checked is the key's **creator**. That person need not be
whoever holds the key, and the platform never checks again whether they are still a member. So an
`admin`-scoped key given to CI learns one bit about a named colleague, even one who has left: whether
a live subscription for this vendor exists. It learns nothing else: not the person's details, the
vendor account, or the credential. The route needs at least
`admin` scope.
:::

Two more fields:

- **`userScoped`** is still on every row, and still says whether the subscription route is the one
  **in force**. Use `personalSubscription` instead. It is read from what the model declares, so it is
  correct for a model that can be reached both by a subscription and by a metered gateway.
  `userScoped` is superseded, and goes away in a future major version.
- **`excludesUserScopedModels`** on the envelope is not about subscriptions. It says that the
  deployment serves per-user **locally-run** endpoints that this read could not list. Those endpoints
  belong to one person's machine, and an unbound key cannot be given someone else's. Such models are
  missing from the list completely. A personal subscription's model, by contrast, is in the list and
  shows as unavailable.

### Whether your runs can finish on their own

Read `autonomy` on `GET /api/v1/risk-policies`. It says whether a run started through this API can
stop and wait for a person. Nothing watches such a run, so if it stops for a person, it waits until
somebody opens the app. Read `autonomy` on the `isUnattendedDefault` row, or on the policy that your
task pins as `riskPolicyId`.

| `autonomy` | What happens at these checkpoints |
| --- | --- |
| **`attended`** | The run parks on a judgement call that only a person can settle, and that `GET /api/v1/runs/{runId}/decisions` lists. With nobody to escalate to, it waits with no time limit. |
| **`unattended`** | The platform takes the documented "proceed" answer, and records on the step that it did. |

The checkpoints are:

- a [companion](../reference/glossary.md#c) at its rework limit,
- a [judge](../reference/glossary.md#j) at its bounce limit,
- an iterative review at its pass limit,
- follow-up items that nobody triaged.

`attended` is what every policy gets if it was created without a value. An unrecognised value is
also read as `attended`.

Neither value covers a checkpoint that the **pipeline** asks for. A `human-test` step, a review gate
or an approval gate stops the run either way. So `autonomy` is about waiting, not about oversight.
When you report what a policy will do, keep the two apart.

Every workspace starts with an **Unattended delivery** policy (`mp_unattended`) as its unattended
default. It is a separate row, so a later edit to the in-app default does not change it.

- In a new workspace, it has the stock `mp_balanced` ceilings, class rules and per-role
  restrictions. It sets `autonomy: "unattended"` and narrows three loop budgets:

  | Field | Balanced | Unattended delivery |
  | --- | --- | --- |
  | `maxRequirementIterations` | 6 | 3 |
  | `maxTesterQualityIterations` | 3 | 2 |
  | `judgeMaxBounces` | 1 | 0 |

  `companionMaxReworks` and `ciMaxAttempts` keep the Balanced values.
- A workspace that existed before this policy shipped got a copy of its own `isDefault` policy as it
  was then. Only `autonomy` is different.

If you want runs started through the API to keep stopping for people, point `isUnattendedDefault` at a
policy whose `autonomy` is `attended`. See
[Runs nobody is watching](../guide/pull-requests.md#runs-nobody-is-watching).

### Adopting a repository you already have

If a repository exists but `POST /api/v1/services` answers `404` for its `repoId`, link it to the
workspace first:

```
GET  /api/v1/repos/available?q=acme/payments-api
POST /api/v1/repos/link
{ "owner": "acme", "name": "payments-api" }
```

1. Find the repository with `GET /api/v1/repos/available`.
2. Check `serviceId` and `linkedElsewhere` on its row. See below.
3. Link it with `POST /api/v1/repos/link`, by `owner` and `name`.
4. Use the `repoId` from the response to create the service.

Why this is necessary: `GET /api/v1/repos` lists only the repositories that this workspace has
**linked**, and linking is an explicit action for each workspace. The provider webhook for an added
repository does not link it. A resync refreshes the repositories already linked, and does not
discover new ones in the installation. So a repository that exists and is reachable is missing from
`GET /api/v1/repos`, exactly like one that was never created.

The two reads answer different questions:

| Read | Lists | Use it for |
| --- | --- | --- |
| `GET /api/v1/repos` | What this workspace has linked. Every row has a `repoId` that you can create a service against. | Creating services. |
| `GET /api/v1/repos/available` | What the connection can reach. `linked` says whether it is linked here. | Finding a repository to adopt. |

A repository missing from both does not exist. A repository in the second list with `linked: false`
is waiting for you to adopt it.

Pass `q` in one of three ways:

- an exact `owner/name`, for an authoritative point-read,
- a substring, to search,
- nothing, to browse.

Things to plan for:

- **The link call takes a name, not a `repoId`.** A setup script that reads configuration knows the
  name, and cannot know a provider id that no public read lists. The response gives you the `repoId`
  for the service-creation call that follows.
- **The link call is idempotent, and answers `200` either way.** If the workspace already links the
  repository, you get its existing row back, so a setup script can run again with no special case.
  The platform checks the workspace's links before it asks the provider, so this works even for a
  repository that the credential can no longer see.
- **Both reads say whether a service already uses the repository**, through `serviceId` and
  `linkedElsewhere`. A repository that nobody here has linked can still back a service on another
  board of the account. Service creation refuses it in both cases, so check the flags before you link.
- **`truncated: true` on the available read means you have only the first part of the list.** The
  provider calls behind it stop at a page limit and a search limit. On a wide connection, a reachable
  repository can be missing from a browse. Narrow the search with `q`. Do not conclude that the
  repository does not exist. A point-read is never truncated.

Errors:

| Status | `details.reason` | Meaning | What to do |
| --- | --- | --- | --- |
| `404` | `repo_not_reachable` | The repository does not exist, or your credential is not granted it. The provider answers both the same way. | Check the name and the credential's access. |
| `503` | `vcs_credential_rejected` | The provider rejects the credential. An app installation may have been removed, or a token revoked. | Connect the workspace again. |
| `429` | `vcs_rate_limited` | The connection is throttled. | Retry. This is the only failure here worth retrying. |

### Bootstrapping a repository

To create a new repository and have the bootstrapper agent write it:

```
POST /api/v1/repos/bootstrap
{ "repoName": "payments-api", "type": "service",
  "instructions": "A Fastify service exposing a paginated catalog over Postgres." }
```

1. Send either `instructions` or a `referenceArchitectureId`. A reference architecture is a
   repository that the platform clones and adapts. A request with neither describes no work, and is
   refused.
2. The response is a job. Its `serviceId` is the board service that the run creates. That id exists
   immediately, so you can file work against the service while its repository is still being
   written.
3. Poll `GET /api/v1/repos/bootstrap/{jobId}` until `status` is `succeeded` or `failed`.
4. On a failure, read `failureKind` before you retry:

   | `failureKind` | Example | Retry? |
   | --- | --- | --- |
   | `preflight` | The repository already has content, or nothing is connected. | No. A retry cannot succeed. |
   | `evicted` | The container was evicted. | Yes. |

`failureDetail` and `failureHint` carry the platform's own diagnosis. Show them to the user as they
are. Do not paraphrase them.

### Connecting a cluster, and pointing a service at its manifests

Do both of these. They are two separate settings:

- The **engine**: one cluster for each workspace.
- The **source**: one set of manifests for each service.

A cluster on its own provisions nothing. If you connect a cluster but do not point the service at its
manifests, every deploy reads an empty manifest source. The result is an empty environment, which
looks like a cluster fault.

#### Connect the cluster

1. Test the connection without saving it:

   ```
   POST /api/v1/environments/connections/test
   { "connection": { "engine": "kubernetes",
       "kubernetes": { "label": "Staging", "apiServerUrl": "https://cluster.example:6443",
         "namespaceTemplate": "env-{{pullNumber}}",
         "url": { "source": "ingressTemplate", "hostTemplate": "{{namespace}}.preview.example.com" } } },
     "secrets": { "apiToken": "..." } }
   ```

   If the cluster refuses the credential, that is an **answer**, not an error. You get `200` with
   `ok: false` and a message.
2. Send the same body to `POST /api/v1/environments/connections` to save it. The response lists which
   secret **keys** were stored, never their values. No read returns them: a credential goes in and
   does not come back out.

#### Point the service at its manifests

```
PATCH /api/v1/services/{serviceId}
{ "provisioning": { "type": "kubernetes",
    "manifestSource": { "type": "colocated", "path": "deploy/k8s", "renderer": "raw" } } }
```

**Read `provisioning` back from the response. Do not trust the `200` alone.** `provisioning` is a
tagged union, and the branches that do not match the `type` are ignored. So a patch with the wrong
shape is accepted and stored, and the deploy step later reads it as "no manifests".

- **If you omit `provisioning`**, the stored value stays as it is. So when you correct a title, you
  cannot un-deploy a service by accident.
- **To remove the pin**, send `{ "type": "infraless" }`. The service then has no environment to
  provision, and reads back with no `provisioning` at all. A service that provisions nothing and one
  that was never pinned are the same thing here. Removing a pin removes the whole stored
  configuration, not only the published half of it, including leftovers from the engine you are
  leaving.
- **To narrow a pin**, send only the member you want to change. That patch is laid over what is
  stored.

#### Pinning a custom manifest type

A deployment that ships its own environment backend pins by `manifestId` instead. **Check the id
before you pin it**, because nothing checks it when you write it. The platform only checks that it is
a string, and matches it to a handler when a run reaches its deploy step. So an id that nothing
serves is stored, reported back as configured, and fails only after the run has paid for a design
pass and an implementation.

```
GET /api/v1/environments/manifest-types
200 { "manifestTypes": [ { "manifestId": "kargo", "label": "Kargo",
                           "source": "registered",
                           "defaultManifestPath": "deploy/.kargo.yml" } ] }
```

`source` tells you who can add a missing type:

| `source` | What it means | If the id you need is missing |
| --- | --- | --- |
| `registered` | The deployment holds this type in code. | It needs a deployment change. |
| `workspace` | The type is defined in the workspace. | Anyone can add it in the app. |

`defaultManifestPath` is where a pin with no `manifestPath` deploys from. `null` means the type
declares no default, so such a pin has nowhere to read a manifest from.

### Taking a service back down

To delete a service, use `DELETE /api/v1/services/{serviceId}` with an `admin` key. You need it when
you reclaim what you raised, for example an environment rebuilt for each test pass, a retired
repository, or a frame created against the wrong repository. Deleting a service needs the same level
as creating one.

```
GET    /api/v1/services/blk_api/tasks     # what is under it
DELETE /api/v1/tasks/blk_task             # each unfinished task, if you mean it
DELETE /api/v1/services/blk_api           # 204: the frame, its subtree, its run history
```

The delete removes the frame, its modules, its tasks, and the run history recorded under them. If a
run is still going under the frame, the platform stops it and kills its container first, so nothing is
left idle.

Do not retry these two answers. Act on them:

- **`422`, `reason: service_has_unfinished_tasks`.** The frame holds a task that has not finished.
  Deleting it would discard work in flight with its history. `details.unfinishedTasks` is the count.
  The platform decides this **before** it removes anything, so after a `422` the frame, its tasks and
  their runs are exactly as they were. A retry changes nothing, and the runs still going are yours to
  stop or resume. If you mean it, delete those tasks first.
- **`404` for an ARCHIVED service.** Every per-service endpoint works on exactly the services that
  `GET /api/v1/services` lists, and an archived frame is not in that list. Archiving is how the app
  keeps a frame but hides it. This API has no archive or restore, so handle an archived frame in the
  app.

## Board workloads

Most of the API drives the board without a browser. A run started through the API runs exactly like
one started from the board, and it shows on the board.

The table below shows the main calls and what each one is for. It is not the full parameter list. For
that, and for the operations this page does not cover, see the
[API Endpoint Reference](../reference/api-reference.md#operations).

| Method | Path | Scope | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/services` | read | List the workspace's services. |
| `POST` | `/api/v1/services/{serviceId}/tasks` | write | Create a task. Body `{ title, description?, taskType?, ticket?, fragmentIds?, modelPresetId?, riskPolicyId? }`; `taskType` is one of `feature`, `bug`, `document`, `spike`, `review`, `ralph` (default `feature`). See [Filing a task from a tracker ticket](#filing-a-task-from-a-tracker-ticket), [Pinning a model preset and a risk policy](#pinning-a-model-preset-and-a-risk-policy) and [Picking standards over the API](../guide/prompt-fragments.md#picking-standards-over-the-api). |
| `GET` | `/api/v1/services/{serviceId}/tasks` | read | List a service's tasks (its whole subtree), newest first. Paged; see [Paging](#paging). Filter with `?status=`. |
| `GET` | `/api/v1/tasks/{taskId}` | read | Get a task's status projection: `{ taskId, serviceId, title, description, taskType, status, progress, runId, pullRequestUrl, fragmentIds, modelPresetId, riskPolicyId }`. |
| `PATCH` | `/api/v1/tasks/{taskId}` | write | Edit the task's title or description, or correct either pin. |
| `POST` | `/api/v1/tasks/{taskId}/start` | write | Start the task's pipeline. Body `{ pipelineId? }`, falling back to the task's pinned pipeline. |
| `POST` | `/api/v1/tasks/{taskId}/stop` | write | Stop the in-flight run (idempotent; the run stays retryable). |
| `POST` | `/api/v1/tasks/{taskId}/retry` | write | Retry a failed run. |
| `DELETE` | `/api/v1/tasks/{taskId}` | admin | Delete a task and its run history (destructive). |
| `GET` | `/api/v1/tasks/{taskId}/run` | read | Rich run projection: per-step state, progress, subtasks, failure, and the PR URL and branch. |
| `GET` | `/api/v1/tasks/{taskId}/events` | read | Stream the run as Server-Sent Events (`progress`, `done`, `error`, `timeout`), for up to five minutes. |
| `GET` | `/api/v1/pipelines` | read | Discover pipelines: each entry is `{ pipelineId, name, steps, public, headlessStartable }`. Use it to find a valid `pipelineId` and confirm a pipeline can start headlessly. |
| `GET` | `/api/v1/prompt-fragments` | read | Discover the board's [best-practice standards](../guide/prompt-fragments.md): each entry is `{ fragmentId, title, category, summary, version, tier, tags, appliesTo? }`. The `fragmentId`s are what a create names in `fragmentIds`. |

`taskType` also accepts a namespaced custom task type (`<namespace>:<name>`) that the deployment
[registered](./frontend-extensions.md#custom-task-types). So you can create an "incident" or a
"compliance-audit" through the API, like any built-in type.

### Why a start is refused

| If you | You get | What to do |
| --- | --- | --- |
| Start, retry, or act on a run whose steps use an **individual-usage** (personal-credential) model | `409 individual_model_unsupported`. A headless key cannot unlock a personal subscription. | Use a pipeline whose models come from the account or workspace pools. |
| Start a task under an archived service | `409 service_archived` | Start tasks under a service that is not archived. |
| Start a task with no pipeline | `400 pipeline_required` | Pin a pipeline on the task, or send `pipelineId`. |
| Start a pipeline that can **park**, with a `write` key | `403 pipeline_requires_decide_scope`, at admission. The message names which of the pipeline's parks the API can answer, and which it cannot. | Use a `decide` key. |

### Which pipelines can park

A pipeline can park in six ways:

- an **approval gate** on an enabled step,
- an inline **review or brainstorm** kind (`requirements-review`, `clarity-review`, and the two
  brainstorms), which sets the run `blocked` until it gets an answer,
- an unbounded **human-wait gate** (`human-review`): a gate step whose poll never times out, because
  it waits for a person to look at the pull request,
- an **interview gate**: a step that asks a batch of clarifying questions and waits. These are the
  planning and document interviewers, plus any that a deployment registers.
- a **candidate comparison**: a generating step set up to render several candidates for each subject,
  and to wait for someone to keep the good ones,
- a **curation gate**: a step that parks the run when it finishes, so that a person can pick which of
  its findings to act on. These are the pull-request reviewer and the bug-fishing expedition.

So a `write`-only key cannot start four of the shipped presets:

| Preset | Why it parks |
| --- | --- |
| **Adaptive build** | It has a risk-gated `human-review`. |
| **Generate media** | It ships with the comparison on. |
| **Review a pull request** | It curates. |
| **Bug fishing expedition** | It curates. |

The unconditional presets, **Standard build** and **Simple build**, never park, so a `write` key can
start them.

Some parks happen only during a run, for example a decision that an agent raises, or a judge that
parks. Nobody can know about these in advance, so they do not block the start.

The inline-only restriction applies to headless jobs, not to board tasks. A `decide` key may start
container pipelines on board tasks.

### Filing a task from a tracker ticket

If your integration already has the ticket the work came from, name it when you create the task. The
platform imports the issue and attaches it to the new task. You do not need to copy the ticket into
`description`.

```http
POST /api/v1/services/svc_api/tasks
Content-Type: application/json

{ "title": "Fix cat photo 404s", "taskType": "bug",
  "ticket": { "source": "jira", "ref": "https://acme.atlassian.net/browse/PROJ-1" } }
```

- **`source`** is a tracker that this workspace has connected and turned on: `jira`, `github`,
  `linear`, or a `<namespace>:<name>` source that the deployment
  [registered](../guide/issue-sources.md#registering-a-tracker-from-a-deployment).
- **`ref`** is the issue's canonical key or its full URL. The provider's own parser reads either, so
  you can forward whichever form your webhook had.

The rest of the platform works from this link, not from the ticket's text:

- Every agent step reads the live issue again as context: status, labels, description, comments.
- The run's clarification questions are written back onto the issue.
- A reply typed on the issue resolves against the parked run.
- The recurring intake sweep treats the issue as taken.

`description` stays your own text, and the platform never overwrites it.

Two refusals matter:

- **The ticket is resolved before the task is created.** If the source is not configured or is turned
  off, if the provider cannot parse the ref, or if the tracker does not serve the issue, the whole
  request is refused and the board does not change. You never get a `201` for a task that runs on its
  title alone.
- **One task per ticket.** If the ticket is already linked, you get `409` with
  `details.reason: "ticket_already_linked"`, and `details.taskId` names the task that holds it. So a
  webhook that is delivered again goes to the existing task, and no duplicate is filed. You do not
  need to keep your own records to stay idempotent. This holds under concurrency too: if two
  deliveries of one ticket arrive together, a conditional write decides between them. Exactly one gets
  a task, and the other gets the `409` that names it. The losing task is removed from the board, so it
  is not left behind without a ticket.

### Reading and setting tracker writeback

**By default, the platform comments on the issues that you link, and closes them when the pull
request merges.** Writeback decides what
the platform tells a linked ticket about the work. It is workspace configuration, and you can read
and change it through the API:

```http
GET   /api/v1/tracker/writeback
PATCH /api/v1/tracker/writeback

{ "writeback": { "resolveOnMerge": false } }
```

Both calls answer with the same body: a `writeback` object of three independent booleans, plus
`updatedAt`. All three are **on by default**.

| Flag | When it is on, the platform |
| --- | --- |
| **`commentOnPrOpen`** | Comments on the linked issue when the task's pull request opens. |
| **`resolveOnMerge`** | Comments on and **closes** the linked issue when that pull request merges. |
| **`questionsOnPark`** | Posts a headless run's parked requirements-review findings on the linked issue, each with the id that an answer names. So the reporter can answer where they filed. Only used for runs started through this API or dispatched from a ticket. |

The flags are separate so that a workspace can, for example, record the merge on the ticket without
asking a parked review's questions there.

Writeback only ever touches an issue that a task is linked to, and nothing links an issue by
accident. So the default closes the loop, instead of leaving an open issue with nothing on it next to
a merged pull request.

Things to plan for:

- **Both calls need an `admin` key.** This is workspace-wide configuration. For example, if you turn
  on `resolveOnMerge`, it changes what happens to every other task's ticket on the board too.
- **The `PATCH` merges.** If you leave out a flag, the workspace keeps its current value. So one
  decision changes one flag, and a caller that sets `resolveOnMerge` cannot change the other two by
  accident. An empty patch changes nothing, and does not update `updatedAt`. The in-app save is
  different: it shows all three flags and replaces the whole row.
- **`updatedAt` is `null` when nobody has ever chosen.** Then the values you read are this
  deployment's defaults, not anyone's decision. Use this to tell a workspace that you can safely
  configure from one whose choice you would overwrite. It is `null`, not an epoch timestamp, so that
  it cannot show as a setting saved in 1970.

This read covers writeback only. It does not cover the **filing** tracker, which is the tracker that
the tech-debt recurring pipeline raises its ticket on, with that vendor's project key or team. The two
are independent. Writeback follows each linked issue's own source, so a workspace with no filing
tracker still writes back to the GitHub issue that a task was filed from. See
[Writing back to the tracker](../guide/issue-sources.md#writing-back-to-the-tracker) for the in-app
panel and the per-task override.

### Pinning a model preset and a risk policy

Pin a model preset and a risk policy on a task when you need a reproducible automated pass. The task
then uses what you name, not the workspace defaults. Without a pin, the only way to run one task on a
different model is to change the workspace default, and that changes every other caller's runs too.

```http
POST /api/v1/services/svc_api/tasks

{ "title": "Fix cat photo 404s", "taskType": "bug",
  "modelPresetId": "mdp_claude", "riskPolicyId": "mp_manual_review" }
```

1. Read the ids from `GET /api/v1/model-presets` and `GET /api/v1/risk-policies`. Do not build them
   yourself. The built-in model presets are `mdp_kimi`, `mdp_glm` and `mdp_claude`, and the built-in
   risk policies are `mp_balanced`, `mp_unattended` and `mp_manual_review`. The two libraries do not
   share a prefix, and a workspace that edited either has ids of its own.
2. Send the ids on the create call. Both pins are optional.
3. Both pins come back on the task read. To correct either, use `PATCH /api/v1/tasks/{taskId}`.

If you leave a pin out, the task follows the workspace default. It does not store a copy of the
default's id, so if the default changes, the task changes with it. For `riskPolicyId`, that default
is the **unattended** one, because nothing watches a run that this API starts.

The refusals matter more than the fields:

| Status | `details.reason` | Meaning |
| --- | --- | --- |
| `422` | `model_preset_not_found` / `risk_policy_not_found` | No library in this workspace has that id. The platform refuses. It never falls back to the default. |
| `503` | `model_presets_unwired` / `risk_policies_unwired` | The deployment has not set up that library, and you pinned from it. This needs a different fix from an unknown id. The two list endpoints answer with the same two reasons. |

The `422` is a refusal on purpose. If the platform quietly used the default, you could not tell
afterwards from anything you can read, and a run that succeeded on another model is worse than one
that was refused.

**The `422` does not list the library's contents.** It names only the id that missed, and the
library it missed in. Pinning needs `write`, but both lists need `admin`. If the `422` listed the
available ids, a `write` key could find out by guessing what only an `admin` key may read.

What a pin can and cannot change:

- **A model preset does not widen what the account allows.** The base model still goes through the
  account's model-family policy. So a preset that names a blocked model fails at dispatch, with the
  same refusal it would get on the workspace default.
- **`riskPolicyId` changes what a run may do.** A policy holds `autoMergeEnabled`, the score limits,
  and `autonomy`.
- **An `admin` key may pin any policy that its workspace has.** It already has that authority,
  because it can edit any policy. This is wider than a board member's permission. In the app, a person
  who does not manage the policy library cannot move a task from an attended policy onto an
  `unattended` one, because removing the run's human checkpoints is a permission, not a preference.

## Paging

These list endpoints can grow without limit, so they are **keyset-paginated**:

- `GET /api/v1/services/{serviceId}/tasks`,
- `GET /api/v1/jobs`,
- `GET /api/v1/kaizen/entries`.

Each response has its array (`tasks`, `jobs` or `entries`) and a `nextCursor`. Request pages until
`nextCursor` is `null`.

| Parameter | Meaning |
| --- | --- |
| `limit` | 1–100. The server caps a page at 50 entries regardless. |
| `cursor` | The previous response's `nextCursor`. Omit for the first page. |
| `status` | Filter by status. Tasks: `planned`, `ready`, `in_progress`, `blocked`, `pr_ready`, `done`. Jobs: `running`, `succeeded`, `failed`. |
| `since` | Jobs and Kaizen entries. Epoch milliseconds; return rows created at or after this. |

The cursor is a keyset (a sort key plus an id), not an offset. So a page cannot shift when rows are
inserted at the same time and skip a row without telling you. A burst of runs in the same millisecond
also pages correctly. A malformed cursor gets `400 invalid_cursor`. The server does not send page 1
again.

`GET /api/v1/jobs` lists the workspace's headless initiative jobs, newest first. Use it when an
integration has lost its stored job ids and needs to find its own in-flight runs. Its scoping is
applied in SQL, so an external key can never list ordinary board runs through it.

## Answering a parked run

A run started through the API can park on a human decision. These are the same requirements-review
and implementation-fork parks that the app shows. To answer them, use a `decide` key on
`/api/v1/runs/{runId}/decisions`.

Every route calls the same service methods as the app. So if the app and the API both answer, the
platform handles it the same way, whichever answers first.

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
| `POST` | `/pr-review/resolve` | decide | Resolve a parked pull-request review with the findings you kept. |
| `POST` | `/pr-review/findings/{findingId}/dismiss` | decide | Drop one finding from the review. |
| `POST` | `/pr-review/findings/{findingId}/challenge` | decide | Have an investigator re-examine one finding. |
| `POST` | `/pr-review/resume` | decide | Re-dispatch a review that stalled part-way through. |

Every route returns the updated decision list, so you can drive the loop without a separate poll.
The other parks (the human-verdict gates, follow-up triage, the interview gates) are answered under
the same prefix. The [API Endpoint Reference](../reference/api-reference.md#operations) lists them
all.

A parked run waits for a person with **no time limit**, by design. While it waits, it holds one of
the workspace's in-flight slots. To free a slot, cancel a job with
`POST /api/v1/jobs/{id}/cancel` (`write`). This endpoint exists so that reaching the limit gives a
`429` that you can recover from.

### Reviewing a pull request over the API

You can drive the deep review of an existing GitHub or GitLab pull request from start to end with a
`decide` key. Use this if your integration shows the findings in its own UI.

1. Create a task with `taskType: "review"` and the pull request's URL in `fields`.
2. Start it. The task is pinned to the review pipeline, so the start body can be empty.
3. Poll `GET /api/v1/runs/{runId}/decisions` until the `pr-review` entry reports
   `awaiting_selection`.
4. Show that entry. It has the findings, ordered blocker first. Each finding has a stable id, its
   file and line, its severity and category, and the fix that the reviewer suggested. The findings are
   grouped under the slices of the diff that the reviewer worked in.
5. Curate the findings, one call at a time.
6. Resolve with one of:
   - `finish`: records the selection, and does nothing else,
   - `fix`: gives the kept findings to an agent that commits onto the pull request's own branch,
   - `post`: publishes them as inline comments on the pull request.

**`post` is asynchronous, so read `postReport` before you decide that it worked.** If a post fails
partly or completely, the review goes back into the list, and looks exactly as it did before you
resolved it. The report tells the cases apart:

- how many comments were attempted, and how many landed,
- how many findings were moved into the summary comment, because their line is not part of the diff,
  or because the branch moved after the review started,
- the provider's own error for each one that failed.

To retry, send the same `post` call with the same selection. The platform records what already
landed, so nothing is commented twice.

### Learning that a run parked

Use polling as the fallback. Two push channels tell you when a run parks:

- **SSE**: both public streams stay open across a park, and send a `decision` frame.
- **Outbound webhook**: a per-workspace HTTPS endpoint that receives notifications as they are
  raised. See [Set Up Notifications → Outbound webhooks](../operate/notifications.md#outbound-webhooks).

You can also have the platform post the open questions onto the task's linked tracker issue, so the clarification
reaches whoever asked for the work. See
[Connect Issue & Document Sources → Writing back to the tracker](../guide/issue-sources.md#writing-back-to-the-tracker).

## Notification inbox

A key can read and clear the workspace's notification inbox. An external system can then react to
merge-review requests, completed pipelines, and gate failures.

| Method | Path | Scope | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/notifications` | read | List the workspace's open notifications. |
| `POST` | `/api/v1/notifications/{id}/act` | admin | Run the card's automated side-effect (merge the PR, retry the run), then resolve it. |
| `POST` | `/api/v1/notifications/{id}/dismiss` | write | Dismiss a card without acting on it. |

`act` accepts only cards with an automated action: `merge_review`, `pipeline_complete`, `ci_failed`,
and `test_failed`. Any other open card returns `409 notification_not_actionable`. Dismiss it instead.

A merge done through `act` uses the deployment's GitHub installation token.

## Headless jobs

A headless job runs a public, inline pipeline against a brief that you supply. It is not a board task.
It never touches a repository, and it never shows on any board. Breaking down an initiative is the
built-in case.

1. Start the job:

   ```
   POST /api/v1/jobs
   Authorization: Bearer cf_live_<keyId>.<secret>
   Content-Type: application/json

   { "pipelineId": "pl_initiative_breakdown", "input": "<the brief>", "title": "optional" }
   ```

   The `input` is the brief, 1–50,000 characters. The platform plans it headlessly: no container, no
   checkout, nothing pushed to a repository. The call returns `202` with a `jobId` and links to poll:

   ```json
   { "jobId": "…", "status": "running", "links": { "self": "/api/v1/jobs/…", "events": "/api/v1/jobs/…/events" } }
   ```

2. Get the result in one of two ways:
   - Poll `GET /api/v1/jobs/:id`. It returns `{ jobId, status, pipelineId, createdAt, result, error }`.
     `status` is `running`, `succeeded`, or `failed`. `result` is there once the job has succeeded:
     the agent's prose, plus an optional structured breakdown.
   - Stream `GET /api/v1/jobs/:id/events`. It sends the same job as Server-Sent Events (`progress`,
     `done`, `error`, `stopped`, `timeout`, and `decision` when the run parks), for up to five
     minutes.

Other calls:

- `GET /api/v1/jobs` lists your jobs, newest first. See [Paging](#paging).
- `POST /api/v1/jobs/:id/cancel` (`write`) cancels an in-flight job and frees its concurrency slot.

Limits:

- **Only public inline pipelines are accepted.** `pl_initiative_breakdown` ("Break down initiative")
  is the built-in one. To find the others, call `GET /api/v1/pipelines` and look for `public: true`.
- **A workspace can have at most five headless jobs in flight at once.** A sixth returns
  `429 too_many_active_runs`.
- **This API sees only the jobs that it created**, never the workspace's ordinary board runs.

The job status is coarse, and hides board internals:

| Internal state | Job `status` |
| --- | --- |
| `done` | `succeeded` |
| `failed` | `failed` |
| Anything else (running, spend-paused, parked) | `running` |

The `?status=` filter uses the same mapping, so it always agrees with the field it filters on.

Headless jobs send no run-lifecycle webhooks. Use the job read and its SSE stream instead.

## Inline use cases

An inline use case is a named unit of model work that the deployment registered. It takes a small
form, makes ONE model call, and answers with text. There is no task, repository, pipeline, container,
or run. This section is for the caller. To write one, see
[Package an Inline Use Case](./inline-use-cases.md).

| Method | Path | Scope | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/use-cases` | read | The catalog: what this deployment will generate, on which models, from which parameters. |
| `GET` | `/api/v1/use-cases/{useCaseId}` | read | One use case, for a caller that already holds the id. |
| `POST` | `/api/v1/use-cases/{useCaseId}/invocations` | write | Run it and answer with the text. |

The invocation is SYNCHRONOUS, unlike a headless job. It is a single model call, so there is no job
to poll and no SSE stream to open.

```
POST /api/v1/use-cases/acme:scene-prose/invocations
Authorization: Bearer cf_live_<keyId>.<secret>
Content-Type: application/json

{
  "model": "magnum",
  "parameters": { "beats": "They meet at dusk. She lies.", "tone": "grim" },
  "temperature": 1.2
}
```

The response has `text`, the `model` that it actually ran on, `finishReason`, `truncated` and
`usage`. **Read `truncated` before you store the text.** `finishReason: "length"` means the reply hit
the output budget, so you have only the start of an answer.

### Which models a use case can use

Each use case NARROWS the models it may run on. The catalog says whether each model can be served now.
An unavailable model is listed with its cause, not hidden, so a picker can show what the use case
offers instead of an empty list. The causes are:

- `provider_unavailable`: this deployment has not configured the provider.
- `container_only`: the model runs only through a coding-subscription harness inside a per-run
  container, and this API has no container.

The platform never swaps one model for another. It refuses a model outside the list, and a model this
deployment cannot serve. If a narrowed list substituted models without telling you, it would not be a
narrowing, and you could not see that it happened.

### Refusals

Every refusal has `error.details.reason`:

| Status | `reason` | Means |
| --- | --- | --- |
| `404` | `use_case_not_found` | Re-read the catalog; this deployment no longer registers the id. |
| `422` | `use_case_parameters_invalid` | `details.problems` names every problem at once. |
| `422` | `use_case_model_not_allowed` | `details.allowed` names what this use case does carry. |
| `422` | `use_case_generation_out_of_range` | A knob outside the published bounds. Nothing is clamped. |
| `429` | `budget_exhausted` | The workspace has spent its model budget; nothing reached a vendor. |
| `503` | `use_case_model_unavailable` | `details.cause` is one of the two causes above. |
| `503` | `use_case_models_unconfigured` | This deployment wired no model provider at all. |
| `503` | `use_case_empty_reply` | The model answered with nothing usable. |

A `200` never has an empty string. If the model answered with nothing, you get
`503 use_case_empty_reply`.

### Budget

An invocation counts against the workspace budget, as a run does, because it is a billable model
call. Discovery does not count, and never returns `404`:

- A deployment that registered nothing answers with an empty list.
- A deployment with no model provider answers with the full catalog, with every model unavailable.

## Usage and budget

| Method | Path | Scope | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/usage` | read | The current period's spend and budget position, as one resource. |

The response is `{ periodStart, currency, budget, rows }`.

- `budget` is the metered position that the spend safeguard acts on: `costSpent`, `costLimit`, and
  `exceeded: true` when runs are paused at the limit.
- `rows` breaks spend down by `(billing, vendor, provider, model)`.

**Do not add the two billing kinds together.** Only `metered` rows are money. A `subscription` row's
`costEstimate` is only an illustration, because a flat-rate plan bills nothing per token.

The endpoint works at workspace level by design, so a workspace key never learns a sibling
workspace's spend. See [Control Spend with Budgets](../guide/budgets.md).

## Run debugging

Eight read-only endpoints under `/api/v1/debug/*` diagnose a run from outside the browser:

- a run index,
- an overview of each run, with precomputed signals,
- drill-downs, each with a size budget, into model calls, agent context, searches, and provisioning
  logs.

They use the same keys at `read` scope, and they are keyset-paginated like the other lists.

**Treat a key that can call them as sensitive, even though it is only `read`.** These endpoints return
prompt and response bodies.

## Kaizen entries: the platform's own improvement backlog

Use these endpoints to find and clear the platform's recommendations for improving its own agents.
In the app, these gradings are a screen that you browse. Through the API, they are a **backlog that
you clear**.

After a run finishes, Cat Factory grades its own work. It scores each completed agent step from 1 to
5, on how smooth or chaotic the interaction was, with recommendations for what would make it better.
Each grade is keyed by the `(agent kind, model, prompt version)` combination that the step ran on. If
a combination scores high with no recommendations often enough, it is marked verified and is no
longer graded.

| Method | Path | Scope | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/kaizen/entries` | read | One page of the workspace's entries, newest first. |
| `GET` | `/api/v1/kaizen/entries/{entryId}` | read | One entry by id. |
| `POST` | `/api/v1/kaizen/entries/{entryId}/acknowledge` | write | Record that it has been triaged, or clear that. |

### Finding entries to act on

**Poll `?acknowledged=false&settled=true`.** This is the backlog that you can actually clear: the
acknowledge route accepts every entry it returns. Do not use the other filters for this:

- `acknowledged=false` alone also returns gradings that are still in progress, and the acknowledge
  route refuses those with a `409`.
- `status=complete` instead of `settled=true` drops the `failed` entries, and those are the ones to act
  on first.

The list takes no run or task id on purpose: an improvement loop is looking for the runs that
produced recommendations, so it cannot name one first. You can combine these filters:

| Filter | Returns |
| --- | --- |
| `acknowledged=false` | What nobody has looked at. |
| `settled=true` | What the grader has finished with. |
| `status` | One exact grading state. |
| `agentKind` | One role. |
| `since` | Entries since a time, for an incremental sweep. |

### What an entry contains

Each entry has what you need to follow it up without opening the app:

- the run and the step index it came from,
- the agent kind,
- the model, as resolved at dispatch,
- the prompt version,
- the combination key, and where that combination is in its verification streak,
- the grade,
- the grader's summary and recommendations,
- which model graded it,
- the board task and its service.

Notes on these fields:

- If the task was deleted after the run, the entry reports `task: null`, not a blank title.
- The `runId` joins directly onto [run debugging](#run-debugging), if a low grade needs a look at the
  calls behind it.
- `task.serviceId` is the same id that `GET /api/v1/services/{serviceId}` answers for, resolved the
  same way as the task endpoints resolve it. It always comes with `task.serviceTitle`, or is not there
  at all. You never get an id that the endpoint cannot resolve.

A `failed` entry is a real entry, and is not hidden. It usually says something about the deployment,
not about the run: no grader model is configured, or prompt recording is off, so there was no
telemetry to judge. These are worth acknowledging too, so the acknowledge route accepts them.

### Acknowledging an entry

```sh
# The drainable backlog, most recent first.
curl -s -H "$AUTH" "$BASE/api/v1/kaizen/entries?acknowledged=false&settled=true&limit=50"

# Act on one, then take it off the backlog with a note for whoever reads it next.
curl -s -X POST -H "$AUTH" -H 'content-type: application/json' \
  -d '{"note":"filed as CF-431"}' \
  "$BASE/api/v1/kaizen/entries/$ENTRY_ID/acknowledge"
```

- **Acknowledging is idempotent.** A repeat returns the entry unchanged, so `acknowledgedAt` keeps the
  time it was first triaged, not the time a retrying client last sent it.
- **To undo**, send `{"acknowledged": false}`.
- **`updatedAt` works as a change marker.** An acknowledgement moves it. A repeat does not, and an undo
  where nothing was acknowledged does not.
- **The entry records who acknowledged it**: the user id when the key was created for a person, and
  the key id otherwise.
- **Acknowledging needs `write`, not `admin`**, because it starts nothing and merges nothing.
- **An entry whose grading has not settled is refused** with `409 kaizen_entry_not_settled`, because
  it has no recommendations to read yet.

## Streaming

Both `/events` endpoints are `text/event-stream` responses. Each polls the stored run once a second.
A frame is sent only when the payload changed, and there is no heartbeat. So a quiet run produces a
quiet stream.

| Event | Meaning |
| --- | --- |
| `progress` | The run advanced. Data is the full job or run projection, the same shape as the GET. |
| `decision` | The run just parked on a human decision. Answer it through `/runs/{runId}/decisions`; the stream stays open, and a later park after a resume is announced again. |
| `done` | Terminal success. The stream closes. |
| `error` | Terminal failure. The stream closes. |
| `stopped` | Jobs stream only: the run ended in a state that still projects as `running`, such as a cancellation. The stream closes. |
| `timeout` | The stream hit its five-minute cap; data is `{}`. Nothing is wrong. Reconnect to keep watching. |

If you revoke a key, its live streams stop within about five seconds.

Each stream reads one run, at the speed of its own poll. To get pushes at scale, register the
[outbound webhook](../operate/notifications.md#outbound-webhooks) instead.

---

Next: the [API Endpoint Reference](../reference/api-reference.md) for every operation's exact
fields, the [Official SDKs](./sdks.md) if you would rather not hand-roll a client, the
[MCP Server](./mcp-server.md) to give an MCP host the same surface, or the
[Cloudflare OS Gatekeeper](./cloudflare-os.md) to install Cat Factory into a Cloudflare OS workspace
without handing any agent a key.
