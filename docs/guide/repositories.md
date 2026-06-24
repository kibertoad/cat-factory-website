# Repositories

Services on your board map to Git repositories, where agents actually do their work. Cat Factory
connects to GitHub through a GitHub App, which it uses to link, bootstrap, and reconcile
repositories.

## GitHub App integration

Repository, pull request, and issue operations all flow through a GitHub App:

- Repository read/write for cloning and pushing branches.
- Pull request creation and status.
- Issue read for importing requirements.
- Webhooks for push, PR, and issue events, which Cat Factory projects into its local database
  to keep the board in sync.

Repositories are tracked per workspace, with credentials isolated to that workspace.

## Linking an existing repository

Link any repository the GitHub App can access to a service frame. From then on, runs on tasks
under that service clone and open PRs against it.

The quickest path is **Add from existing repo** (sidebar → Repositories). It opens a picker of every
repo the GitHub App can reach (including ones the workspace doesn't track yet) with a
search/filter box (by owner or name, with a "showing X of Y" count) so a wide install of hundreds of
repos stays manageable, plus a link to grant the App access to more. Importing links and syncs the
repo, drops a **ready** service frame named after it, and points the frame at the repo, so tasks you
add under it target that repo, with **no bootstrap run**. Right after adding, the modal shows the
same configuration controls as the service inspector (test infra, the docker-compose path, cloud
provider and instance size, and best-practice [fragments](./prompt-fragments.md)), so you can finish
setting the service up without a second trip to the inspector.

## Bootstrapping a new repository

Cat Factory populates a repository with a reference architecture; it does not, by default, create
the repository itself. The standard flow:

1. Select a reference architecture or scaffold template.
2. Create the target repository, **empty**, on GitHub. The bootstrap dialog links to GitHub's
   new-repo page prefilled for you. Make sure the GitHub App can reach it: install the App on the
   new repo, or install it on all repositories for the account or org.
3. The bootstrap agent force-pushes the template into the empty repository.
4. A service frame appears on the board automatically.

The default GitHub App holds no `Administration` permission, so it cannot create repositories.
Creating the empty repo yourself is the one manual step. An organization can remove it by opting
into the privileged App tier, which creates the repo programmatically; see
[GitHub App → Programmatic repository creation](../deploy/github-app.md#programmatic-repository-creation-optional).

Every new service starts from a consistent, known-good baseline.

## Service blueprints & reconciliation

For existing repositories, the blueprint agent keeps board and code aligned:

1. It decomposes the repository into a `service → modules → features` map.
2. The map is stored in-repo under `blueprints/`.
3. It compares that map against the current board state.
4. It suggests structural updates and additions so the board reflects reality.

The decomposition is **domain-driven**: each module is a **business domain** (a bounded context,
aggregate, or subdomain) named after a business concept, not a technical layer. Shapes like `api`,
`routes`, `controllers`, `utils`, `config`, `types`, and `db` are explicitly *not* domains; the
genuinely cross-cutting plumbing collapses into a single `infrastructure` module rather than
scattering across many technical ones. So the board reflects what the service *does*, not how it is
wired.

This is how an established codebase gets represented on the board without hand-modeling every piece.

Blueprints are the descriptive in-repo artifact ("what the code is"). Their prescriptive
counterpart, "what must be true", is the [spec](./requirements.md#the-unified-in-repo-spec) the
**Spec Writer** keeps under `spec/` in the same repo.

## Monorepos

One repository can back several services. Flag the repository as a **monorepo**, then pin each
service to a **subdirectory** of it. When you add a service from a monorepo, you browse the repo's
tree and pick the directory that service owns.

Agents that edit code run scoped to that subdirectory: the **coder**, **mocker**, and **CI fixer**
work with the service's directory as their working directory, so they stay inside their part of the
repo. Repo-wide agents (**blueprints**, **requirements**, **merger**, and **conflict resolver**)
run at the repository root by design, since their job spans the whole repo.

Repositories that are not flagged as monorepos are unchanged: the service owns the whole repo.

## Keeping in sync via webhooks

Because the GitHub App sends webhooks, changes made directly in GitHub (pushes, PR merges,
issue edits) are projected back into Cat Factory's database, so the board stays current even when
work happens outside the platform.

---

Next: pull requirements straight from your trackers with [Issue Sources](./issue-sources.md).
