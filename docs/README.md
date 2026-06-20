---
home: true
title: Home
heroText: Cat Factory
tagline: A visual board, task management, and LLM coding agents in one place. Turn tasks into reviewed pull requests you can watch run end to end.
actions:
  - text: Get Started →
    link: /guide/introduction.html
    type: primary
  - text: Core Concepts
    link: /guide/core-concepts.html
    type: secondary
features:
  - title: The board is the plan
    details: Lay out services, modules, and tasks on a pannable, zoomable canvas. Every block is both your plan and a unit of work, so there's no separate backlog to keep in sync.
  - title: Agents do real work
    details: Coding agents clone your repository, implement the task, and open a pull request. A block is "done" only when its PR is merged with passing CI.
  - title: Multi-stage pipelines
    details: Compose ordered agent chains (Architect → Coder → Reviewer → Tester → Acceptance) with default models per agent kind and human decision points along the way.
  - title: Human in the loop
    details: A reviewer agent flags open questions and risky assumptions before code is written. You answer the questions, approve the plan, and review every PR before merge.
  - title: Durable & observable
    details: Runs are checkpointed and stream live progress over WebSockets, with no polling. Watch each step, decision prompt, and failure as it happens.
  - title: Cost under control
    details: Set an organization-wide monthly LLM budget. Spend is metered per run, runs pause at the cap, and resume automatically on the next billing period.
footer: MIT Licensed | Copyright © Cat Factory contributors
---

## From board to merged PRs

Cat Factory is a self-hosted platform that turns a visual board of work into shipped code.
You lay out the work visually; LLM agents pick up each block, implement it against a real
repository checkout, and open pull requests for your team to review and merge. The board is also
your central place to work: you can see every run as it happens and step in when an agent needs you.

```bash
# Deploy the backend to Cloudflare
cd deploy/backend
wrangler d1 migrations apply cat_factory --remote
pnpm deploy

# Build and publish the frontend
cd ../frontend
NUXT_PUBLIC_API_BASE=https://your-api-domain.com pnpm generate
pnpm deploy
```

## Where to next?

- **New here?** Start with the [Introduction](/guide/introduction.html) and [Core Concepts](/guide/core-concepts.html).
- **Want it running?** Follow the [Quick Start](/guide/quick-start.html) or pick a deployment target under [Deploy & Operate](/deploy/cloudflare.html).
- **Daily driver?** Jump into [Designing Your Board](/guide/designing-your-board.html) and [Running Pipelines](/guide/running-pipelines.html).
- **Integrating your infra?** See [Integration Manifests](/reference/manifests.html) and the [Architecture](/reference/architecture.html) reference.

::: tip A note on scope
This site documents how to **deploy and use** Cat Factory. For source code, issues, and
contribution guidelines, head to the [kibertoad/cat-factory](https://github.com/kibertoad/cat-factory) repository.
:::
