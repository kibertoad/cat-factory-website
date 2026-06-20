# Designing Your Board

The board is where you describe what you're building. It is also the work queue, so there is no
separate backlog to keep in sync. This page covers building and organizing that structure.

## The canvas

The board is a pannable, zoomable canvas rendered with Vue Flow. As you zoom, the canvas uses
semantic level-of-detail rendering: high-level frames stay legible when zoomed out, and detail
appears as you zoom in. Service frames are resizable. Drag a frame's border to set its size, or
leave it to auto-size from its contents.

## Navigating: navbar and command bar

The left rail is a navbar grouped into Create, Repositories, Integrations, Workspace context
(the [prompt-fragment](./prompt-fragments.md) library), and Configuration. You don't drag blocks
or pipelines from a palette. Instead, a command bar (open with `⌘K` / `Ctrl-K`) is the launcher
for creating blocks and building pipelines.

The board toolbar adds an **Add service** menu to [mount a shared service](./shared-services.md)
from your org, and a service frame offers **Add task** and **Add recurring pipeline**.

**Configuration** holds two workspace-wide settings panels:

- **Default models** - pick a default model per agent kind (see [Assigning models](#assigning-models)).
- **Merge thresholds** - manage the merge-threshold presets the **Merger** step uses to decide
  auto-merge vs. raising a review.

## The three levels

Build top-down using the [block hierarchy](./core-concepts.md#blocks):

1. **Frames (services)** - one per deployable service, usually linked to a repository.
2. **Subframes (modules)** - major areas inside a service.
3. **Leaves (tasks)** - concrete, agent-sized units of work.

::: tip Sizing tasks
A task should be something an agent can implement and land in a single pull request. If a leaf
feels like it spans several PRs, split it into sibling leaves.
:::

## Adding and editing blocks

- **Create** a block from the command bar (`⌘K`) or the per-frame **Add task** / **Add module**
  controls, at the level you need.
- **Edit** its title, description, status, chosen pipeline, prompt fragments, and merge-policy
  preset in the inspector.
- **Reparent** by dragging a block onto a new parent, which is useful as your design evolves. Moving
  a task into another service's frame re-homes it onto that service.
- **Delete** a block to remove it. Deletion cascades to its children, so deleting a service
  removes its modules and tasks too.

## Dependency edges

Draw **dependency edges** between blocks to capture ordering and relationships. Edges are a
first-class part of the design, not visual garnish: they communicate intent to your team and
inform how work is sequenced.

## Linking a repository

A service frame typically maps to one Git repository. You have three options:

- **Link an existing repository** the GitHub App can access.
- **Bootstrap a new repository** from a reference architecture (Cat-Factory creates the repo and
  force-pushes the template, then the service frame materializes on the board).
- **Reconcile** an existing repo's structure onto the board with service blueprints.

All of this is covered in [Repositories](./repositories.md).

## Assigning models

Set a **default model per agent kind** under **Configuration → Default models** — for example a
strong model for the **Architect** and a cheaper one for the **Tester**. Where a kind has no
default, the deployment's routing for that kind applies, then its global default. Use stronger
models on architecturally significant kinds and cheaper ones on routine steps to manage
[spend](./budgets.md). See [Choosing models](./running-pipelines.md#choosing-models).

## A suggested workflow

1. Lay out **frames** for each service.
2. Fill in **modules** for the major areas.
3. Break modules into **tasks** sized for a single PR.
4. Connect **dependency edges** where order matters.
5. Link or bootstrap **repositories** on each service.
6. Move to [Requirements](./requirements.md) to make each task agent-ready.

---

Next: make your tasks unambiguous with [Requirements](./requirements.md).
