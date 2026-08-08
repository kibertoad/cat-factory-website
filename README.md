# cat-factory-website

Documentation site for [Cat Factory](https://github.com/kibertoad/cat-factory), the software
development agent management platform. Built with [VuePress 2](https://v2.vuepress.vuejs.org/) and
deployed to GitHub Pages.

🔗 **Live site:** https://kibertoad.github.io/cat-factory-website/

## Local development

Requires Node.js 22+.

```bash
# Install dependencies
npm install

# Start the dev server with hot reload (http://localhost:8080)
npm run docs:dev

# Build the static site into docs/.vuepress/dist
npm run docs:build
```

## The generated environment-variable reference

`docs/reference/environment-variables.md` is **generated** — do not hand-edit it. It is rendered
from `docs/environment-variables.md` in [kibertoad/cat-factory](https://github.com/kibertoad/cat-factory),
which stays there because a CI guard in that repo reads it, and which is only useful when it fires
in the pull request that adds the variable. Rendering rather than copying is what keeps the two
from drifting.

```bash
# Render the page (expects ../cat-factory, or set CAT_FACTORY_REPO)
npm run docs:env-vars

# Offline checks — this is what CI blocks pull requests on
npm run docs:env-vars:verify

# Compare against the code repo's current canonical list
npm run docs:env-vars:check
```

The two check modes are split by what they depend on, which is what decides where each can run:

- **`:verify`** reads only files committed here, so it is deterministic and blocks pull requests
  ([`ci.yml`](.github/workflows/ci.yml)). It catches a hand-edited page, a cross-link pointing at a
  page or heading that does not exist, and growth in the set of variables that
  `docs/deploy/configuration.md` documents but the canonical list omits. That set is recorded in
  [`scripts/env-vars-coverage-baseline.json`](./scripts/env-vars-coverage-baseline.json) and
  ratchets: new drift fails, and the baseline shrinks as upstream catches up.
- **`:check`** needs the code repo, so it can only be as current as that repo. The two move in
  paired pull requests and this site legitimately leads or lags upstream `main` while a pair is
  open, so it runs weekly ([`env-vars-drift.yml`](.github/workflows/env-vars-drift.yml)) instead of
  blocking a pull request it could fail for reasons that pull request cannot fix.

## Images

Screenshots live in `docs/.vuepress/public/images/` and are committed as optimized **WebP**.
After adding or re-capturing any screenshot (e.g. via the `launch-local-deployment` skill, which
emits PNGs), run:

```bash
npm run docs:images
```

This resizes each raster source to ≤1920px wide (2× Retina for the ~960px content column),
converts it to WebP q82 (~80% smaller than the source PNG, text stays pixel-crisp), and removes the
original PNG/JPG. Pass `--keep` to retain originals, `--dry` to preview, or
`--width=/--quality=` to tune. Reference images from Markdown by their `.webp` path.

> **Note on repo size / Git LFS:** images are kept in regular Git. At ~70KB each this is fine for
> hundreds of screenshots. Revisit [Git LFS](https://git-lfs.com/) only if image history approaches
> ~100–250MB or you start committing heavy assets (video, animated GIFs). If you do adopt LFS, add
> `lfs: true` to the `actions/checkout` step in `deploy.yml`, otherwise the build bundles pointer
> files and the live site ships broken images.

## Project structure

```
docs/
├── .vuepress/
│   └── config.js          # Site config: nav, sidebar, theme, base path
├── README.md              # Home page (hero + features)
├── guide/                 # Start + Guides (both navbar entries live here)
├── deploy/                # Install and configure a deployment
├── operate/               # Run a deployment day to day
├── extend/                # Build agents, gates, providers and API clients
└── reference/             # Architecture, environment variables, packages, glossary

scripts/                   # Repo tooling: image optimization, env-var sync
```

Anything under `planning/` is an unpublished in-flight plan, not site content.
[`planning/documentation-revamp.md`](./planning/documentation-revamp.md) tracks the section
restructure and the follow-up work still open.

## Deployment

Every push to `main` triggers the
[`Deploy docs to GitHub Pages`](.github/workflows/deploy.yml) workflow, which builds the site and
publishes it to GitHub Pages.

### One-time setup

In the repository's **Settings → Pages**, set **Source** to **GitHub Actions**. The site is served
under the `/cat-factory-website/` base path, which is configured via `base` in
`docs/.vuepress/config.js`.

## License

MIT
