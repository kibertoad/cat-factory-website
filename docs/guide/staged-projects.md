# Work Through a Staged Project

For whoever drives a project whose definition declares **stages**: research first, then decisions,
then the work in your services, then a write-up, each stage building on what the earlier ones
settled. Your deployment ships the definitions; this page is about running one.

## What a stage is

A stage runs one kind of task and keeps its own result. It starts only once the stages it runs
after have an **accepted** result, and it may read those results as context. A stage with a
**checkpoint** holds its result until a person accepts it, so nothing downstream builds on work
nobody looked at.

The platform ships four kinds of stage:

- **Research** answers the stage's questions against the vendor or system the definition describes.
- **Decisions** proposes a decision register: each question with its options, a recommended
  default, the reasoning and the evidence. A person settles every item as they accept it.
- **Spawn** creates a task in each service the project links, with the project linked so each task
  reads what the stages found, and starts each task's run. Its checkpoint waits until every task it
  created is done or removed.
- **Write-up** composes the stages it reads into one Markdown document, such as a handoff for the
  team that maintains the integration.

A deployment can add stage kinds of its own.

## The Stages tab

Open the project from its frame on the board. A staged project opens on its **Stages** tab, which
lists each stage in order with where it stands:

| Status | Meaning |
| --- | --- |
| Blocked | A stage it runs after has no accepted result yet; the tab names which. |
| Ready | It can start. |
| In progress | Its task is working; the tab names the task. |
| Awaiting acceptance | Its result is ready and waits for a person at the checkpoint. |
| Done | Its result is accepted. |

**Stale** means a stage this one built on has a newer accepted result since this one ran. Nothing
reruns on its own: start the stage again when it can run to use the newer result.

**Start** on a ready stage creates its task and starts its run. **Accept** on a stage awaiting
acceptance lets the stages after it use the result. A decisions stage shows its proposed items
instead: pick or type a choice for each (the recommendation is preselected), add a note if you
want, and **Settle and accept**. Any question the proposal left out is named above the items.

## Acceptance criteria

A stage may declare acceptance criteria: what its result has to show. Each result is checked
against them and the report is shown on the stage. A model argues each criterion and quotes the
passages of the result that support it; a criterion counts as **met** only when every quoted
passage is really in the result. One argued without a quote, or with a quote the result does not
hold, shows as **unverified**. The report informs your decision; it never accepts or refuses a
result on its own.

## Knowing when a stage needs you

When a stage's result awaits acceptance, the board that homes the project gets a notification.
Clicking it opens the project on its stages; accepting the stage clears it. You can route it to
Slack or email from their settings.

To drive stages from another system, see
[Staged projects in the public API](../extend/public-api.md#staged-projects).
