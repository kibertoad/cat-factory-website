# Custom Agents & Gates (Code Adapters)

Cat Factory ships a full set of built-in agent kinds (Architect, Coder, Reviewer, Tester, and the
rest) and a set of built-in polling gates (CI, merge-conflicts, post-release health). Your team may
want ones of its own: a compliance auditor, a security scanner, an internal migration agent, a
bespoke reviewer that knows your house rules, a license-header gate that blocks a merge until every
file carries the company SPDX line. You can add agent kinds AND gates **from your own
[deployment repository](./deployment-repository.md)**, without forking the platform and without
rebuilding the executor-harness image.

A custom agent becomes a first-class citizen: a palette block in the pipeline builder, a step you can
chain into pipelines, a live result window, all from registering it once at startup. A custom gate
plugs into the same engine state machine the built-in gates use: a deterministic precheck that only
escalates to a helper agent on a negative verdict, looping until the precheck passes or an attempt
budget is spent. This page shows the model, the seams, worked examples, how to package and wire them,
and the gotchas.

::: tip This is a code extension
Unlike a [provider manifest](../reference/manifests.md), an agent or gate is code you write and ship
in your deployment repo. It is the supported way to extend the agent and gate sets; you don't need to
touch the core packages or the harness image. The built-in gate suite ships as one such package,
[`@cat-factory/gates`](../reference/packages.md), authored through the exact same `registerGate` seam
your deployment uses.
:::

## The mental model: three stages

Every agent, built-in or custom, decomposes into three stages. The container runs only the middle
one; the other two are plain backend TypeScript:

1. **`preOps`** (optional) run **before** the LLM step, on the backend. They read a targeted, known
   subset of the repo (and may commit) over a checkout-free [`RepoFiles`](#the-repofiles-port) port,
   no clone. Use one to load a baseline artifact into the agent's prompt.
2. **`agent`** (optional) is the LLM step, on one of three [surfaces](#agent-surfaces): an inline
   one-shot call, a read-only container explore, or a container coding run that edits and pushes.
3. **`postOps`** (optional) run **after** the agent returns, on the backend. They consume the agent's
   structured output (`ctx.result.custom`), render artifact files, and commit them over `RepoFiles`.

The guiding rule is that **mechanical, deterministic work lives in `preOps`/`postOps` as ordinary
TypeScript**, never as per-agent code inside the container. Because `RepoFiles` talks only HTTP (the
GitHub Git Data and contents API), those hooks run identically on every runtime: Cloudflare Worker,
Node, and local. The container, when used, runs the generic LLM-over-a-checkout agent, so a new kind
needs no harness change and no image rebuild.

An agent can use any subset of the three. The simplest custom agent is a single `inline` LLM call
with no hooks at all; the richest reads a baseline (`preOp`), explores the repo (`agent`), and
renders a committed report (`postOp`).

## The registration seam

A deployment teaches Cat Factory a new kind by calling `registerAgentKind` (or `registerAgentKinds`)
once at startup, an import side effect that mirrors the model-provider registry seam. Optionally
register a pipeline that chains your kinds with `registerPipeline`:

```ts
import { defineStructuredOutput, registerAgentKind } from '@cat-factory/agents'
import { registerPipeline } from '@cat-factory/kernel'
import * as v from 'valibot'

// One valibot schema is the whole structured-output story (see "Structured output" below).
const securityAssessment = defineStructuredOutput(
  v.object({
    risk: v.fallback(v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))), undefined),
    summary: v.fallback(v.optional(v.string()), undefined),
    findings: v.optional(/* … */ v.array(v.unknown()), []),
  }),
)

registerAgentKind({
  kind: 'security-auditor',
  systemPrompt:
    'You are a security auditor. Explore the repository (read-only) and assess the security ' +
    'posture of the current change. Return ONLY a JSON object: ' +
    '{ "risk": 0..1, "summary": "…", "findings": [{ "title": "…", "severity": "low|…|critical" }] }.',
  // The optional LLM step: where it runs. `agent.output` is auto-derived from the schema below.
  agent: {
    surface: 'container-explore',
    clone: { branch: 'pr' },
  },
  // The schema drives both the harness repair-call shapeHint and the post-op's typed parser.
  structuredOutput: securityAssessment,
  // Deterministic backend hooks: parse the output, render a file, commit it. Never in the container.
  postOps: [renderComplianceReportPostOp],
  // Display metadata → serialised into the workspace snapshot, so the kind becomes a palette block.
  presentation: {
    label: 'Security Auditor',
    icon: 'i-lucide-shield-check',
    color: '#ef4444',
    description: 'Read-only security audit; renders a compliance report into the repo.',
    category: 'review',
    resultView: 'generic-structured',
  },
})

registerPipeline({
  id: 'pl_org_audit',
  name: 'Org compliance audit',
  agentKinds: ['org-reviewer', 'security-auditor'],
})
```

The agent-kind id is a free-form string everywhere (pipelines, steps, presets), so a registered kind
needs no schema change. The registry replaces by id, so registering twice is safe.

### The agent-kind definition

`registerAgentKind` takes an `AgentKindDefinition` (from `@cat-factory/agents`):

| Field | Purpose |
| --- | --- |
| `kind` | The agent-kind id used in pipelines and steps (e.g. `security-auditor`). |
| `systemPrompt` | The role prompt: a string, or a `(kind) => string` to serve a family of kinds. |
| `agent?` | The LLM step's spec (`surface`, `output`, `clone`, `infra`). Omit for a pure pre/post-op kind with no LLM. |
| `structuredOutput?` | A `defineStructuredOutput(schema)` descriptor. When present and you didn't set `agent.output` by hand, `registerAgentKind` fills `agent.output` from it. See [Structured output](#structured-output-from-one-schema). |
| `preOps?` / `postOps?` | `RepoOp[]` deterministic backend hooks over `RepoFiles`. |
| `presentation?` | Display metadata: `label`, `icon`, `color`, `description`, `category`, `resultView`. |
| `userPrompt?` | A custom user-prompt builder; omit for the generic block-context prompt. |
| `traits?` | Capability traits: `code-aware` folds in the service's best-practice fragments, `spec-aware` appends the in-repo-spec reading guidance. |
| `configContributions?` | Task-level config fields this kind surfaces on the new-task form and inspector. |
| `webResearchHint?` | A one-clause nudge for when this kind should reach for web search. |

A `container-*` surface implies a checkout automatically, so you don't also set `requiresContainer`.
`presentation.resultView` is a typed picklist (`generic-structured`, `gate`, `tester`, and the rest
of `RESULT_VIEW_IDS` from `@cat-factory/contracts`); an unknown id fails
[boot-time validation](#boot-time-validation) instead of silently falling back to prose.

### Agent surfaces

The `agent.surface` decides where the LLM step runs:

| Surface | What it does | Typical use |
| --- | --- | --- |
| `inline` | One-shot LLM call over the block context. No repo, no container. | A reviewer or classifier that judges the description. |
| `container-explore` | Clones the repo **read-only**, explores, returns prose or structured JSON (surfaced as `result.custom`). Never pushes. | An auditor or analyzer whose output a `postOp` turns into a committed artifact. |
| `container-coding` | Clones, edits a working tree, commits and pushes, optionally opens a PR. | A custom code-writing or migration agent. |

For a container surface, `clone.branch` picks what to check out (`base`, `pr`, or `work`), and a
coding agent's `infra` (`none` / `compose` / `ephemeral-url`) controls whether dependencies are stood
up. For structured output, declare a [`structuredOutput` schema](#structured-output-from-one-schema)
rather than setting `agent.output` by hand.

### Structured output from one schema

A `container-explore` or `inline` kind whose deliverable is JSON declares one valibot schema with
`defineStructuredOutput` (from `@cat-factory/agents`). That single schema produces both:

- the `agent.output` spec, including the `shapeHint` the harness's one-shot repair call sees when the
  first JSON parse fails (`registerAgentKind` fills `agent.output` from `structuredOutput` when you
  didn't set it by hand), and
- a typed `parse` (strict, throws) and `safeParse` (lenient, returns `undefined` on a malformed
  reply) that your post-ops and step resolvers call on `ctx.result.custom`.

```ts
import { defineStructuredOutput } from '@cat-factory/agents'
import * as v from 'valibot'

const securityAssessment = defineStructuredOutput(
  v.object({
    // Wrap each constrained field in `v.fallback(v.optional(…), default)` so ONE noisy field
    // (a model reporting risk on a 0..100 scale, say) degrades to its default instead of failing
    // the whole parse, so `safeParse` returns a usable object rather than `undefined`.
    risk: v.fallback(v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))), undefined),
    summary: v.fallback(v.optional(v.string()), undefined),
    findings: v.optional(
      v.fallback(
        v.array(
          v.fallback(
            v.object({
              title: v.fallback(v.string(), 'Untitled finding'),
              detail: v.fallback(v.optional(v.string()), undefined),
              severity: v.fallback(
                v.optional(v.picklist(['low', 'medium', 'high', 'critical'])),
                undefined,
              ),
            }),
            { title: 'Untitled finding' },
          ),
        ),
        [],
      ),
      [],
    ),
  }),
)

// The inferred type flows straight from the schema (no duplicate interface to keep in sync).
type SecurityAssessment = ReturnType<typeof securityAssessment.parse>
```

The schema replaces the hand-written `shapeHint` string plus a separate lenient coercer. Build it
from `v.fallback` / `v.optional` so `safeParse` degrades a present-but-invalid field to its default
rather than dropping the whole assessment. Override the auto-derived hint with the `shapeHint` option
when the schema walker's output is worse than a hand-written one, and set `failOnUnusableFinal: true`
for a kind whose deliverable IS the JSON (fail the run loudly on a truncated final answer rather than
laundering it through repair).

## Example: an inline policy reviewer

The smallest useful custom agent is a single inline call, no repo, no hooks. It works end to end with
nothing but the import:

```ts
import { registerAgentKind } from '@cat-factory/agents'

registerAgentKind({
  kind: 'org-reviewer',
  systemPrompt:
    'You are an organisation policy reviewer. Review the change description against the ' +
    "company's engineering policies (security, data-handling, accessibility) and report any " +
    'concerns, with a clear pass/fail recommendation.',
  agent: { surface: 'inline' },
  presentation: {
    label: 'Org Policy Reviewer',
    icon: 'i-lucide-scale',
    color: '#f59e0b',
    description: "Reviews a change against the company's engineering policies.",
    category: 'review',
  },
})
```

Drop it into a pipeline and it runs like any other inline reviewer, its prose verdict shown in the
step's result panel.

## Example: a container auditor that commits a report

A richer agent explores the checkout, returns structured JSON, and lets a `postOp` render that JSON
into a file committed back to the branch. The mechanical render is deterministic backend code, never
a per-kind branch inside the container.

### The post-op

A `RepoOp` receives a `RepoOpContext` and does its work over the checkout-free `RepoFiles`:

```ts
import type { RepoOp } from '@cat-factory/kernel'
// `securityAssessment` is the defineStructuredOutput descriptor from the schema above.

const REPORT_PATH = 'compliance/REPORT.md'

// Render the auditor's structured assessment to a Markdown file and commit it onto the run's branch.
const renderComplianceReportPostOp: RepoOp = async (ctx) => {
  // safeParse returns undefined on a malformed reply, so the no-op guard holds: a malformed run
  // commits nothing rather than an empty report. The lenient `v.fallback` defaults in the schema
  // do the degrading, so there is no separate hand-written coercer to keep in sync.
  const assessment = securityAssessment.safeParse(ctx.result?.custom)
  if (!assessment) return

  const content = renderComplianceReport(assessment)

  // IDEMPOTENT: the render is deterministic, so read what's already on the branch and skip the
  // commit when the bytes match. A durable-driver replay can re-enter a post-op after its commit
  // landed but before the run state persisted; without this guard you'd push a duplicate commit.
  const existing = await ctx.repo.getFile(REPORT_PATH, ctx.branch)
  if (existing?.content === content) return

  await ctx.repo.commitFiles({
    branch: ctx.branch,
    message: 'chore(compliance): update security audit report',
    files: [{ path: REPORT_PATH, content }],
  })
}
```

Two patterns make this production-grade and are worth copying into your own post-ops:

- **Parse leniently with `safeParse`.** A model may omit fields or return a slightly different
  shape. The schema's `v.fallback` defaults degrade a noisy field rather than failing the whole
  parse; `safeParse` returns `undefined` only when nothing is usable, so a malformed run produces no
  commit.
- **Make the commit idempotent.** Render deterministically (same input, same bytes), read the
  existing file, and skip the commit when it's identical.

### The kind

```ts
import { registerAgentKind } from '@cat-factory/agents'

registerAgentKind({
  kind: 'security-auditor',
  systemPrompt:
    'You are a security auditor. Explore the repository (read-only) and assess the security ' +
    'posture of the current change. Return ONLY a JSON object: { "risk": 0..1, "summary": "…", ' +
    '"findings": [{ "title": "…", "detail": "…", "severity": "low|medium|high|critical" }] }.',
  agent: {
    surface: 'container-explore',
    clone: { branch: 'pr' },
  },
  // The schema is the single source for the harness repair shapeHint AND the post-op's parser.
  structuredOutput: securityAssessment,
  postOps: [renderComplianceReportPostOp],
  presentation: {
    label: 'Security Auditor',
    icon: 'i-lucide-shield-check',
    color: '#ef4444',
    description: 'Read-only security audit of the change; renders a compliance report into the repo.',
    category: 'review',
    // Open the structured JSON in the shared generic viewer (no bespoke UI to build).
    resultView: 'generic-structured',
  },
})
```

Setting `resultView: 'generic-structured'` gives the kind a usable result window for free: the
agent's `result.custom` JSON renders read-only in the shared structured viewer, so a custom agent
gets a real result screen with no frontend work.

## The `RepoFiles` port

Your hooks read and write the repo over `RepoFiles` (from `@cat-factory/kernel`), bound to the run's
repo and installation. It is HTTP-only, so it works the same on the Worker (no filesystem) and on
Node:

| Method | Use |
| --- | --- |
| `getFile(path, gitRef?)` | Read a file's content + sha, or `null` if absent. Load a baseline in a pre-op, or read the prior artifact for change detection in a post-op. |
| `listDirectory(path, gitRef?)` | List a directory's entries (or `[]`). Seed files only when they don't already exist. |
| `headSha(branch)` | The branch's head sha, or `null` if it doesn't exist yet (your branch may precede the coder). |
| `createBranch(branch, fromSha)` | Create a branch at a sha. |
| `commitFiles(input)` | Commit (and optionally delete) a set of files in one commit. |
| `openPullRequest(input)` | Open a PR (idempotent: returns the existing one if it matches). |

The `RepoOpContext` your hook receives carries `repo` (the bound `RepoFiles`), `context` (the
run/block/task context, including branch and prior outputs), `branch` (the resolved branch to
read/write), and `result` (the finished agent's result, present for `postOps` only).

When GitHub isn't connected, the engine skips the hooks rather than failing, so an unconfigured
workspace runs unchanged.

## Custom gates

A gate is the other half of the extension story. Where an agent does work, a gate decides whether the
work is even needed: it runs a deterministic programmatic precheck against a data source you supply
and only escalates to a helper agent on a negative verdict, looping until the precheck passes or an
attempt budget is spent. The built-in `ci`, `conflicts`, and `post-release-health` gates work this
way, and they ship as [`@cat-factory/gates`](../reference/packages.md), a package authored through the
same `registerGate` seam your deployment uses. So the engine owns the shared state machine (re-attach
on replay, init and persist `step.gate`, dispatch the helper, count attempts, emit); your gate is the
small `GateDefinition` describing what makes it different.

### The gate registration seam

A deployment registers a gate by calling `registerGate(kind, factory)` (from `@cat-factory/kernel`)
once at startup, an import side effect that mirrors `registerAgentKind`. The `kind` is the step
`agentKind` the gate gates; the factory is `(ctx: GateContext) => GateDefinition`, invoked once when
the engine builds its gate registry. A registered gate replaces a built-in of the same kind, so you
can both add new gates and customize the built-in catalog (last registration wins).

```ts
import {
  defineProviderToken,
  isProviderWired,
  registerGate,
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

// 2. Register the gate. `license-fixer` is a registered container-coding agent kind (see above)
//    that adds the missing headers and pushes, like the built-in ci-fixer relates to ci.
registerGate('license-check', (ctx) => ({
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

### The `GateProbe` verdict

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

### The `GateDefinition` fields

`registerGate`'s factory returns a `GateDefinition`:

| Field | Purpose |
| --- | --- |
| `kind` | The step `agentKind` this gate gates (matches the `registerGate` key). |
| `helperKind` | The container agent kind dispatched on a failed precheck. Must be a built-in helper (`ci-fixer`, `conflict-resolver`, `on-call`) or a registered container-capable kind, or [boot validation](#boot-time-validation) fails. |
| `wired()` | Whether the gate's provider is configured. When false the gate is a pass-through. Make this `isProviderWired(token)` so it shares its source with `requireProvider`. |
| `unwiredOutput` | Step output recorded when the gate passes through unwired. |
| `probe(...)` | Run the precheck and classify it as a `GateProbe`. Receives the live `GateStepState` so a time-windowed gate can read its `watchSince`. |
| `onExhausted(args)` | Run when the attempt budget is spent (or there is no async executor to escalate to). May raise a notification; returns the message used to fail the run. |
| `pollExhaustion?` | `fail` (default) or `pass`. A time-windowed watch gate (like post-release-health) uses `pass`: running out of polls with no regression seen is a healthy result, not a timeout failure. |
| `attemptBudget?(preset)` | The helper-attempt budget, resolved from the task's merge preset. Defaults to `ciMaxAttempts`. |
| `helperPriorOutput?(summary)` | Extra context handed to the helper on escalation. |
| `gatherHelperPriorOutputs?(...)` | Async builder for richer helper context gathered at dispatch time; takes precedence over `helperPriorOutput`. |
| `resolveHelperCompletion?(args)` | See below: settle the gate from the helper's result instead of re-probing. |

### The `GateContext` seams

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

### Step-completion resolvers

A step-completion resolver is the related seam for deterministic backend work that must run after an
agent step finishes, keyed by `agentKind` and driven from the agent's structured result, not from
re-prompting. Register one with `registerStepResolver(kind, factory)` (from `@cat-factory/kernel`),
where the factory is `(ctx: ResolverContext) => StepCompletionResolver`. The engine runs the matching
resolver in `recordStepResult` once the step's agent finishes, regardless of the step's position in
the pipeline.

```ts
import { registerStepResolver, type StepCompletionResolver } from '@cat-factory/kernel'

const auditorSummaryResolver: StepCompletionResolver = {
  kind: 'security-auditor',
  applies: (result) => result.custom !== undefined, // no-op when the agent produced nothing
  resolve: async ({ result }) => {
    const assessment = securityAssessment.safeParse(result.custom)
    if (!assessment) return { output: 'Security audit complete: result was not parseable.' }
    return { output: `Security audit complete: ${assessment.findings?.length ?? 0} finding(s).` }
  },
}

registerStepResolver(auditorSummaryResolver.kind, () => auditorSummaryResolver)
```

A resolver returns a `StepResolution`: an optional replacement `output` (a human-readable summary the
run-detail UI shows), and an optional `ownsTerminalStatus` flag for a resolver that decides the
block's terminal status itself. The built-in `merger` is such a resolver: it performs the real GitHub
merge with backend-held credentials the sandboxed agent does not have, and flips the block to `done`
or `pr_ready`. It stays a privileged built-in (it needs engine-internal access), so a custom resolver
is the lighter archetype: act on the `result` it receives and reach any external system through a
provider it closes over.

### Wiring a gate's provider at startup

A gate (or resolver) reaches its data source through the typed provider registry. You
`defineProviderToken` once, export a one-line `wireX`, and the facade calls it at startup after
importing your package. Until the provider is wired, `wired()` returns false and the gate is a
harmless pass-through, so a bare `import '@your-org/org-gates'` is always safe.

The built-in gates wire the same way. `@cat-factory/gates` exports `wireCiStatusProvider`,
`wireMergeabilityProvider`, `wireReleaseHealthProvider`, and `wireIncidentEnrichment` (plus
`applyGateProviders` for wiring a bag at once); the facade builds the GitHub-backed impls and hands
them in. See [`@cat-factory/gates`](../reference/packages.md).

### Boot-time validation

A facade calls `validateRegistrationsOnce()` (from `@cat-factory/orchestration`) once at boot, after
every `register*` side-effect import and provider wiring, before serving. It turns
misconfigurations that would otherwise surface mid-run, or silently, into a loud startup error:

- a gate `helperKind` that resolves to neither a built-in helper nor a registered container-capable
  kind,
- an `agent` kind whose `presentation.resultView` is not a known view id,
- a registered pipeline naming a kind that doesn't exist (checked when a known built-in catalog is
  supplied), and
- (as a warning) a kind with `postOps` whose agent step declares no structured output, so the
  post-ops would read an empty `result.custom`.

The Node and Cloudflare facades already call it; if you write your own composition root, call it
after your imports. `collectRegistrationProblems()` is the non-throwing form for tests and for logging
warnings without aborting.

## Packaging and wiring

A custom agent (or gate) is a small package in your [deployment repository](./deployment-repository.md).
It depends only on the public packages and registers on import:

```jsonc
// packages/org-agents/package.json
{
  "name": "@your-org/org-agents",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "dependencies": {
    "@cat-factory/agents": "^<version>",
    "@cat-factory/kernel": "^<version>"
  }
}
```

```ts
// packages/org-agents/src/index.ts
import { registerAgentKinds } from '@cat-factory/agents'
import { registerGate, registerPipeline, registerStepResolver } from '@cat-factory/kernel'
// … kind definitions, post-ops, the license-check gate factory + resolver as above …

registerAgentKinds([ORG_REVIEWER, SECURITY_AUDITOR, LICENSE_FIXER])
registerGate('license-check', licenseCheckFactory)
registerStepResolver('security-auditor', () => auditorSummaryResolver)
registerPipeline({ id: 'pl_org_audit', name: 'Org compliance audit', agentKinds: ['org-reviewer', 'security-auditor'] })
```

Then import the package **once for its side effect** in your backend entry, before the server starts,
and wire any gate's provider. Registration is a global in-process effect, so this is all the wiring
there is, no `buildContainer` seam, no per-call injection:

```ts
// deploy/backend/src/main.ts  (Node service)
import '@your-org/org-agents'              // registers the kinds, gate, resolver, pipeline
import { wireLicenseProvider } from '@your-org/org-agents'
import { start, buildNodeContainer } from '@cat-factory/node-server'

wireLicenseProvider(new GitHubLicenseProvider(/* … */))   // arm the gate; unwired ⇒ pass-through

start({ buildContainer: buildNodeContainer }).catch((err) => {
  console.error(err)
  process.exit(1)
})
```

```ts
// deploy/local/src/main.ts  (local mode)
import '@your-org/org-agents'
import { startLocal } from '@cat-factory/local-server'

startLocal().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

::: tip No frontend rebuild
The backend serialises every registered kind's `presentation` into the workspace snapshot, and the
SPA merges them into its palette on load. So importing the package on the backend is enough; the
prebuilt frontend picks the new kind up with no rebuild.
:::

After that, link a repo and run a pipeline that includes your kinds (or the pipeline you registered).
A brand-new repo-writing agent, or a gate that blocks the merge, ships with zero harness changes.

## Testing

Pre/post-ops are plain functions over `RepoFiles`, so test them with a fake repo and no network:

```ts
import { describe, it, expect } from 'vitest'

it('renders and commits the report from the agent output', async () => {
  const committed: { path: string; content: string }[] = []
  const repo = {
    getFile: async () => null,                       // nothing on the branch yet
    commitFiles: async (input) => { committed.push(...input.files); return { sha: 'abc' } },
    // listDirectory / headSha / createBranch / openPullRequest as needed
  }

  await renderComplianceReportPostOp({
    repo: repo as any,
    branch: 'feature/x',
    context: {} as any,
    result: { custom: { risk: 0.4, summary: 'ok', findings: [] } } as any,
  })

  expect(committed[0].path).toBe('compliance/REPORT.md')
  expect(committed[0].content).toContain('Overall risk')
})
```

Cover the seams that bite: a missing or malformed `result.custom` (commits nothing), an unchanged
artifact (skips the commit), and a noisy field that `safeParse` degrades to its default.

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

- **Keep mechanical work in the hooks.** Anything deterministic (rendering a file,
  computing a path, pruning a stale artifact) belongs in a `preOp`/`postOp` as TypeScript. Asking the
  LLM to "also write the file" is slower, costs tokens, and is non-deterministic.
- **Parse the agent's output; never trust the shape.** Treat `result.custom` as untrusted JSON.
  Declare a `structuredOutput` schema with `v.fallback` defaults so `safeParse` degrades a noisy
  field rather than dropping the whole assessment, and make a malformed run a no-op rather than a
  crash.
- **Make every post-op idempotent.** A durable-execution replay can re-enter a post-op after its
  commit landed but before the run state persisted. Render deterministically, compare against what's
  already on the branch, and skip an identical commit.
- **Pick the right surface.** Use `inline` when the judgement is about the description.
  Use `container-explore` for read-only analysis whose product is a rendered artifact. Reserve
  `container-coding` for agents that genuinely edit and push.
- **Choose the clone branch deliberately.** `pr` reviews the change under test, `base` reads the
  merge target, `work` reads the shared work branch. The wrong one audits the wrong code.
- **A gate is a pass-through until its provider is wired.** Make `wired()` exactly
  `isProviderWired(token)` so it shares its source with `requireProvider(token)` inside `probe()`.
  Then `requireProvider` is safe: the engine only probes a gate whose `wired()` is true. A facade
  build resets gate providers and re-wires from config, so wire yours at startup, not lazily.
- **Reach providers through the registry, not a module global.** `defineProviderToken` once, wire at
  startup, read back through `ctx.getProvider` / `ctx.requireProvider`. A module-level `let` provider
  can leak across per-request facade builds.
- **Validate at boot.** Let the facade's `validateRegistrationsOnce()` run. A typo'd gate
  `helperKind`, an unknown `resultView`, or a pipeline naming a missing kind then fails loudly at
  startup instead of mid-run.
- **Custom agents and gates run alongside the built-ins.** This is the supported extension path and
  is covered by the cross-runtime conformance suite, so a kind or gate behaves identically on
  Cloudflare, Node, and local. The built-in gate suite is authored through this exact `registerGate`
  seam and ships as [`@cat-factory/gates`](../reference/packages.md); the engine builds its gate
  registry from whatever is registered, with a registered kind replacing a built-in of the same id.
  Built-in agent kinds (architect, coder, and the rest) keep their prompts in the platform's own
  prompt catalog rather than calling `registerAgentKind`, but a registered kind gets the same prompt
  guardrails and result-view wiring a built-in does, and a registered id that collides with a
  built-in track reuses that track's prompt.

---

For where this code lives and how the deployment workspace is laid out, see
[Your Deployment Repository](./deployment-repository.md). For the built-in gate suite this seam
authors, see [`@cat-factory/gates`](../reference/packages.md). For extending infrastructure
(environments and runner pools) the same way, see
[Custom Providers (Code Adapters)](./custom-providers.md).
