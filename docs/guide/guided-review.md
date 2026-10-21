# Explore a Pull Request with Guided Review

**Guided review** helps you review a pull request you did not write. It explains what the change is
for and where your attention belongs, lets you ask questions about it in as many threads as you like,
and turns what you conclude into review comments placed on the right lines. You post them; the model
never does.

It works on any open pull request in a repository connected to your workspace, whoever opened it.
It is different from a [Review task](./pull-requests.md#deep-reviewing-an-existing-pull-request),
which runs an agent that audits the PR for defects on its own: guided review is you reviewing, with
a model that has read the change answering your questions.

## Opening a review

- **Guided review** in the sidebar, or the command palette (`Ctrl+K` / `Cmd+K`): pick a repository,
  then one of its open pull requests or a PR number.
- **Explore with guided review** in the inspector of a Review task opens the PR that task targets.

Opening the same pull request again returns your existing review, with its threads intact. Each person
gets their own review of a PR; anyone in the workspace can read it, and only you can change it.

## The overview

The review opens on an overview the model prepares by reading the pull request at the commit you are
reviewing:

| Section | What it tells you |
| --- | --- |
| Summary and intent | What the PR does, and the problem it solves as far as the PR shows it. |
| Meaningful changes | The changes that carry the PR's intent, with the files they touch. Mechanical churn (renames, formatting, lockfiles) is left out. |
| Consequences | What changes beyond the diff: callers, data, operators, users. |
| Risks | What could go wrong, rated low, medium or high, most important first. |
| Worth reviewing | Where to spend your attention, with the lines to start from. |
| Suggested questions | Questions a careful reviewer would ask about this PR. Click one to ask it. |

If the author pushes after you open the review, the overview says **The pull request has new
commits**. **Refresh** prepares it again at the new head and keeps your threads.

## Asking questions

Every question lives in a **thread**, shown as a tab. Use one thread per line of inquiry and open as
many as you need: a thread waiting for its answer never blocks the others, so you can keep reading and
asking elsewhere while one is being answered. A thread takes one question at a time; ask a follow-up
once the answer arrives.

Answers are written by a model that reads the pull request as you see it: the changed files, their
diffs, and any file in the repository at the reviewed commit or on the target branch. Each answer
lists the lines it rests on. Clicking a suggested question always opens a new thread for it.

**Deep dive** answers from a full checkout of the repository instead. It can search the whole tree,
follow call sites into code the PR does not touch, and run read-only commands, which is what
questions like "is this called anywhere else?" or "do the tests cover this path?" need. It takes
minutes rather than seconds and uses a runner the way a pipeline step does. A deployment with no
runner configured reports a deep question as unavailable.

## Turning conclusions into comments

When a thread has reached a conclusion, **Draft review comments** asks the model to turn it into
review comments, each placed on the line it is about. Add a note in the box first to narrow which
ones you want.

A comment can only sit on a line inside the diff, so a proposal anchored anywhere else is not kept.
The thread lists every one that was dropped and why, so nothing disappears silently.

Each draft can be edited, moved to another line, or discarded. Select the ones you want, optionally
write a summary comment, and **Post** them. They appear on the pull request as ordinary review
comments from you; posting never approves the PR or requests changes. Comments post one by one, so if
the host refuses one, the others still land and the refused one stays as a draft you can fix and post
again. Posting the same drafts twice never posts a comment twice.

If the author pushed since the review was prepared, posting is refused until you refresh: the drafts
were placed against the old code and could land on the wrong lines.

## What you need first

- **A connected repository.** Guided review reads pull requests through the same connection as the
  rest of the board. See [Repositories](./repositories.md).
- **A model provider.** The overview and answers use the workspace's default model preset; deep dives
  use the preset's entry for the `guided-review-investigator` agent, so you can route them to a
  stronger model. See [Model providers](./model-providers.md).

## Things worth knowing

- **It spends model budget.** Every overview, answer and draft set is a model call charged to the
  workspace and stopped by its budget like any other. See [Budgets](./budgets.md).
- **A personal subscription that needs your password cannot serve it.** Guided review works in the
  background, after your request has returned, so there is no moment to unlock such a credential. Use
  a preset backed by a workspace or account key.
- **A multi-line comment posts on its last line.**
- **Everything is available over the API** for building the same experience elsewhere:
  [Guided PR review in the public API](../extend/public-api.md#guided-pr-review).
