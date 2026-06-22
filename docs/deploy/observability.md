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

---

Next: route notifications to your team in [Notifications](./notifications.md).
