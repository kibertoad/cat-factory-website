---
home: true
title: Home
heroText: Cat Factory
tagline: A visual board, LLM coding agents, and a live view of every run in flight and every decision waiting on you. Tickets and plans go in, reviewed pull requests come out. Free, MIT licensed, and running entirely on your own infrastructure and the coding subscriptions you already pay for.
actions:
  - text: Get Started →
    link: /guide/introduction.html
    type: primary
  - text: Core Concepts
    link: /guide/core-concepts.html
    type: secondary
features:
  - title: From ticket to reviewed pull request
    details: Import an issue from Jira, Linear, or GitHub Issues, or write the task on the board. An ordered agent chain (Architect → Coder → Reviewer → Tester → Acceptance) plans it, writes the code against a real repository checkout, reviews and tests it, opens the pull request, and comments the outcome back on the ticket.
  - title: Watch it all happen on one canvas
    details: Zoom out for the whole system; zoom into a running task and its card opens into the live pipeline, its steps, and what it has spent. Runs in flight, failures, and decisions waiting on you appear where the work sits, and you answer a gate or retry a step right there instead of tailing logs.
  - title: 100% free and open source
    details: MIT licensed, no paid tier, no open-core holdback, nothing behind a license key. Everything on this page ships in the version you self-host, and your code, data, and model credentials never leave your own infrastructure.
  - title: You decide what agents may land
    details: Per-task risk policies set what merges without a human, through score ceilings, rules per change class (a migration is not a test-only diff), narrowing by workspace role, retry budgets, and human decision gates you can place anywhere in a pipeline.
  - title: Scales from one engineer to a whole org
    details: One person on a laptop and an engineering organization running every team's agent flows share the same build. Start with a model provider and nothing else; grow into directory SSO with group gating, an org-wide monthly LLM cap that meters spend and auto-pauses at the ceiling, and an audit log kept to outlive every other record. At either size, every step, decision, failure, and dollar streams live to the board, with traces exportable to OpenTelemetry or Langfuse.
  - title: Run it and extend it your way
    details: One machine, Cloudflare Workers, or self-hosted Node, on the coding subscriptions you already pay for instead of metered API spend. Add your own agents, gates, task types, and integrations through a manifest model and the published @cat-factory/* packages.
footer: MIT Licensed | Copyright © Cat Factory contributors
---

## What it does

You lay out work on a visual board, writing blocks yourself or importing issues from Jira, Linear, or
GitHub Issues, which stay the source of truth and get progress written back to them. LLM agents pick
up each block, implement it against a real repository checkout, and open pull requests for your team
to review and merge. The same board is where you watch every run as it happens and step in when an
agent needs you. It is self-hosted and MIT licensed, so the whole platform is yours to run.

What the board tracks is work in flight: the state of every pipeline, the stage each one reached, what
it has spent, and which decisions are waiting on a person. Backlog refinement, estimation, and
sprint planning stay in the tracker you already run.

## Where to next?

Each card matches a section of the docs sidebar, so the path you pick here is the same one you
will follow in the navigation.

<div class="next-grid">
<div class="next-card">

**Start** — new here?

Read the [Introduction](/guide/introduction.html) and
[Core Concepts](/guide/core-concepts.html), then take the
[first-task tutorial](/guide/first-task-tutorial.html) end to end.

</div>
<div class="next-card">

**Guides** — using it day to day?

[Design your board](/guide/designing-your-board.html),
[run a pipeline](/guide/running-pipelines.html), or change a flow you already
run with a short recipe from the [Cookbook](/guide/cookbook.html).

</div>
<div class="next-card">

**Deploy** — want it running?

Pick a runtime — [local](/deploy/local.html), [Cloudflare](/deploy/cloudflare.html),
or [Node.js](/deploy/nodejs.html) — and sign people in through your directory with
[enterprise SSO](/deploy/sso.html).

</div>
<div class="next-card">

**Operate** — running it in production?

Set up [observability](/operate/observability.html), keep
[Troubleshooting](/operate/troubleshooting.html) within reach, and walk the
[hardening checklist](/reference/security-model.html#operator-hardening-checklist).

</div>
<div class="next-card">

**Extend** — building on it?

Write an [integration manifest](/extend/manifests.html), build against the
[SDKs](/extend/sdks.html), or
[package a reusable operation](/extend/reusable-operations.html) for your organization.

</div>
<div class="next-card">

**Reference** — looking something up?

The [architecture](/reference/architecture.html),
[environment variables](/reference/environment-variables.html), and the
[glossary](/reference/glossary.html).

</div>
</div>

## Integrations

Cat Factory connects to the tools you already use. Everything below ships in every deployment.

| Category | Connects to |
| --- | --- |
| **Repositories & pull requests** | <ul><li>GitHub (via GitHub App)</li><li>GitLab (all runtimes)</li></ul> |
| **Issue trackers** | <ul><li>Jira</li><li>GitHub Issues</li><li>Linear</li></ul>Seed tasks from issues and write progress back. |
| **Document & context sources** | <ul><li>Confluence</li><li>Notion</li><li>GitHub repo docs</li><li>Figma & Zeplin (design context)</li><li>Linear Docs</li></ul> |
| **Model providers** | <ul><li>Coding subscriptions: Claude, GLM, ChatGPT/Codex</li><li>Direct API keys: Anthropic, OpenAI, Qwen, DeepSeek, Moonshot</li><li>Aggregators: OpenRouter, LiteLLM</li><li>Local runners: Ollama, LM Studio</li></ul> |
| **Sign-in** | <ul><li>Enterprise SSO (any OpenID Connect provider)</li><li>GitHub</li><li>Google</li><li>Email and password</li></ul> |
| **Notifications** | <ul><li>In-app inbox</li><li>Slack (optional)</li><li>Email invitations</li></ul> |

See [Connect Issue & Document Sources](/guide/issue-sources.html) and
[Connect a Model Provider](/guide/model-providers.html) for setup.

## Advanced capabilities

**Build & review**

- **Multi-stage agent pipelines** — ordered chains with per-agent models and human decision gates.
- **Requirements & spec** — a reviewer agent flags gaps and risks per task; the Spec Writer keeps a unified, in-repo spec with Gherkin acceptance scenarios.
- **Visual confirmation** (experimental) — a UI Tester screenshots each screen, then a gate parks for you to compare them against reference designs.
- **Custom agents & gates** — extend the pipeline through a manifest model and the published `@cat-factory/*` packages.

**Test & iterate**

- **Sandbox** — test prompts and models side by side against graded fixtures, scored by a judge, before you commit to a preset.
- **Ephemeral environments** — spin up a live preview per run for integration and end-to-end tests, then tear it down automatically.
- **Recurring pipelines** — schedule dependency bumps and tech-debt passes to ship as reviewed PRs on a cadence, with no one kicking them off.

**Operate**

- **Durable runs** — every run is checkpointed, survives interruptions, and resumes where it left off.
- **Live observability** — watch each step, decision, failure, and spend update stream over WebSockets.
- **Budgets & metering** — an org-wide monthly LLM cap with per-run metering, prompt caching, auto-pause, and rollover resumption.
- **Runner pools** — provision agent containers across your own runners.

**Collaborate**

- **Shared services** — one account-owned service mounts onto many teams' boards as a single synced copy.
- **Members, roles & invitations** — invite teammates into a shared organization with role-based access.
- **Localized, mobile-friendly UI** — English, Spanish, French, Polish, and Ukrainian, with a responsive board shell (touch pan, pinch zoom, phone minimap).

## Deploy anywhere

| Runtime | Best for |
| --- | --- |
| [Local mode](/deploy/local.html) | One machine, no cloud account: fastest way to try it end to end. Agents clone, commit, and push to real repos; CI gates on real GitHub Actions. |
| [Cloudflare](/deploy/cloudflare.html) | Heavy production workloads on Workers (D1, Durable Objects, Workflows). |
| [Node.js](/deploy/nodejs.html) | Self-hosted production on Node with PostgreSQL and pg-boss. |

Run agents on a coding subscription you already hold (Claude Pro/Max, GLM Coding Plan, or
ChatGPT/Codex) instead of metered API spend. These plans are kept per-user, so each vendor's
individual-use terms stay respected, and they unlock
[subscription-only models](/guide/model-providers.html) with no API-key equivalent. For shared,
org-wide access, set a direct provider key, an aggregator like OpenRouter or LiteLLM, or run a
[local model](/guide/model-providers.html#running-on-a-local-llm-ollama-lm-studio) with no key and
no spend.

::: tip A note on scope
This site documents how to **deploy and use** Cat Factory. For source code, issues, and
contribution guidelines, head to the [kibertoad/cat-factory](https://github.com/kibertoad/cat-factory) repository.
:::
