# Deploy to Cloudflare

Cloudflare is the reference runtime for Cat Factory. The backend runs as a Worker with D1,
Durable Objects, and Workflows. The frontend is a Nuxt SPA on Cloudflare Pages, and per-run coding
work executes in Cloudflare Containers.

## Your deployment project

Cat Factory ships as **reusable libraries on npm** (plus a runner image on GHCR), which you
assemble into a small deployment project of two thin packages that depend on the published
libraries and point at your own Cloudflare resources:

- **Backend**: re-exports `@cat-factory/worker` and ships your `wrangler.toml` (D1 binding,
  container image tag, secrets, custom domain).
- **Frontend**: a Nuxt app that `extends` `@cat-factory/app` and ships your Pages `wrangler.toml`.

To scaffold it, copy the `deploy/backend` and `deploy/frontend` example directories from the repo,
swap their `workspace:*` dependencies for the published npm versions, and point the config at your
resources. From here you can **mix in proprietary agent kinds, extra model providers, and seeded
pipelines**. See [Extending a deployment](../reference/architecture.md#extending-a-deployment).

::: tip Tracking upstream
A thin layer over the published packages keeps upgrades to a dependency bump rather than a merge
against a fork.
:::

## Prerequisites

- A Cloudflare account with Worker and D1 database access.
- Your [deployment project](#your-deployment-project) depending on the published `@cat-factory/*` packages.
- A GitHub App configured for authentication and repository operations (see [GitHub App](./github-app.md)).
- LLM provider API keys, or use the Cloudflare Workers AI default (no key required; billed under your Cloudflare account's Workers AI pricing).
- `wrangler` and `pnpm` installed locally.

## 1. Deploy the backend

From your backend deployment project, apply database migrations and deploy the Worker. The D1
migrations ship inside `@cat-factory/worker` (your `wrangler.toml`'s `migrations_dir` points at
`node_modules/@cat-factory/worker/migrations`), so they travel with the dependency:

```bash
# Review and apply D1 migrations (use your own database name)
wrangler d1 migrations list <your-d1-database> --remote
wrangler d1 migrations apply <your-d1-database> --remote

# Deploy the Worker (builds @cat-factory/worker, then wrangler deploy)
pnpm deploy
```

## 2. Deploy the frontend

Build the Nuxt SPA pointing at your backend URL, then publish it to Pages:

```bash
NUXT_PUBLIC_API_BASE=https://your-api-domain.com pnpm generate
pnpm deploy
```

::: tip NUXT_PUBLIC_API_BASE is build-time
The frontend is a static SPA, so the API base URL is baked in at build time. If your backend
URL changes, rebuild and redeploy the frontend.
:::

## Key configuration in `wrangler.toml`

The Worker is wired up through bindings in `wrangler.toml`:

| Binding | Purpose |
| --- | --- |
| **D1 database** | Schema and application data. |
| **Durable Objects** | Real-time, per-workspace event hubs. |
| **Container image** | The executor harness image for per-run coding work. |
| **Secrets** | Auth, GitHub App credentials, model provider keys, and optional web-search / tracker keys. |

For the full list of secrets and environment variables, including the opt-in
[web search](./configuration.md#web-search) and [tracker](./configuration.md#issue-tracker--task-sources)
settings, see [Configuration](./configuration.md).

## Production topology

```
┌─────────────────────────────────────┐
│ Nuxt SPA (Cloudflare Pages)         │
│ API base → your Worker domain       │
└──────────────┬──────────────────────┘
               │ REST + WebSocket
┌──────────────▼──────────────────────┐
│ Cloudflare Worker                   │
│ ├─ Hono controllers                 │
│ ├─ D1 database binding              │
│ ├─ Durable Objects (event hubs)     │
│ └─ Workflows (run orchestration)    │
└──────────────┬──────────────────────┘
               │ dispatch per-run jobs
┌──────────────▼──────────────────────┐
│ Cloudflare Containers (ephemeral)   │
│ executor-harness → coding agent     │
│ → Git operations & PR creation      │
└─────────────────────────────────────┘
```

## Why this setup

- Durable Workflows checkpoint each run step, so runs survive restarts and retry from failure.
- Durable Objects give each workspace an event hub that pushes live updates over WebSockets, so
  there's no polling.
- Containers isolate each run's coding work and Git operations.

---

To run on your own servers, see [Deploy to Node.js](./nodejs.md). Then lock down
[Configuration](./configuration.md).
