# Observability

Cat Factory records every model call so you can see what agents are doing, what it costs, and where
runs slow down or fail. There are three layers: a built-in dashboard that always runs, the telemetry
and provisioning data it draws on (kept in an isolated store you configure), and an optional Langfuse
trace sink for teams that already centralize LLM observability.

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

The **Model activity** panel streams calls live: each call appears the moment the proxy records it,
pushed over the workspace event stream rather than fetched once when the panel opens. Because the
proxy records independently of the run's execution driver, model activity keeps updating even if the
driver stalls, which distinguishes a healthy agent from a wedged one. The live rows carry only
compact telemetry; the full prompt and response load on demand when you expand a call. Live updates
ride the workspace realtime stream (the Cloudflare deployment today); every runtime still records the
same calls, so the panel is accurate on open everywhere.

## The telemetry store

Telemetry is append-heavy, high-volume, and short-retention, a very different write profile from the
transactional domain. It lives in its own store, physically separate from the main database:

- On **Cloudflare**, a dedicated D1 database bound as `TELEMETRY_DB`, with its own migrations under
  `telemetry-migrations/`.
- On **Node and local**, a separate `telemetry` Postgres schema inside the same database your
  `DATABASE_URL` points at. The boot migrator creates the schema; no extra connection string is
  needed.

The store holds two tables: `llm_call_metrics` (the per-call telemetry the dashboard reads) and
`agent_context_snapshots` (described below).

`TELEMETRY_DB` is required on Cloudflare. The worker fails fast when it is unbound: both the
per-request container build and the daily retention cron resolve it through one guard that throws a
clear error (`TELEMETRY_DB binding is required …`) instead of failing deep inside a repository. Add a
`[[d1_databases]]` entry with `binding = "TELEMETRY_DB"` to `wrangler.toml`:

```toml
[[d1_databases]]
binding = "TELEMETRY_DB"
database_name = "cat_factory_telemetry"
migrations_dir = "telemetry-migrations"
```

### Captured agent context

Beyond the per-call telemetry, Cat Factory can capture the **full context** each container agent was
provided for a dispatch: the composed system and user prompts, the bodies of any best-practice prompt
fragments folded in, and the full content of the files injected into the container (the
`.cat-context/*` files the agent reads through its tools, which never reach proxy telemetry). This
lands in the `agent_context_snapshots` table and renders on demand in the **Provided context** view
when you expand a run in the observability panel.

Capture is gated twice and must pass both: the deployment-wide `LLM_RECORD_PROMPTS` switch (on by
default) AND a per-workspace **store agent context** setting (on by default). With prompt recording
off, nothing is captured.

The snapshot is a redacted allow-list projection: it never copies a token or a credential-bearing
URL. Any `user:pass@` userinfo embedded in an injected document URL or in a tester's ephemeral
environment URL is stripped before the snapshot is stored. Each snapshot is also size-bounded
(a shared 4 MiB budget, consumed prompts-first) so a dispatch that injects many large files cannot
produce an oversized row.

## The provisioning event log

A separate append-only log records every attempt to spin up or tear down throwaway infrastructure:
ephemeral environments and the runner-pool / per-run containers. Each row carries the outcome and, on
failure, the verbatim provider error. You read it per workspace from the env-provider and runner-pool
config panels (**View logs**), and per run from the **Infrastructure attempts** drawer on a run step.
A container that never starts is classified as a dispatch failure ("Container failed to start" plus
the verbatim provider error) rather than a generic run failure.

Like telemetry, the log has high write churn and lives in its own store, separate from the main
database:

- On **Cloudflare**, a dedicated D1 database bound as `PROVISIONING_DB`, with its own
  `migrations-provisioning/` directory. The binding is optional: with no `PROVISIONING_DB` bound,
  the feature is simply off and nothing is recorded.
- On **Node and local**, a separate `provisioning` Postgres schema in the same database. The boot
  migrator creates it.

The verbatim error and the structured detail are scrubbed for credentials at the single recorder
choke point before they are persisted or served: bearer/basic tokens, `Authorization` and
`x-api-key` header echoes, credentialed URLs, secret-ish query and JSON params, and recognizable
token shapes (OpenAI `sk-…`, GitHub `ghp_…` / `github_pat_…`, AWS `AKIA…`, Slack `xox…`, JWTs). The
field name, URL host, and token scheme are kept so the row stays diagnostic; only the secret itself
is dropped.

## Run and step diagnostics

Beyond the metered call data, a run's own UI surfaces what its containers and environments are doing,
so a slow or broken step is diagnosable without reading logs:

- **Container lifecycle**: each agent step shows its container status (starting, up, errored, or
  destroyed), and while it is up, the live phase (for example "Preparing workspace" or "Running agent
  call"), the container id, and a clickable container URL when there is one.
- **Spin-up failures**: a container or environment that never comes up is reported on the step as a
  provisioning failure with the verbatim provider error, rather than a generic run failure. The same
  attempts are in the [provisioning event log](#the-provisioning-event-log).
- **Tester stand-up**: when the Tester stands its dependencies up with docker-compose, the test report
  shows whether `docker compose up --wait` succeeded, the compose file, how long it took, and the
  captured (redacted) logs. A readiness banner announces when all infrastructure is up and testing can
  start.
- **Stalled runs**: if a run's durable driver is lost (an orchestrator crash or restart) and recovery
  can't resume it, the board marks it **stalled**, distinct from a plain failure, and offers a retry.

## Retention cron

Neither the telemetry store nor the provisioning log self-limits, so a cron prunes each table to its
configured age window. On Cloudflare this runs on the scheduled handler alongside the run sweeper; the
deletes are indexed range-scans and usually reclaim nothing, so they are cheap. A non-positive window
disables that table's pass.

| Variable | Prunes | Default |
| --- | --- | --- |
| `LLM_CALL_METRICS_RETENTION_DAYS` | `llm_call_metrics` and `agent_context_snapshots` (both ride this window) | 3 days |
| `PROVISIONING_LOG_RETENTION_DAYS` | the provisioning event log | 14 days |

The agent-context snapshots are heavy (full prompt plus injected-file bodies) and the LLM call
metrics keep full per-call prompt and response, so both default to an aggressive 3-day window. The
provisioning log is high-churn and defaults to 14 days. On Cloudflare the cron resolves `TELEMETRY_DB`
through the same fail-fast guard as the build path, so an unbound binding surfaces the same clear
error rather than an opaque failure logged only as "retention sweep failed".

## Controlling prompt retention

By default each recorded metric keeps the full prompt sent to the model. For deployments that must
not retain prompt text, drop it and keep only the numeric telemetry:

```bash
LLM_RECORD_PROMPTS=false
```

Tokens, timing, finish reason, and counts are still recorded; only the prompt body is omitted. This
switch also gates agent-context capture and governs what the Langfuse sink sends.

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

## Post-run grading (Kaizen)

The **Kaizen** agent grades how well each agent step actually went. After a run reaches a terminal
state, a background sweep (a Cloudflare cron, a Node interval) grades each completed step on how
smooth and efficient versus confused and chaotic the interaction was, reading the context and prompt
the step was given plus its [per-call interaction telemetry](#the-telemetry-store). Each grading is a
**1–5 grade with recommendations**, recorded for later review. Kaizen never appears in the pipeline
builder; it runs only after the fact.

You read the results two ways:

- The **Kaizen screen** shows the grading history and the verified combos (below).
- Inside a run window, each step shows its grading status (scheduled, running, or complete) with the
  result.

To stop re-grading a combination that has proven itself, a `(prompt version, agent kind, model)`
combo that grades **high** (a 4 or 5 with no recommendations) **five times running** is marked
**verified** and is no longer graded. Any lower grade, or a grade that still carries a
recommendation, resets the streak.

Kaizen is a **per-workspace** setting, **on by default** (turn it off in workspace settings). The
grader uses its own model, configured like any pipeline step under
**Configuration → Model Configuration** (the `kaizen` kind); with no grader model wired, grading is
skipped rather than failing.

## Post-release health and Agent-On-Call

When a deployment connects an **observability provider** (Datadog today, through a pluggable adapter),
a pipeline can carry a **post-release-health** gate that watches production after a PR merges, and
escalates to an on-call agent if the release looks bad. It turns a "merged" state into "merged and
verified healthy" without a human babysitting the dashboard.

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
  healthy is also a pass.

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

1. Set `OBSERVABILITY_ENABLED=true` (and `ENCRYPTION_KEY`, which seals the connection at rest).
2. Connect an observability provider per workspace in the UI (**Integrations → Observability**). For
   Datadog: site, API key, and application key. Keys are stored encrypted and never read back. The
   site must be a recognized Datadog host (`datadoghq.com`, `datadoghq.eu`,
   `us3`/`us5`/`ap1.datadoghq.com`, `ddog-gov.com`).
3. On each block you want watched, list the provider's **monitor IDs** and **SLO IDs**, and
   optionally an env tag used to scope error-log evidence.
4. Add the **post-release-health** step to a pipeline. The builder offers it only once a connection
   exists, and the backend refuses to enable the step without one.

With `OBSERVABILITY_ENABLED` unset, the gate is a pass-through, so pipelines that include it still
run.

---

Next: route notifications to your team in [Notifications](./notifications.md).
