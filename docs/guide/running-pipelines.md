# Running Pipelines

A **pipeline** is an ordered chain of agent steps that takes a task from plan to merged pull
request. This page covers starting a run, choosing a model, and steering the run through its decision points.

## Anatomy of a pipeline

The default **Full build** pipeline runs these steps in order:

```
Requirements Reviewer → Spec Writer → Spec Reviewer → Architect → Researcher → Coder
  → Reviewer → Code Commenter → Blueprinter → Mock Builder → Tester → Conflicts Gate → CI Gate → Merger
```

| Step | What it does |
| --- | --- |
| **Requirements Reviewer** | Reviews the collected requirements for gaps; pauses for human approval. |
| **Spec Writer** | Aggregates tasks into the service's in-repo [spec](./requirements.md#the-unified-in-repo-spec) + Gherkin, on a shared work branch before the design. |
| **Spec Reviewer** | The Spec Writer's companion. Rates the spec and loops the writer back below threshold (no human gate). |
| **Architect** | Designs the approach against the just-written spec; pauses for human approval. |
| **Researcher** | Investigates prior art, libraries, and constraints. |
| **Coder** | Clones the repo and writes the implementation. |
| **Reviewer** | The Coder's companion. Rates the change and loops it back for rework below threshold, **immediately after the Coder**, so review happens on fresh code before the map/test tail. |
| **Code Commenter** | Comment-only pass that keeps in-source comments accurate: adds why-not-what comments, fixes ones that have drifted from the code, and removes noise, with no behaviour change. Amends the Coder's open PR in place. |
| **Blueprinter** | Refreshes the service → modules → features map in-repo from the new code. |
| **Mock Builder** | Stands up WireMock mocks for external services and the compose wiring so the suite runs locally. |
| **Tester** | Runs the software against the mocks and the spec's acceptance scenarios and reports what it observed. |
| **Conflicts Gate** | Keeps the PR mergeable with its base, looping a resolver agent on conflicts. |
| **CI Gate** | Gates the PR on green CI, looping a CI Fixer agent on failure. |
| **Merger** | Scores the PR and auto-merges within thresholds, or raises a review notification. |

The **Spec Writer** runs before the **Architect** so the design is built against a written spec, and
the spec itself is not human-gated: its **Spec Reviewer** companion handles quality by looping the
writer back automatically. See [Requirements](./requirements.md) for the spec and the review loop.

The Full build and Complex fullstack pipelines also carry two opt-in **brainstorm** steps,
**disabled by default**: a **Requirements brainstorm** before the requirements review and an
**Architecture brainstorm** before the Architect. Each proposes options with trade-offs and parks for
you to converge on a direction, then hands that direction to the step it precedes. Toggle one on for a
cloned pipeline when you want to explore the space first. See
[Brainstorming a direction first](./requirements.md#brainstorming-a-direction-first).

Other built-in pipelines each new workspace seeds:

| Pipeline | What it's for |
| --- | --- |
| **Simple** | The leanest end-to-end build: Coder → Reviewer → Mock Builder → Tester, then the standard Conflicts → CI → Merger tail. No design, spec, or documentation phases. |
| **Quick implement** | Coder → Blueprinter → Mock Builder → Tester, then the merge tail, with no Reviewer and no design/spec phases. |
| **Triage & fix bug** | A bug-fix front end: a read-only **Bug Investigator** explores the repo from the raw report, then a **Clarity Review** gate triages the report for *fixability* before the Coder runs. See below. |
| **Build & human-test** | Coder → Reviewer, then a **human-test** gate that stands up a live environment and parks for a person to validate before the merge tail. Opt-in (it needs someone present). See [Human-testing a change](#human-testing-a-change). |
| **Build & PR review** | Adds an opt-in **Human Review** gate before the merge: the run waits for a human code review on the PR and loops the Fixer to address feedback. See [Human review on the pull request](#human-review-on-the-pull-request). |
| **Build & visual confirmation** | Experimental. A UI-focused build whose **UI Tester** screenshots each screen, then a **Visual Confirmation** gate parks for a person to compare them against the uploaded reference designs. See [Visual confirmation](#visual-confirmation). |
| **Author a document** / **Quick document** | A forward-authoring track that produces an in-repo Markdown document (PRD, RFC, ADR, design, runbook, …) shipped as a pull request. See [Authoring a document](#authoring-a-document). |
| **Ralph loop** | A single persistent coding step that retries against your validation command until it passes, then gates and ships the PR (`ralph → Conflicts → CI → Merger`). The default for a Ralph-loop task. See [The Ralph loop](#the-ralph-loop). |
| **Run a spike** / **Run a spike (direct commit)** | A timeboxed read-only investigation that answers a research question and delivers a `docs/research/<slug>.md` findings document. The default variant ships it as a PR through the review/merge tail; the direct-commit variant writes it straight to the base branch with no PR. The default for a Spike task. |
| **Review a pull request** | A read-only deep review of an open PR that returns prioritized findings; it writes no code and opens no PR. The default for a [Review task](./pull-requests.md#deep-reviewing-an-existing-pull-request). |
| **Complex fullstack feature** | The fullest pipeline: adds a Researcher, the Playwright e2e author, and business/feature documenters around the Full-build core. |
| **Map service** | Blueprint only. Run after bootstrapping to reconcile a repo onto the board. |
| **Write spec** | Spec Writer only. Regenerate a service's in-repo spec on its own. |
| **Improve code comments** | Code Commenter only, then the merge tail. Run standalone to refresh a repo's in-source comments; here it opens its own PR. |
| **Integrate & ship** | Integrator → Mock Builder → Tester → Documenter, for wiring an existing change through. |
| **Dependency updates** / **Tech debt** | The recurring presets (see [Recurring Pipelines](./recurring-pipelines.md)). |

Additional agent kinds include the **Fixer** (loops on failing tests inside the Tester gate),
**Bug Investigator**, **Playwright** (runnable e2e tests from the spec's acceptance scenarios),
**Documenter**, **Integrator**, a tech-debt analysis step, and a **Skill** step that runs a
repo-sourced [Claude Skill](./skills.md) picked per step; a deployment can also
[register its own agent kinds and pipelines](../deploy/custom-agents.md).

### Pipeline purpose and task-type scoping

Every pipeline carries a **purpose**: **Build**, **Documentation**, **Review**, **Research**, or
**Planning**. The purpose narrows which pipelines a task can pick and which agents the builder offers:

- A **Document** task is offered only Documentation pipelines, and a **Review** task only the
  Review pipeline. Every other task type sees all pipelines. A pipeline with no purpose set is hidden
  from Document and Review tasks and shown for the rest.
- In the builder, a non-Build purpose hides the Implementation and Testing agent categories from the
  palette, since those pipelines write no code and run no tests. Leaving implementation or testing
  steps on such a pipeline raises a warning to remove them or switch the purpose back to Build.

Set the purpose (and a description) on a cloned pipeline in the builder.

### Previewing a pipeline before you pick it

The pipeline picker in the add-task form and the inspector's Run settings is a master-detail list:
hover a pipeline to see its description and its ordered steps as labeled chips, with a shield icon on
any step that pauses for human approval, before you commit to it. Disabled-by-default steps are left
out of the preview. A custom pipeline's description is editable in the builder ("shown when picking
this pipeline"), so the pipelines you author explain themselves at selection time.

### Triaging and fixing a bug

The **Triage & fix bug** pipeline is built for a bug report rather than a feature brief:

- The **Bug Investigator** is a read-only agent that clones the repo, reads the code against the raw
  report, and returns an enriched report, plus an *optional* working hypothesis, which it omits
  unless reasonably confident so a weak guess never misdirects the fix. It commits nothing and opens
  no PR.
- The **Clarity Review** gate then triages the report for whether it is actually *fixable*: are
  there repro steps, expected-vs-actual behaviour, the environment, and the affected area? It runs
  the same iterative answer → incorporate → re-review loop as the [requirements
  reviewer](./requirements.md#the-review-loop), and the converged, clarified report becomes the task
  description the Coder builds from.

Hover any step in the builder, the draft chain, or a board task card to see what that agent does:
each kind's description shows as a tooltip.

### The Ralph loop

A **Ralph loop** task runs a single coding step that retries until a command you supply passes, for
work whose "done" is a check rather than a review: get the suite green, make the typechecker pass,
port a batch of call sites. Create a task of type **Ralph loop**, put the spec in the description, and
set two knobs in the inspector's **Agent configuration** panel:

- **Validation command**: the shell command run in the checkout after each iteration (for example
  `pnpm test && pnpm typecheck`). Exit 0 means done.
- **Max iterations**: the anti-runaway budget (default 10).

Each iteration is a fresh-context container run that works the spec, commits, and pushes; the harness
then runs the validation command. On exit 0 the step completes and the PR flows through the standard
Conflicts, CI, and Merger tail. On a non-zero exit with budget left, a new iteration starts with the
previous validation output threaded in as feedback. When the budget is spent without passing, the run
raises a decision notification and hands off to you rather than looping forever. The loop keeps an
append-only progress log and survives restarts, and it opens the PR on the first iteration and amends
the same branch on later ones. Its `pl_ralph` pipeline is the default for a Ralph-loop task.

### Human-testing a change

The **human-test** gate puts a person in the loop before a change merges. When the run reaches it,
Cat Factory spins up an [ephemeral environment](../deploy/environments.md), surfaces its live URL,
and **parks** the run (the task shows "Awaiting your validation") until you act on it. It ships as
the opt-in **Build & human-test** pipeline (Coder → Reviewer → human-test → the standard Conflicts →
CI → Merger tail), and you can add the step to any custom pipeline.

Open the gate's window to validate the change against the live URL, then choose an action:

- **Confirm** — the change passes, the environment is torn down, and the run advances to the merge
  tail.
- **Submit findings** — describe what's wrong and Cat Factory dispatches the Tester's **Fixer** to
  address it, then re-parks for another look.
- **Pull main + redeploy** — pull the latest `main` into the branch (looping the conflict resolver
  if needed) and redeploy, so you test against current code.
- **Recreate** or **Destroy** the environment.

It also raises a **human-test-ready** notification (in-app and, if connected, Slack) so the right
person knows the change is waiting. The gate needs someone present, which is why it isn't in the
always-on default pipelines. If no ephemeral-environment provider is wired, it falls back to a
degraded manual mode: it still parks for your confirmation but stands up no live URL and the
environment actions are disabled.

### Human review on the pull request

The **Human Review** gate puts a required human code review in the pipeline. It ships as the opt-in
**Build & PR review** pipeline (Coder → Reviewer → Blueprinter → Mock Builder → Tester → Conflicts →
CI → Human Review → Merger), and you can add the `human-review` step to any custom pipeline.

This gate waits for a *person's* GitHub approval during a build. To turn Cat Factory's own agent loose
on a pull request that already exists, use a
[Review task](./pull-requests.md#deep-reviewing-an-existing-pull-request) instead.

When a run reaches it, the gate watches the task's pull request on GitHub:

- It advances once the PR meets GitHub's required approvals (read from branch protection) with no
  unresolved review threads.
- On outstanding review threads it dispatches the **Fixer** to address the feedback (immediately once
  the PR is approved; after a per-task grace window otherwise) and resolves each handled thread so the
  next check sees it cleared. A reviewer re-opening a thread re-triggers the Fixer.
- It waits indefinitely for the human, re-arming rather than auto-failing, and raises a
  **human-review** notification while it waits.
- From the gate window a person can request a freeform fix at any time, dispatched immediately.

The grace window is the per-task **human-review grace** risk-policy knob. The gate is opt-in (it
needs a real reviewer and a wired PR-review provider) and passes through when unwired, which is why
it isn't in the always-on default pipelines.

### Visual confirmation

::: warning Experimental
The **Build & visual confirmation** pipeline is flagged experimental in the library. The UI Tester's
automatic screenshot capture is not wired end to end yet, so today the **Visual Confirmation** gate
runs in manual mode: a person uploads the reference designs and the screenshots and reviews them.
:::

This UI-focused pipeline runs Coder → Reviewer → Mock Builder → **UI Tester** → **Visual
Confirmation** → the standard Conflicts → CI → Merger tail. A visual pipeline like this runs only on a
**frontend** frame (or a frame a frontend binds to); the UI Tester builds that frontend, wires it to
the backend under test and mocks other upstreams, and drives it in a real browser. See
[Frontend Previews & UI Testing](./frontend-preview.md) for the frontend configuration this uses. The
UI Tester captures a screenshot of each distinct view; the Visual Confirmation gate pairs those
screenshots with the uploaded reference designs by view and **parks** for a person to compare actual
against reference. From the gate you can:

- **Approve** — the change matches; the run advances to the merge tail.
- **Request a fix** — describe what's off and the Tester's **Fixer** addresses it, then the gate
  re-parks for another look.
- **Recapture** — re-run the UI Tester to refresh the screenshots.

It raises a **visual-confirmation-ready** notification and needs a binary-artifact store for the
screenshots; the gate passes through when no store is wired. The store is configured per account under
Account → Deployment settings (see
[Content storage](../deploy/configuration.md#content-storage-binary-artifacts)).

### Authoring a document

The document track produces a **new in-repo Markdown document** shipped as a pull request, the
forward counterpart to the reverse-documentation agents (Documenter, Blueprinter) that describe
existing code. Two pipelines seed it:

- **Author a document**: doc-researcher → doc-outliner (**human gate** on the outline) → doc-writer →
  doc-reviewer (an AI review loop, then a **human gate** on the converged draft) → doc-finalizer →
  Conflicts → CI → Merger.
- **Quick document**: doc-writer → doc-reviewer → the merge tail, for a small or low-stakes doc, so
  even a quick doc can't merge over a conflict or a red build.

A document task carries a **document kind** (PRD, RFC, ADR, design, technical reference, API,
runbook, research report, or reference) plus optional **audience**, **target path**, and **outline
hints**, which steer the doc agents' prompts. The doc-writer branches off base, writes the Markdown,
and opens the PR through the same coding harness the Coder uses; the doc-finalizer polishes on the PR
branch. The committed Markdown is the durable artifact, so no new storage is involved.

### Coder follow-ups

As the Coder works it streams **forward-looking items** it noticed but did not act on: loose ends and
side-tasks (**follow-ups**) and clarifications it raised mid-run (**questions**). A blinking
**Follow-up** companion on the Coder step surfaces each item the moment it appears. The pipeline's
**later steps don't start** until every item is decided, so nothing builds on an unresolved loose end.

For each item you can:

- **File** a follow-up as a tracker issue (it records the issue link).
- **Send it back** to the Coder to handle now (it folds into the Coder's next loop-back as rework).
- **Answer** a question (the Q&A folds into the next loop-back).
- **Dismiss** it as not worth acting on.

Once everything is decided, the Coder loops once more for any sent-back follow-ups and answered
questions, then the pipeline advances. The companion is **on per Coder step** and can be disabled for
a step in the pipeline builder.

### Choosing an implementation approach

Some tasks can be built in materially different ways (patch the call site versus refactor the seam,
migrate the schema versus adapt the mapper), and that choice is often a judgement call worth making
before any code is written. The Coder step can run an **implementation-fork decision** phase for
exactly this: a read-only proposer surfaces the distinct approaches first, the run **parks**, and your
choice is folded into the Coder's prompt as a binding directive.

At the park, a **Choose an implementation approach** window shows a card per approach, each with its
summary, concrete plan, tradeoffs, and risk notes, one marked **Recommended**. You can:

- **Pick** a proposed approach (optionally with a steering note),
- **Enter your own** free-text approach, or
- **Ask about these approaches** in a grounded Q&A thread before deciding (bounded to a set number
  of questions).

Click **Use this approach** and the Coder runs with it. On the pipeline the Coder step shows
"Proposing approaches…" while the proposer runs and a **Choose an approach** button when it parks, and
a **fork-decision-pending** notification (in-app and Slack) is raised.

Control it per task in the inspector's **Agent configuration** panel: `coder.forkDecision` is **Auto**
(the default), **Always propose**, or **Off**. In **Auto** it triggers only when the task's estimate
clears the fork-decision thresholds on the workspace [risk policy](./designing-your-board.md#navigating-navbar-and-command-bar)
(disabled by default), so light tasks skip it. If the proposer finds only one sensible approach it
doesn't park. The setting is editable until the Coder step starts, then frozen. Today it is scoped to
single-repo (primary-repo) tasks.

## Handing a task existing branches

By default a run starts from the repo's default branch and works in a branch it mints for the task.
You can instead point a run at branches that already exist, from the **Existing branches** picker in
the task inspector's **Run settings** (it needs the workspace's GitHub App connected). Add a branch
and pick its mode:

- **Reference**: read-only context. The agents may read its history and diff to learn from a spike or
  prototype, but never commit to it. A task can attach several; a missing one is dropped with a
  warning.
- **Working**: the branch the run builds **inside**. The run starts from it and keeps committing to
  it instead of a minted branch, and the PR, CI gate, and merger all ride it. At most one per task,
  and the branch must already exist (the run fails loudly if it's missing, since it's the starting
  point).

Promoting a branch to Working demotes any existing Working branch back to Reference. The controls
enforce the rest as they go: the Working branch is locked once a PR exists, Working mode is
unavailable on a task that spans more than one service, the base branch can't be a Working branch, and
a protected Working branch shows a warning that pushes may be rejected. A merged Working branch is
never auto-deleted, so reusing it on a new task **resumes** it.

## Editing pipelines

![The pipeline builder: a categorized agent palette on the left, the pipeline draft in the middle, and the library of built-in pipelines (Full build, Simple, Triage & fix bug, and more) with their step counts and default badges on the right](/images/app/pipeline-builder.webp)

The built-in pipelines are read-only templates, but you can shape your own:

- **Clone** any pipeline, built-in or custom, into a new editable copy. This is how a read-only
  default becomes a starting point you can change.
- **Edit** a custom pipeline in place: reorder, add, or remove steps. Built-in pipelines carry a
  **default** badge and offer Clone instead of Edit.
- **Disable a step** without deleting it. A disabled step stays in the saved pipeline but is skipped
  at run start, so you can drop, say, the Researcher for a run without rebuilding the chain. At least
  one step must stay enabled.

On app open, a startup check surfaces pipelines that need attention: a custom pipeline that
references an agent kind that no longer exists or has an invalid shape (offered for deletion), a
built-in with an invalid shape (offered a reseed), and a built-in whose seeded definition has moved
ahead of your stored copy (offered a reseed to adopt it). **Reseeding** a built-in restores its
canonical definition while preserving your labels and archive state.

In the builder, the agent palette is grouped into collapsible categories (**Review & triage**,
**Design & research**, **Implementation**, **Testing**, **Documentation**, and
**Gates & observability**), with any custom kinds in a trailing bucket, so a long catalog stays
navigable. You can also tag a pipeline with **labels** and **archive** ones you no longer run to keep
the list focused; archiving hides a pipeline without deleting it.

## Estimating and gating expensive steps

The **Task Estimator** is an agent kind you can add early in a pipeline. After requirements are
clarified, it scores the task on three 0–100% axes (**complexity**, **risk**, and **impact**) and
shows them as a small estimate badge in the task inspector, with the model's rationale.

That estimate lets you **gate** expensive companion steps so they run only when the work warrants it.
On a companion (the Coder's Reviewer, the Architect's or Spec Writer's reviewer, or the Tester's
quality companion), open its gate controls and set minimum thresholds on any of the axes. The companion then runs only when the
estimate meets a threshold and is skipped otherwise, so light tasks bypass a full quality review
while risky ones still get one. A gated companion needs a **Task Estimator** earlier in the same
pipeline to have an estimate to consult, and must set at least one threshold (otherwise it would
always skip).

## Multi-model consensus

On deployments where [consensus is enabled](../deploy/configuration.md#feature-toggles), you can run
certain steps through more than one model and reconcile the results instead of trusting a single
pass. In the builder, eligible steps (**Architect**, **Researcher/analysis**, **Reviewer**, and the
**Task Estimator**) gain an **Enable Consensus** toggle with three strategies:

- **Specialist panel**: several models reason in parallel under assigned roles, then a synthesizer
  combines them.
- **Debate**: models draft, critique, and refine over a set number of rounds (1–5).
- **Ranked voting**: models score candidates against a rubric and the scores are aggregated.

You define the participants (each a role plus an optional model) and an optional synthesizer model.
Consensus can itself be gated on the task estimate, so it only kicks in on risky or high-impact work.
The step returns output in the same shape as the single-model version, and the full transcript
(each contribution, the synthesis, a confidence score, and any unresolved dissent) is viewable from
the step. Consensus only applies to the eligible kinds; other steps run normally even if a config is
present.

## Starting a run

From a selected block, start a run:

1. **Choose a pipeline** appropriate to the task.
2. **Confirm the spend estimate** against your remaining [budget](./budgets.md).
3. **Launch**: the run is created and begins streaming progress.

If your workspace caps [running tasks per service](./designing-your-board.md#workspace-settings) and
the service is already at its limit, starting another task there is refused with a clear message
until a running task finishes. If a task's **Run** control is disabled because it still has unfinished
dependencies, an amber hint names them, so you can see what has to land first.

Each agent runs on its kind's default model; see [Choosing models](#choosing-models) below.

::: tip Personal subscriptions ask for a password once
If a step uses a model from a personal (individual-usage) subscription such as Claude, GLM, or
Codex, Cat Factory asks for your personal password to unlock your credential. After the first
unlock it is cached in your browser for a few hours, so subsequent starts, retries, and approvals
don't re-prompt. The password is about using *your own* credential on purpose.
See [Model Providers & Subscriptions](./model-providers.md#why-a-personal-password).
:::

## Choosing models

Models are assigned through **presets**, managed in **Configuration → Model Configuration**:

- A **preset** sets one **base model** for every agent kind, plus optional **per-kind overrides** to
  point a single kind (say, the **Architect**) at a stronger model.
- One preset is the workspace **default**; every workspace seeds three built-ins, **Kimi K2.7**,
  **GLM-5.2**, and **Claude Opus 4.8**. A task selects which preset it runs on (in the new-task form
  or its inspector), and changing the preset only affects steps that haven't started yet.

The picker shows each model's list price next to its provider and context window (quota-based
subscription models show their quota burn rate instead), so you can weigh cost as you assign kinds.
Reserve stronger (and pricier) models for architecturally significant kinds and keep cheaper ones on
routine steps to manage [spend](./budgets.md).

## Watching progress live

Runs stream over WebSockets, so there's no polling. As the run executes you'll see:

- Each step transition (**Pending → Working → Done**).
- A live **elapsed clock** on the running step (both in the pipeline view and the inspector), so a
  step that hasn't emitted subtasks yet reads as working rather than hung; a finished step shows its
  frozen total.
- **Subtask** updates within a step.
- **Decision prompts** when an agent needs you.
- **Failures**, with the captured error for diagnosis.
- **Spend notifications** as model calls are metered.

Every board and run share one live connection, so progress appears the moment the dashboard is
open.

**Companion steps** (the Spec Reviewer, the Architect's reviewer, the Coder's Reviewer, and the
Tester's Fixer) render as distinct sub-nodes on their parent step, so you can see a companion rate,
rework, or skip rather than wondering why a step looped.

## Reading the test report

The **Tester** does hands-on work: it stands up the Mock Builder's mocks, runs the software, and
greenlights only on behaviour it actually observed, starting from the spec's Gherkin acceptance
scenarios and probing edge and error cases. Open its step to get a structured **test-report window**
that lays out the scenarios it exercised, the per-area outcomes, any concerns it linked, and the
greenlight verdict, plus the state of any **Fixer** attempt. When the tests fail, the Fixer
companion runs inside the Tester gate to fix them and is skipped when they pass.

The Tester records a discrete **outcome for every area it lists as tested** (passed, failed, or
skipped, each with a concrete detail), so a report can't claim a broad set of scenarios and then show
only one happy-path result. A failed outcome forces a non-greenlight; a scenario the Tester chose not
to run is recorded as `skipped` with a reason rather than dropped.

### The test quality companion

A **test quality companion** audits the Tester's report for coverage before the greenlight, the way
the Reviewer audits the Coder's change. After the Tester reports, the companion checks that every
tested area has a real outcome, that edge cases aren't skipped, and that acceptance scenarios are
reflected. If it finds gaps and budget remains, it **loops the Tester** for a focused additional pass
with the gaps folded in; if the report is adequate it passes straight through. It reviews only reports
that would otherwise conclude the step, never ones already headed to the Fixer, and it never spends
the Fixer's budget.

Its verdicts render in a **Coverage review** section of the test-report window: each pass shows
"Coverage adequate" or "Coverage gaps found" with the gaps to close, the model, and a re-run counter.
The companion is **on per Tester step** and can be disabled for a step in the pipeline builder. Its
re-run cap is the per-task **`maxTesterQualityIterations`** risk-policy knob (default **3**).

## Responding to decision prompts

When a step needs human input it moves to **Needs decision** and shows a **decision prompt**.
Answer the questions to continue. The most common prompts are the **Requirements Reviewer** and the
**Architect**, which pause for your approval before implementation proceeds.

A second kind of prompt comes from a **companion that has spent its automatic rework budget**. When
the Spec Reviewer, the Coder's Reviewer, or the Architect's companion can't get the producer above
its quality bar within the allowed retries, it stops auto-looping and parks for you with a **Decide**
button (rather than a plain Approve) offering three choices, the same three the requirements
reviewer offers at its iteration cap:

- **One more round**: raise the budget by one and loop the producer back for another pass.
- **Proceed anyway**: accept the producer's current output and advance the pipeline.
- **Stop & reset**: cancel the run and return the task to phase zero (editable), with the
  producer's latest output preserved on its branch.

A run parked on a decision waits as long as it needs; it is never cancelled for taking too long.
Instead, its inbox notification turns red and is flagged **Overdue** once it has waited past the
workspace's escalation threshold, so an unattended decision gets louder rather than silently
expiring. Set that threshold under [Workspace settings](./designing-your-board.md#workspace-settings).

## Durability, failures, and retries

Runs are checkpointed and resumable: each completed step is durably recorded by Cloudflare Workflows
(or pg-boss on Node.js). Container work commits to a dedicated branch per task, and the harness
pushes periodic checkpoints, so an evicted or retried run resumes on the same branch instead of
starting over. A live no-progress guard ends a run early with a diagnostic if the agent thrashes
without editing files.

Cat Factory also owns the Git delivery contract: the agent commits its own work and validates
locally, while the harness pushes the branch and opens the pull request, so a container agent
never needs push credentials. Your existing CI/CD takes it from there. If a step fails, the
error is captured and the run surfaces a manual retry from the failure point. The board shows the
**real failure reason** (the agent's actual error, with the raw detail under "Show detail").

### Retry, restart, stop, and reset

You have four distinct controls over a run:

- **Retry** resumes a failed run at its **first failed step**, reusing the same branch and PR.
- **Restart from here** rewinds to a **step you pick** and re-runs the pipeline from there onward,
  even on a finished run. The steps before it are preserved verbatim, so their outputs still reach
  the restarted step as context; the chosen step and every later step have their iteration counters
  (companion attempts, gate/test attempts) reset. Use it to re-run work that already completed. The
  control appears on the step-detail overlay, on each step in the zoomed-in pipeline timeline, and in
  the dedicated result windows (test report, CI/Conflicts gate, requirements review), and is
  keyboard- and touch-reachable, not hover-only. As with start and retry, restarting a step that uses
  a personal subscription prompts for your password.
- **Stop** halts the run but **keeps it**: the run stays readable and retryable and the block goes
  *blocked*. Stopping asks you to confirm first (from the board card or the inspector), since it kills
  the running container; nothing is discarded and the run can be retried.
- **Reset** is the explicit destructive action: it discards the run and returns the task to
  *planned*.

### Watching the gates

The **CI** and **Conflicts** gates open a dedicated **gate window** when you click into them, so you
can see *why* a gate is looping rather than a bare prose panel: the verdict, the gated commit, the
helper's remaining attempt budget, and (for CI) exactly which checks failed. Each gate's helper
(the **CI Fixer** / **Conflict Resolver**) renders as a sub-node that reads possible / running /
completed / skipped, the same as the Tester's Fixer.

Each helper attempt shows both sides of the round: **Handed to the fixer** (the fixing instructions it
was given, and for CI the failing checks snapshotted at dispatch) and the **Fixer report** it returned,
alongside the outcome and timestamp. The conflicts gate hands no textual instructions (GitHub reports
mergeability as a single bit), so it shows the outcome without an instructions block.

::: tip Web research
When [web search is configured](../deploy/configuration.md#web-search) on the deployment, container
agents (the **Coder**, **CI Fixer**, …) get web-search and web-fetch tools through a backend proxy,
and the inline **Architect** / **Researcher** agents can use their provider's hosted web search. Both
are opt-in and no-op until configured.
:::

## Run lifecycle

```
Running → (Needs you ⇄ Running)* → Completed | Paused (budget) | Failed
```

A run shows **Needs you** while paused on a human decision, **Paused (budget)** when stopped at the
budget cap, and **Completed** once the agents finish and a pull request is ready for your review.

---

Next: review and merge what the agents produced in [Pull Requests](./pull-requests.md).
