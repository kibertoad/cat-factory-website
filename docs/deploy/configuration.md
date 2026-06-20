# Configuration

This page is the reference for every environment variable and toggle you'll set when deploying
Cat-Factory. Secrets are grouped by concern: authentication, model providers, infrastructure,
service wiring, and feature toggles.

## Authentication

GitHub is the identity provider and the source of repository access.

| Variable | Purpose |
| --- | --- |
| `GITHUB_CLIENT_ID` | OAuth provider client ID. |
| `GITHUB_CLIENT_SECRET` | OAuth provider client secret. |
| GitHub App **ID** | Identifies the GitHub App used for repository operations. |
| GitHub App **private key** | Signs GitHub App requests. |
| GitHub App **webhook secret** | Verifies inbound webhook payloads. |

## LLM providers

Supply credentials for the providers you want to use. With none set, Cat-Factory falls back to the
free Cloudflare Workers AI tier.

| Variable | Provider |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude API access. |
| `OPENAI_API_KEY` | OpenAI model access. |
| `QWEN_API_KEY` / `DEEPSEEK_API_KEY` / `MOONSHOT_API_KEY` | OpenAI-compatible vendors. |
| `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` | Cloudflare Workers AI over REST (default cost-free tier; optional `CLOUDFLARE_AI_GATEWAY`). |
| `BEDROCK_REGION` + AWS credentials + `BEDROCK_MODELS` | AWS Bedrock, via `@cat-factory/provider-bedrock`. |

Unconfigured providers simply aren't registered. Default routing is tunable with
`AGENT_DEFAULT_PROVIDER`, `AGENT_DEFAULT_MODEL`, `AGENT_DEFAULT_TEMPERATURE`, and
`AGENT_MAX_OUTPUT_TOKENS`; a workspace can override the model per agent kind at runtime (see
[Choosing models](../guide/running-pipelines.md#choosing-models)).

## Infrastructure

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (Node.js deployment only). |
| Container image registry + pull credentials | Source of the executor-harness image. |
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
| `RUNNERS_ENCRYPTION_KEY` | Encrypts the runner-pool credentials stored at rest. |

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

## Issue tracker & task sources

The tech-debt [recurring pipeline](../guide/recurring-pipelines.md) files a ticket through the
workspace's chosen tracker. GitHub Issues rides the per-tenant GitHub App installation (no env).
Jira is opt-in and stores each tenant's own credentials encrypted at rest:

| Variable | Purpose |
| --- | --- |
| `TASKS_ENABLED` | Turns on the task-source integration. |
| `TASKS_ENCRYPTION_KEY` | Base64 key (≥ 32 bytes) encrypting tenant tracker credentials. Fail-closed: no key, no integration. |
| `TASK_SOURCES` | Comma-separated sources to enable (Node supports `jira` today). |

## Feature toggles

Enable optional integrations and providers:

- Document source integrations: Confluence and Notion APIs, plus GitHub repo docs (see [Issue & Document Sources](../guide/issue-sources.md)).
- Environment provider manifest, for ephemeral preview environments (see [Environments](./environments.md)).
- Prompt-fragment library source repository, to version [prompt fragments](../guide/prompt-fragments.md) in Git.

::: warning Treat all of these as secrets
Provider keys, the GitHub App private key, and the webhook secret are sensitive. On Cloudflare,
set them as **secret bindings** (`wrangler secret put …`); on Node.js, keep them in your
`.env`/secret manager and never commit them.
:::

---

Scaling execution? Continue to [Runner Pools](./runner-pools.md) and
[Ephemeral Environments](./environments.md).
