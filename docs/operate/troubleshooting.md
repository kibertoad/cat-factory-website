# Troubleshooting

Symptoms, in the order operators actually meet them, each with the check that tells you which cause
you have. Where a cause has a page of its own, the entry links it rather than restating it.

Before anything else, two habits save most of the time here:

- **Read the error's own reason.** Refusals from this platform carry a machine-readable reason
  beside the message, and the app maps it to specific remedy copy. "This deployment has not
  configured the capability" and "the capability is configured but its upstream is down" are
  different reasons with the same status.
- **Open "Show details" before you quote anything.** A failure toast leads with what you can act on
  and keeps the rest one click behind **Show details**: the platform's own untranslated message, a
  validation failure's per-field issues, and the `requestId` that joins the failure to the one server
  log line about it. Failure toasts do not auto-dismiss, their text is selectable, and one click
  copies the whole report. That `requestId` is the difference between a reproducible report and a
  screenshot.
- **Check the run first, the deployment second.** [Run and step diagnostics](./observability.md#run-and-step-diagnostics)
  shows the failing step, its model calls, and the container's own logs.

One thing to expect of transport failures: on the Node runtime a failed outbound connection reaches
the platform from its HTTP client as a bare `fetch failed`, with what actually happened one level
down. Every surface that describes a failure walks down to that cause and reports it, so a
**Test connection** verdict, a log line, a toast and a persisted step reason all name the same real
thing: `connect ECONNREFUSED 10.0.0.5:6443`, an expired certificate, a DNS miss. Take the named cause
as the symptom to work from.

## The deployment will not boot

**A required value is missing.** The config loader names the variable and what needs it, and
distinguishes a hard failure from a warning that does not block boot. See
[Configuration → When a required value is missing](../deploy/configuration.md#when-a-required-value-is-missing).

**Postgres connection resets at boot (`ECONNRESET`).** On Windows with Docker Desktop, `localhost`
resolves to IPv6 first and the connection is refused there. Use `127.0.0.1` in `DATABASE_URL`.

**Migrations fail, or the app claims the schema is inconsistent.** The migration ledger lives in its
own schema, so dropping the application schema by hand wipes the data while the ledger still claims
everything is applied. The boot check detects exactly that and names the recovery. Recovery is
deliberate and destructive: reset all of the application-owned schemas together, so the ledger can
never outlive the data. Never hand-drop one schema alone.

**Enterprise SSO refuses to start.** All three SSO variables are required together, and a partial
set, a non-HTTPS issuer, a weak session secret, or dev-open auth alongside SSO each refuse boot on
purpose rather than starting in a state that looks configured.

## Runs will not start

**"No AI model configured".** No connected source can serve any model. Connect a provider key, an
aggregator key, a subscription, or a local runner. See
[Connect a Model Provider](../guide/model-providers.md).

**The start is refused naming a model.** The workspace's default preset points at a model none of
your connected sources can serve, or an account [model access policy](../guide/model-providers.md#restricting-model-families)
blocks its family. Both refuse at start rather than silently rerouting, so the fix is to pick a
model your sources can serve or to adjust the policy.

**The start is refused over budget.** The workspace has reached its monthly spend limit and the
pipeline has at least one metered step. A pipeline whose every step runs on a subscription or a
local runner starts normally, because neither is metered. See [Control Spend with Budgets](../guide/budgets.md).

**A recurring pipeline refuses to start.** A scheduled run fires with nobody present to unlock a
personal subscription, so a schedule that resolves to an individual-use model is refused. Point
recurring work at a pooled subscription, a direct key, or the Cloudflare default.

**"No repository is linked".** A task resolves its repository by walking up to the service frame
that encloses it. There is deliberately no fallback to "the first repository", because guessing once
pushed a task into somebody else's repository. Link the frame to a repository, or move the task
under one that is linked. See [Connect a Repository](../guide/repositories.md).

## A run fails or stalls

**`Container dispatch failed (HTTP 404)`.** The runner image tag the deployment points at does not
exist in the registry it pulls from. This is the classic symptom of an upgrade where the image was
not mirrored into your own registry under a fresh tag. Reusing an existing tag does not roll out.
See [Upgrades](./upgrades-and-retention.md).

**A step aborts for inactivity.** The harness kills a job that produces no output for the inactivity
window, which is deliberately tighter than any single command's own timeout. A slow cold install or
a long build inside an agent step is the usual cause; the fix is to prepopulate dependencies rather
than to raise the ceiling.

**A step fails cloning, pushing or merging with a `403`.** The token the run authenticated as is too
narrow for the work. The board raises a banner for this on open rather than letting a pipeline
discover it several steps in: it resolves the token a run would **actually** present, asks GitHub what
that token can do against the repositories this board's services target, and links to the token form
with the kind of token carried over. Two things to know when you read it:

- **It reports per capability, in three states.** A classic token's scopes come back on a response
  header; a fine-grained token reports nothing anywhere, so its reach is only knowable by probing a
  repository, which answers for push alone. `unknown` therefore means "not established", not
  "missing", and only an established blocking gap or an outright rejected token raises the banner. An
  unreachable or rate-limited GitHub raises nothing rather than accusing your credential.
- **A `404` on every targeted repository is reported as a missing capability.** GitHub answers `404`
  rather than `403` for a repository a credential may not see, so that is the fine-grained token
  pointed at the wrong repositories.

The banner names whether the credential is the **deployment's** or **yours**, so a local developer is
not sent to their personal settings to replace a token from the deployment's `.env`. A workspace that
turned off using the initiator's stored token is not warned about a credential none of its runs touch.
The check reads capability and does not bound it: a token that passes is still exactly as wide as
whoever minted it made it. See
[Configuration → What a personal access token can do on the run path](../deploy/configuration.md#what-a-personal-access-token-can-do-on-the-run-path).

**A step reports that its push to the work branch was refused.** The platform pushes an agent's
commits to the branch about once a minute while it works, so nothing is lost if the container dies.
That makes the platform a writer on the branch too, and a push is refused when the branch carries
commits the push would drop. The step is re-dispatched once and resumes from the branch as it now
stands, so the usual outcome is a run that succeeds having spent one agent pass twice. The failure
message names which of two causes it was, and they need different reactions:

- **Another writer advanced the branch** (a second run started against the same task, or a person
  pushed to it). Nothing is lost, and the agent resumes on top of those commits. If it recurs, check
  whether two runs are active for the same task.
- **The run rewrote history that was already published.** Agents are instructed to add commits and
  never amend, reset or rebase, and the platform lets a run force over the commits that same pass
  published, so a refusal here means the rewrite reached further back than that. No commits are
  dropped; the re-dispatch continues from what is on the branch.

A step re-dispatched for this reason reports it as `branchContentionRecoveries` on
`GET /api/v1/debug/runs/:runId`, and each refusal increments the
`cat_factory.platform.container_branch_contentions` counter, which is what answers whether it is
happening more than it was. See [Debug a run](./debugging-a-run.md) and
[Observability](./observability.md).

**A run stops advancing and nothing is failing.** It has almost certainly parked on a human
decision, which waits indefinitely by design. Check the run's decisions and the notification inbox.
See [Decision prompts](../guide/core-concepts.md#decision-prompts).

**A run failed as `state_unreadable`, and the debug endpoints will not serve it.** Its stored row
violates its own contract (a column that must never be null, an enum outside the set), so nothing can
decode it: `GET /api/v1/debug/runs` drops it from the page and `GET /api/v1/debug/runs/:runId`
answers `500`. The run is settled rather than left `running` forever, and its card drops to
**blocked**. This is the one failure a retry cannot help, because the retry re-reads the same row.
It is a defect worth reporting: collect the run id from the dashboard's failure breakdown, which
counts these in SQL and so can see rows the reads cannot. See
[Runs with an unreadable state](./observability.md#runs-with-an-unreadable-state).

**The CI gate never goes green.** The gate reads your host's real check runs, so it is exactly as
strong, and as slow, as your CI. Repeated failures dispatch the CI-fixer agent up to the preset's
attempt ceiling and then raise a review card rather than looping forever.

**A run "spent nothing" in the dashboard.** A model served by a subscription harness files its own
call records, so its tokens are attributed differently from proxied calls. If a step shows no calls
at all, check whether prompt capture is on: bodies are double-gated by a deployment switch and a
per-workspace toggle. See [Controlling prompt retention](./observability.md#controlling-prompt-retention).

## Integrations answer 503

A 503 from this platform means one of two different things, and the reason says which:

- **Not configured.** The capability was never wired on this deployment. Sealed stores (vendor
  credentials, capability credentials, notification webhooks) all need `ENCRYPTION_KEY`, and without
  it their endpoints refuse rather than storing a secret in the clear.
- **Configured but unreachable.** The upstream is down. The infrastructure-reachability watcher, if
  you have enabled it, reports a dead environment provider or runner pool as unreachable and raises
  a notification instead of letting each run discover it.

**A self-hosted gateway's model (Bifrost, LiteLLM) stays unselectable.** It needs that gateway's base
URL set by an operator (`BIFROST_BASE_URL` / `LITELLM_BASE_URL`); a connected key alone is not enough,
because there is no public endpoint to fall back on. A pipeline pinning one is blocked at start rather
than failing mid-run.

**A local runner is refused.** The runner's base URL is fetched server-side, so it is constrained to
loopback unless an operator opts into private-LAN reach. URLs carrying credentials, a query string,
or a fragment are refused, and every redirect hop is re-checked. See
[Connect a Model Provider → local runners](../guide/model-providers.md#running-on-a-local-llm-ollama-lm-studio).

**A webhook delivers nothing.** Inbound tracker webhooks fail closed when the signing secret is
unconfigured, and outbound notification webhooks require a public HTTPS endpoint unless an operator
has relaxed that for a specific deployment.

## GitLab-specific surprises

Most of these are documented gaps rather than faults. See the
[support matrix](../reference/vcs-support-matrix.md) for the full list.

- **Code search returns nothing.** GitLab's basic search API cannot supply usable per-hit results,
  so agents fall back on reading the checkout.
- **A revoked connection keeps looking live.** Connection-lifecycle webhooks are not mapped, so the
  change lands on the next periodic reconciliation rather than immediately.
- **Issue-type filters do not narrow.** GitLab has no "bug" type; filter by label instead.

## When you need to escalate

Collect these before opening an issue, because they are what makes a run reproducible for someone
else: the run id, the failing step's agent kind and model, the reason code from the error, the
deployment shape (Cloudflare, Node, or local), and the runner image tag. A run's telemetry can be
exported from outside the browser for exactly this. See
[Debugging a run from outside the browser](./observability.md#debugging-a-run-from-outside-the-browser).

---

Next: [Observability](./observability.md) for where the evidence lives, or
[Upgrades & Data Retention](./upgrades-and-retention.md) for the upgrade path that avoids half of
this page.
