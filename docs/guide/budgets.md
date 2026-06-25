# Budgets & Spend

Running agents costs money. Cat Factory keeps that cost visible and bounded with org-wide
metering, a monthly budget, and automatic pausing at the cap.

## How metering works

Every LLM call an agent makes is metered and added to your organization's running spend total.
This includes calls across all steps of all runs in the organization, regardless of which provider
served them.

A spend gauge in the dashboard shows current utilization at any time.

## Prompt caching

Container agents re-send their conversation prefix on every call. Cat Factory injects a
prompt-cache key (scoped to the execution) so that re-sent prefix is a cache hit on
providers that support prompt caching, cutting the cost of long runs. The observability dashboard
records cached prompt tokens and surfaces the actual cache-hit rate per run, alongside the
effective request token ceiling, so you can see caching working.

## Setting a monthly budget

An organization admin sets a monthly LLM budget. The system enforces it across all
workspaces in the organization. Spend is segregated by organization, so each org's budget is
independent.

## What happens at the cap

When metered spend reaches the budget:

1. In-flight and queued runs pause, showing **Paused (budget)**.
2. No further model calls are made on paused runs.
3. The board surfaces the paused state so it's obvious why work stopped.

You have two ways forward:

- Override the cap (admin) to let work continue immediately, or
- Wait for the period to roll over, at which point runs resume automatically against the
  refreshed budget.

## Confirming spend before a run

When you start a run you're shown a spend estimate and confirm it against your remaining
budget. This keeps surprises out of large pipelines, since you see the likely cost before committing.

## Choosing providers to manage cost

Model choice is a direct lever on spend:

- Cloudflare Workers AI is the default and needs no provider key. It runs on your Cloudflare
  account's Workers AI allowance and pricing, so it is the cheapest tier but not literally free.
- Direct provider APIs (Anthropic, OpenAI, AWS Bedrock, OpenRouter, a self-hosted LiteLLM gateway)
  are available when you supply credentials, for higher-capability models where they're worth it.
- A coding-plan **subscription** you already pay for (Claude, GLM, Codex) runs outside per-token
  metering entirely. See [Model Providers](./model-providers.md).
- A model on **your own local runner** (Ollama, LM Studio, …) incurs no API spend at all, since it
  runs on your hardware.

Assign cheaper models to routine agent kinds and reserve stronger ones for architecturally
significant work, all through the **model presets** under **Configuration → Model Configuration**.
See [Choosing models](./running-pipelines.md#choosing-models).

::: warning Set a budget before scaling up
Metering protects you only if a cap is configured. Set an organization budget before turning many
agents loose, so a runaway pipeline pauses instead of billing.
:::

---

Next: standardize how agents behave with [Prompt Fragments](./prompt-fragments.md).
