# Repositories

Services on your board map to Git repositories, where agents actually do their work. Cat-Factory
connects to GitHub through a GitHub App, which it uses to link, bootstrap, and reconcile
repositories.

## GitHub App integration

Repository, pull request, and issue operations all flow through a GitHub App:

- Repository read/write for cloning and pushing branches.
- Pull request creation and status.
- Issue read for importing requirements.
- Webhooks for push, PR, and issue events, which Cat-Factory projects into its local database
  to keep the board in sync.

Repositories are tracked per workspace, with credentials isolated to that workspace.

## Linking an existing repository

Link any repository the GitHub App can access to a service frame. From then on, runs on tasks
under that service clone and open PRs against it.

## Bootstrapping a new repository

Starting fresh? Let Cat-Factory scaffold the repo for you:

1. Select a reference architecture or scaffold template.
2. Cat-Factory creates an empty repository in GitHub via the App.
3. The bootstrap agent force-pushes the template into the repository.
4. A service frame appears on the board automatically.

Every new service starts from a consistent, known-good baseline.

## Service blueprints & reconciliation

For existing repositories, the blueprint agent keeps board and code aligned:

1. It decomposes the repository structure into a `service → modules → features` map.
2. The map is stored in-repo under `blueprints/`.
3. It compares that map against the current board state.
4. It suggests structural updates and additions so the board reflects reality.

This is how an established codebase gets represented on the board without hand-modeling every piece.

Blueprints are the descriptive in-repo artifact ("what the code is"). Their prescriptive
counterpart, "what must be true", is the [requirements](./requirements.md#the-unified-in-repo-requirements-document)
document the **Requirements Writer** keeps under `requirements/` in the same repo.

## Keeping in sync via webhooks

Because the GitHub App sends webhooks, changes made directly in GitHub (pushes, PR merges,
issue edits) are projected back into Cat-Factory's database, so the board stays current even when
work happens outside the platform.

---

Next: pull requirements straight from your trackers with [Issue Sources](./issue-sources.md).
