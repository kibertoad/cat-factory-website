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
| `AUTH_ALLOWED_EMAIL_DOMAINS` | Comma-separated domains allowed to self-sign-up without an invite (password/Google), and allowed to sign in with a PAT. Empty means invite-only. |
| `AUTH_ALLOWED_LOGINS` | Comma-separated GitHub/GitLab logins allowed to sign in with a PAT. |
| `AUTH_ALLOWED_ORGS` | Comma-separated orgs whose members may sign in with a PAT. |
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

A remote (hosted) Node deployment has **no anonymous tier**: it fails to boot unless at least one
provider is configured (GitHub OAuth, Google OAuth, or `AUTH_PASSWORD_ENABLED` with a strong
`AUTH_SESSION_SECRET`). Users can also **sign in with their own GitHub or GitLab PAT**: they paste the
token, the server resolves it to their account, and the same `AUTH_ALLOWED_LOGINS` /
`AUTH_ALLOWED_ORGS` / `AUTH_ALLOWED_EMAIL_DOMAINS` allowlists decide who gets in (it fails closed when
all three are empty). [Local mode](./local.md#signing-in) is the exception: it signs in with the
deployment's configured PAT or a local password. GitLab PAT sign-in is offered only when the
deployment has a GitLab connection configured (`GITLAB_TOKEN`, below); GitLab group membership then
counts toward `AUTH_ALLOWED_ORGS`, matching GitHub.

## GitLab (source control)

GitLab is a first-class source-control backend on every runtime, not just local mode. It is opt-in
and off until you set a token. With it configured, a GitLab repo clones, pushes, gates on real CI, and
merges through a real merge request, and users can sign in with a GitLab PAT. See
[Repositories → GitLab](../guide/repositories.md#gitlab).

| Variable | Purpose |
| --- | --- |
| `GITLAB_TOKEN` | Enables GitLab on Cloudflare and Node (single-token model, one connection per deployment). In [local mode](./local.md) the equivalent is `GITLAB_PAT`. Needs the `api` scope. |
| `GITLAB_API_BASE` | Optional. GitLab REST v4 base for a self-managed instance, e.g. `https://gitlab.example.com/api/v4`. Defaults to the public GitLab API. |
| `GITLAB_WEBHOOK_SECRET` | Optional. Verifies inbound GitLab webhook payloads (merge request, issue, push, pipeline). |
| `GITLAB_CONNECTION_ID` | Optional. Logical id for the GitLab connection. Defaults to `gitlab`. |

## LLM providers

Direct provider API keys (OpenAI, Anthropic, Qwen, DeepSeek, Moonshot, OpenRouter, LiteLLM) are
onboarded **in the UI**, scoped to an account, workspace, or user, pooled, and stored encrypted
under [`ENCRYPTION_KEY`](#credential-encryption).
The same is true of **vendor credentials**: a coding-plan subscription (Claude, GLM, or Codex, kept
per-user) or a poolable vendor credential (Kimi, DeepSeek), run through the Claude Code or Codex
harness. None of these needs a provider env var; they only need `ENCRYPTION_KEY` set. **Local
runners** (Ollama, LM Studio, …) are likewise pure per-user UI configuration with no deployment env
var. See [Model Providers & Subscriptions](../guide/model-providers.md).

What stays in the environment is the Cloudflare Workers AI fallback, AWS Bedrock, the
aggregator-gateway base URLs, and routing defaults:

| Variable | Purpose |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` | Serve Cloudflare Workers AI over REST off Cloudflare (no provider key; optional `CLOUDFLARE_AI_GATEWAY`). On the Worker, the `AI` binding serves it instead. |
| `OPENAI_BASE_URL` / `QWEN_BASE_URL` / `DEEPSEEK_BASE_URL` / `MOONSHOT_BASE_URL` | Optional base-URL overrides for the OpenAI-compatible direct providers (the keys themselves come from the UI pool). |
| `OPENROUTER_BASE_URL` | Optional. Overrides the OpenRouter gateway; defaults to the public gateway (`https://openrouter.ai/api/v1`), so OpenRouter works with just a connected key. |
| `LITELLM_BASE_URL` | **Required to enable LiteLLM.** Your self-hosted LiteLLM gateway URL. Until it is set, a connected LiteLLM key yields no selectable model. |
| `BEDROCK_REGION` + AWS credentials + `BEDROCK_MODELS` | AWS Bedrock, via `@cat-factory/provider-bedrock`. `BEDROCK_MODELS=""` (set but blank) means "allow all". |

With no Cloudflare provider registered and no keys connected, a model has nothing to resolve to (the
picker shows nothing selectable). Default routing is tunable with `AGENT_DEFAULT_PROVIDER`,
`AGENT_DEFAULT_MODEL`, `AGENT_DEFAULT_TEMPERATURE`, `AGENT_MAX_OUTPUT_TOKENS`, and per-kind overrides
via `AGENT_MODELS`; a workspace can override the model per agent kind at runtime (see
[Choosing models](../guide/running-pipelines.md#choosing-models)).

## Credential encryption

One shared master key encrypts every integration's per-workspace credentials at rest: connected
Jira sites, runner-pool API tokens, environment-provider auth, Slack bot tokens, and pooled or
personal model subscriptions. The cipher domain-separates per integration internally, so a single
key is safe across all of them.

| Variable | Purpose |
| --- | --- |
| `ENCRYPTION_KEY` | Base64 key, ≥ 32 bytes decoded (`openssl rand -base64 32`). Required. The always-on Jira task-source integration fails to boot with a loud config error until it is set. |

::: warning Use one stable key
A single `ENCRYPTION_KEY` backs all of these integrations. Use the same key value across restarts
and replicas, or encrypted credentials become unreadable. If a credential can't be decrypted (the key
was rotated or regenerated), the error names the key and the affected credential and tells you to
restore the original key or re-enter that credential; one broken credential is isolated, so unrelated
providers keep working rather than the whole config failing.
:::

## Infrastructure

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (Node.js deployment only). |
| Container image registry + pull credentials | Source of the executor-harness image. |
| `HARNESS_SHARED_SECRET` | Optional inbound-auth secret for the executor harness. When set, the backend injects it into each per-run container's env and sends it as the `x-harness-secret` header, so the harness rejects any call that doesn't carry it. Leave it unset and the harness stays open, relying on internal-only addressing. A self-hosted runner pool configures its own secret pool-side. |
| `RUNNERS_ENABLED` | Set to `true` to turn on self-hosted runner pools (also requires `ENCRYPTION_KEY`). |
| Runner pool manifest | Declarative description of your self-hosted execution pool (see [Manifests](../reference/manifests.md)). |

When a workspace is missing infrastructure a run needs, the app says so up front rather than failing
mid-run. It raises a per-area setup banner, with a deep link to the right config screen, when
ephemeral environments, the agent executor (self-hosted runner pool, remote Node), or binary
[content storage](#content-storage-binary-artifacts) is undefined. Each banner can be dismissed for
the session or permanently per user.

## Content storage (binary artifacts)

The Tester's screenshots for the [Visual Confirmation](../guide/running-pipelines.md#visual-confirmation)
gate are kept in a binary-artifact store. This is configured **per account in the UI** (Account →
Deployment settings), not through environment variables, and each account picks its own backend:

| Backend | Runtimes | Notes |
| --- | --- | --- |
| `fs` | Node, local | On-disk under a base path (default `.file-storage`, git-ignored). The default on **local**. Local-disk only, so it is unsafe for a scaled or ephemeral Node deployment where instances don't share a disk. |
| `s3` | Node, local | An S3 bucket. Enter the bucket and keys (sealed at rest) in the UI; the keys can fall back to ambient AWS credentials. |
| `r2` | Cloudflare | The Worker's R2 binding. The default and only backend on Cloudflare (the AWS SDK is kept out of the Worker bundle; for S3, run Node/local). |

The default is `fs` on local, `r2` on Cloudflare, and **off** on Node until an account configures one.
A pipeline that includes an agent needing binary storage (the **UI Tester**, which uploads its
screenshots) is refused at start when the account has no store configured, with a message that names
the fix, rather than failing mid-run. Pipelines that don't use such an agent are unaffected. Switching
an account's backend orphans artifacts stored under the previous one.

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

Document sources (Confluence, Notion, GitHub repo docs, the Figma and Zeplin design-context sources,
and Linear Docs) and the Jira task source are **always on**: they ship enabled and each workspace
connects its own site through the UI, with credentials stored encrypted under `ENCRYPTION_KEY`. There
is no per-integration enable flag. The integrations fail loudly at boot if `ENCRYPTION_KEY` is missing
rather than silently returning errors later.

| Variable | Purpose |
| --- | --- |
| `DOCUMENT_SOURCES` | Comma-separated allow-list of document sources to expose. Defaults to `confluence,notion,github,figma,zeplin,linear` (every known source). `figma` and `zeplin` are design-context sources, each connected per workspace with a personal access token. |
| `DOCUMENT_PLANNER` | How imported documents are turned into context: `llm` (default) or `headings` (deterministic split). |

Task sources (Jira, GitHub Issues, and Linear) are configured per workspace. Each
workspace turns its sources on or off in the UI (**Workspace settings → Issue tracker**); they work
on every runtime, GitHub Issues rides the per-tenant GitHub App installation (or, in local mode, the
PAT) with no env, and Linear connects per workspace via OAuth or a personal API key. See
[Issue & Document Sources](../guide/issue-sources.md). The tech-debt
[recurring pipeline](../guide/recurring-pipelines.md) files its ticket through the workspace's chosen
filing tracker.

## Observability

Every model call is metered for the spend gauge and the in-app observability dashboard. Two
optional settings tune what is recorded and where it is sent. Both are covered in depth in
[Observability](./observability.md).

| Variable | Purpose |
| --- | --- |
| `LLM_RECORD_PROMPTS` | Set to `false` to drop prompt text from recorded metrics and to skip full agent-context capture (tokens, timing, finish reason, and counts are still kept). Defaults to recording prompts. |
| `LANGFUSE_ENABLED` | Set to `true` to stream every LLM call to Langfuse as a trace. Off by default. |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | Langfuse project keys (`pk-lf-…` / `sk-lf-…`). Both required when enabled. |
| `LANGFUSE_BASE_URL` | Langfuse host. Optional; defaults to `https://cloud.langfuse.com`. |

Langfuse honours `LLM_RECORD_PROMPTS`: with prompts off, the traces carry only numeric telemetry.

### Telemetry store

Call metrics and full agent-context snapshots live in an isolated telemetry store, separate from the
main application database. On Cloudflare it is a dedicated D1 database; on Node and local it is a
`telemetry` schema inside the existing `DATABASE_URL` database. A retention cron prunes it on a
schedule. See [Observability → The telemetry store](./observability.md#the-telemetry-store).

| Variable | Purpose |
| --- | --- |
| `TELEMETRY_DB` | Cloudflare only. D1 binding for the telemetry store. Required on the Worker: the build path and the retention cron fail fast if it is unbound. On Node and local the store is a `telemetry` schema in `DATABASE_URL`, with no separate binding. |
| `PROVISIONING_DB` | Cloudflare only. Optional D1 binding for the ephemeral-environment and container-provisioning event log. The log is off when unbound. On Node and local it is a `provisioning` schema in `DATABASE_URL`. |
| `LLM_CALL_METRICS_RETENTION_DAYS` | How long call metrics and agent-context snapshots are kept before the retention cron prunes them. Defaults to 3 days. |
| `PROVISIONING_LOG_RETENTION_DAYS` | How long provisioning events are kept. Defaults to 14 days. |

The **post-release-health** gate and **Agent-On-Call** watch production through a pluggable
observability provider (Datadog today) after a merge. They are opt-in and covered in
[Observability → Post-release health](./observability.md#post-release-health-and-agent-on-call).

| Variable | Purpose |
| --- | --- |
| `OBSERVABILITY_ENABLED` | Set to `true` to enable the post-release-health gate and Agent-On-Call (also requires `ENCRYPTION_KEY`). Off by default; the gate is a pass-through when unset. The per-workspace provider site and keys are entered in the UI and sealed at rest. |
| `PAGERDUTY_API_TOKEN` + `PAGERDUTY_FROM_EMAIL` | Optional. Post the on-call investigation as an annotation onto an open PagerDuty incident. |
| `INCIDENTIO_API_KEY` | Optional. The same enrichment for incident.io. |

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

Email carries [invitation](../guide/team-and-access.md#inviting-teammates) links. There is no
separate enable flag: email is available whenever an encryption key is set (the per-account API key
is sealed with it). The provider, API key, and From address are then onboarded **per account in the
UI** and stored sealed in the database (like the Slack bot token). Adapters exist for SendGrid and
Resend. With no sender connected, invitations still work: the accept link is returned for manual
sharing.

| Variable | Purpose |
| --- | --- |
| `APP_BASE_URL` | The SPA origin that invitation accept links point at. Falls back to `AUTH_SUCCESS_REDIRECT_URL`. |
| `EMAIL_ENCRYPTION_KEY` | Optional. Seals the per-account email API key at rest; falls back to the shared `ENCRYPTION_KEY`. |

## Feature toggles

Optional integrations enabled by their own flag:

| Variable | Purpose |
| --- | --- |
| `ENVIRONMENTS_ENABLED` | Set to `true` for ephemeral preview environments (also requires `ENCRYPTION_KEY`). See [Environments](./environments.md). |
| `PROMPT_LIBRARY_ENABLED` | Set to `true` to source [prompt fragments](../guide/prompt-fragments.md) from a Git library repository. |
| `CONSENSUS_ENABLED` | Set to `true` to enable [multi-model consensus](../guide/running-pipelines.md#multi-model-consensus) on eligible steps. Off (unset) leaves the standard single-actor behaviour; the `task-estimator` step works either way. |
| `OBSERVABILITY_ENABLED` | Set to `true` for the [post-release-health gate and Agent-On-Call](./observability.md#post-release-health-and-agent-on-call) (also requires `ENCRYPTION_KEY`). |
| `SANDBOX_DB` | Cloudflare only. Optional D1 binding that turns on the [Sandbox](../guide/sandbox.md) for prompt and model testing. The Sandbox is off until it is bound. On Node and local it is a `sandbox` schema in `DATABASE_URL`. |

::: warning Treat secrets as secrets
Provider keys, subscription tokens, the GitHub App private key, `ENCRYPTION_KEY`, the Langfuse
secret key, `HARNESS_SHARED_SECRET`, and the webhook secret are all sensitive. On Cloudflare, set them as **secret
bindings** (`wrangler secret put …`); on Node.js and local, keep them in your `.env` / secret
manager and never commit them.
:::

---

Scaling execution? Continue to [Runner Pools](./runner-pools.md) and
[Ephemeral Environments](./environments.md).
