# Model Providers & Subscriptions

Agents need a model behind them. Cat Factory can reach models four ways, and a single run can mix
them per agent kind. This page explains the options and how to connect a coding-plan subscription.

## The four ways a model is served

| Source | How it is set up | When it applies |
| --- | --- | --- |
| **Cloudflare Workers AI** | Register the Workers AI provider (the `AI` binding on Cloudflare, or `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` over REST elsewhere). No provider key. | The low-cost fallback whenever a model has no richer flavour configured. |
| **Direct provider API key** | Connect the key in the UI (below). Stored encrypted under [`ENCRYPTION_KEY`](../deploy/configuration.md#credential-encryption). | A model upgrades to its direct provider automatically once a key for that provider is in scope. |
| **Vendor subscription or key** | Connected in the UI (below). | A model runs in the Claude Code or Codex harness, authenticated with a coding-plan subscription or a vendor API key. |
| **Your own local runner** | Each user adds a runner (Ollama, LM Studio, and similar) in [My local runners](#running-on-a-local-llm-ollama-lm-studio). No API key. | The enabled local models appear in the picker for that user's runs, resolved on their machine. |

When more than one source could serve a model, **subscriptions win first**, then a direct API key (a
local runner counts as a direct-flavour key for the initiating user), then Cloudflare. Direct keys
are the right path for org-wide and programmatic access.

::: tip First-run setup
A fresh workspace with no usable model source shows a **"No AI model configured"** banner and opens a
**Set up an AI model provider** prompt that routes you to provider keys, OpenRouter, or a local
runner. If your default [preset](#model-presets) points at a model none of your connected sources can
serve, the task inspector flags the mismatch so a run never silently falls back.
:::

## Connecting a direct provider key

Direct provider API keys (OpenAI, Anthropic, Qwen, DeepSeek, Moonshot, OpenRouter, and a
self-hosted LiteLLM gateway) are onboarded in the UI and stored encrypted, not set through
environment variables. Each key is connected at one of three **scopes**, and a run draws from all
the scopes that apply to it:

- **Account**: shared by every workspace in the organization.
- **Workspace**: limited to one board.
- **User** (your own `/me` keys): only your runs use them.

Connect more than one key for a provider and Cat Factory pools and rotates across them. A model's
direct flavour becomes selectable as soon as a key for that provider is in scope; remove the last
one and the model falls back to a subscription or Cloudflare. Because the keys are pooled and shared,
this is the supported path for **org-wide, programmatic, and unattended** access, including the
Claude and GPT models that a personal subscription keeps per-user.

### Aggregator gateways: OpenRouter and LiteLLM

Two of the direct providers are OpenAI-compatible gateways that front many upstream models:

- **OpenRouter** reaches hundreds of models through one key (`sk-or-…`), and is a first-class entry
  in the **Models & providers** group of the Integrations hub. Connect the key inline there, then
  **Refresh catalog** to browse OpenRouter's live model list, filter it, and tick the subset you want
  to enable (or hit **Enable recommended** for a curated starter set). Enabled models surface in the
  picker as `openrouter:<slug>` with their live context window and per-million price, metered against
  your [budget](./budgets.md). When only an OpenRouter key is in scope, a logical model routes through
  OpenRouter automatically; add the native vendor key and it switches to the vendor. The gateway URL
  has a public default, so the catalog works as soon as the key is connected.
- **LiteLLM** is a gateway **you host**. Connect a virtual key (or its master key) the same way, but
  its model stays unselectable until your operator sets the gateway's base URL
  ([`LITELLM_BASE_URL`](../deploy/configuration.md#llm-providers)). A pipeline that pins a LiteLLM
  model is blocked at start until then, rather than failing mid-run. Rename the catalog's generic
  entry and tune its pricing to match your gateway's actual routing.

## Connecting a subscription

A connected vendor credential lets agents run through the Claude Code or Codex harness, talking
straight to the vendor outside Cat Factory's per-token spend metering. You connect it in the
**LLM Vendors** settings; it stores no env vars and only needs
[`ENCRYPTION_KEY`](../deploy/configuration.md#credential-encryption) so the token is encrypted at
rest. What you connect differs by vendor (a coding-plan subscription for Claude, GLM, or Kimi; a
plain API key for DeepSeek), and so does whether it can be shared, which sorts them into two groups.

### Pooled (workspace) credentials

Kimi (Moonshot's coding plan) and DeepSeek (a commercial API key, not a consumer subscription) both
permit organizational use under their terms, so a workspace connects one credential and shares it
across the team. Connect it once and every member's runs use it; add more than one and Cat Factory
rotates across them.

### Personal (individual-usage) subscriptions

Claude, GLM, and ChatGPT/Codex are licensed for **individual use only**. Anthropic's consumer
Claude (Pro/Max), Z.ai's GLM Coding Plan, and a ChatGPT/Codex seat are each tied to one person, and
their terms forbid sharing one credential across a team, at every tier (a ChatGPT Team or Enterprise
plan hands out more individual seats, not one shared credential). Cat Factory honours that with a
per-user mode rather than a workspace pool:

- Each **user** connects their own credential, and only that user's runs can use it.
- These vendors are never poolable on any workspace, personal or org. The restriction is on
  *sharing one subscription credential*, not on the models themselves: an organization that wants
  every member to use Claude or GPT models sets a direct provider API key (`ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY`), which is the supported path for shared, org-wide access. The models stay
  available to the org; only pooling a personal subscription is off the table.

### Why a personal password

A run that uses one of your personal subscriptions asks for a **personal password** to unlock it.
What that password does is easy to misjudge, since it is tempting to assume it protects more than it
does.

The password is about **intentionality, not security against attackers**. Your token is stored
double-encrypted: the system seals it with the deployment's `ENCRYPTION_KEY`, and your password
seals it again underneath. The system seal is what actually keeps your token safe at rest. An
external attacker, a database leak, or a curious teammate has no way past it without the system key,
and your password makes no difference to any of them. It only comes into play against someone who
already holds the system key.

What the password actually buys is twofold:

- It makes you **unlock your own credential on purpose**, so the system has no quiet way to pool an
  individual-use token across a team. A teammate who triggers a run starts a *new* run under *their*
  identity and is prompted for *their own* password, so they can never accidentally ride yours.
  Ownership is enforced by construction: a run records who initiated it and the executor only ever
  leases that user's credential.
- Underneath the system key, it is a second factor at rest. The one actor it guards against is a
  holder of the system key (an operator or insider), and defending against that actor is an explicit
  non-goal here, since anyone running the deployment could capture secrets regardless.

### How unlocking works in practice

You are not re-prompted on every action. After you enter it once, the password is cached in your
browser, so starting, retrying, and approving from your side runs ride along without asking
again. The server never stores the password; it travels as a request header, never in a saved record.

Unlocking mints a short-lived, per-run activation (re-encrypted with the system key only, scoped to
that one run) so the asynchronous container steps can authenticate while you are away. That
activation is deleted the moment the run finishes, and a healthy run that you keep tending re-mints
it on each interaction, so the activation only ever expires on a stuck or abandoned run, not a live
one. A background sweep reclaims any stragglers.

### Responsible use

- Connect **only your own** subscription, and only where its terms permit individual use. For
  organization-wide use, use a direct provider API key instead.
- Use a **strong password**. It is the second factor protecting your token at rest and is never
  recoverable from the server: if you forget it, you reconnect the subscription. All your personal
  subscriptions share one password, so a run that touches several unlocks them together.
- Don't pin individual-usage models on work meant to run **unattended**.

::: tip Recurring pipelines can't use personal subscriptions
A [scheduled pipeline](./recurring-pipelines.md) fires with no one present to enter a password, so
Cat Factory refuses to start one that resolves to an individual-usage model. Point recurring work at
a pooled subscription, a direct API key, or the Cloudflare default.
:::

## Running on a local LLM (Ollama, LM Studio, …)

You can point agents at a model running **on your own machine** (Ollama, LM Studio, llama.cpp,
vLLM, or any OpenAI-compatible server), so no tokens leave your network and there is no per-token
spend. Like personal subscriptions, runners are **per-user**: each person configures their own, and
only that person's runs use them.

Add one under **Settings → My local runners**:

1. Pick the runner type (the base URL is prefilled, e.g. `http://localhost:11434/v1` for Ollama,
   `http://localhost:1234/v1` for LM Studio) or choose **Custom** and enter your own URL. An
   API-key/bearer token is optional, for a runner that requires one.
2. Cat Factory **probes the runner** (its `/v1/models`) and lists the models it found. Enable the
   ones you want to use.
3. The enabled models appear in the picker as a **direct**-flavour model, with no API key. When you
   start a run, the proxy resolves *your* runner's endpoint for that step.

A model is only offered once you've enabled that specific model id, so a pin to a model you later
disable is caught at the pipeline-start guard rather than failing mid-run.

::: warning Local runners must be reachable from the backend
The base URL is called **server-side** (both the test probe and the run-time proxy), so it is
constrained to a loopback/LAN allow-list: `localhost`, `*.local`, and private
(RFC1918 / IPv6 ULA) addresses are accepted; public hosts and the cloud-metadata address
(`169.254.169.254`) are rejected. On a cloud deployment the backend can't reach a runner on your
laptop; local runners are intended for [local mode](../deploy/local.md) or a self-hosted backend on
the same network.
:::

## Subscription-only models

Connecting a subscription unlocks models that have no Cloudflare or API-key flavour, such as the
Claude Opus and Sonnet coding-plan models and the Codex GPT models. Because they have no fallback,
they only appear once the matching subscription is connected, and inline steps (such as the
requirements reviewer) fall back to the deployment's default routing rather than using them.

## Model presets

Whichever source serves a model, you assign models with **presets** under
**Configuration → Model Configuration**, not one model per agent kind. A preset names a single
**base model** for every agent kind, plus optional **per-kind overrides** (point the Architect at a
stronger model while everything else stays on the base). Exactly one preset is the workspace
**default**. Every new workspace seeds two built-ins, **Kimi K2.7** (the default) and **GLM-5.2**,
and you can add your own.

A task picks its preset in the new-task form or the inspector; changing it affects only the steps
that haven't started yet. Reserve stronger models for architecturally significant kinds and keep
cheaper ones on routine steps. See [Choosing models](./running-pipelines.md#choosing-models) and
[Budgets & Spend](./budgets.md).

---

Next: turn a ready task into code with [Running Pipelines](./running-pipelines.md).
