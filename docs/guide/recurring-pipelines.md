# Schedule Recurring Work

For the work that is never "done": dependencies drift and tech debt accumulates. A **recurring
pipeline** attaches a pipeline to a service and re-runs it on a cadence, so routine maintenance
happens on schedule without anyone kicking it off.

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
| **Tech debt** | Audits the repo, files a tracker ticket, then implements the top item. |
| **Bug triage** | Pulls one open issue from your tracker each run, reproduces it, fixes it, and merges. See [below](#the-bug-triage-pipeline). |
| **Custom** | Attach any pipeline you've defined on whatever cadence you choose. |

### The tech-debt pipeline

The tech-debt template adds two steps ahead of the usual implement → review → merge chain:

- **analysis** - a read-only container agent that explores the repository (build scripts,
  dependencies, tests, hot spots, TODO/FIXME markers, outdated patterns) and produces a single
  prioritized markdown report. It makes no edits or commits.
- **tracker** - a non-LLM step that files the top item from the analysis as a GitHub issue or
  Jira ticket before implementation begins, so the work is tracked even before a PR exists.

### The bug-triage pipeline

The **Bug triage** template works your bug backlog on its own. Each fire pulls **one** matching open
issue from your tracker, claims it, and drives it end to end: understand the bug, write a failing
reproduction test, fix it, then review → test → merge. On merge, the tracker writeback closes the
issue. Bug triage is recurring-only, so it doesn't appear in the one-off Add-task picker.

The run's stages:

- **intake** - a non-LLM step that scans your tracker (oldest open first) for an issue matching the
  predicates you set, imports it, retitles the recurring block from the issue, and marks it in
  progress with a "taken by cat-factory" comment. If nothing matches, the run ends quietly.
- **investigation** - a read-only container agent that clones the repo (and any
  [involved services](./designing-your-board.md#service-connections)) and reports the root-cause
  hypotheses and whether the issue is clear enough to fix.
- **clarity review** - a human gate that only stops when the investigator needs clarification; a clear
  bug passes straight through. When it parks, it echoes its questions onto the tracker issue.
- **reproduction test** - a coding agent that commits a failing test proving the bug (it does not fix
  it). It may concede that a bug isn't reproducible without failing the run.
- **fix, review, test, and merge** - the coder adds the fix in the same PR as the repro test, then the
  standard review → ephemeral-env test → conflicts → CI → merge tail.

When you pick the Bug triage template, an **Issue intake** section appears. Connect a task source
first, then set:

- **Source**: GitHub Issues, Jira, or Linear (only connected sources are offered).
- The board to pull from: a **Repository** (`owner/name`), a **Jira project key**, or a **Linear team
  id**, depending on the source.
- Predicates that narrow which issue is taken: **Title contains**, **Labels**, **Issue type**
  (default `bug`), and, for GitHub, an **In-progress label** (default `in-progress`).

Intake config is per schedule, so two bug-triage schedules can pull from different boards. It reuses
the workspace's existing tracker connection; there is nothing extra to store.

## Setting the cadence

The schedule runs on a fixed interval (the **Run every** setting, in hours), optionally constrained
to an **allowed window**:

- **Weekdays** - restrict fires to specific days (e.g. weekdays only). Empty means every day.
- **Hour-of-day window** - run only within a from/to range of hours (e.g. only overnight).
- **Timezone** - an IANA zone (e.g. `Europe/Helsinki`) the weekday/hour window is evaluated in.

If a computed next-run lands outside the window, the engine rolls it forward to the next eligible
instant.

### On-demand schedules

Turn on **On-demand (manual only)** and the schedule has no cadence at all: it never fires on its own
and runs only when you click **Run now**. The cadence editor disappears, and the schedule shows an
**On-demand** badge.

On-demand matters for models that run on an **individual-usage subscription** (a personal Claude,
Codex, or GLM subscription that you authorize with a personal password per run). A normal cadence
schedule fires with no one present, so it **cannot** use an individual-usage model: if the block
resolves to one, the fire is refused and recorded as a failed run telling you to make it on-demand or
pick an API-key or coding-plan model. An on-demand schedule can, because you are present each time you
trigger it, so the run uses your own subscription and the app prompts you for the password if it needs
it.

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

See [Configuration](../deploy/configuration.md#document-task-sources) for enabling the Jira
task-source integration on a deployment.

::: tip Shared services fire once per org
A schedule on a [shared service](./shared-services.md) is visible on every board that mounts the
service but is a single record, so it fires **once per org**, no matter how many workspaces mount it.
:::

---

Next: review and merge what the agents produced in [Review and Merge Pull Requests](./pull-requests.md).
