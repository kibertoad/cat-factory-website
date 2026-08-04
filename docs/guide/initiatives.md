# Initiatives

Some work is too big for a single task and a single pull request: a cross-cutting refactor, a
migration, a strangler conversion. An **initiative** plans that kind of work into an ordered set of
phases and items, then drives each item to a merged PR on its own, spawning ordinary board tasks as
it goes.

## Where an initiative sits

An initiative is a block on the board, a structural child of a service frame, alongside its modules.
The initiative owns the plan; the tasks it spawns are ordinary tasks parented under the same service
frame, linked back to the initiative. Each spawned task runs a standard pipeline with its own
requirement review, human gates, and risk policy, so an initiative never bypasses the controls you
set on normal work.

## Creating one

On a service frame, click **Create initiative** (it is on the
[advanced interface tier](./core-concepts.md#interface-tiers)). The dialog takes a **Title** (for
example, "Migrate the API to the new auth model") and an optional **Goal** describing the goal,
constraints, and rough scope. When more than one preset is available it also shows a **preset picker**
(see below), and the chosen preset may add a few fields of its own.

The same staged context picker the add-task form uses is here too, so an initiative can carry linked
requirements, RFCs, PRDs, and tracker issues from the start. All three planning agents read them. The
attachments stay visible in the initiative's inspector afterwards, so you can see the link landed and
reach the source.

Creating the initiative adds the block and an empty tracker. Nothing runs yet: you plan it next.

## Presets

A preset tailors an initiative to a recurring kind of work. It seeds the create-time form, whether
the planning interview runs, and how the plan is shaped, while everything else, the tracker,
execution loop, and follow-ups, stays exactly as described on this page. Pick one in the create
dialog:

- **Custom initiative** (the default): the open-ended flow described here. Empty form, full planning
  interview, human approval on.
- **Documentation refresh**: audit a service's documentation against its code and drive it to a full,
  current set, mostly unattended.
- **Technological migration**: swap a load-bearing technology (a database engine, a framework major,
  a runtime, or a load-bearing library) behind a behaviour-preservation safety net.

A preset can also fold **standing per-kind guidance** into the prompts of the tasks it spawns (a
coding convention for every coder it launches, a validation methodology for its testers), so its
discipline reaches the spawned runs, not just the planning run.

Beyond the three built-ins, a deployment can **register its own initiative presets** in code, the same
way it registers custom agent kinds and gates. A custom preset carries its own create-time form,
planning binding, mandated plan shape, prompt steering, and per-item spawn decoration; see
[Custom Agents & Gates](../deploy/custom-agents.md). There is no UI or config path for defining one,
because a preset can run repo-reading and agent-steering code and so is trusted like a custom kind.

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

### Technological migration

The **Technological migration** preset encodes the discipline a high-risk migration needs, so the
plan shape is mandated rather than left to the planner. Its form asks **which migration** (database
engine, framework major, runtime, load-bearing library, or other), the **From** and **To**
technologies, and optional scope, compatibility-posture, and coverage details. It runs the full
planning interview with human approval on, and plans a fixed **five-phase** methodology: map the blast
zone, pin behaviour with coverage, design the transition, deliver, then decommission the old path. The
whole-codebase impact sweep is the agent's job; a gated **confidence case** document parks for you to
challenge and approve its evidence before the swap proceeds.

## Planning: analyze, interview, approve

Start planning from the initiative's **inspector** or directly from its **board card**, which carries
a **Run planning** button and, once the interview parks for answers, an **Answer planning questions**
button (the card pulses while it waits). Both open the same **Plan initiative** pipeline, which runs
in three stages before it asks for your approval:

1. **Analyze.** An analyst reads the repository and writes a short codebase analysis that grounds
   everything after it in how the code actually looks today. It closes its report with the open
   questions only a person can answer.
2. **Interview.** The interviewer parks the run and opens a **planning window** with clarifying
   questions about scope, constraints, and priorities. It has already read the analysis and is barred
   from re-asking anything the analysis settles, so its bounded rounds are spent on what only you
   know rather than on asking you to describe your own codebase. Answer the questions, then either
   **Continue** (it may ask a follow-up round) or **Proceed to plan** to converge on what you have
   given it. Your answers are stored on the initiative.
3. **Plan.** The planner emits a structured multi-phase plan: a goal, constraints, non-goals, and a
   set of phases, each holding ordered items with dependencies and an estimate
   (complexity, risk, impact).

From the second interview round on, the planning window lists **pending questions first**, in order
within each group. The order is re-snapshotted per round, so answering one question does not reshuffle
the list under you.

The plan then waits at a **human approval gate**, presented as a document to read rather than a wall
of sections, with the same layout the step reader uses. Approve to arm execution, or request changes
to send it back for another planning round with your comments attached.

The planning run is an ordinary run of ordinary agent steps, so an initiative block gets the surfaces
a task does: the inspector's execution panel with its step list, live phases, and step-detail
drill-down, plus **Stop** and **Discard run** and the Focus view. Only the way a run starts differs:
an initiative keeps its single **Run planning** control instead of a pipeline picker.

Run metadata is shown on the planning windows, and **Delete initiative** names its real cascade: the
plan goes, and tasks it already spawned stay on the board with only their membership link detached.

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

## Phase checkpoints

A plan can mark a phase as a **checkpoint**. When every item in a checkpoint phase reaches a terminal
state, the initiative **pauses before the next phase spawns** and waits for your review, rather than
rolling straight on. A preset (or a planner following one) declares which phases are checkpoints; the
**Technological migration** preset, for example, checkpoints after its confidence-case and
transition-design work.

You review a checkpoint from the **Initiative tracker**. A checkpoint phase shows a badge that reads
**Checkpoint** while it is upcoming, **Awaiting review** while the initiative is paused at it, and
**Reviewed** once cleared. When it pauses, an amber **Paused for review** banner names the completed
phase with inline **Resume** and **Cancel** buttons: read the phase's merged PRs and committed
artifacts, then **Resume** to let the next phase spawn or **Cancel** to stop. A checkpoint fires once
and never re-pauses after you clear it, and a checkpoint phase with no items never pauses at all. You
also get a notification when the initiative parks at a checkpoint.

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
