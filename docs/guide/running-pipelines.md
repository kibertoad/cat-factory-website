# Running Pipelines

A **pipeline** is an ordered chain of agent steps that takes a task from plan to merged pull
request. This page covers starting a run, choosing models, and steering it through decision points.

## Anatomy of a pipeline

A typical pipeline runs these step kinds in order:

```
architect → coder → blueprints → reviewer → tester → acceptance
```

Other available step kinds include `mocker`, `playwright`, `deployer`, and `custom`. Each step is
handled by a purpose-built agent and reports its own status.

| Step | What it does |
| --- | --- |
| **architect** | Plans the implementation approach for the task. |
| **coder** | Clones the repo and writes the implementation. |
| **blueprints** | Maintains the `service → modules → features` map in-repo. |
| **reviewer** | Reviews the work and surfaces decisions for a human. |
| **tester** | Runs and validates tests against the change. |
| **acceptance** | Confirms the output meets the task's acceptance criteria. |

## Starting a run

From a selected block, start a run:

1. **Choose a pipeline** appropriate to the task.
2. **Select a model per step** — keep the block default, or upgrade specific steps to a stronger
   provider via your API keys.
3. **Confirm the spend estimate** against your remaining [budget](./budgets.md).
4. **Launch** — the run is created and begins streaming progress.

Via the API:

```http
POST /blocks/:id/runs
```

## Watching progress live

Runs stream over WebSockets — **no polling**. As the run executes you'll see:

- Each step transition (`pending → in-progress → complete`).
- **Subtask** updates within a step.
- **Decision prompts** when an agent needs you.
- **Failures**, with the captured error for diagnosis.
- **Spend notifications** as model calls are metered.

Subscribe to a run's stream with:

```http
GET /runs/:id/events     # WebSocket upgrade
```

## Responding to decision prompts

When a step needs human input it moves to `paused-for-decision` and shows a **decision prompt**.
Answer the questions to continue:

```http
POST /runs/:id/steps/:stepId/decision
```

The most common prompt is the reviewer asking you to resolve clarifications before code is
generated. The dashboard can **auto-submit** answers where you've pre-filled them.

## Durability, failures, and retries

Runs are **checkpointed** — each completed step is durably recorded by Cloudflare Workflows (or
pg-boss on Node.js). If a step fails, the error is captured and the run surfaces a **manual retry**
so you can re-run from the failure point rather than starting over.

Check run metadata and step history any time:

```http
GET /runs/:id
```

## Run lifecycle

```
queued → running → (paused-for-decision ⇄ running)* → passed | failed
```

A `passed` run means the agents finished their work and a pull request is ready for your review.

---

Next: review and merge what the agents produced in [Pull Requests](./pull-requests.md).
