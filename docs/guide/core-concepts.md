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

A task also has a **type** (**Feature**, **Bug**, **Document**, or **Spike**) chosen when you
create it. The type tailors the task form (a Bug captures severity and repro steps, a Spike a
time-box) and lets a workspace cap how many tasks of each type run at once under a service.

A task moves through these statuses:

```
Planned → Ready → In progress → (Needs attention) → PR ready → Done
```

**Needs attention** means a step is paused waiting on a human **decision**, and **PR ready** means a
pull request is open and awaiting review/merge.

## Epics and dependencies

Two relationships sit on top of the parent/child hierarchy:

- An **epic** groups related tasks that may live in different services or modules. Membership is a
  tag on each task, so deleting an epic clears the grouping but keeps the tasks. Importing a Jira
  epic or a GitHub parent issue can spawn the epic and all its children in one step.
- A **dependency edge** ("blocked by" / "depends on") sequences work, and it is **enforced**: a task
  refuses to start while any dependency is still unfinished, and Cat Factory rejects an edge that
  would close a cycle. A task can also be set to **auto-start its dependents** when it merges, so a
  chain advances on its own (steps on an individual-usage model are skipped, since they can't unlock
  unattended).

See [Designing Your Board → Epics and dependency edges](./designing-your-board.md#epics-and-dependency-edges).

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

Other agent kinds include the **Task Estimator** (scores a task's complexity, risk, and impact so
later steps can be [gated](./running-pipelines.md#estimating-and-gating-expensive-steps) on it), the
**Acceptance Author**, **Acceptance Test Author**, **Documenter**, **Integrator**, the **Fixer**, a
tech-debt analysis step, and an issue/ticket tracker step. Agent kinds are an **open set**: a
deployment can [register custom kinds](../reference/packages.md). You choose the pipeline (cloning a
built-in to make an editable copy, then reordering or disabling steps), and assign models through a
**model preset**. On deployments with it enabled, eligible steps can also run through
[multi-model consensus](./running-pipelines.md#multi-model-consensus).

## Decision prompts

When an agent needs a human, the step enters a **Needs decision** state and surfaces a **decision
prompt**, a set of questions for you to answer. The most common example is the reviewer agent
asking you to resolve open gaps and assumptions *before* code is generated. Your answers are folded back
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

## Model presets

You assign models with **presets** under **Configuration → Model Configuration**. A preset names one
**base model** for every agent kind plus optional **per-kind overrides** (for example, a strong model
for the **Architect** and a cheaper one for the **Tester**). One preset is the workspace **default**;
every workspace seeds two built-ins (**Kimi K2.7** and **GLM-5.2**). A task picks its preset, and
changing it only affects steps that haven't started. See
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
