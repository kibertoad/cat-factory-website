import { defaultTheme } from '@vuepress/theme-default'
import { viteBundler } from '@vuepress/bundler-vite'
import { redirectPlugin } from '@vuepress/plugin-redirect'
import { searchPlugin } from '@vuepress/plugin-search'
import { defineUserConfig } from 'vuepress'

// The six sections, each answering "what is my job right now" rather than "what does the product
// have". Start and Guides both live under /guide/ on disk: regrouping them changed no URL, which is
// why they were the cheap half of the restructure. Operate and Extend are real directories, and
// every page that moved into them carries a `redirectFrom` for its old URL.
const START = [
  '/guide/introduction.md',
  '/guide/core-concepts.md',
  '/guide/quick-start.md',
  '/guide/first-task-tutorial.md',
]

const GUIDE_GROUPS = [
  { text: 'Recipes', children: ['/guide/cookbook.md'] },
  {
    text: 'Plan the work',
    children: [
      '/guide/designing-your-board.md',
      '/guide/requirements.md',
      '/guide/documents.md',
      '/guide/initiatives.md',
    ],
  },
  {
    text: 'Run pipelines',
    children: [
      '/guide/choosing-a-pipeline.md',
      '/guide/running-pipelines.md',
      '/guide/recurring-pipelines.md',
      '/guide/pull-requests.md',
      '/guide/budgets.md',
    ],
  },
  {
    text: 'Connect',
    children: ['/guide/repositories.md', '/guide/issue-sources.md', '/guide/frontend-preview.md'],
  },
  {
    text: 'Models & prompts',
    children: [
      '/guide/model-providers.md',
      '/guide/prompt-fragments.md',
      '/guide/skills.md',
      '/guide/sandbox.md',
    ],
  },
  {
    text: 'Collaborate',
    children: [
      '/guide/team-and-access.md',
      '/guide/shared-services.md',
      '/guide/foundational-services.md',
    ],
  },
]

const DEPLOY = [
  '/deploy/local.md',
  '/deploy/nodejs.md',
  '/deploy/cloudflare.md',
  '/deploy/kubernetes.md',
  '/deploy/github-app.md',
  '/deploy/deployment-repository.md',
  '/deploy/configuration.md',
]

const OPERATE = [
  '/operate/observability.md',
  '/operate/notifications.md',
  '/operate/runner-pools.md',
  '/operate/environments.md',
  '/operate/troubleshooting.md',
  '/operate/upgrades-and-retention.md',
]

const EXTEND = [
  '/extend/custom-agents.md',
  '/extend/custom-gates.md',
  '/extend/custom-providers.md',
  '/extend/frontend-extensions.md',
  '/extend/manifests.md',
  '/extend/public-api.md',
  '/extend/sdks.md',
  '/extend/mcp-server.md',
]

const REFERENCE = [
  '/reference/architecture.md',
  '/reference/agent-isolation.md',
  '/reference/security-model.md',
  '/reference/packages.md',
  '/reference/environment-variables.md',
  '/reference/vcs-support-matrix.md',
  '/reference/glossary.md',
]

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
      { text: 'Start', children: START },
      { text: 'Guides', children: GUIDE_GROUPS },
      { text: 'Deploy', children: DEPLOY },
      { text: 'Operate', children: OPERATE },
      { text: 'Extend', children: EXTEND },
      { text: 'Reference', children: REFERENCE },
    ],

    sidebar: {
      '/guide/': [
        { text: 'Start', collapsible: false, children: START },
        ...GUIDE_GROUPS.map((group) => ({ ...group, collapsible: false })),
      ],
      '/deploy/': [{ text: 'Deploy', collapsible: false, children: DEPLOY }],
      '/operate/': [{ text: 'Operate', collapsible: false, children: OPERATE }],
      '/extend/': [{ text: 'Extend', collapsible: false, children: EXTEND }],
      '/reference/': [{ text: 'Reference', collapsible: false, children: REFERENCE }],
    },
  }),

  plugins: [
    searchPlugin({
      maxSuggestions: 10,
    }),
    // Every URL the restructure moved keeps working. The old paths are declared as `redirectFrom`
    // frontmatter on the page that now owns them, so a moved page carries its own redirect and a
    // later move cannot leave one behind in a list nobody reads.
    redirectPlugin(),
  ],
})
