# Introduction

Cat-Factory is a self-hosted platform for designing software architecturally and having LLM
agents build it autonomously. You lay out your system as a visual board of services, modules,
and tasks, then run agent pipelines that produce real, reviewed pull requests, with full
observability over every step.

## Who it's for

Cat-Factory is built for teams that want to scale software delivery with agents while keeping
humans in control of cost and quality. It fits well when you want to:

- Turn an architecture sketch directly into implementation work, without maintaining a separate backlog.
- Have agents do the repetitive build-out while engineers focus on design and review.
- Keep a tight feedback loop: every change lands as a pull request you approve before merge.
- Run everything on your own infrastructure (Cloudflare or Node.js), with your own model providers.

## What makes it different

Most "AI coding" tools stop at generating text. Cat-Factory is built around two ideas that change
what "done" means:

> **The board is the plan.** Services, modules, and tasks form a hierarchy (frame -> subframes ->
> leaves) with dependency edges. The same board is your design artifact *and* your unit of work.

> **Agents do real work through pull requests.** Implementation phases run actual coding agents on
> repository checkouts. Completion is defined by merged PRs with passing CI, not by generated text.

## What you get

| Capability | What it means for you |
| --- | --- |
| **Visual planning** | A pannable, zoomable canvas with frames, modules, and tasks; drag-and-drop reparenting and dependency edges. |
| **Agent pipelines** | Reusable, ordered chains of agent steps with per-block model selection and human decision points. |
| **Real code** | Agents clone repos, implement work, and open PRs; merges flip blocks to "done". |
| **Requirements** | A reviewer agent finds gaps and risks per task; a requirements-writer keeps a unified, in-repo spec (with Gherkin scenarios) for the whole service. |
| **Shared services** | A service is account-owned and can be mounted onto many teams' boards in an org as one shared, synced copy. |
| **Recurring pipelines** | Schedule maintenance (dependency updates, tech-debt passes) to re-run a pipeline on a cadence. |
| **Integrations** | GitHub App for repo/PR/issue operations; import context from Jira, GitHub Issues, Confluence, Notion, and GitHub repo docs. |
| **Spend control** | Organization-wide monthly LLM budget with metering, prompt caching, auto-pause at the cap, and rollover resumption. |
| **Observability** | WebSocket event streaming of every step, decision, failure, and spend update, with no polling. |

## How it fits together

At a glance, Cat-Factory is:

- A **Nuxt single-page app** that renders the board on a Vue Flow canvas.
- A **runtime-neutral backend** (Hono HTTP layer) that runs on either Cloudflare Workers (with D1,
  Durable Objects, and Workflows) or Node.js (with PostgreSQL and pg-boss).
- **Per-run containers** that execute the actual coding work and Git operations.

See [Core Concepts](./core-concepts.md) for the vocabulary, or jump straight to the
[Quick Start](./quick-start.md) to get an instance running.
