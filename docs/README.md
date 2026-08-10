---
home: true
title: Home
heroText: Cat Factory
tagline: A visual board, task management, and LLM coding agents in one place. Turn tasks into reviewed pull requests you can watch run end to end. Run it on your own machine, on the coding subscriptions you already pay for.
actions:
  - text: Get Started →
    link: /guide/introduction.html
    type: primary
  - text: Core Concepts
    link: /guide/core-concepts.html
    type: secondary
features:
  - title: 100% free and open source
    details: MIT licensed, no paid tier, no open-core holdback, nothing behind a license key. You run the whole platform on your own infrastructure, so your code, data, and model credentials never leave it.
  - title: The board is the plan
    details: Lay out services, modules, and tasks on a pannable, zoomable canvas. Every block is both your plan and a unit of work, so there's no separate backlog to keep in sync.
  - title: Agents do real work
    details: Coding agents clone your repository, implement the task, and open a pull request. A block is "done" only when its PR is merged with passing CI.
  - title: Multi-stage pipelines
    details: Compose ordered agent chains (Architect → Coder → Reviewer → Tester → Acceptance) with default models per agent kind and human decision points along the way.
  - title: Human in the loop
    details: A reviewer agent flags open questions and risky assumptions before code is written. You answer the questions, approve the plan, and review every PR before merge.
  - title: Run it your way
    details: Heavy cloud workloads on Cloudflare Workers or self-hosted Node.js, or the whole platform on one machine in local mode. Run agents on coding subscriptions you already pay for instead of metered API spend.
footer: MIT Licensed | Copyright © Cat Factory contributors
---

## What it does

You lay out work on a visual board. LLM agents pick up each block, implement it against a real
repository checkout, and open pull requests for your team to review and merge. The same board is
where you watch every run as it happens and step in when an agent needs you. It is self-hosted and
MIT licensed, so the whole platform is yours to run.

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
