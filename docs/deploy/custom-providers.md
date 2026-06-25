# Custom Providers (Code Adapters)

For most deployments you connect infrastructure you own (a preview-environment platform or a
runner scheduler) with a declarative [manifest](../reference/manifests.md), and a single generic
adapter drives it over HTTP. No code.

Sometimes the manifest isn't enough: your platform speaks a protocol that doesn't map cleanly onto
request/response templates, needs multi-step orchestration per operation, talks gRPC or a vendor
SDK, or derives values (a URL, a status) from a response shape too dynamic for dot-paths. For those
cases the backend exposes the same ports the built-in adapters implement as **code seams**, so you
can ship your own adapter inside your [deployment repository](./deployment-repository.md) without
forking the platform.

This page shows how to implement and wire a custom **environment provider** and a custom **runner
pool**, with a realistic (vendor-neutral) example for each, and the gotchas that bite.

::: tip Reach for the manifest first
A code adapter is more to own and maintain. If your platform can be driven over plain HTTP, the
[manifest path](../reference/manifests.md) is the supported default for almost every deployment.
Use code when the manifest genuinely can't express the integration.
:::

## The two ports

| Port | Package | Methods | Backed by, by default |
| --- | --- | --- | --- |
| **`EnvironmentProvider`** | `@cat-factory/kernel` | `provision`, `status`, `teardown` | the manifest-driven HTTP environment adapter |
| **`RunnerPoolProvider`** | `@cat-factory/kernel` | `dispatch`, `poll`, `release` | the manifest-driven HTTP runner adapter |

You implement the port as a class, then inject it when you build the container. Your implementation
**replaces** the default adapter for that capability; everything else (the deployer/tester agents,
the durable execution worker, the TTL sweeper) is unchanged.

## How configuration reaches your adapter

A code adapter is a **deployment-wide singleton**: one instance serves every workspace. So it must
not bake in per-workspace settings. Two channels carry configuration:

1. **Deployment-wide defaults**, read once from the environment when you construct the adapter
   (base URL fallback, a service-account identity, timeouts).
2. **Per-workspace settings**, which arrive on **every call** as the connection `manifest`. Each workspace
   registers a connection (the same registration the manifest path uses), and your adapter reads:
   - `manifest.baseUrl`, your platform's API root for that workspace;
   - `resolveSecret(key)`, the per-workspace credential, decrypted in memory only at call time and
     never logged;
   - `manifest.providerConfig`, an **opaque key/value bag** for native-adapter settings the generic
     manifest has no field for (a project name, a target service, status overrides, and so on).

::: tip `providerConfig` is your structured config slot
The manifest models the generic HTTP adapter (URL, templates, auth, response mapping). Anything a
native adapter needs beyond that goes in `providerConfig`: validate and read it yourself; the HTTP
adapter ignores it. This is what lets one deployment serve many workspaces with different projects
or targets. See [Integration Manifests](../reference/manifests.md#per-workspace-config-for-code-adapters).
:::

A small helper that overlays the manifest onto the env defaults keeps each method clean:

```ts
import type { EnvironmentManifest, SecretResolver } from '@cat-factory/kernel'

interface Defaults {
  baseUrl?: string
  secretKey: string        // which connection secret holds the token
  timeoutMs: number
}

interface Effective {
  baseUrl: string
  token: string
  project?: string
  statusOverrides: Record<string, string>
}

function resolve(defaults: Defaults, manifest: EnvironmentManifest, resolveSecret: SecretResolver): Effective {
  const pc = (manifest.providerConfig ?? {}) as Record<string, unknown>
  const baseUrl = manifest.baseUrl?.trim() || defaults.baseUrl
  if (!baseUrl) throw new Error('preview platform: no base URL on the connection or in env')

  const token = resolveSecret(defaults.secretKey)
  if (!token) throw new Error(`preview platform: no secret '${defaults.secretKey}' on the connection`)

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    token,
    project: typeof pc.project === 'string' ? pc.project : undefined,
    statusOverrides: (pc.statusMap as Record<string, string>) ?? {},
  }
}
```

## Example: a custom environment provider

Say your org runs an internal **Preview Platform** with a REST API the generic manifest can't quite
model: creation is asynchronous, the live URL lives in a `endpoints[]` array you must filter by
health, and its status vocabulary is its own.

Imagine its API as:

| Call | Returns |
| --- | --- |
| `POST /v1/previews` `{ ref, repo, ttl_seconds }` | `202 { id, state: "queued" }` |
| `GET /v1/previews/{id}` | `{ id, state, endpoints: [{ name, url, healthy }] }` |
| `DELETE /v1/previews/{id}` | `204` (or `404` if already gone) |

…where `state` is one of `queued | booting | running | degraded | terminated | error`.

### Implement the port

```ts
import type {
  EnvironmentProvider,
  EnvironmentStatus,
  ProvisionEnvironmentRequest,
  EnvironmentStatusRequest,
  EnvironmentTeardownRequest,
  ProvisionedEnvironment,
} from '@cat-factory/kernel'

// Map the platform's vocabulary onto Cat Factory's lifecycle states. The set of incoming
// values is closed and small, so enumerate it and treat anything unexpected as a failure
// rather than silently looping in "provisioning".
const STATE_MAP: Record<string, EnvironmentStatus> = {
  queued: 'provisioning',
  booting: 'provisioning',
  running: 'ready',
  degraded: 'ready',        // reachable; let the tester decide
  terminated: 'torn_down',
  error: 'failed',
}

export class PreviewPlatformProvider implements EnvironmentProvider {
  constructor(private readonly defaults: Defaults, private readonly fetchImpl: typeof fetch = fetch) {}

  async provision(req: ProvisionEnvironmentRequest): Promise<ProvisionedEnvironment> {
    const cfg = resolve(this.defaults, req.manifest, req.resolveSecret)
    const ctx = req.provisionContext

    // Build the ref from the typed context (PR number preferred, else branch). `inputs`
    // carries the same values as strings if you'd rather template them.
    const ref = ctx?.pullNumber != null ? `pr/${ctx.pullNumber}` : ctx?.branch
    if (!ref) throw new Error('preview platform: no git ref to provision from')

    const res = await this.call(cfg, 'POST', '/v1/previews', {
      ref,
      repo: ctx?.repoName,
      ttl_seconds: ttlSeconds(req.manifest),
    })

    // Creation is async: no URL yet. Report `provisioning`; the URL appears on a later poll.
    return this.toHandle(cfg, res, 'provisioning')
  }

  async status(req: EnvironmentStatusRequest): Promise<ProvisionedEnvironment> {
    const id = req.externalId ?? req.provisionFields.externalId
    if (!id) {
      return { externalId: null, url: req.provisionFields.url ?? null, status: 'provisioning', expiresAt: null, access: null, fields: req.provisionFields }
    }
    const cfg = resolve(this.defaults, req.manifest, req.resolveSecret)
    const res = await this.call(cfg, 'GET', `/v1/previews/${encodeURIComponent(id)}`)
    if (res === null) {
      // 404 after provision: the platform no longer knows this env, so treat as gone.
      return { externalId: id, url: null, status: 'torn_down', expiresAt: null, access: null, fields: req.provisionFields }
    }
    return this.toHandle(cfg, res, 'provisioning')
  }

  async teardown(req: EnvironmentTeardownRequest): Promise<{ status: EnvironmentStatus }> {
    const id = req.externalId ?? req.provisionFields.externalId
    if (id) {
      const cfg = resolve(this.defaults, req.manifest, req.resolveSecret)
      // Idempotent: deleting an already-gone env is success, not an error.
      await this.call(cfg, 'DELETE', `/v1/previews/${encodeURIComponent(id)}`)
    }
    return { status: 'torn_down' }
  }

  // --- helpers -------------------------------------------------------------

  private toHandle(cfg: Effective, body: any, fallback: EnvironmentStatus): ProvisionedEnvironment {
    const externalId: string | null = body.id ?? null
    const status = STATE_MAP[(cfg.statusOverrides[body.state] ?? body.state)] ?? fallback
    // Pull the live URL out of the endpoints array, preferring a healthy one.
    const endpoints: Array<{ url?: string; healthy?: boolean }> = body.endpoints ?? []
    const url = (endpoints.find((e) => e.healthy)?.url ?? endpoints[0]?.url) ?? null
    const fields: Record<string, string> = {}
    if (externalId) fields.externalId = externalId
    if (url) fields.url = url
    return { externalId, url, status, expiresAt: null, access: null, fields }
  }

  private async call(cfg: Effective, method: string, path: string, body?: unknown) {
    const res = await this.fetchImpl(`${cfg.baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json', accept: 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.defaults.timeoutMs),
    })
    if (res.status === 404) return null            // caller decides what a 404 means
    if (!res.ok) throw new Error(`preview platform ${method} ${path} → ${res.status}`)
    if (res.status === 204) return {}
    return res.json()
  }
}

function ttlSeconds(manifest: EnvironmentManifest): number | undefined {
  return manifest.defaultTtlMs ? Math.floor(manifest.defaultTtlMs / 1000) : undefined
}
```

### The lifecycle contract

| Method | When it's called | Return |
| --- | --- | --- |
| `provision` | The **deployer** agent, once. | A handle. Async platforms return `provisioning`; the URL can be null here. |
| `status` | Polled until the env is `ready` (or fails / times out). | The current handle. Map your platform's status; surface the URL once it exists. |
| `teardown` | On run completion or TTL expiry. | `{ status: 'torn_down' }`. Must be idempotent. |

`provisionContext` gives you typed git/PR/repo facts (`branch`, `pullNumber`, `repoOwner`,
`repoName`, `pullUrl`), and the same values are mirrored into `inputs` as strings. `fields` you return
from `provision` are persisted and handed back to `status`/`teardown` as `provisionFields`, so stash
anything you need to re-address the environment (its id, a region, a sub-resource).

### Wire it in

In your [deployment repository](./deployment-repository.md), inject the provider when you build the
container. Both runtimes take it through a one-line seam:

```ts
// deploy/backend/src/main.ts  (Node service)
import { start, buildNodeContainer } from '@cat-factory/node-server'
import { PreviewPlatformProvider } from '@your-org/preview-provider'

const environmentProvider = new PreviewPlatformProvider({
  baseUrl: process.env.PREVIEW_BASE_URL,
  secretKey: 'preview_token',
  timeoutMs: 15_000,
})

start({
  buildContainer: (opts) => buildNodeContainer({ ...opts, environmentProvider }),
}).catch((err) => { console.error(err); process.exit(1) })
```

```ts
// deploy/local/src/main.ts  (local mode)
import { startLocal } from '@cat-factory/local-server'
import { PreviewPlatformProvider } from '@your-org/preview-provider'

startLocal({
  environmentProvider: new PreviewPlatformProvider({ secretKey: 'preview_token', timeoutMs: 15_000 }),
}).catch((err) => { console.error(err); process.exit(1) })
```

`startLocal({ environmentProvider })` keeps all of local mode's boot behaviour (container-runtime
preflight, orphan reaping, PAT/auth warnings) and just threads your provider through, so the local
entry stays a one-liner.

The environments module still needs to be enabled (`ENVIRONMENTS_ENABLED=true` + an encryption key)
and each workspace registers a **connection**. That connection is what holds the sealed token and
the `providerConfig`. That requirement is intentional.

## Example: a custom runner pool

The runner port is the same idea for *where coding jobs run*. The platform dispatches a job, polls
it to completion, and (optionally) releases it; your adapter maps your scheduler onto that.

Implement `RunnerPoolProvider`:

```ts
import type {
  RunnerPoolProvider,
  RunnerDispatchRequest,
  RunnerPollRequest,
  RunnerJobView,
} from '@cat-factory/kernel'

const STATE: Record<string, RunnerJobView['state']> = {
  queued: 'running',
  running: 'running',
  succeeded: 'done',
  failed: 'failed',
}

export class SchedulerRunnerPool implements RunnerPoolProvider {
  constructor(private readonly defaults: Defaults, private readonly fetchImpl: typeof fetch = fetch) {}

  // Start (or re-attach to) the job. MUST be idempotent per jobId: a replayed dispatch
  // must not launch a duplicate. Key your scheduler on req.jobId.
  async dispatch(req: RunnerDispatchRequest): Promise<void> {
    const cfg = resolve(this.defaults, req.manifest, req.resolveSecret)
    await this.call(cfg, 'PUT', `/jobs/${encodeURIComponent(req.jobId)}`, { payload: req.spec })
  }

  // Read current state, mapped onto the canonical view. Carry the work product (PR URL,
  // branch, summary) through on completion so the platform can open the pull request.
  async poll(req: RunnerPollRequest): Promise<RunnerJobView> {
    const cfg = resolve(this.defaults, req.manifest, req.resolveSecret)
    const job = await this.call(cfg, 'GET', `/jobs/${encodeURIComponent(req.jobId)}`)
    const state = STATE[job.state] ?? 'running'
    return {
      state,
      ...(state === 'done' ? { result: { prUrl: job.pr_url, branch: job.branch, summary: job.summary } } : {}),
      ...(state === 'failed' ? { error: job.error ?? 'job failed' } : {}),
    }
  }

  // Best-effort, idempotent: release a finished job's resources. A no-op is fine.
  async release(req: RunnerPollRequest): Promise<void> {
    const cfg = resolve(this.defaults, req.manifest, req.resolveSecret)
    await this.call(cfg, 'DELETE', `/jobs/${encodeURIComponent(req.jobId)}`)
  }

  private async call(cfg: Effective, method: string, path: string, body?: unknown) { /* as above */ }
}
```

What your scheduler runs is **not** your concern to define: every job is the standard
**executor-harness** container image (the same payload Cloudflare Containers run). Your scheduler
pulls that image, runs it, and exposes its job lifecycle; the harness does the coding, the Git
operations, and produces the branch the platform opens a PR from. The job `spec` you receive in
`dispatch` is opaque: forward it to the harness verbatim.

A custom runner pool is wired through the Node runtime's runner-transport seam (the same one the
manifest adapter uses), keyed per workspace from the registered connection. Because that plumbing is
more involved than the environment seam, see `backend/docs/runner-pool-integration.md` in the source
repo for the exact wiring, and prefer the [manifest path](./runner-pools.md#custom-adapters) unless
your scheduler truly can't be driven over HTTP.

## Testing your adapter

Inject `fetch`, and your adapter is a pure unit under test, with no network and no platform:

```ts
import { describe, it, expect } from 'vitest'

it('reports ready and the healthy URL on a status poll', async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ id: 'p1', state: 'running', endpoints: [{ url: 'https://p1.preview.test', healthy: true }] }), { status: 200 })
  const provider = new PreviewPlatformProvider({ secretKey: 'preview_token', timeoutMs: 5000 }, fetchImpl as typeof fetch)

  const handle = await provider.status({
    manifest: { baseUrl: 'https://preview.test', providerConfig: {} } as any,
    externalId: 'p1',
    provisionFields: { externalId: 'p1' },
    resolveSecret: (k) => (k === 'preview_token' ? 'secret' : undefined),
  })

  expect(handle.status).toBe('ready')
  expect(handle.url).toBe('https://p1.preview.test')
})
```

Cover the mapping seams explicitly: every status value (including an unexpected one), the URL
selection, a 404 on `status`/`teardown`, and a missing token.

## Gotchas

These are the ones that actually bite when adapting a real platform:

- **Enumerate the status vocabulary; don't guess.** Map the platform's *complete, real* set of
  states onto the lifecycle. Treat an unknown value as `failed`: an unknown
  status usually means the contract changed, and silently waiting hides it. Confirm the exhaustive
  list with the platform's owners rather than inferring it from a few observed responses.
- **The live URL is often not where you'd expect.** Generic "links" or "outputs" maps are frequently
  user-authored, may contain un-rendered templates, or aren't the app endpoint at all. Find the
  field that carries the *real, reachable* URL and prefer a healthy one. Make `providerConfig` choose
  it (which service/endpoint) so different workspaces can differ.
- **Provision is usually async; return `provisioning`.** Don't synthesize a URL at
  create time; let `status` surface it once the platform reports the env up. Claiming `ready` early
  sends the tester at a URL that isn't live yet.
- **Make `teardown` idempotent.** The TTL sweeper calls it, and the platform tombstones the local
  record **even if your call returns 404**. Treat "already gone" as success so a double teardown or a
  race never throws.
- **TTL ownership can surprise you.** If the platform applies its own auto-expiry, the value it
  honours may not be the one you sent (some clamp or override it). Cat Factory owns teardown of what
  it created; treat the platform's expiry as a backstop and don't rely on a TTL you can't verify
  round-trips.
- **Watch the platform's input constraints.** Many "create" APIs accept exactly one of a set of
  fields (a PR number *or* a branch *or* a commit), and reject more than one, or silently rewrite
  one into another. Send the single most specific ref you have, and persist the *returned* id, not
  the one you sent, in `fields`.
- **Resolve secrets per call; never construct-time, never logged.** The token arrives via
  `resolveSecret` on each call (it's decrypted in memory only then). Don't cache it on the instance,
  don't put it in error messages, and bound your error bodies so a hostile response can't dump into
  logs.
- **Authentication is a question to confirm.** Confirm the scheme (bearer vs. a custom
  header vs. a signed request) and whether the token is scoped. A token with blanket access is a
  finding worth raising with the platform's owners.
- **Set timeouts and treat the adapter as untrusted I/O.** Use `AbortSignal.timeout`, cap response
  sizes, and if any URL is operator-supplied, guard against SSRF (validate the host, don't follow
  redirects blindly).

---

This is the deepest extension seam Cat Factory exposes. For the declarative alternative most
deployments use, see [Runner Pools](./runner-pools.md) and [Ephemeral Environments](./environments.md);
for where this code lives, see [Your Deployment Repository](./deployment-repository.md).
