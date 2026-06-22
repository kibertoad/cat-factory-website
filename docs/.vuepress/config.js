import { defaultTheme } from '@vuepress/theme-default'
import { viteBundler } from '@vuepress/bundler-vite'
import { searchPlugin } from '@vuepress/plugin-search'
import { defineUserConfig } from 'vuepress'

export default defineUserConfig({
  // Served from the custom domain root (catfactory.ai), so assets live at '/'.
  // If you ever drop the custom domain and serve from
  // https://<user>.github.io/cat-factory-website/, change this back to '/cat-factory-website/'.
  base: '/',
  lang: 'en-US',
  title: 'Cat Factory',
  description:
    'A central place to plan work on a visual board, let LLM agents build it as reviewed pull requests, and watch every run as it happens.',

  head: [
    ['meta', { name: 'theme-color', content: '#3c8772' }],
    ['meta', { name: 'viewport', content: 'width=device-width, initial-scale=1.0' }],
  ],

  bundler: viteBundler(),

  theme: defaultTheme({
    logo: null,
    repo: 'kibertoad/cat-factory',
    docsRepo: 'kibertoad/cat-factory-website',
    docsBranch: 'main',
    docsDir: 'docs',
    editLinkText: 'Edit this page on GitHub',
    lastUpdated: true,
    contributors: false,

    navbar: [
      { text: 'Home', link: '/' },
      {
        text: 'Get Started',
        children: [
          '/guide/introduction.md',
          '/guide/core-concepts.md',
          '/guide/quick-start.md',
        ],
      },
      {
        text: 'Using Cat Factory',
        children: [
          '/guide/designing-your-board.md',
          '/guide/team-and-access.md',
          '/guide/shared-services.md',
          '/guide/requirements.md',
          '/guide/running-pipelines.md',
          '/guide/recurring-pipelines.md',
          '/guide/pull-requests.md',
          '/guide/repositories.md',
          '/guide/issue-sources.md',
          '/guide/model-providers.md',
          '/guide/budgets.md',
          '/guide/prompt-fragments.md',
        ],
      },
      {
        text: 'Deploy & Operate',
        children: [
          '/deploy/cloudflare.md',
          '/deploy/nodejs.md',
          '/deploy/local.md',
          '/deploy/github-app.md',
          '/deploy/configuration.md',
          '/deploy/observability.md',
          '/deploy/notifications.md',
          '/deploy/runner-pools.md',
          '/deploy/environments.md',
        ],
      },
      {
        text: 'Reference',
        children: [
          '/reference/architecture.md',
          '/reference/manifests.md',
          '/reference/packages.md',
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Get Started',
          collapsible: false,
          children: [
            '/guide/introduction.md',
            '/guide/core-concepts.md',
            '/guide/quick-start.md',
          ],
        },
        {
          text: 'Using Cat Factory',
          collapsible: false,
          children: [
            '/guide/designing-your-board.md',
            '/guide/team-and-access.md',
            '/guide/shared-services.md',
            '/guide/requirements.md',
            '/guide/running-pipelines.md',
            '/guide/recurring-pipelines.md',
            '/guide/pull-requests.md',
            '/guide/repositories.md',
            '/guide/issue-sources.md',
            '/guide/model-providers.md',
            '/guide/budgets.md',
            '/guide/prompt-fragments.md',
          ],
        },
      ],
      '/deploy/': [
        {
          text: 'Deploy & Operate',
          collapsible: false,
          children: [
            '/deploy/cloudflare.md',
            '/deploy/nodejs.md',
            '/deploy/local.md',
            '/deploy/github-app.md',
            '/deploy/configuration.md',
            '/deploy/observability.md',
            '/deploy/notifications.md',
            '/deploy/runner-pools.md',
            '/deploy/environments.md',
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          collapsible: false,
          children: [
            '/reference/architecture.md',
            '/reference/manifests.md',
            '/reference/packages.md',
          ],
        },
      ],
    },
  }),

  plugins: [
    searchPlugin({
      maxSuggestions: 10,
    }),
  ],
})
