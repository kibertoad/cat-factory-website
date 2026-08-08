# Troubleshooting

Symptoms, in the order operators actually meet them, each with the check that tells you which cause
you have. Where a cause has a page of its own, the entry links it rather than restating it.

Before anything else, two habits save most of the time here:

- **Read the error's own reason.** Refusals from this platform carry a machine-readable reason
  beside the message, and the app maps it to specific remedy copy. "This deployment has not
  configured the capability" and "the capability is configured but its upstream is down" are
  different reasons with the same status.
- **Check the run first, the deployment second.** [Run and step diagnostics](./observability.md#run-and-step-diagnostics)
  shows the failing step, its model calls, and the container's own logs.

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
[Model Providers](../guide/model-providers.md).

**The start is refused naming a model.** The workspace's default preset points at a model none of
your connected sources can serve, or an account [model access policy](../guide/model-providers.md#restricting-model-families)
blocks its family. Both refuse at start rather than silently rerouting, so the fix is to pick a
model your sources can serve or to adjust the policy.

**The start is refused over budget.** The workspace has reached its monthly spend limit and the
pipeline has at least one metered step. A pipeline whose every step runs on a subscription or a
local runner starts normally, because neither is metered. See [Budgets](../guide/budgets.md).

**A recurring pipeline refuses to start.** A scheduled run fires with nobody present to unlock a
personal subscription, so a schedule that resolves to an individual-use model is refused. Point
recurring work at a pooled subscription, a direct key, or the Cloudflare default.

**"No repository is linked".** A task resolves its repository by walking up to the service frame
that encloses it. There is deliberately no fallback to "the first repository", because guessing once
pushed a task into somebody else's repository. Link the frame to a repository, or move the task
under one that is linked. See [Repositories](../guide/repositories.md).

## A run fails or stalls

**`Container dispatch failed (HTTP 404)`.** The runner image tag the deployment points at does not
exist in the registry it pulls from. This is the classic symptom of an upgrade where the image was
not mirrored into your own registry under a fresh tag. Reusing an existing tag does not roll out.
See [Upgrades](./upgrades-and-retention.md).

**A step aborts for inactivity.** The harness kills a job that produces no output for the inactivity
window, which is deliberately tighter than any single command's own timeout. A slow cold install or
a long build inside an agent step is the usual cause; the fix is to prepopulate dependencies rather
than to raise the ceiling.

**A run stops advancing and nothing is failing.** It has almost certainly parked on a human
decision, which waits indefinitely by design. Check the run's decisions and the notification inbox.
See [Decision prompts](../guide/core-concepts.md#decision-prompts).

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

**A LiteLLM model stays unselectable.** It needs the gateway base URL set by an operator; a pipeline
pinning one is blocked at start rather than failing mid-run.

**A local runner is refused.** The runner's base URL is fetched server-side, so it is constrained to
loopback unless an operator opts into private-LAN reach. URLs carrying credentials, a query string,
or a fragment are refused, and every redirect hop is re-checked. See
[Model Providers → local runners](../guide/model-providers.md#running-on-a-local-llm-ollama-lm-studio).

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
