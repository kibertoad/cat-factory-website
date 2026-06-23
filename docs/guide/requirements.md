# Requirements

Agents succeed or fail on the quality of their context. Cat Factory works requirements at two
levels:

1. A **per-task clarification loop**: the *requirements reviewer* makes one block unambiguous
   *before* any code is generated.
2. A **service-level prescriptive spec**: the **Spec Writer** aggregates every task's clarified
   requirements into a unified, in-repo `spec/` document (plus Gherkin acceptance scenarios) that
   every later agent builds against.

## Why this matters

A vague task produces vague code. Rather than discovering misunderstandings in the pull request,
Cat Factory front-loads the clarification with a dedicated **reviewer agent** that inspects a
block and reports what's missing.

## Sources of requirements

A block's requirements can come from:

- A **description you write** directly on the block.
- **Linked external sources**: Jira or GitHub issues, plus Confluence, Notion, or GitHub repo
  documents, imported and expanded into the block's context. See [Issue & Document
  Sources](./issue-sources.md).

## The reviewer agent

The reviewer is an inline (no-container) agent. It analyzes the description and linked context and
raises **findings**, each tagged with a category and a severity (low, medium, or high):

| Category | What it surfaces |
| --- | --- |
| **gap** | Missing information an implementer would need. |
| **clarification** | Ambiguous points that could be read multiple ways. |
| **assumption** | Things the agent would otherwise have to assume. |
| **risk** | Aspects that could go wrong or have outsized impact. |
| **question** | Open questions for a product owner to answer directly. |

The reviewer **runs automatically** as the first gate step when a task's pipeline starts. It opens a
dedicated **review window**, and the findings are persisted so you can work through them over several
sittings. If the task names a [responsible product
person](./team-and-access.md#the-responsible-product-person), they get the "findings raised"
notification flagged to them directly; otherwise it goes to the task's creator.

## The review loop

Requirements review is **iterative**. Each round:

1. The reviewer raises its findings.
2. You **answer** or **dismiss** each one in the review window.
3. An **incorporation companion** folds your answers into one standard-format requirements document.
4. The reviewer **re-reviews** that document and either converges or raises a fresh round.

The cycle repeats until the reviewer is satisfied (or every remaining finding is dismissed). If a
merge of your answers comes out wrong, you can redo it with a comment instead of accepting it.

Incorporation and re-review run **in the background**. After you click "Incorporate answers" you go
straight back to the board, and the task card shows which stage is running ("Incorporating answers…"
then "Re-reviewing…") in place of an approval badge, since no action is needed until the reviewer
comes back. You're summoned again only if the re-review raises fresh findings or hits the iteration
cap; a converged round just advances the pipeline. (If you
dismissed everything and left nothing to fold in, the round settles with no LLM call at all.)

Two per-task knobs on the [merge-threshold preset](./designing-your-board.md#navigating-navbar-and-command-bar)
tune the loop:

- **`maxRequirementIterations`** (default **3**): how many reviewer passes run before the loop stops
  and asks you to choose one more round, proceed anyway, or stop and reset the task.
- **`maxRequirementConcernAllowed`** (default none): findings at or below this severity are recorded
  but auto-advance the run, with no human gate and the companion skipped, so only the findings that
  matter to you pause the run.

::: tip Do this before running a pipeline
Resolving requirements first means the **Coder**, **Tester**, and **Acceptance** steps all work from
the same clear definition, which means fewer wasted runs and fewer surprise PRs.
:::

## The unified in-repo spec

Where the reviewer clarifies one task at a time, the **Spec Writer** agent produces the durable,
**prescriptive** spec for the whole service. It is the mirror image of a
[blueprint](./repositories.md#service-blueprints--reconciliation): a blueprint is *descriptive*
("what the code is"), while the spec is *prescriptive* ("what must be true").

The Spec Writer runs **before the Architect** in the Full build pipeline (and standalone via the
**Write spec** pipeline). Every task gets a shared work branch created up front, so the spec lands
on that branch first and the spec-aware Architect designs against it, rather than the spec being
written only after the design is settled. The writer aggregates the clarified requirements of
**every task** under the service frame and commits a `spec/` folder:

| File | Contents |
| --- | --- |
| `spec/spec.json` | The canonical machine-readable tree (the source of truth). |
| `spec/overview.md` | High-level overview, the file agents read first. |
| `spec/rules.md` | Cross-cutting domain rules, invariants, and constraints. |
| `spec/version.json` | A tiny manifest (version, hash, counts) for cheap staleness checks. |
| `spec/features/*.feature` | Gherkin features, one `Scenario` per acceptance criterion. |

Each requirement carries a MoSCoW priority (must, should, or could), a kind (functional,
non-functional, or constraint), provenance back to the board task(s) it came from, and structured
**Given/When/Then** acceptance criteria. Those criteria seed the Gherkin scenarios in a two-pass
flow: the **Spec Writer** seeds the `.feature` files, the **Acceptance Author** agent polishes them,
and the **Acceptance Test Author** agent turns each scenario into a runnable test. Re-runs rewrite
the canonical files but never clobber the polished features.

The spec is **not** human-gated. Instead of pausing for your approval, the Spec Writer's companion,
the **Spec Reviewer**, rates the spec (especially its acceptance-scenario coverage) and loops the
writer back with the feedback folded in until the spec clears the bar. Every container agent reads
the in-repo spec as context, and the engine strictly validates any returned document before
ingesting it. The in-repo files are the source of truth.

## Recommended flow

```
Write/​link context  →  Run reviewer  →  Answer findings  →  Incorporate  →  Spec Writer aggregates  →  Ready to build
```

---

Next: turn a ready task into code with [Running Pipelines](./running-pipelines.md).
