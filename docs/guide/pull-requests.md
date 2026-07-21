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
  scores fall within the task's [risk policy](./designing-your-board.md#navigating-navbar-and-command-bar)
  or raises a review notification for a human. When you pick a policy in the add-task modal or task
  inspector, the dropdown labels each option with its actual auto-merge ceilings (complexity, risk,
  impact) and CI-fix budget, and the default option shows the resolved workspace default's
  thresholds, so you can compare policies without opening the settings panel. It only auto-merges a PR
  it could actually examine:
  if it can't read a real diff, or its assessment lacks a credible explanation, it routes to human
  review rather than merging on a hollow score.

Risk policies live in a per-workspace library, and each task picks one (tasks with no explicit choice
use the workspace default). Two ship built in:

- **Balanced** (the default): auto-merges a PR when its complexity, risk, and impact scores fall
  within the thresholds, and routes anything above them to human review.
- **Manual review only**: never auto-merges. Every PR, whatever its scores, raises a merge-review
  notification for a person to merge. Reach for it on a board where a human always makes the final
  call.

Edit these or add your own in the workspace's **Risk policies** panel.

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

## Deep-reviewing an existing pull request

A **Review** task turns Cat Factory's own agent loose on a pull request that already exists, whether a
person or an agent opened it. It is a read-only audit: no code is written and nothing merges. This is
different from the [Human Review gate](./running-pipelines.md#human-review-on-the-pull-request), which
pauses a *build* pipeline to wait for a human's GitHub approval.

Create it from the add-task modal: pick type **Review**, and in **Pull request** enter the target as a
full URL (`https://github.com/owner/repo/pull/123`) or a bare `#123` for a PR on the service's own
repo. Add an optional **Review focus** (for example "focus on the auth changes and error handling") to
steer the reviewer. A Review task takes no title or description (the title is derived from the PR) and
no risk policy (it merges nothing). It runs the single-step **Review a pull request** pipeline, and any
[prompt fragments](./prompt-fragments.md) you pin become review criteria.

The **PR Reviewer** agent clones the repo, fetches the PR head, and for a large diff **slices it into
cohesive chunks** (a refactor with its call sites and tests) and reviews one chunk at a time, so it
scales to hundreds of files. It is **comment-aware**: it reads the PR's existing review threads and
skips issues already raised. It returns **prioritized findings**, each with a severity (blocker, high,
medium, low, or nit), a category (correctness, security, performance, maintainability, style, or test),
the file and line, an explanation, and a suggested fix. The board card shows live progress ("Reviewing
X/Y slices", then "Findings ready").

When the review finishes, the run **parks on its findings**. Open the **PR review** window, multi-select
the findings that matter (all are selected by default), and resolve:

- **Finish review** records your curated selection and closes the task with no side effect. It works
  with an empty selection.
- **Post as comments** publishes the selected findings as individual inline PR comments plus the
  summary as a general comment. Findings that don't land on a line still in the diff fold into the
  summary, and a partial post reports "N of M comments posted" and can be retried.
- **Fix selected** re-arms the step as a **Fixer** that commits fixes for the selected findings onto
  the PR branch.

On any single finding you can **Dismiss** it (drop it from the set) or **Challenge** it: a second
read-only investigator re-examines that finding and returns a verdict (Upheld, Strengthened, or
Retracted, the last auto-deselected). Add an optional note about what seems wrong before it investigates.

Posting and fixing require the PR to live on the service's own repo (fork and cross-repo PRs aren't
supported yet) and are GitHub-only; on GitLab those two resolutions report as unsupported, while the
review itself still runs.

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
