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

A task also has a **type** chosen when you create it: **Feature**, **Bug**, **Document**, **Spike**,
**Review**, or **Ralph loop**. The type tailors the task form (a Bug captures severity and repro
steps, a Spike a time-box, a Review the pull request to audit, a Ralph loop its validation command)
and lets a workspace cap how many tasks of each type run at once under a service. A **Review** task
[deep-reviews an existing open pull request](./pull-requests.md#deep-reviewing-an-existing-pull-request);
a **Ralph loop** task runs a [persistent retry-until-done coding loop](./running-pipelines.md#the-ralph-loop).

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
of agent. The build presets are a three-rung ladder that varies how much design a task gets. The
default, **Standard build**, runs:

```
Architect → Architect Reviewer → Coder → Reviewer → Deployer → Tester
  → Conflicts Gate → CI Gate → Merger
```

**Simple build** is the same minus the design phase, for work whose approach is not in question.
**Adaptive build** puts a **Task Estimator** first and switches the Architect, the Tester, and a
human review on the PR on only when the estimate warrants them.

The closing steps are engine automation: the **Conflicts Gate** keeps the PR mergeable with its base,
the **CI Gate** gates it on green CI (looping a fixer agent on failure), and the **Merger** scores the
PR and either auto-merges within the task's thresholds or raises a review notification.

Steps the presets leave out stay available in the builder, including the **Requirements Reviewer**
(which pauses for human approval), the **Spec Writer** and its reviewer, the **Researcher**, the
**Blueprinter**, the **Mock Builder**, and the documentation kinds. Other agent kinds include the
**Acceptance Author**, **Acceptance Test Author**, **Documenter**, the **Fixer**, a tech-debt analysis
step, and an issue/ticket tracker step. Agent kinds are an **open set**: a deployment can
[register custom kinds](../extend/custom-agents.md). You choose the pipeline (cloning a
built-in to make an editable copy, then reordering or disabling steps), and assign models through a
**model preset**. On deployments with it enabled, eligible steps can also run through
[multi-model consensus](./running-pipelines.md#multi-model-consensus).

## Interface tiers

The app has two interface tiers. **Basic** is the everyday delivery surface: plan work, run it,
review and merge it. **Advanced** keeps the full set of navigation destinations and per-run knobs.

Switch tiers from the control at the top of the sidebar. The tier resolves as the deployment's
`NUXT_PUBLIC_UI_MODE` setting, then your own browser-stored choice, then basic. While the deployment
pins a tier, the switcher is a read-only indicator rather than a preference the resolver would
silently ignore. Basic mode also starts the sidebar collapsed to an icon rail, with a per-session
override.

Hiding is bounded to overrides and to destinations outside the delivery loop, so what remains in
basic mode is exactly the default the hidden field would have shown. Surfaces on the advanced tier
include repository bootstrap, platform observability, [Reports](./budgets.md#reports), creating a
[recurring pipeline](./recurring-pipelines.md) or an [initiative](./initiatives.md), post-release
health, and [foundational services](./foundational-services.md). Nothing is removed from the board by
the tier: a live schedule still badges its task card, and an initiative is still a block.

## Tutorials

Guided tours run inside the live app. A shared coach-mark overlay anchors each step to a real
control, tells you what to click, and follows your actual clicks rather than simulating them.

On first launch the app offers a tour and remembers your answer per browser: declining stops the
prompt for good, and closing it without answering asks again next launch. Afterwards, open
**Tutorials** from the sidebar's Help section or the command palette. The catalogue lists every tour
the deployment ships, each startable, resumable, or repeatable, with progress across the catalog and a
reset that restores the first-launch experience.

A tour whose control your role, tier, or deployment does not show skips that step after a short wait,
so one tour serves every deployment shape. A tour that cannot run at all states what it is waiting on,
which is a different thing from having no applicable step. When you finish a tour, the card hands off
to whichever walkthrough your last action just made available, and a contextual offer catches a tour
whose requirements have just been met.

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
  who can see and act on its boards. Each board can be open to the whole account or restricted to an
  explicit member list, and each member holds a **Viewer**, **Member**, or **Admin** workspace role.
  See [Board access and workspace roles](./team-and-access.md#board-access-and-workspace-roles).
  Boards carry a name and description.
- Repositories and credentials are isolated **per workspace**; the LLM **budget** is metered
  account-wide (across all workspaces in the organization).

## Model presets

You assign models with **presets** under **Configuration → Model Configuration**. A preset names one
**base model** for every agent kind plus optional **per-kind overrides** (for example, a strong model
for the **Architect** and a cheaper one for the **Tester**). One preset is the workspace **default**;
every workspace seeds three built-ins (**Kimi K2.7**, **GLM-5.2**, and **Claude Opus 5**). A task picks its preset, and
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
