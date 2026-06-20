# Requirements

Agents succeed or fail on the quality of their context. Cat-Factory works requirements at two
levels:

1. A **per-task clarification loop**: the stateless *requirements reviewer* makes one block
   unambiguous *before* any code is generated.
2. A **service-level prescriptive spec**: the *requirements-writer* aggregates every task's
   clarified requirements into a unified, in-repo `requirements/` document (plus Gherkin acceptance
   scenarios) that every later agent builds against.

## Why this matters

A vague task produces vague code. Rather than discovering misunderstandings in the pull request,
Cat-Factory front-loads the clarification with a dedicated **reviewer agent** that inspects a
block and reports what's missing.

## Sources of requirements

A block's requirements can come from:

- A **description you write** directly on the block.
- **Linked external sources**: Jira or GitHub issues, plus Confluence, Notion, or GitHub repo
  documents, imported and expanded into the block's context. See [Issue & Document
  Sources](./issue-sources.md).

## The reviewer agent

The reviewer is a **stateless** agent you trigger on a block. It analyzes the description and
linked context and raises **review items**, each tagged with a category and a severity (low,
medium, or high):

| Category | What it surfaces |
| --- | --- |
| **gap** | Missing information an implementer would need. |
| **clarification** | Ambiguous points that could be read multiple ways. |
| **assumption** | Things the agent would otherwise have to assume. |
| **risk** | Aspects that could go wrong or have outsized impact. |
| **question** | Open questions for a product owner to answer directly. |

You trigger a review from the block in the inspector. Unlike a pipeline run, the review is
**synchronous and stateless**, with no container, and its items are persisted so you can
answer them over several sittings.

## Answering the open questions

Each item is **open** until you engage, then **answered** once you reply, and **resolved** or
**dismissed** once you settle it. Work through the list in the inspector, replying to and triaging
each item.

Once every item is settled, **incorporate** folds your answers back into the block's requirements,
so the coding agent later works from a complete, agreed-upon spec.

::: tip Do this before running a pipeline
Resolving requirements first means the **Coder**, **Tester**, and **Acceptance** steps all work from
the same clear definition, which means fewer wasted runs and fewer surprise PRs.
:::

## The unified in-repo requirements document

Where the reviewer clarifies one task at a time, the **requirements-writer** agent produces the
durable, **prescriptive** spec for the whole service. It is the mirror image of a
[blueprint](./repositories.md#service-blueprints--reconciliation): a blueprint is *descriptive*
("what the code is"), while requirements are *prescriptive* ("what must be true").

The writer runs **before the Coder** in the Full build pipeline (and standalone via the
**Write requirements** pipeline). It aggregates the clarified requirements of
**every task** under the service frame and commits a `requirements/` folder to the implementation
branch so the spec is present while the code is written:

| File | Contents |
| --- | --- |
| `requirements/requirements.json` | The canonical machine-readable tree (the source of truth). |
| `requirements/overview.md` | High-level overview, the file agents read first. |
| `requirements/rules.md` | Cross-cutting domain rules, invariants, and constraints. |
| `requirements/version.json` | A tiny manifest (version, hash, counts) for cheap staleness checks. |
| `requirements/features/*.feature` | Gherkin features, one `Scenario` per acceptance criterion. |

Each requirement carries a MoSCoW priority (must, should, or could), a kind (functional,
non-functional, or constraint), provenance back to the board task(s) it came from, and structured
**Given/When/Then** acceptance criteria. Those criteria seed the Gherkin scenarios in a two-pass
flow: the **Requirements Writer** seeds the `.feature` files, the **Acceptance Author** agent
polishes them, and the **Acceptance Test Author** agent turns each scenario into a runnable test.
Re-runs rewrite the canonical files but never clobber the polished features.

Every container agent reads the in-repo requirements as context, and the engine strictly validates
any returned document before ingesting it. The in-repo files are the source of truth.

## Recommended flow

```
Write/​link context  →  Run reviewer  →  Answer items  →  Incorporate  →  requirements-writer aggregates  →  Ready to build
```

---

Next: turn a ready task into code with [Running Pipelines](./running-pipelines.md).
