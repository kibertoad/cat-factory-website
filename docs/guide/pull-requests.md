# Pull Requests & Merging

Cat Factory's definition of "done" is deliberately strict: a task is complete only when its
**pull request is merged with passing CI**. This page covers what agents produce and how merging
closes the loop.

## What the coding agent produces

During the **Coder** step, an agent:

1. Clones your repository into an **ephemeral container**.
2. Implements the task from its (reviewed) [requirements](./requirements.md).
3. **Commits its own work** to a dedicated per-task branch and validates locally.

The agent never needs push credentials: Cat Factory owns the delivery contract. The platform
pushes the branch, opens the **pull request**, and drives your existing CI/CD. Because the
branch is deterministic and checkpointed, a retried or resumed run continues on the same branch and
PR rather than starting over.

The **Tester** step then validates the change before the closing automation runs.

## Conflicts, CI, and the merger

The Full build pipeline finishes with three engine steps that prepare the PR for merge:

- **Conflicts Gate** - keeps the PR mergeable with its base, looping a **Conflict Resolver** agent to
  merge the base in and resolve any conflicts on the same branch.
- **CI Gate** - gates the (now up-to-date) PR on green CI, looping a **CI Fixer** agent on failure.
- **Merger** - scores the PR on complexity, risk, and impact, then either auto-merges when the
  scores fall within the task's [merge-threshold preset](./designing-your-board.md#navigating-navbar-and-command-bar)
  or raises a review notification for a human.

## Reviewing the PR

Review the pull request exactly as you would any human contribution:

- Read the diff and the agent's description of what it changed.
- Confirm CI is green.
- Request changes or leave comments if something's off.

Because the work is a real PR in your repository, all your existing branch protections, required
checks, and review rules apply unchanged.

## Merging closes the loop

When you **merge** the pull request:

- The associated block flips to **Done**.
- A completion event streams back to the board, updating it in real time.

```
PR opened → CI passes → Tester/Acceptance validate → you review → merge → block Done
```

## Iterating

If the change needs more work, you have the usual options:

- Push commits or request changes on the PR directly.
- Refine the block's [requirements](./requirements.md) and start a new run.
- Use the run's **retry** to re-run from a failed step.

Each iteration is fully visible on the board and in the run's event log.

---

Next: connect and bootstrap the repositories agents work in - [Repositories](./repositories.md).
