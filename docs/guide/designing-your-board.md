# Designing Your Board

The board is where you describe what you're building. It is also the work queue, so there is no
separate backlog to keep in sync. This page covers building and organizing that structure.

## The canvas

The board is a pannable, zoomable canvas rendered with Vue Flow. As you zoom, the canvas uses
semantic level-of-detail rendering: high-level frames stay legible when zoomed out, and detail
appears as you zoom in. Keep zooming into an in-flight task and its card grows downward, first into
its full **build-pipeline steps**, then one notch further into each step's live **subtask**
breakdown, so you can watch a run's internals spatially as you zoom. (Cards expand
only when they're on screen, and where two would overlap only the centre-most opens, so deep zoom
stays readable.)

Both **service frames and the module frames inside them are resizable**, Miro-style: drag a frame's
right or bottom edge (or its bottom-right corner) to set its size, or leave it to auto-size from its
contents. A frame never shrinks below the blocks it holds, and the size is remembered.

## Navigating: navbar and command bar

The left rail is a navbar grouped into Create, Repositories, Integrations, Workspace context
(the [prompt-fragment](./prompt-fragments.md) library), and Configuration. You don't drag blocks
or pipelines from a palette. Instead, a command bar (open with `⌘K` / `Ctrl-K`) is the launcher
for creating blocks and building pipelines.

The board toolbar adds an **Add service** menu to [mount a shared service](./shared-services.md)
from your org, and a service frame offers **Add task** and **Add recurring pipeline**.

**Configuration** holds workspace-wide settings panels:

- **Model Configuration**: manage the [model presets](#assigning-models) tasks run on.
- **Merge thresholds**: manage the merge-threshold presets the **Merger** step uses to decide
  auto-merge vs. raising a review.
- **Workspace settings**: the running-task limit and the waiting-decision escalation threshold
  (see [Workspace settings](#workspace-settings)).

## The three levels

Build top-down using the [block hierarchy](./core-concepts.md#blocks):

1. **Frames (services)**: one per deployable service, usually linked to a repository.
2. **Subframes (modules)**: major areas inside a service.
3. **Leaves (tasks)**: concrete, agent-sized units of work.

::: tip Sizing tasks
A task should be something an agent can implement and land in a single pull request. If a leaf
feels like it spans several PRs, split it into sibling leaves.
:::

## Adding and editing blocks

- **Create** a block from the command bar (`⌘K`) or the per-frame **Add task** / **Add module**
  controls, at the level you need. When you add a task, pick its **type** (**Feature**, **Bug**,
  **Document**, or **Spike**), which adjusts the form (a Bug collects severity and steps to
  reproduce, a Spike a time-box, a Document its kind) and lets the workspace cap concurrency per type.
- **Edit** its title, description, status, chosen pipeline, prompt fragments, merge-policy preset,
  and (on a task) its [responsible product person](./team-and-access.md#the-responsible-product-person)
  in the inspector.
- **Reparent** by dragging a block onto a new parent, which is useful as your design evolves. Moving
  a task into another service's frame re-homes it onto that service.
- **Delete** a block to remove it. Deletion is **optimistic** (the block disappears at once and
  only reappears, with an error toast, if the backend rejects it) and **idempotent**, so deleting a
  block whose row is already half-gone cleans up the leftovers instead of erroring. Deletion cascades
  to children, so deleting a service removes its modules and tasks too.

## Epics and dependency edges

Beyond the parent/child hierarchy, two relationships connect tasks across the board.

**Dependency edges** capture ordering. Drag from the handle on a task card to another task to draw a
"depends on" edge, and Cat Factory enforces it:

- A task **won't start** while any task it depends on is still unfinished; the start button reports
  what it's waiting on instead of launching.
- An edge that would **close a cycle** is rejected, so the graph stays runnable.
- Turn on **Auto-start dependents** (task inspector) and, when this task merges, the engine starts
  the tasks that depend on it automatically. Dependents pinned to an individual-usage model are
  skipped, since those need someone present to unlock the credential.

**Epics** group related tasks that span services or modules. Membership is a tag rather than a
container, so an epic can pull in tasks from several frames, and deleting the epic clears the
grouping without deleting the tasks. Importing a Jira epic or a GitHub parent issue can create the
epic and all its child tasks at once, seeding dependency edges from the issues' "blocked by" links
(see [Issue & Document Sources](./issue-sources.md)).

## Linking a repository

A service frame typically maps to one Git repository. You have three options:

- **Link an existing repository** the GitHub App can access.
- **Bootstrap a new repository** from a reference architecture: you create the empty repo on
  GitHub (or an org can let the privileged App tier create it), Cat Factory force-pushes the
  template into it, then the service frame materializes on the board.
- **Reconcile** an existing repo's structure onto the board with service blueprints.

All of this is covered in [Repositories](./repositories.md).

## Assigning models

Models are assigned through **presets** under **Configuration → Model Configuration**. A preset sets a **base model** for every agent kind plus optional **per-kind overrides**,
so you can point the **Architect** at a stronger model while everything else stays on the base. One
preset is the workspace **default** (every workspace seeds **Kimi K2.7** and **GLM-5.2** to start),
and a task picks the preset it runs on in its inspector. Use stronger models on architecturally
significant kinds and cheaper ones on routine steps to manage [spend](./budgets.md). See
[Choosing models](./running-pipelines.md#choosing-models).

## Workspace settings

**Configuration → Workspace settings** holds two team-wide controls:

- **Running tasks per service**: cap how many tasks may run concurrently under one service frame.
  Choose **No limit**, a single **shared** cap across all task types, or a **per-type** cap (a
  separate number for Feature, Bug, Document, and Spike). Starting a task that would exceed the cap is
  refused until a running task finishes, so a busy service doesn't fan out more agents than you want.
- **Waiting for a human**: how many minutes a run may sit parked on a decision before its inbox
  notification escalates to red and is flagged **Overdue** (default 120). Parked runs are never
  cancelled; the escalation just makes a neglected decision more visible.

## A suggested workflow

1. Lay out **frames** for each service.
2. Fill in **modules** for the major areas.
3. Break modules into **tasks** sized for a single PR.
4. Connect **dependency edges** where order matters.
5. Link or bootstrap **repositories** on each service.
6. Move to [Requirements](./requirements.md) to make each task agent-ready.

---

Next: make your tasks unambiguous with [Requirements](./requirements.md).
