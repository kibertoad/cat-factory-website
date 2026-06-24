# Observability

Cat Factory records every model call so you can see what agents are doing, what it costs, and where
runs slow down or fail. There are two layers: a built-in dashboard that always runs, and an optional
Langfuse trace sink for teams that already centralize LLM observability.

## The built-in dashboard

Every LLM call is metered, with no configuration required. Beyond the spend total (see
[Budgets & Spend](../guide/budgets.md)), the observability dashboard records per run:

- Prompt and completion tokens, and the finish reason for each call.
- Cached prompt tokens and the actual **cache-hit rate**, so you can confirm
  [prompt caching](../guide/budgets.md#prompt-caching) is working.
- The effective request token ceiling per call.
- The model's **reasoning trace**, when a reasoning model emits one on a separate channel. Some
  models spend their whole output budget reasoning and return an empty response; capturing the
  reasoning text separately makes that diagnosable instead of a silent empty result. Expand a call
  in the observability panel to see its **Reasoning** section (shown only when the model emitted
  one). No configuration is needed; it's recorded automatically.

This data is stored in your own database (D1 on Cloudflare, PostgreSQL on Node and local).

The **Model activity** panel streams calls live: each call appears the moment the proxy records it,
pushed over the workspace event stream rather than fetched once when the panel opens. Because the
proxy records independently of the run's execution driver, model activity keeps updating even if the
driver stalls, which distinguishes a healthy agent from a wedged one. The live rows carry only
compact telemetry; the full prompt and response load on demand when you expand a call. Live updates
ride the workspace realtime stream (the Cloudflare deployment today); every runtime still records the
same calls to the database, so the panel is accurate on open everywhere.

## Controlling prompt retention

By default each recorded metric keeps the full prompt sent to the model. For deployments that must
not retain prompt text, drop it and keep only the numeric telemetry:

```bash
LLM_RECORD_PROMPTS=false
```

Tokens, timing, finish reason, and counts are still recorded; only the prompt body is omitted. This
setting also governs what the Langfuse sink sends.

## Langfuse trace sink

When you want full traces in [Langfuse](https://langfuse.com), turn on the sink. It streams every
LLM call as a generation grouped under its run's trace: container-agent calls (through the backend
proxy) and inline calls alike (requirements review and the document planner), plus tool spans from
container executions.

```bash
LANGFUSE_ENABLED=true
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
# LANGFUSE_BASE_URL=https://cloud.langfuse.com   # optional; self-hosted Langfuse also works
```

All four take effect together: the sink stays off unless `LANGFUSE_ENABLED=true` and both keys are
set. Point `LANGFUSE_BASE_URL` at your own instance for self-hosted Langfuse.

The sink respects `LLM_RECORD_PROMPTS`: with prompts disabled, traces carry only numeric telemetry.

::: tip Where to set these
On Cloudflare, set `LANGFUSE_SECRET_KEY` as a Worker secret (`wrangler secret put LANGFUSE_SECRET_KEY`)
and the rest as plain vars. On Node and local, put them in your `.env` or secret manager. See
[Configuration → Observability](./configuration.md#observability).
:::

## What gets traced

| Call site | Built-in dashboard | Langfuse |
| --- | --- | --- |
| Container agents (coder, ci-fixer, tester, …) | yes (via the proxy) | yes, with tool spans |
| Inline agents (requirements review, document planner) | yes | yes |

Traces are sent per call rather than batched, bounded by a short timeout, so a slow or unreachable
Langfuse never blocks a run.

## Post-release health and Agent-On-Call

When a deployment connects Datadog, a pipeline can carry a **post-release-health** gate that watches
production after a PR merges, and escalates to an on-call agent if the release looks bad. It turns
a "merged" state into "merged and verified healthy" without a human babysitting the dashboard.

### How the gate works

The gate runs immediately after the **Merger**, and only when the PR actually merged (if the run
ended at a review without merging, the gate passes, since there's nothing deployed to watch). For each
release it watches the Datadog **monitors** and **SLOs** configured on that block:

- It polls over a watch window (default **30 minutes**), classifying each signal as ok, warn, alert,
  or no-data.
- A monitor that was **already alerting before** the release is treated as a pre-existing incident
  and does not fail the gate.
- If a watched monitor alerts or an SLO breaches, the gate **fails and escalates to Agent-On-Call**.
- If the window elapses with no alert, the gate **passes**. Running out of poll budget while still
  healthy is also a pass, not a timeout.

Tune the window and the number of on-call investigations per release through the task's
[merge preset](../guide/designing-your-board.md#navigating-navbar-and-command-bar)
(`releaseWatchWindowMinutes`, default 30; `releaseMaxAttempts`, default 1).

### Agent-On-Call

On a regression the on-call agent **investigates only**; it never commits or reverts. It clones the
base branch with the merged release, correlates the merged diff against the regression evidence
(the regressed signals plus recent error-log samples from Datadog), and returns an assessment:

- a culprit-confidence score,
- a recommendation (`revert`, `hold`, or `monitor`),
- a rationale and concrete evidence.

The result raises a **release-regression notification** for a human to act on. If `PAGERDUTY_API_TOKEN`
+ `PAGERDUTY_FROM_EMAIL` or `INCIDENTIO_API_KEY` are set and an incident is already open, the
investigation is posted onto it as an annotation (it never opens or re-alerts an incident itself).

### Enabling it

1. Set `DATADOG_ENABLED=true` (and `ENCRYPTION_KEY`, which seals the connection at rest).
2. Connect Datadog per workspace in the UI (**Settings → Datadog**): site, API key, and application
   key. Keys are stored encrypted and never read back. The site must be a recognized Datadog host
   (`datadoghq.com`, `datadoghq.eu`, `us3`/`us5`/`ap1.datadoghq.com`, `ddog-gov.com`).
3. On each block you want watched, list the Datadog **monitor IDs** and **SLO IDs**, and optionally
   an env tag used to scope error-log evidence.
4. Add the **post-release-health** step to a pipeline. The builder offers it only once a Datadog
   connection exists, and the backend refuses to enable the step without one.

With `DATADOG_ENABLED` unset, the gate is a pass-through, so pipelines that include it still run.

---

Next: route notifications to your team in [Notifications](./notifications.md).
