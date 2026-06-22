# Configuration

This page is the reference for every environment variable and toggle you'll set when deploying
Cat Factory. Secrets are grouped by concern: authentication, model providers, infrastructure,
service wiring, and feature toggles.

## Authentication

A deployment can offer three sign-in providers in any combination: GitHub OAuth, Google OAuth, and
email/password. Auth turns on as soon as **any** provider is configured together with a strong
`AUTH_SESSION_SECRET`; each provider stays off until its own credentials are present. Regardless of
how people sign in, repository access comes from the [GitHub App](./github-app.md) installation, not
a user's own GitHub token, so a Google- or password-only user works fully. For who is allowed to
create an account and how roles and invitations work, see
[Members, Roles & Invitations](../guide/team-and-access.md).

| Variable | Purpose |
| --- | --- |
| `AUTH_SESSION_SECRET` | Signs session tokens (≥ 32 chars). Auth fails closed without it, whichever providers are set. |
| `GITHUB_OAUTH_CLIENT_ID` | The GitHub App's OAuth client ID, for "Login with GitHub". |
| `GITHUB_OAUTH_CLIENT_SECRET` | The App's OAuth client secret. |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth client ID. Both Google vars must be set, or Google login stays off. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth client secret. |
| `GOOGLE_OAUTH_REDIRECT_URL` | Optional. Explicit callback; defaults to `${origin}/auth/google/callback`. |
| `AUTH_PASSWORD_ENABLED` | Set to `true` to offer email/password signup and login. |
| `AUTH_ALLOWED_EMAIL_DOMAINS` | Comma-separated domains allowed to self-sign-up without an invite (password/Google). Empty means invite-only. |
| `GITHUB_APP_ID` | Identifies the GitHub App used for repository operations. |
| `GITHUB_APP_PRIVATE_KEY` | PKCS#8 private key that signs App requests and mints installation tokens. |
| `GITHUB_WEBHOOK_SECRET` | Verifies inbound webhook payloads. |
| `GITHUB_APP_SLUG` | The App's URL slug, used to build installation links. |
| `GITHUB_API_BASE` | GitHub API base. Defaults to `https://api.github.com`; override for GitHub Enterprise. |
| `GITHUB_OAUTH_BASE` | OAuth host. Defaults to `https://github.com`; override for GitHub Enterprise. |
| `GITHUB_PRIVILEGED_APP_ID` | Optional second App that can create org repos. See [Programmatic repository creation](./github-app.md#programmatic-repository-creation-optional). |
| `GITHUB_PRIVILEGED_APP_PRIVATE_KEY` | PKCS#8 private key for the privileged App. Both vars must be set, or the tier stays off. |

New-user creation is invite-only unless an email domain is allowlisted: a person gets in by
redeeming an email invitation or by signing up with an address on `AUTH_ALLOWED_EMAIL_DOMAINS`. With
neither, signup is refused.

## LLM providers

Direct provider API keys (OpenAI, Anthropic, Qwen, DeepSeek, Moonshot) are no longer read from
environment variables. They are onboarded **in the UI**, scoped to an account, workspace, or user,
pooled, and stored encrypted under [`ENCRYPTION_KEY`](#credential-encryption). The same is true of
**vendor credentials**: a coding-plan subscription (Claude, GLM, or Codex, kept per-user) or a
poolable vendor credential (Kimi, DeepSeek), run through the Claude Code or Codex harness. None of
these needs a provider env var; they only need `ENCRYPTION_KEY` set. See
[Model Providers & Subscriptions](../guide/model-providers.md).

What stays in the environment is the Cloudflare Workers AI fallback, AWS Bedrock, and routing
defaults:

| Variable | Purpose |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` | Serve Cloudflare Workers AI over REST off Cloudflare (no provider key; optional `CLOUDFLARE_AI_GATEWAY`). On the Worker, the `AI` binding serves it instead. |
| `OPENAI_BASE_URL` / `QWEN_BASE_URL` / `DEEPSEEK_BASE_URL` / `MOONSHOT_BASE_URL` | Optional base-URL overrides for the OpenAI-compatible direct providers (the keys themselves come from the UI pool). |
| `BEDROCK_REGION` + AWS credentials + `BEDROCK_MODELS` | AWS Bedrock, via `@cat-factory/provider-bedrock`. |

With no Cloudflare provider registered and no keys connected, a model has nothing to resolve to.
Default routing is tunable with `AGENT_DEFAULT_PROVIDER`, `AGENT_DEFAULT_MODEL`,
`AGENT_DEFAULT_TEMPERATURE`, `AGENT_MAX_OUTPUT_TOKENS`, and per-kind overrides via `AGENT_MODELS`; a
workspace can override the model per agent kind at runtime (see
[Choosing models](../guide/running-pipelines.md#choosing-models)).

## Credential encryption

One shared master key encrypts every integration's per-workspace credentials at rest: connected
Jira sites, runner-pool API tokens, environment-provider auth, Slack bot tokens, and pooled or
personal model subscriptions. The cipher domain-separates per integration internally, so a single
key is safe across all of them.

| Variable | Purpose |
| --- | --- |
| `ENCRYPTION_KEY` | Base64 key, ≥ 32 bytes decoded (`openssl rand -base64 32`). Required. The always-on Jira task-source integration fails to boot with a loud config error until it is set. |

::: warning One key, not four
Earlier builds used separate `DOCUMENTS_ENCRYPTION_KEY`, `TASKS_ENCRYPTION_KEY`,
`ENVIRONMENTS_ENCRYPTION_KEY`, and `RUNNERS_ENCRYPTION_KEY` values. These are gone. Provision a
single `ENCRYPTION_KEY` instead. Use the same key value across restarts and replicas, or existing
encrypted credentials become unreadable.
:::

## Infrastructure

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (Node.js deployment only). |
| Container image registry + pull credentials | Source of the executor-harness image. |
| `RUNNERS_ENABLED` | Set to `true` to turn on self-hosted runner pools (also requires `ENCRYPTION_KEY`). |
| Runner pool manifest | Declarative description of your self-hosted execution pool (see [Manifests](../reference/manifests.md)). |

## Node container execution

On the Node.js runtime, repo-operating agent kinds run on a [runner pool](./runner-pools.md), and
that path only activates once the deployment can mint per-run GitHub tokens and dispatch jobs
securely. All of the following must be set; otherwise inline kinds still work and container kinds
fail loudly instead of faking success:

| Variable | Purpose |
| --- | --- |
| `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` | Mint short-lived per-run GitHub installation tokens. |
| `PUBLIC_URL` | The backend's externally reachable URL (runners call back to it). |
| `AUTH_SESSION_SECRET` | Session secret (also required for real auth). |
| `ENCRYPTION_KEY` | Encrypts the runner-pool credentials stored at rest (the shared master key above). |

## Service configuration

| Variable | Purpose |
| --- | --- |
| `NUXT_PUBLIC_API_BASE` | Frontend → backend URL. Build-time for the SPA. |
| Workspace / account identity providers | Identity resolution settings. |
| Organization membership resolution | Determines workspace access. |

## Web search

Web search is opt-in and no-op until configured. It comes in two independent surfaces, and no
provider key ever enters the per-run container: container agents reach search through a backend
proxy.

| Variable | Purpose |
| --- | --- |
| `WEB_SEARCH_BRAVE_API_KEY` | Brave Search key for the backend proxy (recommended). |
| `WEB_SEARCH_SEARXNG_URL` (+ `WEB_SEARCH_SEARXNG_API_KEY`) | Reverse-proxy to a self-hosted SearXNG instead. |
| `INLINE_WEB_SEARCH_ENABLED` | Enables provider-hosted search for the inline `architect`/`researcher` agents. |
| `INLINE_WEB_SEARCH_KINDS` / `INLINE_WEB_SEARCH_MAX_USES` | Tune the allow-list and per-run cap. |

Inline search only takes effect on providers with a hosted search tool (Anthropic / OpenAI).

## Document & task sources

Document sources (Confluence, Notion, GitHub repo docs) and the Jira task source are **always on**:
they ship enabled and each workspace connects its own site through the UI, with credentials stored
encrypted under `ENCRYPTION_KEY`. There is no per-integration enable flag anymore. The integrations
fail loudly at boot if `ENCRYPTION_KEY` is missing rather than silently returning errors later.

| Variable | Purpose |
| --- | --- |
| `DOCUMENT_SOURCES` | Comma-separated allow-list of document sources to expose. Defaults to all (`confluence,notion,github`). |
| `DOCUMENT_PLANNER` | How imported documents are turned into context: `llm` (default) or `headings` (deterministic split). |
| `TASK_SOURCES` | Comma-separated task sources to enable. Node supports `jira` today. GitHub Issues rides the per-tenant GitHub App installation and needs no env. |

The tech-debt [recurring pipeline](../guide/recurring-pipelines.md) files its ticket through the
workspace's chosen tracker (see [Issue & Document Sources](../guide/issue-sources.md)).

## Observability

Every model call is metered for the spend gauge and the in-app observability dashboard. Two
optional settings tune what is recorded and where it is sent. Both are covered in depth in
[Observability](./observability.md).

| Variable | Purpose |
| --- | --- |
| `LLM_RECORD_PROMPTS` | Set to `false` to drop prompt text from recorded metrics (tokens, timing, finish reason, and counts are still kept). Defaults to recording prompts. |
| `LANGFUSE_ENABLED` | Set to `true` to stream every LLM call to Langfuse as a trace. Off by default. |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | Langfuse project keys (`pk-lf-…` / `sk-lf-…`). Both required when enabled. |
| `LANGFUSE_BASE_URL` | Langfuse host. Optional; defaults to `https://cloud.langfuse.com`. |

Langfuse honours `LLM_RECORD_PROMPTS`: with prompts off, the traces carry only numeric telemetry.

## Notifications (Slack)

Board notifications (merge reviews, pipeline completions, CI failures, requirement reviews) land in
the in-app inbox by default. Slack is an optional extra transport. It is opt-in, each workspace
connects its own Slack from the UI, and the bot token is encrypted under `ENCRYPTION_KEY`. Full
setup is in [Notifications](./notifications.md).

| Variable | Purpose |
| --- | --- |
| `SLACK_ENABLED` | Set to `true` to make Slack available. Requires `ENCRYPTION_KEY`. |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | Optional. Enable the OAuth "Add to Slack" flow; without them, operators paste a bot token by hand. |
| `SLACK_REDIRECT_URL` | Optional OAuth callback, e.g. `https://your-host/slack/oauth/callback`. |

## Email (invitations)

Email carries [invitation](../guide/team-and-access.md#inviting-teammates) links. It is opt-in at the
deployment level; the provider, API key, and From address are then onboarded **per account in the
UI** and stored sealed in the database (like the Slack bot token), not read from env. Adapters exist
for SendGrid and Resend. With email off or no sender connected, invitations still work: the accept
link is returned for manual sharing.

| Variable | Purpose |
| --- | --- |
| `EMAIL_ENABLED` | Set to `true` to make the email feature available. Requires an encryption key. |
| `APP_BASE_URL` | The SPA origin that invitation accept links point at. Falls back to `AUTH_SUCCESS_REDIRECT_URL`. |
| `EMAIL_ENCRYPTION_KEY` | Optional. Seals the per-account email API key at rest; falls back to the shared `ENCRYPTION_KEY`. |

## Feature toggles

Optional integrations enabled by their own flag:

| Variable | Purpose |
| --- | --- |
| `ENVIRONMENTS_ENABLED` | Set to `true` for ephemeral preview environments (also requires `ENCRYPTION_KEY`). See [Environments](./environments.md). |
| `PROMPT_LIBRARY_ENABLED` | Set to `true` to source [prompt fragments](../guide/prompt-fragments.md) from a Git library repository. |

::: warning Treat secrets as secrets
Provider keys, subscription tokens, the GitHub App private key, `ENCRYPTION_KEY`, the Langfuse
secret key, and the webhook secret are all sensitive. On Cloudflare, set them as **secret
bindings** (`wrangler secret put …`); on Node.js and local, keep them in your `.env` / secret
manager and never commit them.
:::

---

Scaling execution? Continue to [Runner Pools](./runner-pools.md) and
[Ephemeral Environments](./environments.md).
