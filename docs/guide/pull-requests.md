# Review and Merge Pull Requests

For the person who has to decide whether an agent's work is good enough to ship. Cat Factory's
definition of "done" is deliberately strict: a task is complete only when its **pull request is
merged with passing CI**. This page covers what agents produce and how merging closes the loop.

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
run records real command output rather than the agent's assertion that it verified its work. It also
lands on the pull request itself, in the
[verification report](#the-verification-report-on-the-pull-request). A service with no checks
configured opens its pull request exactly as before.

Rather than typing the commands, hit **Detect**. It inspects the repository root and suggests check
commands from what the repo itself declares, one detector per ecosystem. Suggestions land as unsaved
rows in the panel for you to keep, edit, or drop; nothing is persisted until you save.

## Installing dependencies before the agent starts

A service frame also declares one **install command**, in the same inspector section. The harness runs
it against the checkout before the agent's first turn.

A fresh shallow clone gives an agent manifests, not dependencies: it can read that a library is
depended upon but not what the library exposes, so it guesses at APIs, re-derives type shapes that are
sitting on disk, or declines work it could have done. Installing first removes that whole class of
guessing.

The install and the pre-PR checks are threaded onto a job under different rules: the checks ride only
a dispatch that will open a pull request, while the install rides every dispatch that gets a
checkout, including a read-only exploration.

## The repository's pull-request template

A repository that ships `.github/PULL_REQUEST_TEMPLATE.md`, or GitLab's
`.gitlab/merge_request_templates/`, states the shape every pull request against it must take. Neither
host applies a template to a pull request created over its API, so a platform-opened PR would otherwise
be the only one on the repo missing that structure.

The harness discovers the template from the checkout it already has and folds it into the prompt of the
agent that just did the work, which writes its reviewer briefing **as** the filled template. Nothing to
configure. A directory holding several templates with no default is deliberately left alone.

## Conflicts, CI, and the merger

Every build pipeline finishes with three engine steps that prepare the PR for merge:

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

Risk policies live in a per-workspace library, and each task picks one. A task that picks none falls
back to a workspace default, and a workspace carries **two** of them: one for a run somebody started
in the app, and one for a run nothing is watching (see
[Runs nobody is watching](#runs-nobody-is-watching)). Three policies ship built in:

- **Balanced** (the in-app default): auto-merges a PR when its complexity, risk, and impact scores
  fall within the thresholds, and routes anything above them to human review.
- **Unattended delivery** (the default for unwatched runs): the same ceilings, budgets, class rules
  and per-role restrictions as your workspace's own in-app default, with one thing changed. A run
  under it answers the checkpoints its own automatic loops raise instead of parking for a person who
  isn't there. What it is allowed to land is identical, deliberately: a policy that ships as a
  default may decide that an unwatched run shouldn't wait forever on an automation budget, and may
  not decide that it gets to land a change your own thresholds would have held. Widen it yourself if
  your track record says to.
- **Manual review only**: never auto-merges. Every PR, whatever its scores, raises a merge-review
  notification for a person to merge. Reach for it on a board where a human always makes the final
  call.

Edit these or add your own in the workspace's **Risk policies** panel. Each row has its own **Make
default** and **Unattended default** promote buttons, since the two defaults are independent: flag one
policy both ways to run a single posture everywhere. Neither default can be deleted while it holds its
flag, and the panel says which flag is blocking.

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

### Narrowing the rules by role

A risk policy can narrow its class rules per
[workspace role](./team-and-access.md#board-access-and-workspace-roles), so what auto-merges depends on
who started the run. A policy's `classRulesByRole` maps a role to its own per-class rules.

Narrowing is subtractive: a role entry can never grant what the base rules withhold, so each entry is
reviewable on its own. A role that says nothing about a class, and a run with no role to pin at all,
both fall through to the base rules rather than being read as a ceiling. The initiator's role is
pinned when the run starts rather than looked up at merge time, since the merge settles on the durable
path with no request context.

When a role rule is what held a pull request back, the merger's result window says so, and says that a
teammate on a higher tier can merge it as it stands.

### Sandboxed runs

A **dry run** executes the whole pipeline and opens its pull request, and merges nothing. The merge is
blocked at both exits: the auto-merge, and the merge button on the review card the auto-merge would
otherwise raise (which answers `dry_run_not_mergeable`). To get a mergeable pull request, start the
task again as a live run.

Two ways a run becomes a dry run:

- A policy's `dryRunRoles` lists roles whose runs are always sandboxed, whatever the class rules would
  allow.
- The run asks for it at start (`mode: 'dry_run'`). The policy can force a sandbox regardless, so what
  the run actually got is reported back on the run.

Both settings default to empty, so an existing policy behaves exactly as it did.

### Runs nobody is watching

A run started in the app has someone to ask. A run started over the [public API](../extend/public-api.md),
dispatched from a [tracker issue](./issue-sources.md), or fired by a
[schedule](./recurring-pipelines.md) does not, so a checkpoint raised for a person stops it
indefinitely. Which of the two workspace defaults a task resolves follows exactly that split, and a
task that pins a policy of its own overrides both.

The posture is one switch on the policy: **Finish unattended runs without waiting for a person**. With
it on, the run takes the documented **Proceed anyway** answer to the checkpoints its own automatic
loops raise when they give up:

- a **companion** that spent its rework budget with the producer still under the bar,
- a **judge** that spent its bounce budget with the verdict still under the threshold,
- an **iterative review** that spent its whole pass budget without converging,
- **Coder follow-ups** nobody triaged, which are dismissed rather than queued (queueing sends the
  Coder back to widen the change past what the task asked for, unreviewed, on a run with no
  supervision). The items stay on the step with their text intact.

It never touches a checkpoint the **pipeline** asked for. An approval gate, a `human-test` step, visual
confirmation, the human and PR review gates, a brainstorm or interview, the implementation-fork choice
and the pre-dispatch input gate all stop the run whichever posture is in force, and a companion step
that is also gated still raises its approval gate at the cap. Nor does it answer a review that is
asking **questions**: those answers are a product judgement, so that park stands under either posture.

Each of these is recorded as settled by policy on the step it happened on, rather than left looking
like a bar the work met: whoever reviews the resulting pull request can tell a run that proceeded
under this posture from one whose companion simply stopped grading. The policy is read at the moment
the cap is reached, so moving a task onto an attended policy mid-run gets the checkpoint back.

Pinning a task to an unattended policy is a permission, not a preference. Somebody who does not manage
the workspace's policy library cannot re-point a task from an attended policy onto an unattended one,
in the picker or by moving the task; both refuse and name the reason. Landing authority is unaffected
either way, which is the point of keeping the two apart.

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
[Observability → Post-release health](../operate/observability.md#post-release-health-and-agent-on-call).

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
- **Pre-PR validation**: each [check command](#pre-pr-validation) the harness ran against the exact
  tree that opens the pull request, with its exit code, duration, and the log of whatever failed. This
  is kept apart from the CI section on purpose: CI is the host's opinion of the pushed branch, later
  and elsewhere, while this is the platform's own run on the exact tree and the one verdict it
  enforced. A passing command's log is dropped, and the section says so rather than leaving an
  ambiguous blank.
- **Reproduction proof**: for a bug fix, the declared reproducing test run against the pre-fix tree and
  against the finished one, so the pull request carries evidence that the defect ever manifested.
- **Test verification**: the Tester step's structured report.
- **Ephemeral environment**: a three-leg proof that the test environment did its job. It **came up**
  at a recorded time (from the provisioning event log), evidence was **captured** from it while it was
  live (from the Tester's own report and the screenshots it stored), and it was **torn down** again.
  The verdict over the three legs names every missing or contradictory leg, and a deep link points at
  the captured evidence. An unreadable provisioning log reports itself as un-evidenced rather than as
  an environment nobody reclaimed, and a tester that ran locally is kept apart from one that did not
  say where it ran.
- **Rubric reviews**: each judge step's verdict, when the pipeline places any.
- **Merge assessment**: the merger's scores and the engine's resolved merge decision.

A section whose producing step never ran says so explicitly rather than vanishing, because a missing
section reads like a clean one. Artifacts the run captured are linked rather than described. Below the
prose, a collapsed block holds the same report as JSON for external tooling to ingest without scraping.
Publishing is provider-neutral, so a GitLab deployment gets the report on its merge-request description
too.

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

The reference is checked at creation, against precisely the repository the reviewer will read, so a
typo'd number is refused there instead of surfacing later as a run that clones a repo and finds nothing
to review. A link belonging to a different repository is refused too, since the reviewer fetches by
number against the service's own repo. Only a positive "no such pull request" refuses: an outage, a
revoked token, or a rate limit answers "unknown" and the task is created. The task inspector links
through to the pull request it targets.

The **PR Reviewer** agent clones the repo, fetches the PR head, and for a large diff **slices it into
cohesive chunks** (a refactor with its call sites and tests) and reviews the chunks in parallel, up to
five at a time, so it scales to hundreds of files without turning one pull request into dozens of
concurrent conversations on one account. It is **comment-aware**: it reads the PR's existing review
threads and skips issues already raised. It returns **prioritized findings**, each with a severity
(blocker, high, medium, low, or nit), a category (correctness, security, performance, maintainability,
style, or test), the file and line, an explanation, and a suggested fix.

The board card shows live progress ("Reviewing X/Y slices", then "Findings ready"). The slice list is
the reviewer's own plan, with live status folded onto it, so it only ever grows and a slice's status
only advances; a queued slice never disappears and reappears.

Each slice's findings are **persisted as it finishes**, not held until the whole review folds up. If a
watchdog, an evicted container, or a wedged aggregation kills the review partway, the completed slices
survive and the review can be **resumed** from where it stopped rather than re-run from zero.

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

Next: connect and bootstrap the repositories agents work in, [Connect a Repository](./repositories.md).
