# Running Pipelines

A **pipeline** is an ordered chain of agent steps that takes a task from plan to merged pull
request. This page covers starting a run, choosing a model, and steering the run through its decision points.

## Anatomy of a pipeline

The default **Full build** pipeline runs these steps in order:

```
Requirements Reviewer → Spec Writer → Spec Reviewer → Architect → Researcher → Coder
  → Reviewer → Blueprinter → Mock Builder → Tester → Conflicts Gate → CI Gate → Merger
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
| **Blueprinter** | Refreshes the service → modules → features map in-repo from the new code. |
| **Mock Builder** | Stands up WireMock mocks for external services and the compose wiring so the suite runs locally. |
| **Tester** | Runs the software against the mocks and the spec's acceptance scenarios and reports what it observed. |
| **Conflicts Gate** | Keeps the PR mergeable with its base, looping a resolver agent on conflicts. |
| **CI Gate** | Gates the PR on green CI, looping a CI Fixer agent on failure. |
| **Merger** | Scores the PR and auto-merges within thresholds, or raises a review notification. |

The **Spec Writer** runs before the **Architect** so the design is built against a written spec, and
the spec itself is not human-gated: its **Spec Reviewer** companion handles quality by looping the
writer back automatically. See [Requirements](./requirements.md) for the spec and the review loop.

Other built-in pipelines each new workspace seeds:

| Pipeline | What it's for |
| --- | --- |
| **Simple** | The leanest end-to-end build: Coder → Reviewer → Mock Builder → Tester, then the standard Conflicts → CI → Merger tail. No design, spec, or documentation phases. |
| **Quick implement** | Coder → Blueprinter → Mock Builder → Tester, then the merge tail, with no Reviewer and no design/spec phases. |
| **Triage & fix bug** | A bug-fix front end: a read-only **Bug Investigator** explores the repo from the raw report, then a **Clarity Review** gate triages the report for *fixability* before the Coder runs. See below. |
| **Build & human-test** | Coder → Reviewer, then a **human-test** gate that stands up a live environment and parks for a person to validate before the merge tail. Opt-in (it needs someone present). See [Human-testing a change](#human-testing-a-change). |
| **Complex fullstack feature** | The fullest pipeline: adds a Researcher, the Playwright e2e author, and business/feature documenters around the Full-build core. |
| **Map service** | Blueprint only. Run after bootstrapping to reconcile a repo onto the board. |
| **Write spec** | Spec Writer only. Regenerate a service's in-repo spec on its own. |
| **Integrate & ship** | Integrator → Mock Builder → Tester → Documenter, for wiring an existing change through. |
| **Dependency updates** / **Tech debt** | The recurring presets (see [Recurring Pipelines](./recurring-pipelines.md)). |

Additional agent kinds include the **Fixer** (loops on failing tests inside the Tester gate),
**Bug Investigator**, **Playwright** (runnable e2e tests from the spec's acceptance scenarios),
**Documenter**, **Integrator**, and a tech-debt analysis step; a deployment can also
[register its own agent kinds and pipelines](../deploy/custom-agents.md).

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

## Editing pipelines

The built-in pipelines are read-only templates, but you can shape your own:

- **Clone** any pipeline, built-in or custom, into a new editable copy. This is how a read-only
  default becomes a starting point you can change.
- **Edit** a custom pipeline in place: reorder, add, or remove steps. Built-in pipelines carry a
  **default** badge and offer Clone instead of Edit.
- **Disable a step** without deleting it. A disabled step stays in the saved pipeline but is skipped
  at run start, so you can drop, say, the Researcher for a run without rebuilding the chain. At least
  one step must stay enabled.

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
On a companion (the Coder's Reviewer, the Architect's or Spec Writer's reviewer), open its gate
controls and set minimum thresholds on any of the axes. The companion then runs only when the
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
until a running task finishes.

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
- One preset is the workspace **default**; every workspace seeds two built-ins, **Kimi K2.7** and
  **GLM-5.2**. A task selects which preset it runs on (in the new-task form or its inspector), and
  changing the preset only affects steps that haven't started yet.

The picker shows each model's list price next to its provider and context window (quota-based
subscription models show their quota burn rate instead), so you can weigh cost as you assign kinds.
Reserve stronger (and pricier) models for architecturally significant kinds and keep cheaper ones on
routine steps to manage [spend](./budgets.md).

## Watching progress live

Runs stream over WebSockets, so there's no polling. As the run executes you'll see:

- Each step transition (**Pending → Working → Done**).
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
  the dedicated result windows (test report, CI/Conflicts gate, requirements review). As with start
  and retry, restarting a step that uses a personal subscription prompts for your password.
- **Stop** halts the run but **keeps it**: the run stays readable and retryable and the block goes
  *blocked*. Nothing is discarded.
- **Reset** is the explicit destructive action: it discards the run and returns the task to
  *planned*.

### Watching the gates

The **CI** and **Conflicts** gates open a dedicated **gate window** when you click into them, so you
can see *why* a gate is looping rather than a bare prose panel: the verdict, the gated commit, the
helper's remaining attempt budget, and (for CI) exactly which checks failed. Each gate's helper
(the **CI Fixer** / **Conflict Resolver**) renders as a sub-node that reads possible / running /
completed / skipped, the same as the Tester's Fixer.

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
