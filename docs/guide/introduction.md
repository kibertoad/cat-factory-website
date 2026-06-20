# Introduction

Cat Factory is a self-hosted platform that brings a visual board, task management, and LLM coding
agents together in one place. You lay out the work as a board of services, modules, and tasks,
attach dependencies and context, then run agent pipelines that turn those tasks into reviewed pull
requests. It is a central place for your team to work: you can see what every agent is doing and
step in when one needs your input.

## Who it's for

Cat Factory is built for teams that want to scale software delivery with agents while keeping
humans in control of cost and quality. It fits well when you want to:

- Plan work visually and turn it directly into implementation, without maintaining a separate backlog.
- Have agents do the repetitive build-out while engineers focus on design and review.
- Oversee many agents at once from one place, and step in only when something needs a human.
- Keep a tight feedback loop: every change lands as a pull request you approve before merge.
- Run everything on your own infrastructure (Cloudflare or Node.js), with your own model providers.

## What makes it different

Many "AI coding" tools stop at generating snippets, and even the autonomous ones treat a flat task
list as the plan. Cat Factory is built around three ideas:

> **The board is the plan.** Services, modules, and tasks form a hierarchy (frame -> subframes ->
> leaves) with dependency edges and attached context. The same board is your plan *and* your unit of
> work.

> **Agents do real work through pull requests.** Implementation phases run actual coding agents on
> repository checkouts. Completion is defined by merged PRs with passing CI.

> **One place to watch and steer.** Every run streams its progress live, so you can see all the work
> that is in flight and jump in when an agent needs your input, without polling or switching between
> tools.

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

At a glance, Cat Factory is:

- A **Nuxt single-page app** that renders the board on a Vue Flow canvas.
- A **runtime-neutral backend** (Hono HTTP layer) that runs on either Cloudflare Workers (with D1,
  Durable Objects, and Workflows) or Node.js (with PostgreSQL and pg-boss).
- **Per-run containers** that execute the actual coding work and Git operations.

See [Core Concepts](./core-concepts.md) for the vocabulary, or jump straight to the
[Quick Start](./quick-start.md) to get an instance running.
