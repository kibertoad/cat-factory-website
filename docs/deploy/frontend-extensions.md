# Extending the App (Frontend Modules)

[Custom agents, gates, and judges](./custom-agents.md) extend the backend. This page is the frontend
counterpart: a deployment that consumes the app layer can contribute its own **components** to the
running SPA, result windows, navigation entries, inspector panels, task types, and full-screen
overlays, without forking the layer and without a host edit.

The governing rule is the same on both sides: **zero host edits for a consumer extension**. A worked
example ships with the platform as the `acme:security` module in the template deployment's
`deploy/frontend`.

## One seam: `registerAppModule`

Everything goes through one call from your own Nuxt plugin. A module is a plain descriptor, and each
capability is a slot contribution:

```ts
// deploy/frontend/app/plugins/acme.client.ts
import { defineModule } from '@modular-vue/core'
import AcmeSecurityReport from '../components/acme/AcmeSecurityReport.vue'

export default defineNuxtPlugin(() => {
  registerAppModule(
    defineModule({
      id: 'acme:security',        // namespaced (see Rules below)
      version: '1.0.0',
      slots: {
        resultViews: [{ id: 'acme:security-report', component: AcmeSecurityReport }],
        taskTypes: [/* … */],
        nav: [/* … */],
        inspectorPanels: [/* … */],
        appOverlays: [/* … */],
      },
    }),
  )
})
```

Two things bite here and are worth getting right the first time:

- **`registerAppModule` is auto-imported** from the layer, so you need no deep import into its
  internals. `defineModule` and the slot-entry types come from `@modular-vue/core`; add it to your
  deployment's dependencies.
- **Do not put `enforce: 'post'` on your plugin.** The layer's own install plugin is `enforce: 'post'`,
  and Nuxt runs layer plugins before the consuming app's within one enforce bucket. A `post` plugin
  registers too late and is silently missed. Leave it in the default bucket.

## The slots

| Slot | Entry shape | Where it shows up |
| --- | --- | --- |
| `resultViews` | `{ id: '<ns>:<name>', component }` | The run-detail window for a step |
| `agentKinds` | `{ kind, container, presentation }` | The pipeline-builder palette |
| `taskTypes` | `{ taskType: '<ns>:<name>', presentation, fields?, defaultPipelineId?, formPanel? }` | The create-task picker and the task card's type badge |
| `nav` | `{ id, labelKey, icon, surfaces, gate?, run, … }` | Sidebar, command palette, and toolbar |
| `inspectorPanels` | `{ id, component, when(block), order }` | The inspector body |
| `appOverlays` | `{ id: '<ns>:<name>', component }` | A full-screen overlay you open from anywhere |
| `externalTools` | `{ id, title, icon, url, requiredMetadata?, order?, gate? }` | An "External tools" sidebar section and the command palette |
| `workspaceMetadataFields` | `{ key, label, type?, options?, description?, order? }` | A **Metadata** tab on workspace settings |

Locale strings ride along separately: ship them under your own namespace in your deployment's
`i18n/locales/*.json` and the layer deep-merges them, so `t('acme.securityReport.title')` resolves
with no config change.

### Result windows

Backend data selects a frontend component, joined by a namespaced id. Register an agent kind whose
`presentation.resultView` is `'<ns>:<name>'` (see
[Custom Agents](./custom-agents.md#the-registration-seam)), contribute the component to `resultViews`
under the same id, and opening a step of that kind mounts your component. An unpaired id degrades to
the generic prose panel with a dev-console warning naming it; a structured kind with no bespoke window
gets the built-in `generic-structured` viewer for free.

### Custom task types

Model a proprietary work item (an "incident", a "pentest", a "compliance-audit") as a first-class task
type: the create-task twin of an agent kind. Contribute it to the `taskTypes` slot, or register it on
the backend's `TaskTypeRegistry` and let it arrive in the workspace snapshot (data over the wire,
never components). Either way it folds into the same merged catalog:

- **`presentation`** drives the picker entry and the task card's type badge. A namespaced type that
  nothing registers any more (a stale row left behind after your extension is removed) falls back to
  the `feature` presentation, so a leftover string never breaks a card.
- **`fields`** are descriptor-driven create-form inputs (`text`, `textarea`, `number`, `select`) whose
  values land in the task's sparse custom-field bag; no migration.
- **`formPanel`** names a bespoke create-form section you contribute instead of `fields`. An unpaired
  id degrades back to the descriptor fields.
- **`defaultPipelineId`** pre-selects the type's pipeline.

Required descriptor fields are enforced before the form will submit. The `taskType` contract accepts
a namespaced id everywhere, including
[`POST /api/v1/services/{serviceId}/tasks`](../reference/public-api.md#board-workloads), so a task
created with it round-trips with no host edits.

Prefer **backend registration** when you want the guardrail: a backend-registered task type is checked
at boot (namespaced id, well-formed `formPanel`, a `defaultPipelineId` that resolves to a real
pipeline). A code-shipped `taskTypes` entry is trusted and unvalidated, like a code-shipped agent kind,
so a typo fails quietly.

### Navigation

A consumer nav item carries its own `run` closure (first-party items use a typed action id instead).
`surfaces` picks which shells render it (`sidebar`, `command`, `toolbar`), and an optional
`gate: (g) => g.canManageIntegrations` hides it reactively without the permission.

### Inspector panels

Each entry's `when(block)` predicate decides which blocks show the panel, and `order` places it among
the built-ins. Your component reads the selected block with `usePanelSubject<Block>()`. `when` must
tolerate a nullish subject: the boot-time validation resolve passes `null`.

### Top-level overlays

A nav item's `run` closure often needs to open a full-screen panel of its own: a dashboard, a wizard, a
settings surface. The layer's first-party modals are hand-mounted in a page a consumer cannot edit, so
the `appOverlays` slot is the seam:

1. Contribute `{ id: '<ns>:<name>', component }` to `appOverlays`.
2. Open it from anywhere with `useAppOverlays().open('<ns>:<name>', subject?)`. The optional `subject`
   is any value your overlay renders against and reaches the component as a `subject` prop.
3. The single overlay host mounts the matching component and wires its `close` emit for you.

It is pick-one: opening a second overlay replaces the first. Compose `ResultWindowShell` for chrome so
your overlay inherits focus-trap, scroll-lock, and shared Escape handling. Opening an id nothing
registers degrades to nothing with a dev warning, never a crash. Duplicate ids across modules throw at
boot, like every other slot.

### External tools and workspace metadata

These two slots are data only (no components) and only mean anything together. `externalTools` lists
your deployment's own web applications in their own sidebar section; clicking one opens it in a
separate browser page. `workspaceMetadataFields` declares the per-workspace values those tools resolve
against.

Context rides on the link. A tool declares a resolver from the invocation context to a URL, not a
static link, so a click lands on the right state rather than the tool's front door:

```ts
externalTools: [
  {
    id: 'acme:map-editor',
    title: 'Map Editor',
    description: 'Edit this board\'s game world',
    icon: 'i-lucide-map',
    requiredMetadata: ['gameId'],
    url: (ctx) => {
      const url = new URL('https://maps.acme.dev/edit')
      url.searchParams.set('game', ctx.metadata.gameId)
      url.searchParams.set('as', ctx.userEmail ?? '')
      return url.toString()
    },
  },
],
workspaceMetadataFields: [
  { key: 'gameId', label: 'Game id', placeholder: 'zork', order: 10 },
],
```

The resolver receives `{ userId, userEmail, workspaceId, workspaceName, metadata }`. Returning `null`
means "not resolvable right now": the tool stays listed and explains itself on click instead of
opening something wrong. Four refusals are reported separately, since each has its own fix: a
declared `requiredMetadata` key nobody filled in, a resolver that returned nothing, a result that is
not an `http(s)` URL, and a resolver that threw. A throwing resolver never blanks the nav; it is
caught and reported like any other refusal.

::: warning Metadata values are untrusted input
A workspace admin types them in, so treat a value as operator-supplied text. Interpolate it into a
query parameter or an `encodeURIComponent`'d path segment. Never build the **origin** from one:
`` `https://${ctx.metadata.region}.acme.dev` `` with `region` set to `evil.com/x?a=` resolves to a URL
on someone else's host, and the `http(s)` allow-list cannot tell that apart from the link you meant.
:::

Field definitions are code-shipped, so adding, renaming, or retiring one needs no migration. Only the
values are stored, in a per-workspace JSON column that both the Postgres and Cloudflare runtimes
mirror. A key must be identifier-shaped (`^[A-Za-z][A-Za-z0-9_.-]{0,63}$`); the backend validates the
shape of the bag and never the field list. The **External tools** section disappears entirely on a
deployment that registers none.

## Compose the shared building blocks

The layer ships window and inspector primitives. Use them instead of hand-rolling chrome or
re-deriving "which run is this":

| Building block | Reference it as | What it gives you |
| --- | --- | --- |
| `ResultWindowShell` | `#components` → `PanelsResultWindowShell` | Modal chrome: backdrop, header, a header-extras slot, close button, focus-trap, scroll-lock, shared Escape. Pass `stepRef` to surface the shared "restart from here" control. |
| `StepRunMeta` | `#components` → `PanelsStepRunMeta` | The run-metadata block every agent window reuses: step position, live duration, model, run id, model-activity rollup. |
| `MarkdownProse` | `#components` → `CommonMarkdownProse` | Render an agent's prose output as markdown. |
| `InspectorSection` | `#components` → `PanelsInspectorSection` | The collapsible inspector-section shell, so your panel reads like a built-in. |
| `useResultView(id)` | auto-imported | The window seam: `{ open, blockId, instanceId, stepIndex, close }`, plus an `onOpen` loader and an `onClose` flush. |
| `usePanelSubject<T>()` | `@modular-vue/core` | Read the block injected into an inspector panel. |
| `useAppOverlays()` | auto-imported | `{ open(id, subject?), close(), active }` for your own overlays. |

::: warning Reference layer components through `#components`, not bare tags
Nuxt registers a layer's components under a path-derived name
(`components/panels/ResultWindowShell.vue` → `PanelsResultWindowShell`) and only rewrites bare tags
inside the layer's own files. A bare `<ResultWindowShell>` in a consumer file resolves to nothing and
renders as an unknown element. Its slot children still appear, so a shallow test can pass while the
shared chrome never mounts. Import from `#components` and alias back for readable templates:

```ts
import {
  PanelsResultWindowShell as ResultWindowShell,
  PanelsStepRunMeta as StepRunMeta,
} from '#components'
```

Composables and `registerAppModule` are auto-imported across layers, so those need no import.
:::

## Rules that hold across every slot

- **Namespace every id** as `<ns>:<name>`. Built-ins are never shadowable: the merge drops a consumer
  entry whose id collides with one.
- **Fail fast at boot, degrade at runtime.** Duplicate ids throw when the layer resolves its merged
  slots at startup. Missing pairings and unknown wire ids degrade with a dev-console warning.
- **Never crash on stale data.** An id that arrives on the wire after its extension was removed must
  render as something defined. Extensions get uninstalled; the rows they created outlive them.
- **The wire carries data, never components.** Per-workspace variation comes from which capabilities
  the snapshot lists, not from which modules are registered; registration is boot-static.

---

For the backend half, see [Custom Agents & Gates](./custom-agents.md). For where this code lives in
your deployment, see [Your Deployment Repository](./deployment-repository.md).
