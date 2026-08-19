# Run a Claude Skill

For a team with a procedure it wants run the same way every time. A **Claude Skill** is a procedural
playbook your team authors in a repository and hands to an agent. Where [prompt fragments](./prompt-fragments.md) are passive guidance folded into
every code-aware agent, a skill is a procedure you point at work: as a **pipeline step** that clones
the repo, does what the playbook prescribes and commits the result, or as a **review skill** queued
onto a review task, where the reviewer applies it as an extra lens on the pull request.

## Authoring a skill

A skill is a directory holding a `SKILL.md` plus any supporting files. `SKILL.md` has YAML
frontmatter (`name` and `description`) and a Markdown body of instructions. Alongside it you can keep
resource files the instructions reference: templates, checklists, scripts. The conventional home is
`.claude/skills/<skill>/` in the repo, but a source can point at any directory. The whole directory is
the sync unit, not just the `SKILL.md`.

## Grouping skills

A skill can say what kind of work its playbook does, with a `group` in the frontmatter:

```markdown
---
name: Security review
description: Audit a change for auth, input handling, and secret exposure
group: review
---
```

The groups are **build**, **review**, **test**, **write**, **plan**, **operate**, and **other**.
A skill that declares none is filed under Other.

The group is what lets a surface offer the part of your catalog that fits it. A review task's skill
queue (below) offers your `review` skills and nothing else, so a release-notes writer never turns up
in a picker for a security audit. Each skill in **Account settings → Skills** shows its group; if a
manifest declares a group this version does not know, the skill is filed under Other and the screen
says which value it declared, so you can fix the frontmatter.

Skills already in your catalog are filed under Other until their `SKILL.md` is next edited. That is
the same edit that gives a skill its group, so adding the `group` line is all it takes: a sync
re-reads a skill when its file changes, and the group arrives with it.

## Queueing review skills on a review task

A [Review task](./pull-requests.md#deep-reviewing-an-existing-pull-request) can carry a queue of
specialist review playbooks: a Performance Review, a Security Review, an Accessibility Review,
whatever your team has written down. Pick them under **Review skills** in the add-task form, in the
order you want them applied, and change the queue afterwards under **Under review** in the task
inspector. Only `review`-group skills are offered, and a review carries at most eight.

At run time the PR Reviewer applies them on top of its standing role, routing each one to the parts
of the diff it bears on rather than to every chunk. This is per-review: the same pipeline serves a
routine change and one that needs a security pass, and you decide which lenses that pull request
earns when you file it.

If a queued skill has since left the catalog (its directory was renamed, or its source was
unlinked), the run FAILS and names it rather than reviewing without it. Open the task, drop that
skill from **Under review** (pick a current one in its place if the lens still applies), and start
the run again.

## Linking a skill source

Skills are managed at the **account** tier, so the synced catalog is shared by every board in the
account. Open **Account settings → Skills** (see
[Opening account settings](./team-and-access.md#opening-account-settings)).

With the GitHub App connected, search for the repo and browse its tree to the skills directory, or
link the whole repository. Without it, enter the owner, repo, and directory path by hand. An optional
git ref defaults to `HEAD`. Click **Link & sync** and each skill directory under it joins the
account's catalog.

The library is on by default and shares the prompt-library switch: turn it off with
[`PROMPT_LIBRARY_ENABLED=false`](../deploy/configuration.md#feature-toggles). When it is off, the
screen shows a "not enabled for this deployment" notice.

## Keeping skills fresh

A source tracks its directory's head commit. When new commits touch that directory, a **Changes**
badge appears; **Check for changes** and **Resync** are on each source row, and **Unlink** (a
confirmed action) removes the skills a source synced. You rarely need to resync by hand:

- A push to a linked repo enqueues a targeted resync of the affected source.
- Before a run, the skill step re-checks the source's head commit and resyncs if it moved, then runs
  against the refreshed instructions. If the check fails (a transient error, a missing installation),
  it falls back to the last synced copy rather than blocking the run.

The worst case is a run executing one push behind, never a failure. Every run records the exact skill
version (commit and sha) it executed.

::: warning Renaming a skill changes its identity
A skill is identified by its source and directory name. Renaming the directory creates a new skill and
retires the old one, so a pipeline step pinned to the old name must be re-pointed. The builder flags
this with "This skill is no longer in the catalog; pick another."
:::

## Running a skill in a pipeline

Add a **Skill** step to a pipeline and pick a skill in the step's picker (one skill per step). A step
with no skill selected blocks the pipeline from saving. At run time the step clones the repo, follows
the skill, and commits whatever it prescribes: it amends the task's pull request when one is already
open, otherwise it branches off the base and opens its own. A skill that is purely advisory and
produces no change is a clean no-op, not a failure.

For an agent author: with the Claude Code harness the skill is installed natively so the CLI
auto-loads it; on other harnesses the instructions go into the prompt and resource files land under
`.cat-context/skill/`. Resource bodies are fetched at dispatch from the skill's pinned commit,
bounded to about 48 KB per file and 200 KB in total; anything larger or binary is referenced by its
repo path instead of inlined.

---

Next: keep agent costs predictable with [Control Spend with Budgets](./budgets.md).
