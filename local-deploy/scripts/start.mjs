// Boot cat-factory locally in no-auth dev mode for documentation screenshots.
//
// Orchestrates three things and streams their logs under one process:
//   1. Postgres        via `docker compose -p catfactory-docs up -d postgres`
//   2. the backend     the cat-factory checkout's deploy/local entry, run as a plain
//                      Node process against THIS directory's .env (port 8787)
//   3. the frontend    the cat-factory checkout's deploy/frontend Nuxt dev server (port 3000)
//
// The cat-factory source lives in a SEPARATE checkout (it holds the @cat-factory/*
// workspace packages this deployment consumes). Point at it with CAT_FACTORY_DIR;
// it defaults to ../cat-factory next to this docs repo.
//
// Usage:
//   node scripts/start.mjs                 # db + backend + frontend, stream logs
//   node scripts/start.mjs --no-frontend   # db + backend only (API screenshots / probing)
//   node scripts/start.mjs --build         # rebuild @cat-factory/local-server first
//   CAT_FACTORY_DIR=/path/to/cat-factory node scripts/start.mjs
//
// Ctrl+C stops the backend and frontend. Postgres keeps running (stop it with
// `node scripts/stop.mjs` or `docker compose -p catfactory-docs down`).

import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'

const here = dirname(fileURLToPath(import.meta.url))
const deployDir = resolve(here, '..')
const repoRoot = resolve(deployDir, '..')
const catFactoryDir = process.env.CAT_FACTORY_DIR
  ? resolve(process.env.CAT_FACTORY_DIR)
  : resolve(repoRoot, '..', 'cat-factory')

const args = new Set(process.argv.slice(2))
const withFrontend = !args.has('--no-frontend')
const doBuild = args.has('--build')

const COMPOSE_PROJECT = 'catfactory-docs'
const isWin = process.platform === 'win32'
const npx = isWin ? 'npx.cmd' : 'npx'
const pnpm = isWin ? 'pnpm.cmd' : 'pnpm'

function log(tag, msg) {
  process.stdout.write(`[${tag}] ${msg}\n`)
}

function fail(msg) {
  process.stderr.write(`\n[start] ERROR: ${msg}\n`)
  process.exit(1)
}

// --- preflight -------------------------------------------------------------------
if (!existsSync(catFactoryDir)) {
  fail(
    `cat-factory checkout not found at ${catFactoryDir}.\n` +
      `Set CAT_FACTORY_DIR to your local cat-factory clone.`,
  )
}
const backendEntry = resolve(catFactoryDir, 'deploy/local/src/main.ts')
const frontendDir = resolve(catFactoryDir, 'deploy/frontend')
if (!existsSync(backendEntry)) fail(`backend entry missing: ${backendEntry}`)
if (withFrontend && !existsSync(frontendDir)) fail(`frontend dir missing: ${frontendDir}`)

// --- .env: create from example + fill secrets on first run -----------------------
const envPath = resolve(deployDir, '.env')
const envExamplePath = resolve(deployDir, '.env.example')
if (!existsSync(envPath)) {
  log('start', '.env not found — generating from .env.example with fresh dev secrets')
  let contents = readFileSync(envExamplePath, 'utf8')
  contents = contents
    .replace(/^AUTH_SESSION_SECRET=.*$/m, `AUTH_SESSION_SECRET=${randomBytes(32).toString('hex')}`)
    .replace(/^ENCRYPTION_KEY=.*$/m, `ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`)
  writeFileSync(envPath, contents)
}

// --- resolve ports ---------------------------------------------------------------
// Backend port comes from .env (PORT=). Frontend port is FRONTEND_PORT or 3000. Both
// can be moved off the cat-factory defaults (8787/3000) to run alongside another local
// deployment — the frontend is told the backend's URL via NUXT_PUBLIC_API_BASE.
const envText = readFileSync(envPath, 'utf8')
const backendPort = Number((envText.match(/^PORT=(\d+)/m) || [])[1] || 8787)
const frontendPort = Number(process.env.FRONTEND_PORT || 3000)
const apiBase = `http://localhost:${backendPort}`

// --- Postgres --------------------------------------------------------------------
log('db', `starting Postgres (compose project ${COMPOSE_PROJECT}) on :5433`)
const up = spawnSync(
  'docker',
  ['compose', '-p', COMPOSE_PROJECT, 'up', '-d', 'postgres'],
  { cwd: deployDir, stdio: 'inherit' },
)
if (up.status !== 0) fail('failed to start Postgres via docker compose')

function tryConnect(port, host) {
  return new Promise((res) => {
    const s = net.connect({ port, host }, () => {
      s.destroy()
      res(true)
    })
    s.on('error', () => res(false))
    s.setTimeout(1500, () => {
      s.destroy()
      res(false)
    })
  })
}

// Try both loopback families: Postgres binds IPv4 (127.0.0.1) and Nuxt dev binds IPv6
// (::1) on Windows, so a single host would miss one of them.
async function waitForPort(port, label, timeoutMs = 90_000) {
  const start = Date.now()
  for (;;) {
    if ((await tryConnect(port, '127.0.0.1')) || (await tryConnect(port, '::1'))) return true
    if (Date.now() - start > timeoutMs) fail(`timed out waiting for ${label} on :${port}`)
    await new Promise((r) => setTimeout(r, 1000))
  }
}

log('db', 'waiting for Postgres to accept connections...')
await waitForPort(5433, 'Postgres')
log('db', 'Postgres is up')

// --- optional build --------------------------------------------------------------
if (doBuild) {
  // Build the whole workspace: the frontend layer consumes the built dist of many
  // @cat-factory/* packages (contracts, etc.), so a stale dist makes the SPA fail to
  // boot with "does not provide an export named ...". build:all is turbo-cached.
  log('build', 'building the cat-factory workspace (pnpm build:all)')
  const b = spawnSync(pnpm, ['run', 'build:all'], {
    cwd: catFactoryDir,
    stdio: 'inherit',
    shell: isWin,
  })
  if (b.status !== 0) fail('workspace build failed')
}

// --- child processes -------------------------------------------------------------
const children = []
function prefix(tag, stream, sink) {
  let buf = ''
  stream.on('data', (chunk) => {
    buf += chunk.toString()
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) sink.write(`[${tag}] ${line}\n`)
  })
}

function launch(tag, cmd, cmdArgs, opts) {
  // On Windows, pnpm/npx are .cmd shims that Node cannot spawn without a shell.
  const useShell = isWin && /\.cmd$/i.test(cmd)
  const child = spawn(cmd, cmdArgs, { ...opts, shell: useShell, stdio: ['ignore', 'pipe', 'pipe'] })
  prefix(tag, child.stdout, process.stdout)
  prefix(tag, child.stderr, process.stderr)
  child.on('exit', (code) => log('start', `${tag} exited with code ${code}`))
  children.push(child)
  return child
}

// Backend: run deploy/local's entry directly with OUR env file so we never touch the
// cat-factory checkout's own .env. Node 24 strips the TypeScript at runtime.
log('backend', `booting cat-factory local server on :${backendPort} (from ${catFactoryDir})`)
launch('backend', process.execPath, [`--env-file=${envPath}`, backendEntry], {
  cwd: resolve(catFactoryDir, 'deploy/local'),
  env: process.env,
})

if (withFrontend) {
  log('frontend', `booting Nuxt dev server on :${frontendPort} (API base ${apiBase})`)
  launch('frontend', pnpm, ['dev', '--port', String(frontendPort)], {
    cwd: frontendDir,
    env: { ...process.env, NUXT_PUBLIC_API_BASE: apiBase, NUXT_PORT: String(frontendPort) },
  })
}

// --- readiness banner ------------------------------------------------------------
;(async () => {
  await waitForPort(backendPort, 'backend API')
  log('start', `backend API ready at ${apiBase} (health: ${apiBase}/health)`)
  if (withFrontend) {
    await waitForPort(frontendPort, 'frontend')
    log('start', `frontend ready at http://localhost:${frontendPort}`)
    log('start', `Board UI: http://localhost:${frontendPort}  —  auth gate is dev-open`)
  }
})()

// --- shutdown --------------------------------------------------------------------
let shuttingDown = false
function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  log('start', 'shutting down backend/frontend (Postgres stays up)')
  for (const c of children) {
    try {
      c.kill('SIGTERM')
    } catch {}
  }
  setTimeout(() => process.exit(0), 1500)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
