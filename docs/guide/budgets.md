# Budgets & Spend

Running agents costs money. Cat Factory keeps that cost visible and bounded with metering across
three budget tiers, a monthly limit on each, and automatic pausing when any tier a run belongs to is
exhausted.

## How metering works

Every LLM call an agent makes is metered and priced into the budget currency, recorded in a
persistent ledger, and rolled up against three independent tiers:

- **Workspace**: every call across all runs in one workspace (board).
- **Account**: every call across all workspaces in the account.
- **User**: every call across every run a given user starts, in any workspace.

A spend gauge in the dashboard shows current utilization against the budget at any time.

## The three tiers

The tiers are independent ceilings, not a shared or additive pool. Before every agent step the
engine checks each tier the run belongs to, and a run is over budget when **any** applicable tier is
exhausted. So a run can be paused by the workspace budget, the account-wide budget, or the initiating
user's personal budget, whichever fills first.

You set all three from **Workspace settings -> Budget** ("Monthly spend budget"):

| Section | What it caps | Who can set it |
| --- | --- | --- |
| **This workspace** | Spend across this one board. Also carries the **Currency**. | Any workspace member. |
| **Account (all workspaces)** | A ceiling across every workspace in the account. | Account admins only; others see it read-only. |
| **You (all your runs)** | A ceiling across every run you start, in any workspace. | Each member, for their own limit. |

Leave a field blank for no limit on that tier. Values are saved as encrypted configuration in the
database, so you tune them without a redeploy.

An operator can also impose a hard ceiling the UI cannot exceed, through
[`BUDGET_MAX_MONTHLY_PER_ACCOUNT` / `BUDGET_MAX_MONTHLY_PER_USER`](../deploy/configuration.md#spend-caps-operator-ceilings).
When one is set, that tier's field is clamped to the cap and shows "Operator limit: {amount}".

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

Input tokens are priced in three classes, because they do not cost the same: **fresh** input, a
**cache read**, and a **cache write**. A catalog entry that names no cache rates derives them from
its base input rate. The same classed pricing drives both the spend ledger and the per-run cost
figures, so a cache-heavy run is costed at what it actually spent rather than at the fresh rate for
every token.

Cost is reported on the run surfaces alongside tokens, rolled up per agent kind and run phase. A
slice whose model the catalog cannot price reports no cost rather than zero, and a total containing
one propagates that instead of passing a partial sum off as complete.

You do not set per-token prices yourself. The catalog handles pricing; you control spend through
the monthly limit, the currency, and your choice of models (see below). The prices are deliberately
approximate: a budget only needs them in the right ballpark to act as a safeguard.

## The limit and currency fields

Each tier's **Monthly limit** is the spend cap for one billing period (a calendar month, UTC). Leave
the workspace limit blank to inherit the built-in default of roughly 100 EUR per month. The
workspace section also carries the **Currency**: a 3-letter ISO 4217 code (for example `EUR`,
`USD`), blank to inherit `EUR`. The currency applies to the workspace limit and the catalog prices;
the account and user rollups meter in the base pricing currency.

A change takes effect within a short window (resolved pricing is cached briefly for the spend
gate), so a new budget applies to subsequent steps shortly after you save.

## Metered spend vs. subscription usage

The ledger records **all** token usage, but tags each entry as either **metered** (direct provider
API keys and Cloudflare Workers AI, billed per token) or **subscription** (the flat-rate Claude Code
and Codex harnesses and the pooled Kimi/DeepSeek vendor credentials). **Only metered usage counts
against a budget.** A flat-rate subscription call is recorded for reporting but never inflates spend
or trips a cap, matching the [budget-of-0](#budget-of-0-local--or-subscription-only) rule.

You see this split in the **Usage** tab under **Workspace settings**, which breaks the current billing
period into two sections:

- **Subscriptions**: per-model token totals (input, output, call count) for the flat-rate harnesses,
  with a cost figure labelled illustrative, since these plans bill flat, not per token.
- **Metered API**: per-`provider:model` token totals and the real cost in the budget currency, the
  same numbers that drive the spend gauge.

The Usage report meters **finished runs only**; a failed run's tokens show in the observability
dashboard's per-call metrics rather than here.

## Reports

**Reports** is an account-scoped analytics view, open to account admins on the
[advanced interface tier](./core-concepts.md#interface-tiers). Where the operator dashboard answers
"is the platform healthy", this answers where the spend and the work actually go:

- Spend per model and per agent kind.
- Spend and run activity per board, per service, and per task type.
- A spend trend over a 24-hour, 7-day, 30-day, or 90-day window.
- An optional single-board filter that narrows every breakdown at once.

Real metered cost and the illustrative equivalent-API cost of flat-rate subscription usage are
separate columns throughout and are never summed. A call whose run, service, or task type cannot be
resolved lands in its own **unattributed** slice rather than being dropped, so a breakdown's total
always matches the ledger.

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

When metered spend reaches any tier a run belongs to (workspace, account, or user), runs on metered
models stop incurring cost:

1. Starting or retrying a run whose pipeline has at least one metered step is refused up front with
   a clear error naming the spend and the limit, instead of starting and pausing silently. A task
   pinned to a local model or a connected subscription still starts.
2. A run already in flight pauses on its next metered step, showing **Paused (budget)**, and makes
   no further model calls.
3. The board surfaces the paused state so it is obvious why work stopped.

A step that incurs no metered cost (a local-runner model or a connected subscription) is exempt
from the gate, so it keeps running even while metered runs are paused.

You have two ways forward:

- Raise the exhausted tier's limit under **Workspace settings -> Budget** (the account tier needs an
  account admin). An admin can then resume the paused runs, which re-drive against the refreshed
  budget.
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
