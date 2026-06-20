# Data Model

This is a reference for the **core domain shapes** Cat-Factory tracks — what a block, a run, a
service, a schedule, and the requirements document actually contain. It's handy when reasoning about
what the board is modelling; you don't need it to use the platform.

## Block

A node on the board — a service, module, or task.

```typescript
{
  id: string
  title: string
  type: 'frontend' | 'service' | 'api' | 'database' | 'queue' | 'integration' | 'external' | 'environment'
  description: string
  position: { x: number; y: number }
  size?: { w: number; h: number }          // dragged frame size; absent = auto-size
  status: 'planned' | 'ready' | 'in_progress' | 'blocked' | 'pr_ready' | 'done'
  progress: number
  level: 'frame' | 'module' | 'task'
  parentId: string | null
  dependsOn: string[]
  executionId: string | null
  modelId?: string                          // pinned model (overrides routing)
  pipelineId?: string                       // pipeline chosen for this task
  fragmentIds?: string[]                    // selected prompt fragments
  mergePresetId?: string                    // auto-merge threshold preset
  testTarget?: 'github_actions' | 'ephemeral_env'
  pullRequest?: { url: string; number?: number; branch?: string }
}
```

| Field | Notes |
| --- | --- |
| `level` | `frame` = service, `module` = module, `task` = task. |
| `status` | `blocked` = paused for a decision; `pr_ready` = PR open awaiting review. |
| `modelId` | Pins the model; otherwise resolution falls to the workspace default, then routing. |
| `pullRequest` | Set once the implementation agent's branch is pushed and a PR is opened. |

## Pipeline

A reusable, ordered chain of agent steps.

```typescript
{
  id: string
  name: string
  agentKinds: string[]        // open set — built-in or custom kinds
  gates?: boolean[]           // per-step human-approval gates, parallel to agentKinds
}
```

## Execution

The execution record for a pipeline invoked on a block (the board surfaces it as the block's
**run**).

```typescript
{
  id: string
  blockId: string
  pipelineId: string
  pipelineName: string
  steps: PipelineStep[]
  currentStep: number
  status: 'running' | 'blocked' | 'done' | 'paused' | 'failed'
  failure?: { kind: string; ... } | null     // diagnostics when status is 'failed'
}
```

## PipelineStep

A single stage within an execution, handled by one agent kind.

```typescript
{
  agentKind: string
  state: 'pending' | 'working' | 'waiting_decision' | 'done'
  progress: number
  requiresApproval?: boolean                  // a human gate fires after this step
  decision: { ... } | null                    // present when waiting on a decision
  ci?: { ... } | null                         // live CI-gate state on a `ci` step
  conflicts?: { ... } | null                  // live conflict-gate state on a `conflicts` step
  metrics?: { ... } | null                    // LLM observability rollup (tokens, cache hits)
  output?: string                             // text the agent produced
  model?: string
}
```

## Service & WorkspaceMount

The [in-org shared-services](../guide/shared-services.md) types.

```typescript
// Account-owned canonical unit of work.
Service {
  id: string
  accountId: string | null
  frameBlockId: string
  installationId: number | null               // GitHub App installation, when connected
  repoGithubId: number | null
  createdAt: number
  mountCount?: number                          // set on the catalog, for the "Shared" badge
}

// A service placed onto a workspace board; PK (workspaceId, serviceId).
WorkspaceMount {
  workspaceId: string
  serviceId: string
  position: { x: number; y: number }           // per-board frame layout override
  size?: { w: number; h: number } | null
  createdAt: number
}
```

## PipelineSchedule

A [recurring pipeline](../guide/recurring-pipelines.md) attached to a service.

```typescript
{
  id: string
  serviceId: string | null
  blockId: string                              // the reused on-board task block
  frameId: string
  pipelineId: string
  template: 'dep-update' | 'tech-debt' | 'custom'
  name: string
  recurrence: {
    intervalHours: number
    weekdays: number[]                         // 0=Sun..6=Sat; empty = every day
    windowStartHour: number | null
    windowEndHour: number | null
    timezone: string                           // IANA zone, e.g. "Europe/Helsinki"
  }
  enabled: boolean
  lastRunAt: number | null
  nextRunAt: number
  createdAt: number
}
```

## RequirementsDoc

The canonical tree behind the in-repo `requirements/requirements.json`
([requirements](../guide/requirements.md#the-unified-in-repo-requirements-document)).

```typescript
{
  service: string
  summary?: string
  groups?: Array<{                             // each group → one .feature file
    name: string
    summary?: string
    requirements?: Array<{
      id: string
      title: string
      statement: string                        // "The system SHALL …"
      kind: 'functional' | 'nonfunctional' | 'constraint'
      priority: 'must' | 'should' | 'could'    // MoSCoW
      sourceBlockIds?: string[]                // provenance
      acceptance?: Array<{ id: string; given: string; when: string; outcome: string }>
    }>
  }>
  rules?: Array<{ id: string; rule: string; rationale?: string; sourceBlockIds?: string[] }>
}
```

## Workspace settings

```typescript
ModelDefaults    { defaults: Record<string /* agent kind */, string /* model id */> }
TrackerSettings  { tracker: 'github' | 'jira' | null; jiraProjectKey: string | null; updatedAt: number }
```

The full **workspace snapshot** the board loads bundles the board itself (`blocks`, `pipelines`,
`executions`) together with `mounts`, `serviceCatalog`, `mergePresets`, `modelDefaults`,
`recurringPipelines`, `trackerSettings`, `notifications`, and `spend`.

## Relationships

```
Account (org)
  └─ Service                       ← account-owned; mounted onto workspaces
       └─ Block (frame)            level: 'frame'      → linked repo
            └─ Block (module)      level: 'module'
                 └─ Block (task)   level: 'task'
                      ├─ Execution → PipelineStep (agentKind, state, …)
                      └─ PipelineSchedule (recurring)
Workspace ──mounts──▶ Service       (per-board frame layout on the mount)
```

---

For how these pieces fit at runtime, see [Architecture](./architecture.md).
