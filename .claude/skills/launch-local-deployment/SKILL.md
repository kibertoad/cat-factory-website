---
name: launch-local-deployment
description: Boot cat-factory locally in no-auth dev mode, drive the running UI with Playwright to capture fresh screenshots, and embed them into the documentation pages that benefit. Use when asked to launch/spin up the app locally, refresh the product screenshots, or add UI images to the docs.
---

# Launch the local deployment and capture docs screenshots

This repo (`cat-factory-website`) is the documentation site. It carries a purpose-built, throwaway
local deployment of the **cat-factory** product under [`local-deploy/`](../../../local-deploy) that
boots the real UI in **no-auth dev mode**, so screenshots for the docs can be captured from a live
instance. This skill runs that end to end: boot → capture → embed → build.

## Repositories and paths

- Docs (this repo): `C:\sources\cat-factory-website`. Deployment tooling in `local-deploy/`, docs in
  `docs/`, captured images in `docs/.vuepress/public/images/app/`.
- Code (read + build, never edit its source): the local **cat-factory** checkout, default
  `C:\sources\cat-factory`. It holds the `@cat-factory/*` workspace packages the deployment consumes.
  If it's elsewhere, pass `CAT_FACTORY_DIR`. If missing, ask the user for the path.

## Prerequisites

- Node 24+, pnpm, and **Docker running** (only Postgres runs in a container; backend and frontend are
  host processes).
- A Playwright browser. Two ways to drive the UI, in order of preference:
  1. **Playwright MCP** — already configured in `.mcp.json` (`@playwright/mcp`). Its tools
     (`browser_navigate`, `browser_click`, `browser_snapshot`, `browser_take_screenshot`, …) let you
     see the page and click intelligently. It only becomes available after the MCP server is approved
     / the session reconnects; if the tools aren't loaded, use the script path below.
  2. **The capture script** — `local-deploy/scripts/screenshots.mjs` drives Playwright directly and
     needs no MCP. Install it once: `cd local-deploy && pnpm install --ignore-workspace && pnpm run screenshots:install`.

## Steps

1. **Boot the deployment (background).** From `local-deploy/`:
   ```bash
   CAT_FACTORY_DIR=C:/sources/cat-factory node scripts/start.mjs
   ```
   Run it in the background and tail its log. Wait for the readiness banner:
   `[start] Board UI: http://localhost:3000`. First run writes `.env` (generating the two crypto
   secrets) and starts Postgres, the backend (`:8787`), and the Nuxt frontend (`:3000`).

   - If another local cat-factory is already on `:8787`/`:3000` (check `netstat`), isolate this one:
     set `PORT=8788` in `local-deploy/.env` and boot with `FRONTEND_PORT=3001`. The launcher passes
     the frontend the matching `NUXT_PUBLIC_API_BASE`. **Do not kill the user's other processes** —
     only the ports this deployment owns.

2. **Verify it's healthy.**
   ```bash
   curl -s http://127.0.0.1:8787/health          # {"status":"ok"}  (use your backend port)
   curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/   # 200
   ```

3. **Capture.** Either drive the Playwright MCP against the board URL, or run the script:
   ```bash
   cd local-deploy && node scripts/screenshots.mjs           # -> docs/.vuepress/public/images/app/
   # BASE=http://localhost:3001 if you moved the frontend port
   ```
   It signs in (creating `docs@example.com` on first run — the account persists in Postgres, so later
   runs log in), then captures a fixed set (see the map below). Review each image before using it:
   drop any that just show the board because the target needed a repo/model first.

4. **Embed into the docs.** Reference images as `/images/app/<name>.png` (VuePress `base` is `/`, and
   `public/` is served from the root). Give each a descriptive alt and a one-line lead-in that matches
   the surrounding doc's voice (present tense, no changelog framing — same rules as `sync-docs`). Place
   an image next to the prose it illustrates, not in a gallery.

5. **Build to verify.** `pnpm docs:build` from the repo root. It should render all pages with exit 0.
   (Pre-existing rolldown/vueuse "pure annotation" warnings are unrelated noise.)

6. **Stop / clean up when done.** `Ctrl+C` (or kill the background task) stops backend + frontend.
   `node local-deploy/scripts/stop.mjs` stops Postgres (`--volumes` wipes the DB). If you opened a PR,
   follow this repo's conventions (branch, `docs:` commit, `gh pr create`).

## Image → doc-page map (current placements)

| Screenshot | Screen | Doc page |
| --- | --- | --- |
| `sign-in` | Local-mode login screen | `docs/deploy/local.md` (Signing in) |
| `board-empty` | Empty board + navbar + setup banners | `docs/guide/quick-start.md` |
| `command-palette` | ⌘K command bar | `docs/guide/designing-your-board.md` |
| `workspace-settings` | Workspace settings tabs | `docs/guide/designing-your-board.md` |
| `model-provider-setup` | "Set up an AI model provider" modal | `docs/guide/model-providers.md` |
| `model-configuration` | Model preset list | `docs/guide/model-providers.md` |
| `bootstrap-repo` | Bootstrap a repository dialog | `docs/guide/repositories.md` |
| `integrations` | Integrations panel | `docs/deploy/configuration.md` |
| `infrastructure` | Agent containers / warm pool | `docs/deploy/local.md` |

## Gotchas (all handled by the scripts — know them if something breaks)

- **Stale workspace dist.** If the SPA 500s with *"does not provide an export named …"*, the
  cat-factory `@cat-factory/*` packages need rebuilding: `pnpm build:all` in the checkout (or boot with
  `node scripts/start.mjs --build`). `pnpm build` alone matched no packages here — use `build:all`.
- **DB host.** Use `127.0.0.1`, not `localhost`, in `DATABASE_URL`: on Windows `localhost` can resolve
  to IPv6 first and stall the Postgres connection.
- **CORS.** The API default-denies cross-origin unless `ENVIRONMENT` is a dev value. `.env` sets
  `ENVIRONMENT=local`, which reflects any origin (so the frontend works on whatever port).
- **Windows spawn.** pnpm/npx are `.cmd` shims; Node can't `spawn` them without `shell: true`.
- **Nuxt binds IPv6.** The dev server listens on `::1`, Postgres on `127.0.0.1` — readiness checks try
  both loopback families.
- **Auth.** No PAT is set, so there's no one-click PAT sign-in; use email/password signup (open signup
  is on). After the account exists, log in instead of signing up.
- **Selectors.** Click sidebar entries by their exact button role name, not `getByText` — the uppercase
  section headers ("INTEGRATIONS", "INFRASTRUCTURE") otherwise match first. Force-click past transient
  toast overlays.
