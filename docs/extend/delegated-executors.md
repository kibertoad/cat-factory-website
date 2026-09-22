# Run a Step on an Executor You Already Operate

You already have a coding executor: a GitHub Actions implement/review/test loop, an internal job
runner, a vendor's autonomous pull-request bot. A **delegated executor** plugs it in as the
executor of one pipeline step. Cat Factory stays the top-level orchestrator (what to work on, in
which repository, against which standards, gated by which policy, followed by which merge and
which notification) and your system supplies only the middle.

Everything after the step settles is the engine that was already there. The pull request your
system opened lands on the board's task, the auto-inserted `ci` gate polls its real checks, the
`merger` step applies the workspace's
[risk policy](../guide/pull-requests.md#conflicts-ci-and-the-merger) and merges for real,
and the run's notifications and tracker writeback go out as they do for any other run. That is the
whole reason the seam is one STEP rather than a whole pipeline.

This is the third executor class, beside the inline model call and the container agent. It is code
you register from your own [deployment repository](../deploy/deployment-repository.md), with no
fork and no harness rebuild, exactly like a [custom agent kind](./custom-agents.md).

## When this is the right seam

- **Use it** when the work already runs somewhere you operate and you want Cat Factory's intake,
  standards, gates, merge policy and reporting around it.
- **Use a [custom agent kind](./custom-agents.md)** when the work is an LLM over a checkout and you
  want the platform to run it: you get the harness, the tool servers, the telemetry and the
  per-call spend for free, none of which a delegated step has.
- **Use a [runner pool](../operate/runner-pools.md)** when you only want the platform's agent to
  run on your own hardware. That is a machine choice; this is a "somebody else's agent" choice.

## Registering one

Three declarations, all through registries your start function already takes.

```ts
import { githubActionsDelegatedExecutor } from '@cat-factory/delegation-github-actions'

executorRegistry.register({
  // NAMESPACED. An unnamespaced id is how two deployments' shared modules collide, and the
  // loser's steps then dispatch into the winner's CI.
  id: 'acme:executor',
  presentation: { label: 'Acme CI', icon: 'i-lucide-bot', description: 'Our implement loop' },
  // Credential KEY NAMES, never values. Resolved per call and handed to your code only.
  credentials: [{ key: 'ACME_GITHUB_TOKEN', envName: 'GITHUB_TOKEN' }],
  // YOUR system's cadence, not a platform default (see "The poll cadence is yours" below).
  poll: { intervalMs: 60_000, maxDurationMs: 3 * 60 * 60_000 },
  telemetry: 'not-reported',
  // Who creates the work branch your run checks out (see "Who creates the work branch").
  workBranch: 'platform-creates',
  create: (deps) =>
    githubActionsDelegatedExecutor(
      {
        // One location, or a function of the dispatch when the workflow lives in each repo.
        workflow: { owner: 'acme', repo: 'automation', workflowFile: 'implement.yml', ref: 'main' },
        inputs: (brief) => ({
          task: brief.task.title,
          prompt: brief.userPrompt,
          repo: `${brief.repo.owner}/${brief.repo.name}`,
          branch: brief.branches.work,
        }),
      },
      deps,
    ),
})

agentKindRegistry.register({
  kind: 'acme:implementer',
  systemPrompt: 'You implement the requested change end to end.',
  traits: ['code-aware'],
  agent: { surface: 'delegated', executor: 'acme:executor' },
  presentation: {
    label: 'Acme implementer',
    icon: 'i-lucide-bot',
    color: '#6366f1',
    description: 'Runs in our own Actions loop.',
    category: 'build',
  },
})

pipelineRegistry.register(
  definePipeline({
    id: 'pl_acme_build',
    name: 'Acme build',
    purpose: 'build',
    steps: [{ kind: 'acme:implementer' }, { kind: 'merger' }],
  }),
)
```

Both registries ride their own option on `start()` / `startLocal()` / `createWorker`, by reference,
like every other registry on this page's siblings: see
[Packaging and wiring](./custom-agents.md#packaging-and-wiring). A kind naming an executor nobody
registered fails `validateRegistrationsOnce()` at boot rather than at 3am.

## What your executor implements

```ts
interface DelegatedExecutor {
  start(brief, credentials): Promise<{ externalId: string; url?: string; note?: string }>
  poll(handle, credentials): Promise<DelegationUpdate>
  cancel?(handle, credentials): Promise<void>
}
```

`start` is handed the **brief**: the task, the repository, the base and work branches, the system
and user prompts, the `.cat-context/` files and the service the work belongs to. It is the
production prompt: the container harness composes it through the same function, so a workspace's
prompt overrides and its agreed [best-practice standards](../guide/prompt-fragments.md) reach your
executor and a platform agent identically.

`poll` answers `running`, `done` or `failed`. `done` carries a summary and, when your system opened
one, the pull request; the platform records it on the task and the rest of the pipeline proceeds.

### `start` must be idempotent per `correlationKey`

This is the one hard requirement, and the failure it prevents is the worst one in the seam: two
external runs working one branch open **two pull requests for one task**.

The platform takes its half of the bargain. Before your `start` is called it commits a claim
carrying `brief.correlationKey`, so a replayed dispatch re-attaches instead of dispatching again.
Your half is to recognise your own run: look for it by the correlation key first, and dispatch only
when there is none.

If your system returns nothing identifying at start (GitHub's `workflow_dispatch` answers `204`
with no run id), `@cat-factory/delegation-github-actions` solves it for you: your caller workflow
renders the key into its own `run-name:`, and the run becomes findable by a string the platform
chose.

```yaml
# .github/workflows/implement.yml
on:
  workflow_dispatch:
    inputs:
      correlation: { required: true } # the platform adds this input for you
      task: {}
      prompt: {}
      repo: {}
      branch: {}

# The contract. `cat-factory[<key>]` is what the poll looks for, in the run's display title.
run-name: cat-factory[${{ inputs.correlation }}]
```

On a repository that fires a very high volume of `workflow_dispatch` runs, raise
`correlationScanSize` on the description: the lookup reads a bounded page of recent runs, and a run
pushed off the end of that page is one the idempotency check cannot see.

### Credentials

Declare the KEY NAMES your executor needs; the platform resolves them per call and hands the values
to your code alone. They never reach a prompt, the brief, the step record or the run's audit
snapshot. Resolution happens **once per dispatch and once per poll**, never cached, because a poll
can run hours after the dispatch and a GitHub App token lives one.

Your executor's outbound calls go through a fetch the platform has already held to the deployment's
outbound-URL policy: scheme and host are checked on the first URL and on every redirect hop, and a
cross-origin redirect drops the body and the credential headers. An executor reaching an internal
host needs that host allowed the same way an
[outbound notification webhook](../operate/notifications.md) does.

## Who creates the work branch

Every step of one task's pipeline works on the same branch, `cat-factory/<taskId>`, and the brief
names it. Your registration says who brings it into existence, because both answers are wrong for
half the executors there are:

```ts
workBranch: 'platform-creates' // or 'executor-creates'
```

- **`platform-creates`**: the platform creates the branch at the base branch's head just before
  your `start` is called, and does nothing when it is already there. Choose this when your system
  CHECKS OUT the branch it is given, which is every CI runner: `actions/checkout` on a branch that
  does not exist fails the job before your work begins. Worse, a runner that quietly switches to a
  branch of its own instead SUCCEEDS, pushes to a branch this platform never recorded, and the task
  then shows a run that produced nothing over a pull request nothing links to.
- **`executor-creates`**: your system creates the branch itself when it pushes. The platform
  writes nothing, so a run whose work never landed leaves no empty branch behind.

`platform-creates` needs a repository connection the deployment can write through. A deployment
with none refuses to start with the executor registered, rather than accepting the registration and
failing every run of it later.

## The poll cadence is yours

```ts
poll: { intervalMs: 60_000, maxDurationMs: 3 * 60 * 60_000 }
```

An external run of an hour is ordinary where a platform job of an hour is a stall, so the cadence
rides your registration rather than a platform default. `intervalMs` is how often the platform
asks; `maxDurationMs` is how long it keeps asking before failing the step as un-settled. Both are
copied onto the run when the step dispatches, so re-tuning them later leaves work already in flight
on the cadence it started under.

## Failure, retry and cancellation

A `failed` poll says whether the verdict is final:

- **Final (the default).** The run fails with your `error` verbatim and your run URL on the record.
  A second dispatch would reach the same answer.
- **`retryable: true`.** The platform spends **one** fresh dispatch, then fails the run. Use it for
  verdicts that are not about the work: a run your runner pool cancelled, a queue timeout, a rate
  limit. The first attempt stays on the record with its own outcome and link; the budget is the
  platform's, because it decides how much of your capacity a blip is worth.

`cancel` is optional, and its absence is REPORTED rather than assumed away. When a person stops a
run whose external work is still going, an executor that declares no `cancel` leaves that work
running: it will finish, open its pull request and bill your account afterwards. The step then says
so, by name, so whoever stopped the run knows to go and stop it in your system too. Implementing
`cancel` is what turns that into a clean stop.

## What the platform can and cannot see

A delegated step's model calls never touch this deployment's LLM proxy, its call recorder or its
tool-trajectory drain. So its tokens are in no total here, and the platform says that rather than
showing a zero:

- the step card reads **"usage not reported by Acme CI"**;
- the run's spend rollups carry `reporting.delegatedStepsWithoutUsage`, so a run total is never
  read as the whole cost;
- `GET /api/v1/debug/runs/{runId}` reports the same gap to a headless caller.

If your system knows its own token usage, return it on the completed result and declare
`telemetry: 'self-reported'`. It is then recorded for the usage report and excluded from this
deployment's budget gate, because the tokens were spent on your account. Per-call prompts and tool
trajectories have no ingest route yet.

What a delegated step DOES get, unchanged: the run card, the live step status with your run's link
and phase, the attempt log across retries, the verification report on the pull request, the
notifications, and every gate and policy the rest of the pipeline declares.

## Gotchas

- **Namespace the executor id.** An unnamespaced id collides across deployments that share a
  composition module, and the losing side dispatches into the other company's system with nothing
  reporting a conflict.
- **Return an external id from `start`, or recover one.** A dispatch the platform cannot poll is
  refused rather than recorded: a step parked on a job nothing can settle fails hours later as a
  timeout, naming the wrong thing.
- **Your executor's repository is usually not the work's repository.** A central automation repo
  dispatching against many product repos is one ordinary shape, so read what a run produced from
  the repository and branch the HANDLE carries, not from your own configuration.
- **A workflow committed to each onboarded repository is the other ordinary shape**, and then the
  dispatch target varies per task. Pass `workflow` as a function: it is handed the work repository,
  the workspace, the run, the agent kind and the correlation key, which is exactly the set both a
  dispatch and every later poll can name. Nothing a poll cannot see is offered, because a resolver
  that dispatched into one repository and polled another would report a live run as one that never
  appeared.
- **Say what you cannot do.** A missing `cancel`, an unknown token count, an unreadable result: all
  three are reported as what they are. A silent empty answer reads to everyone downstream as a
  clean one.

---

Next: [Add a Custom Agent Kind](./custom-agents.md) for the in-platform version of the same
registry, or [Set Up Your Deployment Repository](../deploy/deployment-repository.md) for where this
code lives.
