# Document Tasks

Not all work is code. A **document task** produces a written document, a PRD, an RFC, an ADR, a
runbook, and ships it as a Markdown file in a repository through the same pull-request flow as a code
change. It is the forward-authoring counterpart to the reverse-documentation agents that describe
existing code (blueprints and the code documenters).

## Creating a document task

In **Add Task**, pick the **Document** type. A **Document repository** service (a frame of the
document type) accepts only **Document** and **Spike** tasks; a regular service accepts document tasks
alongside its feature, bug, and spike work.

Every document task takes four shared fields:

| Field | What it sets |
| --- | --- |
| **Document kind** | The kind of document (see below). Sets the template, the default directory, and which extra fields appear. |
| **Audience** | Who the document is for, for example "platform engineers". |
| **Target path** | Where the file lands, for example `docs/rfcs/0001-foo.md`. Must be a repo-relative `.md` path. Leave it blank to use the kind's default directory. |
| **Outline hints** | Sections or points the document should cover. |

## Document kinds

The **Document kind** picks the document's shape. Each kind has a built-in section template, a default
in-repo directory, and, for several kinds, extra fields tailored to it:

| Kind | Default directory | Kind-specific fields |
| --- | --- | --- |
| **prd** | `docs/prd` | Target users, Success metrics |
| **rfc** | `docs/rfc` | Alternatives considered, Rollout concerns |
| **adr** | `docs/adr` | Decision drivers, Considered options |
| **design** | `docs/design` | — |
| **technical** | `docs/technical` | — |
| **api** | `docs/api` | API surface |
| **runbook** | `docs/runbooks` | When to use, Escalation path |
| **research** | `docs/research` | Research question, Options to compare |
| **reference** | `docs/reference` | — |
| **other** | `docs` | — |

The kind-specific fields you fill are folded into the author's prompt as required content for the
matching sections, so a PRD's "Success metrics" or an ADR's "Considered options" get written from what
you provided rather than invented.

## How a document is authored

Document tasks run one of two pipelines, chosen like any pipeline in the task inspector:

- **Author a document** is the full flow: research the topic, draft an outline, an interactive
  question round with you, write the document, review and finalize it, then the **doc-quality gate**,
  conflicts, CI, and merge.
- **Quick document** skips research and outlining: write, review, doc-quality gate, then merge.

The writer opens the pull request; a reviewer companion loops the writer until the draft converges,
with a human review gate on the result. The finalizer polishes the merged-in prose.

## Templates and examples

Each document kind ships with a built-in section template (a PRD's Overview, Problem & Goals, Target
Users, User Stories, Scope, Requirements, Acceptance Criteria, Success Metrics, and so on). You can
override and enrich these per workspace from the **Document templates** window:

- **Set as template.** Link an imported document as the template for a kind. Its headings replace the
  built-in section skeleton, so your house RFC or ADR structure becomes the one the author follows and
  the [doc-quality gate](#the-doc-quality-gate) checks against. One template per kind.
- **Add as example.** Link one or more imported documents as exemplars for a kind. The author is shown
  an excerpt of each as a model to emulate, on top of the built-in curated examples several kinds
  carry.

The template or exemplar must first be imported as a document from a connected
[document source](./issue-sources.md) (Confluence, Notion, a GitHub repo document, Figma, Zeplin, or
Linear), then tagged in the window.

## Writing-style fragments

Two built-in **writing-style** [prompt fragments](./prompt-fragments.md), *Avoid LLM tells* and
*Concise and actionable*, are attached to every new document task by default. They govern how the prose
reads (lead with the point, active voice, no filler or hedging) and, because the reviewer sees the same
fragments, they double as the review criteria. Remove them like any block fragment, or add your own
writing-style fragments to a task.

## The doc-quality gate

Before a document merges, the **Doc Quality Gate** runs a fast structural check on the drafted file and
blocks the merge until it passes. It flags:

- **Missing required sections** from the resolved template (matched leniently, so a meaning-preserving
  rename still counts).
- **Leftover placeholders**: `TODO`, `TKTK`, `FIXME`, `XXX`, "lorem ipsum", and unfilled
  `<…>` placeholders (code blocks and comments are ignored).
- **Heading-hierarchy problems**: no single top-level title, more than one, or a skipped level.
- **Broken in-repo links** to files or directories that don't exist at the PR head.

On a failure it dispatches a **Doc Fixer** agent to correct the draft in place on the PR branch (up to
two attempts) before raising the issue for you. The gate resolves the same template the writer used, so
the two never disagree.

Deployers wire the gate's provider once at startup; until then it passes through. See
[Custom Agents & Gates → the document-quality gate](../deploy/custom-agents.md#the-document-quality-gate).

---

Next: review and merge the document like any change in [Pull Requests](./pull-requests.md).
