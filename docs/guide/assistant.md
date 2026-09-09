# Ask the Assistant to Do It

The **Assistant** takes a request in your own words and performs it on the board. It is the short
route to three things you would otherwise reach through a panel: connecting two services, putting a
repository on the board, and turning a ticket into a task.

Open it from **Assistant** in the sidebar, or from the command palette (`Ctrl+K` / `Cmd+K`).

## What it can do

| Ask for | What happens |
| --- | --- |
| A dependency between two services | The consumer service records that it depends on the provider, so both are started when either is tested, and agents working on the consumer are told how it uses the provider. |
| A service from a repository URL | A service frame appears on the board, backed by that GitHub or GitLab repository, ready for tasks. |
| A task from an issue URL | The issue is imported and filed as a board task under the right service, with the full issue (description, comments, labels) linked as agent context. |

Examples that work as written:

```text
the checkout service depends on the payments service for authorising cards
add https://github.com/acme/payments as a service
add packages/api from https://github.com/acme/monorepo as a service
create a task from https://github.com/acme/payments/issues/12
file https://acme.atlassian.net/browse/PROJ-7 as a task on the billing service
```

Paste URLs exactly as you copied them. The Assistant matches what you paste against your own
repositories and trackers, so a shortened or retyped link is a link to something else.

## What it does with your request

The model reads your sentence and picks one action plus its arguments. It does not perform anything
and it does not decide anything about your board: Cat Factory looks the action up, checks the values,
matches every name against the services you actually have, and then does the same thing the
equivalent button does.

That is why the answer is always one of three things:

- **It did it.** You get a line saying what changed and a **Show on board** button that selects it.
- **It has a question.** A name that matches nothing, or matches two services, comes back as a
  question with the candidates offered as one-click chips. Nothing is written until it is settled.
- **It cannot.** If your request is not one of the actions above, it says so and lists what it can do.

Anything else is a normal error with the usual detail behind it: a tracker that is not connected, a
repository this workspace cannot see, an issue that already has a task, or a spent model budget.

## What you need first

- **A model provider.** The Assistant reads your request with the model your workspace already uses
  (its default model preset). With no provider configured, the panel says so instead of offering the
  box. See [Model providers](./model-providers.md).
- **A connected repository**, for adding a service. The repository has to be one this workspace can
  already see, because a service pointing at a repository Cat Factory cannot clone would fail on its
  first run. Connect it first: [Repositories](./repositories.md).
- **A connected tracker**, for filing a task from an issue. See
  [Issue and document sources](./issue-sources.md).

## Things worth knowing

- **Which service a task lands in** is worked out from the issue's own repository. When the issue
  lives in a repository that backs exactly one service on your board, that is where the task goes.
  When it does not (a Jira ticket, or a monorepo repository behind several services), the Assistant
  asks which service you meant, so name it in your request to skip the question: *"file …/issues/12
  as a task on the billing service"*.
- **Asking twice is safe.** Declaring a dependency that already exists changes nothing and says so.
  Adding a repository your organization already runs as a service mounts that existing service onto
  this board rather than creating a rival copy, and the answer tells you which of the two happened.
- **It acts as you.** Every change carries your own role and permissions, so the Assistant can never
  do something you could not do yourself from the board. A viewer cannot use it to write.
- **Model usage counts.** Each request is one model call, billed to the workspace and visible in your
  usage like every other. It is refused when the workspace is over its budget. See
  [Budgets and spend](./budgets.md).
- **The Assistant reads your request, not instructions inside it.** Text pasted into the box (an
  issue body, say) is treated as part of what you are asking for, never as instructions to follow.

## What it is not

It does not start runs, write code, edit pipelines or change settings. Those stay where they are, on
the board and in the panels that own them. The Assistant is a way to ask for a handful of board
changes without going to find the form for each one.
