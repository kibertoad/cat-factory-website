# Pull Requests & Merging

Cat-Factory's definition of "done" is deliberately strict: a task is complete only when its
**pull request is merged with passing CI**. This page covers what agents produce and how merging
closes the loop.

## What the coding agent produces

During the `coder` step, an agent:

1. Clones your repository into an **ephemeral container**.
2. Implements the task from its (reviewed) requirements.
3. Opens a **pull request** against your repo.
4. Triggers your existing **CI/CD**, which Cat-Factory verifies.

The `tester` and `acceptance` steps then validate the change — running tests and confirming the
output meets the task's acceptance criteria — before the PR is handed to you.

## Reviewing the PR

Review the pull request exactly as you would any human contribution:

- Read the diff and the agent's description of what it changed.
- Confirm CI is green.
- Request changes or leave comments if something's off.

Because the work is a real PR in your repository, all your existing branch protections, required
checks, and review rules apply unchanged.

## Merging closes the loop

When you **merge** the pull request:

- The associated block flips to **`done`**.
- A completion event streams back to the board, updating it in real time.

```
PR opened → CI passes → tester/acceptance validate → you review → merge → block "done"
```

## Iterating

If the change needs more work, you have the usual options:

- Push commits or request changes on the PR directly.
- Refine the block's [requirements](./requirements.md) and start a new run.
- Use the run's **retry** to re-run from a failed step.

Each iteration is fully visible on the board and in the run's event log.

---

Next: connect and bootstrap the repositories agents work in — [Repositories](./repositories.md).
