# Set Up Enterprise SSO

For the operator standing a deployment up for an organization, who needs people to sign in through
the company's own identity provider rather than through a consumer login. Cat Factory ships **one
generic OpenID Connect adapter**: Okta, Microsoft Entra ID, Auth0, Keycloak, PingFederate,
OneLogin, JumpCloud, Google Workspace and a Shibboleth IdP running the OIDC OP plugin are all
OpenID Connect providers, so a discovery document plus a client id and secret is the whole
configuration for any of them. A provider not named here works too, as long as it publishes a
discovery document: there is no per-vendor list to be on.

SSO sits alongside the three consumer sign-in methods (GitHub OAuth, Google OAuth,
email/password) described on [Configuration](./configuration.md#authentication). All four resolve
to one canonical user, so a person keeps the same identity in Cat Factory however they signed in.

::: tip Why SSO rather than an allowlist
The consumer logins gate on a list an operator maintains here: named GitHub logins, allowed email
domains. SSO gates on **who your directory assigns the application to**, which makes onboarding
and, the one that matters, offboarding a directory action instead of an edit to a list in a
deployment's environment.
:::

## 1. Register an application with your provider

Register a **web / confidential** application (one that can hold a client secret) with the
redirect URI:

```
<your-backend-origin>/auth/sso/callback
```

Release the `openid`, `profile` and `email` scopes. If you plan to gate on directory groups, also
release whichever claim your provider carries them in.

Issuer URLs by provider, for reference:

| Provider | Issuer URL |
| --- | --- |
| Okta | `https://<org>.okta.com/oauth2/default` |
| Microsoft Entra ID | `https://login.microsoftonline.com/<tenant-id>/v2.0` |
| Auth0 | `https://<tenant>.eu.auth0.com` |
| Keycloak | `https://<host>/realms/<realm>` |
| Google Workspace | `https://accounts.google.com` |
| Shibboleth IdP with the OIDC OP plugin | `https://<idp-host>` |

## 2. Configure the deployment

| Variable | Purpose | Default |
| --- | --- | --- |
| `AUTH_SSO_ISSUER_URL` | The provider's issuer URL. The `/.well-known/openid-configuration` suffix is optional. | unset (SSO off) |
| `AUTH_SSO_CLIENT_ID` | The application's client id. | unset |
| `AUTH_SSO_CLIENT_SECRET` | The application's client secret. | unset |
| `AUTH_SSO_LABEL` | Sign-in button label, for example `Acme SSO`. | `Single sign-on` |
| `AUTH_SSO_SCOPES` | Space-separated scopes (`openid` is added when absent). | `openid profile email` |
| `AUTH_SSO_REDIRECT_URL` | Override `redirect_uri` when the public URL differs from the request origin. | `<origin>/auth/sso/callback` |
| `AUTH_SSO_ALLOWED_EMAIL_DOMAINS` | Optional narrowing: only these verified email domains may sign in. | none (the directory is the gate) |
| `AUTH_SSO_GROUPS_CLAIM` | The claim carrying group memberships. | `groups` |
| `AUTH_SSO_REQUIRED_GROUPS` | Optional narrowing: the user must be in at least one of these groups. | none |

`AUTH_SESSION_SECRET` is required as well, as it is for every sign-in method: SSO decides *who*
signs in, and the session it mints is the same signed bearer token every other login mints.

### Four combinations refuse to boot

Each lands on the misconfiguration screen naming the variable and its remedy, rather than resolving
to a deployment that looks configured and is not:

1. **A partial set.** Any of the three required variables set without the others. Disabling quietly
   would leave an operator who believes SSO is live on the consumer logins they adopted SSO to
   replace.
2. **A non-https issuer** on a non-loopback host, because the authorization code and the ID token
   would cross the network in clear. Plain `http` is accepted for `localhost`, `127.0.0.0/8` and
   `::1`, so a Keycloak or Dex container on a developer's own machine works.
3. **A weak `AUTH_SESSION_SECRET`.** A brute-forceable secret makes the identity provider's
   guarantees irrelevant.
4. **`AUTH_DEV_OPEN` or `TESTING_NO_AUTH` alongside SSO.** Those hatches serve every protected
   route anonymously. A deployment that configured SSO to satisfy a security review must not carry
   a variable combination that reopens the API, and an operator cannot be relied on to notice they
   set both, so the pair is refused rather than one silently winning.

## 3. Check the sign-in

The login screen shows an SSO button as soon as the provider is live, labelled with
`AUTH_SSO_LABEL`. The round trip is the standard authorization-code flow with PKCE: the browser
goes to your provider, your provider authenticates the person, and the callback hands the app the
same session token every other login mints.

A refusal comes back to the login screen as a message rather than as raw JSON, and the reasons are
distinct on purpose, because the remedies differ: a missing directory group is the user's to take
to IT, while a failed code exchange is the operator's own configuration.

## Who is allowed in

SSO is the one sign-in method that **admits by default**, and that is the feature rather than an
oversight. Who may sign in is expressed by which people the application is assigned to in your
directory. Contrast the GitHub path, which fails closed with both its allowlists empty, because
there nothing else expresses who is allowed.

Two optional narrowings exist for organizations whose directory serves a wider population than
should reach this deployment. They are checked in this order:

1. **`AUTH_SSO_REQUIRED_GROUPS`**: the user must be in at least one named group, read from
   `AUTH_SSO_GROUPS_CLAIM`. The list is comma-separated, so **a group name may contain spaces**
   (`Domain Admins,Platform Engineering`): an array claim's entries are taken whole, and only a
   bare space-separated string value is split.
2. **`AUTH_SSO_ALLOWED_EMAIL_DOMAINS`**: the user's **verified** email domain must be listed. A
   configured domain gate with no email released is **refused**, not admitted: admitting would
   silently void a rule you wrote, and releasing the claim is the fix.

Group memberships are read on **every** sign-in, so removing someone from a group blocks their next
login. It also cuts the sessions they are already holding, which is what makes "we disabled them in
the identity provider and they lost access" true rather than eventually true.

That revocation is deliberately narrower than the refusal. A session is cut only when a claim the
provider **did** release positively excludes the person: groups arrived and none match, or a
verified email arrived on a domain that is not allowed. When the claim the rule needed simply never
arrived, the login is still refused, but no sessions are cut. A user removed from every group, a
dropped scope, a renamed claim and a provider that stopped marking emails verified all look
identical from here, and treating a configuration regression as an offboarding would force-sign-out
the whole deployment on the release where a scope goes missing, including the admin who has to fix
it.

## Why SSO is configured in the environment, not in the UI

Every other integration Cat Factory talks to (trackers, document sources, model providers, runner
pools, email senders) is onboarded in the UI and stored sealed in the database. SSO deliberately is
not:

- **It is the deployment's trust root, not tenant configuration.** Whoever can edit the SSO provider
  can point it at an identity provider they control and then sign in as anybody. A UI-editable
  identity provider turns "workspace admin" into a path to every account on the deployment.
- **The bootstrap is circular.** SSO gates who reaches the UI at all, so configuring it from inside
  the UI needs a second, already-working login to exist first, which is exactly the consumer login
  an organization adopting SSO wants gone.
- **The refusals above are boot-time.** "SSO and dev-open cannot both be on" belongs where the
  process starts, not on a form submission that could leave a running deployment in the refused
  state.

The trade is real: rotating a client secret means a configuration change and a restart rather than
a form.

## Not yet covered

A **SAML-2.0-only** provider: a classic Shibboleth IdP without the OIDC OP plugin, or an
organization that has standardised on SAML. Every provider that speaks OpenID Connect is served by
the one adapter here, and SAML is a different protocol rather than a variation on this one.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| The deployment will not boot after adding SSO | One of the four refusals above | Read the misconfiguration screen: it names the variable and the remedy. |
| No SSO button on the login screen | The three required variables are not all set | A partial set refuses to boot, so a running deployment with no button has none of them set. |
| Everyone is refused right after a provider change | A required claim stopped arriving (a dropped scope, a renamed groups claim) | Compare `AUTH_SSO_GROUPS_CLAIM` against what your provider now releases. Existing sessions are intact, so an admin can still sign in on another method if one is configured. |
| Sign-in works but the person lands with no access to any board | Authentication succeeded; workspace membership is separate | Invite them, or check their role: see [Invite and Manage Your Team](../guide/team-and-access.md). |
| The callback fails with a redirect-URI mismatch | The provider's registered URI does not match the origin the backend sees | Set `AUTH_SSO_REDIRECT_URL` explicitly when the public URL differs from the request origin. |

---

Next: [Configuration](./configuration.md#authentication) for the other sign-in methods and the rest
of what a deployment sets, or [Invite and Manage Your Team](../guide/team-and-access.md) for what
happens after someone signs in.
