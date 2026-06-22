# Running Pipelines

A **pipeline** is an ordered chain of agent steps that takes a task from plan to merged pull
request. This page covers starting a run, choosing a model, and steering the run through its decision points.

## Anatomy of a pipeline

The default **Full build** pipeline runs these steps in order:

```
Requirements Reviewer → Spec Writer → Spec Reviewer → Architect → Researcher → Coder
  → Blueprinter → Mock Builder → Tester → Reviewer → Conflicts Gate → CI Gate → Merger
```

| Step | What it does |
| --- | --- |
| **Requirements Reviewer** | Reviews the collected requirements for gaps; pauses for human approval. |
| **Spec Writer** | Aggregates tasks into the service's in-repo [spec](./requirements.md#the-unified-in-repo-spec) + Gherkin, on a shared work branch before the design. |
| **Spec Reviewer** | The Spec Writer's companion: rates the spec and loops the writer back below threshold (no human gate). |
| **Architect** | Designs the approach against the just-written spec; pauses for human approval. |
| **Researcher** | Investigates prior art, libraries, and constraints. |
| **Coder** | Clones the repo and writes the implementation. |
| **Blueprinter** | Refreshes the service → modules → features map in-repo from the new code. |
| **Mock Builder** | Stands up WireMock mocks for external services and the compose wiring so the suite runs locally. |
| **Tester** | Runs the software against the mocks and the spec's acceptance scenarios and reports what it observed. |
| **Reviewer** | The Coder's companion: rates the change and loops it back for rework below threshold. |
| **Conflicts Gate** | Keeps the PR mergeable with its base, looping a resolver agent on conflicts. |
| **CI Gate** | Gates the PR on green CI, looping a CI Fixer agent on failure. |
| **Merger** | Scores the PR and auto-merges within thresholds, or raises a review notification. |

The **Spec Writer** runs before the **Architect** so the design is built against a written spec, and
the spec itself is no longer human-gated: its **Spec Reviewer** companion handles quality by looping
the writer back automatically. See [Requirements](./requirements.md) for the spec and the review loop.

Other built-in pipelines include **Quick implement**, **Complex fullstack feature**, **Map
service** (run after bootstrap), **Write spec**, and the recurring presets **Dependency
updates** / **Tech debt** (see [Recurring Pipelines](./recurring-pipelines.md)). Additional agent
kinds include the **Fixer** (loops on failing tests inside the Tester gate), **Acceptance Test
Author**, **Acceptance Author**, **Documenter**, **Integrator**, and a tech-debt analysis step; a
deployment can also [register custom kinds and pipelines](../reference/packages.md).

Hover any step in the builder, the draft chain, or a board task card to see what that agent does:
each kind's description shows as a tooltip.

## Editing pipelines

The built-in pipelines are read-only templates, but you can shape your own:

- **Clone** any pipeline, built-in or custom, into a new editable copy. This is how a read-only
  default becomes a starting point you can change.
- **Edit** a custom pipeline in place: reorder, add, or remove steps. Built-in pipelines carry a
  **default** badge and offer Clone instead of Edit.
- **Disable a step** without deleting it. A disabled step stays in the saved pipeline but is skipped
  at run start, so you can drop, say, the Researcher for a run without rebuilding the chain. At least
  one step must stay enabled.

## Starting a run

From a selected block, start a run:

1. **Choose a pipeline** appropriate to the task.
2. **Confirm the spend estimate** against your remaining [budget](./budgets.md).
3. **Launch** - the run is created and begins streaming progress.

Each agent runs on its kind's default model - see [Choosing models](#choosing-models) below.

::: tip Personal subscriptions ask for a password once
If a step uses a model from a personal (individual-usage) subscription such as Claude, GLM, or
Codex, Cat Factory asks for your personal password to unlock your credential. After the first
unlock it is cached in your browser for a few hours, so subsequent starts, retries, and approvals
don't re-prompt. The password is about using *your own* credential on purpose, not a security wall.
See [Model Providers & Subscriptions](./model-providers.md#why-a-personal-password).
:::

## Choosing models

Model selection is set per agent kind, in **Configuration → Default models**:

- Set a **default model per agent kind** to point a whole kind (say, the **Architect**) at a
  stronger model.
- Where a kind has no default, the deployment's routing for that kind applies, then its global
  default.

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

## Durability, failures, and retries

Runs are checkpointed and resumable: each completed step is durably recorded by Cloudflare Workflows
(or pg-boss on Node.js). Container work commits to a dedicated branch per task, and the harness
pushes periodic checkpoints, so an evicted or retried run resumes on the same branch instead of
starting over. A live no-progress guard ends a run early with a diagnostic if the agent thrashes
without editing files.

Cat Factory also owns the Git delivery contract: the agent commits its own work and validates
locally, while the harness pushes the branch and opens the pull request, so a container agent
never needs push credentials. Your existing CI/CD takes it from there. If a step fails, the
error is captured and the run surfaces a manual retry from the failure point.

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
