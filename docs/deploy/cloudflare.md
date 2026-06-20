# Deploy to Cloudflare

Cloudflare is the reference deployment for Cat-Factory. The backend runs as a Worker with D1,
Durable Objects, and Workflows. The frontend is a Nuxt SPA on Cloudflare Pages, and per-run coding
work executes in Cloudflare Containers.

## Prerequisites

- A Cloudflare account with Worker and D1 database access.
- A GitHub App configured for authentication and repository operations.
- LLM provider API keys, or use the free Cloudflare Workers AI default.
- `wrangler` and `pnpm` installed locally.

## 1. Deploy the backend

From the backend deployment project, apply database migrations and deploy the Worker:

```bash
cd deploy/backend

# Review and apply D1 migrations
wrangler d1 migrations list cat_factory --remote
wrangler d1 migrations apply cat_factory --remote

# Deploy the Worker
pnpm deploy
```

## 2. Deploy the frontend

Build the Nuxt SPA pointing at your backend URL, then publish it to Pages:

```bash
cd deploy/frontend

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

Prefer your own servers? See [Deploy to Node.js](./nodejs.md). Then lock down
[Configuration](./configuration.md).
