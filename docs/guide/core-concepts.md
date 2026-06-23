# Core Concepts

A short glossary of the moving parts. Understanding these makes everything else on this site
easier to follow.

## Blocks

Everything on the board is a **block**. Blocks form a three-level hierarchy:

| Level | Represents | Role |
| --- | --- | --- |
| **Service** (a frame) | A service | Top-level container, usually linked to one repository. |
| **Module** | A module | A mid-level grouping inside a service. |
| **Task** | A task | An implementation unit, the thing an agent actually builds. |

Each block has a title, description, and status, and can carry a chosen pipeline, selected
[prompt fragments](./prompt-fragments.md), and, once an agent opens one, its pull request. Blocks
can be **reparented** by dragging them to a new parent. Deleting a block cascades to its children.

A task moves through these statuses:

```
Planned → Ready → In progress → (Needs attention) → PR ready → Done
```

**Needs attention** means a step is paused waiting on a human **decision**, and **PR ready** means a
pull request is open and awaiting review/merge.

**Dependency edges** between blocks express ordering and relationships.

## Services and mounts

A **service** is the account-owned unit a service frame represents: the frame plus its whole
subtree, its linked repository, its runs, and its sync. A **workspace** mounts the services it
cares about, and the same service can be mounted onto several boards in an org as **one shared
copy** rather than duplicated. See [Shared Services](./shared-services.md).

## Runs

A **run** is an immutable execution record created when you start a pipeline on a block. Runs are
**checkpointed**: each completed step is durably recorded, so a run can survive restarts and be
retried from where it failed.

A run shows as **Running** while it executes, then ends as **Completed** or **Failed**. While
paused, it reads **Needs you** (waiting on a decision) or **Paused (budget)** (at the spend cap). A
run contains an ordered list of **steps**.

## Steps and pipelines

A **pipeline** is a reusable, ordered chain of **steps**. Each step is handled by a specific kind
of agent. The default **Full build** pipeline runs:

```
Requirements Reviewer → Spec Writer → Spec Reviewer → Architect → Researcher → Coder
  → Reviewer → Blueprinter → Mock Builder → Tester → Conflicts Gate → CI Gate → Merger
```

The **Requirements Reviewer** and the **Architect** proposal pause for **human approval**; the rest
run to completion. The **Spec Writer** runs before the Architect so the design is built against a
written spec, and the spec is not human-gated: its **Spec Reviewer** companion rates it and loops the
writer back instead. The closing steps are engine automation: the **Conflicts Gate** keeps the PR
mergeable with its base, the **CI Gate** gates it on green CI (looping a fixer agent on failure), and
the **Merger** scores the PR and either auto-merges within the task's thresholds or raises a review
notification.

Other agent kinds include the **Acceptance Author**, **Acceptance Test Author**, **Documenter**,
**Integrator**, the **Fixer**, a tech-debt analysis step, and an issue/ticket tracker step. Agent
kinds are an **open set**: a deployment can [register custom kinds](../reference/packages.md). You
choose the pipeline (cloning a built-in to make an editable copy, then reordering or disabling
steps), and set **default models per agent kind**.

## Decision prompts

When an agent needs a human, the step enters a **Needs decision** state and surfaces a **decision
prompt**, a set of questions for you to answer. The most common example: the reviewer agent
asks you to resolve open gaps and assumptions *before* code is generated. Your answers are folded back
into the block's description and the run continues.

## Workspaces and accounts

- An **account** is the top-level owner you work under. It can be a **personal account** (one per
  user) or a shared **organization account** whose members each hold a combinable set of
  **admin / developer / product** roles. Either way it owns shared services and account-wide
  standards, and spans all of its workspaces. You sign in with GitHub, Google, or email/password,
  and an admin brings teammates in by email invitation. See
  [Members, Roles & Invitations](./team-and-access.md).
- A **workspace** is a per-team, per-project container with **membership controls** that determine
  who can see and act on its boards. Boards carry a name and description.
- Repositories and credentials are isolated **per workspace**; the LLM **budget** is metered
  account-wide (across all workspaces in the organization).

## Model selection

You set a **default model per agent kind** under **Configuration → Default models**. For example,
use a strong model for the **Architect** and a cheaper one for the **Tester**. Where a kind has no
default, the deployment's routing for that kind applies, then its global default. See
[Running Pipelines](./running-pipelines.md#choosing-models).

## Repositories

Services link to Git repositories. Cat Factory can also **bootstrap** a new repository from a
reference architecture, and **reconcile** an existing repository's structure back onto the board
via service blueprints (`service → modules → features` maps stored in-repo). Alongside the
descriptive blueprint, a service also keeps a prescriptive [spec](./requirements.md) in-repo under
`spec/`, written by the Spec Writer.

## Prompt fragments

**Prompt fragments** are versioned, reusable best-practice guidelines, assigned per service and
folded into code-aware agent steps. They are scoped in three tiers (**built-in**, **account**, and
**workspace**) so you can layer organization-wide standards with board-specific tweaks. See
[Prompt Fragments](./prompt-fragments.md).

## Spend and budgets

Every model call is **metered** against an organization-wide **monthly budget**. When the cap is
reached, runs pause (showing **Paused (budget)**) and resume automatically when the period rolls
over. See [Budgets & Spend](./budgets.md).

---

Continue to the [Quick Start](./quick-start.md) to put these together.
