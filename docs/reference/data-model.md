# Data Model

Wire formats are defined in `@cat-factory/contracts` and validated with
[Valibot](https://valibot.dev/). These are the core domain shapes you'll encounter in the
[HTTP API](./http-api.md).

## Block

A node on the board — a service, module, or task.

```typescript
{
  id: string
  level: 'frame' | 'subframe' | 'leaf'
  title: string
  description: string
  status: 'backlog' | 'active' | 'in-review' | 'done'
  repoId?: string
  modelId?: string
  parentId?: string
}
```

| Field | Notes |
| --- | --- |
| `level` | `frame` = service, `subframe` = module, `leaf` = task. |
| `status` | Lifecycle: `backlog → active → in-review → done`. |
| `repoId` | Linked repository (typically set on `frame` blocks). |
| `modelId` | Default model for runs on this block. |
| `parentId` | Parent block; absent for top-level frames. |

## Run

An immutable execution record for a pipeline invoked on a block.

```typescript
{
  id: string
  blockId: string
  pipelineId: string
  status: 'queued' | 'running' | 'passed' | 'failed'
  steps: Step[]
  createdAt: Date
}
```

## Step

A single stage within a run, handled by one agent kind.

```typescript
{
  kind: 'architect' | 'coder' | 'reviewer' | 'tester' | ...
  status: 'pending' | 'in-progress' | 'paused-for-decision' | 'complete'
  decision?: { prompt: string; answers: Record<string, string> }
}
```

Other `kind` values include `blueprints`, `acceptance`, `mocker`, `playwright`, `deployer`, and
`custom`. When `status` is `paused-for-decision`, the `decision` object carries the prompt and the
answers you submit.

## Relationships

```
Workspace
  └─ Block (frame)            level: 'frame'      → linked repo
       └─ Block (subframe)    level: 'subframe'
            └─ Block (leaf)   level: 'leaf'
                 └─ Run
                      └─ Step (architect → coder → … → acceptance)
```

- A **block** belongs to a workspace and may have a parent block.
- A **run** belongs to a block and references the pipeline it executes.
- A **step** belongs to a run and may carry a decision prompt.

---

See these types in action in the [HTTP API](./http-api.md), and where they live in code under
[Packages](./packages.md).
