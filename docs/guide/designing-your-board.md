# Designing Your Board

The board is where you describe what you're building. It is also the work queue — there is no
separate backlog to keep in sync. This page covers building and organizing that structure.

## The canvas

The board is a **pannable, zoomable canvas** rendered with Vue Flow. As you zoom, the canvas uses
**semantic level-of-detail rendering** — high-level frames stay legible when zoomed out, and
detail appears as you zoom in.

## The three levels

Build top-down using the [block hierarchy](./core-concepts.md#blocks):

1. **Frames (services)** — one per deployable service, usually linked to a repository.
2. **Subframes (modules)** — major areas inside a service.
3. **Leaves (tasks)** — concrete, agent-sized units of work.

::: tip Sizing tasks
A task should be something an agent can implement and land in a single pull request. If a leaf
feels like it spans several PRs, split it into sibling leaves.
:::

## Adding and editing blocks

- **Create** a block from the canvas UI at the level you need.
- **Edit** its `title`, `description`, `status`, linked repository, and assigned model.
- **Reparent** by dragging a block onto a new parent — useful as your design evolves.
- **Delete** a block to remove it; deletion **cascades to its children**, so deleting a service
  removes its modules and tasks too.

## Dependency edges

Draw **dependency edges** between blocks to capture ordering and relationships. Edges are a
first-class part of the design — they communicate intent to your team and inform how work is
sequenced, not just visual garnish.

## Linking a repository

A service frame typically maps to one Git repository. You have three options:

- **Link an existing repository** the GitHub App can access.
- **Bootstrap a new repository** from a reference architecture (Cat-Factory creates the repo and
  force-pushes the template, then the service frame materializes on the board).
- **Reconcile** an existing repo's structure onto the board with service blueprints.

All of this is covered in [Repositories](./repositories.md).

## Assigning models

Each block can carry an assigned `modelId`. This becomes the default model for runs on that block,
though you can still override **per step** when you start a run. Use stronger models on
architecturally significant blocks and cheaper ones on routine tasks to manage
[spend](./budgets.md).

## A suggested workflow

1. Lay out **frames** for each service.
2. Fill in **modules** for the major areas.
3. Break modules into **tasks** sized for a single PR.
4. Connect **dependency edges** where order matters.
5. Link or bootstrap **repositories** on each service.
6. Move to [Requirements](./requirements.md) to make each task agent-ready.

---

Next: make your tasks unambiguous with [Requirements](./requirements.md).
