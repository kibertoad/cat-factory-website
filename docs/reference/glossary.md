# Glossary

An A-to-Z lookup for the words this documentation and the app itself use. Where a term has a page
of its own, the entry says what it is in one or two sentences and links there.

If you are meeting the product for the first time, read [Core Concepts](../guide/core-concepts.md)
instead: it explains how these fit together, which a glossary cannot.

## A

**Account.** The organization tier above a workspace. Members, billing ceilings, the model access
policy, and the audit log live here. See [Workspaces and accounts](../guide/core-concepts.md#workspaces-and-accounts).

**Agent kind.** What a step does and how it is prompted: Coder, Architect, Reviewer, Tester,
Merger, and the rest, plus any [custom kinds](../extend/custom-agents.md) a deployment registers.
A kind decides whether a step runs inline or in a container, and which default model it takes.

**Agent tier.** How much of the agent catalog a surface lists (basic through advanced). Separate
from the interface mode: the mode decides which surfaces exist, the tier decides how much of one
surface's catalog is offered.

## B

**Block.** The unit on the board. A block is both plan and work item, at one of four levels: an
epic, a service frame, a module inside a frame, or a task leaf. "Card" is the same thing as it is
drawn on the board.

**Board.** The pannable canvas a workspace's blocks live on. See
[Design Your Board](../guide/designing-your-board.md).

**Budget.** The monetary ceiling on metered model spend, tiered per workspace, account, and user.
Subscription and local-runner runs are not metered against it. See [Control Spend with Budgets](../guide/budgets.md).

**Bug hunt.** The interactive surface that rates the open, unassigned bugs of whatever you point it
at on impact against complexity, and adopts the one you confirm as a task. That is a tracker board on
Jira or Linear, and the chosen service's linked repository on GitHub Issues or GitLab Issues, which
have no board to pick. Distinct from **bug intake**, the unattended step inside the recurring
bug-triage pipeline, which claims the oldest matching issue on a schedule.

## C

**Companion.** A rework partner paired with a producing agent kind. It loops that producer back on
a bounded budget before a person is asked to intervene.

**Consensus panel.** Running one eligible step as a multi-model panel instead of a single model.

## D

**Decision.** A point where a run parks and waits for a person: approving requirements, choosing
between proposed implementations, resolving a judge's verdict, or acting on a merge review. A
parked run waits indefinitely by design. See
[Decision prompts](../guide/core-concepts.md#decision-prompts).

**Document source.** A connected system (Confluence, Notion, Linear Docs, a repository's own docs)
the platform reads context from before a run. See [Documents](../guide/documents.md).

## E

**Ephemeral environment.** A live preview stack provisioned for one run and torn down afterwards,
so integration and end-to-end tests hit a running system. See
[Environments](../operate/environments.md).

**Epic.** A block level above tasks, used to group work that ships together.

## F

**Foundational service.** A shared capability your organization already runs (an auth service, a
payments gateway) declared once so every agent is told it exists instead of reinventing it. See
[Register Foundational Services](../guide/foundational-services.md).

**Frame.** A service block on the board: the container a module or task sits inside. A task's
repository is resolved by walking up to its enclosing frame, so a task outside one cannot run.

## G

**Gate.** A step that checks something and only escalates when the check fails. The CI gate reads
your host's real check runs; the conflicts gate watches mergeability; the post-release-health gate
watches monitors after a merge. A failing gate dispatches a helper agent rather than stopping the
run outright. Custom gates are registered like custom agents.

## H

**Harness.** The fixed, trusted wrapper inside a run container that clones the repository, launches
the model, commits, pushes, and opens the pull request. The model never does any of that itself.
See [Agent Isolation](./agent-isolation.md).

**Headless run.** A run started against a supplied brief with no board card and nothing pushed to a
repository, driven through the [public API](../extend/public-api.md).

## I

**Initiative.** A larger body of work decomposed into blocks, optionally from a preset. See
[Plan an Initiative](../guide/initiatives.md).

**Interface mode.** Basic (the shipped default) or advanced. Basic hides override controls whose
default is already what the hidden field would show; nothing that is only reachable in advanced mode
is needed for the everyday delivery loop.

## J

**Judge.** An inline model that scores a step's output against a rubric and disposes: advance, park
for a person, bounce the work back with findings, or fail. Distinct from a gate, whose check is
programmatic and cheap.

## M

**Manifest.** The declarative file a deployment supplies to wire an integration it owns (a runner
pool, an environment provider, a code adapter). See [Integration Manifests](../extend/manifests.md).

**MCP.** The Model Context Protocol, which appears here in two unrelated roles. A **tool server**
is an MCP server an agent may call during a run. The **MCP server** is this platform's own public
API exposed as MCP tools to an outside host. See [MCP Server](../extend/mcp-server.md).

**Model flavour, or route.** One of the ways a single catalog model can be reached: a coding-plan
subscription, a direct vendor key, an aggregator gateway, a residency-guaranteed route, or the
Cloudflare fallback. A preset's route order decides which one a run takes.

**Model preset.** A named assignment of models to agent kinds: one base model plus optional
per-kind overrides. Exactly one preset is a workspace's default. See
[Connect a Model Provider → Model presets](../guide/model-providers.md#model-presets).

**Module.** A block level between a service frame and its tasks, used to group tasks inside one
service.

**Mount.** How one account-owned service appears on several boards as a single synced copy. Its
position on each board belongs to the mount, not to the service. See
[Share Services Across Workspaces](../guide/shared-services.md).

## P

**Pipeline.** The ordered chain of steps a task runs: which agent kinds, in what order, with which
gates and human decision points. See [Run a Pipeline](../guide/running-pipelines.md).

**Prompt fragment.** A reusable block of standing context or standards folded into agent prompts.
See [Apply Standards with Prompt Fragments](../guide/prompt-fragments.md).

## R

**Reusable operation.** A custom task type that carries the whole bundle: a per-case form, its
standing context, and its own canned pipeline. A custom task type carrying only presentation is a
classification (a badge and a card), not an operation.

**Run.** One execution of a pipeline against one block. Runs are durable: they checkpoint, survive
interruptions, and resume. See [Runs](../guide/core-concepts.md#runs).

**Runner pool.** Your own infrastructure executing agent containers instead of the platform's
default. See [Run Jobs on Your Own Runners](../operate/runner-pools.md).

## S

**Service.** A top-level frame on the board, linked to exactly one repository (optionally a
directory inside it, for a monorepo). The linkage is what lets a task resolve a repository at all.

**Skill.** A packaged instruction set attached to an agent kind, materialised into the run container
for the agent to follow. See [Skills](../guide/skills.md).

**Step.** One unit of a pipeline: an agent, a gate, a judge, or a one-shot engine step such as the
tracker or the disposer.

## T

**Task.** A leaf block, and also the word used at the tracker boundary for a linked issue. On the
board, "task" is a block level; the separate **task type** axis (bug, feature, and any custom types)
decides a card's badge and which pipeline it starts with.

**Task source.** A connected issue tracker that seeds tasks and receives progress back. See
[Issue Sources](../guide/issue-sources.md).

**Tool server.** An MCP server an agent may call during a run, registered by the deployment and
handed a credential resolved by name. See [Add a Custom Agent Kind → Skills and tool servers](../extend/custom-agents.md#skills-and-tool-servers).

## U

**Unattended run.** A run nothing is watching: started over the public API, dispatched from a tracker
issue, or fired by a schedule. It resolves the workspace's second default risk policy rather than its
in-app one, and under an `unattended` policy it answers the checkpoints its own automatic loops raise
instead of waiting for a person. Gates the pipeline asks for still stop it. See
[Runs nobody is watching](../guide/pull-requests.md#runs-nobody-is-watching).

## W

**Workspace.** One board plus its members, settings, presets, and connections. A workspace has
exactly one source-control installation and may hold many repositories.

---

Next: [Core Concepts](../guide/core-concepts.md) for how these fit together, or the
[Cookbook](../guide/cookbook.md) for a recipe per operation.
