# Custom Agents (Code Adapters)

Cat Factory ships a full set of built-in agent kinds (Architect, Coder, Reviewer, Tester, and the
rest), but your team may want one of its own: a compliance auditor, a security scanner, an internal
migration agent, a bespoke reviewer that knows your house rules. You can add agent kinds **from your
own [deployment repository](./deployment-repository.md)**, without forking the platform and without
rebuilding the executor-harness image.

A custom agent becomes a first-class citizen: a palette block in the pipeline builder, a step you can
chain into pipelines, a live result window, all from registering it once at startup. This page shows
the model, the seam, two worked examples, how to package and wire it, and the gotchas.

::: tip This is a code extension
Unlike a [provider manifest](../reference/manifests.md), an agent is code you write and ship in your
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

A deployment teaches Cat Factory a new kind by calling `registerAgentKind` (or `registerAgentKinds`)
once at startup, an import side effect that mirrors the model-provider registry seam. Optionally
register a pipeline that chains your kinds with `registerPipeline`:

```ts
import { registerAgentKind } from '@cat-factory/agents'
import { registerPipeline } from '@cat-factory/kernel'

registerAgentKind({
  kind: 'security-auditor',
  systemPrompt:
    'You are a security auditor. Explore the repository (read-only) and assess the security ' +
    'posture of the current change. Return ONLY a JSON object: ' +
    '{ "risk": 0..1, "summary": "…", "findings": [{ "title": "…", "severity": "low|…|critical" }] }.',
  // The optional LLM step: where it runs and how its reply is consumed.
  agent: {
    surface: 'container-explore',
    output: { kind: 'structured', shapeHint: '{ "risk": number, "findings": [...] }' },
    clone: { branch: 'pr' },
  },
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
| `preOps?` / `postOps?` | `RepoOp[]` deterministic backend hooks over `RepoFiles`. |
| `presentation?` | Display metadata: `label`, `icon`, `color`, `description`, `category`, `resultView`. |
| `userPrompt?` | A custom user-prompt builder; omit for the generic block-context prompt. |
| `traits?` | Capability traits: `code-aware` folds in the service's best-practice fragments, `spec-aware` appends the in-repo-spec reading guidance. |
| `configContributions?` | Task-level config fields this kind surfaces on the new-task form and inspector. |
| `webResearchHint?` | A one-clause nudge for when this kind should reach for web search. |

A `container-*` surface implies a checkout automatically, so you don't also set `requiresContainer`.

### Agent surfaces

The `agent.surface` decides where the LLM step runs:

| Surface | What it does | Typical use |
| --- | --- | --- |
| `inline` | One-shot LLM call over the block context. No repo, no container. | A reviewer or classifier that judges the description. |
| `container-explore` | Clones the repo **read-only**, explores, returns prose or structured JSON (surfaced as `result.custom`). Never pushes. | An auditor or analyzer whose output a `postOp` turns into a committed artifact. |
| `container-coding` | Clones, edits a working tree, commits and pushes, optionally opens a PR. | A custom code-writing or migration agent. |

For a container surface, `clone.branch` picks what to check out (`base`, `pr`, or `work`), and a
coding agent's `infra` (`none` / `compose` / `ephemeral-url`) controls whether dependencies are stood
up. For structured output, `output.shapeHint` feeds the harness's one-shot repair call when the first
JSON parse fails.

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

const REPORT_PATH = 'compliance/REPORT.md'

// Render the auditor's structured assessment to a Markdown file and commit it onto the run's branch.
const renderComplianceReportPostOp: RepoOp = async (ctx) => {
  // `result.custom` is the agent's parsed structured output. A malformed run leaves it undefined —
  // do nothing rather than commit an empty report.
  if (ctx.result?.custom === undefined) return

  const content = renderComplianceReport(coerceAssessment(ctx.result.custom))

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

- **Coerce the model's output leniently.** A model may omit fields or return a slightly different
  shape. Parse defensively into your own type and never throw on a missing field; a malformed run
  should produce no commit.
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
    output: {
      kind: 'structured',
      shapeHint:
        '{ "risk": number 0..1, "summary": string, "findings": [{ "title": string, ' +
        '"detail": string, "severity": "low"|"medium"|"high"|"critical" }] }',
    },
    clone: { branch: 'pr' },
  },
  postOps: [renderComplianceReportPostOp],
  presentation: {
    label: 'Security Auditor',
    icon: 'i-lucide-shield-check',
    color: '#ef4444',
    description: 'Read-only security audit of the change; renders a compliance report into the repo.',
    category: 'review',
    // Open the structured JSON in the shared generic viewer — no bespoke UI to build.
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

A custom agent is a small package in your [deployment repository](./deployment-repository.md). It
depends only on the public packages and registers on import:

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
import { registerPipeline } from '@cat-factory/kernel'
// … kind definitions and post-ops as above …

registerAgentKinds([ORG_REVIEWER, SECURITY_AUDITOR])
registerPipeline({ id: 'pl_org_audit', name: 'Org compliance audit', agentKinds: ['org-reviewer', 'security-auditor'] })
```

Then import the package **once for its side effect** in your backend entry, before the server starts.
Registration is a global in-process effect, so this is all the wiring there is, no `buildContainer`
seam, no per-call injection:

```ts
// deploy/backend/src/main.ts  (Node service)
import '@your-org/org-agents'   // registers the kinds + pipeline
import { start, buildNodeContainer } from '@cat-factory/node-server'

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
A brand-new repo-writing agent ships with zero harness changes.

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
artifact (skips the commit), and a coercion that drops unexpected fields.

## Gotchas

- **Keep mechanical work in the hooks.** Anything deterministic (rendering a file,
  computing a path, pruning a stale artifact) belongs in a `preOp`/`postOp` as TypeScript. Asking the
  LLM to "also write the file" is slower, costs tokens, and is non-deterministic.
- **Coerce the agent's output; never trust the shape.** Treat `result.custom` as untrusted JSON.
  Parse it into your own type, default missing fields, and make a malformed run a no-op rather than a
  crash.
- **Make every post-op idempotent.** A durable-execution replay can re-enter a post-op after its
  commit landed but before the run state persisted. Render deterministically, compare against what's
  already on the branch, and skip an identical commit.
- **Pick the right surface.** Use `inline` when the judgement is about the description.
  Use `container-explore` for read-only analysis whose product is a rendered artifact. Reserve
  `container-coding` for agents that genuinely edit and push.
- **Choose the clone branch deliberately.** `pr` reviews the change under test, `base` reads the
  merge target, `work` reads the shared work branch. The wrong one audits the wrong code.
- **A custom agent runs alongside the built-ins.** This is the supported extension path and is
  covered by the cross-runtime conformance suite, so a kind behaves identically on Cloudflare, Node,
  and local. The built-in kinds are not authored through this seam yet; that doesn't affect kinds you
  add.

---

For where this code lives and how the deployment workspace is laid out, see
[Your Deployment Repository](./deployment-repository.md). For extending infrastructure (environments
and runner pools) the same way, see [Custom Providers (Code Adapters)](./custom-providers.md).
