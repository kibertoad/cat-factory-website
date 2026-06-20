# Quick Start

This walkthrough takes you from an empty board to a merged, agent-built pull request. It assumes you (or
someone on your team) has a Cat Factory instance deployed. If not, deploy one first: see
[Cloudflare](../deploy/cloudflare.md) or [Node.js](../deploy/nodejs.md).

## Prerequisites

Before you start, make sure you have:

- A **running Cat Factory instance** (backend + frontend).
- A **GitHub App** connected for authentication and repository operations (see [GitHub App](../deploy/github-app.md)).
- At least one **LLM provider** configured: your own `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`, or
  the free-tier Cloudflare Workers AI default.
- A **GitHub repository** you want agents to work in (or let Cat Factory bootstrap a new one).

::: tip Self-hosting
The fastest path is the Cloudflare deployment. Apply the database migrations, deploy the worker,
then build and publish the Nuxt frontend. Full steps are in
[Deploy to Cloudflare](../deploy/cloudflare.md).
:::

## 1. Sign in and open a workspace

Open your Cat Factory frontend and sign in with GitHub. You land in a **workspace**, the
container for your boards, repositories, and budget. Create a new workspace or join an existing
one if your organization already has them.

## 2. Create your board structure

On the canvas:

1. Add a **service frame** for the system you're building.
2. Add **modules** (subframes) inside it for major areas.
3. Add **tasks** (leaves) for concrete pieces of work.
4. Draw **dependency edges** where order matters.

Link the service to a repository, or use **repository bootstrap** to scaffold a new one from a
reference architecture. See [Designing Your Board](./designing-your-board.md).

## 3. Attach requirements

Give a task enough context for an agent to succeed:

- Write a clear description, **or**
- Use the **context picker** in the Add-task popup to search, paste, or link an issue or document
  (Jira, GitHub Issues, Confluence, Notion, GitHub repo docs) and import it.

Then trigger the **reviewer agent** to surface gaps and risky assumptions, and answer its
questions. See [Requirements](./requirements.md) and [Issue & Document Sources](./issue-sources.md).

## 4. Run an agent pipeline

Select a task and start a run:

1. Choose a **pipeline** (e.g. Architect → Coder → Reviewer → Tester → Acceptance).
2. Confirm the **spend estimate** against your budget.
3. Watch the run stream live, and answer any **decision prompts** the agents raise.

Each agent runs on its kind's default model, set in **Configuration → Default models**.

See [Running Pipelines](./running-pipelines.md).

## 5. Review and merge the pull request

The coding agent clones the repo into an ephemeral container and implements the task, committing to
a deterministic branch; Cat Factory then pushes it, opens a **pull request**, and drives CI. The
**Tester**, **Conflicts Gate**, **CI Gate**, and **Merger** steps validate and prepare the PR.

You review the PR like any other. When you **merge**, the block flips to **Done** and the board
updates in real time. See [Pull Requests](./pull-requests.md).

---

## The full loop

```
Design board  →  Attach requirements  →  Run pipeline  →  Review PR  →  Merge  →  Block Done
     ▲                                                                                  │
     └──────────────────────────  iterate on the next block  ◀──────────────────────────┘
```

That's the whole cycle. From here, dig into the [Using Cat Factory](./designing-your-board.md)
guides for each stage, or set up [Budgets](./budgets.md) before you turn agents loose at scale.
