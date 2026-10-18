# Review and Merge Pull Requests

For the person who decides whether an agent's work is good enough to ship. In Cat Factory, a task is
done only when its **pull request is merged with passing CI**. This page covers what agents produce,
what checks run before and after the pull request opens, how the platform decides to merge, and how
you review.

The path from task to done:

```
PR opened → CI passes → Tester/Acceptance validate → you review → merge → block Done
```

## What the coding agent produces

During the **Coder** step, an agent:

1. Clones your repository into an **ephemeral container**.
2. Implements the task from its (reviewed) [requirements](./requirements.md).
3. **Commits its own work** to a dedicated per-task branch, and validates locally.

The agent never gets push credentials. It only commits. The **harness** that runs the agent owns
delivery: it uses the run's scoped installation token to push the branch and open the **pull
request**. After that, your existing CI/CD takes over.

The branch is deterministic and checkpointed. So if a run is retried or resumed, it continues on the
same branch and pull request. It does not start again.

The **Tester** step then validates the change before the closing automation runs.

## Pre-PR validation

Use pre-PR validation to make sure that a broken lint or test run never becomes a public pull
request. You declare shell commands for a service, and they must pass **before** its pull request
opens.

To set up the checks:

1. Open a service frame's inspector, and go to the **Pre-PR validation** section.
2. Click **Detect** to get suggestions, or add rows by hand. **Detect** inspects the repository root
   and suggests check commands from what the repository declares, with one detector for each
   ecosystem. Suggestions appear as unsaved rows.
3. Keep, edit, or remove each row.
4. Save. Nothing is stored until you save.

Each row has three fields:

| Field | What it is |
| --- | --- |
| **Name** | A label for the check (`lint`, `test`, `build`). If you leave it blank, the command is used. |
| **Command** | The shell command. It runs with `sh -c` in this service's checkout, in the order listed. |
| **Attempts** | How many rounds of fixes the agent gets before the step fails. Defaults to 3. |

A task inherits the checks of its service frame, because checks resolve up the frame chain. If a
service has no checks, its pull request opens as usual, with no checks run.

### What happens when a check fails

After the coding agent finishes, the harness runs each command against the checkout:

1. If a command fails and attempts remain, the harness sends the captured output to the agent as its
   next instruction. The agent is told to fix the code, not to weaken the checks.
2. The agent tries again, and the harness runs the commands again.
3. If every command passes, the pull request opens. Only a passing checkout opens a pull request.
4. If the attempts run out, the step **fails** with the last captured output, and no pull request
   opens.

The command output is limited in size and cleaned of secrets. It streams onto the step while the loop
runs, and it stays on the finished step. So the run records the real command output, not the agent's
claim that it checked its work. The output also goes onto the pull request, in the
[verification report](#the-verification-report-on-the-pull-request).

## Installing dependencies before the agent starts

Set an **install command** on the service frame, in the same inspector section, so that the agent
starts with dependencies on disk. Each frame has one install command. The harness runs it against the
checkout before the agent's first turn.

Without it, a fresh shallow clone gives the agent manifests but no dependencies. The agent can read
that the code depends on a library, but not what that library exposes. So it guesses at APIs,
re-derives type shapes that are already on disk, or declines work it could have done.

The install command and the pre-PR checks are added to a job under different rules:

| | Runs on |
| --- | --- |
| Install command | Every dispatch that gets a checkout, including a read-only exploration. |
| Pre-PR checks | Only a dispatch that will open a pull request. |

## The repository's pull-request template

You do not need to configure anything. If a repository has a pull-request template, the platform's
pull request follows it.

The harness looks for `.github/PULL_REQUEST_TEMPLATE.md`, or GitLab's
`.gitlab/merge_request_templates/`, in the checkout. It adds the template to the prompt of the agent
that did the work, and that agent writes its reviewer briefing **as** the filled-in template. This is
necessary because neither host applies a template to a pull request created over its API.

If a directory holds several templates and none is the default, the harness ignores them on purpose.

## Conflicts, CI, and the merger

Every build pipeline ends with three engine steps that prepare the pull request for merge. They run in
this order:

1. **Conflicts Gate.** Keeps the pull request mergeable with its base. It loops a **Conflict
   Resolver** agent that merges the base in and resolves conflicts on the same branch.
2. **CI Gate.** Waits for the up-to-date pull request to pass CI. On failure, it loops a **CI Fixer**
   agent.
3. **Merger.** Scores the pull request on complexity, risk, and impact. If the scores are within the
   task's [risk policy](./designing-your-board.md#navigating-navbar-and-command-bar), it merges
   automatically. If not, it raises a review notification for a person.

The merger auto-merges only a pull request it could actually examine. If it cannot read a real diff,
or its assessment has no credible explanation, it sends the pull request to human review. It does
not merge on an empty score.

### Choosing a risk policy

A risk policy decides when the merger may merge without a person, and how many times the run's
automatic loops retry before they stop and ask you. Each workspace has a library of policies, and each
task uses one of them.

Which policy a task uses:

1. The policy that the task pins, if it pins one.
2. Otherwise, one of the workspace's **two** defaults:
   - the in-app default, for a run that somebody started in the app,
   - the unattended default, for a run that nothing is watching. See
     [Runs nobody is watching](#runs-nobody-is-watching).

When you pick a policy in the add-task modal or the task inspector, each option in the list shows its
auto-merge limits (complexity, risk, impact) and its CI-fix budget. The default option shows the
thresholds of the workspace default it resolves to. So you can compare policies without opening the
settings panel.

Three policies ship built in:

| Policy | Default for | Auto-merges |
| --- | --- | --- |
| **Balanced** | Runs started in the app | When complexity, risk, and impact are all within the thresholds. Anything above goes to human review. |
| **Unattended delivery** | Runs nothing is watching | Exactly what your workspace's in-app default would merge. |
| **Manual review only** | None | Never. Every pull request raises a merge-review notification, whatever its scores, and a person merges it. Use it on a board where a person always makes the final call. |

**Unattended delivery** has the same limits, budgets, class rules and per-role restrictions as your
workspace's in-app default. Only one thing is different: a run under it answers the checkpoints that
its own automatic loops raise, instead of waiting for a person who is not there. As shipped, it may not
land a change that your own thresholds would hold back. If your track record supports it, widen the policy
yourself.

A policy also holds the budgets that the run's automatic loops spend before they stop and ask you. So
how much the platform retries on its own is a choice for each task, not a platform constant:

- the CI-fix attempts,
- the requirement-review iterations,
- the **Companion rework rounds**: how many times a reviewer may send its producer back. The default
  is three. A [companion](../reference/glossary.md#c) is a reviewer paired with a producing agent.

To edit policies or add your own, open the workspace's **Risk policies** panel. Each row has two
buttons: **Make default** and **Unattended default**. The two defaults are independent. To use one
policy for all runs, set both on the same policy. You cannot delete a policy while it is a default.
The panel tells you which default blocks the delete.

### Rules per change class

Use change-class rules to decide how a pull request merges from what it touches, instead of from the
merger's scores. Score limits are the merger's judgement about a diff. A **change class** is a fact
about it: the platform classifies every pull request from the paths it touched, with no model
involved.

| Class | What it covers |
| --- | --- |
| **Docs & copy** | Documentation and user-facing text. |
| **Tests** | Test files only. |
| **Dependency bump** | Third-party package version changes. |
| **Config & CI** | Configuration and CI definitions. |
| **Source code** | Program source. |
| **Schema & migrations** | Database schema and migration files. |
| **Unclassified** | The diff could not be read. Never matches a rule. |

The table goes from lowest to highest risk. A diff that touches several classes takes the riskiest
class in it. So a rule applies only to a diff that contains nothing riskier than the rule's class.

In a risk policy's **Rules per change class** section, give each class one rule:

| Rule | What it does |
| --- | --- |
| **Use score ceilings** (the default) | Uses the complexity, risk, and impact thresholds above. |
| **Always auto-merge** | Merges without looking at the scores. |
| **Always require review** | Raises a merge-review notification, whatever the scores say. |

If the policy's auto-merge is off, no class rule can override it. That switch applies first, and the
panel says so.

### Narrowing the rules by role

A risk policy can narrow its class rules for each
[workspace role](./team-and-access.md#board-access-and-workspace-roles). Then what auto-merges depends
on who started the run. A policy's `classRulesByRole` maps a role to its own rules for each class.

- **A role entry can only remove permission.** It can never grant what the base rules withhold, so
  you can review each entry on its own.
- **Gaps fall back to the base rules.** If a role entry says nothing about a class, or the run has no
  role, the base rules apply. A missing entry is not read as a limit.
- **The role is fixed at run start.** The platform records the initiator's role when the run starts,
  not at merge time, because the merge happens on the durable path with no request context.

When a role rule held a pull request back, the merger's result window says so. It also says that a
teammate with a higher role can merge it as it is.

### Sandboxed runs

A **dry run** runs the whole pipeline and opens its pull request, but merges nothing. The merge is
blocked at both exits:

- the auto-merge,
- the merge button on the review card that the auto-merge would otherwise raise. That button answers
  `dry_run_not_mergeable`.

To get a mergeable pull request, start the task again as a live run.

A run becomes a dry run in two ways:

- The policy's `dryRunRoles` lists the role of whoever started it. Runs from those roles are always
  sandboxed, whatever the class rules allow.
- The run asks for it at start (`mode: 'dry_run'`). The policy can force a sandbox anyway, so the run
  reports which mode it actually got.

Both settings are empty by default, so an existing policy behaves as before.

### Runs nobody is watching

Some runs have nobody to answer a checkpoint. If such a run reaches a checkpoint that waits for a
person, it stops with no time limit. Which workspace default a task uses depends on where its run
started:

| The run started from | Somebody is watching | Default policy |
| --- | --- | --- |
| The app | Yes | The in-app default |
| The [public API](../extend/public-api.md) | No | The unattended default |
| A [tracker issue](./issue-sources.md) | No | The unattended default |
| A [schedule](./recurring-pipelines.md) | No | The unattended default |

A task that pins its own policy overrides both defaults.

#### What the switch changes

Each policy has one switch: **Finish unattended runs without waiting for a person**. When it is on,
the run takes the documented **Proceed anyway** answer when one of its own automatic loops gives up.
It does not touch a checkpoint that the pipeline asked for.

| Checkpoint | Switch on | Switch off |
| --- | --- | --- |
| A companion spent its rework budget, and the producer is still below the bar | Proceeds | Waits for a person |
| A [judge](../reference/glossary.md#j) spent its bounce budget, and the verdict is still below the threshold | Proceeds | Waits for a person |
| An iterative review spent its whole pass budget without converging | Proceeds | Waits for a person |
| **Coder follow-ups** that nobody triaged | Dismisses them. The items stay on the step with their text. | Waits for a person |
| A checkpoint the pipeline asked for (see the list below) | Waits for a person | Waits for a person |
| A review that asks **questions** | Waits for a person | Waits for a person |
| A companion stopped on an open **Must fix** finding | Waits for a person | Waits for a person |

The switch dismisses untriaged follow-ups instead of queueing them. Queueing them would send the Coder
back to widen the change past what the task asked for, without review, on a run that nobody
supervises.

Checkpoints that the pipeline asks for always stop the run:

- an approval gate,
- a `human-test` step,
- visual confirmation,
- the human and PR review gates,
- a brainstorm or an interview,
- the implementation-fork choice,
- the pre-dispatch input gate,
- the approval gate of a companion step that is also gated, when it reaches its limit.

Two loop checkpoints also always wait:

- **A review that asks questions.** The answers are a product decision.
- **A companion stopped on an open Must fix finding.** To proceed would overrule a reviewer who said
  the work must not go further. That is different from deciding that a loop should stop trying.

#### How you can tell a run proceeded on its own

Each checkpoint that the switch answers is recorded as settled by policy on the step where it
happened. It does not look like a bar that the work met. So whoever reviews the pull request can tell
a run that proceeded under this switch from one whose companion stopped grading.

The platform reads the policy at the moment the limit is reached. If you move a task onto an attended
policy during the run, the checkpoint waits for a person again.

#### Who may move a task onto an unattended policy

Moving a task onto an unattended policy is a permission, not a preference. If you do not manage the
workspace's policy library, you cannot move a task from an attended policy to an unattended one,
either in the picker or by moving the task. Both refuse and name the reason.
This permission has no effect on what a run may merge: the switch controls waiting, and the merge rules stay separate.

### Recording how much review a merge actually needed

Tag each merge with how much review it took. Over time, the tags give you evidence for widening or
tightening the rule for a change class.

Every merge decision writes one row to the workspace's merge track record: the change class, the
merger's scores, the outcome, and, if you give it, how much review effort the pull request needed.
Pick **No comments**, **Minor notes**, or **Real rework** in one of these places:

- a merge-review card, when you act on it,
- the task inspector's merge control,
- the nudge that appears when you merge a pull request directly on GitHub or GitLab. You can dismiss
  it.

The **Rules per change class** panel shows the totals next to each class:

- how many pull requests in that class merged,
- what share merged automatically,
- what share needed no comments.

Use those numbers to decide whether to widen a class to **Always auto-merge** or to tighten it,
instead of guessing at score limits. Tagging is always optional. An untagged merge is recorded as
untagged, never as "no comments".

### Watching production after the merge

A pipeline can add a **Post-release-health** gate after the Merger. For a period after the merge, it
watches Datadog monitors and SLOs. If something gets worse, it escalates to an on-call agent. The gate
is optional and needs a connected Datadog deployment. See
[Observability → Post-release health](../operate/observability.md#post-release-health-and-agent-on-call).

## The verification report on the pull request

Read the **Verification report** section in the pull request description to see what the run actually
did. The engine keeps this section up to date. It contains facts that the platform captured, not
claims that the agent wrote.

| Section | What it contains |
| --- | --- |
| **Run** | The task, the linked tracker issues, the repository and provider, the pipeline, and each step's agent kind with the model that actually ran it. Also a link to the run's observability panel. |
| **Coder follow-ups** | What the Coder flagged during the run, and what was decided about each item. See [Coder follow-ups](./running-pipelines.md#coder-follow-ups). |
| **Continuous integration** | The CI gate's combined verdict, the name and result of each check run, and how many times the CI fixer tried. |
| **Pre-PR validation** | Each [check command](#pre-pr-validation) that the harness ran against the exact tree that opens the pull request: its exit code, its duration, and the log of whatever failed. |
| **Reproduction proof** | For a bug fix: the declared reproducing test, run against the tree before the fix and against the finished tree. This is evidence that the defect really happened. |
| **Test verification** | The Tester step's structured report. |
| **Ephemeral environment** | Proof that the test environment came up, that evidence was captured from it, and that it was torn down. |
| **Rubric reviews** | Each judge step's verdict, if the pipeline has any. |
| **Merge assessment** | The merger's scores and the engine's final merge decision. |

Some sections need more explanation:

- **Coder follow-ups.** Three outcomes are listed above the follow-ups table in that section, so you do
  not have to find them in a status column. They are the items you most need to act on:
  - a question that was **ruled on** instead of answered,
  - a decision that **never reached the Coder**, because the send-back budget was already spent,
  - an item **dismissed by the run's autonomy policy**, because nobody was watching.
- **Pre-PR validation and CI are separate on purpose.** CI is the host's opinion of the pushed
  branch, given later and somewhere else. Pre-PR validation is the platform's own run on the exact
  tree, and it is the one verdict the platform enforced. A passing command's log is left out, and the
  section says so, so the blank is not ambiguous.
- **Ephemeral environment** has three parts, and the verdict names every part that is missing or
  contradicts another:
  1. It **came up** at a recorded time, from the provisioning event log.
  2. Evidence was **captured** while it was live, from the Tester's own report and the screenshots it
     stored. A link points at the captured evidence.
  3. It was **torn down** again.

  If the provisioning log cannot be read, the section says the environment has no evidence, not that
  nobody reclaimed it. A tester that ran locally is reported apart from one that did not say where it
  ran.

How the report behaves:

- **A section whose step never ran says so.** It does not disappear, because a missing section looks
  like a clean one.
- Artifacts that the run captured are linked, not described.
- Under the text, a collapsed block holds the same report as JSON, so external tools can read it
  without scraping.
- The report sits between HTML markers (`<!-- cat-factory:verification-report:start -->` … `:end`).
  The agent's own text above it is kept. A retry or re-run rewrites the section in place, and does not
  add a second copy.
- Publishing works with every provider, so a GitLab deployment gets the report on its merge-request
  description too.

## Reviewing the PR

Review the pull request as you would any contribution from a person:

- Read the diff and the agent's description of what it changed.
- Make sure CI passes.
- Request changes or leave comments if something is wrong.

When an agent has pushed a branch, the task inspector shows a **branch quick-link**. It opens the
task's work branch on GitHub, so you can go straight from a board task to its code.

The work is a real pull request in your repository, so all your existing branch protections, required
checks, and review rules apply.

To make human code review a required step, not a check after the fact, add the **Human Review**
gate. The run waits until the pull request has GitHub's required approvals and no unresolved threads.
In between, it loops the Fixer to address review comments. See
[Human review on the pull request](./running-pipelines.md#human-review-on-the-pull-request).

## Deep-reviewing an existing pull request

A **Review** task points Cat Factory's own reviewer agent at a pull request that already exists,
opened by a person or an agent. It is a read-only audit: it writes no code and merges nothing.

This is different from the [Human Review gate](./running-pipelines.md#human-review-on-the-pull-request),
which pauses a *build* pipeline until a person approves on GitHub.

### Creating a review task

1. In the add-task modal, pick type **Review**.
2. In **Pull request**, enter the target as a full URL (`https://github.com/owner/repo/pull/123`), or
   as `#123` for a pull request on the service's own repository.
3. Optional: add a **Review focus** to steer the reviewer, for example "focus on the auth changes and
   error handling".
4. Optional: queue **Review skills**. See
   [Queueing specialist review skills](#queueing-specialist-review-skills).

A Review task takes no title or description: the title comes from the pull request. It takes no risk
policy, because it merges nothing. It runs the single-step **Review a pull request** pipeline. Any
[prompt fragments](./prompt-fragments.md) that you pin become review criteria. The task inspector
links to the target pull request.

The platform checks the reference when you create the task, against the same repository that the
reviewer will read:

| What the check finds | Result |
| --- | --- |
| No such pull request | The task is refused. A mistyped number fails here, not later as a run that finds nothing to review. |
| A link to a different repository | The task is refused, because the reviewer fetches by number from the service's own repository. |
| An outage, a revoked token, or a rate limit | The answer is "unknown", and the task is created. |

An "unknown" answer never refuses the task.

### Queueing specialist review skills

Besides the focus text, a review task can carry a **queue of review skills**. These are the
specialist playbooks that your team wrote, for example a performance pass, a security audit, or an
accessibility check. This lets one review pipeline serve both a routine change and one that needs a
security pass. You choose the checks for each review when you file the task. You do not clone the
pipeline for each check.

1. Under **Review skills** in the add-task form, pick the skills in the order you want them applied.
2. The reviewer applies each one on top of its standing role, to the parts of the diff that the skill
   is about.

Limits:

- Only skills whose `SKILL.md` declares `group: review` are offered. See
  [Run a Claude Skill](./skills.md#grouping-skills) for how to write and group them.
- A review carries at most eight skills, because every queued playbook stays in the reviewer's
  context for the whole review.
- If a queued skill was removed from the catalog, the run fails and names the skill. It does not
  review without the check you asked for.

The task inspector's **Under review** panel shows the queue in order and lets you change it. Use it
also to clear a run that failed on a skill that is no longer in the catalog.

### How the reviewer works

The **PR Reviewer** agent clones the repository and fetches the pull request head. Then:

- **For a large diff, it splits the work into slices.** Each slice is a coherent chunk, for example a
  refactor with its call sites and tests. It reviews up to five slices at a time. This lets it handle
  hundreds of files without turning one pull request into dozens of concurrent conversations on one
  account.
- **It reads existing comments.** It reads the pull request's existing review threads and skips
  issues that someone already raised.
- **It returns prioritized findings.** Each finding has:
  - a severity: blocker, high, medium, low, or nit,
  - a category: correctness, security, performance, maintainability, style, or test,
  - the file and line,
  - an explanation,
  - a suggested fix.

The board card shows live progress: "Reviewing X/Y slices", then "Findings ready". The slice list is
the reviewer's own plan, with live status added to it. The list only grows, and a slice's status only
moves forward. A queued slice never disappears and comes back.

The platform **saves each slice's findings when the slice finishes**, not at the end of the review.
If a watchdog, an evicted container, or a stuck aggregation stops the review partway, the finished
slices are kept. You can **resume** the review from where it stopped. You do not have to run it again
from the start.

### Acting on the findings

When the review finishes, the run waits for you with its findings.

1. Open the **PR review** window.
2. Select the findings that matter. All are selected by default.
3. Optional: on any single finding, click **Dismiss** to remove it, or **Challenge** to have it
   checked again. A challenge sends the finding to a second, read-only investigator. Before it investigates,
   you can add a note about what seems wrong. The investigator returns **Upheld**, **Strengthened**, or
   **Retracted**. A retracted finding is deselected automatically.
4. Pick one resolution:

| Resolution | What it does |
| --- | --- |
| **Finish review** | Records your selection and closes the task, with no other effect. Works with an empty selection. |
| **Post as comments** | Publishes each selected finding as an inline comment on the pull request, and the summary as a general comment. Findings that are not on a line still in the diff go into the summary. If only some comments post, it reports "N of M comments posted", and you can retry. |
| **Fix selected** | Turns the step into a **Fixer** that commits fixes for the selected findings onto the pull request branch. |

**Post as comments** and **Fix selected** work only on GitHub, and only when the pull request is on
the service's own repository. Fork and cross-repository pull requests are not supported yet. On
GitLab, these two resolutions report as unsupported, but the review itself still runs.

## Merging closes the loop

When you **merge** the pull request:

- The block changes to **Done**.
- A completion event streams back to the board and updates it in real time.

## Iterating

If the change needs more work, you can:

- Push commits or request changes on the pull request directly.
- Refine the block's [requirements](./requirements.md) and start a new run.
- Use the run's **retry** to run again from a failed step. Or
  [**restart from a step you pick**](./running-pipelines.md#retry-restart-stop-and-reset), even on a
  finished run. For example, redo the Coder and everything after it, without touching the earlier
  work.

You can see each iteration on the board and in the run's event log.

---

Next: connect and bootstrap the repositories agents work in, [Connect a Repository](./repositories.md).
