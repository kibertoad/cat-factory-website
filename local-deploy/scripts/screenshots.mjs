// Capture documentation screenshots from the running local deployment.
//
// Prereqs: the deployment is up (node scripts/start.mjs) and Chromium is installed
// (pnpm run screenshots:install). Then:  node scripts/screenshots.mjs
//
// It signs into the dev-open board with a throwaway account (creating it on first run),
// then walks the UI capturing a fixed set of screens into
// docs/.vuepress/public/images/app/. Each capture is independent: one failing screen
// does not abort the rest. Env overrides: BASE (frontend URL), SHOT_DIR (output dir).

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
const BASE = process.env.BASE || 'http://localhost:3001'
const SHOT_DIR = process.env.SHOT_DIR || resolve(repoRoot, 'docs/.vuepress/public/images/app')
const EMAIL = 'docs@example.com'
const PASS = 'CatFactoryDocs123!'

mkdirSync(SHOT_DIR, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()

async function hideDevtools() {
  await page
    .evaluate(() => {
      document.querySelector('#nuxt-devtools-anchor')?.remove()
      document.querySelector('#nuxt-devtools-container')?.remove()
    })
    .catch(() => {})
}

async function shot(name) {
  await page.waitForTimeout(600)
  await hideDevtools()
  const path = resolve(SHOT_DIR, `${name}.png`)
  await page.screenshot({ path })
  console.log('captured', name)
}

async function closeOverlays() {
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(400)
}

async function openButton(name) {
  // Target the actual sidebar button by exact accessible name (so the uppercase section
  // headers like "INTEGRATIONS" don't match), and force past any transient toast overlay.
  await page.getByRole('button', { name, exact: true }).first().click({ timeout: 8000, force: true })
  await page.waitForTimeout(1400)
}

async function loggedIn() {
  return (
    (await page.getByText('Your board is empty').count()) > 0 ||
    (await page.getByText('Untitled board').count()) > 0
  )
}

// 1. Sign-in screen (before authenticating)
console.log('opening', BASE)
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(1500)
await shot('sign-in')

// Authenticate (log in; sign up on first ever run)
await page.getByPlaceholder('Email').fill(EMAIL)
await page.getByPlaceholder('Password').fill(PASS)
await page.getByRole('button', { name: 'Sign in', exact: true }).click()
await page.waitForTimeout(4000)
if (!(await loggedIn())) {
  await page.getByRole('button', { name: 'Sign up' }).click().catch(() => {})
  await page.waitForTimeout(500)
  const name = page.getByPlaceholder('Name', { exact: false })
  if (await name.count()) await name.first().fill('Docs Demo')
  await page.getByPlaceholder('Email').fill(EMAIL)
  await page.getByPlaceholder('Password').fill(PASS)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForTimeout(5000)
}

// 2. The AI-model onboarding modal (auto-opens on first login when no model is set)
try {
  if ((await page.getByText('Set up an AI model provider').count()) > 0) {
    await shot('model-provider-setup')
  }
} catch (e) {
  console.log('skip model-provider-setup:', e.message)
}

// 3. The board itself (empty state + onboarding banners)
await closeOverlays()
try {
  await shot('board-empty')
} catch (e) {
  console.log('skip board-empty:', e.message)
}

// Each remaining capture: open from the sidebar, shoot, close.
// Sidebar entries that open a self-contained panel/modal on an empty board. ("Build a
// pipeline" needs a service on the board first, so it has no standalone empty-state screen.)
const panels = [
  { name: 'bootstrap-repo', text: 'Bootstrap repo' },
  { name: 'model-configuration', text: 'Model configuration' },
  { name: 'integrations', text: 'Integrations' },
  { name: 'infrastructure', text: 'Infrastructure' },
  { name: 'workspace-settings', text: 'Workspace settings' },
  // The workspace-wide prompt/context fragment library.
  { name: 'context-fragments', text: 'Context fragments' },
  // Account & team: members, roles, invitations. Shown once accounts are enabled.
  { name: 'account-team', text: 'Account settings' },
  // The Sandbox (prompt/model bench). Renders a disabled empty state unless a sandbox
  // DB is wired, so review the shot before using it.
  { name: 'sandbox', text: 'Sandbox' },
]

for (const p of panels) {
  try {
    await closeOverlays()
    await openButton(p.text)
    await shot(p.name)
  } catch (e) {
    console.log(`skip ${p.name}:`, e.message)
  }
}

// 4. Command palette (Ctrl/Cmd+K)
try {
  await closeOverlays()
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(1000)
  if ((await page.getByPlaceholder('Search', { exact: false }).count()) > 0) {
    await shot('command-palette')
  }
} catch (e) {
  console.log('skip command-palette:', e.message)
}

// 5. Pipeline builder (the left slideover): the categorized agent palette + the
// library of built-in pipelines. It can't go through openButton() like the others:
// the "Build a pipeline" nav button sits highest in the sidebar, under the full-width
// top toast band, so a click (even force) lands on the toast. Dispatch it straight to
// the DOM node, then wait for the palette to render before shooting.
try {
  await closeOverlays()
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Build a pipeline',
    )
    if (!btn) return false
    btn.click()
    return true
  })
  if (clicked) {
    await page.getByText('Agent palette').first().waitFor({ state: 'visible', timeout: 15000 })
    await shot('pipeline-builder')
  } else {
    console.log('skip pipeline-builder: nav button not found')
  }
} catch (e) {
  console.log('skip pipeline-builder:', e.message)
}

await browser.close()
console.log('done ->', SHOT_DIR)
