# Package an Inline Use Case

For the deployment author whose users generate text from a tool of your own: a game content editor,
a writing surface, an internal copy tool. The work is one model call rather than a pipeline. There
is no repository to check out, no pull request to open, and nothing belongs on the board.

An **inline use case** packages that: a named unit of model work, the narrowed list of models it
may run on, the small form it accepts, and the bounds a caller may steer within. Cat Factory
publishes what you registered at `GET /api/v1/use-cases` and runs one at
`POST /api/v1/use-cases/{useCaseId}/invocations`, so your editor generates through this
deployment's own model credentials, workspace budget and call telemetry instead of holding its own
vendor keys beside them.

Nothing organization-flavoured ships in Cat Factory: the catalog is empty until you register on it,
through the same public registry seam [custom agents](./custom-agents.md) and
[reusable operations](./reusable-operations.md) use.

::: tip Operation or use case?
A [reusable operation](./reusable-operations.md) is the CONTAINER sibling: a form bundled with a
pipeline that runs agents against a real repository checkout and ends in a pull request. Reach for
an inline use case when the deliverable is text handed straight back to the caller, and for an
operation when it is a change to a codebase.
:::

## The bundle

```ts
import { defaultInlineUseCaseRegistry } from '@cat-factory/node-server'

const inlineUseCaseRegistry = defaultInlineUseCaseRegistry()

inlineUseCaseRegistry.register({
  useCaseId: 'stefka:scene-prose', // ALWAYS namespaced (<ns>:<name>)
  label: 'Scene prose',
  description: 'Write a scene from its beat sheet, in the game’s voice.',
  category: 'Narrative', // optional grouping caption for your own picker

  // The NARROWING: nothing else is invocable through this use case, whatever else
  // the workspace's model catalog holds.
  models: [
    {
      id: 'magnum',
      label: 'Magnum v4',
      description: 'A prose fine-tune. Best register for in-world dialogue.',
      source: { kind: 'provider', ref: { provider: 'novelai', model: 'magnum-v4-72b' } },
      default: true,
    },
    {
      id: 'gemini-flash',
      label: 'Gemini Flash',
      description: 'Fast and cheap; use it for bulk barks.',
      source: { kind: 'catalog', modelId: 'gemini-flash' },
    },
  ],

  // The form, in the same descriptor vocabulary a reusable operation's brief uses.
  parameters: [
    { key: 'beats', label: 'Beat sheet', type: 'textarea', required: true },
    {
      key: 'tone',
      label: 'Tone',
      type: 'select',
      options: [
        { value: 'grim', label: 'Grim' },
        { value: 'wry', label: 'Wry' },
      ],
    },
    { key: 'wordTarget', label: 'Target length (words)', type: 'number' },
  ],

  // What a caller may steer, and how far.
  generation: {
    temperature: { default: 1.05, min: 0.6, max: 1.4 },
    maxOutputTokens: { default: 1_200, max: 4_000 },
  },

  systemPrompt: 'You write scene prose for a dark-fantasy RPG. Never narrate player choices.',
})
```

Pass the registry at boot, exactly as you would any other:
`start({ inlineUseCaseRegistry })`, `startLocal({ inlineUseCaseRegistry })`, or the Worker's
`inlineUseCaseRegistry` override. Register **by reference**, from your own composition root, and
import the registry constructor from the facade package you boot through rather than from
`@cat-factory/kernel` directly ([Manifests](./manifests.md) explains why that matters).

## Narrowing the models

`models` is the reason the feature exists. A creative-writing tool wants prose models for prose and
a cheap general model for bulk work, and it wants that choice made once by the person who
understands the models, not per request by whatever the client happens to send.

Each option names ONE of two sources:

| Source                                 | Use it for                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| `{ kind: 'catalog', modelId }`          | A model in Cat Factory's own [model catalog](../guide/model-providers.md). It routes through whichever provider this workspace has configured, so adding a direct key later upgrades the route with no edit here. |
| `{ kind: 'provider', ref }`             | Anything else: a prose fine-tune, a vendor whose whole product is fiction, an OpenAI-compatible endpoint you serve yourself. Register the resolver for its `provider` id the way [custom providers](./custom-providers.md) describes. |

Exactly one option carries `default: true`, which is what an invocation naming no model runs on. A
single-model use case may omit the flag; several models with none flagged, or with more than one,
fails boot rather than picking whichever you happened to list first.

**A model outside the list is refused, never substituted.** So is one this deployment cannot serve
inline. That is the whole point of declaring a list: a caller that asked for Magnum and silently got
a general-purpose model would store prose in the wrong register with nothing saying so. Discovery
therefore publishes each model's availability, and an unavailable one says which of two things it
is:

- **`provider_unavailable`** — nothing here resolves it. You configure the provider.
- **`container_only`** — it resolves only through a coding-subscription harness that runs inside a
  per-run container, which this surface has none of. No configuration changes that; the caller picks
  another model. (Local mode is the exception: an ambient `claude` or `codex` login can serve one
  inline, and says so.)

## The parameter form

`parameters` draws on the same field vocabulary as a reusable operation's per-case form, so a client
that renders one renders the other, and the platform runs one validator over both. The types
available are `text`, `textarea`, `number`, `select`, `checkbox`, `checkbox-group`, each with the
usual `required`, `default`, `help`, `placeholder`, `section` and `showWhen` attributes documented
under [the per-case form](./reusable-operations.md#the-per-case-form).

Two of the shared types are deliberately absent. `password` is excluded because a collected value is
folded into the model prompt and captured in call telemetry, which is the wrong home for a secret.
`path` is excluded because it means a repo-relative directory and there is no checkout in this call.

The answers reach the model as a labelled brief under your `systemPrompt`, with `select` values
rendered as their captions and unanswered fields omitted. That default is what makes a use case
declarable with no code at all. When the ordering or the phrasing of that brief IS the product,
supply `compose` instead:

```ts
compose: ({ parameters }) => ({
  system: 'You write scene prose for a dark-fantasy RPG.',
  prompt: `Beats:\n${parameters.beats}\n\nWrite ${parameters.wordTarget ?? 400} words.`,
}),
```

## Calling it

Discovery is `read` scope and invoking is `write`: an invocation spends model tokens and returns
text, and it starts no run and merges nothing. See [Use the Public API](./public-api.md) for keys
and scopes, and the [API Endpoint Reference](../reference/api-reference.md#use-cases) for the field
level.

```bash
curl -s "$BASE/api/v1/use-cases" -H "Authorization: Bearer $KEY"

curl -s -X POST "$BASE/api/v1/use-cases/stefka:scene-prose/invocations" \
  -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{
        "model": "magnum",
        "parameters": { "beats": "They meet at dusk. She lies.", "tone": "grim" },
        "temperature": 1.2
      }'
```

The response carries the text, the model it actually ran on (never a substitute), why the model
stopped, and what the call cost. `finishReason: "length"` arrives with `truncated: true`: the text
is a prefix rather than an answer, so re-run with a larger `maxOutputTokens` rather than shipping it.

## What a caller sees when something is wrong

Every refusal carries a machine-readable `error.details.reason`, so your editor can act on it rather
than matching strings:

| Status | `reason`                           | What to do                                                                     |
| ------ | ---------------------------------- | -------------------------------------------------------------------------------- |
| `404`  | `use_case_not_found`               | Re-read the catalog; the deployment no longer registers this id.                 |
| `422`  | `use_case_parameters_invalid`      | `details.problems` names every problem at once. Fix the form.                     |
| `422`  | `use_case_model_not_allowed`       | `details.allowed` names what this use case does carry.                            |
| `422`  | `use_case_generation_out_of_range` | The knob is outside the published bounds. Nothing is clamped.                     |
| `429`  | `budget_exhausted`                 | The workspace has spent its model budget. Nothing reached a vendor.               |
| `503`  | `use_case_model_unavailable`       | `details.cause` is `provider_unavailable` or `container_only`.                    |
| `503`  | `use_case_models_unconfigured`     | This deployment has wired no model provider at all.                              |
| `503`  | `use_case_empty_reply`             | The model answered with nothing usable. Retry, or offer another model.            |

Two of those are choices worth counting on. A model that cannot be honoured is refused rather than
swapped, as above. And a `200` never carries an empty string: some reasoning models answer only into
their private channel, and a content editor would otherwise save that silence as the model's answer.

## What it costs, and where it shows up

An invocation answers to the workspace's [spend budget](../guide/budgets.md), for the
same reason a run does: it is a billable model call. When the budget is spent, the call is refused
before anything reaches a vendor.

Every invocation files an LLM-call record tagged with the use case's id, so
[the spend and telemetry surfaces](../operate/observability.md) attribute an editor's usage per use
case rather than as one undifferentiated bucket. Nothing else is stored: there is no board row, no
run and no history of generated text. Your editor owns what it keeps.

## Discovery is always available

`GET /api/v1/use-cases` never 404s and never 503s.

- A deployment that registered nothing answers an EMPTY list, because "nobody registered a use case"
  and "this deployment has no such surface" are different facts and your client should be able to
  tell them apart.
- A deployment with no model provider answers the full catalog with every model marked unavailable,
  so your picker shows what the use case offers, greyed out, rather than looking like a use case with
  no models.

Only the invocation refuses in that second state.

---

Next: [Use the Public API](./public-api.md) for keys, scopes and the rest of the surface, or
[Package a Reusable Operation](./reusable-operations.md) when the work is a change to a repository
rather than a piece of text.
