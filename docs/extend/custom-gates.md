# Add a Custom Gate or Judge

For a deployment that needs to block or grade work rather than produce it: a license-header gate that
holds a merge until every file carries the company SPDX line, a rubric that scores scope adherence
before a run advances. Like a [custom agent kind](./custom-agents.md), both are code you register
from your own [deployment repository](../deploy/deployment-repository.md), with no fork and no
harness rebuild.

Three shapes, and picking the right one is most of the work:

- A **gate** runs a cheap deterministic precheck against a data source you supply and escalates to a
  helper agent only on a negative verdict, looping until the precheck passes or an attempt budget is
  spent. No score, no model call on the happy path.
- A **step-completion resolver** reshapes a finished step's output from its structured result. It
  cannot park or loop a run.
- A **judge** always costs one model call, scores the work against a **rubric**, and disposes on that
  score: advance, park for a human, send the work back, or fail.

The built-in `ci`, `conflicts`, and `post-release-health` gates are authored through the exact seam
below and ship as [`@cat-factory/gates`](../reference/packages.md), so the platform's own suite is a
worked example of everything on this page.

## The gate registration seam

The engine owns the shared state machine: re-attach on replay, init and persist `step.gate`, dispatch
the helper, count attempts, emit. Your gate is the small `GateDefinition` describing what makes it
different.

A deployment registers a gate with `gateRegistry.register(kind, factory)` on the `GateRegistry`
the start function injects, the same shape as every other registry. The `kind` is the step
`agentKind` the gate gates; the factory is `(ctx: GateContext) => GateDefinition`, invoked once when
the engine builds its gate registry. A registered gate replaces a built-in of the same kind, so you
can both add new gates and customize the built-in catalog (last registration wins).

```ts
import {
  defineProviderToken,
  isProviderWired,
  wireProvider,
  type GateProbe,
} from '@cat-factory/kernel'

// The verdict your deployment-supplied checker returns for a block's PR.
interface LicenseCheckReport {
  clean: boolean
  headSha: string | null
  summary?: string
}
interface LicenseProvider {
  check(workspaceId: string, blockId: string): Promise<LicenseCheckReport>
}

// 1. Define a provider token and a one-line wire function. The gate reaches its data source
//    through the typed provider registry, not a module global. Unwired ⇒ the gate passes through.
const LICENSE_PROVIDER = defineProviderToken<LicenseProvider>('license')
export function wireLicenseProvider(provider: LicenseProvider | undefined): void {
  wireProvider(LICENSE_PROVIDER, provider)
}

// 2. Register the gate. `license-fixer` is a registered container-coding agent kind (see the
//    agent page) that adds the missing headers and pushes, like the built-in ci-fixer relates to ci.
gateRegistry.register('license-check', (ctx) => ({
  kind: 'license-check',
  helperKind: 'license-fixer',
  // The canonical source of the gate's "is my data source configured" answer.
  wired: () => isProviderWired(LICENSE_PROVIDER),
  unwiredOutput: 'License gate skipped (no license provider configured).',
  // The precheck. requireProvider is SAFE here: the engine only probes a gate whose wired() is true.
  probe: async (workspaceId, blockId): Promise<GateProbe> => {
    const report = await ctx.requireProvider(LICENSE_PROVIDER).check(workspaceId, blockId)
    return report.clean
      ? { status: 'pass', headSha: report.headSha, passOutput: report.summary ?? 'License OK.' }
      : { status: 'fail', headSha: report.headSha, failureSummary: report.summary }
  },
  // Hand the failing-file summary to the fixer as resolved context, like the CI gate.
  helperPriorOutput: (summary) => ({ agentKind: 'license-check', output: summary }),
  // Called when the attempt budget is spent: raise a human notification, return the failure message.
  onExhausted: async ({ workspaceId, instance, block, step, summary }) => {
    const attempts = step.gate?.attempts ?? 0
    await ctx.raiseNotification(workspaceId, {
      type: 'decision_required',
      blockId: block.id,
      executionId: instance.id,
      title: 'License headers still missing',
      body: `Still missing after ${attempts} fixer attempt(s). ${summary ?? ''}`.trim(),
    })
    return { error: `License headers still missing after ${attempts} attempt(s).` }
  },
}))
```

## The `GateProbe` verdict

`probe` runs your precheck and returns a `GateProbe` with one of three statuses:

| `status` | Meaning | What the engine does |
| --- | --- | --- |
| `pass` | The precheck is satisfied. | Finish the step with `passOutput`, advance the run. Nothing was spun up. |
| `pending` | The data source is still computing. | Keep polling. |
| `fail` | The precheck failed. | Escalate to `helperKind` (or give up once the attempt budget is spent). |

`headSha` is the PR head commit the precheck ran against (or `null` when there is no open PR), used
to detect a new push between polls. On `fail`, `failureSummary` is fed to the helper agent and the
give-up error; `failingChecks` optionally carries structured failing-check detail the run-detail UI
lists.

## The `GateDefinition` fields

The factory returns a `GateDefinition`:

| Field | Purpose |
| --- | --- |
| `kind` | The step `agentKind` this gate gates (matches the registration key). |
| `helperKind` | The container agent kind dispatched on a failed precheck. Must be a built-in helper (`ci-fixer`, `conflict-resolver`, `on-call`) or a registered container-capable kind, or [boot validation](./custom-agents.md#boot-time-validation) fails. |
| `wired()` | Whether the gate's provider is configured. When false the gate is a pass-through. Make this `isProviderWired(token)` so it shares its source with `requireProvider`. |
| `unwiredOutput` | Step output recorded when the gate passes through unwired. |
| `probe(...)` | Run the precheck and classify it as a `GateProbe`. Receives the live `GateStepState` so a time-windowed gate can read its `watchSince`. |
| `onExhausted(args)` | Run when the attempt budget is spent (or there is no async executor to escalate to). May raise a notification; returns the message used to fail the run. |
| `pollExhaustion?` | `fail` (default) or `pass`. A time-windowed watch gate (like post-release-health) uses `pass`: running out of polls with no regression seen is a healthy result, not a timeout failure. |
| `attemptBudget?(policy)` | The helper-attempt budget, resolved from the task's risk policy. Defaults to `ciMaxAttempts`. |
| `helperPriorOutput?(summary)` | Extra context handed to the helper on escalation. |
| `gatherHelperPriorOutputs?(...)` | Async builder for richer helper context gathered at dispatch time; takes precedence over `helperPriorOutput`. |
| `resolveHelperCompletion?(args)` | See below: settle the gate from the helper's result instead of re-probing. |

## The `GateContext` seams

The factory receives a `GateContext`, the minimal set of engine seams a gate legitimately needs. The
engine keeps owning dispatch, budget, persistence, and the state machine:

| Seam | Use |
| --- | --- |
| `clock` | The engine clock (monotonic-ish ms), for time-windowed gates. |
| `getBlock(workspaceId, blockId)` | Read a block, e.g. to gate only a release that actually shipped. |
| `runInitiatorScope` | Run a function under the run initiator's ambient context (per-user credentials). |
| `raiseNotification(workspaceId, input)` | Raise a human-actionable notification, e.g. from `onExhausted`. |
| `getProvider(token)` | The wired impl for a provider token, or `undefined`. |
| `requireProvider(token)` | The wired impl, or throw. Safe inside `probe()` because the engine only probes a wired gate. |

::: tip Most helpers fix; investigate-only helpers settle differently
A normal helper fixes the gated condition (the fixer pushes a fix, the conflict resolver re-merges),
so the engine re-runs the precheck after it finishes and the gate's verdict stays the source of
truth. An investigate-don't-fix helper (like the built-in `on-call`) changes nothing the precheck
would observe, so re-probing would just regress and burn the budget. Implement
`resolveHelperCompletion` on such a gate: the engine then calls it on the helper's completion (with
the full `AgentRunResult`) and finishes the gate step with the returned output, letting the gate
raise a notification or enrich an incident and let the run complete for a human to act out of band.
:::

## Step-completion resolvers

A step-completion resolver is the related seam for deterministic backend work that must run after an
agent step finishes, keyed by `agentKind` and driven from the agent's structured result, not from
re-prompting. Register one with `stepResolverRegistry.register(kind, factory)`,
where the factory is `(ctx: ResolverContext) => StepCompletionResolver`. The engine runs the matching
resolver in `recordStepResult` once the step's agent finishes, regardless of the step's position in
the pipeline.

```ts
import type { StepCompletionResolver } from '@cat-factory/kernel'

const auditorSummaryResolver: StepCompletionResolver = {
  kind: 'security-auditor',
  applies: (result) => result.custom !== undefined, // no-op when the agent produced nothing
  resolve: async ({ result }) => {
    const assessment = securityAssessment.safeParse(result.custom)
    if (!assessment) return { output: 'Security audit complete: result was not parseable.' }
    return { output: `Security audit complete: ${assessment.findings?.length ?? 0} finding(s).` }
  },
}

stepResolverRegistry.register(auditorSummaryResolver.kind, () => auditorSummaryResolver)
```

A resolver returns a `StepResolution`: an optional replacement `output` (a human-readable summary the
run-detail UI shows), and an optional `ownsTerminalStatus` flag for a resolver that decides the
block's terminal status itself. The built-in `merger` is such a resolver: it performs the real GitHub
merge with backend-held credentials the sandboxed agent does not have, and flips the block to `done`
or `pr_ready`. It stays a privileged built-in (it needs engine-internal access), so a custom resolver
is the lighter archetype: act on the `result` it receives and reach any external system through a
provider it closes over.

## Wiring a gate's provider at startup

A gate (or resolver) reaches its data source through the typed provider registry. You
`defineProviderToken` once, export a one-line `wireX`, and the facade calls it at startup after
importing your package. Until the provider is wired, `wired()` returns false and the gate is a
harmless pass-through, so a bare `import '@your-org/org-gates'` is always safe.

The built-in gates wire the same way. `@cat-factory/gates` exports `wireCiStatusProvider`,
`wireMergeabilityProvider`, `wireReleaseHealthProvider`, and `wireIncidentEnrichment` (plus
`applyGateProviders` for wiring a bag at once); the facade builds the GitHub-backed impls and hands
them in. See [`@cat-factory/gates`](../reference/packages.md).

## The document-quality gate

The built-in **document-quality gate** (`doc-quality`) is a worked example of this seam that ships in
`@cat-factory/gates`. It runs a deterministic, checkout-free structural check on a
[document task's](../guide/documents.md) drafted file, missing required sections, leftover
placeholders, heading-hierarchy problems, and broken in-repo links, and on a failure escalates to the
`doc-fixer` helper (up to two attempts) to correct the draft in place. Like every gate it is a
pass-through until its provider is wired; both shipped runtimes wire it:

```ts
import { wireDocQualityProvider } from '@cat-factory/gates'
import { GitHubDocQualityProvider } from '@cat-factory/server'

wireDocQualityProvider(new GitHubDocQualityProvider({ githubClient, resolveRepoTarget, blockRepository, documentRepository }))
```

The gate checks against the same template the writer used. To supply your own house structure for a
document kind, either link a template document per workspace in the app (see
[Author a Document → Templates](../guide/documents.md#templates-and-examples)) or register one at startup
with `registerDocTemplate` (from `@cat-factory/agents`). Passing the `documentRepository` above lets a workspace-linked template
reach the gate; without it the gate falls back to the kind's built-in skeleton.

## Custom judges

A **judge** is the third extension shape, for grading rather than gating. Where a gate runs a cheap
deterministic precheck and escalates a container helper, a judge always costs one model call, scores
the run's work against a **rubric**, and disposes on that score: advance, park for a human, send the
work back to the step that produced it, or fail the run. Reach for it when neither of the other seams
fits: a step-completion resolver can reshape output but cannot park or loop a run, and a gate has no
score.

Unlike agent kinds and gates, judges register **by reference** on an app-owned registry rather than
through an import side effect. Build one with `defaultJudgeRegistry()` (from `@cat-factory/kernel`),
register your judges on it, and pass it as `judgeRegistry` when you build the container:

```ts
import { defaultJudgeRegistry } from '@cat-factory/kernel'
import { start, buildNodeContainer } from '@cat-factory/node-server'

const judgeRegistry = defaultJudgeRegistry()
judgeRegistry.register('scope-adherence', scopeAdherenceJudgeFactory)

start({ buildContainer: (opts) => buildNodeContainer({ ...opts, judgeRegistry }) })
```

The factory is `(ctx: JudgeContext) => JudgeDefinition`, invoked once when the engine builds its judge
map, so a judge's hooks can close over the engine seams (`clock`, `getBlock`, `runInitiatorScope`,
`raiseNotification`, and the provider registry) and over your own provider. Registering the same kind
twice replaces the earlier entry.

The registry is empty by default, so a stock deployment has no judges. The engine owns the whole state
machine: rubric resolution, persistence, the threshold comparison, the disposition, the bounce budget,
and emission. Your `JudgeDefinition` describes only what differs:

| Field | Purpose |
| --- | --- |
| `kind` | The step `agentKind` this judge runs as. |
| `rubric` | `{ id, name, body, fragmentId? }`. `body` is the default; naming a `fragmentId` lets a workspace override the rubric by authoring that [prompt fragment](../guide/prompt-fragments.md). |
| `onFail` | What a below-threshold verdict does: `park` (ask a human), `bounce` (re-arm the producing step with the findings as rework feedback), or `fail`. |
| `bounceTargets?` | The agent kinds this judge grades, searched backward from the judge step to find what a bounce re-arms. Omitted ⇒ the immediately preceding step. |
| `parseVerdict?` | Parse the raw assessment. Defaults to the built-in verdict schema; pass your own parser for a richer rubric shape. Whatever it returns must expose a `score`. |
| `threshold?` / `attemptBudget?` | Resolve the minimum score and the bounce budget from the task's risk policy. Default to the policy's `judgeMinScore` and `judgeMaxBounces`. |
| `wired?` / `unwiredOutput` | Pass-through when the judge needs its own provider and it isn't configured. |
| `presentation?` | Makes the kind a palette block and opens the shared **judge** result window. |

Two knobs on the workspace's [risk policies](../guide/pull-requests.md#conflicts-ci-and-the-merger)
make the strictness per-task: the minimum score a verdict must reach, and how many bounce rounds a
judge may spend before it must stop and ask a human. A spent budget parks rather than advancing, so a
rubric can never green a run silently. A bounce with nothing to send the work back to degrades to a
park and records why.

The assessment itself runs through the engine's inline model call, built from the model-provider
dependencies every runtime already wires, so a judge needs no per-facade wiring. An unparseable
assessment is recorded as a failing verdict rather than crashing the run. Judge verdicts appear in the
run's judge window, in a `judge_review` notification when one parks, in the pull request's
[verification report](../guide/pull-requests.md#the-verification-report-on-the-pull-request), and over
`/api/v1/runs/{runId}/decisions` for a headless caller.

## Packaging, wiring, and boot validation

A gate ships in the same small package as your agent kinds, is installed onto the registries your
composition root passes in, and is checked at startup by the same
`validateRegistrationsOnce()` call. That story is one story, and it lives with the agent page: see
[Packaging and wiring](./custom-agents.md#packaging-and-wiring) and
[Boot-time validation](./custom-agents.md#boot-time-validation). A gate whose `helperKind` resolves
to neither a built-in helper nor a registered container-capable kind fails there, loudly, at boot.

## Testing

A gate factory is a pure constructor, so test its real `wired()`/`probe()` path by wiring a fake
provider and building it with `stubGateContext()` (from `@cat-factory/kernel`), which defaults to the
real provider registry so a wired token shows through:

```ts
import { stubGateContext } from '@cat-factory/kernel'

it('passes on a clean change and fails on a dirty one', async () => {
  wireLicenseProvider({ check: async () => ({ clean: true, headSha: 'abc' }) })
  const gate = licenseCheckFactory(stubGateContext())
  expect(gate.wired()).toBe(true)
  expect((await gate.probe('ws', 'block', {} as any)).status).toBe('pass')

  wireLicenseProvider({ check: async () => ({ clean: false, headSha: 'abc' }) })
  expect((await licenseCheckFactory(stubGateContext()).probe('ws', 'block', {} as any)).status).toBe('fail')

  wireLicenseProvider(undefined) // clean up: unwired ⇒ the gate passes through
})
```
## Gotchas

- **A gate is a pass-through until its provider is wired.** Make `wired()` exactly
  `isProviderWired(token)` so it shares its source with `requireProvider(token)` inside `probe()`.
  Then `requireProvider` is safe: the engine only probes a gate whose `wired()` is true. A facade
  build resets gate providers and re-wires from config, so wire yours at startup, not lazily.
- **Reach providers through the registry, not a module global.** `defineProviderToken` once, wire at
  startup, read back through `ctx.getProvider` / `ctx.requireProvider`. A module-level `let` provider
  can leak across per-request facade builds.
- **A registered gate replaces a built-in of the same kind.** The engine builds its gate registry
  from whatever is registered and the last registration wins, so the same seam that adds a gate also
  customizes the shipped catalog. That is deliberate; it also means a typo in the `kind` silently
  adds a gate instead of replacing one.
- **Pick the seam that can do the job.** A resolver cannot park or loop a run, and a gate has no
  score. Reaching for a judge because a gate could not park is the common wrong turn, and it costs a
  model call on every run.
- **An investigate-only helper needs `resolveHelperCompletion`.** Without it the engine re-probes
  after the helper finishes, the verdict regresses, and the attempt budget burns down to
  `onExhausted` every time.

---

Next: [Add a Custom Agent Kind](./custom-agents.md) for the agent side of the same registry, or
[Set Up Your Deployment Repository](../deploy/deployment-repository.md) for where this code lives.
