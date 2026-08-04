# Agent Isolation Model

An agent run is a language model doing work on a checkout of one repository. This page explains the
boundary around that model: what it can reach, what it never gets, and what mediates each pathway.

The short version: the model never holds the credentials to your own systems, never connects to your
linked systems, and never pushes to GitHub itself. It reads and edits files in a single checkout, and
reaches a model provider only over a tightly scoped channel. Everything else is done for it by
trusted backend code, or not at all.

## Two different things run in the container

A per-run container holds two distinct programs, and the distinction is the whole isolation story:

- The **harness** is a small, fixed TypeScript wrapper baked into the container image. It is trusted
  code: the same wrapper on every run, auditable in the open-source repo, never written per agent.
  It clones the repo, launches the model, commits what the model changed, pushes a branch, and opens
  the pull request.
- The **model** is the agent CLI the harness launches (for example the Pi coding agent). It is the
  untrusted part: it runs whatever the language model decides to do. Its only durable output is edits
  to files in the checkout.

Custom agent kinds do not change this. A custom kind's deterministic logic runs on the backend as
`preOps`/`postOps` (see [Custom Agents](../deploy/custom-agents.md)), never as code inside the
container. The container always runs the same generic harness over a checkout, so adding an agent
kind never widens what runs in the sandbox.

## The narrow pathways

The model can reach exactly four things, and nothing else:

| Pathway | What it is | What mediates it |
| --- | --- | --- |
| The checkout | One repository, one branch, on local disk | The harness clones it; the model reads and edits files |
| Linked context | Read-only copies of requirements, RFCs, and tracker issues, written into a `.cat-context/` folder | The backend fetches them before the run and materialises them as files |
| Model inference | Calls to a language model | The backend LLM proxy with a model-locked session token, or, for a subscription harness, a direct vendor call with a leased, scoped token |
| Web search/fetch (optional) | `web_search` / `web_fetch` tools, when a deployment enables them | The same backend proxy; no provider key reaches the container |

That is the complete list of channels in and out. Each one is brokered by the backend or by the
harness. The model never opens a connection of its own choosing to anything.

## What the model never gets

- **External credentials.** No GitHub token and no integration tokens for Jira, Linear, GitLab,
  Slack, or email. These live on the backend, encrypted at rest, and are never placed in the model's
  process environment. The only credential the model process can hold is the scoped, model-locked
  token it uses to reach a provider, covered below.
- **A way to push to GitHub.** The model cannot push a branch, open a pull request, or merge one. It
  has no GitHub token in its environment, so a `git push` it tried to run would simply fail to
  authenticate.
- **Live access to your linked systems.** The model never connects to Jira, Confluence, Linear, or
  any other tracker. It sees only the specific copies the backend already fetched for that one task,
  written to `.cat-context/`. It cannot comment on an issue, post to Slack, or send mail.
- **Arbitrary network egress.** The model's outbound calls go to fixed, brokered endpoints: the
  backend proxy, or its provider's API for a subscription harness. The GitHub host is allow-listed,
  so a poisoned clone URL pointing somewhere else is rejected, and runner pools and environment
  providers add SSRF protection that blocks private, internal, and cloud-metadata addresses.

## Credentials stay on the backend

Every integration's per-workspace credentials are encrypted at rest under one master key
(`ENCRYPTION_KEY`; see [Configuration → Credential encryption](../deploy/configuration.md#credential-encryption)).
They are decrypted only on the backend, only to make a call on your behalf, and only the minimum the
run needs ever leaves it.

**GitHub.** The backend resolves a token for each run and passes it to the harness in the job
request. The harness hands it to `git` out of band (through a credential helper, never on the command
line or in a remote URL), so it stays out of process listings and error text. The model's own process
never receives it. Which token that is, and therefore how far a fully compromised run could reach, is
covered in [Which credential a run pushes with](#which-credential-a-run-pushes-with).

**Model providers.** For the proxy harness, the provider key (Anthropic, OpenAI, or another) never
enters the container at all. The model authenticates to the backend proxy with a signed session token
that is locked to one model, and the proxy injects the real provider key and meters the spend. The
key cannot be read, swapped, or exfiltrated from inside the run.

::: tip Subscription harnesses are the one nuance
Harnesses that talk to a vendor directly (Claude subscription, Codex) are handed a leased, scoped
subscription token so they can reach the model. That is the one credential that lives in the agent
process, and it is a narrow lease, not your account password, not any integration secret. It is
scrubbed from all run output like every other secret.
:::

**Everything else.** Slack bot tokens, tracker site credentials, runner-pool tokens, and environment
auth are backend-only. The agent never holds them and never calls those systems.

## Which credential a run pushes with

This is the hard bound on a fully compromised run, so it is worth being precise. What the job carries
depends on the deployment shape:

| Deployment shape | Credential | Scope | Lifetime |
| --- | --- | --- | --- |
| Cloudflare or Node engine | A [GitHub App](../deploy/github-app.md) installation token minted at dispatch | Installation-wide: every repository the workspace's installation covers, at the permissions the install granted | About an hour, in memory only |
| Local mode | The deployment's shared `GITHUB_PAT` | Whatever the person who created the PAT granted | The PAT's own |
| GitLab, any shape | A per-workspace PAT, sealed at rest and unsealed server-side per use | Whatever the person who created the PAT granted | The PAT's own |

**The run initiator's stored personal PAT outranks all of those, unless the workspace refuses it.**
Where the per-user secret store is wired, a run whose initiator has stored a personal GitHub PAT uses
that token instead of the deployment's own, for the clone and push and for the engine's own calls
(the CI gate, mergeability, the merge itself). The purpose is attribution: pushes and pull requests
come from the person who started the run rather than from a bot.

The security consequence is that the bound is then the PAT's scope, not the installation's, and a
classic-scope personal PAT is broader than any installation, reaching repositories the platform was
never installed on. So the blast radius of a compromised run is a property of who started it, not only
of how the operator scoped the deployment. Treat "who may start runs" and "what tokens those members
store" as one question.

**Allow runs to use the initiator's PAT** is the enforced control, a per-workspace setting that is on
by default. Turned off, every run authenticates as the App installation (or, in local mode, the
deployment's own token) and the initiator's PAT is never decrypted, so the blast radius goes back to
being a property of the deployment. It is a mechanism, not advice: every mint site routes through one
decision, and an unreadable settings row fails closed to the App token. It does not touch a member
using their own token on their own behalf in the app, such as browsing their own repositories in the
picker.

When you test or save a GitHub PAT, the app states its breadth: a classic token carrying `repo` is
called out, unused scopes are flagged, and a token whose scopes GitHub does not report is reported as
unknown rather than passing as narrow. Use a fine-grained PAT restricted to the repositories the
deployment works on.

::: warning Branch protection is yours to configure
The credential carries write access for the whole repository, and a GitHub App token cannot be
branch-scoped. Nothing platform-side stops a stolen token from pushing directly to an unprotected
default branch, or from merging an open pull request through the host's merge API, which needs no more
permission than the push already had. Branch protection on the host is the control for both.

A **branch-protection preflight** probes each linked repository's default branch on demand and reports
three states, never two: protected, unprotected, and could-not-determine. Run it from the repository
settings and treat the third state as unprotected until you know otherwise.
:::

## Git and GitHub: the harness pushes, the merge is policy

The model's only durable output is the edits it leaves in the working tree. The harness, not the
model, turns those into a reviewable change:

1. It commits the changes onto a dedicated work branch (named per task, never the base branch).
2. It pushes that branch with the run's token.
3. It opens a pull request.

Nothing an agent decides or returns merges that branch. The merger agent returns only a JSON
assessment; the decision to merge is made by backend policy against thresholds you configure, and
anything outside them raises a review card for a person. See
[Pull Requests](../guide/pull-requests.md). The clone and push host is allow-listed, so the token
cannot be sent anywhere but your own host.

Read the scope of that claim precisely: it constrains the agent's **output**. It is not a defence
against a container process that has taken the credential, which could call the host's merge API
directly and never touch the pipeline. Branch protection covers that case; this layer does not.

## Linked systems: read-only copies, fetched by the backend

When a task references requirements, RFCs, PRDs, or tracker issues, the backend fetches them before
the run and writes sanitised copies into `.cat-context/` in the checkout. The agent is told to read
those files and explicitly told not to reach external systems, because everything available has
already been placed on disk. It has no credentials to reach them in any case. The data flow is one
way: the backend reads from your linked systems, never the agent, and nothing the agent does writes
back to them.

## Defense in depth

Even granting the boundary above, the run is wrapped in further limits:

- **Secret redaction** scrubs credential shapes and known secret values from all logs, errors, and
  output, so a token can't leak through an error message.
- **Watchdogs** cap a run's wall-clock time and kill an agent that stops producing output, so a
  wedged or looping run can't burn the budget.
- **A progress guard** aborts a run that probes the environment without ever editing a file, which is
  the signature of a model going down a credential-hunting rabbit hole.
- **The container is ephemeral.** It is built from a published image that carries no secrets, and it
  is torn down after the run.

## What you are trusting

To be precise about where the boundary actually sits:

- The **backend** is trusted. It mints tokens, composes prompts, fetches linked context, and holds
  every credential.
- The **harness image** is trusted. It is published publicly and built from source in the open repo,
  so you can verify it carries no secrets and does only what is described here.
- The **infrastructure** is trusted: Cloudflare's container and data services, or, if you run your
  own [runner pool](../deploy/runner-pools.md), the pool you operate. A self-hosted pool is the one
  place a leased subscription token leaves the backend to reach your runner.

The model itself is treated as untrusted throughout, which is the point: even a fully compromised
agent run cannot read the credentials to your systems, reach your linked systems, or change anything
beyond a branch you review before it merges.

---

See also: [Architecture](./architecture.md) for the wider system map,
[Configuration](../deploy/configuration.md) for the credential and proxy settings, and
[Team & Access](../guide/team-and-access.md) for user-level access control.
