# Research a Vendor with a Project

For whoever has to learn how a third-party system works before anyone builds against it: which
auth scheme its API uses, how it pages, what a webhook carries, what the admin console lets you
configure. A **research project** answers a fixed list of questions about one vendor, records every
answer with its evidence, and keeps the answers current as follow-up runs re-check them.

## Projects sit beside services

A **project** is a peer of a service on the board. It is owned by your organization, mounted onto
boards the way a [shared service](./shared-services.md) is, and holds tasks of its own. It has no
repository to write to: it can **link** services, and its tasks then read those services' repositories
as read-only context. A project with no links is fine.

Create one from **Projects** on the board toolbar. Pick the kind (research is the one the platform
ships), give it a title, and optionally link services.

## Research definitions

A research project pins one **research definition**: a versioned description of what to find out,
never how.

| Part            | What it holds                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| **Brief**       | The goal, in prose, for the agent and for you.                                                          |
| **Topics**      | Groups of questions. Each question has a stable id, so answers merge across versions and runs.          |
| **Credentials** | What the research needs to log in or call the API, declared by name. The values never live here.       |
| **Targets**     | The vendor's origins (`https`), marked `ui` or `api`. A credential is only ever sent to one of these.   |
| **Inputs**      | Per-project parameters (a region, a tenant name) you fill in when you create the project.                |

Definitions come from two places, and the create form lists both:

- **Shipped by your deployment** in code, for the vendors every team uses.
- **Published by your organization** through the public API, from your own CI if you like. A
  published version is immutable: changing a definition means publishing the next version, so a
  project never changes meaning underneath you. A published key must use a namespace the deployment's
  own definitions do not.

Creating the project pins the definition version you chose (the newest by default) and the values for
its inputs.

## Running research

Each research run is a task of the **Research** type in the project, with a **mode**:

| Mode        | What it answers                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------- |
| **Initial** | Every question in the pinned definition.                                                          |
| **Extend**  | Questions added since the last run, by a newer definition version or as ad-hoc questions on the task. |
| **Clarify** | Questions whose last answer was partial or blocked, or the ones you name.                         |
| **Refresh** | Re-checks every existing answer against the vendor as it is now.                                  |

The agent works in a browser and over HTTP against the definition's targets. It never sees a
credential's value: it asks the platform to fill a login field or attach a token, and the platform
refuses when the page or URL is not one of the targets. Every request it makes is recorded, with
secrets redacted, as evidence for the answers.

A follow-up is a new task in the same project, so the project's task list is its research history.

## Findings

Each task records one **findings revision**. The project's current findings fold every revision by
question, in the order the tasks were started:

- A newer **answered** or **partial** answer replaces an older one.
- A newer **unanswered** or **blocked** attempt never erases an answer. It is kept beside it as a
  note, so a refresh that ran out of budget or lost a login cannot undo what an earlier run
  established.

Every answer carries a confidence, caveats and its evidence: recorded requests, screenshots, URLs
and paths in the linked repositories. Coverage per topic is counted by the platform from the agent's
per-question judgements.

Large findings are stored in your organization's content storage rather than in the database. If your
organization stores no content and a revision is too large to keep inline, the run says so rather
than truncating it.

## When the research needs a credential

Credentials ride the workspace's [capability credentials](../deploy/configuration.md#capability-credentials).
A definition marks each one as needed at start, or only when the agent reaches the point of need.

1. If a credential needed at start is missing, the run parks before anything starts. If the agent
   reaches a page or call that needs one, it saves the answers it has so far and the run parks.
2. The run shows what is missing, the definition's instructions for obtaining it from the vendor, and
   what the agent saw when it stopped.
3. Someone who can manage the workspace's secrets creates the login or token with the vendor and
   stores it under **Capability credentials**.
4. Anyone on the board clicks **Resume the run**. The platform checks the credential now resolves
   before it resumes, so an early click costs a message and never a wasted run. The run picks up from
   the answers it saved.

## Over the API

Everything above is available on the [public API](../extend/public-api.md):

| Endpoint                                                          | Scope    | What it does                                             |
| ----------------------------------------------------------------- | -------- | -------------------------------------------------------- |
| `GET /api/v1/research-definitions`                                | `read`   | Definitions the organization can pin, shipped and published. |
| `PUT /api/v1/research-definitions/{key}/versions/{version}`       | `admin`  | Publish one immutable version.                           |
| `GET`, `POST /api/v1/projects`                                    | `read`, `write` | List the projects the key's board mounts; create one. |
| `POST /api/v1/projects/{projectId}/services` (and `/unlink`)      | `write`  | Link or unlink services.                                 |
| `POST /api/v1/projects/{projectId}/tasks`                         | `write`  | Create a task; a research task takes its mode in `fields`. |
| `POST /api/v1/projects/{projectId}/tasks/{taskId}/start`          | `write`  | Start it, under the same admission as any task start.    |
| `GET /api/v1/projects/{projectId}/findings`                       | `read`   | The current findings and their coverage.                 |
| `POST /api/v1/runs/{runId}/credential/resume`                     | `decide` | Resume a run parked on a credential once it is stored.   |

A project's tasks are created and run on the board that homes the project; a key whose board only
mounts it can read them. Project tasks have their own resource, so the `/api/v1/tasks/{taskId}`
operations refuse one with `task_owned_by_project`.
