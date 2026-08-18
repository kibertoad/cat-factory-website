# Feed Design Context to Agents

For the team whose frontend work starts in Figma or Zeplin. Without this, a coding agent sees the
task's prose and nothing else: it guesses at layout, reinvents components the design system already
has, and picks colours and spacing that are not your tokens.

Connect a design source and Cat Factory pulls the frame's component structure, layout, and design
tokens, renders them to Markdown, and hands them to the UI agents as context alongside the task's
other linked material.

## Connect a source

Design sources ride the same integration as documents: connect once per workspace, then link a
frame or screen to a task like any other document. See
[Connect Issue & Document Sources](./issue-sources.md).

| Source | Credential |
| --- | --- |
| **Figma** | An OAuth grant (the designer-friendly path: click through, no token to mint) or a personal access token. If your deployment has registered a Figma app, both are offered; otherwise the token is the way in. |
| **Zeplin** | A personal access token. |

When a workspace holds both a Figma grant and a leftover personal access token, the **grant wins**.
It is the credential the platform can renew, and a token an earlier connect left behind must not
outlive the rotation that replaced it.

::: warning Figma personal access tokens now expire
Figma no longer issues a non-expiring personal access token: 90 days is the maximum lifetime a new
one can be given. A workspace connected that way stops importing design context on that clock, with
nothing in the deployment to warn you first, so plan the rotation or connect through OAuth instead.
An organisation on a plan that offers **plan access tokens** has a third option: those are scoped to
the organisation rather than to one person, so they survive that person leaving.
:::

## Link a frame to a task

Paste a Figma or Zeplin share URL into the context picker on the Add task popup or in the task
inspector. Two shapes of reference work, and they cost different things:

- **A node link** (a specific frame or screen) imports that frame's subtree. This is the one to
  reach for: it is the smallest thing that answers "build this screen".
- **A whole-file link** imports the first several top-level frames across the file's pages. Useful
  for a design system or a small file, expensive and lossy for a large one.

Figma share URLs are canonicalised, so the same frame linked from two differently-decorated URLs is
recognised as one document.

## What the agent receives

The imported document renders as a Markdown file the agent reads on demand, in a fixed shape:

- **Notes** first: anything the import could not fully cover, so a reader hits the qualification
  before the content it qualifies.
- **One section per frame or screen**, with each node's styling in brackets: the facts an agent
  would otherwise invent, such as `[fill #3366ff; Inter 16/600 lh 24; radius 8; auto-layout vertical
  gap 12 padding 16/24]`.
- **Components**: each instance's component-set name plus the variants and properties the design
  actually uses, for example `variants: Size=Large | Size=Small; props: Icon=true, Label`. That is
  the signal an agent matches against components already in your repository. When the list has to be
  capped it keeps the **most-used** components, because dropping those would make the section
  useless.
- **Design tokens**: colours, typography and spacing.
- **References**: a short-lived rendered-preview URL, where the source offers one.

Alongside it, the run folds in the standard design-context guidance whenever any linked document
comes from a design source. It tells the agent to read the structure, match the component list
against what the repository already has, and honour the tokens instead of ad-hoc values. That is
triggered by the **document being present**, not by how the task is labelled, so a design linked to
an unlabelled task still gets it and a frontend task with no design does not.

### Where Figma's tokens come from

Figma serves design **variables** only on Enterprise plans. Where the plan does not serve them, the
import falls back to the file's **published styles**, which every plan serves. The two are never
merged, and the rendered section says which one produced it. A design that simply defines no tokens,
a plan that gates the variables endpoint, and a read that failed are three different facts, and the
page names which one you are looking at rather than showing an empty section for all three.

### Caps, and what each one asks you to do

An import is bounded, and each bound leaves its own note rather than one generic "truncated" flag,
because the fix differs:

| The note says | What happened | What to do |
| --- | --- | --- |
| A branch was cut at depth | One deeply-nested branch stopped; everything else is intact. | Link that sub-frame separately if you need its inside. |
| A frame's nodes were capped | That frame is too big to render whole. | Link a smaller frame within it. |
| The import-wide node budget ran out | This frame and everything after it were dropped. | Import fewer frames. |
| A frame's text was truncated | That frame is very wordy. | The section carries a `(text truncated)` line where the text stops. |
| Components or tokens were capped | The design **system** is large; the frames themselves are unaffected. | Open the library file for the full set. |
| More screens exist than were imported | The project has more screens than the per-import limit. | Link the screens you need individually. |

A frame count alone would not say whether a cap stopped mid-page or dropped a whole page, so the
note names the per-page counts.

## Freshness: what the agent read, and when

A design under active iteration moves after you link it. Before each step runs, Cat Factory asks the
source whether the file has changed since the import, and re-imports only when it has. So a run
started an hour after a frame moved builds against the current revision, not the one that happened
to be live at link time.

The verdict travels with the document, in both the file the agent reads and the prompt an inline
reviewer gets:

- **Confirmed**: the file carries a `Revision:` line, so "which revision did this run build
  against" is answerable afterwards from the run's own checkout.
- **Nothing at all**: there is no source to trail, for an uploaded file or a source this deployment
  has not wired.
- **A warning**: the copy might trail the live file. Four reasons, because each needs a different
  fix:

| Reason | Fix |
| --- | --- |
| Not connected | Reconnect the source for this workspace. |
| Source unreachable | An outage upstream. Wait it out; the cause is on the operator's log. |
| Unversioned | The source exposes no version token, so nothing can be fixed and nothing may be claimed. |
| Credentials unreadable | The connection could not be read at all, so the source was never asked. |

An omitted warning would read exactly like a copy that *was* checked, which is why the
unconfirmed case is always stated rather than left blank.

## Renders

An import also downloads the frames as images and keeps them beside the text, on the same shelf the
[Visual Confirmation](./choosing-a-pipeline.md#visual-confirmation) gate reads its reference images
from. Fewer frames are rendered than are described in text, because a frame's prose costs a few
kilobytes of the agent's context and its image costs a megabyte or two of storage.

Each document row states what became of its images, because every way of ending up with none looks
the same otherwise: stored, partially stored, none, failed, or no image storage configured. A render
failure never fails an import: the text is the load-bearing half.

### The agents that see them

The retained frames are also put in front of the agents that build and plan a screen (the
implementer, the architect and the fixer), alongside the text. Where an agent can be shown a
picture, it is: on a coding run the frames are written into the checkout and the agent opens them,
and on an inline step they ride the model request itself.

Two things have to be true for that to happen:

- **The agent CLI running the step has to be able to read an image.** Claude Code can; the other
  harnesses in this build cannot.
- **The model has to accept image input.** The Claude, GPT and Gemini entries do, as does Llama 4
  Scout on Workers AI. For a model whose catalog entry does not state either way, the pictures are
  not attached, because guessing wrong sends a whole run's context to a model that will reject it.

Neither is something you configure for a catalog model. A locally-run model has no catalog entry, so
it is the one case where the answer can be yours to give: see
[Locally-run models](#locally-run-models) below.

When the frames cannot be delivered, the agent is TOLD so, with which of the two is missing, so it
works from the text rather than assuming the design has nothing more to show. Far fewer pictures are
attached than are retained: an attached image costs input tokens on every turn of the run, where a
retained one costs storage once. The views left out are named in the same place, and the text still
describes them.

### Locally-run models

A [model on your own machine](./model-providers.md#running-on-a-local-llm-ollama-lm-studio) has no
catalog entry to read a modality off: the id is free text and the runner's `/models` probe returns
ids and nothing else. Image support resolves in two tiers instead.

**A table of recognised open-weights families** answers first, so the common case needs nothing from
you. It covers Muse Glimmer, Gemma 4, Qwen's `-VL` builds, Llama 4, LLaVA, MiniCPM-V and Moondream,
each listed because its publisher documents image input for the open weights. Matching ignores the
org prefix, the size tag, the quantisation and the file format, so `gemma4:12b`,
`google/gemma-4-12b`, `Gemma-4-12B-it-GGUF` and `mlx-community/Gemma-4-12B-4bit` are all recognised
as the same family. Version digits stay significant, so a Gemma 3 id is not read as a Gemma 4 one.

A family whose modality depends on the **size** is deliberately left out rather than approximated.
Gemma 3 is the worked example: its 1B is text-only while its 4B and up are not, so a family-name
match would have told every `gemma3:1b` user their model reads images. Those need a declaration from
you.

**Your own declaration outranks the table**, because you are the one who knows which build you
pulled. Under **Settings → My local runners**, each enabled model carries an **Image support for
`<model>`** control with three positions:

- **Reads images**
- **Text only**
- **Not set**, which names what the table will do for that id (`Not set: Gemma 4 reads images`), or
  reads `Images: not set` where the platform recognises nothing.

Set it explicitly for a text-only quant, a fine-tune, or a re-tagged local copy the table would
otherwise judge by its name.

::: warning A run needs an initiator for this to be read
Declarations belong to a person, so they are resolved from the run **initiator's** own runner
entries. A run nobody started (a [recurring pipeline](./recurring-pipelines.md), a system sweep)
resolves none, and the family table is not consulted in that case either: with no declarations read
at all, your own **Text only** is exactly what could not be seen, so the frames are withheld rather
than attached on a guess.
:::

## Claude Design: commit it, don't connect it

Anthropic's Claude Design cannot be connected as a source here. Its only programmatic read path is
bound to a claude.ai login, and Cat Factory's agent containers have no such login and no
per-workspace service token to store.

The supported workflow is simpler, and needs no credential at all:

1. In Claude Code, run `/design-sync` to pull the design-system project into your repository
   (component HTML, the manifest, and CSS), for example under `design/`.
2. Commit it.

Cat Factory's coding agents read the checkout natively, so the design system is on disk for every
run: no connector, no credential, no import step.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| The agent ignored the design system | The design is linked but the components section is empty | Check the notes: a capped or failed components read says so. A frame that uses no library components has none to report. |
| Tokens are missing | The Figma variables endpoint is plan-gated and the file publishes no styles | Publish styles in the file, or read the token section's stated origin. |
| A whole-file import came back thin | The import-wide budget stopped after the first frames | Link the specific frames you need instead of the file. |
| Every run warns the design may be stale | The source exposes no version token, or the connection cannot be read | The reason is named in the warning; only the first two of the four are yours to fix. |
| No images beside the text | Image storage is not configured for the deployment | See [Configuration → Content storage](../deploy/configuration.md#content-storage-binary-artifacts). |
| The agent worked from the text and said it was shown no pictures | The step's agent CLI or its model cannot take an image | The agent's own note names which of the two. Pin the step to a Claude Code model to get both. |
| A local model that reads images was shown none | Its image support is **Not set** and the platform recognises nothing in the id | Declare it on the model under **Settings → My local runners**. |
| A local model gets no pictures on a scheduled run only | A run with no initiator resolves nobody's declarations | Expected. Start the run yourself, or pin that step to a catalog model. |
| The agent was shown fewer screens than the design has | Only a handful of pictures are attached per run | Expected. The agent names the views it was not shown, and the text still covers them. |

---

Next: [Connect Issue & Document Sources](./issue-sources.md) for the rest of what a task can carry,
or [Choose and Edit a Pipeline](./choosing-a-pipeline.md#visual-confirmation) for the gate that
compares a built screen against the design.
