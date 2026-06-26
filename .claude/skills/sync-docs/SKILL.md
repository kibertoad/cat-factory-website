---
name: sync-docs
description: Synchronize this documentation site with the cat-factory code repo. Reads recent commit history from the local cat-factory checkout, finds product changes that affect deployers, operators, and agent/gate authors, updates the guide/deploy/reference docs to describe the current state, and opens a PR. Use when asked to sync docs, update docs from the code, or document recent changes.
---

# Sync documentation with the cat-factory code

This repo (`cat-factory-website`) is the VuePress documentation site for the `cat-factory`
product. The product source lives in a separate local checkout. This skill brings the docs in
line with what the code actually does right now.

## Repositories

- Docs (this repo): `C:\sources\node-new\cat-factory-website`. Markdown under `docs/`.
- Code (read-only here): `C:\sources\node-new\cat-factory2`. Inspect commits and current source.
  If that path is missing, ask the user for the local cat-factory checkout path before continuing.

Never edit the code repo. Only read it.

## Audience

Write for people who **deploy, operate, and use** cat-factory, and for people who **author custom
agents and gates** on top of it. Do not write for people developing cat-factory's own internals.

Concretely, document:

- How to install, configure, and run a deployment (env vars, providers, GitHub App, runner pools,
  environments, observability, notifications).
- How to use the product (boards, requirements, pipelines, pull requests, budgets, model
  providers, prompt fragments, issue sources).
- How to extend it: authoring custom agents and custom gates, the manifest model, the published
  `@cat-factory/*` packages that exist for extension.

Skip changes that only matter to someone hacking on cat-factory's source: internal refactors,
component decomposition, test infrastructure, lockfile/release chores, CI plumbing, and pure code
cleanups. A change is in scope only if it changes what a deployer, operator, user, or
agent/gate author sees or does.

## Voice

Follow the user's global writing rules (no em-dashes, no LLM-tell vocabulary, plain and direct).
Two rules matter most here:

- Describe the **current state in present tense**. The docs are a manual, not a changelog. Never
  write "the system no longer does X, now it does Y" or "this was renamed from". Just describe what
  is true now.
- Be **actionable**. Prefer concrete steps, exact setting names, real example values, and what the
  user clicks or sets, over abstract description.

Match the voice and structure of the surrounding doc you are editing.

## Process

1. **Pick the window.** Default to commits from the last two days. The user may give a different
   window. To avoid redoing covered work, check this repo's recent history for the last sync:
   `git -C C:\sources\node-new\cat-factory-website log --oneline -15`. The previous sync's commit
   message lists what it already covered.

2. **List candidate commits.** In the code repo:
   `git -C C:\sources\node-new\cat-factory2 log --since="2 days ago" --pretty=format:"%h %ad %s" --date=short`.
   Drop `chore: release packages`, `bumps`, merge commits, and anything matching the skip list in
   the Audience section. Keep `feat:`/`fix:` and titled feature commits that touch product
   behavior.

3. **Map each kept commit to doc files** using the table below. Group commits by target doc so each
   file is updated once, coherently, rather than per-commit.

4. **Verify against current code, not commit messages.** For each change, read the actual current
   source in the code repo (UI components, manifests, env handling, package READMEs) to confirm
   how the feature behaves now. Commit titles drift from final behavior. The doc must match the
   code as it stands.

5. **Update or expand the docs.** Edit existing pages in place. Create a new page only when a
   feature has no reasonable home (then add it to nav and both sidebars in
   `docs/.vuepress/config.js`). Keep present tense and current-state framing throughout.

6. **Update navigation if files were added or removed.** `docs/.vuepress/config.js` holds `navbar`
   and `sidebar`. A new page that is not listed there is unreachable.

7. **Build to catch breakage.** `npm run docs:build` from the repo root. Fix broken links or dead
   internal references it reports.

8. **Open a PR.** See PR conventions below. Always finish with a PR; do not push straight to main.

## Feature-area to doc-file map

| Area in the code | Doc file(s) |
| --- | --- |
| Model providers, OpenRouter, proxies vs direct, model presets, model catalog | `docs/guide/model-providers.md`, `docs/deploy/custom-providers.md` |
| Provider config defaults, per-user GitHub PAT, encrypted UI/DB config | `docs/deploy/configuration.md`, `docs/deploy/custom-providers.md` |
| Budgets, spend, price handling | `docs/guide/budgets.md`, `docs/deploy/configuration.md` |
| Integration secrets moved out of env into encrypted config | `docs/deploy/configuration.md` |
| Observability, telemetry store, ephemeral-env/container provisioning telemetry | `docs/deploy/observability.md`, `docs/deploy/configuration.md` |
| Custom agents, manifest model, pre/agent/post-op, generic agent kind | `docs/deploy/custom-agents.md`, `docs/reference/manifests.md` |
| Custom gates, `@cat-factory/gates`, externally extensible gates | `docs/deploy/custom-agents.md`, `docs/reference/packages.md` |
| Published `@cat-factory/*` packages | `docs/reference/packages.md` |
| Requirements review UX, spec writing, business-only specs, task labels | `docs/guide/requirements.md` |
| Prompt fragments, linked best-practice docs (Confluence/Notion/GitHub), context delivery | `docs/guide/prompt-fragments.md` |
| Issue sources, tracker settings, create-from-issue, writeback, per-workspace toggles | `docs/guide/issue-sources.md` |
| Sandbox (prompt/model testing) | `docs/guide/` (its own page if needed) |
| Environments, env adapters, default test environment | `docs/deploy/environments.md` |
| Runner pools, provisioning template vars | `docs/deploy/runner-pools.md` |
| Local mode, container runtimes (Docker/Podman/OrbStack/Colima/Apple container) | `docs/deploy/local.md` |
| Pull requests, merge presets/thresholds | `docs/guide/pull-requests.md` |
| Recurring pipelines, board design, shared services, team/access | matching `docs/guide/*.md` |
| Cloudflare / Node.js / deployment-repository / GitHub App deploy paths | matching `docs/deploy/*.md` |

When a commit does not fit any row, decide from its diff which audience it serves and pick the
closest page, or note it as out of scope.

## PR conventions

- Branch name: `sync-docs-<yyyy-mm-dd>`.
- Commit with a `docs:` prefix summarizing the areas touched, for example:
  `docs: custom gates, provider config, budgets, observability, sandbox`.
- PR body: a short intro line, then a bulleted list of the doc areas updated and the user-facing
  change each reflects. No changelog framing in the docs themselves; the PR body may reference
  the code PR numbers for traceability.
- Use `gh pr create`. Report the PR URL when done.

## Useful commands

```bash
# What the last sync covered
git -C C:\sources\node-new\cat-factory-website log --oneline -15

# Candidate code commits in the window
git -C C:\sources\node-new\cat-factory2 log --since="2 days ago" \
  --pretty=format:"%h %ad %s" --date=short | grep -viE "release packages|^[a-f0-9]+ .* bumps$"

# Inspect one commit's diff
git -C C:\sources\node-new\cat-factory2 show <hash>

# Read current behavior of a feature area
git -C C:\sources\node-new\cat-factory2 log --oneline -- backend/packages/gates

# Build the site
npm run docs:build
```
