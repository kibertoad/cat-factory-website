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
