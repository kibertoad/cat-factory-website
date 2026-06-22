# Running Pipelines

A **pipeline** is an ordered chain of agent steps that takes a task from plan to merged pull
request. This page covers starting a run, choosing a model, and steering the run through its decision points.

## Anatomy of a pipeline

The default **Full build** pipeline runs these steps in order:

```
Requirements Reviewer → Architect → Requirements Writer → Researcher → Coder
  → Blueprinter → Tester → Reviewer → Conflicts Gate → CI Gate → Merger
```

| Step | What it does |
| --- | --- |
| **Requirements Reviewer** | Reviews the collected requirements for gaps; pauses for human approval. |
| **Architect** | Plans the implementation approach; pauses for human approval. |
| **Requirements Writer** | Aggregates tasks into the service's in-repo [requirements](./requirements.md#the-unified-in-repo-requirements-document) spec + Gherkin. |
| **Researcher** | Investigates prior art, libraries, and constraints. |
| **Coder** | Clones the repo and writes the implementation. |
| **Blueprinter** | Refreshes the service → modules → features map in-repo from the new code. |
| **Tester** | Runs and validates tests against the change. |
| **Reviewer** | Reviews the work for quality and correctness. |
| **Conflicts Gate** | Keeps the PR mergeable with its base, looping a resolver agent on conflicts. |
| **CI Gate** | Gates the PR on green CI, looping a CI Fixer agent on failure. |
| **Merger** | Scores the PR and auto-merges within thresholds, or raises a review notification. |

Other built-in pipelines include **Quick implement**, **Complex fullstack feature**, **Map
service** (run after bootstrap), **Write requirements**, and the recurring presets **Dependency
updates** / **Tech debt** (see [Recurring Pipelines](./recurring-pipelines.md)). Additional agent
kinds include the **Mock Builder**, **Fixer** (loops on failing tests), **Acceptance Test Author**,
**Acceptance Author**, **Documenter**, **Integrator**, and a tech-debt analysis step; a deployment
can also [register custom kinds and pipelines](../reference/packages.md).

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
