# Set Up Your Deployment Repository

Cat Factory ships as **reusable libraries on npm** (plus a runner image on GHCR and Docker Hub). You don't fork
it. Instead, you assemble a small **deployment repository** of thin packages that depend on the published
libraries and carry only your configuration: environment, secrets, a `Dockerfile`, and any
[custom providers](../extend/custom-providers.md) you wire in.

This page walks through standing one up from scratch, the layout that keeps upgrades to a
dependency bump, and the local development loop.

::: tip Why a wrapper instead of a fork
A thin layer over the published packages means upgrading Cat Factory is `pnpm up`. All of your code
lives in your repository; none of the platform does.
:::

## What you're assembling

A deployment repository is a small **pnpm workspace** with one package per thing you deploy. A
typical self-hosted setup has three:

| Package | Depends on | What it is |
| --- | --- | --- |
| `deploy/backend` | `@cat-factory/node-server` | The HTTP service (PostgreSQL + job queue). Calls `start()`. |
| `deploy/local` | `@cat-factory/local-server` | The same backend wired for one machine. Calls `startLocal()`. |
| `deploy/frontend` | `@cat-factory/app` | A Nuxt app that `extends` the SPA layer. |

You rarely need all three: pick the runtime you deploy (`backend` **or** the Cloudflare worker),
keep `local` for development, and add `frontend` if you serve your own board UI. If you write a
[custom provider](../extend/custom-providers.md), it lives here too, as a `packages/*` workspace package the
deploy packages depend on.

```
your-deployment/
├── pnpm-workspace.yaml
├── package.json
├── packages/
│   └── my-provider/          # optional: a custom environment provider / runner pool
└── deploy/
    ├── backend/              # @cat-factory/node-server  → start()
    ├── local/                # @cat-factory/local-server → startLocal()
    └── frontend/             # @cat-factory/app (Nuxt layer)
```

## 1. Scaffold the workspace

Start from the `deploy/*` example directories in the
[source repo](https://github.com/kibertoad/cat-factory) (under `deploy/`), or create the workspace
by hand. The root `pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  - 'deploy/*'
```

Root `package.json` (note `packageManager` and a Node 24+ engine, since the deploy entries run
TypeScript directly via Node's native type stripping, so there's no build step for them):

```json
{
  "name": "your-deployment",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "packageManager": "pnpm@11.7.0"
}
```

## 2. Depend on the published libraries

Each deploy package depends on exactly one Cat Factory runtime library, pinned to a published
version (**not** `workspace:*`, which only works inside the source monorepo):

```jsonc
// deploy/backend/package.json
{
  "name": "@your-org/deploy-backend",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node --env-file-if-exists=.env src/main.ts",
    "dev": "node --watch --env-file-if-exists=.env src/main.ts"
  },
  "dependencies": {
    "@cat-factory/node-server": "^0.7.2"
  }
}
```

::: tip Tracking upstream
Pin a caret range and upgrade with `pnpm up "@cat-factory/*"`. The platform validates feature
parity across runtimes with a conformance suite, so a minor bump is safe. If you use a
[`minimumReleaseAge`](https://pnpm.io/settings#minimumreleaseage) policy, exempt the scope you
trust: `minimumReleaseAgeExclude: ['@cat-factory/*']`.
:::

## 3. Write the entry points

Each entry is a few lines: it calls the library's start function and lets configuration come from
the environment. The library connects to the database, runs the schema migration, boots the job
queue and durable execution worker, and serves the shared HTTP API.

```ts
// deploy/backend/src/main.ts
import { start } from '@cat-factory/node-server'

start().catch((err: unknown) => {
  console.error('failed to start cat-factory backend:', err)
  process.exit(1)
})
```

```ts
// deploy/local/src/main.ts
import { startLocal } from '@cat-factory/local-server'

startLocal().catch((err: unknown) => {
  console.error('failed to start cat-factory local server:', err)
  process.exit(1)
})
```

```ts
// deploy/frontend/nuxt.config.ts
export default defineNuxtConfig({
  extends: ['@cat-factory/app'],
  app: { head: { title: 'Your Org Agent Board' } },
})
```

When you're ready to inject a [custom provider](../extend/custom-providers.md), these are the exact files
where it plugs in. Both `start()` and `startLocal()` take an options object for that, and nothing
else changes.

## 4. Configure

Configuration is entirely environment-driven; copy the example file and fill it in. `DATABASE_URL`
is the only variable required to boot a Node service.

```bash
cp .env.example .env
# edit DATABASE_URL, auth secrets, model keys, …
```

The full set of variables is documented in [Configuration](./configuration.md). The auth gate
**fails closed**: set real OAuth/session secrets for a shared deployment, or `AUTH_DEV_OPEN=true`
(non-production only) while developing.

## 5. Register your platform data in code

Beyond [custom agents and gates](../extend/custom-agents.md), a deployment declares parts of its own estate
programmatically, so a fresh workspace is useful from its first request with no manual setup step.
Each of these follows the same shape: build a registry, register on it, pass it to the start
function.

```ts
// deploy/backend/src/main.ts
import {
  start,
  defaultFoundationalServiceRegistry,
  defaultTaskTypeRegistry,
  defaultPipelineRegistry,
  defaultInitiativePresetRegistry,
  defaultBinaryGeneratorRegistry,
} from '@cat-factory/node-server'

const foundationalServiceRegistry = defaultFoundationalServiceRegistry()
foundationalServiceRegistry.register({
  id: 'file-storage',
  name: 'File Storage',
  summary: 'Durable object storage with signed read URLs',
  description: 'Use for user uploads and generated assets. Does NOT do image transforms.',
  capabilities: ['asset-storage'],
  contracts: [
    { contractId: 'openapi', format: 'openapi', title: 'HTTP API', body: fileStorageOpenApi },
  ],
})

await start({ foundationalServiceRegistry })
```

| Registry | What it declares |
| --- | --- |
| `defaultAgentKindRegistry()` | [Custom agent kinds](../extend/custom-agents.md), their traits, bundled skills, and MCP tool servers. |
| `defaultGateRegistry()` (from `@cat-factory/kernel`) | [Custom gates](../extend/custom-gates.md). Install the built-in polling gates onto it with `registerBuiltinGates()` from [`@cat-factory/gates`](../reference/packages.md). |
| `defaultPipelineRegistry()` | Predefined pipelines. |
| `defaultTaskTypeRegistry()` | Namespaced [custom task types](../extend/frontend-extensions.md#custom-task-types). |
| `defaultInitiativePresetRegistry()` | [Initiative presets](../extend/initiative-presets.md). |
| `defaultFoundationalServiceRegistry()` | [Foundational services](../guide/foundational-services.md), resolved as the `builtin` tier of every workspace's catalog. |
| `defaultBinaryGeneratorRegistry()` | [Generative binary integrations](../guide/choosing-a-pipeline.md#binary-output-steps) a `binary-output` step can select. |

::: warning Registration is validated at boot
A malformed contract document, an unknown `helperKind`, or a `defaultPipelineId` that resolves to
nothing fails the deployment at startup rather than a dispatch months later. That guarantee is the
reason to register in code.
:::

Two options seed **stored** rows rather than adding a tier, because they describe infrastructure a
workspace then owns and edits:

```ts
await start({
  // A service's provision type resolves an infra handler with no manual
  // Infrastructure → Test environments step.
  seedEnvironmentHandlers: [{ provisionType: 'k8s', manifestId: 'acme-eks' }],
  // The stacks a provisioned environment composes on top of.
  seedSharedStacks: [{ name: 'shared-postgres', layers: [{ source: { kind: 'inline', body: composeYaml } }] }],
})
```

Both are idempotent and fault-tolerant per seed: they run at boot across every existing workspace as
a best-effort backfill, and again whenever a workspace is created. A compose layer is a bare in-repo
path, an inline document, or a file in another repository, so a stack that lives outside the repo
being provisioned still composes.

::: tip Extending the Cloudflare Worker
The Worker entry has the same seam. Export `createWorker(options)` from your entry module instead of
re-exporting the default handler, and pass the same registries. The default handler is built lazily,
so a deployment that exports its own never pays to build a second app.

```ts
// deploy/backend/src/index.ts
import { createWorker, defaultFoundationalServiceRegistry } from '@cat-factory/worker'

export default createWorker({ overrides: { foundationalServiceRegistry } })
export {
  ExecutionWorkflow, GitHubBackfillWorkflow, BootstrapWorkflow, EnvConfigRepairWorkflow,
  EnvironmentTestWorkflow, ExecutionContainer, DeployContainer, WorkspaceEventsHub,
} from '@cat-factory/worker'
```
:::

## 6. The local development loop

For day-to-day work, run the `local` package. It's the same backend wired for one machine (agent
jobs as local containers, GitHub via a PAT). See [Run Locally](./local.md) for the full setup.

```bash
pnpm install
docker compose -f deploy/local/docker-compose.yml up -d   # PostgreSQL
pnpm --filter @your-org/deploy-local start                 # migrate + serve on :8787
```

If your repository also contains a custom-provider package, build it first (the deploy entries run
TypeScript directly, but a `packages/*` library should be compiled to `dist/`):

```bash
pnpm --filter @your-org/my-provider build
```

Wire that into a `prestart` script so it's automatic:

```jsonc
// deploy/local/package.json
"scripts": {
  "prestart": "pnpm --filter @your-org/my-provider build",
  "start": "node --env-file-if-exists=.env src/main.ts"
}
```

## 7. Containerize for production

The `backend` package is a normal Node service. A minimal image installs the workspace, builds any
local packages, prunes to production dependencies, and runs the entry directly:

```dockerfile
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm -r --filter './packages/*' build \
  && pnpm install --prod --frozen-lockfile --offline --ignore-scripts \
  && pnpm store prune
WORKDIR /app/deploy/backend
EXPOSE 8787
CMD ["node", "--env-file-if-exists=.env", "src/main.ts"]
```

Build from the repository root so the whole workspace is in the build context.

## Gotchas

- **Don't use `workspace:*` for the Cat Factory packages.** That protocol only resolves inside the
  source monorepo. In your repository, pin published versions (`^0.7.2`). Use `workspace:*` only for
  *your own* `packages/*` (e.g. a custom provider).
- **Sibling TypeScript imports need the real extension.** Node's type stripping does **not** remap
  `./foo.js` to `./foo.ts`. If an entry imports a sibling source file, import it as `./foo.ts` and
  set `"allowImportingTsExtensions": true` in that package's `tsconfig.json` (it's `noEmit`), or
  keep entries to a single file.
- **Build local packages before running.** The deploy entries run `.ts` directly, but a
  `packages/*` library is consumed from its compiled `dist/`. A `prestart`/`predev` hook that builds
  it avoids "module has no exports" surprises.
- **The two runtimes share a config contract.** `deploy/local` is `deploy/backend` with a few
  defaults flipped; the same `.env` variables apply. Don't maintain two divergent configs.
- **Keep entries thin.** Everything that isn't configuration or a wired-in provider belongs upstream.
  The thinner the wrapper, the cheaper the upgrade.

---

Next: teach a deployment to talk to infrastructure you own with
[Add a Custom Provider](../extend/custom-providers.md), or set your secrets and toggles in
[Configuration](./configuration.md).
