# Requirements

Agents succeed or fail on the quality of their context. Cat-Factory gives you a structured way to
make every task unambiguous **before** any code is generated.

## Why this matters

A vague task produces vague code. Rather than discovering misunderstandings in the pull request,
Cat-Factory front-loads the clarification with a dedicated **reviewer agent** that inspects a
block and reports what's missing.

## Sources of requirements

A block's requirements can come from:

- A **description you write** directly on the block.
- **Linked external sources** — Jira, Linear, or GitHub issues, and Confluence or Notion
  documents — imported and expanded into the block's context. See [Issue Sources](./issue-sources.md).

## The reviewer agent

The reviewer is a **stateless** agent you trigger on a block. It analyzes the description and
linked context and identifies four things:

| Category | What it surfaces |
| --- | --- |
| **Gaps** | Missing information an implementer would need. |
| **Clarifications** | Ambiguous points that could be read multiple ways. |
| **Assumptions** | Things the agent would otherwise have to assume. |
| **Risks** | Aspects that could go wrong or have outsized impact. |

Trigger it with:

```http
POST /blocks/:id/review-requirements
```

The review runs asynchronously and reports back via the live event stream.

## Answering the open questions

The reviewer's findings become a **human-in-the-loop** checklist. You answer the questions, and
your answers are **integrated back into the block's description**, so the coding agent later works
from a complete, agreed-upon spec.

Record your answers with:

```http
PATCH /blocks/:id/requirements
```

::: tip Do this before running a pipeline
Resolving requirements first means the coder, tester, and acceptance steps all work from the same
clear definition — fewer wasted runs and fewer surprise PRs.
:::

## Recommended flow

```
Write/​link context  →  Run reviewer  →  Answer gaps & risks  →  Description updated  →  Ready to build
```

---

Next: turn a ready task into code with [Running Pipelines](./running-pipelines.md).
