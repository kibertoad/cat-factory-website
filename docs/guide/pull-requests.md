# Pull Requests & Merging

Cat Factory's definition of "done" is deliberately strict: a task is complete only when its
**pull request is merged with passing CI**. This page covers what agents produce and how merging
closes the loop.

## What the coding agent produces

During the **Coder** step, an agent:

1. Clones your repository into an **ephemeral container**.
2. Implements the task from its (reviewed) [requirements](./requirements.md).
3. **Commits its own work** to a dedicated per-task branch and validates locally.

The agent never receives push credentials. It only commits; the **harness** that runs it owns
delivery, using the run's scoped installation token to push the branch and open the **pull
request**, after which your existing CI/CD takes over. Because the branch is deterministic and
checkpointed, a retried or resumed run continues on the same branch and PR rather than starting
over.

The **Tester** step then validates the change before the closing automation runs.

## Conflicts, CI, and the merger

The Full build pipeline finishes with three engine steps that prepare the PR for merge:

- **Conflicts Gate**: keeps the PR mergeable with its base, looping a **Conflict Resolver** agent to
  merge the base in and resolve any conflicts on the same branch.
- **CI Gate**: gates the up-to-date PR on green CI, looping a **CI Fixer** agent on failure.
- **Merger**: scores the PR on complexity, risk, and impact, then either auto-merges when the
  scores fall within the task's [merge-threshold preset](./designing-your-board.md#navigating-navbar-and-command-bar)
  or raises a review notification for a human. When you pick a preset in the add-task modal or task
  inspector, the dropdown labels each option with its actual auto-merge ceilings (complexity, risk,
  impact) and CI-fix budget, and the default option shows the resolved workspace default's
  thresholds, so you can compare presets without opening the settings panel. It only auto-merges a PR
  it could actually examine:
  if it can't read a real diff, or its assessment lacks a credible explanation, it routes to human
  review rather than merging on a hollow score.

A pipeline can add a **Post-release-health** gate after the Merger that watches Datadog monitors and
SLOs for a window after the merge and escalates to an on-call agent on a regression. It's optional
and needs a connected Datadog deployment; see
[Observability → Post-release health](../deploy/observability.md#post-release-health-and-agent-on-call).

## Reviewing the PR

Review the pull request exactly as you would any human contribution:

- Read the diff and the agent's description of what it changed.
- Confirm CI is green.
- Request changes or leave comments if something's off.

Once an agent has pushed a branch, the task inspector shows a **branch quick-link** that opens the
task's work branch on GitHub, so you can jump straight from a board task to its code.

Because the work is a real PR in your repository, all your existing branch protections, required
checks, and review rules apply unchanged.

To make a human code review a required step rather than an after-the-fact check, add the **Human
Review** gate: the run waits for the PR to meet GitHub's required approvals with no unresolved
threads, and loops the Fixer to address review comments in between. See
[Human review on the pull request](./running-pipelines.md#human-review-on-the-pull-request).

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
- Use the run's **retry** to re-run from a failed step, or
  [**restart from a step you pick**](./running-pipelines.md#retry-restart-stop-and-reset) (even on a
  finished run) to redo, say, the Coder and everything after it without touching the earlier work.

Each iteration is fully visible on the board and in the run's event log.

---

Next: connect and bootstrap the repositories agents work in, [Repositories](./repositories.md).
