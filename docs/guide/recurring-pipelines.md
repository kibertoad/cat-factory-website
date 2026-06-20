# Recurring Pipelines

Some work is never "done": dependencies drift and tech debt accumulates. A **recurring pipeline**
attaches a pipeline to a service and re-runs it on a cadence, so routine maintenance happens on
schedule without anyone kicking it off.

## How a schedule works

A schedule lives on a **service frame** and owns exactly **one reused on-board task block** inside
that service. Every time the schedule fires it starts the pipeline against that block, so the board
shows a single recurring task whose live status and run history you can inspect.

If a previous fire is still running, the next fire is skipped rather than stacked, so a slow run
never piles work on itself.

## The built-in templates

When you add a recurring pipeline you pick a template:

| Template | What it does |
| --- | --- |
| **Dependency updates** | A plain implement → review → merge pass for routine bumps. |
| **Tech debt** | Audits the repo, files a tracker ticket, then implements the top item. |
| **Custom** | Attach any pipeline you've defined on whatever cadence you choose. |

### The tech-debt pipeline

The tech-debt template adds two steps ahead of the usual implement → review → merge chain:

- **analysis** - a read-only container agent that explores the repository (build scripts,
  dependencies, tests, hot spots, TODO/FIXME markers, outdated patterns) and produces a single
  prioritized markdown report. It makes no edits or commits.
- **tracker** - a non-LLM step that files the top item from the analysis as a GitHub issue or
  Jira ticket before implementation begins, so the work is tracked even before a PR exists.

## Setting the cadence

The schedule runs on a fixed interval (the **Run every** setting, in hours), optionally constrained
to an **allowed window**:

- **Weekdays** - restrict fires to specific days (e.g. weekdays only). Empty means every day.
- **Hour-of-day window** - run only within a from/to range of hours (e.g. only overnight).
- **Timezone** - an IANA zone (e.g. `Europe/Helsinki`) the weekday/hour window is evaluated in.

If a computed next-run lands outside the window, the engine rolls it forward to the next eligible
instant.

## Managing schedules

From the service frame, **Add recurring pipeline** opens the cadence editor. The schedule's block
shows a **recurring badge**, and the inspector exposes:

- The cadence editor (interval, window, timezone).
- **Run now** to fire immediately, and **pause/resume** to toggle the schedule.
- **Run history** - each fire's outcome (a PR URL, "merged", "skipped", or a failure), retained
  for about a week.

## Choosing your tracker

The tech-debt **tracker** step files its ticket against the workspace's chosen issue tracker. Pick
one per workspace:

- **GitHub Issues** - rides the workspace's existing GitHub App installation.
- **Jira** - files into a configured project key, using the workspace's own connected Jira
  credentials.

See [Configuration](../deploy/configuration.md#issue-tracker--task-sources) for enabling the Jira
task-source integration on a deployment.

::: tip Shared services fire once per org
A schedule on a [shared service](./shared-services.md) is visible on every board that mounts the
service but is a single record, so it fires **once per org**, not once per mounting workspace.
:::

---

Next: review and merge what the agents produced in [Pull Requests](./pull-requests.md).
