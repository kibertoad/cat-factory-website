# GitHub and GitLab Support Matrix

Cat Factory acts on real code through a provider-neutral source-control layer, so a workspace's
repositories can live on **GitHub** or **GitLab**. GitHub is the reference implementation every
engine path is built against; GitLab is an opt-in provider implementing the same interfaces.

This page is for anyone **choosing a provider or running both**. It states what each one can
actually do today, including where GitLab is behind and why.

Both providers can be configured on one deployment at the same time. A workspace's repositories only
need to resolve to the right connection.

## Setting each one up

- **GitHub**: register a GitHub App. See [Register the GitHub App](../deploy/github-app.md).
- **GitLab**: opt-in and off by default. The provider works on every runtime, but the token is named
  per runtime: set `GITLAB_TOKEN` (scope `api`) on Cloudflare and Node, or `GITLAB_PAT` in
  [local mode](../deploy/local.md#gitlab-in-local-mode). `GITLAB_API_BASE` is optional on all three
  and points at a self-managed instance (it defaults to gitlab.com). `GITLAB_CONNECTION_ID` and
  `GITLAB_WEBHOOK_SECRET` (webhook delivery) are optional and apply to Cloudflare and Node. See
  [Configuration → GitLab](../deploy/configuration.md#gitlab-source-control).

Each provider's API base also decides the **web host** the app links repositories, merge and pull
requests, and issues to. A base that names no recognisable host makes the app withhold those links
rather than point at the provider's public instance, where the same namespace path is very likely
somebody else's project.

## Feature parity

| Capability | GitHub | GitLab |
| --- | --- | --- |
| Credential model | App installation: one credential scope per workspace | A single shared token (group, personal, or OAuth PAT) per deployment |
| Multi-tenant credential isolation | Per-installation token | One token for the whole deployment, mirroring local mode's PAT model |
| Self-managed or on-prem instance | Yes (GitHub Enterprise Server, via a configurable API base) | Yes (`GITLAB_API_BASE`, any self-managed instance) |
| Repository and branch reads | Yes | Yes |
| File and directory reads | Yes | Yes |
| Branch, commit, and pull/merge request writes | Yes | Yes |
| Merging a pull/merge request | Yes | Yes |
| Updating a request branch with its target | Server-side branch merge | Via merge-request rebase: GitLab has no branch-merge endpoint |
| CI status | Checks API | Pipelines |
| Requested reviewers and submitted reviews | Yes | Yes, with approvals mapped onto reviews |
| Required approval count | Branch protection | Merge-request approval rule |
| Review threads (resolve and reply) | Yes | Yes, as resolvable discussions |
| Changed files with patches | Pull files API | Merge-request diffs. No per-file line counts, so they are counted off the hunk and reported as unreported (never `0`) where GitLab withheld them |
| Request head branch and head SHA | Yes | Yes |
| Publishing review findings as inline comments | Per comment, with partial success reported | Per-comment diff discussions plus a summary note, same partial-success reporting |
| Issues: read, create, close, comment | Yes | Yes |
| Issue search | Yes | Yes |
| Sub-issues (parent to child) | Yes | No native concept; callers degrade gracefully |
| Issues as a [task source](../guide/issue-sources.md) | Full | Imports, searches, diagnoses, and backs both the recurring bug intake and the bug hunt. Issue type does not narrow the search (GitLab has no "bug" type, so use labels). Push intake and writeback are still open |
| Code search | Yes | No. It needs GitLab Advanced Search, and the basic API cannot supply a usable repository and URL per hit |
| Webhooks: request, issue, push, CI status | HMAC-signed | Token-header verified |
| Webhooks: connection lifecycle (removed or suspended) | Yes | Not mapped: a removed or suspended connection is not pushed live |
| Periodic reconciliation (catches missed webhooks) | Yes | Yes, on the same provider-neutral path |
| Repository provisioning | Two-app tier, with permissions introspected before the create | Single token, optimistic: the capability is discovered by attempting the create |
| Sign-in with a pasted PAT | Yes | Yes |
| Sign-in with an OAuth browser flow | Yes | No, PAT only |
| Sign-in allow-list by login or email domain | Yes | Yes |
| Sign-in allow-list by organization or group | Against organizations | Against group full paths |
| Listing pagination cap | About 1000 items, warns on truncation | About 1000 items, warns on truncation |

## Reading this table before you choose

Three rows decide most deployments:

- **Credential isolation.** On GitHub each workspace gets its own installation scope. On GitLab one
  deployment-wide token serves every workspace, so a multi-tenant GitLab deployment cannot isolate
  one team's repositories from another's at the credential layer.
- **Code search.** Several agent kinds search code to orient themselves. On GitLab those searches
  return nothing rather than failing, so agents fall back on reading the checkout.
- **Connection-lifecycle webhooks.** On GitLab, revoking access is not pushed to the platform. The
  periodic reconciliation still catches it, so the change lands late rather than never.

---

Next: [Register the GitHub App](../deploy/github-app.md) to set up the reference provider, or
[Connect a Repository](../guide/repositories.md) to link one to a board.
