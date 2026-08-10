# Security Model & Hardening

[Agent Isolation](./agent-isolation.md) describes what a run can reach. This page answers the
harder question: **if a prompt injection or a hallucinated tool argument makes an agent try to land
malicious code, what actually stands between that decision and your default branch?**

It is for operators deciding how much to trust autonomous runs. Read it once before you turn
auto-merge on, and again whenever you widen who may start runs.

## Assume the agent is adversarial

Agents read untrusted text on every run: repository contents, issue and tracker text, pull-request
comments, web-search results, and the results of any MCP tool server wired for the run. Assume the
worst case, because the platform's own controls are designed around it: the agent process inside the
run container will run any command its tools allow, and its prompt-level restrictions (instructions,
`allowedTools`, a "read-only" role description) have already failed.

Out of scope on this page: attacks on the platform's own HTTP surface (see
[Invite and Manage Your Team](../guide/team-and-access.md)), a malicious operator, and a compromised VCS host.

## Three kinds of control, and only one of them holds

Every control below is labelled, because they are not interchangeable:

| Label | Meaning |
| --- | --- |
| **Mechanism** | Enforced by code or by your VCS host. Holds even against a fully adversarial agent process. |
| **Configuration** | Enforced only if you set it. The platform ships a default, and the default is not always the strict one. |
| **Judgment** | An LLM's assessment. Assume it is defeatable by the same injection you are worried about, so it is never the last line of defence for anything that matters. |

The reason to keep them apart: a chain that looks like five controls is only as strong as the
mechanisms in it. Two of the strongest controls here are configuration, and both are yours.

## The write path, end to end

```
agent edits files in a per-run checkout
  → harness commits and pushes to ONE backend-chosen work branch   (mechanism)
  → harness opens a pull request through the VCS API               (mechanism)
  → the CI gate reads your host's real check runs                  (mechanism + your CI)
  → the merger agent returns a JSON risk assessment, nothing else  (judgment)
  → the engine compares that assessment to the risk policy and
    either merges or routes to a person                            (mechanism + configuration)
  → the host performs the merge, under branch protection           (configuration, host-side)
```

That is the path an agent's **decisions** travel. A run that has taken the credential itself does
not travel it at all: it reaches your host directly, where only branch protection is left. Keep the
two cases apart when you read the layers below.

## The layers, in the order they bite

1. **The agent never composes git commands** (mechanism). The agent's tool loop only edits files in
   the checkout. Every git operation is executed by the harness with a fixed argument list and no
   shell, and the branch name comes from the backend-composed job body, not from the model.
2. **The credential is not in the agent's environment** (mechanism, with a stated limit). The push
   token is handed to `git` out of band and never placed in the model process's environment. The
   stated limit is that the agent and the harness share a container: this stops the model from being
   *given* the credential, not a subverted process from hunting for it.
3. **What the token can reach** (mechanism + configuration). The job token is narrowed per dispatch
   to the repositories the run resolved, so the installation is the ceiling rather than the blast
   radius of every run. See [which credential a run pushes with](./agent-isolation.md#which-credential-a-run-pushes-with):
   an initiator's stored personal PAT outranks the deployment credential unless you turn that off.
4. **No agent decision merges to the default branch** (mechanism + configuration). The merger agent
   returns an assessment; the engine scores it against your risk policy and either merges or raises
   a review card. A pipeline with no merger never auto-completes a task.
5. **Agent text is untrusted on every rendered surface** (mechanism). Model-authored text reaches
   pull-request bodies, tracker comments, and telemetry, and all of those are parsed surfaces. The
   platform neutralises the host's auto-link and issue-closing triggers, and scrubs secrets at
   compose time, before any truncation.

## What is deliberately not a security boundary

Do not lean on any of these:

- **`allowedTools` and agent instructions.** Tool allow-lists scope an agent for focus, not for
  containment. A "read-only" role is a prompt.
- **The merger's judgment**, or any other LLM verdict, for anything your preset and class rules do
  not floor.
- **Separation between the agent and the harness inside one container.**
- **The sandboxed run mode against someone who already has repository write access.** It refuses
  both of the platform's merge exits and cannot stop a person merging the pull request by hand. It
  is a real control in one shape: it closes the escalation where an initiator who cannot merge on
  the host causes a merge by tapping a review card.
- **The absence of a secret from the prompt.** Injected context files and job bodies carry
  non-secret projections by design, but assume anything the agent can read it can also try to
  exfiltrate through text it writes.
- **The provenance of a wired MCP tool server.** Its results are untrusted input like everything
  else the agent reads, and the run container places no egress bound on which wired servers a
  subverted agent may call with what it has read. What does bind is which servers you wire for which
  agent kinds, and the scope of the credential each is handed.

## Operator hardening checklist

In priority order. The first two decide whether "malicious code reaches the default branch" is
possible at all.

1. **Protect the default branch of every repository the installation covers.** Require pull
   requests, forbid direct pushes, require your CI checks. This is the only control over a stolen
   write-scoped token, and it lives on your host. The platform never needs to push to a protected
   default branch, so protection costs you nothing. The GitHub settings panel's **default-branch
   protection preflight** probes each linked repository on demand and reports three states, never
   two: protected, unprotected, and could-not-determine. Treat the third as unprotected until you
   know otherwise.
2. **Choose risk policies deliberately.** For anything sensitive, pin *Manual review only*, or keep
   auto-merge and add class floors for source and schema changes. The shipped default auto-merges
   under balanced ceilings with no floors. See [Review and Merge Pull Requests](../guide/pull-requests.md).
3. **Scope the GitHub App installation to only the repositories the platform should work on.** Do
   not install on "All repositories" of an organization that also holds crown jewels.
4. **Govern stored personal PATs, or step 3 does not bind.** An initiator's stored personal token
   outranks the App token on the standard dispatch path, so a member holding a classic-scope PAT
   would otherwise widen every run they start to their whole account.
   - Your host's own controls are stronger than ours and worth reaching for first **if this
     deployment serves the whole organization**: a GitHub org owner can deny classic PATs access to
     the org and require owner approval for fine-grained tokens. Those bind every tool the member
     uses, not only this one.
   - They are the wrong tool for individual adoption, which is why personal tokens stay fully
     supported and the account-level floor ships unset.
   - **Enforced, account-wide**: turn off *Run credential policy* → allow initiator PAT in account
     settings. No board in the account may then use an initiator's token, and a workspace admin
     cannot lift it.
   - **Enforced, per board**: turn off *Run credential* in workspace settings. The board then
     authenticates as the App installation, at the cost of bot attribution.
   - **Visible**: the personal-token form states what a token actually grants when it is tested or
     saved. That is advice, not a gate.
5. **Treat local native mode as trusted-input only.** With no container, the process boundary is
   only the agent CLI's own sandboxing. Do not point native-mode runs at repositories or issues
   whose content you do not trust.
6. **Self-hosted runner pools are inside the trust boundary.** Jobs execute there with these
   tokens, so run pools only on infrastructure you would trust with the installation token itself.
   See [Run Jobs on Your Own Runners](../operate/runner-pools.md).
7. **Leave `LOCAL_MODELS_ALLOW_LAN` off on any shared deployment.** A user-registered local model
   endpoint is fetched server-side, so this flag decides what the server may be pointed at. The
   default permits loopback only; the opt-in widens it to the whole private network, which on a
   multi-tenant box lets any user aim server-side requests at internal services.
8. **Make your CI test what you care about.** The CI gate is exactly as strong as the checks it
   reads.

## Known gaps

Stated rather than papered over, because each one changes how you should configure a deployment:

- **On a hosted deployment, loopback local-model endpoints still reach the server itself.** With LAN
  reach off, the remaining grant is loopback, which is the intended target on a developer's machine
  and pure downside on a shared one. Any signed-in user can drive the connectivity probe, which
  makes it a loopback port prober. If you run a shared deployment where nobody needs local runners,
  treat this as a reason to keep the feature unused rather than merely narrow.
- **A wired MCP tool server is an exfiltration channel** as well as an injection source, and the
  container applies no egress bound on it.
- **A container that has taken its own push credential bypasses the pipeline entirely.** Every
  merge-policy control on this page describes the decision path, not that case. Branch protection is
  the control that covers it.

---

Next: [Agent Isolation](./agent-isolation.md) for what a run can reach,
[Invite and Manage Your Team](../guide/team-and-access.md) for who may start one, and
[Review and Merge Pull Requests](../guide/pull-requests.md) for the merge policy the checklist keeps referring to.
