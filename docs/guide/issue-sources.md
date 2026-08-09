# Connect Issue & Document Sources

For teams whose requirements already live somewhere else, in a tracker ticket or a spec document.
Cat Factory lets you link those sources directly to blocks, import them, and use them as agent
context.

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
**Figma** and **Zeplin** are design-context sources: Cat Factory pulls component structure, layout,
and design tokens and renders them to Markdown so the UI coding agents get the design as context.
They connect and link like any other document source, and everything specific to them (which
credential, what the agent receives, the import caps, freshness) is on
[Feed Design Context to Agents](./design-context.md).
:::

## Finding and linking context

The same inline context picker appears on the Add task popup and in the task inspector, so you attach
material the same way whether the task is new or already exists. For a non-repo source (Confluence,
Notion, Jira) you can:

1. Search the source's catalogue by title or content (Confluence via CQL, Notion search, Jira via
   JQL, GitHub issues).
2. Paste a page or issue URL (or id) directly.
3. Pick something already imported into the workspace.

For a **repo-backed source** (GitHub, and GitLab through the same adapter) attaching a doc is a
two-step pick: search for a repository, then choose one or more files, either by filtering on path or
by browsing the repository tree (multi-select). A repo reachable only through your personal token is
badged, since it resolves through the workspace's GitHub App at run time and can fail to link on a
hosted deployment.

GitHub is available as a document source automatically once its App or PAT is installed, with no
connect step. When no source is connected at all, the context section offers a **Connect a source**
action that opens the connect flow over the task form and preserves what you've already typed, rather
than a dead Attach button. Chosen items are imported and linked as agent context on create, with no
separate import step. Search is scoped to the workspace's own integration installation, so you only
ever see your own org's content.

Each attached document row shows its full URL on hover and opens in a new tab. If a link fails, the
error names the specific cause (no access, rate-limited, not found) with a **Copy details** action,
instead of a generic "could not be linked" message.

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

A headless integration does the same thing by naming the ticket on
[`POST /api/v1/services/{serviceId}/tasks`](../extend/public-api.md#filing-a-task-from-a-tracker-ticket),
which imports the issue and attaches it rather than flattening it into the description.

## Bug hunt

**Bug hunt** is the interactive counterpart to the recurring bug-triage schedule: same board reading
and same downstream pipeline, but you pick instead of the oldest match being claimed unattended.

Choose a connected tracker and one of its boards, and the open, unassigned bugs come back rated on
impact against implementation complexity. Confirm one candidate and it is adopted as a bug task
running the standard [Triage & fix bug](./running-pipelines.md) pipeline.

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

A context picker always shows which tracker it is searching, and offers to add one from there if the
board has none.

::: warning GitHub issue search is repository-scoped
GitHub's issue search API carries no scope of its own, so an unqualified query returns whatever the
credential can reach: under a personal token, that is every public repository on GitHub. Every issue
search the platform makes therefore names its repository by construction, including the recurring
bug-intake sweep, which imports its hit and starts a pipeline on it. Results are exactly the service's
own issues. To link an issue from another repository, paste its URL; the by-reference row never rode
the search path.
:::

## Push-driven intake

A tracker can push instead of being polled. Point the tracker's webhook at
`POST /webhooks/tasks/<source>/<workspaceId>` and a qualifying issue event fires the matching intake
schedule immediately rather than waiting for its interval.

The webhook removes the latency; it does not reorder the queue. Deduplication, the replace-link rule,
and the pickup mark are the recurring schedule's, unchanged, and the schedule remains the sweep that
catches missed deliveries. The HMAC signature is verified over the raw body before anything is parsed.

The same transport carries **replies from the ticket**. When a run posts its open questions onto the
linked issue, someone can answer in the issue's own comments using an explicit grammar, never
natural-language guessing:

| Comment | Effect |
| --- | --- |
| `@cat-factory answer <id> <text>` | Answer the finding with that id. |
| `@cat-factory dismiss <id>` | Dismiss the finding as not applicable. |
| `@cat-factory proceed` | Proceed with the requirements as they stand. |
| `@cat-factory extra-round` | Run one more review round. |
| `@cat-factory stop` | Stop the run. |

Jira Cloud sends comment bodies as rich-text documents rather than plain strings; those are converted
before the grammar reads them, so a formatted reply works like a plain one.

### Registering a tracker from a deployment

The built-in sources (`github`, `jira`, `linear`) are not the whole vocabulary. A deployment can
register its own task source on the `TaskSourceRegistry` under a namespaced id, `<namespace>:<name>`,
the same shape [custom task types](../extend/frontend-extensions.md#custom-task-types) use. Built-in
ids stay bare, so nothing stored has to change.

A namespaced id is resolved against the registry at the boundary, so an unregistered one is refused by
the thing that actually knows, while a bare non-built-in id still fails validation. That keeps a typo
distinguishable from a registration. A registered source's board scope is carried as an opaque board
id rather than being squeezed into one of the built-in vendors' fields.

A registered source is usable everywhere the built-ins are, including the
[public API's `ticket` input](../extend/public-api.md#filing-a-task-from-a-tracker-ticket).

## Writing back to the tracker

Cat Factory can keep the upstream issue updated as work progresses, so the tracker reflects reality
without manual status-shuffling. Three workspace toggles under **Issue tracker → Writeback** control
it:

- **Comment when a PR opens**: posts a comment on the linked issue when the task's pull request opens.
- **Close as resolved when a PR merges**: closes the issue when the PR merges (GitHub closes it
  natively; Jira transitions it to its first "Done" status; Linear transitions it to a completed
  workflow state).
- **Post open questions on a parked headless run**: when a run started through the
  [public API](../extend/public-api.md) pauses to clarify requirements, posts its open questions on
  the linked issue, each with the id an answer names.

All three default off and can be overridden per task in the task inspector (**Inherit workspace**,
**On**, or **Off**), so a one-off task can opt out of (or into) writeback without changing the
workspace default.

The questions toggle exists because a headless caller has no in-app inbox to watch: the clarification
reaches whoever filed the issue, and they can answer it over the API against the ids in the comment.
It fires only for runs whose origin is the public API. A task started in the app is unaffected, and its
clarification surface stays the in-app review window. The post is claimed once per review iteration
and issue before it is attempted, so a retried or replayed run never double-posts onto an issue
somebody is reading, and a tracker outage leaves the post retryable rather than lost.

## Using sources as agent context

Once linked and imported, source content travels with the block:

- The reviewer agent uses it to find gaps and risks.
- The coder agent uses it to implement the task accurately.
- Subsequent steps reference the same shared definition.

Container agents get the linked material in full: each step's prompt carries
a short summary index, and the complete bodies are written into a git-excluded `.cat-context/`
directory in the workspace for the agent to read on demand.

A document that cannot actually reach the agent **fails the run** rather than being dropped quietly.
A reference that resolves to a page with an empty body, and a corpus that overflows the materialized
context budget, both used to leave the run looking healthy while the agent worked from a spec nobody
noticed it never read. Both now refuse in the same words, naming what could not be delivered. Cat Factory also resolves references you
name in a description, Jira keys, `owner/repo#123`, and URLs, against the imported corpus, so a task
that mentions a ticket picks up that ticket's content even without an explicit link.

## Enabling integrations

Document and issue integrations ship enabled; each workspace connects its own site and credentials
in the UI (Confluence and Notion API access, Jira, and the GitHub-backed sources, which ride the
workspace's GitHub App installation). Which task sources a workspace actually offers is then the
per-workspace toggle described above. See
[Configuration → Document & task sources](../deploy/configuration.md#document-task-sources) for the
deployment-side knobs that remain.

::: tip Keep the source of truth where your team works
Linking beats copy-pasting: when the upstream ticket or doc is the canonical spec, importing keeps
the agent's context aligned with what your team is actually tracking.
:::

---

Next: keep agent costs predictable with [Control Spend with Budgets](./budgets.md).
