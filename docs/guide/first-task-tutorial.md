# Tutorial: Your First Task to a Merged Pull Request

A single guided run, start to finish, on one concrete example: adding a health endpoint to a
service. Follow it literally. You will spend real model tokens and open a real pull request against
a real repository, so use a repository you do not mind receiving a small change.

This is the lesson version. [Quick Start](./quick-start.md) is the same loop as a map, and each
stage has its own how-to page linked at the end.

**What you need before you start**

- A Cat Factory instance you can sign in to. If you have none, the shortest path is
  [local mode](../deploy/local.md) on your own machine.
- A repository the deployment can reach, with a protected default branch. Protection matters here:
  it is what makes "merge" a decision you take rather than something a run could do for you.
- One usable model source. A deployment with no provider key at all still works: it falls back to
  Cloudflare Workers AI. See [Connect a Model Provider](./model-providers.md).

**What you will end up with**: one merged pull request, and a board card that says Done because
that pull request merged, not because an agent said it was finished.

Allow about thirty minutes, most of it waiting on the run.

## 1. Make a service and link the repository

A task cannot run on its own. It resolves the repository it works in by walking up to the **service
frame** that contains it, and there is deliberately no "just use the first repository" fallback, so
this step is not optional.

1. On the board, add a **service frame** and name it after the system you are changing.
2. Open it and link your repository. For a monorepo, set the directory too.

You now have an empty frame linked to real code. Cards you drop inside it inherit that link.

::: tip If the repository picker is empty
The deployment has no source-control connection yet, or the connection cannot see that repository.
See [Connect a Repository](./repositories.md).
:::

## 2. Write one task worth running

Add a **task** card inside the frame. Use this description literally the first time:

> Add a `GET /health` endpoint that returns HTTP 200 with a JSON body containing the service name
> and the build version. Cover it with a test. Do not change any existing route.

Two things make this a good first task, and both are worth copying when you write your own:

- **It names its own acceptance.** Status code, body, and a test. An agent cannot guess what "add a
  health check" means to you, and the reviewer step below is what catches that when you leave it
  out.
- **It states a boundary.** "Do not change any existing route" is the kind of constraint that keeps
  a first run small enough to review by eye.

## 3. Let the reviewer ask its questions

Start the run and pick a pipeline that begins with requirements review (the shipped defaults do).

The first step is not the coder. An inline reviewer reads the task and parks the run on the gaps it
found: an unstated response shape, a missing acceptance criterion, an assumption it is not willing
to make silently. Answer in the run's own decision panel, then let it continue.

**A parked run waits indefinitely on purpose.** Nothing times out here, so a run that has stopped
advancing has almost always parked on you rather than failed. Watching that happen once is the
single most useful thing this tutorial teaches.

## 4. Watch the run

The board streams every step live. What you are looking at:

- **Steps advance in order**, each with its agent kind and the model it resolved to.
- **The coder step runs in a container** against a fresh checkout. It edits files. It does not push,
  and it holds no credentials to your systems: the harness around it does the git work. See
  [Agent Isolation](../reference/agent-isolation.md).
- **Gates are cheap until they are not.** The CI gate reads your host's real check runs and passes
  without spinning anything up when they are green.
- **Spend accumulates per step**, metered against the workspace budget unless the model runs on a
  subscription or your own local runner.

If a step fails, the run says which and why. [Troubleshooting](../operate/troubleshooting.md) maps
the common ones.

## 5. Review the pull request

The harness commits to a work branch, pushes it, and opens a pull request. Read it as you would a
colleague's:

- The description is the agent's own reviewer briefing, and if your repository ships a pull-request
  template, the briefing is that template filled in.
- The body also carries a **verification report**: the facts the run captured (which tests ran, what
  the gates saw) rather than an agent's summary of how it went.

Check the diff against the two constraints you wrote in step 2. This is the moment the task
description pays off or does not.

## 6. Merge, and watch the card flip

Merge the pull request. The board updates over its live connection and the card moves to **Done**.

That is the property worth internalising: a task is done when its pull request merged with passing
checks. No agent decides it. A pipeline with no merger step raises a completion notification and
stops rather than marking anything done, and a merger step scores its assessment against the merge
preset you configured, routing anything outside it to a person.

## What to do next

- **Run the same task type again** and change one thing: a different model preset, or a pipeline
  with a tester step. Comparing two runs of one task teaches more than one run of two tasks.
- **Set a budget** before you turn agents loose at scale. See [Control Spend with Budgets](./budgets.md).
- **Decide your merge policy** deliberately, because the shipped default auto-merges under balanced
  ceilings with no class floors. See [Review and Merge Pull Requests](./pull-requests.md) and the
  [hardening checklist](../reference/security-model.md#operator-hardening-checklist).

---

Next: [Design Your Board](./designing-your-board.md) to lay out more than one task, or the
[Cookbook](./cookbook.md) for a short recipe per operation.
