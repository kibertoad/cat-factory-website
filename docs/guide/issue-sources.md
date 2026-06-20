# Issue & Document Sources

Most requirements already live somewhere, in a tracker ticket or a spec document. Cat Factory lets
you link those sources directly to blocks, import them, and use them as agent context.

## Supported sources

| Type | Sources |
| --- | --- |
| **Issue trackers** | Jira, GitHub Issues |
| **Documents** | Confluence, Notion, GitHub repo docs |

**GitHub repo docs** lets you pull a Markdown/spec file straight from a connected repository
(`owner/repo:path`, or a file URL), reusing the workspace's installed GitHub App.

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

## Using sources as agent context

Once linked and imported, source content travels with the block:

- The reviewer agent uses it to find gaps and risks.
- The coder agent uses it to implement the task accurately.
- Subsequent steps reference the same shared definition.

## Enabling integrations

Document and issue integrations are controlled by feature toggles and credentials on the
deployment side: Confluence and Notion API access, the Jira task source, and the GitHub-backed
sources (which ride the workspace's GitHub App installation). See
[Configuration](../deploy/configuration.md#issue-tracker--task-sources) for the relevant settings.

::: tip Keep the source of truth where your team works
Linking beats copy-pasting: when the upstream ticket or doc is the canonical spec, importing keeps
the agent's context aligned with what your team is actually tracking.
:::

---

Next: keep agent costs predictable with [Budgets & Spend](./budgets.md).
