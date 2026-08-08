# Run a Claude Skill as a Step

For a team with a procedure it wants run the same way every time. A **Claude Skill** is a procedural
playbook your team authors in a repository and runs against a task as a pipeline step. Where [prompt fragments](./prompt-fragments.md) are passive guidance folded into
every code-aware agent, a skill is an executable step you pick per pipeline: it clones the repo, does
what the playbook prescribes, and commits the result.

## Authoring a skill

A skill is a directory holding a `SKILL.md` plus any supporting files. `SKILL.md` has YAML
frontmatter (`name` and `description`) and a Markdown body of instructions. Alongside it you can keep
resource files the instructions reference: templates, checklists, scripts. The conventional home is
`.claude/skills/<skill>/` in the repo, but a source can point at any directory. The whole directory is
the sync unit, not just the `SKILL.md`.

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
