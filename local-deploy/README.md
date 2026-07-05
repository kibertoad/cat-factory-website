# local-deploy — run cat-factory locally to capture docs screenshots

This directory is a purpose-built, throwaway deployment of **cat-factory** used to produce the UI
screenshots that appear across this documentation site. It boots the real product in **no-auth dev
mode** (auth gate open, no GitHub/model credentials) — enough to render every screen the docs show —
and drives it with Playwright to capture images into `docs/.vuepress/public/images/app/`.

It is **not** a template for a real install. For that, see cat-factory's own `deploy/local` and the
[Run Locally](../docs/deploy/local.md) guide.

## What's here

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | Postgres for this deployment, on host port **5433** and its own volume, so it never clashes with a real local checkout. |
| `.env.example` | The committed no-auth dev config. `scripts/start.mjs` copies it to `.env` on first run and fills in the crypto secrets. |
| `scripts/start.mjs` | Boots Postgres + the cat-factory backend + the Nuxt frontend under one process and streams their logs. |
| `scripts/stop.mjs` | Stops (and optionally wipes) the Postgres container. |
| `scripts/screenshots.mjs` | Signs into the running board and captures the documentation screenshots. |

## Prerequisites

- **Node.js 24+** and **pnpm**.
- **Docker** running (only Postgres runs in a container here; the backend and frontend are host
  processes).
- A local **cat-factory** checkout — it holds the `@cat-factory/*` workspace packages this deployment
  consumes. It defaults to `../cat-factory` next to this repo; override with `CAT_FACTORY_DIR`.

## Boot it

```bash
# from this directory
node scripts/start.mjs                       # cat-factory at ../cat-factory
# or point at a checkout elsewhere:
CAT_FACTORY_DIR=/path/to/cat-factory node scripts/start.mjs
```

On first run it writes `.env` (with generated `AUTH_SESSION_SECRET` + `ENCRYPTION_KEY`), starts
Postgres, then boots the backend and frontend. When it prints `Board UI: http://localhost:3000`,
open that URL — the auth gate is dev-open, so sign up a throwaway email/password account and you are
on the board. `Ctrl+C` stops the backend and frontend; Postgres keeps running (`node scripts/stop.mjs`
to stop it, add `--volumes` to wipe the data).

Flags: `--no-frontend` (API only), `--build` (rebuild the cat-factory workspace first — needed when
its `@cat-factory/*` dist is stale and the SPA fails to boot with "does not provide an export named …").

### Running alongside another local checkout

The defaults are the cat-factory standards (backend `:8787`, frontend `:3000`, Postgres `:5433`). To
run this next to another local deployment already on those ports, move them:

```bash
# set PORT (backend) in .env, then:
FRONTEND_PORT=3001 CAT_FACTORY_DIR=/path/to/cat-factory node scripts/start.mjs
```

The launcher reads the backend port from `.env` and passes the frontend the matching
`NUXT_PUBLIC_API_BASE`, so the SPA always calls the right backend.

## Capture screenshots

With the deployment up, in a second terminal:

```bash
pnpm install --ignore-workspace      # installs Playwright here (kept out of the docs workspace)
pnpm run screenshots:install         # download the Chromium build
node scripts/screenshots.mjs         # -> docs/.vuepress/public/images/app/
```

It signs in (creating `docs@example.com` on first run), then captures the board, the sign-in screen,
the model-provider setup, model configuration, bootstrap-repo, integrations, infrastructure, workspace
settings, and the command palette. Override the frontend URL with `BASE` and the output dir with
`SHOT_DIR`.

The end-to-end flow (boot → capture → embed in the docs) is automated by the
[`launch-local-deployment`](../.claude/skills/launch-local-deployment/SKILL.md) skill.
