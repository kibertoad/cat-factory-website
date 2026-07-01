# Issue & Document Sources

Most requirements already live somewhere, in a tracker ticket or a spec document. Cat Factory lets
you link those sources directly to blocks, import them, and use them as agent context.

## Supported sources

| Type | Sources |
| --- | --- |
| **Issue trackers** | Jira, GitHub Issues, Linear |
| **Documents** | Confluence, Notion, GitHub repo docs, Linear Docs |
| **Design context** | Figma, Zeplin |

**GitHub repo docs** lets you pull a Markdown/spec file straight from a connected repository
(`owner/repo:path`, or a file URL), reusing the workspace's installed GitHub App.

Connect **Linear** per workspace under **Integrations**, either through OAuth (the "Connect" flow) or
with a personal API key. It works across four capacities:

- **Document source**: import Linear Docs as task context.
- **Task source**: import Linear issues (with their sub-issues and relations, paginated) to link to a
  task or to seed a new board task.
- **Filing tracker**: the [tech-debt recurring pipeline](./recurring-pipelines.md) and similar steps
  file new issues into a Linear team. Pick the team from a **typeahead team picker** in the tracker
  panel rather than pasting a team id.
- **Writeback**: comment on the linked Linear issue when its PR opens, and transition the issue to a
  completed workflow state when the PR merges.

::: tip Design context (Figma and Zeplin)
**Figma** and **Zeplin** are design-context sources. Connect either per workspace with a personal
access token; Cat Factory pulls component structure, layout, and design tokens and renders them to
Markdown so the UI coding agents get the design as context. Link a frame or screen to a task like any
other document. This pairs with the
[Visual Confirmation](./running-pipelines.md#visual-confirmation) flow.
:::

## Finding and linking context

When you create a task, the Add task popup includes a context picker. For any connected
source you can:

1. Search the source's catalogue by title or content (Confluence via CQL, Notion search, Jira
   via JQL, GitHub issues, and GitHub repo code/docs).
2. Paste a page or issue URL directly.
3. Pick something already imported into the workspace.

Chosen items are imported and linked to the new task as agent context on create, with no separate
import step. Search is scoped to the workspace's own integration installation, so you only ever see
your own org's content.

Imported content can also be expanded into structural components. A large epic, for example,
can seed a module with several task leaves, each carrying its slice of context.

## Creating a task straight from an issue

Beyond attaching an issue to a task you're already writing, you can turn an imported **GitHub issue
or Jira ticket into a brand-new board task** in one step. There are two ways in:

- A service frame header carries a **Create task from issue** button (shown when a tracker is
  offered). It opens the tracker-issue modal pinned to that service, with the issue search scoped to
  the service's linked GitHub repo, and the new task lands in that frame.
- The task-source import modal lets you pick the service frame or module to create tasks in, then
  hit **Create task** on an issue.

You search the tracker by title to find a hit, no need to know the issue key. In a repo-scoped GitHub
search, a pasted issue URL (or `owner/repo#n` shorthand) resolves to that exact issue and is offered
first; a bare issue number resolves against the service's repo. Then:

- A new leaf block is created (titled `KEY: summary`, its description seeded from the issue body) in
  the container you chose.
- The issue is linked to the new task, so every agent step still sees the full issue (description,
  comments, and metadata) as context.

When the add-task form opens with a linked issue, it shows that issue's description read-only above
your own editable field (labelled **Additional notes**). The issue body is folded into the saved
description first, then your notes, so you add context without retyping the ticket.

The issue stays the source of truth: re-importing refreshes it. Creating a *second* task from an
already-linked issue is refused, so one issue maps to one task rather than silently re-pointing.
GitHub Issues and Jira both work this way on every runtime (Cloudflare, Node, and local); Linear is
offered as a task source for import and linking too.

## The issue-tracker panel

A workspace's tracker is configured in one place: **Workspace settings → Issue tracker**. It has
three parts:

- **Filing tracker**: where the [tech-debt recurring pipeline](./recurring-pipelines.md) and similar
  steps file new tickets, **None**, **GitHub Issues**, **Jira** (reveals a project-key field), or
  **Linear** (reveals a team picker).
- **Linking**: per-source toggles for whether that tracker can be linked as task context. These are
  per-workspace and default on, so a workspace can use GitHub repos without offering their issues, or
  park a connected Jira.
- **Writeback**: see below.

Each source has a **Check setup** button that runs a live diagnostic and reports a concrete status,
`ready`, `not_installed`, `not_connected`, `auth_failed`, `forbidden`, or `unreachable`, so you can
tell a missing GitHub App install from a bad Jira credential without starting a run to find out.

## Writing back to the tracker

Cat Factory can keep the upstream issue updated as work progresses, so the tracker reflects reality
without manual status-shuffling. Two workspace toggles under **Issue tracker → Writeback** control it:

- **Comment when a PR opens**: posts a comment on the linked issue when the task's pull request opens.
- **Close as resolved when a PR merges**: closes the issue when the PR merges (GitHub closes it
  natively; Jira transitions it to its first "Done" status; Linear transitions it to a completed
  workflow state).

Both default off and can be overridden per task in the task inspector (**Inherit workspace**, **On**,
or **Off**), so a one-off task can opt out of (or into) writeback without changing the workspace
default.

## Using sources as agent context

Once linked and imported, source content travels with the block:

- The reviewer agent uses it to find gaps and risks.
- The coder agent uses it to implement the task accurately.
- Subsequent steps reference the same shared definition.

Container agents get the linked material in full: each step's prompt carries
a short summary index, and the complete bodies are written into a git-excluded `.cat-context/`
directory in the workspace for the agent to read on demand. Cat Factory also resolves references you
name in a description, Jira keys, `owner/repo#123`, and URLs, against the imported corpus, so a task
that mentions a ticket picks up that ticket's content even without an explicit link.

## Enabling integrations

Document and issue integrations ship enabled; each workspace connects its own site and credentials
in the UI (Confluence and Notion API access, Jira, and the GitHub-backed sources, which ride the
workspace's GitHub App installation). Which task sources a workspace actually offers is then the
per-workspace toggle described above. See
[Configuration → Document & task sources](../deploy/configuration.md#document--task-sources) for the
deployment-side knobs that remain.

::: tip Keep the source of truth where your team works
Linking beats copy-pasting: when the upstream ticket or doc is the canonical spec, importing keeps
the agent's context aligned with what your team is actually tracking.
:::

---

Next: keep agent costs predictable with [Budgets & Spend](./budgets.md).
