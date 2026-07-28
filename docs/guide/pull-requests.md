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

## Pre-PR validation

A service can declare shell commands that must pass **before** its pull request opens, so a broken
lint or test run never becomes public PR churn. Open a service frame's inspector and use the
**Pre-PR validation** section:

| Field | What it is |
| --- | --- |
| **Name** | A label for the check (`lint`, `test`, `build`). Falls back to the command when blank. |
| **Command** | The shell command, run with `sh -c` in this service's checkout, in the order listed. |
| **Attempts** | How many rounds of fixing the agent gets before the step fails. Defaults to 3. |

After the coding agent settles, the harness runs each command against the checkout. While a command
fails and attempts remain, the captured output goes back to the agent as its next instruction, and it
tries again. Only a green checkout opens a pull request; an exhausted budget **fails the step** with
the last captured output and opens nothing. The agent is explicitly told to fix the code rather than
weaken the checks.

Checks resolve up the frame chain, so a task inherits its service frame's set. The output (bounded and
scrubbed of secrets) streams onto the step while the loop runs and stays on the finished step, so the
run records real command output rather than the agent's assertion that it verified its work. A service
with no checks configured opens its pull request exactly as before.

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

### Rules per change class

Score ceilings are the merger's judgement about a diff. A **change class** is a fact about it. Every
pull request is classified deterministically from the paths it touched, with no model involved:

| Class | What it covers |
| --- | --- |
| **Docs & copy** | Documentation and user-facing text. |
| **Tests** | Test files only. |
| **Dependency bump** | Third-party package version changes. |
| **Config & CI** | Configuration and CI definitions. |
| **Source code** | Program source. |
| **Schema & migrations** | Database schema and migration files. |
| **Unclassified** | The diff could not be read. Never matches a rule. |

Classes are risk-ranked in that order, and a mixed diff takes the highest-ranked class present, so a
rule can only fire on a diff containing nothing riskier than its class. In a risk policy's **Rules per
change class** section, give each class one of three rules:

- **Use score ceilings** (the default): fall back to the complexity/risk/impact thresholds above.
- **Always auto-merge**: merge without consulting the scores.
- **Always require review**: raise a merge-review notification whatever the scores say.

A class rule can never override a policy whose auto-merge is off; that master switch wins first, and
the panel says so.

### Recording how much review a merge actually needed

Every merge decision writes one row to the workspace's merge track record: the change class, the
merger's scores, the outcome, and, when you supply it, how much review effort the pull request really
took. Tag it as **No comments**, **Minor notes**, or **Real rework** when you act on a merge-review
card, from the task inspector's merge control, or from the dismissible nudge that appears when you
merge a pull request directly on GitHub or GitLab.

The rollup shows up next to each class in the **Rules per change class** panel: how many pull requests
in that class merged, what share merged automatically, and what share needed no comments. That is the
evidence for widening a class to **Always auto-merge** or tightening it, instead of guessing at score
ceilings. Tagging is always optional; an untagged merge is recorded as untagged, never as "no
comments".

A pipeline can add a **Post-release-health** gate after the Merger that watches Datadog monitors and
SLOs for a window after the merge and escalates to an on-call agent on a regression. It's optional
and needs a connected Datadog deployment; see
[Observability → Post-release health](../deploy/observability.md#post-release-health-and-agent-on-call).

## The verification report on the pull request

The engine maintains a **Verification report** section in the pull request's own description, made of
facts the platform captured rather than claims the agent wrote. It sits between HTML markers
(`<!-- cat-factory:verification-report:start -->` … `:end`), so the agent's own prose above it is
preserved and a retry or re-run rewrites the region in place instead of appending a second copy.

The report carries:

- **Run**: the task, the linked tracker issues, the repo and provider, the pipeline, and each step's
  agent kind with the model that actually ran it, plus a deep link into the run's observability panel.
- **Continuous integration**: the CI gate's aggregated verdict, per-check-run names and conclusions,
  and how many times the CI fixer tried.
- **Test verification**: the Tester step's structured report.
- **Ephemeral environment**: the Deployer's per-frame provisioning outcomes and teardown state.
- **Rubric reviews**: each judge step's verdict, when the pipeline places any.
- **Merge assessment**: the merger's scores and the engine's resolved merge decision.

A section whose producing step never ran says so explicitly rather than vanishing, because a missing
section reads like a clean one. Below the prose, a collapsed block holds the same report as JSON for
external tooling to ingest without scraping. Publishing is provider-neutral, so a GitLab deployment
gets the report on its merge-request description too.

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
