# Shared Services

A **service** - a service frame plus its modules, tasks, linked repository, runs, and sync - is
owned by your **account (organization)**, not by a single workspace. A workspace is a curated
view that **mounts** the services it cares about. The same service can be mounted onto several
teams' boards at once, where it is one shared subtree rather than a copy.

## Why services are account-owned

Large orgs run many teams against the same set of services. Cat-Factory models that directly:

- There is **one physical copy** of a service's blocks, keyed by service. Every board that mounts
  it reads the same task list and the same state.
- An edit on one board, whether adding a task, moving work to `done`, or a run finishing, writes the
  same row every other mounting board reads, so boards never drift.
- A connected repository is synced once per org rather than once per workspace, so mounting a
  service on a second team's board adds no extra GitHub traffic.

## Mounting a service onto a board

Every top-level service frame you create is automatically registered as an account-owned service
and mounted onto the board you created it on. To bring an **existing** org service onto another
board:

1. Open the **Add service** menu in the board toolbar.
2. Pick a service from your org's **catalog**, the list of services any of your workspaces own.
3. It mounts onto the current board and its full subtree (frame → modules → tasks) renders
   immediately.

Each catalog entry shows a **mount count**, and a frame mounted on more than one board carries a
**Shared** badge so it's obvious the work is visible to other teams.

## Per-board layout

Only a service frame's **board position and size** are per-workspace, carried on the *mount*, not
the block. Drag a shared frame on one board and it stays put on the others. The task and module
positions **inside** the frame are part of the shared subtree, so everyone sees the same internal
layout.

## Unmounting

**Unmounting** removes a service from the current board only. It never deletes the service or its
work; the service stays in the org catalog and on every other board that mounts it. Deleting a
service *frame* (rather than unmounting) drops the account-owned service and every workspace's
mount of it.

## Live updates across boards

A change to a shared service, such as run progress, a bootstrap, or a notification, is fanned out to
every workspace that mounts it, live over the same stream used for any board update. You don't need
to reload to see another team's run advance on a service you both mount.

## Recurring schedules on a shared service

A [recurring pipeline](./recurring-pipelines.md) attached to a shared service is **visible on every
board that mounts it**, and its reused on-board task block renders on each. The schedule is a single
record, so it **fires once per org**, not once per mounting workspace.

---

Next: automate routine work with [Recurring Pipelines](./recurring-pipelines.md).
