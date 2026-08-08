# Register Foundational Services

For an organization whose agents keep proposing to rebuild something it already runs. A foundational
service is a shared capability you already have: file storage, notifications, audit, identity.
Register it once and the agents designing work on your board consume it instead.

This is standing platform context, not per-task setup. A board can deliver its whole backlog with an
empty catalog; you fill it once, from whoever knows the estate.

::: tip Where to find it
Open **Foundational services** from the sidebar's workspace-context group, or from the command
palette. It needs the `settings.manage` permission and the
[advanced interface tier](./core-concepts.md#interface-tiers).
:::

## What an agent sees

Two different things, at two different moments:

- **At design time**, the architect step is handed the whole catalog: each service's id, name,
  one-line summary, description, capability tags, and its contracts' formats and operation names
  (`GET /files/{id}`). No document bodies. The architect must end its design with a fenced
  ` ```foundational-services ` block naming the ids the design consumes, or `none`.
- **At implementation time**, the researcher and coder steps receive the full API contract documents
  of exactly the services the design declared, injected as files under
  `.cat-context/foundational-services/`, plus an index naming anything the design asked for that the
  catalog does not contain.

That split is why the catalog is cheap to carry and the contracts are still authoritative when they
matter. An operation list on the catalog is capped at 40 per document, and the count of anything
dropped is stated rather than silently truncated. A contract document longer than 120,000 characters
is cut with an explicit note naming how much is missing.

The rendering distinguishes three states that would otherwise collapse into one. An empty catalog
tells the architect that none are registered and it should design the capability itself. An
unreadable catalog says so, and tells the agent to keep the concern behind a seam and report the
failure. A contract format whose operations cannot be indexed says that too, instead of reading as
"declares no operations".

## Registering a service

On the **Catalog** tab, pick the scope (**This board** or **This account**) and click **Register a
service**:

| Field | Notes |
| --- | --- |
| id | Lower-kebab, for example `file-storage`. This is what an architect writes in its design, and it is fixed once registered. |
| name | Human label, for example "File Storage". |
| summary | One line: what it is for. |
| description | What it does, when to use it, and what it does **not** cover. The "when not to use this" half is the part a design step most needs. |
| capabilities | Free-form comma-separated tags, for example `file-storage, cdn`. |
| API contracts | One or more documents. |

Each contract carries a lower-kebab `contractId`, a title, and the document body. Three formats are
recognised, from the content rather than the extension:

- **OpenAPI 3.x**, as JSON or YAML. Operations are indexed.
- **`@toad-contracts/core`** modules. Operations are read statically from the
  `defineApiContract({ method, pathResolver })` calls; anything the reader cannot resolve with
  certainty is reported as omitted rather than guessed at.
- **`@lokalise/api-contract`** modules. Stored and served in full, operations not indexed.

Saving replaces the whole stored contract set with what is listed. Leave the contracts section
untouched to keep what is stored.

A registration is validated as a **set**, not per document, so the schema modules a contract module
imports can be registered as what they are. At least one document in a set declared as a TypeScript
contract format must actually reference that library. A document declared as OpenAPI is parsed, and a
file that is not valid OpenAPI 3.x is refused at registration rather than producing a service whose
catalog entry lists zero operations while looking perfectly registered.

### Reserved capability tags

Capability tags are free-form, with two exceptions the platform reads:

| Tag | Meaning |
| --- | --- |
| `asset-storage` | Required for a service to be selectable as a [binary-output step's](./choosing-a-pipeline.md#binary-output-steps) storage target. Enforced at run admission. |
| `generation-context` | Conventional, not enforced. Marks a service that can scope a generation by answering "what entities exist, which lack an asset, how is each described". A picker orders by it. |

A near-miss of either (`asset_storage`, `Asset-Storage`, `assetstorage`) is refused at registration.
The platform matches the exact spelling, so a quiet acceptance would surface hours later as a refused
run.

## Linking a repository

Most orgs already describe their services in a repository. On the **Repo sources** tab, link one and
the catalog syncs from it. Three modes decide when the file set is settled:

| Mode | Shape |
| --- | --- |
| **A folder of services** | Every subdirectory of the linked path is one service, described by a `service.md` with its contract files beside it. |
| **Whole folder of contracts, one service** | Every contract file in the linked folder describes the one service you name. Optionally include subfolders. Files added upstream are picked up on the next sync. |
| **Specific files, one service** | The listed paths all describe the one service you name. Use this when there is no folder convention to adopt. |

The difference that matters is discovery. A files link pins the paths, so a contract added upstream
stays invisible until somebody edits the link. A folder link re-discovers the set on every sync.

The folder walk is bounded and breadth-first over name-sorted listings, so it is deterministic across
syncs. Package, lockfile, and compiler manifests are never contract candidates, and a file over the
1 MiB read ceiling is declined unread. Each skipped file is named in the sync log with its reason,
and the toast reports how many looked like contracts but could not be used. Contract ids come from
the path relative to the folder root, so `v1/users.yaml` and `v2/users.yaml` cannot collapse onto one
id.

A root `service.md` in folder mode supplies the description and capability tags only, never the
identity.

Linking a repo requires the source-control integration to be connected on a board. Use **Check for
changes** to see whether the source moved, **Resync** to pull, and **Unlink** to drop the source and
the services it synced. A service synced from a repo shows its path and is read-only in the app; the
next sync overwrites edits made there.

A push webhook fans out to the linked sources, so a contract change lands in the catalog within
seconds rather than waiting for a sweep.

## Tiers and opting out

The catalog merges three tiers, each overriding the one below it by service id:

| Tier | Where it comes from |
| --- | --- |
| **Deployment** | Registered in code by the deployment. See [Set Up Your Deployment Repository](../deploy/deployment-repository.md#_5-register-your-platform-data-in-code). |
| **Account** | Registered in the app at account scope. Inherited by every board under the account. |
| **Board** | Registered in the app on one board. |

A board that should not be offered an inherited service uses **Do not offer this service on this
board** rather than deleting it. Deleting removes the board's own registration and its documents;
opting out destroys nothing and is reversible from **Opted out on this board**, where **Offer again**
restores it. An account can opt out of a deployment-tier service the same way, hiding it from every
board under that account.

An opt-out that shadows nothing right now says so, so you can tell a live suppression from a leftover
one.

Deleting a board's own registration for an id the account also registers stops the board inheriting
the account's version too. That is undoable from the same opt-out list.

## When the catalog is unavailable

On a deployment where the catalog cannot be read, agents are told that explicitly rather than being
handed an empty list. An outage produces ignorance about the estate, not evidence that the estate is
empty, and an architect that acted on the second would build a capability the org already runs. The
guidance in that case is to keep storage, notification, audit, and auth concerns behind a seam and to
state the failure in the run's report.

---

Next: see how a design's declared services reach a run's outputs in
[Run a Pipeline](./running-pipelines.md), or register your estate in code from a
[deployment repository](../deploy/deployment-repository.md).
