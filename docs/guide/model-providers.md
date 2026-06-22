# Model Providers & Subscriptions

Agents need a model behind them. Cat Factory can reach models three ways, and a single run can mix
them per agent kind. This page explains the options and how to connect a coding-plan subscription.

## The three ways a model is served

| Source | How it is set up | When it applies |
| --- | --- | --- |
| **Cloudflare Workers AI** | Nothing. The zero-setup default, no provider API key required. | Always available as a fallback. |
| **Direct provider API key** | An operator sets `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc. (see [Configuration](../deploy/configuration.md#llm-providers)). | A model upgrades to its direct provider automatically once the key is present. |
| **Coding-plan subscription** | Connected through the UI (below). | A model runs in the Claude Code or Codex harness, authenticated with the subscription. |

When more than one source could serve a model, **subscriptions win first**, then a direct API key,
then Cloudflare. Direct keys are the right path for org-wide and programmatic access.

## Connecting a subscription

Subscriptions let agents run on a coding plan you already pay for (Claude, GLM, Kimi, DeepSeek, or
ChatGPT/Codex) instead of metered API calls. They store no env vars; they only need
[`ENCRYPTION_KEY`](../deploy/configuration.md#credential-encryption) so the token can be encrypted
at rest. There are two kinds, decided by each vendor's licence.

### Pooled (workspace) subscriptions

Kimi and DeepSeek permit organizational use, so a workspace can connect one token and share it
across the team. Connect it once in the workspace's model settings and every member's runs can use
it.

### Personal (individual-usage) subscriptions

Claude, GLM, and ChatGPT/Codex are licensed for individual use only. Their terms forbid an
organization from pooling one credential, so Cat Factory treats them as personal:

- Each **user** connects their own credential, stored double-encrypted.
- An organization workspace cannot pool Claude. To give a whole org access to Claude models, use a
  direct `ANTHROPIC_API_KEY` instead.

When you start, retry, or approve a run that uses a personal subscription, Cat Factory asks for your
**password** to unlock your credential for that run. The password is held briefly in the browser
(so a burst of run interactions does not re-prompt each time) and the unlocked credential is cleared
when the run finishes.

::: tip Recurring pipelines can't use personal subscriptions
A [scheduled pipeline](./recurring-pipelines.md) fires with no one present to enter a password, so
it cannot use an individual-usage vendor. Point recurring work at a pooled subscription, a direct
API key, or the Cloudflare tier.
:::

## Subscription-only models

Connecting a subscription unlocks models that have no Cloudflare or API-key flavour, such as the
Claude Opus and Sonnet coding-plan models and the Codex GPT models. Because they have no fallback,
they only appear once the matching subscription is connected, and inline steps (such as the
requirements reviewer) fall back to the deployment's default routing rather than using them.

## Choosing per agent kind

Whichever source serves a model, you still pick a **default model per agent kind** under
**Configuration → Default models**. Reserve stronger models for architecturally significant kinds
and keep cheaper ones on routine steps. See [Choosing models](./running-pipelines.md#choosing-models)
and [Budgets & Spend](./budgets.md).

---

Next: turn a ready task into code with [Running Pipelines](./running-pipelines.md).
