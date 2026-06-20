# Quick Start

This walkthrough gets you from zero to a merged, agent-built pull request. It assumes you (or
someone on your team) has a Cat-Factory instance deployed. If not, deploy one first — see
[Cloudflare](../deploy/cloudflare.md) or [Node.js](../deploy/nodejs.md).

## Prerequisites

Before you start, make sure you have:

- A **running Cat-Factory instance** (backend + frontend).
- A **GitHub App** connected for authentication and repository operations.
- At least one **LLM provider** configured — your own `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`, or
  the free-tier Cloudflare Workers AI default.
- A **GitHub repository** you want agents to work in (or let Cat-Factory bootstrap a new one).

::: tip Deploying it yourself?
The fastest path is the Cloudflare deployment. Apply the database migrations, deploy the worker,
then build and publish the Nuxt frontend. Full steps are in
[Deploy to Cloudflare](../deploy/cloudflare.md).
:::

## 1. Sign in and open a workspace

Open your Cat-Factory frontend and sign in with GitHub. You land in a **workspace** — the
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
- Link an issue or document (Jira, Linear, GitHub issue, Confluence, Notion) and import it.

Then trigger the **reviewer agent** to surface gaps, assumptions, and risks, and answer its
questions. See [Requirements](./requirements.md) and [Issue Sources](./issue-sources.md).

## 4. Run an agent pipeline

Select a task and start a run:

1. Choose a **pipeline** (e.g. architect → coder → reviewer → tester → acceptance).
2. Pick a **model per step** if you want to upgrade from the default.
3. Confirm the **spend estimate** against your budget.
4. Watch the run stream live — answer any **decision prompts** the agents raise.

See [Running Pipelines](./running-pipelines.md).

## 5. Review and merge the pull request

The coding agent clones the repo into an ephemeral container, implements the task, and opens a
**pull request** with CI. Tester and acceptance agents validate the output.

You review the PR like any other. When you **merge**, the block flips to `done` and the board
updates in real time. See [Pull Requests](./pull-requests.md).

---

## The full loop

```
Design board  →  Attach requirements  →  Run pipeline  →  Review PR  →  Merge  →  Block "done"
     ▲                                                                                  │
     └──────────────────────────  iterate on the next block  ◀──────────────────────────┘
```

That's the whole cycle. From here, dig into the [Using Cat-Factory](./designing-your-board.md)
guides for each stage, or set up [Budgets](./budgets.md) before you turn agents loose at scale.
