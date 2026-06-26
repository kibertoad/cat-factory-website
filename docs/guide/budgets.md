# Budgets & Spend

Running agents costs money. Cat Factory keeps that cost visible and bounded with per-workspace
metering, a monthly budget, and automatic pausing at the cap.

## How metering works

Every LLM call an agent makes is metered and added to the workspace's running spend total. This
includes calls across all steps of all runs in the workspace, regardless of which provider served
them. Each call's token usage is priced into the workspace's budget currency and recorded in a
persistent ledger. Spend is segregated by workspace, so each workspace's budget is independent.

A spend gauge in the dashboard shows current utilization against the budget at any time.

## Prompt caching

Container agents re-send their conversation prefix on every call. Cat Factory injects a
prompt-cache key (scoped to the execution) so that re-sent prefix is a cache hit on
providers that support prompt caching, cutting the cost of long runs. The observability dashboard
records cached prompt tokens and surfaces the actual cache-hit rate per run, alongside the
effective request token ceiling, so you can see caching working.

## How pricing works

Prices come from a built-in catalog: an approximate per-model list price (per 1,000,000 tokens)
for each provider and model the system knows about, converted into the budget currency. The
catalog matches most-specific first: an exact `provider:model` entry, then a provider-level entry,
then a fallback price for anything uncatalogued. For OpenRouter, each enabled model is priced at
its real upstream rate from the live catalog rather than the generic fallback, so dynamic models
meter as accurately as the curated ones.

You do not set per-token prices yourself. The catalog handles pricing; you control spend through
the monthly limit, the currency, and your choice of models (see below). The prices are deliberately
approximate: a budget only needs them in the right ballpark to act as a safeguard.

## Setting a monthly budget

A budget is configured per workspace in the UI, under **Workspace settings -> Budget**, and saved
as encrypted configuration in the database. There are no environment variables for the budget, so
you can tune it without a redeploy.

Two fields:

- Monthly limit: the spend cap for one billing period (a calendar month, UTC). Leave it blank to
  inherit the built-in default of roughly 100 EUR per month.
- Currency: a 3-letter ISO 4217 code (for example `EUR`, `USD`). Leave it blank to inherit the
  default (`EUR`). The currency applies to both the limit and the catalog prices.

A change takes effect within a short window (resolved pricing is cached briefly for the spend
gate), so a new budget applies to subsequent steps shortly after you save.

## Budget of 0: local- or subscription-only

Setting the monthly limit to `0` is a valid, intentional choice. It means "no paid spend": runs on
metered models (direct provider API keys, Cloudflare Workers AI) are refused at start and paused
mid-run, while models that incur no metered cost keep running:

- Models on your own local runner (Ollama, LM Studio, …), which are keyless and run on your
  hardware.
- Connected coding-plan subscriptions (Claude Code, Codex), which bill at a flat rate outside
  per-token metering.

So a workspace that deliberately runs only local or subscription models can operate at a `0`
budget without being blocked. The setting is reversible from the UI. Paid web search still costs
money, so a `0` budget also blocks paid web searches.

## What happens at the cap

When metered spend reaches the budget, runs on metered models stop incurring cost:

1. Starting or retrying a run whose pipeline has at least one metered step is refused up front with
   a clear error naming the spend and the limit, instead of starting and pausing silently. A task
   pinned to a local model or a connected subscription still starts.
2. A run already in flight pauses on its next metered step, showing **Paused (budget)**, and makes
   no further model calls.
3. The board surfaces the paused state so it is obvious why work stopped.

A step that incurs no metered cost (a local-runner model or a connected subscription) is exempt
from the gate, so it keeps running even while metered runs are paused.

You have two ways forward:

- Raise the budget under **Workspace settings -> Budget**. An admin can then resume the paused runs
  in the workspace, which re-drives them against the refreshed budget.
- Wait for the billing period to roll over at the start of the next calendar month, at which point
  the period's spend resets and resumed runs proceed against the fresh budget.

## Confirming spend before a run

When you start a run you are shown a spend estimate and confirm it against your remaining budget.
This keeps surprises out of large pipelines, since you see the likely cost before committing.

## Choosing models to manage cost

Model choice is a direct lever on spend:

- Cloudflare Workers AI is the default and needs no provider key. It runs on your Cloudflare
  account's Workers AI allowance and pricing, so it is the cheapest metered tier but not literally
  free.
- Direct provider APIs (Anthropic, OpenAI, AWS Bedrock, OpenRouter, a self-hosted LiteLLM gateway)
  are available when you supply credentials, for higher-capability models where they are worth it.
- A coding-plan subscription you already pay for (Claude, GLM, Codex) runs outside per-token
  metering entirely. See [Model Providers](./model-providers.md).
- A model on your own local runner (Ollama, LM Studio, …) incurs no API spend at all, since it
  runs on your hardware.

Assign cheaper models to routine agent kinds and reserve stronger ones for architecturally
significant work, all through the **model presets** under **Configuration -> Model Configuration**.
See [Choosing models](./running-pipelines.md#choosing-models).

::: warning Set a budget before scaling up
Metering protects a workspace only if a cap is configured. A workspace with no budget set inherits
the built-in default (~100 EUR/month); set an explicit budget under **Workspace settings -> Budget**
before turning many agents loose, so a runaway pipeline pauses instead of billing.
:::

---

Next: standardize how agents behave with [Prompt Fragments](./prompt-fragments.md).
