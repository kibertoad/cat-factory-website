# Members, Roles & Invitations

Cat Factory has real user identities, more than one way to sign in, and email invitations for
bringing teammates into a shared organization. This page covers how people get in, the roles they
hold, and how to invite them.

## Signing in

A deployment can offer any combination of three sign-in providers, each enabled by its operator:

- **GitHub** OAuth. Also the source of repository access: the per-tenant
  [GitHub App](../deploy/github-app.md) installation mints the tokens agents use, so repo access
  never depends on a personal GitHub token.
- **Google** OAuth.
- **Email + password** (hashed with PBKDF2).

A person does not need a GitHub account to use Cat Factory. Because repository access comes from the
GitHub App rather than a user's own token, a Google- or password-only user works fully.

One person is one user. Signing in through different providers that share the same verified email
resolves to the same identity rather than creating duplicates.

## Who can sign up

Creating a *new* user is invite-only by default. A new person gets in one of two ways:

- They redeem an [email invitation](#inviting-teammates).
- Their email domain is on the self-signup allowlist (`AUTH_ALLOWED_EMAIL_DOMAINS`).

This is fail-closed: with no matching invitation and no allowlisted domain, signup is refused.
Existing users just sign in.

## Accounts and roles

An **account** is the top-level owner you work under:

- A **personal account**, one per user, owned by that user.
- An **organization account**, shared by several members.

Members of an account hold one of two roles:

| Role | Can do |
| --- | --- |
| **Owner** | Everything a member can, plus invite and revoke invitations, manage members, and connect the account's email sender. |
| **Member** | See and act on the account's boards. Finer access is governed by per-workspace [membership controls](./core-concepts.md#workspaces-and-accounts). |

Whoever creates an organization account is its first owner.

## Inviting teammates

From the account's team settings, an owner invites a teammate by email and picks the role to grant
(defaults to **member**). Cat Factory mints a single-use, tokened accept link and:

- emails it through the account's [connected email sender](#sending-invitation-emails) when one is
  configured, or
- returns the link for you to share by hand when no sender is connected.

Invitations are deliberately narrow:

- They **expire after 7 days**.
- They are **bound to the invited address**: the accepting user's verified email must match the
  address the invite was sent to, so a leaked link is useless to anyone else.
- Re-inviting the same address **supersedes** any still-pending invite, so only the most recent link
  stays redeemable.
- An owner can **revoke** a pending invitation at any time.

The invitee opens the link, signs in or signs up (the invitation satisfies the invite-only gate),
and joins the organization with the role they were given.

## Sending invitation emails

Email delivery is connected **per account in the UI**, not through environment variables. Like the
[Slack bot token](../deploy/notifications.md), an owner onboards it in settings and the credential is
stored sealed in the database under `ENCRYPTION_KEY`:

1. Pick a provider, **SendGrid** or **Resend**.
2. Paste its API key and set the From address.
3. Send a test email to confirm it works.

Operators turn the feature on at the deployment level with `EMAIL_ENABLED=true` and an `APP_BASE_URL`
(the origin that accept links point at). See
[Configuration → Email](../deploy/configuration.md#email-invitations). Without a connected sender,
invitations still work; the accept link is returned for you to share manually.

## Named boards

Boards carry a **name and description**, set when you create one and editable afterwards. Members of
an organization see and open its existing boards from the switcher instead of being pushed to create
a new one.

---

Next: set the providers and keys this relies on in [Configuration](../deploy/configuration.md#authentication).
