---
redirectFrom:
  - /deploy/observability.html
---

# Observability

For the operator answering "what did that run actually do, and what did it cost". Cat Factory
records every model call so you can see what agents are doing, what they cost, and where runs slow
down or fail. There are three layers: a built-in dashboard that always runs, the telemetry
and provisioning data it draws on (kept in an isolated store you configure), and an optional Langfuse
trace sink for teams that already centralize LLM observability.

## The built-in dashboard

Every LLM call is metered, with no configuration required. Beyond the spend total (see
[Control Spend with Budgets](../guide/budgets.md)), the observability dashboard records per run:

- Input tokens in three classes, completion tokens, and the finish reason for each call.
- The actual **cache-hit rate**, so you can confirm
  [prompt caching](../guide/budgets.md#prompt-caching) is working.
- The effective request token ceiling per call.
- Cost, priced from the three input classes and rolled up per agent kind and run phase.
- The model's **reasoning trace**, when a reasoning model emits one on a separate channel. Some
  models spend their whole output budget reasoning and return an empty response; capturing the
  reasoning text separately makes that diagnosable instead of a silent empty result. Expand a call
  in the observability panel to see its **Reasoning** section (shown only when the model emitted
  one). No configuration is needed; it's recorded automatically.

### The three input classes

Input tokens are recorded as three separate numbers, and total input is their sum:

| Class | What it counts |
| --- | --- |
| Fresh | Uncached input, billed at the model's base input rate. |
| Cache read | Input served from a prompt cache, typically around a tenth of the base rate. |
| Cache write | Input written into the cache, typically 1.25 to 2 times the base rate. |

A run that keeps invalidating and re-writing its prefix and a run riding a warm cache spend very
differently, and a single lumped "cached tokens" number cannot tell them apart. The split lets the
ledger price a cache-heavy run at what it actually cost, and it makes a runaway prefix visible as a
burn rather than as ordinary volume.

Every call is also attributed to the **run phase** that spent it, so a run's model spend rolls up by
phase rather than arriving as one undifferentiated total. Inline calls a local-mode host CLI serves are
recorded and attributed the same way, per call and live, including the spend of a run that was killed.

The **Model activity** panel streams calls live: each call appears the moment the proxy records it,
pushed over the workspace event stream rather than fetched once when the panel opens. Because the
proxy records independently of the run's execution driver, model activity keeps updating even if the
driver stalls, which distinguishes a healthy agent from a wedged one. The live rows carry only
compact telemetry; the full prompt and response load on demand when you expand a call. Live updates
ride the workspace realtime stream (the Cloudflare deployment today); every runtime still records the
same calls, so the panel is accurate on open everywhere.

Subscription-harness calls are metered too. The **Claude Code** and **Codex** harnesses talk directly
to the vendor and bypass the LLM proxy, so their per-call metrics are lifted off each CLI's event
stream and recorded into the same store: they appear in Model activity alongside proxy-metered calls,
on failed runs as well as successful ones. Claude Code reports full request/response bodies and
per-turn tokens; Codex reports assistant text and per-turn tokens but no request transcript (a CLI
limitation), and neither CLI exposes per-HTTP timing. Captured bodies are credential-scrubbed and
honour `LLM_RECORD_PROMPTS`.

### Web search queries

When a run's agents use [web search](../deploy/configuration.md#web-search), the observability panel's **Web
search** tab shows what they searched: a header saying whether search was available to the run's
containers and which provider served it (Brave or SearXNG), then each query with the agent kind that
issued it, the provider, and the result count. Queries land in a dedicated `agent_search_queries`
telemetry table and are pruned on the same window as agent-context snapshots.

Recording the query text is gated the same way as agent context: both the deployment-wide
`LLM_RECORD_PROMPTS` (on by default) and the per-workspace **Store full agent context** setting must
be on. With either off, the availability header still shows but no queries are stored.

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
URL. Every stored body (both composed prompts, each fragment body, each injected file's content, and
the free-text decisions and revision-feedback bag) is run through the secret scrubber before the size
budget is applied, so truncation can never split a secret across the cap. It strips `user:pass@`
userinfo from any URL and matches PEM-armored private keys plus the usual token shapes, and it drops
the whole body of a context file whose name marks it a raw credential store (`.env`, `*.pem`, SSH
keys, `.npmrc`), since a bare key dump has no scaffolding for the shape rules. Each snapshot is also
size-bounded (a shared 4 MiB budget, consumed prompts-first) so a dispatch that injects many large
files cannot produce an oversized row.

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
  attempts are in the [provisioning event log](#the-provisioning-event-log). Runner-backend,
  runner-pool, and Datadog failures carry a **UI-first remedy** (which settings screen to re-test or
  reconnect), and a dispatch `404` names a stale executor-harness image.
- **Container eviction**: a container that dies mid-run is classified as a **crash** or a
  **transient** eviction rather than a bare "evicted or crashed" string, so a retryable blip reads
  differently from a real failure. It also leaves a post-mortem on the step: the container's exit
  state (an OOM kill is named as one) plus a tail of its own logs, so you can tell "the machine ran out
  of memory" from "the agent errored" without reconstructing it from the runtime.
- **Live call telemetry**: per-model-call metrics stream onto the step as the agent's CLI yields them,
  including subagent calls, rather than arriving only with the terminal result. A run that dies 18
  minutes in still reports the calls and tokens it actually spent instead of zero. Re-recording a call
  is a no-op, so the live stream and the terminal list never double-count.
- **Infrastructure attempts, live**: while a run is active, the **Infrastructure attempts** drawer
  live-tracks each container spin-up and tear-down as it happens, re-polling quietly in the background
  so attempts appear with their timestamps and no refresh spinner flickers. Auto-polling stops once the
  run is terminal (with one final poll to catch the last tear-down), and a manual refresh stays
  available to refetch a row that landed late.
- **Tester stand-up**: when the Tester stands its dependencies up with docker-compose, the test report
  shows whether `docker compose up --wait` succeeded, the compose file, how long it took, and the
  captured (redacted) logs. A readiness banner announces when all infrastructure is up and testing can
  start.
- **Stalled runs**: if a run's durable driver is lost (an orchestrator crash or restart) and recovery
  can't resume it, the board marks it **stalled**, distinct from a plain failure, and offers a retry.
- **Liveness heartbeat**: a step in a long output-less phase (a PR reviewer reading hundreds of
  files, say) shows "active Ns ago" separately from the elapsed clock, so a live-but-quiet step reads
  as working rather than wedged. The same heartbeat keeps the stalled-run sweeper from mis-marking it.
  It is automatic, with nothing to configure.

### Debugging a run from outside the browser

Everything above is reachable over HTTP as well, under `/api/v1/debug/*` with an ordinary `read`-scope
[public API key](../extend/public-api.md#run-debugging). It exists for a caller with a fixed
context budget rather than a scrollbar, so an agent asked "why did this run fail" can use it.

It is a two-level drill-down: a keyset-paginated run index, a per-run overview built purely from SQL
aggregates, then bounded pages over the run's model calls, agent-context dispatches, searches and
provisioning events. Size discipline is enforced in the query rather than in the response, so a
response's size is computable before you ask for it.

**[Debug a Run from Outside the Browser](./debugging-a-run.md)** is the full account: the endpoints,
the signal-by-signal playbook, the body search, spend attribution, and the size ceilings.

::: warning A read key reaches prompts
These endpoints serve prompt and response bodies that the app gates behind workspace roles. Treat a
key that can call them as sensitive even though it is only `read` scope.
:::

## Retention cron

Neither the telemetry store nor the provisioning log self-limits, so a cron prunes each table to its
configured age window. On Cloudflare this runs on the scheduled handler alongside the run sweeper; the
deletes are indexed range-scans and usually reclaim nothing, so they are cheap. A non-positive window
disables that table's pass. Pruning is isolated per table and reports which tables failed, so one
table's problem does not silently stop the rest. The same sweep materializes the daily run rollup the
dashboard's 30- and 90-day windows read.

| Variable | Prunes | Default |
| --- | --- | --- |
| `LLM_CALL_METRICS_RETENTION_DAYS` | `llm_call_metrics` and `agent_context_snapshots` (both ride this window) | 14 days |
| `PROVISIONING_LOG_RETENTION_DAYS` | the provisioning event log | 14 days |

The agent-context snapshots are heavy (full prompt plus injected-file bodies) and the LLM call
metrics keep full per-call prompt and response, so the window trades disk against how far back a
post-mortem can reach. It defaults to 14 days because the 3 days it replaced expired the record
before most investigations start: a run that failed over a weekend was already gone. Set it back to
3 to restore the smaller footprint. The provisioning log is high-churn and defaults to 14 days. The
full set of windows, including the ones this cron does not run, is in
[Upgrades & Data Retention](./upgrades-and-retention.md#retention-windows). On Cloudflare the cron resolves `TELEMETRY_DB`
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
[Configuration → Observability](../deploy/configuration.md#observability).
:::

## What gets traced

| Call site | Built-in dashboard | Langfuse |
| --- | --- | --- |
| Container agents (coder, ci-fixer, tester, …) | yes (via the proxy) | yes, with tool spans |
| Inline agents (requirements review, document planner) | yes | yes |

Traces are sent per call rather than batched, bounded by a short timeout, so a slow or unreachable
Langfuse never blocks a run.

## OpenTelemetry (OTLP) export

For teams that centralize telemetry in an OpenTelemetry backend (Grafana/Mimir, Datadog, an OTel
Collector, anything that speaks OTLP), Cat Factory can export its LLM telemetry and, optionally,
deployment-level run metrics over OTLP/HTTP. It is off by default and turns on only when
`OTEL_ENABLED=true` and `OTEL_EXPORTER_OTLP_ENDPOINT` is set; half-configured, it does nothing.

```bash
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318
# OTEL_EXPORTER_OTLP_HEADERS=x-api-key=abc,x-tenant=42   # optional, merged onto every request
```

| Variable | Purpose | Default |
| --- | --- | --- |
| `OTEL_ENABLED` | Master switch; must be `true` to export anything. | off |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP/HTTP base URL. `/v1/traces` and `/v1/metrics` are appended. | none (required to enable) |
| `OTEL_EXPORTER_OTLP_HEADERS` | Comma-separated `key=value` pairs merged onto every request (auth token, tenant id). | none |
| `OTEL_SERVICE_NAME` | The OTLP resource `service.name`. | `cat-factory` |
| `OTEL_PLATFORM_METRICS` | Also export the deployment-level run gauges below (needs `OTEL_ENABLED=true`). | off |
| `OTEL_PLATFORM_METRICS_INTERVAL_MS` | Node sweep cadence for the platform gauges (Cloudflare is cron-driven). | `60000` |
| `OTEL_PLATFORM_METRICS_WINDOW` | Trailing window for the platform gauges: `1h`, `24h`, or `7d`. | `1h` |

Export is OTLP/HTTP with JSON encoding and DELTA metric temporality. It is best-effort: each send has
a 10-second timeout and a non-2xx response or transport error is logged, never thrown, so a slow or
unreachable backend never blocks a run.

Every LLM call is exported as a span and metrics under the OpenTelemetry GenAI semantic conventions,
with `gen_ai.system` (provider), `gen_ai.request.model`, token counts, and finish reason; the metrics
are `gen_ai.client.token.usage` (a counter split by `input`/`output`) and
`gen_ai.client.operation.duration` (a histogram in seconds). Prompt and completion bodies ride as span
events only when `LLM_RECORD_PROMPTS` is on.

Spans form a **tree** rather than a flat list, so a backend renders a run with its own duration and
status:

```
run  →  agent kind  →  generations + tool calls
```

Every parent id is derived from the run id, so a stateless per-call emission can name a parent it has
never seen and a durable replay re-derives the identical tree instead of a duplicate one. The parent
spans are emitted once, when the run settles. The middle level's grain is the **agent kind** rather
than the step index, because that is the finest thing a generation event can name; a slice that folds
two steps of one kind reports its step count instead of passing them off as one.

With `OTEL_PLATFORM_METRICS=true`, a periodic sweep also exports per-account deployment gauges:
`cat_factory.platform.runs` (split by run status), `run_success_rate`, `run_failures` (split by
failure kind), `live_runs` (a current snapshot split by state), and `run_duration` (split by
`avg`/`min`/`max`/`p50`/`p90`/`p99`). Use them to alert on failure rate and latency in your own stack.

### Operational counters

Aggregating runs answers "how are the runs doing". It structurally cannot answer what an operator asks
during an incident: how often dispatch is failing, whether the sweeper is re-driving more than it was,
whether a queue is draining. Those are events, not rows.

The platform counts them at the sweepers, the container dispatch seam, the trace sink, the outbound
notification webhook, and every application-cache read, and exports them over OTLP as delta sums. A
run's re-drive history is persisted on the run itself, so it outlives the process that did the
re-driving. Every job queue is created with a dead-letter sibling, swept hourly for reporting.

The readiness endpoint round-trips the job queue's own connection rather than reading a process-local
boolean, and the Cloudflare Worker probes its bindings, so `/ready` reflects the deployment rather
than the process's memory of itself.

::: tip Where to set these
On Cloudflare, set `OTEL_EXPORTER_OTLP_HEADERS` as a Worker secret (`wrangler secret put …`) if it
carries a token, and the rest as plain vars. On Node and local, put them in your `.env` or secret
manager.
:::

## Operator dashboard

The **Platform observability** dashboard gives an operator a live read of the whole deployment's run
health without any telemetry backend. It is admin-only, account-scoped, needs no configuration (it
reads the platform's own data, separate from the OTLP push above), and lives on the
[advanced interface tier](../guide/core-concepts.md#interface-tiers). Open it from the sidebar and pick
a window: **Last hour**, **Last 24 hours**, **Last 7 days**, **Last 30 days**, or **Last 90 days**.

It shows:

- **Run outcomes**: Total runs, Completed, Failed, and Success rate.
- **Outcome trend**: a stacked sparkline of completed / failed / other over the window.
- **Failure breakdown**: a bar per failure kind (Preflight, Dispatch, Environment, Evicted, Timeout,
  Agent, Job failed, Rejected, Companion rejected, Stalled, Cancelled, Unknown).
- **Live now**: current Running / Blocked / Paused / Pending counts.
- **Run duration**: Average, Min, Max, and the **p50, p90, and p99** percentiles (nearest-rank over
  the terminal runs in the window).
- **Gate statistics**: per gate kind, how many reached each terminal verdict and how many helper
  attempts (a CI Fixer loop, a conflict resolver) it took to get there.

The 30- and 90-day windows read a daily rollup the retention sweep materializes rather than scanning
raw runs. The projection reports how far back the rollup actually reaches, because an
un-materialized rollup and a genuinely idle quarter both produce an empty series and are opposite
facts.

## Platform-health alerting

Beyond the read-only dashboard, Cat Factory can watch the same run health and raise a notification when
it degrades. It is opt-in through `PLATFORM_ALERTS=true` and independent of the OTLP exporter.

```bash
PLATFORM_ALERTS=true
```

| Variable | Purpose | Default |
| --- | --- | --- |
| `PLATFORM_ALERTS` | Master switch; `true` to enable. | off |
| `PLATFORM_ALERTS_WINDOW` | Evaluation window: `1h`, `24h`, or `7d`. | `1h` |
| `PLATFORM_ALERTS_INTERVAL_MS` | Node sweep cadence (floored at 10s). | `300000` |
| `PLATFORM_ALERTS_MIN_RUNS` | Minimum terminal runs before a failure-rate alert can fire. | `5` |
| `PLATFORM_ALERTS_MAX_FAILURE_RATE` | Failure rate (0–1) at or above which an alert fires. | `0.5` |
| `PLATFORM_ALERTS_MAX_P99_MINUTES` | p99 run duration (minutes) at or above which an alert fires. | `60` |
| `PLATFORM_ALERTS_MAX_BACKLOG` | Live backlog depth (running + blocked + paused + pending) at or above which an alert fires. | `50` |

A periodic sweep evaluates each account against the thresholds and raises a **Platform health alert**
card in the [notifications inbox](./notifications.md) naming the crossed conditions: elevated failure
rate, slow p99, a growing backlog, stalled throughput, one failure kind dominating, or a degraded
sweep. The card de-dupes on the set of crossed conditions, so a persistently-unhealthy deployment
re-notifies only when that set changes, and it clears automatically when the account recovers. The
failure-rate check is gated by `PLATFORM_ALERTS_MIN_RUNS`, so a single failure on a quiet deployment
stays quiet. The card deep-links to the failing runs it aggregated. From the inbox the alert routes on
through your normal [notification channels](./notifications.md) (Slack, and the rest).

The environment variables above are the deployment's defaults. An account can layer its own
thresholds over them from its account settings; an unset value inherits the default rather than
meaning zero.

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
[risk policy](../guide/designing-your-board.md#navigating-navbar-and-command-bar)
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

Next: route what you find to your team with [Set Up Notifications](./notifications.md), or take a
symptom to [Troubleshooting](./troubleshooting.md).
