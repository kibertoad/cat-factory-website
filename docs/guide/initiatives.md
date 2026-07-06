# Initiatives

Some work is too big for a single task and a single pull request: a cross-cutting refactor, a
migration, a strangler conversion. An **initiative** plans that kind of work into an ordered set of
phases and items, then drives each item to a merged PR on its own, spawning ordinary board tasks as
it goes.

## Where an initiative sits

An initiative is a block on the board, a structural child of a service frame, alongside its modules.
The initiative owns the plan; the tasks it spawns are ordinary tasks parented under the same service
frame, linked back to the initiative. Each spawned task runs a standard pipeline with its own
requirement review, human gates, and merge preset, so an initiative never bypasses the controls you
set on normal work.

## Creating one

On a service frame, click **Create initiative**. The dialog takes a **Title** (for example, "Migrate
the API to the new auth model") and an optional **Goal** describing the goal, constraints, and rough
scope. When more than one preset is available it also shows a **preset picker** (see below), and the
chosen preset may add a few fields of its own. Creating the initiative adds the block and an empty
tracker. Nothing runs yet: you plan it next.

## Presets

A preset tailors an initiative to a recurring kind of work. It seeds the create-time form, whether
the planning interview runs, and how the plan is shaped, while everything else, the tracker,
execution loop, and follow-ups, stays exactly as described on this page. Pick one in the create
dialog:

- **Custom initiative** (the default): the open-ended flow described here. Empty form, full planning
  interview, human approval on.
- **Documentation refresh**: audit a service's documentation against its code and drive it to a full,
  current set, mostly unattended.

### Documentation refresh

The **Documentation refresh** preset turns the initiative into a documentation sweep. Its create form
asks what to refresh (README files, architecture and flow diagrams, in-source code comments, business
rules and domain constraints), where docs live (a single root tree or per-service in a monorepo), the
docs root and per-type directories, an optional scope note, and the writing-style guidance to apply.
It **autodetects** the repo's docs layout to prefill those paths; your edits win.

It skips the planning interview (the form is the interview) and plans a phase per documentation type
you selected, each running a lean documentation pipeline: README and diagram work through the quick
document pipeline, in-source comments through a dedicated **code-commenter** agent, business rules
through the business-documenter. Documentation PRs auto-merge on green CI. Turn on **Review each
documentation change before it merges** and each spawned task instead pauses for your approval at its
merge step.

## Planning: interview, analyze, approve

From the initiative's inspector, click **Run planning** to start the **Plan initiative** pipeline. It
runs in three stages before it asks for your approval:

1. **Interview.** The planner parks the run and opens a **planning window** with clarifying questions
   about scope, constraints, and priorities. Answer them, then either **Continue** (it may ask a
   follow-up round) or **Proceed to plan** to converge on what you have given it. Your answers are
   stored on the initiative.
2. **Analyze.** An analyst reads the repository and writes a short codebase analysis that grounds the
   plan in how the code actually looks today.
3. **Plan.** The planner emits a structured multi-phase plan: a goal, constraints, non-goals, and a
   set of phases, each holding ordered items with dependencies and an estimate
   (complexity, risk, impact).

The plan then waits at a **human approval gate**. Review the phases and items in the tracker and
approve to arm execution, or send it back for another planning round.

## Execution

Once approved, the initiative status becomes **Executing** and it works the plan on its own. The
execution loop:

- **Spawns tasks just in time.** An item becomes a real board task only when it is about to start,
  respecting each item's dependencies and the policy's **max concurrent** cap, so the board isn't
  flooded with tasks that can't run yet.
- **Picks each task's pipeline from its estimate.** The initiative carries ordered **pipeline rules**
  that match an item's complexity, risk, or impact against a pipeline (first match wins), falling back
  to a **default pipeline**. A heavier item can route to a fuller pipeline and a trivial one to a
  lighter pipeline, automatically.
- **Tracks progress back onto the plan.** As each spawned task opens and merges its PR, the item's
  status and PR link update on the tracker.

An item that gets stuck halts its phase and raises the initiative card for you to act on.

Control the run from the inspector: **Pause**, **Resume**, or **Cancel initiative**.

## The tracker

Open **Initiative tracker** to see the whole plan in one window: a progress bar and item count, the
**Goal**, **Constraints**, and **Non-goals**, the codebase analysis, each phase's items (with their
status and PR), the execution policy, and running logs of **Decisions**, **Deviations**,
**Follow-ups**, and **Known caveats**.

When the workspace has GitHub connected, the tracker is also mirrored into the target repository under
`docs/initiatives/<slug>/` as `initiative.json` (the machine-readable projection), `tracker.md` (a
readable rendering), and a small `version.json` manifest. The commits are idempotent, so an unchanged
tracker produces no commit. Without GitHub wired the feature still works; it just skips the in-repo
mirror and keeps the plan in the database.

## Follow-ups and adjusting the plan

While an initiative executes, you refine the plan from the tracker window:

- **Harvest follow-ups.** When a spawned task's coder surfaces follow-up work or a failure cause, it
  is lifted onto the tracker's follow-up list automatically.
- **Promote or dismiss.** Turn an open follow-up into a new item in a chosen phase with **Promote to
  item**, or **Dismiss** it.
- **Retry or skip items.** A blocked item can be **Retried** (it re-spawns on the next sweep) or
  **Skipped**. You can edit a pending or blocked item's title, description, estimate, pipeline, and
  dependencies.
- **Edit the policy.** Adjust **Max concurrent tasks** and the **Default pipeline** inline. The
  planner-authored routing rules are preserved; reshaping those means re-planning.

## Enablement

Initiatives are on by default on the standard Cloudflare and Node deployments. Repo write-back needs
GitHub wired for the workspace; everything else runs without it.

---

Next: turn a ready task into code with [Running Pipelines](./running-pipelines.md), or plan
document work with [Document Tasks](./documents.md).
