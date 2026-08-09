# Package a Reusable Operation

For the deployment author whose organization performs the same shaped piece of work again and
again, with different particulars each time: "introduce an API on top of existing system
functionality", run once for `Order` and again for the refund flow. Every invocation leans on the
same standing context (the org's API guidelines, its auth requirements, its shared-services map)
and differs only in a small form filled at creation.

A **reusable operation** packages that: a create-time form, the standing context, and the pipeline
that delivers the outcome, registered as one named thing your users pick from the create-task
menu. You define it in your own backend package through the same public registry seams
[custom agents](./custom-agents.md) use. Nothing organization-flavoured ships in Cat Factory.

## The bundle

The vehicle is a **custom task type** carrying three things instead of one:

| Descriptor field | What it is |
| --- | --- |
| `fields` | The small per-case form, whose answers reach every agent's prompt. |
| `defaultFragmentIds` | The standing context, seeded onto every task of the type at creation. |
| `defaultPipelineId` | The canned pipeline that delivers the outcome. |

A task type carrying only `presentation` is still just a work-item classification: a badge and a
card. Those three fields are what turn it into an operation.

```ts
taskTypeRegistry.register({
  taskType: 'org:introduce-api', // ALWAYS namespaced (<ns>:<name>)
  presentation: {
    label: 'Introduce API',
    icon: 'i-lucide-plug',
    color: '#0ea5e9',
    description: 'Expose existing system functionality over the org standard HTTP API.',
    category: 'API delivery', // the picker's grouping caption
  },
  fields: [/* the per-case form: see the vocabulary below */],
  defaultFragmentIds: ['org.api-guidelines', 'org.api-auth-requirements'],
  defaultPipelineId: 'pl_org_introduce_api',
  // formPanel: 'org:introduce-api-form',  // optional: a bespoke create-form section instead
})
```

- **`fields`** are collected at creation and frozen on the task, so adding a field later never
  needs a migration.
- **`defaultFragmentIds`** are unioned onto the new task's own fragments at creation, beside
  whatever it inherits from its service. Only the id **set** freezes: the bodies resolve per run,
  so editing a guideline reaches every future run of an already-created task.
- **`defaultPipelineId`** pins the pipeline a task of the type defaults to when the creator chooses
  none. Leave it out and the workspace's positional default applies, exactly as for an unmapped
  built-in type.
- **`presentation.category`** groups the create-task picker. Declare one as soon as the deployment
  ships more than a couple of types.
- **`formPanel`** names a component you contribute to the `taskTypeFormPanels` slot
  ([Frontend Extensions](./frontend-extensions.md)), shown instead of the descriptor fields. It
  owns the whole value bag, so the platform's field validation stands down for a type that declares
  one: it cannot read a bespoke panel's required semantics. An id with no paired component degrades
  to the descriptor fields.

Three things are deliberately **not** on the descriptor. Per-kind prompt steering rides registered
variants selected by the operation's own pipeline, because an operation owns its pipeline and that
seam already exists. A human-review pause is that pipeline's own gate. And a foundational-service
pin would bypass both the trait-based routing and the design's own declaration, so there is none.

## Which vehicle to reach for

| Vehicle | When | Shape |
| --- | --- | --- |
| **Plain custom task type** | A first-class work-item *classification*: an "incident" card, a badge, a small form. | `presentation` + `fields`, no bundled pipeline or fragments. |
| **Reusable operation** | A human fills a small per-case form and one canned pipeline delivers one outcome. | The full bundle. One invocation is one typed task. |
| **Initiative preset** | The work must be *planned* and decomposed: phases, many spawned items, checkpoints between them. | An initiative preset. See [Register an Initiative Preset](./initiative-presets.md). |
| **Recurring schedule** | Time, or a webhook, is the trigger rather than a human with per-case input. | A schedule pointing at a pipeline. See [Schedule a Recurring Pipeline](../guide/recurring-pipelines.md). |

The litmus: when the create-form answers **are** the whole per-case brief and one pipeline delivers
one outcome, it is an operation. The moment the work needs "research first, then apply", it is an
initiative preset.

Single-task bounds the granularity of *invocation*, not the rigour of the run. An operation's
pipeline may carry requirements review, judges, consensus panels and the full merge tail: it is an
ordinary pipeline.

## The per-case form

An operation's `fields` and an initiative preset's create form share one descriptor vocabulary, so
a form that renders in one surface renders in the other and one validator covers both.

Field types: `text`, `textarea`, `number`, `select`, `checkbox`, `checkbox-group`, `path`. Each
field may carry `help`, `placeholder`, `required`, `options`, `default` / `defaultValues`,
`maxLength`, `min` / `max`, a single-condition `showWhen: { key, equals? | includes? }`, and a
`section` caption.

Five rules shape what you can author:

- **`section` groups a long form and does nothing else.** It is presentation: validation, what is
  frozen and how answers reach the prompt are all unchanged, so moving a field between sections can
  never change what the platform does with its answer. Declare a section's fields consecutively;
  boot refuses a section that a filled form could caption twice. A section interleaved only with a
  *mutually exclusive* branch is fine, and is the normal way to write a branching form. A section
  whose every field is hidden renders no caption at all.
- **There is no `password` field type, by construction.** A collected value is folded into prompts,
  projected onto the board snapshot and captured in agent-context telemetry. A capability whose
  agents need a credential declares it by name against the capability-credential store, where the
  value never reaches a prompt. See [Add a Custom Agent](./custom-agents.md).
- **A declared bound binds the server**, not only the input. `maxLength`, the option lists and
  `path` safety (no `..`, no absolute path, no backslash) are enforced where the value is frozen,
  because a form is not the only door: the public API, an initiative spawn and a tracker import all
  reach the same place.
- **A condition states `equals` or `includes`, and deliberately nothing else.** One predicate over
  one other field covers a picker and a toggle, which is what a per-case brief branches on. So
  "include the data-governance standard whenever the free-text `sensitiveData` answer is filled" is
  expressed by asking the question the branch actually turns on: a condition keyed on whether prose
  is non-empty fires on "n/a" and on a stray space.
- **A declared default is applied at the door**, not in the form, so a headless caller need not
  restate a value the deployment already declared. Only absent keys are filled, so an explicit
  value always wins, including a `false` on a default-on checkbox, which is the opt-out. A default
  outside its own `select` options is a boot error, since it would otherwise refuse every creation
  of the type.

### What validation refuses

Creation checks the submitted values against the descriptor: unknown keys refused, required
*visible* fields present, values type-checked, `select` and `checkbox-group` values drawn from the
declared options, `path` values inside the repository. A failure comes back as one error carrying
every problem at once, so a caller fixing one field per round trip is never the experience.

Two behaviours worth knowing before you author a form. An **absent** value bag is checked against
an empty one, so a required field is unanswered whether the caller sent an empty bag or none at
all: anything creating a task of an operation with required fields must fill them. And an unfilled
value is **dropped rather than frozen**, the single exception being an explicit `false` on a
checkbox, which absence cannot express.

## Standing context

`defaultFragmentIds` name best-practice fragments from the code pool (the shipped catalog plus
whatever your package registers) or from the account and workspace tiers, including the ids of a
repository-backed fragment source. See [Reuse Prompt Fragments](../guide/prompt-fragments.md).

- **Fragments fold only for code-aware and doc-aware agent kinds.** An operation whose pipeline
  runs your own kinds must give those kinds the right traits, or its standing context reaches
  nothing. Testers are not code-aware.
- **A long fragment folds as its condensed brief for implementer kinds** and in full for reviewer
  and planner kinds, so ship a brief alongside a long body.
- **Declare the ids on the registration itself**, not through the built-in-type defaults seam:
  a registered type carries its own, where boot validation can see them.
- **Context that depends on the answers goes in `conditionalFragmentIds`**: each entry is a
  `showWhen` condition plus the ids it unlocks, evaluated once at creation against the collected
  values. That is what lets one operation collecting `protocol: rest | graphql` seed the GraphQL
  standard only for a GraphQL case, instead of paying for every branch on every run.
- **Seeding states an unregistered type.** A task created on a process whose package lacks the
  registration is accepted, gets none of the operation's fragments, and is logged as such rather
  than contributing nothing in silence. A later build does not go back for it, because only the id
  set freezes at creation.

## Steering individual steps

An operation steers steps through registered **variants** of the kinds its pipeline runs, selected
positionally by the pipeline:

```ts
agentKindRegistry.registerVariant({
  id: 'org:coder-api',
  baseKind: 'coder',
  promptAddition: 'Implement the API exactly as the design names it: paths, status codes, …',
  presentation: { label: 'Org API implementation', description: '…' },
})

pipelineRegistry.register({
  id: 'pl_org_introduce_api',
  name: 'Introduce API',
  builtin: true,
  version: 1,
  agentKinds: ['architect', 'coder', 'tester-api', 'conflicts', 'ci', 'merger'],
  stepOptions: [{ agentVariantId: 'org:architect-api' }, { agentVariantId: 'org:coder-api' }],
})
```

A `promptAddition` composes with the shipped prompt and with a workspace's own override of it
rather than displacing either, the selection is validated at boot, and what actually ran is
recorded on the step.

**Register a variant of `coder`, not a whole new kind**, when the work is still coding. A new kind
quietly loses every engine decision keyed on `coder`: the follow-up companion, the implementation
fork decision, multi-repository fan-out, and the merge tail.

## The canned pipeline: `builtin: true` with an explicit `version`

The two halves buy different things and an operation's pipeline wants both.

- **`builtin: true`** makes it a read-only catalog template. A workspace clones it to deviate,
  rather than editing the definition out from under the operation that pins it.
- **An explicit `version`** is the rollout channel. Bumping it marks every stored copy outdated and
  the reseed adopts the new definition.

**A versionless, non-builtin registration is the trap, and it is worse than un-updatable: it is
editable and frozen.** Each workspace gets a copy it can edit or delete out from under the
operation, and that you can never fix centrally.

The version never enters the reference: `defaultPipelineId` is a bare id and a run uses whatever
definition the workspace currently holds. A board older than the registration is not stuck, because
a run resolves the pin off the registry and materialises the catalog entry when the board has no
copy.

## Boot validation

Every registered type is checked at boot. The bar: an **error** for anything fully knowable from
the registration, a **warning** only where the platform structurally cannot see the answer.

| Code | Severity | Cause |
| --- | --- | --- |
| `task_type_not_namespaced` | error | The id is not `<ns>:<name>`, so it collides with the built-in list. |
| `task_type_form_panel_invalid` | error | `formPanel` is not a namespaced id. |
| `task_type_unknown_pipeline` | error | `defaultPipelineId` resolves to neither a built-in nor a registered pipeline. |
| `task_type_field_duplicate` | error | The form declares one field key twice. |
| `task_type_field_no_options` | error | A `select` or `checkbox-group` with no options, so the form renders an empty picker. |
| `task_type_field_unknown_condition` | error | A `showWhen` gating a field on a key the form does not declare, so it never shows. |
| `task_type_field_section_interleaved` | error | A section split by a field that can show beside both halves, so it captions twice. |
| `task_type_unknown_fragment` | **warning** | A `defaultFragmentIds` id the code pool does not resolve. |

The fragment check is the one warning because both causes are live: a typo, or an account- or
workspace-tier id that merges per workspace at run time and is invisible at boot. The message names
both.

**A deployment that knows the second cause cannot apply to it can say so**, rather than the
platform guessing which kind of deployment this is:

```ts
start({
  escalateRegistrationWarning: (p) => p.code === 'task_type_unknown_fragment',
})
```

An escalated problem joins the aggregated boot failure with the genuine errors: one report, every
problem at once. The predicate takes the whole problem, so you can escalate one code, a family, or
everything, and a warning added in a later release is covered by a predicate that never mentioned
it. Set the same predicate on every boot entry point you use: a laptop is the cheapest place to
learn about a typo.

## Registering from your composition root

Everything lives in your own package. An operation carries code (its pipeline names its variants
and kinds), so it is exactly as trusted as a custom agent kind.

```ts
// ONE import, from the facade the deployment boots through. The Node, local and Worker facades
// export the same registry and type names; only the boot function differs.
import {
  defaultAgentKindRegistry,
  defaultPipelineRegistry,
  defaultTaskTypeRegistry,
  promptFragmentRegistryWithBuiltins,
  startLocal,
  type CustomTaskType,
  type RegistrationProblem,
} from '@cat-factory/local-server'

const agentKindRegistry = defaultAgentKindRegistry()
const pipelineRegistry = defaultPipelineRegistry()
const taskTypeRegistry = defaultTaskTypeRegistry()
// The shipped best-practice catalog, so the org's own standards join it rather than replace it.
const promptFragmentRegistry = promptFragmentRegistryWithBuiltins()

registerMyOrgOperations({
  agentKindRegistry,
  pipelineRegistry,
  taskTypeRegistry,
  promptFragmentRegistry,
})

startLocal({
  agentKindRegistry,
  pipelineRegistry,
  taskTypeRegistry,
  promptFragmentRegistry,
  escalateRegistrationWarning: (p: RegistrationProblem) => p.code === 'task_type_unknown_fragment',
  // …plus this deployment's ordinary boot options (port, database URL, and the rest).
})
```

Order matters inside `registerMyOrgOperations`, for boot validation rather than for behaviour:
register the **fragments** and the **variants**, then the **pipeline** that selects them, then the
**task type** that names the pipeline, so every reference resolves.

Pass the same registry instances into the boot call. The engine reads the registries off the
runtime rather than off an injected argument, so a facade that forgets to thread one gets empty
registries everywhere rather than a half-wired deployment.

### Two rules that bite

**Your package's only Cat Factory runtime dependency is the facade it boots through.** Each facade
re-exports the constructors and the types for every seam it lets you inject: the registries and
their `default…()` / `…WithBuiltins()` builders, the authoring vocabulary, the descriptor-field
helpers and the problem type.

That is not ergonomics. Every published package pins at an exact version, so a package that depends
on an internal one directly, and floats the range onto a newer patch than its facade pins, resolves
a **second physical copy**. Registering by reference survives that for a registry built from the
copy the facade reads, and does not survive it otherwise. The symptom is agents that fold nothing,
with no error anywhere.

**An injected registry replaces the pool; it never merges.** So `promptFragmentRegistryWithBuiltins()`
is what you want unless you mean the opposite, and a bare `defaultPromptFragmentRegistry()` is a
deployment whose agents fold its own standards and none of the platform's. The same holds for
`gateRegistryWithBuiltins()` against `defaultGateRegistry()`, where the empty one silently drops
`ci`, `conflicts` and `post-release-health` from every pipeline naming them. Both are legitimate,
which is why both are exported and neither is inferred.

## What your users see

- **The create-task picker is grouped, not flat**: the built-in types first in one uncaptioned row,
  then one captioned row per declared `presentation.category` in registration order, then any
  uncategorized types under an "Other" heading. Captions fold on case and whitespace, so
  `API delivery` and `API Delivery` are one row, captioned as first written.
- **`presentation.description`** is the picker button's tooltip and, once the type is selected, the
  type field's help text.
- **Descriptor strings are rendered verbatim** in the language you wrote them: labels, help,
  option captions, category captions, descriptions. Only the platform's own chrome around them is
  translated.
- **Operations render in basic interface mode**, and their fields stay visible in both interface
  tiers. Task creation is the everyday delivery loop, and a descriptor field carries input nothing
  else supplies, so it is not an override to hide.
- **A document frame accepts only document and spike tasks**, so an operation cannot be invoked
  inside one.

The collected answers reach every agent in the run as a `## Task parameters` section appended after
the block context, so the requester's own title and description stay the primary statement of what
is wanted. Values are authoritative and the descriptor only enriches them: an answer whose field
was renamed since the task was created still renders, under its raw key, because the alternative
would silently delete the per-case brief the operation was invoked with.

## Hiding an operation from one board

A deployment registers its operations process-wide, so every board in the organization offers every
one of them. Twenty operations is a realistic catalog and a flooded picker for a team that runs
three, so a workspace admin can hide the ones that board does not use, from the workspace settings.

Hiding is a tombstone and restoring deletes it, so absence is the default: a newly registered
operation is offered everywhere until somebody hides it, which is the only direction that cannot
silently withhold a capability from every existing board at once.

The hiding is real rather than cosmetic: creating a task of a hidden type is refused, not merely
un-offered, because the internal API, the public API, an initiative spawn and a tracker import all
create tasks without ever seeing the picker.

Built-in types are not suppressible. They carry hardcoded creation affordances, so hiding one would
remove a capability with no descriptor stating what was lost.

## Discovering an operation over the public API

A headless caller can both discover a form and fill it:

- **`GET /api/v1/task-types`** (scope `read`) serves the built-in types plus this workspace's
  registered, non-suppressed ones, each with the fields it accepts. `formPanel` is deliberately not
  projected: it names a component in your own frontend layer, which no external client can act on.
- **`fields` on task creation** fills them.

One table stands behind both directions, which is the point: what discovery advertises is exactly
what creation checks, through the same validator the app's own form runs. A refusal is a 422 with
`details.reason: task_type_fields_invalid` and every problem at once.

See [Use the Public API](./public-api.md) and [Use an SDK](./sdks.md).

---

Next: [Add a Custom Agent](./custom-agents.md) for the kinds an operation's pipeline runs, or
[Reuse Prompt Fragments](../guide/prompt-fragments.md) for the standing context it seeds.
