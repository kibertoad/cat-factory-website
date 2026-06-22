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
  - title: The board is the plan
    details: Lay out services, modules, and tasks on a pannable, zoomable canvas. Every block is both your plan and a unit of work, so there's no separate backlog to keep in sync.
  - title: Agents do real work
    details: Coding agents clone your repository, implement the task, and open a pull request. A block is "done" only when its PR is merged with passing CI.
  - title: Multi-stage pipelines
    details: Compose ordered agent chains (Architect → Coder → Reviewer → Tester → Acceptance) with default models per agent kind and human decision points along the way.
  - title: Human in the loop
    details: A reviewer agent flags open questions and risky assumptions before code is written. You answer the questions, approve the plan, and review every PR before merge.
  - title: Durable & observable
    details: Runs are checkpointed, so they survive interruptions and resume where they left off. Watch each step, decision prompt, and failure as it happens.
  - title: Cost under control
    details: Set an organization-wide monthly LLM budget. Spend is metered per run, runs pause at the cap, and resume automatically on the next billing period.
  - title: Runs where you need it
    details: Pick the runtime that fits the job. For heavy production workloads, run fully in the cloud on Cloudflare Workers or self-hosted Node.js. For solo developers or a quick test drive, local mode puts the whole platform on one machine, with the orchestrator, agent containers, and a local database side by side. You get the complete development experience, from agents picking up work to PRs landing with passing CI, all without a cloud account or runner pool to stand up first.
  - title: Bring your own subscription
    details: Run agents on a coding plan you already pay for (Claude, GLM, or ChatGPT/Codex) instead of metered API spend. Kept per-user by design, so each vendor's individual-use terms stay respected.
  - title: Maintenance on a schedule
    details: Attach a recurring pipeline to a service and let agents handle dependency bumps and tech debt on a cadence. Routine upkeep ships as reviewed PRs without anyone kicking it off.
footer: MIT Licensed | Copyright © Cat Factory contributors
---

## From board to merged PRs

Cat Factory is a self-hosted platform that turns a visual board of work into shipped code.
You lay out the work visually; LLM agents pick up each block, implement it against a real
repository checkout, and open pull requests for your team to review and merge. The board is also
your central place to work: you can see every run as it happens and step in when an agent needs you.

You assemble a thin deployment project on top of the published `@cat-factory/*` packages, then
deploy it:

```bash
# Deploy the backend to Cloudflare
wrangler d1 migrations apply <your-d1-database> --remote
pnpm deploy

# Build and publish the frontend
NUXT_PUBLIC_API_BASE=https://your-api-domain.com pnpm generate
pnpm deploy
```

## Start on one machine

[Local mode](/deploy/local.html) runs the entire platform on a single machine: the orchestrator as
a Node process, each agent job as a local Docker container, GitHub through a personal access token,
and persistence on a local PostgreSQL. There is no cloud account, runner pool, or GitHub App to
register first. It is the fastest way to try Cat Factory end to end, and it does real work: agent
containers clone, commit, and push to real repositories, CI gates on real GitHub Actions, and PRs
merge for real. Use it for evaluation, demos, and single-operator workflows, then move the same
backend to [Cloudflare](/deploy/cloudflare.html) or [Node.js](/deploy/nodejs.html) when you want a
shared deployment.

## Use the subscriptions you already pay for

Cat Factory can run agents on a coding-plan subscription you already hold (Anthropic's Claude
Pro/Max, Z.ai's GLM Coding Plan, or a ChatGPT/Codex seat) instead of metered, per-token API spend.
These plans are licensed for individual use, so Cat Factory keeps them per-user: you connect your
own credential, only your runs use it, and it is never pooled across a team. That respects each
vendor's terms while unlocking [subscription-only models](/guide/model-providers.html), such as the
Claude Opus and Sonnet coding-plan models and the Codex GPT models, that have no API-key or
Cloudflare equivalent. For shared, org-wide access, set a direct provider API key instead. See
[Model Providers & Subscriptions](/guide/model-providers.html) for how connecting and unlocking
works.

## Where to next?

- **New here?** Start with the [Introduction](/guide/introduction.html) and [Core Concepts](/guide/core-concepts.html).
- **Want it running?** Follow the [Quick Start](/guide/quick-start.html) or pick a deployment target under [Deploy & Operate](/deploy/cloudflare.html).
- **Daily driver?** Jump into [Designing Your Board](/guide/designing-your-board.html) and [Running Pipelines](/guide/running-pipelines.html).
- **Integrating your infra?** See [Integration Manifests](/reference/manifests.html) and the [Architecture](/reference/architecture.html) reference.

::: tip A note on scope
This site documents how to **deploy and use** Cat Factory. For source code, issues, and
contribution guidelines, head to the [kibertoad/cat-factory](https://github.com/kibertoad/cat-factory) repository.
:::
