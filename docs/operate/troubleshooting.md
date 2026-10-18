# Troubleshooting

For operators who run a Cat Factory deployment and have a symptom to explain. Find your symptom in
the headings below. Each entry says what to do first, then what causes it. The sections follow the
order in which operators usually meet these problems. Where a cause has a page of its own, the entry
links to it.

## Before you start

Do these three things first. They save most of the time on this page.

1. **Check the run before the deployment.**
   [Run and step diagnostics](./observability.md#run-and-step-diagnostics) shows the failing step,
   its model calls, and the container's own logs.
2. **Open "Show details" before you quote an error.** A failure toast shows what you can act on, and
   keeps the rest behind **Show details**:
   - the platform's own untranslated message,
   - the per-field issues of a validation failure,
   - the `requestId`, which joins the failure to the one server log line about it.

   Failure toasts stay on screen until you close them, and you can select their text. One click
   copies the whole report. Include the `requestId` in a report: with it, someone can find the matching
   server log line; with a screenshot alone, they cannot.
3. **Read the error's reason, not only its status.** Refusals from this platform carry a
   machine-readable reason next to the message, and the app shows remedy text for that reason. Two
   refusals can share a status and need different fixes. For example, "this deployment has not
   configured the capability" and "the capability is configured but its upstream is down" are
   different reasons with the same status.

### If a connection fails

Work from the cause that the error names. On the Node runtime, the HTTP client reports a failed
outbound connection as a bare `fetch failed`, and puts what happened one level down. Every surface
that describes a failure reads down to that cause and reports it. A **Test connection** verdict, a log
line, a toast and a stored step reason all name the same thing, for example
`connect ECONNREFUSED 10.0.0.5:6443`, an expired certificate, or a DNS miss.

## The deployment will not boot

### A required value is missing

Read the config loader's message. It names the variable and what needs it, and it says whether the
problem is a hard failure or a warning that does not block boot. See
[Configuration → When a required value is missing](../deploy/configuration.md#when-a-required-value-is-missing).

### Postgres connection resets at boot (`ECONNRESET`)

Use `127.0.0.1` in `DATABASE_URL`, not `localhost`. On Windows with Docker Desktop, `localhost`
resolves to IPv6 first, and the connection is refused there.

### Migrations fail, or the app says the schema is inconsistent

Follow the recovery that the boot check names. Never drop one schema by hand on its own.

The recovery is deliberate and destructive: it resets all of the application-owned schemas together.
This is because the migration ledger lives in its own schema. If you drop the application schema by
hand, the data is gone but the ledger still says that every migration is applied. The boot check
detects exactly that. Resetting all schemas together makes sure the ledger can never outlive the
data.

### Enterprise SSO refuses to start

Set all three SSO variables together, use an HTTPS issuer, use a strong session secret, and turn off
dev-open auth. Boot is refused on purpose if any of these is wrong:

- only some of the three SSO variables are set,
- the issuer is not HTTPS,
- the session secret is weak,
- dev-open auth is on alongside SSO.

The platform refuses to start rather than start in a state that only looks configured.

## Runs will not start

### "No AI model configured"

Connect a model source: a provider key, an aggregator key, a subscription, or a local runner. No
connected source can serve any model. See [Connect a Model Provider](../guide/model-providers.md).

### The start is refused and names a model

Pick a model that your connected sources can serve, or adjust the model access policy. There are two
causes:

- The workspace's default preset points at a model that none of your connected sources can serve.
- An account [model access policy](../guide/model-providers.md#restricting-model-families) blocks
  the model's family.

In both cases the platform refuses at start. It does not reroute the run to a different model
without telling you.

### The start is refused over budget

Raise the limit, or wait for the next period. The workspace has reached its monthly spend limit, and
the pipeline has at least one metered step. A pipeline in which every step runs on a subscription or
a local runner still starts, because neither is metered. See
[Control Spend with Budgets](../guide/budgets.md).

### A recurring pipeline refuses to start

Point the recurring work at a pooled subscription, a direct key, or the Cloudflare default. A
scheduled run starts with nobody present to unlock a personal subscription, so the platform refuses a
schedule that resolves to an individual-use model.

### "No repository is linked"

Link the task's service frame to a repository, or move the task under a frame that is linked. A
[frame](../reference/glossary.md#f) is the service block that encloses a task on the board. A task
finds its repository by walking up to that frame. There is no fallback to "the first repository",
because a guess once pushed a task into somebody else's repository. See
[Connect a Repository](../guide/repositories.md).

## A run fails or stalls

### `Container dispatch failed (HTTP 404)`

Mirror the runner image into your own registry under a new tag, and point the deployment at that tag.
The error means that the image tag the deployment points at does not exist in the registry it pulls
from. This is the usual symptom of an upgrade where the image was not mirrored under a new tag. If
you reuse an existing tag, the new image does not roll out. See [Upgrades](./upgrades-and-retention.md).

### A step aborts for inactivity

Prepopulate the dependencies that the step needs. Do not raise the inactivity limit. The harness
stops a job that writes no output for the inactivity window, and that window is deliberately shorter
than the timeout of any single command. The usual cause is a slow cold install, or a long build
inside an agent step.

### A step fails to clone, push or merge with a `403`

Give the run a token with enough access. The token that the run authenticated with is too narrow for
the work.

The board can warn you before a run fails. When you open the board, it can show a banner for this
problem, so that a pipeline does not find out several steps in. To check, the board:

1. Finds the token that a run would actually present.
2. Asks GitHub what that token can do on the repositories that this board's services target.

The banner links to the token form, with the same kind of token already selected.

How to read the banner:

- **It reports each capability as one of three states.** A classic token reports its scopes in a
  response header. A fine-grained token reports nothing, so the only way to learn its access is to
  probe a repository, and that probe answers for push only. So `unknown` means "not established", not
  "missing".
- **Only two things raise the banner:** an established gap that blocks the work, or a token that
  GitHub rejects outright. If GitHub is unreachable or rate-limited, the board shows nothing, rather
  than blame your credential.
- **A `404` on every targeted repository is reported as a missing capability.** GitHub answers `404`,
  not `403`, for a repository that a credential may not see. So this is a fine-grained token that
  points at the wrong repositories.
- **The banner says whose credential it is: the deployment's or yours.** A local developer is not
  sent to their personal settings to replace a token that comes from the deployment's `.env`.
- **No banner appears for a credential that no run uses.** If a workspace turned off the use of the
  initiator's stored token, it is not warned about that token.

The check reads what a token can do. It does not limit it: a token that passes is still exactly as
wide as the person who minted it made it. See
[Configuration → What a personal access token can do on the run path](../deploy/configuration.md#what-a-personal-access-token-can-do-on-the-run-path).

### A step says its push to the work branch was refused

Usually you do not need to do anything. The platform sends the step again once, and the step resumes
from the branch as it now stands. The usual result is a run that succeeds, but spends one agent pass
twice.

Why it happens: while an agent works, the platform pushes the agent's commits to the work branch
about once a minute, so nothing is lost if the container stops. This makes the platform a writer on
the branch. A push is refused when the branch has commits that the push would drop.

The failure message names one of two causes:

| Cause | What happened | What to do |
| --- | --- | --- |
| Another writer advanced the branch | A second run started on the same task, or a person pushed to the branch. Nothing is lost, and the agent resumes on top of those commits. | If it happens again, check whether two runs are active for the same task. |
| The run rewrote history that was already published | Agents are told to add commits and never amend, reset or rebase. The platform lets a run force-push over the commits that the same pass published, so this refusal means the rewrite went further back than that. No commits are dropped, and the step continues from what is on the branch. | Nothing. The step is sent again automatically. |

To see how often this happens:

- On `GET /api/v1/debug/runs/:runId`, a step that was sent again for this reason shows
  `branchContentionRecoveries`.
- Each refusal adds one to the `cat_factory.platform.container_branch_contentions` counter. Use this
  counter to see whether it happens more often than before.

See [Debug a run](./debugging-a-run.md) and [Observability](./observability.md).

### A run stops advancing, and nothing is failing

Check the run's decisions and the notification inbox. The run is almost certainly waiting for a
person to answer a decision (it is "parked"). A parked run waits with no time limit, by design. See
[Decision prompts](../guide/core-concepts.md#decision-prompts).

### A run failed as `state_unreadable`, and the debug endpoints do not serve it

Report it as a defect. This is the one failure that a retry cannot fix, because a retry reads the
same stored row again.

To report it, get the run id from the dashboard's failure breakdown. The debug endpoints cannot give
it to you:

- `GET /api/v1/debug/runs` leaves the run out of the page.
- `GET /api/v1/debug/runs/:runId` answers `500`.

The failure breakdown counts these runs in SQL, so it can see rows that the reads cannot decode.

What happened: the run's stored row breaks its own contract, for example a column that must never be
null is null, or an enum holds a value outside its set. Nothing can decode the row. The platform
settles the run instead of leaving it `running` forever, and its card moves to **blocked**. See
[Runs with an unreadable state](./observability.md#runs-with-an-unreadable-state).

### The CI gate never goes green

Fix the failing checks in your CI. The gate reads your host's real check runs, so it is exactly as
strong, and as slow, as your CI. When checks fail again and again, the platform sends the CI-fixer
agent, up to the preset's attempt limit. After that it raises a review card. It does not loop forever.

### A run "spent nothing" in the dashboard

There are two possible causes:

- **The model is served by a subscription harness.** Such a harness files its own call records, so
  its tokens are attributed differently from proxied calls.
- **A step shows no calls at all.** Check whether prompt capture is on. Prompt bodies need two
  switches: one for the deployment and one for each workspace. See
  [Controlling prompt retention](./observability.md#controlling-prompt-retention).

## Integrations answer 503

Read the reason on the response. A `503` from this platform means one of two things:

| Reason | What it means | What to do |
| --- | --- | --- |
| Not configured | This deployment never set up the capability. Sealed stores (vendor credentials, capability credentials, notification webhooks) all need `ENCRYPTION_KEY`. Without it, their endpoints refuse rather than store a secret in plain text. | Configure the capability. For sealed stores, set `ENCRYPTION_KEY` first. |
| Configured but unreachable | The upstream is down. | Fix the upstream. If you turned on the infrastructure-reachability watcher, it reports a dead environment provider or runner pool as unreachable, and raises a notification so that each run does not find out by itself. |

### A self-hosted gateway's model (Bifrost, LiteLLM) cannot be selected

Set the gateway's base URL: `BIFROST_BASE_URL` or `LITELLM_BASE_URL`. A connected
key is not enough, because there is no public endpoint to fall back to. A pipeline that pins one of
these models is blocked at start, so it does not fail during the run.

### A local runner is refused

Use a loopback URL, or opt in to private-LAN access. The server fetches the runner's base URL
itself, so by default the URL must be a loopback address. The platform also refuses
a URL that contains credentials, a query string, or a fragment, and it checks every redirect again.
See
[Connect a Model Provider → local runners](../guide/model-providers.md#running-on-a-local-llm-ollama-lm-studio).

### A webhook delivers nothing

Check the direction of the webhook:

- **Inbound tracker webhooks** fail closed when the signing secret is not configured. Configure the
  secret.
- **Outbound notification webhooks** need a public HTTPS endpoint, unless an operator relaxed that
  rule for this deployment.

## GitLab-specific surprises

Most of these are documented gaps, not faults. See the
[support matrix](../reference/vcs-support-matrix.md) for the full list.

| Symptom | Cause | What to do |
| --- | --- | --- |
| Code search returns nothing. | GitLab's basic search API cannot supply usable results for each hit. | Nothing. Agents read the checkout instead. |
| A revoked connection still looks live. | Connection-lifecycle webhooks are not mapped. | Wait for the next periodic reconciliation, which applies the change. |
| Issue-type filters do not narrow the list. | GitLab has no "bug" type. | Filter by label. |

## When you need to escalate

Collect these before you open an issue. Someone else needs them to reproduce the run:

- the run id,
- the failing step's agent kind and model,
- the reason code from the error,
- the deployment shape: Cloudflare, Node, or local,
- the runner image tag.

You can export a run's telemetry from outside the browser for this purpose. See
[Debugging a run from outside the browser](./observability.md#debugging-a-run-from-outside-the-browser).

---

Next: [Observability](./observability.md) for where the evidence is, or
[Upgrades & Data Retention](./upgrades-and-retention.md) for the upgrade path that prevents half of
the problems on this page.
