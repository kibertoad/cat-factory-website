# Run a Pipeline

For whoever is about to turn a planned task into a pull request and wants to know what happens
between the two. It covers starting the run, the models it spends on, watching it live, and every
point at which it stops and asks you something. Picking the chain of steps in the first place, and
editing one, is [Choose and Edit a Pipeline](./choosing-a-pipeline.md).

## Starting a run

From a selected block, start a run:

1. **Choose a pipeline** appropriate to the task (see
   [Choose and Edit a Pipeline](./choosing-a-pipeline.md)).
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
See [Connect a Model Provider → Why a personal password](./model-providers.md#why-a-personal-password).
:::

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

## Choosing models

Models are assigned through **presets**, managed in **Configuration → Model Configuration**:

- A **preset** sets one **base model** for every agent kind, plus optional **per-kind overrides** to
  point a single kind (say, the **Architect**) at a stronger model.
- One preset is the workspace **default**; every workspace seeds four built-ins, **Kimi K2.7**,
  **GLM-5.2**, **Claude Opus 5** and **GPT-5.6 Sol**. A task selects which preset it runs on (in the
  new-task form or its inspector), and changing the preset only affects steps that haven't started
  yet.

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

### Reading a companion's verdict

Each grading round gets its own card rather than being appended to the score line. A card carries the
rating against the step's bar, a short verdict on the work as a whole, and then the findings
themselves: one entry per point, tagged **Must fix**, **Should fix** or **Minor**, worst first, each
a short bolded title plus the concrete change to make. You can tell what blocks the work from what is
a nit without reading all of it.

Those tags are not only for you to read. **A run does not advance while a Must fix is open**,
whatever the rating says. A rating is one number over a whole deliverable, so a review can score work
above its bar and still have named something that must not ship; when it does, the producer is sent
back to fix it rather than the pipeline moving on. The rating decides everything else: at or above
the bar with nothing must-fix outstanding, the run continues.

Every round is handed the rounds before it, so a companion re-grading a revised document knows what it
asked for last time. That is what makes a rework budget buy convergence rather than a fresh sample of
problems each pass, and it applies to both sides of the loop: the producer being reworked sees the
prior verdicts too.

Reviewer prose renders as Markdown throughout: judge summaries and findings, the
[Best-practice adherence](./prompt-fragments.md) section, and the PR review's summary, findings and
challenge verdicts. Fields carrying a value you copy rather than prose (a suggested fix, a gate's
failure summary) stay preformatted, so a path with underscores and a command's quoting survive intact.
Every reviewer's summary is a whole-verdict paragraph rather than a restatement of its points, since
those are already rendered as their own list beside it.

### The agent's effort report

Every container agent reports on its own run: a **difficulty** score out of ten, what reduced its
effectiveness, and the concrete obstacles it hit. It shows as a collapsible **Agent effort** footer at
the bottom of every result window, a one-line row (the difficulty chip plus what held the agent back)
that expands to the full report. It is there whatever kind of window you opened, the merger, the
tester, a gate, the PR review, or a plain prose panel.

Read it when a step took longer than it should have or produced thin work. "Missing test fixtures",
"the spec did not say which API to use", or "the build was already broken" are the kind of thing it
surfaces, and they usually point at something to fix in the task or the repo rather than in the agent.

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

## Coder follow-ups

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

On a run nobody is watching, undecided items are **dismissed** by policy rather than held, so the run
finishes inside the brief it was given. Each dismissal is stamped as the policy's, and every item keeps
its text on the step, so nothing the Coder noticed is lost. See
[Runs nobody is watching](./pull-requests.md#runs-nobody-is-watching).

## Choosing an implementation approach

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

## Human-testing a change

The **human-test** gate puts a person in the loop before a change merges. When the run reaches it,
Cat Factory spins up an [ephemeral environment](../operate/environments.md), surfaces its live URL,
and **parks** the run (the task shows "Awaiting your validation") until you act on it. No preset ships
it, since it needs someone present: add the `human-test` step to a
[cloned pipeline](./choosing-a-pipeline.md#editing-pipelines) before the merge tail.

Open the gate's window to validate the change against the live URL, then choose an action:

- **Confirm** — the change passes, the environment is torn down, and the run advances to the merge
  tail.
- **Submit findings** — describe what's wrong and Cat Factory dispatches the Tester's **Fixer** to
  address it, then re-parks for another look.
- **Pull main + redeploy** — pull the latest `main` into the branch (looping the conflict resolver
  if needed) and redeploy, so you test against current code.
- **Recreate** or **Destroy** the environment.

It also raises a **human-test-ready** notification (in-app and, if connected, Slack) so the right
person knows the change is waiting. If no ephemeral-environment provider is wired, it falls back to a
degraded manual mode: it still parks for your confirmation but stands up no live URL and the
environment actions are disabled.

You do not need the gate to reach the preview. Every environment a run stands up is listed on the
task's **outcome card** (the "read the result" view), next to the screenshots the run captured, with
a link on the ones that are still standing. An environment that has been torn down, has expired or
never came up still shows its address, labelled with which of those happened, so a dead link is
never offered as a live one. That is the fastest way for a designer or a product owner to check the
change without reading the diff, and it works while the run is still going.

## Human review on the pull request

The **Human Review** gate puts a required human code review in the pipeline. The **Adaptive build**
preset carries it, [estimate-gated](./choosing-a-pipeline.md#estimating-and-gating-expensive-steps) above a high risk bar, so a
risky change waits for a person while an ordinary one does not. You can also add the `human-review`
step to any custom pipeline unconditionally.

This gate waits for a *person's* GitHub approval during a build. To turn Cat Factory's own agent loose
on a pull request that already exists, use a
[Review task](./pull-requests.md#deep-reviewing-an-existing-pull-request) instead.

When a run reaches it, the gate watches the task's pull request on GitHub:

- It advances once the PR meets GitHub's required approvals (read from branch protection) with no
  unresolved review threads and no standing **Changes requested**. A reviewer who has requested
  changes holds the gate even when other reviewers make up the required approval count, matching
  GitHub's own merge rule.
- On outstanding review threads it dispatches the **Fixer** to address the feedback (immediately once
  the PR is approved; after a per-task grace window otherwise) and resolves each handled thread so the
  next check sees it cleared. A reviewer re-opening a thread re-triggers the Fixer.
- Feedback typed into the review box with no inline line comments counts too. A "Request changes" or
  "Comment" review's summary body is read and folded into the outstanding feedback the Fixer works
  through, so leaving prose without a single line comment moves the run forward instead of leaving it
  waiting for an approval that isn't coming.
- It waits indefinitely for the human, re-arming rather than auto-failing, and raises a
  **human-review** notification while it waits.
- From the gate window a person can request a freeform fix at any time, dispatched immediately.

The grace window is the per-task **human-review grace** risk-policy knob. The gate is opt-in (it
needs a real reviewer and a wired PR-review provider) and passes through when unwired, which is why
it isn't in the always-on default pipelines.

## Responding to decision prompts

When a step needs human input it moves to **Needs decision** and shows a **decision prompt**.
Answer the questions to continue. The most common prompts are the **Requirements Reviewer** and the
**Architect**, which pause for your approval before implementation proceeds.

A second kind of prompt comes from a **companion whose rework loop has stopped**. When the Spec
Reviewer, the Coder's Reviewer, or the Architect's companion can't get the producer past it within
the allowed rounds — either because the rating never reached the quality bar, or because a **Must
fix** finding is still open — it stops auto-looping and parks for you with a **Decide** button
(rather than a plain Approve) offering three choices, the same three the requirements reviewer
offers at its iteration cap:

- **One more round**: raise the budget by one and loop the producer back for another pass.
- **Proceed anyway**: accept the producer's current output and advance the pipeline.
- **Stop & reset**: cancel the run and return the task to phase zero (editable), with the
  producer's latest output preserved on its branch.

How many rounds it gets before that is **Companion rework rounds** on the task's
[risk policy](./pull-requests.md#conflicts-ci-and-the-merger), three on every built-in policy. Raise
it on a board whose specs and designs usually need a couple of passes; lower it where a round costs
more than it earns. Setting it to **0** does not switch the companion off: it still grades the work
and writes its verdict, and the first verdict it does not pass comes straight to you instead of
buying a round. Note that a round you grant here yourself is on top of the budget, not out of it.

A judge that spends its bounce budget below the threshold, and an iterative review that spends its
pass budget without converging, park the same way and for the same reason: the automation is
reporting that it gave up, not asking you to settle a judgement.

An open **Must fix** is the exception, and it matters for the unattended case below. That park is
not the automation giving up: it is a reviewer saying this work must not go further, so proceeding
past it overrules a review rather than confirming that a loop should stop trying. Only a person
makes that call.

If nobody is watching the run, though, none of the three choices reaches anyone. A run started over
the API, dispatched from a ticket or fired by a schedule resolves the workspace's **unattended**
risk policy, and if that policy says so the platform takes **Proceed anyway** itself and records that
it did. It will not do that for an open **Must fix**: an unattended run parks on one exactly as an
attended run does, and waits. See
[Runs nobody is watching](./pull-requests.md#runs-nobody-is-watching).

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

Next: review and merge what the agents produced in
[Review and Merge Pull Requests](./pull-requests.md), or go back to
[Choose and Edit a Pipeline](./choosing-a-pipeline.md) to reshape the chain you just watched.
