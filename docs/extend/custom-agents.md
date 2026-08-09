---
redirectFrom:
  - /deploy/custom-agents.html
---

# Add a Custom Agent Kind

For a deployment that needs an agent the platform does not ship: a compliance auditor, a security
scanner, an internal migration agent, a bespoke reviewer that knows your house rules. You add agent
kinds **from your own [deployment repository](../deploy/deployment-repository.md)**, without forking
the platform and without rebuilding the executor-harness image.

A custom agent becomes a first-class citizen: a palette block in the pipeline builder, a step you can
chain into pipelines, a live result window, all from registering it once at startup. This page shows
the model, the seams, worked examples, how to package and wire them, and the gotchas.

The two sibling shapes have their own page. A **gate** decides whether work is even needed, and a
**judge** scores it against a rubric; both are in
[Add a Custom Gate or Judge](./custom-gates.md).

::: tip This is a code extension
Unlike a [provider manifest](./manifests.md), an agent kind is code you write and ship in your
deployment repo. It is the supported way to extend the agent set; you don't need to touch the core
packages or the harness image.
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
function injects. Your deployment builds the registry, registers on it by reference, and passes it in.
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
[Register your platform data in code](../deploy/deployment-repository.md#_5-register-your-platform-data-in-code)
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
| `binary-output` | The kind generates product binaries stored through a foundational service. See [Binary-output steps](../guide/choosing-a-pipeline.md#binary-output-steps). |
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
variant is not a kind: it never appears in the palette as its own entry, never answers a lookup by
kind, and never changes a behavioural answer such as whether the step needs a container. Use it when
the job is the same and only the instructions differ.

#### Interface tier

`presentation.tier` places the kind on the pipeline builder's palette ladder: `basic`,
`intermediate`, or `advanced`. Tiers are cumulative, so selecting a level shows that tier and every
tier below it, and a long catalog stays short for someone who only runs the delivery loop.

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
  credentials: [{ key: 'ACME_IMAGE_KEY' }],
  contracts: [{ contractId: 'openapi', format: 'openapi', title: 'HTTP API', body: acmeImageSpec }],
})
```

| Field | Purpose |
| --- | --- |
| `modalities` | The content types it produces: `image`, `audio`, `video`, `3d-model`, `3d-scene`, `document`. At least one. This is what the admission coverage check compares a step's requirements against. |
| `mediaTypes?` | The concrete formats it can emit. Absent means only the coarse modalities are known, and the brief says so rather than implying every format of that modality is available. |
| `endpoint?` | The API's base URL, so the agent does not infer one from the contract. Must be `https` or loopback, since the credential rides the request. |
| `guidance?` | Operating notes folded into the brief verbatim: polling an async job, whether a payload comes back base64 or as a signed URL, a rate limit worth respecting. This is where you put what would otherwise be rediscovered once per run. |
| `credentials?` | What it authenticates with, declared by name (`key`), each optionally delivered under a different variable (`envName`). A list, because a vendor account is not always one string. Values never reach a prompt. |
| `contracts?` | API contract documents in the same formats the [foundational catalog](../guide/foundational-services.md) accepts, injected as `.cat-context/` files so the agent calls declared operations instead of inventing them. |

`description` is the half a model needs to choose between two registered generators of the same
modality: style, resolution or length limits, cost profile. The platform provides no discriminator
field for that, because those axes do not partition the deliverable and a rule built on one would
refuse correctly-configured steps.

##### Vendors that authenticate with more than one value

`credentials` is a list because plenty of APIs do not authenticate with a single token. HTTP Basic
over a key/secret pair is the common one: declare both halves, and say in each `usage` what part it
plays, since the agent writes the request itself.

```ts
credentials: [
  { key: 'ACME_API_KEY', usage: 'the Basic-auth username half' },
  { key: 'ACME_API_SECRET', usage: 'the Basic-auth password half' },
],
```

Each entry becomes its own row on the workspace credential checklist, so the form an operator fills
in matches the values their vendor console issues, and either half can be rotated on its own. Two
entries may not arrive as the same environment variable (the same `envName`, or one entry's
`envName` colliding with another's `key`); that is refused at boot, because the job body is keyed by
variable name and a collision would silently deliver one value and drop the other.

That refusal reaches across your registrations too, with one exception. Two integrations on the same
vendor account may share a variable, and often should: register both with the same lookup `key` and
whichever runs first sets the variable to exactly the value the other wanted. What is refused is two
integrations that mean **different** values by one variable name, because nothing downstream can
serve both. The agent would be told to read that variable for each of them and would authenticate
one vendor with the other's key. Give one of them a distinct `envName`.

A step's brief is written from these entries, so a `required: false` credential is worth declaring
honestly: the agent is told to call the integration anyway when that value is missing, while a
missing required one means the integration must not be called at all.

The platform names values and never assembles the request: there is no auth-scheme field, and
nothing base64-encodes or builds a header for you. Say how to present each value in `usage` and the
agent does the rest.

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
## Packaging and wiring

A custom agent (or gate) is a small package in your [deployment repository](../deploy/deployment-repository.md).
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
// … kind definitions, post-ops, and the license-check gate factory from the gates page …

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
[Register your platform data in code](../deploy/deployment-repository.md#_5-register-your-platform-data-in-code).

::: tip No frontend rebuild
The backend serialises every registered kind's `presentation` into the workspace snapshot, and the
SPA merges them into its palette on load. So importing the package on the backend is enough; the
prebuilt frontend picks the new kind up with no rebuild.
:::

After that, link a repo and run a pipeline that includes your kinds (or the pipeline you registered).
A brand-new repo-writing agent, or a gate that blocks the merge, ships with zero harness changes.

## Boot-time validation

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
- **Validate at boot.** Let the facade's `validateRegistrationsOnce()` run. A typo'd gate
  `helperKind`, an unknown `resultView`, or a pipeline naming a missing kind then fails loudly at
  startup instead of mid-run.
- **Custom kinds run alongside the built-ins.** This is the supported extension path and is covered
  by the cross-runtime conformance suite, so a kind behaves identically on Cloudflare, Node, and
  local. Built-in agent kinds (architect, coder, and the rest) keep their prompts in the platform's
  own prompt catalog rather than being registered by a deployment, but a registered kind gets the
  same prompt guardrails and result-view wiring a built-in does, and a registered id that collides
  with a built-in track reuses that track's prompt.

---

Next: [Add a Custom Gate or Judge](./custom-gates.md) for the other two extension shapes, or
[Set Up Your Deployment Repository](../deploy/deployment-repository.md) for where this code lives.
