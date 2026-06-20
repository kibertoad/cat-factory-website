# Core Concepts

A short glossary of the moving parts. Understanding these makes everything else on this site
easier to follow.

## Blocks

Everything on the board is a **block**. Blocks form a three-level hierarchy, identified by their
`level`:

| Level | Represents | Role |
| --- | --- | --- |
| `frame` | A **service** | Top-level container, usually linked to one repository. |
| `module` | A **module** | A mid-level grouping inside a service. |
| `task` | A **task** | An implementation unit, the thing an agent actually builds. |

Each block carries a `title`, `description`, and `status`, and can reference a linked model
(`modelId`), a chosen pipeline (`pipelineId`), selected [prompt fragments](./prompt-fragments.md),
and, once an agent opens one, its `pullRequest`. Blocks can be **reparented** by dragging them to
a new parent. Deleting a block cascades to its children.

A task moves through these statuses:

```
planned → ready → in_progress → (blocked) → pr_ready → done
```

`blocked` means a step is paused waiting on a human **decision**, and `pr_ready` means a pull
request is open and awaiting review/merge.

**Dependency edges** between blocks express ordering and relationships. They are part of the
design, not just decoration.

## Services and mounts

A **service** is the account-owned unit a service frame represents: the frame plus its whole
subtree, its linked repository, its runs, and its sync. A **workspace** mounts the services it
cares about, and the same service can be mounted onto several boards in an org as **one shared
copy** rather than duplicated. See [Shared Services](./shared-services.md).

## Runs

A **run** is an immutable execution record created when you start a pipeline on a block. Runs are
**checkpointed**: each completed step is durably recorded, so a run can survive restarts and be
retried from where it failed.

A run has a `status` of `queued`, `running`, `passed`, or `failed`, and contains an ordered list
of **steps**.

## Steps and pipelines

A **pipeline** is a reusable, ordered chain of **steps**. Each step is handled by a specific kind
of agent. The default **Full build** pipeline runs:

```
requirements → architect → requirements-writer → researcher → coder
  → blueprints → tester → reviewer → conflicts → ci → merger
```

The `requirements` reviewer and the `architect` proposal pause for **human approval**; the rest run
to completion. The closing steps are engine automation: **conflicts** keeps the PR mergeable with its
base, **ci** gates it on green CI (looping a fixer agent on failure), and **merger** scores the PR
and either auto-merges within the task's thresholds or raises a review notification.

Other agent kinds include `mocker`, `playwright`, `acceptance`, `documenter`, `integrator`,
`analysis` (the tech-debt auditor), and `tracker` (files an issue/ticket). Agent kinds are an
**open set**: a deployment can [register custom kinds](../reference/packages.md). You choose the
pipeline and can select a **model per step**.

## Decision prompts

When an agent needs a human, the step enters `paused-for-decision` and surfaces a **decision
prompt**, a set of questions for you to answer. The most common example: the reviewer agent
asks you to resolve open gaps and assumptions *before* code is generated. Your answers are folded back
into the block's description and the run continues.

## Workspaces and accounts

- An **account** is a personal identity, tied to your GitHub login.
- A **workspace** is an organization-level container with **membership controls** that determine
  who can see and act on its boards.
- Repositories, credentials, and budgets are isolated **per workspace**.

## Model selection

The model an agent uses is resolved by precedence, so you can be as specific or as hands-off as you
like:

```
block-pinned model  →  workspace per-kind default  →  deployment env routing  →  env default
```

A **workspace model default** lets you point a whole agent kind at a model (e.g. a strong model for
`architect`, a cheap one for `tester`) without pinning every block. See
[Running Pipelines](./running-pipelines.md#choosing-models).

## Repositories

Services link to Git repositories. Cat-Factory can also **bootstrap** a new repository from a
reference architecture, and **reconcile** an existing repository's structure back onto the board
via service blueprints (`service → modules → features` maps stored in-repo). Alongside the
descriptive blueprint, a service also keeps a prescriptive [requirements](./requirements.md)
document in-repo under `requirements/`.

## Prompt fragments

**Prompt fragments** are versioned, reusable best-practice guidelines that agents pull in per run.
They are scoped in three tiers (**built-in**, **account**, and **workspace**) so you can layer
organization-wide standards with board-specific tweaks. See
[Prompt Fragments](./prompt-fragments.md).

## Spend and budgets

Every model call is **metered** against an organization-wide **monthly budget**. When the cap is
reached, runs pause (`pause-for-budget`) and resume automatically when the period rolls over. See
[Budgets & Spend](./budgets.md).

---

Ready to put these together? Continue to the [Quick Start](./quick-start.md).
