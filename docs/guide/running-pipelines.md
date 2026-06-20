# Running Pipelines

A **pipeline** is an ordered chain of agent steps that takes a task from plan to merged pull
request. This page covers starting a run, choosing models, and steering it through decision points.

## Anatomy of a pipeline

The default **Full build** pipeline (`pl_full`) runs these step kinds in order:

```
requirements → architect → requirements-writer → researcher → coder
  → blueprints → tester → reviewer → conflicts → ci → merger
```

| Step | What it does |
| --- | --- |
| **requirements** | Reviews the collected requirements for gaps; pauses for human approval. |
| **architect** | Plans the implementation approach; pauses for human approval. |
| **requirements-writer** | Aggregates tasks into the service's in-repo [requirements](./requirements.md#the-unified-in-repo-requirements-document) spec + Gherkin. |
| **researcher** | Investigates prior art, libraries, and constraints. |
| **coder** | Clones the repo and writes the implementation. |
| **blueprints** | Refreshes the `service → modules → features` map in-repo from the new code. |
| **tester** | Runs and validates tests against the change. |
| **reviewer** | Reviews the work for quality and correctness. |
| **conflicts** | Keeps the PR mergeable with its base, looping a resolver agent on conflicts. |
| **ci** | Gates the PR on green CI, looping a CI-fixer agent on failure. |
| **merger** | Scores the PR and auto-merges within thresholds, or raises a review notification. |

Other built-in pipelines include **Quick implement** (`pl_quick`), **Map service** (`pl_blueprint`,
run after bootstrap), **Write requirements** (`pl_requirements`), and the recurring presets
**Dependency updates** / **Tech debt** (see [Recurring Pipelines](./recurring-pipelines.md)).
Additional agent kinds include `mocker`, `playwright`, `acceptance`, `documenter`, `integrator`,
and `analysis`; a deployment can also [register custom kinds and pipelines](../reference/packages.md).

## Starting a run

From a selected block, start a run:

1. **Choose a pipeline** appropriate to the task.
2. **Pick the model** — see [Choosing models](#choosing-models) below.
3. **Confirm the spend estimate** against your remaining [budget](./budgets.md).
4. **Launch** — the run is created and begins streaming progress.

## Choosing models

The model an agent runs on is resolved by precedence:

```
block-pinned model  →  workspace per-kind default  →  deployment env routing  →  env default
```

- **Pin a model on a block** to force it for that block's runs.
- Set a **workspace model default per agent kind** (in workspace Configuration) to point a whole
  kind — say, `architect` — at a stronger model without touching every block.
- Otherwise the deployment's env routing for the kind, then its global default, applies.

Reserve stronger (and pricier) models for architecturally significant work and keep cheaper ones on
routine steps to manage [spend](./budgets.md).

## Watching progress live

Runs stream over WebSockets — **no polling**. As the run executes you'll see:

- Each step transition (`pending → in-progress → complete`).
- **Subtask** updates within a step.
- **Decision prompts** when an agent needs you.
- **Failures**, with the captured error for diagnosis.
- **Spend notifications** as model calls are metered.

Every board and run share one live connection, so progress appears the moment the dashboard is
open — no polling.

## Responding to decision prompts

When a step needs human input it moves to `paused-for-decision` and shows a **decision prompt**.
Answer the questions to continue. The most common prompts are the **requirements** reviewer and the
**architect**, which pause for your approval before implementation proceeds.

## Durability, failures, and retries

Runs are **checkpointed** — each completed step is durably recorded by Cloudflare Workflows (or
pg-boss on Node.js) — and they are **resumable**. Container work commits to a deterministic branch
per task (`cat-factory/<blockId>`), and the harness pushes periodic checkpoints, so an evicted or
retried run **resumes on the same branch** instead of starting over. A live **no-progress guard**
ends a run early with a diagnostic if the agent thrashes without editing files.

Cat-Factory also owns the Git delivery contract: the **agent commits its own work and validates
locally**, while the **platform** pushes, opens the pull request, and drives CI — so a container
agent never needs push credentials. If a step fails, the error is captured and the run surfaces a
**manual retry** from the failure point.

::: tip Web research
When [web search is configured](../deploy/configuration.md#web-search) on the deployment, container
agents (coder, ci-fixer, …) get `web_search`/`web_fetch` tools through a backend proxy, and the
inline `architect`/`researcher` agents can use their provider's hosted web search. Both are opt-in
and no-op until configured.
:::

## Run lifecycle

```
running → (blocked ⇄ running)* → done | paused | failed
```

A run is `blocked` while paused on a human decision, `paused` when stopped at the budget cap, and
`done` once the agents finish and a pull request is ready for your review.

---

Next: review and merge what the agents produced in [Pull Requests](./pull-requests.md).
