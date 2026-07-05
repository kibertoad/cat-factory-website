// Stop the docs-repo Postgres container. The backend/frontend are child processes of
// start.mjs, so they stop when you Ctrl+C that; this just tears down the database.
//
//   node scripts/stop.mjs            # stop + remove the container (keeps the volume)
//   node scripts/stop.mjs --volumes  # also delete the data volume (fresh DB next time)

import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const deployDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dropVolumes = process.argv.slice(2).includes('--volumes')

const composeArgs = ['compose', '-p', 'catfactory-docs', 'down']
if (dropVolumes) composeArgs.push('--volumes')

const r = spawnSync('docker', composeArgs, { cwd: deployDir, stdio: 'inherit' })
process.exit(r.status ?? 0)
