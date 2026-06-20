# Configuration

This page is the reference for every environment variable and toggle you'll set when deploying
Cat-Factory. Group your secrets by concern: authentication, model providers, infrastructure,
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
free **Cloudflare Workers AI** tier.

| Variable | Provider |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude API access. |
| `OPENAI_API_KEY` | OpenAI model access. |
| AWS Bedrock credentials | Optional, via `@cat-factory/provider-bedrock`. |
| Cloudflare Workers AI token | Default cost-free tier. |

## Infrastructure

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (**Node.js deployment only**). |
| Container image registry + pull credentials | Source of the executor-harness image. |
| Runner pool manifest URL | Endpoint describing a self-hosted execution pool. |

## Service configuration

| Variable | Purpose |
| --- | --- |
| `NUXT_PUBLIC_API_BASE` | Frontend → backend URL. **Build-time** for the SPA. |
| Workspace / account identity providers | Identity resolution settings. |
| Organization membership resolution | Determines workspace access. |

## Feature toggles

Enable optional integrations and providers:

- **Document source integrations** — Confluence and Notion APIs (see [Issue Sources](../guide/issue-sources.md)).
- **Environment provider endpoints** — for ephemeral preview environments (see [Environments](./environments.md)).
- **Prompt-fragment library source repository** — to version [prompt fragments](../guide/prompt-fragments.md) in Git.

::: warning Treat all of these as secrets
Provider keys, the GitHub App private key, and the webhook secret are sensitive. On Cloudflare,
set them as **secret bindings** (`wrangler secret put …`); on Node.js, keep them in your
`.env`/secret manager and never commit them.
:::

---

Scaling execution? Continue to [Runner Pools](./runner-pools.md) and
[Ephemeral Environments](./environments.md).
