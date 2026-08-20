import { defaultTheme } from '@vuepress/theme-default'
import { viteBundler } from '@vuepress/bundler-vite'
import { redirectPlugin } from '@vuepress/plugin-redirect'
import { searchPlugin } from '@vuepress/plugin-search'
import { defineUserConfig } from 'vuepress'

// The six sections, each answering "what is my job right now" rather than "what does the product
// have". Start and Guides both live under /guide/ on disk: regrouping them changed no URL, which is
// why they were the cheap half of the restructure. Operate and Extend are real directories, and
// every page that moved into them carries a `redirectFrom` for its old URL.
//
// Navigation model: the sidebar is the one and only page-level navigation. All six sections are
// always present as collapsible groups, and the default theme opens a collapsible group exactly
// when it contains the active page — so the current section is expanded and the other five stay
// visible as one-line headers. The navbar deliberately carries no page lists: an earlier layout
// duplicated every page into navbar dropdowns, which made two competing menus and left
// cross-section navigation hidden behind hover dropdowns that users missed.
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
    children: [
      '/guide/repositories.md',
      '/guide/issue-sources.md',
      '/guide/design-context.md',
      '/guide/frontend-preview.md',
    ],
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
  '/deploy/kubernetes-topology.md',
  '/deploy/kubernetes-windows.md',
  '/deploy/github-app.md',
  '/deploy/sso.md',
  '/deploy/deployment-repository.md',
  '/deploy/configuration.md',
]

const OPERATE = [
  '/operate/observability.md',
  '/operate/notifications.md',
  '/operate/runner-pools.md',
  '/operate/environments.md',
  '/operate/debugging-a-run.md',
  '/operate/troubleshooting.md',
  '/operate/upgrades-and-retention.md',
]

const EXTEND = [
  '/extend/custom-agents.md',
  '/extend/custom-gates.md',
  '/extend/custom-providers.md',
  '/extend/frontend-extensions.md',
  '/extend/manifests.md',
  '/extend/tool-servers.md',
  '/extend/reusable-operations.md',
  '/extend/inline-use-cases.md',
  '/extend/initiative-presets.md',
  '/extend/public-api.md',
  '/extend/sdks.md',
  '/extend/mcp-server.md',
  '/extend/cloudflare-os.md',
]

// The two generated pages sit together at the end of the descriptive ones. Both are rendered from
// the code repo and both are lookups rather than reading: `/extend/` owns the JOB (drive the
// platform from outside, configure a deployment) and Reference owns the FIELD LEVEL, which is why
// `api-reference` is here while its narrative half stays at `/extend/public-api`.
const REFERENCE = [
  '/reference/architecture.md',
  '/reference/agent-isolation.md',
  '/reference/security-model.md',
  '/reference/packages.md',
  '/reference/vcs-support-matrix.md',
  '/reference/environment-variables.md',
  '/reference/api-reference.md',
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
      { text: 'Get Started', link: '/guide/introduction.md' },
    ],

    sidebar: [
      { text: 'Start', collapsible: true, children: START },
      { text: 'Guides', collapsible: true, children: GUIDE_GROUPS },
      { text: 'Deploy', collapsible: true, children: DEPLOY },
      { text: 'Operate', collapsible: true, children: OPERATE },
      { text: 'Extend', collapsible: true, children: EXTEND },
      { text: 'Reference', collapsible: true, children: REFERENCE },
    ],
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
