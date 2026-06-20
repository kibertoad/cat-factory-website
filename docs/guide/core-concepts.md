# Core Concepts

A short glossary of the moving parts. Understanding these makes everything else on this site
click into place.

## Blocks

Everything on the board is a **block**. Blocks form a three-level hierarchy:

| Level | Represents | Role |
| --- | --- | --- |
| `frame` | A **service** | Top-level container, usually linked to one repository. |
| `subframe` | A **module** | A mid-level grouping inside a service. |
| `leaf` | A **task** | An implementation unit — the thing an agent actually builds. |

Each block carries a `title`, `description`, and `status`, and can reference a linked repository
(`repoId`) and an assigned model (`modelId`). Blocks can be **reparented** by dragging them to a
new parent. Deleting a block cascades to its children.

A block moves through these statuses:

```
backlog → active → in-review → done
```

**Dependency edges** between blocks express ordering and relationships — they are part of the
design, not just decoration.

## Runs

A **run** is an immutable execution record created when you start a pipeline on a block. Runs are
**checkpointed**: each completed step is durably recorded, so a run can survive restarts and be
retried from where it failed.

A run has a `status` of `queued`, `running`, `passed`, or `failed`, and contains an ordered list
of **steps**.

## Steps and pipelines

A **pipeline** is a reusable, ordered chain of **steps**. Each step is handled by a specific kind
of agent:

```
architect → coder → blueprints → reviewer → tester → acceptance
```

Additional step kinds include `mocker`, `playwright`, `deployer`, and `custom`. A step has a
`status` (`pending`, `in-progress`, `paused-for-decision`, `complete`) and may pause to ask you a
question via a **decision prompt** before continuing.

You choose the pipeline and can select a **model per step**, upgrading to a stronger provider
(via your API keys) where it matters.

## Decision prompts

When an agent needs a human, the step enters `paused-for-decision` and surfaces a **decision
prompt** — a set of questions for you to answer. The most common example: the reviewer agent
asks you to resolve gaps and assumptions *before* code is generated. Your answers are folded back
into the block's description and the run continues.

## Workspaces and accounts

- An **account** is a personal identity, tied to your GitHub login.
- A **workspace** is an organization-level container with **membership controls** that determine
  who can see and act on its boards.
- Repositories, credentials, and budgets are isolated **per workspace**.

## Repositories

Services link to Git repositories. Cat-Factory can also **bootstrap** a new repository from a
reference architecture, and **reconcile** an existing repository's structure back onto the board
via service blueprints (`service → modules → features` maps stored in-repo).

## Prompt fragments

**Prompt fragments** are versioned, reusable best-practice guidelines that agents pull in per run.
They are scoped in three tiers — **built-in**, **account**, and **workspace** — so you can layer
organization-wide standards with board-specific tweaks. See
[Prompt Fragments](./prompt-fragments.md).

## Spend and budgets

Every model call is **metered** against an organization-wide **monthly budget**. When the cap is
reached, runs pause (`pause-for-budget`) and resume automatically when the period rolls over. See
[Budgets & Spend](./budgets.md).

---

Ready to put these together? Continue to the [Quick Start](./quick-start.md).
