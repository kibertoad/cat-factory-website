# GitHub App

Cat Factory uses a **single GitHub App** for two jobs: signing users in ("Login with GitHub")
and acting on your repositories (cloning, pushing branches, opening pull requests, reading
checks). Both come from the one App you create here.

Cat Factory is self-hosted, so **each deployment registers its own App** pointing at its own
worker host. There is no shared or central App to install.

::: tip Fast path: App Manifest
The backend repo ships a `github-app-manifest.html` helper. Open it in a browser, enter your
worker host, and submit; it pre-fills every permission, event, and URL on GitHub's App-creation
page so you only confirm. You'll still generate the private key and set the secrets yourself
(steps 2–3 below). Prefer the manual walkthrough if you'd rather review each field.
:::

## 1. Create the App

Go to **Settings → Developer settings → GitHub Apps → New GitHub App**, under either a personal
account or an org (both work, and the App can stay **private**, since you can always install a
private App on your own repos).

**Webhook**

- Active: on
- Webhook URL: `https://<your-worker-host>/github/webhooks`
- Webhook secret: a strong random string. This is your **webhook secret**.

**Callback / Setup URLs** (replace `<your-worker-host>` with your backend's public origin)

- Setup URL: `https://<your-worker-host>/github/setup/callback`, with "Redirect on update" on
  (so re-installs hit the callback too).
- OAuth callback URL: `https://<your-worker-host>/auth/callback` (this is what powers login).

**Repository permissions**

| Permission | Level | Why |
| --- | --- | --- |
| Contents | Read & write | Clone, branch, and commit. |
| Pull requests | Read & write | Open the PRs agents deliver. |
| Issues | Read & write | Issue-sourced tasks and tech-debt tickets. |
| Workflows | Read & write | So agents may add or update `.github/workflows/*` (GitHub rejects pushes touching workflow files without this). |
| Checks | Read-only | CI gating. |
| Metadata | Read-only | Mandatory. |
| Commit statuses | Read-only | Optional, alongside checks. |

::: tip No Administration permission
This default App holds no `Administration` permission, so it cannot create or delete repositories.
The "bootstrap repo" feature pushes its first commit into an **empty repo you create first**, so
`Contents: write` is enough, and the App stays away from the broad, delete-capable Administration
permission. To let Cat Factory create the empty repo for you instead, see
[Programmatic repository creation](#programmatic-repository-creation-optional) below.
:::

**Subscribe to events:** `Push`, `Pull request`, `Issues`, `Check run`. (Installation lifecycle
events are delivered automatically.)

After creating the App, note the **App ID** and **App slug** (the name in its URL), generate a
**private key** (this downloads a `.pem`), and note the App's **OAuth client ID and secret** for
login.

## 2. Convert the private key to PKCS#8

GitHub issues a PKCS#1 key (`-----BEGIN RSA PRIVATE KEY-----`); the worker needs PKCS#8
(`-----BEGIN PRIVATE KEY-----`). Convert once:

```bash
openssl pkcs8 -topk8 -nocrypt -in app.private-key.pem -out app.pk8.pem
```

The worker rejects a PKCS#1 key at import time with a message pointing back here.

## 3. Configure the deployment

Set the App ID, slug, private key (the PKCS#8 PEM from step 2), and webhook secret, plus the
OAuth client ID/secret for login and a session secret. The exact variable names and where to put
them (Cloudflare secret bindings vs. a Node.js secret manager) are listed in
[Configuration → Authentication](./configuration.md#authentication).

The GitHub integration only activates when the App ID and both secrets (private key and webhook
secret) are present; otherwise the repository endpoints return `503`. Likewise, login activates
only once the OAuth credentials and session secret are set, and **fails closed** until then, so
production is always authenticated.

## 4. Connect a workspace

With the App configured, install it from inside the app:

1. The frontend hands you an install URL for your workspace.
2. Install the App on the repos (or org) you want agents to work in.
3. GitHub redirects back to the setup callback; the worker binds the installation to your
   workspace and starts a backfill.
4. Verify the workspace shows a connected GitHub account and lists its repos.

You can re-run the install later to add or remove repositories. Cat Factory only ever sees the
repos you grant the installation.

## Programmatic repository creation (optional)

By default, [bootstrapping](../guide/repositories.md#bootstrapping-a-new-repository) populates a
repository you create yourself, because the App above carries no `Administration` permission. An
organization can let Cat Factory create the empty repo for it instead, by running a **second,
privileged App**.

This is a separate App registration, so the restricted App stays minimal for everyone else. Set it
up like the App above, with two differences:

- Add the **Administration: Read & write** repository permission, which is what GitHub requires to
  create a repository.
- When an org installs it, choose **All repositories**, so a just-created repo is immediately in
  scope for the follow-up push.

Configure its credentials alongside the default App's (`GITHUB_PRIVILEGED_APP_ID` and
`GITHUB_PRIVILEGED_APP_PRIVATE_KEY`; see [Configuration](./configuration.md#authentication)). An
org opts in by **installing the privileged App** on its account, directly from the App's page on
GitHub. (The in-app install link always points at the default App, so this one install step happens
on GitHub.) The backend detects which App owns the installation, so nothing else needs to change:
the workspace binds to the privileged App and the bootstrap dialog's "Create repository" button
creates the repo directly.

::: warning Org-only, and a wider grant
Programmatic creation works for **organization** repositories only; a GitHub App can't create a
repo under a personal account, which always uses the manual flow. The privileged App's key can
create and administer repositories, so install it only where you want that capability. If it isn't
configured, or an account can't use it, bootstrapping falls back to the manual create-then-populate
flow with no error.
:::

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `503` from every GitHub endpoint | Integration not configured | Set the App ID and both secrets, then redeploy. |
| Key import error mentioning PKCS#1 | Key is `BEGIN RSA PRIVATE KEY` | Convert with `openssl pkcs8` (step 2). |
| Webhooks return `401` | Wrong webhook secret, or a proxy mutated the request body | Ensure the secret matches the App's and the raw body isn't re-encoded. |
| Setup callback returns `401` | Invalid or expired `state` | Start from the workspace's install URL; don't hand-craft it. |
| Writes fail with 403 / "Resource not accessible by integration" | A repository permission is missing | Grant it on the App, then **accept the permission update** on the installation. |
| Nobody (including you) can sign in | Sign-in allowlist is empty | Set at least one allowed login or org; an enabled-but-empty allowlist locks everyone out by design. |
| "Create repository" still opens GitHub's new-repo page | Privileged App not installed on this org, or its key lacks Administration: write | Install the privileged App on the org with **All repositories**, and confirm both `GITHUB_PRIVILEGED_APP_*` vars are set. Personal accounts always use the manual flow. |

---

Continue to [Configuration](./configuration.md) for the full list of secrets and toggles.
