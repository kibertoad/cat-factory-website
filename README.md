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
├── guide/                 # Get Started + Using Cat Factory
├── deploy/                # Deploy & Operate
└── reference/             # Architecture, HTTP API, data model, packages
```

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
