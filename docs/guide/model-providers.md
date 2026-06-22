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

When a run will use one of your personal subscriptions, Cat Factory asks for a **personal password**
to unlock it. It helps to be clear about what that password is and is not for.

The password is about **intentionality, not security against attackers**. Your token is stored
double-encrypted: the system seals it with the deployment's `ENCRYPTION_KEY`, and your password
seals it again underneath. The system layer alone already protects your token against everyone who
does not hold that key: an external attacker, a database leak, a curious teammate. Against those, the
password adds nothing extra, because none of them have the system key in the first place.

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
browser for about 8 hours, so starting, retrying, and approving runs ride along without asking
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
