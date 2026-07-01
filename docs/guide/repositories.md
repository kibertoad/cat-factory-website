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

### Your personal GitHub token

You can optionally connect your own GitHub personal access token under **Integrations → Source
control → My GitHub token** (a classic `ghp_…` token with `repo` and `workflow` scopes). Cat Factory
validates it against GitHub and shows who it authenticated as. Once set, **runs you initiate prefer
your token** over the deployment's GitHub App for pushing the work branch and reading the CI and
merge state, so the resulting commits and PR are attributed to you. The token is stored per-user and
write-only (never shown again); leave it unset and runs fall back to the workspace's GitHub App as
before.

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

## Repository types

When you add a service from a repo or bootstrap a new one, you pick a **repository type** that shapes
which pipelines and infrastructure apply to it:

| Type | For | Behaviour |
| --- | --- | --- |
| **Service** | A backend service (the default). | Full pipelines, ephemeral environments, and the Tester's infra. |
| **Frontend** | A UI app. | Backend links and a UI-test flow (see below). |
| **Library** | A published package. | Build, test, and merge, with no deploy step, no ephemeral environment, and no Tester infra. |
| **Document** | A docs repo. | Only `spike` and `document` tasks, and the document pipelines. Non-doc tasks are refused, and a task dragged into a doc frame is re-typed. |

The type is stamped on the service frame when it is created. A **frontend** frame carries a build,
serve, and test config, plus **backend bindings**: you map a frontend env var (e.g.
`VITE_BACKEND_URL`) to a backend service's live preview URL or a WireMock stub. A binding to another
service draws a **board link** (a cyan edge) between the two frames, so the board shows which backend
a frontend is wired to.

## Service blueprints & reconciliation

For existing repositories, the blueprint agent keeps board and code aligned:

1. It decomposes the repository into a `service → modules → features` map.
2. The map is stored in-repo under `blueprints/`.
3. It compares that map against the current board state.
4. It suggests structural updates and additions so the board reflects reality.

The decomposition is **domain-driven**: each module is a **business domain** (a bounded context,
aggregate, or subdomain) named after a business concept. Shapes like `api`,
`routes`, `controllers`, `utils`, `config`, `types`, and `db` are explicitly *not* domains; the
genuinely cross-cutting plumbing collapses into a single `infrastructure` module rather than
scattering across many technical ones. So the board reflects what the service *does*.

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

## GitLab (experimental)

Cat Factory is growing a provider-neutral VCS layer so repositories can live on hosts other than
GitHub. A GitLab backend (`@cat-factory/gitlab`) is the first additional provider. It implements the
neutral VCS client over the GitLab REST v4 API (repository, branch, merge-request, issue, and CI
reads and writes), a webhook verifier and mapper (merge request, issue, push, and pipeline hooks),
and project provisioning.

In [local mode](../deploy/local.md#gitlab-in-local-mode) GitLab is a first-class backend: set a
`GITLAB_PAT` and a GitLab repo clones, pushes, gates on CI, and merges through a real merge request,
and you can sign in with the same token. The VCS flow reaches feature parity with GitHub, including
squash merge, rebase, mergeability, and human review (merge-request approvals and resolvable
discussion threads). GitLab is a source-control backend only; it is not offered as an issue source.

::: warning Cloud deployments are still GitHub-only
On the hosted Cloudflare and Node deployments the live flow (linking, bootstrapping, running
pipelines) routes through the GitHub App; there is no GitLab option in that UI yet. GitLab as a
source-control backend is wired in local mode today, with the cloud path to follow.
:::

---

Next: pull requirements straight from your trackers with [Issue Sources](./issue-sources.md).
