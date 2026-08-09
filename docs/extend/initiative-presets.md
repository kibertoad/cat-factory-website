# Register an Initiative Preset

For the deployment author whose organization runs the same **multi-phase** programme of work
repeatedly: a documentation sweep per service, a migration methodology every team must follow, a
research-then-apply cycle. The shape is known up front, the inputs are enumerable as a form, and the
outcome is many tasks across several phases with checkpoints between them.

An **initiative preset** packages that: a create-time form, a planning binding, a mandated plan
shape, prompt steering for the planning agents, and decoration for every task the initiative spawns.
Your users pick it in the create dialog beside the built-in presets, and everything else about
[running an initiative](../guide/initiatives.md) is unchanged.

::: tip Pick the vehicle before you write anything
A preset is right when the work must be **decomposed**: phases, many spawned items, checkpoints. If
the form answers are the whole brief and one pipeline delivers one outcome, the vehicle is a
[reusable operation](./reusable-operations.md) instead. Stretching a preset over a single-task
operation buys you an interview, a planner, and a plan ingest, for a plan of one.
:::

## The seam

A preset is one registration on the `InitiativePresetRegistry`, the same shape as every other
registry the platform injects. You new the default registry (which preloads the built-ins), register
yours on it by reference, and hand it to the facade:

```ts
import { defaultInitiativePresetRegistry } from '@cat-factory/agents'
import { start } from '@cat-factory/node-server'

const initiativePresetRegistry = defaultInitiativePresetRegistry()

initiativePresetRegistry.register({
  descriptor: {
    id: 'preset_org_audit',
    presentation: {
      label: 'Org policy audit',
      icon: 'i-lucide-shield-check',
      color: '#0ea5e9',
      description: 'Audit every service against the org policy and file the gaps.',
    },
    fields: [
      { key: 'auditAreas', type: 'checkbox-group', label: 'Audit areas', options: [/* … */], required: true },
      { key: 'scopeHint', type: 'textarea', label: 'Anything to focus on or skip' },
    ],
    planningPipelineId: 'pl_initiative', // reuse the built-in planning chain, or register your own
    interview: 'full',                   // or 'skip' when the form IS the interview
    humanReviewDefault: true,
    phaseTemplate: {
      phases: [{ id: 'org-audit', title: 'Audit', goal: 'One audit item per service.', required: true }],
      allowAdditionalPhases: false,
    },
  },
  detect,          // optional: prefill the form from the repo
  seedPlan,        // optional: decorate each planned item at ingest
  promptAdditions, // optional: steer the planning agents
})

await start({ initiativePresetRegistry })
```

The Worker takes the same registry as `createApp({ overrides: { initiativePresetRegistry } })`, and
local mode as `startLocal({ initiativePresetRegistry })`.

A preset carries **code** (`detect` and `seedPlan` run in your backend, read repositories, and steer
agents), so it is exactly as trusted as a custom agent kind and registers the same way, from your
composition root. There is deliberately no UI or config path for defining one.

## The four parts

| Part | Type | What it does |
| --- | --- | --- |
| `descriptor` | Serialisable data | The form, the planning binding, the defaults, and the plan shape. It rides the workspace snapshot to the browser, so it must stay pure data. |
| `detect?` | `(repo) => Promise<inputs>` | A bounded, checkout-free probe that prefills the form. Non-binding: the user's edits always win, and it never throws. |
| `seedPlan?` | `(draft, inputs) => draft` | Decorates each planned **item** at ingest: which pipeline it runs, its task type, its fields, its gates. |
| `promptAdditions?` | `Record<agentKind, string>` | Standing methodology folded into the planning agents' prompts, and into the prompts of the runs the initiative spawns. |

You never write a `switch` on your preset's id, and neither does the platform: every deviation is
either descriptor data or one of those two hooks. The execution loop, the planner and the committer
stay preset-agnostic, which is why a preset can only ever ADD context to a run.

## The create-time form

`fields` uses the same descriptor vocabulary a reusable operation's form uses, so the browser renders
it with no per-preset frontend code:

- `text`, `password`, `number`, `textarea`, `select`, `checkbox`: the flat scalar fields.
- `checkbox-group`: a multi-select whose value is a list of strings ("which documentation types").
- `path`: a repo-relative directory, validated against path traversal.
- `showWhen: { key, equals? | includes? }`: single-condition visibility, for a field that only
  applies when another is set.

What the user fills in is validated against your descriptor at create (unknown keys, type mismatches,
missing required visible fields, options membership, path safety), reduced to the declared and
currently-visible fields, and then **frozen** on the initiative. Later planning records deviations as
decisions; it never rewrites the inputs, so what the initiative was asked for stays readable months
later.

Set `interview: 'skip'` when the form IS the interview. The planning run then seeds its interview
digest from the filled form rather than asking a person questions it already has answers to.

## Mandating the plan shape

`phaseTemplate` is how a methodology stops being advice. Declare the phases your programme requires
and whether the planner may add its own:

```ts
phaseTemplate: {
  phases: [
    { id: 'map',     title: 'Map the blast zone', goal: '…', required: true },
    { id: 'pin',     title: 'Pin behaviour with coverage', goal: '…', required: true },
    { id: 'deliver', title: 'Deliver', goal: '…', required: true },
  ],
  allowAdditionalPhases: false,
}
```

Two generic mechanisms enforce it, and neither knows your preset exists. The planner's prompt gains a
"required plan shape" section stating the phase ids verbatim, their titles, goals, order and whether
extras are allowed. Then at ingest the draft is matched to the template by phase id, reordered into
template order, and **refused** if a required phase is missing or a disallowed extra appeared, which
surfaces as a planner retry or a fix at the plan-approval gate.

::: warning Shape is the template's job; decoration is `seedPlan`'s
`phaseTemplate` owns the phases. `seedPlan` owns what each ITEM inside them carries. A `seedPlan`
that adds, removes or reorders phases is a bug, and the two never overlap. If you find yourself
reaching for one to do the other's job, the template is the piece to change.
:::

Define the phase ids **once**, as a shared constant, and reference that constant from the template,
the prompt additions and `seedPlan`. The ids are a contract: the planner has to emit them and the
ingest normalizer matches on them, so a typo in one of three copies fails at plan time with nothing
naming the cause.

## Decorating what the initiative spawns

`seedPlan` runs after the shape check and turns planned items into first-class typed tasks. It sets
each item's pipeline, its task type and fields, its prompt fragments, and its per-run gate overrides,
so an item arrives on the board as the kind of task your organization would have created by hand
rather than a bare description.

Human review is one of those decorations. It is a per-run gate override rather than a second
gated pipeline: your form's "review each change" answer becomes a boolean array parallel to the
target pipeline's own steps, so an entry genuinely turns one gate on or off. Derive the position from
the pipeline's own steps (find the merge step's index) rather than hard-coding one, or the override
silently gates the wrong step when the pipeline gains one.

## Checkpoints and cross-phase artifacts

Mark a phase `checkpoint: true` and the initiative pauses once that phase's items settle, so a person
reads the result before the next phase spawns. That is how a research phase gates an apply phase: the
agent returns a machine-readable verdict, the platform surfaces it, and a **person** resumes or
cancels. The engine never auto-cancels on a model's verdict, because a business go/no-go is a human
decision. A deployment that wants a hard machine stop has its step resolver fail the run instead,
which blocks the item and halts the phase.

If a later phase's agents need to READ what an earlier phase produced, the artifact has to reach the
**default branch**, because that is what their containers clone. That means the producing phase runs
a pipeline with a merge tail and its producer is a code-writing agent kind, not a read-only one: only
a step that opens a pull request records one, and only a recorded pull request is what the CI gate and
the merger act on. A read-only producer that commits through a post-op lands on a branch nothing ever
merges, which is fine for a terminal report and wrong for an input to the next phase.

## Prefilling from the repository

`detect` gets a checkout-free view of the frame's repository and returns form defaults. It is called
from the create dialog, it is best-effort, and it returns nothing rather than failing when the
repository is unreachable. Whether the dialog offers the probe at all is derived from whether you
supplied the hook, so there is no flag to keep in step.

Keep it bounded. It runs while somebody is looking at a dialog, and it is a convenience: the user's
edits win over everything it returns.

## Adoption checklist

1. Confirm the vehicle: phases and many items, or one pipeline and one outcome
   ([reusable operation](./reusable-operations.md)).
2. Write the descriptor: id, presentation, `fields`, and the planning binding. Reuse `pl_initiative`
   unless your planning chain genuinely differs.
3. Decide the interview: `skip` when the form covers it, `full` when the goal still needs pinning
   down.
4. Declare `phaseTemplate` from shared phase-id constants, and mark any phase a person must read
   before the next one starts as a `checkpoint`.
5. Add `seedPlan` for per-item routing and decoration, and `promptAdditions` for the methodology.
6. Register on the injected registry from your composition root and pass it to `start` /
   `startLocal` / `createApp`.

---

Next: [Add a Custom Agent Kind](./custom-agents.md) for the kinds a preset's phases run, or
[Plan an Initiative](../guide/initiatives.md) for what your users see once it is registered.
