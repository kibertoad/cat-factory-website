# Custom Agents & Gates (Code Adapters)

Cat Factory ships a full set of built-in agent kinds (Architect, Coder, Reviewer, Tester, and the
rest) and a set of built-in gates (CI, merge-conflicts, post-release health, and the
[document-quality gate](#the-document-quality-gate)). Your team may
want ones of its own: a compliance auditor, a security scanner, an internal migration agent, a
bespoke reviewer that knows your house rules, a license-header gate that blocks a merge until every
file carries the company SPDX line. You can add agent kinds AND gates **from your own
[deployment repository](./deployment-repository.md)**, without forking the platform and without
rebuilding the executor-harness image.

A custom agent becomes a first-class citizen: a palette block in the pipeline builder, a step you can
chain into pipelines, a live result window, all from registering it once at startup. A custom gate
plugs into the same engine state machine the built-in gates use: a deterministic precheck that only
escalates to a helper agent on a negative verdict, looping until the precheck passes or an attempt
budget is spent. A [custom judge](#custom-judges) is the third shape: a rubric-scored assessment that
can advance, park, or send the work back. This page shows the model, the seams, worked examples, how
to package and wire them, and the gotchas.

::: tip This is a code extension
Unlike a [provider manifest](../reference/manifests.md), an agent or gate is code you write and ship
in your deployment repo. It is the supported way to extend the agent and gate sets; you don't need to
touch the core packages or the harness image. The built-in gate suite ships as one such package,
[`@cat-factory/gates`](../reference/packages.md), authored through the exact same gate-registry seam
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

Every extension point is an app-owned registry the composition root builds once and the start
function injects. Your deployment news the registry, registers on it by reference, and passes it in.
There are no module globals, so registration order and module identity never matter:

```ts
import { start, defaultAgentKindRegistry, defaultPipelineRegistry } from '@cat-factory/node-server'
import { defineStructuredOutput } from '@cat-factory/agents'
import * as v from 'valibot'

const agentKindRegistry = defaultAgentKindRegistry()
const pipelineRegistry = defaultPipelineRegistry()

// … register on them (below) …

await start({ agentKindRegistry, pipelineRegistry })
```

`startLocal()` takes the same options, and the Cloudflare Worker takes them through
`createWorker({ overrides: { … } })`. See
[Register your platform data in code](./deployment-repository.md#_5-register-your-platform-data-in-code)
for the full list of registries.

Each registry exposes `register(definition)` and `registerAll(definitions)`, replacing by id, so
registering twice is safe. `PipelineRegistry` also has `retire(id)` for dropping a built-in pipeline
you do not want offered.

```ts
import { defineStructuredOutput } from '@cat-factory/agents'
import * as v from 'valibot'

// One valibot schema is the whole structured-output story (see "Structured output" below).
const securityAssessment = defineStructuredOutput(
  v.object({
    risk: v.fallback(v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))), undefined),
    summary: v.fallback(v.optional(v.string()), undefined),
    findings: v.optional(/* … */ v.array(v.unknown()), []),
  }),
)

agentKindRegistry.register({
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

pipelineRegistry.register({
  id: 'pl_org_audit',
  name: 'Org compliance audit',
  agentKinds: ['org-reviewer', 'security-auditor'],
})
```

The agent-kind id is a free-form string everywhere (pipelines, steps, presets), so a registered kind
needs no schema change. The registry replaces by id, so registering twice is safe.

### The agent-kind definition

`register` takes an `AgentKindDefinition` (from `@cat-factory/agents`):

| Field | Purpose |
| --- | --- |
| `kind` | The agent-kind id used in pipelines and steps (e.g. `security-auditor`). |
| `systemPrompt` | The role prompt: a string, or a `(kind) => string` to serve a family of kinds. |
| `agent?` | The LLM step's spec (`surface`, `output`, `clone`, `infra`). Omit for a pure pre/post-op kind with no LLM. |
| `structuredOutput?` | A `defineStructuredOutput(schema)` descriptor. When present and you didn't set `agent.output` by hand, the registry fills `agent.output` from it. See [Structured output](#structured-output-from-one-schema). |
| `preOps?` / `postOps?` | `RepoOp[]` deterministic backend hooks over `RepoFiles`. |
| `presentation?` | Display metadata: `label`, `icon`, `color`, `description`, `category`, `tier`, `resultView`. |
| `userPrompt?` | A custom user-prompt builder; omit for the generic block-context prompt. |
| `traits?` | [Capability traits](#traits) this kind carries. |
| `skills?` | [Skills](#skills-and-tool-servers) the kind applies: a registered bundled id, an inline bundled skill, or a catalog reference. |
| `toolServers?` | [MCP tool servers](#skills-and-tool-servers) the kind may call: a registered id or an inline definition. |
| `configContributions?` | Task-level config fields this kind surfaces on the new-task form and inspector. |
| `standardsDelivery?` | `prompt` (default) folds resolved best-practice standards into the system prompt; `context-files` leaves the kind's own preOp to write them as `.cat-context/` files. Use the second for a kind that delegates to subagents, where folding charges the delegating agent on every turn while the subagents never see them. |
| `tuning?` | Per-kind progress-guard overrides folded into a container dispatch. Loosen-only: the harness clamps each override up to its base, so a custom kind can raise a limit but never tighten one. |
| `gatable?` | Whether a pipeline may estimate-gate a step of this kind. |
| `fanOutMultiRepo?` | For a container kind, resolve the block's connected involved-service repos as sibling checkouts. |
| `webResearchHint?` | A one-clause nudge for when this kind should reach for web search. |

#### Traits

A trait is a capability the engine acts on when it assembles the prompt. Trait ids are free-form, so
a deployment can define its own with `registry.registerTrait(definition)` and attach it to a built-in
kind with `registry.assignTraits(kind, traits)`. The ones the platform reads:

| Trait | Effect |
| --- | --- |
| `code-aware` | Folds the running service's selected best-practice fragments into the prompt. |
| `doc-aware` | Folds the block's selected writing-style fragments in. |
| `spec-aware` | Appends the in-repo-spec reading guidance. |
| `brief-standards` | Delivers a condensed form of the standards, for implementer kinds. |
| `foundational-catalog` | Hands the kind the [foundational-services catalog](../guide/foundational-services.md) and requires it to declare which services its design consumes. |
| `foundational-contracts` | Hands the kind the full API contracts of the services a design declared. |
| `binary-storage` | The kind uploads to the platform's binary-artifact store (run evidence such as screenshots). |
| `binary-output` | The kind generates product binaries stored through a foundational service. See [Binary-output steps](../guide/running-pipelines.md#binary-output-steps). |
| `interview-gate` | The kind conducts a clarification interview before proceeding. |

#### Skills and tool servers

A kind declares the procedural playbooks it applies and the MCP servers it may call. Both are
references resolved per dispatch and wired into whichever agent CLI the run uses.

A **skill** takes one of three forms. A **bundled** skill ships in your own package code, so a company
agent carries its playbook with no skill library, no GitHub connection, and no repo sync:

```ts
agentKindRegistry.registerSkill({
  id: 'acme-incident-playbook',
  name: 'incident-playbook',
  description: 'How Acme triages a production incident.',
  instructions: '# Incident playbook\n\n1. …',
  resources: [{ relPath: 'severity-matrix.md', content: '…' }],
})

agentKindRegistry.register({ kind: 'acme-on-call', skills: ['acme-incident-playbook'], /* … */ })
```

You can also pass the definition inline for a one-off, or reference an account-tier repo-synced
[skill](../guide/skills.md) with `{ catalogSkillId: 'src:<sourceId>:<dirName>' }`. A catalog reference
is required by default: if the library is unconfigured or the skill was removed, the dispatch fails
rather than running work nobody asked for. Pass `optional: true` to skip it with a note instead.

A **tool server** is an MCP server, `stdio` or HTTP:

```ts
agentKindRegistry.registerToolServer({
  id: 'acme-tracker',
  label: 'Acme Tracker',
  guidance: 'Look up an incident\'s history before proposing a fix.',
  transport: { kind: 'http', url: 'https://tracker.acme.dev/mcp' },
  allowedTools: ['search_incidents', 'get_incident'],
  secretKeys: [{ key: 'ACME_TRACKER_TOKEN', header: 'Authorization', headerTemplate: 'Bearer {value}' }],
})
```

Credentials are declared by name and resolved at dispatch from the deployment environment; the value
rides the job body only and never reaches a prompt. An HTTP server must be `https` or loopback,
refused at registration and again at the harness job boundary, since its credential rides a header.
`guidance` is what turns a wired server into a used one; without it an agent tends to ignore a tool it
was handed.

A `key` may not name a variable the platform's own configuration owns. For a `stdio` server whose
client reads a documented variable name inside a reserved prefix, split the two:
`{ key: 'ACME_GITHUB_TOKEN', envName: 'GITHUB_PERSONAL_ACCESS_TOKEN' }`. A secret that does not
resolve drops the whole server, with a note in the prompt, unless you mark it `required: false`.

`allowedTools` is scoping, not a security boundary. It is always stated in the prompt and passed to
the claude-code CLI's `--allowedTools`, but the run's permission mode decides whether the CLI treats
it as a gate, and some harnesses cannot express a per-tool restriction. A server whose other tools a
kind must genuinely never reach should not be wired for that kind at all. A server the run's harness
cannot serve is stated to the agent as unavailable rather than silently dropped.

Attach either to a **built-in** kind without redefining its prompt, which is how a stock `coder` or
`pr-reviewer` gets your house playbook or your tracker:

```ts
agentKindRegistry.assignSkills('coder', ['acme-house-style'])
agentKindRegistry.assignToolServers('pr-reviewer', ['acme-tracker'])
```

Boot validation errors on an unresolved skill or tool-server id.

#### Kind variants

A variant is an alternate prompt for an existing kind, selected per step through
`stepOptions.agentVariantId`. Register one with `agentKindRegistry.registerVariant(definition)`. A
variant is deliberately not a kind: it never appears in the palette as its own entry, never answers a
lookup by kind, and never changes a behavioural answer such as whether the step needs a container.
Use it when the job is the same and only the instructions differ.

#### Interface tier

`presentation.tier` places the kind on the pipeline builder's palette ladder: `basic`,
`intermediate`, or `advanced`. Tiers are cumulative, so selecting a level shows that tier and every
tier below it, and a long catalog stays navigable for someone who only runs the delivery loop.

A kind that declares no tier is treated as `intermediate`. That is deliberate: a deployment's custom
kind is not part of the delivery loop everyone runs, so it stays out of the default view until the
deployment says otherwise by declaring `tier: 'basic'`.

#### Generative binary integrations

A kind carrying the `binary-output` trait produces binary artifacts. What makes them is a separate
registration: the image, music, video, or 3D APIs your deployment pays for, declared on the
`BinaryGeneratorRegistry` so a pipeline step can select among them.

```ts
binaryGeneratorRegistry.register({
  id: 'acme-image',
  name: 'Acme Image API',
  summary: 'Photoreal product shots and stylised concept art.',
  description: 'Good at product photography on a plain background. Not for text-heavy layouts.',
  modalities: ['image'],
  mediaTypes: ['image/png', 'image/webp'],
  endpoint: 'https://api.acme.dev/v1',
  guidance: 'Submissions are async: POST /jobs, then poll /jobs/{id} until state is done.',
  credential: { key: 'ACME_IMAGE_KEY' },
  contracts: [{ contractId: 'openapi', format: 'openapi', title: 'HTTP API', body: acmeImageSpec }],
})
```

| Field | Purpose |
| --- | --- |
| `modalities` | The content types it produces: `image`, `audio`, `video`, `3d-model`, `3d-scene`, `document`. At least one. This is what the admission coverage check compares a step's requirements against. |
| `mediaTypes?` | The concrete formats it can emit. Absent means only the coarse modalities are known, and the brief says so rather than implying every format of that modality is available. |
| `endpoint?` | The API's base URL, so the agent does not infer one from the contract. Must be `https` or loopback, since the credential rides the request. |
| `guidance?` | Operating notes folded into the brief verbatim: polling an async job, whether a payload comes back base64 or as a signed URL, a rate limit worth respecting. This is where you put what would otherwise be rediscovered once per run. |
| `credential?` | Declared by name (`key`), optionally delivered under a different variable (`envName`). The value never reaches a prompt. |
| `contracts?` | API contract documents in the same formats the [foundational catalog](../guide/foundational-services.md) accepts, injected as `.cat-context/` files so the agent calls declared operations instead of inventing them. |

`description` is the half a model needs to choose between two registered generators of the same
modality: style, resolution or length limits, cost profile. The platform deliberately provides no
discriminator field for that, because those axes do not partition the deliverable and a rule built on
one would refuse correctly-configured steps.

The pipeline builder's picker and the run-admission check read the same registration, so a step
configured from the picker is never refused at start as an unknown integration, even on a split
deployment whose processes are on different builds.

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
  first JSON parse fails (the registry fills `agent.output` from `structuredOutput` when you
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
agentKindRegistry.register({
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
agentKindRegistry.register({
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
same gate-registry seam your deployment uses. So the engine owns the shared state machine (re-attach
on replay, init and persist `step.gate`, dispatch the helper, count attempts, emit); your gate is the
small `GateDefinition` describing what makes it different.

### The gate registration seam

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

// 2. Register the gate. `license-fixer` is a registered container-coding agent kind (see above)
//    that adds the missing headers and pushes, like the built-in ci-fixer relates to ci.
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

The factory returns a `GateDefinition`:

| Field | Purpose |
| --- | --- |
| `kind` | The step `agentKind` this gate gates (matches the registration key). |
| `helperKind` | The container agent kind dispatched on a failed precheck. Must be a built-in helper (`ci-fixer`, `conflict-resolver`, `on-call`) or a registered container-capable kind, or [boot validation](#boot-time-validation) fails. |
| `wired()` | Whether the gate's provider is configured. When false the gate is a pass-through. Make this `isProviderWired(token)` so it shares its source with `requireProvider`. |
| `unwiredOutput` | Step output recorded when the gate passes through unwired. |
| `probe(...)` | Run the precheck and classify it as a `GateProbe`. Receives the live `GateStepState` so a time-windowed gate can read its `watchSince`. |
| `onExhausted(args)` | Run when the attempt budget is spent (or there is no async executor to escalate to). May raise a notification; returns the message used to fail the run. |
| `pollExhaustion?` | `fail` (default) or `pass`. A time-windowed watch gate (like post-release-health) uses `pass`: running out of polls with no regression seen is a healthy result, not a timeout failure. |
| `attemptBudget?(policy)` | The helper-attempt budget, resolved from the task's risk policy. Defaults to `ciMaxAttempts`. |
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

### Wiring a gate's provider at startup

A gate (or resolver) reaches its data source through the typed provider registry. You
`defineProviderToken` once, export a one-line `wireX`, and the facade calls it at startup after
importing your package. Until the provider is wired, `wired()` returns false and the gate is a
harmless pass-through, so a bare `import '@your-org/org-gates'` is always safe.

The built-in gates wire the same way. `@cat-factory/gates` exports `wireCiStatusProvider`,
`wireMergeabilityProvider`, `wireReleaseHealthProvider`, and `wireIncidentEnrichment` (plus
`applyGateProviders` for wiring a bag at once); the facade builds the GitHub-backed impls and hands
them in. See [`@cat-factory/gates`](../reference/packages.md).

### The document-quality gate

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
[Document Tasks → Templates](../guide/documents.md#templates-and-examples)) or register one at startup
with `registerDocTemplate` (from `@cat-factory/agents`). Passing the `documentRepository` above is what lets a workspace-linked template
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
It depends only on the public packages, exports its definitions, and installs them onto the registries
its caller passes in:

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
import type { AgentKindRegistry } from '@cat-factory/agents'
import type { GateRegistry, PipelineRegistry, StepResolverRegistry } from '@cat-factory/kernel'
// … kind definitions, post-ops, the license-check gate factory + resolver as above …

export function installOrgAgents(registries: {
  agentKinds: AgentKindRegistry
  gates: GateRegistry
  pipelines: PipelineRegistry
  stepResolvers: StepResolverRegistry
}): void {
  registries.agentKinds.registerAll([ORG_REVIEWER, SECURITY_AUDITOR, LICENSE_FIXER])
  registries.gates.register('license-check', licenseCheckFactory)
  registries.stepResolvers.register('security-auditor', () => auditorSummaryResolver)
  registries.pipelines.register({
    id: 'pl_org_audit',
    name: 'Org compliance audit',
    agentKinds: ['org-reviewer', 'security-auditor'],
  })
}
```

Your backend entry builds the registries, installs your package onto them, wires any gate's provider,
and passes them to the start function. Nothing is a module-global side effect, so import order and
module identity never matter, and a separately-published extension package cannot end up talking to a
second copy of a registry:

```ts
// deploy/backend/src/main.ts  (Node service)
import { installOrgAgents, wireLicenseProvider } from '@your-org/org-agents'
import {
  start,
  buildNodeContainer,
  defaultAgentKindRegistry,
  defaultPipelineRegistry,
} from '@cat-factory/node-server'
import { defaultGateRegistry, defaultStepResolverRegistry } from '@cat-factory/kernel'
import { registerBuiltinGates } from '@cat-factory/gates'

const agentKindRegistry = defaultAgentKindRegistry()
const gateRegistry = defaultGateRegistry()
const pipelineRegistry = defaultPipelineRegistry()
const stepResolverRegistry = defaultStepResolverRegistry()

registerBuiltinGates(gateRegistry)          // the ci / conflicts / health suite
installOrgAgents({
  agentKinds: agentKindRegistry,
  gates: gateRegistry,
  pipelines: pipelineRegistry,
  stepResolvers: stepResolverRegistry,
})
wireLicenseProvider(new GitHubLicenseProvider(/* … */))   // arm the gate; unwired ⇒ pass-through

start({
  buildContainer: buildNodeContainer,
  agentKindRegistry,
  gateRegistry,
  pipelineRegistry,
  stepResolverRegistry,
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
```

`startLocal()` takes the same options, and the Cloudflare Worker takes them through
`createWorker({ overrides: { … } })`. See
[Register your platform data in code](./deployment-repository.md#_5-register-your-platform-data-in-code).

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
  Cloudflare, Node, and local. The built-in gate suite is authored through this exact gate-registry
  seam and ships as [`@cat-factory/gates`](../reference/packages.md); the engine builds its gate
  registry from whatever is registered, with a registered kind replacing a built-in of the same id.
  Built-in agent kinds (architect, coder, and the rest) keep their prompts in the platform's own
  prompt catalog rather than being registered by a deployment, but a registered kind gets the same prompt
  guardrails and result-view wiring a built-in does, and a registered id that collides with a
  built-in track reuses that track's prompt.

---

For where this code lives and how the deployment workspace is laid out, see
[Your Deployment Repository](./deployment-repository.md). For the built-in gate suite this seam
authors, see [`@cat-factory/gates`](../reference/packages.md). For extending infrastructure
(environments and runner pools) the same way, see
[Custom Providers (Code Adapters)](./custom-providers.md).
