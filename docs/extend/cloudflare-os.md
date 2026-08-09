# Cloudflare OS Gatekeeper

Cat Factory can be installed into a [Cloudflare OS](https://github.com/cloudflare/cloudflare-os)
workspace as a **Gatekeeper**: a small Worker you deploy, which holds the API key and hands
workspace agents an object whose methods are exactly what your policy granted.

The agents never see a credential. They hold a capability, and every call it makes passes through
your workspace's own approval queue before anything is read or written.

It is a consumer of the [public API](./public-api.md), not a separate product. Nothing about your
Cat Factory deployment changes, and a deployment that never heard of Cloudflare OS is unaffected.

## What you get

- **Credential custody.** One provisioning key lives as a Worker secret. The Gatekeeper mints a
  per-account key from it, keeps it, and forwards calls on it. Revoking the provisioning key
  revokes every key it minted, which is the kill switch.
- **Per-person attribution.** Each workspace user gets their own account and their own key, stamped
  with that account's identity, so a run traces back to who started it and
  [role-scoped merge policy](./public-api.md) stays real.
- **Approvals in both directions.** Your workspace governs every call an agent makes, and the runs
  that park on a human decision surface in the workspace as cards an approver can answer.
- **A typed session.** The agent gets a `.d.ts` describing exactly the operations its tier carries,
  generated from the same spec the deployment validates against.

## How it fits together

```
Cloudflare OS workspace                    Your Gatekeeper Worker          Your deployment
  agent ── session ──────────────────────▶  granted operations  ── key ──▶  /api/v1
    │                                         │
    └─ approval queue ◀── every call ─────────┘
  inbox ◀── approval cards ◀── webhook ◀────── parked runs
```

One Gatekeeper serves **one Cat Factory workspace**, because the provisioning key it holds is scoped
to one. A second workspace takes a second Gatekeeper deployment, which is also what keeps the two
workspaces' credentials in separate secret stores.

## Setting one up

### 1. Copy the template

The Worker is two pieces: machinery you install, and a policy you write.

| Piece | What it is |
| --- | --- |
| `@cat-factory/gatekeeper-worker` | The machinery. Installed from npm, upgraded with a version bump. |
| [`deploy/gatekeeper`](https://github.com/kibertoad/cat-factory/tree/main/deploy/gatekeeper) | The template you copy: your policy, your bindings, and three lines of wiring. |

Copy the template directory into your own deployment repository.

### 2. Set the bindings

Three vars go in `wrangler.toml`, and three secrets go in the secret store and **never** in a file:

```sh
wrangler secret put PROVISIONING_KEY   # an `admin` Cat Factory API key
wrangler secret put WEBHOOK_SECRET     # signs every delivery from your deployment
wrangler secret put OS_SHARED_TOKEN    # the bearer for the HTTP routes
```

`GET /health` checks the whole configuration in one pass and names everything that is unset, so you
wire the deployment once rather than one redeploy at a time.

### 3. Write the policy

`src/policy.config.ts` is the file you own. It declares tiers, and each tier names the key scope its
calls are made at plus the operations it grants:

```ts
export const POLICY: GatekeeperPolicy = {
  // The tier a caller named on the HTTP capability endpoint gets when no grant matches.
  defaultTier: null,

  // The tier a Cloudflare OS account gets. Naming one here is what turns discovery ON.
  autoProvisionedTier: 'workspace',

  tiers: {
    workspace: {
      description: 'File and run work, and watch it.',
      keyScope: 'write',
      allow: ['services_list', 'tasks_create', 'tasks_start', 'tasks_get_run'],
    },
  },

  grants: {},
}
```

Two rules are worth knowing before you write one:

- **A tier cannot grant above the key backing it.** The policy is compiled against the live
  operation table, and a tier that allows an operation its `keyScope` could not call is refused at
  startup rather than serving a method that fails on every call.
- **`autoProvisionedTier` is deliberately separate from `defaultTier`.** A Cloudflare OS workspace
  mints one account per user with no identity attached, by design, so no account can ever match a
  `grants` entry. Sharing one knob would mean that turning discovery on also handed a capability to
  every unrostered caller on the HTTP endpoint. To raise one account above the tier, read its id
  from the account's description in the workspace and add that id to `grants`.

### 4. Deploy and bind

Deploy the Worker, then add a service binding to it from your Cloudflare OS deployment, named with
the `GATEKEEPER_` prefix the workspace scans for:

```toml
[[services]]
binding = "GATEKEEPER_CAT_FACTORY"
service = "cat-factory-gatekeeper"
entrypoint = "GatekeeperVendor"
```

Holding the binding **is** the authorization on this path. It is configuration only your workspace's
operator can write, and the call never leaves Cloudflare's network, so there is no shared token in
front of it.

## What an agent can do

A session carries the operations its tier granted, plus a few that are always there:

| Method | What it answers |
| --- | --- |
| `tier()` | Who this session acts as, and the tier it resolved to. |
| `bindings()` | Every operation it carries, with the scope floor and consequence of each. |
| `withheld()` | Every operation it does **not** carry, and why. |
| `approvals_list()` | The cards your deployment has raised and this Gatekeeper still holds open. |
| `approvals_inspect(cardId)` | What that run is actually parked on now, and which verbs this tier can use. |
| `approvals_answer(cardId, input)` | Answer a park. |
| `runs_watched()` | Every run the Gatekeeper has been pushed lifecycle events for. |

An operation the policy did not grant is **absent**, not a method that refuses, so a mistake in the
policy is a missing method rather than a call that fails at your deployment.

`withheld()` separates four reasons, because they need different fixes: `not_in_policy` and
`denied_by_policy` are your operator's decision, `above_key_scope` needs a higher tier, and
`not_relayable` means the result is an event stream or raw bytes that a session call cannot carry at
all (fetch those over the [public API](./public-api.md) directly).

## How calls are governed

Every call goes through the approval queue your workspace supplies:

- **Reads are authorized before the result is handed back.** The description names the operation,
  the account, the tier and the arguments. Reads that serve captured agent text (model prompts and
  replies, tool arguments, search terms) are additionally marked as not shareable onward.
- **Writes are submitted and wait.** Nothing is performed until your workspace approves the action.
  A rejection means the call throws and the write never happened; a redelivered approval is refused
  rather than performed twice.
- **Actions ask the agent to stop.** This Gatekeeper does not simulate effects, so there is no
  provisional result to hand back while a person decides.

Two things it deliberately will not do:

- **It cannot revert.** A started run is stopped from the board; a merged pull request is reverted in
  the repository. Every action says so up front, so the workspace does not offer an undo that would
  not work.
- **It offers nothing for unattended auto-approval.** The public API annotates a consequence only
  where the stakes are real money or a merged pull request, so every other write is unannotated, and
  an unannotated write is read as destructive. If that ever changes, the catalog fills in on its own.

Sharing a bound resource with another workspace user is **refused**. The contract asks a Gatekeeper
to verify that a new viewer could already have read everything read through it, and this one cannot
answer that. Give the other person their own account instead: their tier is then resolved from your
own policy.

## Without Cloudflare OS

The same Worker serves a Cap'n Web capability endpoint at `/rpc`, behind the `OS_SHARED_TOKEN`
bearer, for any agent runtime that speaks it. The policy, the key minting, the approvals inbox and
the withheld reasons are all the same; what that door does not have is the workspace's approval
queue, so the tier policy is the whole of the governance there.

## See also

- [Public API](./public-api.md) for scopes, keys and the operations themselves
- [Official SDKs](./sdks.md) if you want to call Cat Factory directly rather than through a workspace
- [MCP Server](./mcp-server.md) for reaching the same operations from an MCP host
