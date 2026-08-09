#!/usr/bin/env node
// Resolves every link that crosses between this site and the code repository, in BOTH directions.
//
//   node scripts/check-repo-links.mjs                    # expects ../cat-factory
//   CAT_FACTORY_REPO=/path/to/cat-factory node scripts/check-repo-links.mjs
//
// Exit 0 = every crossing link resolves; exit 1 = at least one does not.
//
// Why this lives HERE rather than in the code repo. That repo's own guard
// (`scripts/check-doc-anchors.mjs`) deliberately does not check whether a catfactory.ai link
// resolves, because the only two options available from inside a single checkout are the network
// (which fails on this site's outages rather than on the code repo's mistakes) and a checked-in
// copy of this site's page list (a second routing table, which rots in the direction that matters
// most: a page deleted here would stay listed there and keep passing). Neither objection applies to
// a check that runs where the pages ARE. It needs no page list, because it reads the pages, and it
// needs no network, because both repositories are on disk.
//
// It is a SCHEDULED check, not a pull-request gate, for the same reason the environment-variable
// drift check is: the two repositories merge independently, so a paired change legitimately leaves
// one side leading the other for the life of the pair. Red here means "go and re-point a link",
// never "the change under review is broken".
//
// The two directions use DIFFERENT heading-slug rules, and that is the trap this script exists to
// get right rather than a detail:
//
//   site pages   are rendered by VuePress, whose slugifier maps every run of punctuation to a
//                single hyphen, so `## When the manifest isn't enough` is `#when-the-manifest-isn-t-enough`.
//   repo docs    are rendered by GitHub, which DROPS punctuation instead of replacing it, so
//                `## Enterprise SSO (generic OIDC)` is `#enterprise-sso-generic-oidc`.
//
// Slugifying with the wrong one reports a live link as broken, which is how a guard gets ignored.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const siteRoot = path.resolve(here, '..')
const docsRoot = path.join(siteRoot, 'docs')
const repoRoot = path.resolve(
  process.env.CAT_FACTORY_REPO ?? path.join(siteRoot, '..', 'cat-factory'),
)

const SITE_HOST = /^https?:\/\/(?:www\.)?catfactory\.ai(\/[^\s)'"`\]]*)?/
const REPO_BLOB = /^https?:\/\/github\.com\/kibertoad\/cat-factory\/blob\/main\/([^\s)'"`\]]+)/

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.nuxt',
  '.output',
  'coverage',
  '.vuepress',
])

// Generated CHANGELOGs are frozen history: they correctly name what was true when each entry was
// written, and rewriting one to chase a moved page would falsify the record. The code repo's own
// relative-link guard excludes them for the same reason.
const isChangelog = (file) => path.basename(file) === 'CHANGELOG.md'

const failures = []

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}

const rel = (root, file) => path.relative(root, file).split(path.sep).join('/')

// ---------------------------------------------------------------------------
// Heading slugs, one rule per renderer
// ---------------------------------------------------------------------------

// Inline markdown a slugifier never sees, because both renderers slugify the RENDERED text. Only
// link syntax has to go: its URL would otherwise contribute characters to the slug. Emphasis and
// code markers are punctuation to both rules and fold into the same hyphen the surrounding space
// already produces.
const stripInline = (heading) =>
  heading
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')

// @mdit-vue/shared's slugify, which is what VuePress renders this site's anchors with: strip
// combining marks and control characters, then map every RUN of whitespace or punctuation to one
// hyphen.
const rControl = /[\u0000-\u001f]/g
const rSpecial = /[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'\u201c\u201d\u2018\u2019<>,.?/]+/g
const rCombining = /[\u0300-\u036f]/g

function siteSlug(heading) {
  return stripInline(heading)
    .normalize('NFKD')
    .replace(rCombining, '')
    .replace(rControl, '')
    .replace(rSpecial, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase()
}

// GitHub's rule: lowercase, DROP everything that is not a letter, digit, space, hyphen or
// underscore, then hyphenate spaces. Dropping rather than replacing is the whole difference:
// `## Storage & retention` is `#storage--retention` on GitHub and `#storage-retention` here.
function repoSlug(heading) {
  return stripInline(heading)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} \-_]/gu, '')
    .replace(/ /g, '-')
}

function headingsOf(markdown) {
  const found = []
  let inFence = false
  const lines = markdown.split('\n')
  let start = 0
  if (lines[0] === '---') {
    start = 1
    while (start < lines.length && lines[start] !== '---') start++
    start++
  }
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const match = /^(#{1,6})\s+(.*?)\s*$/.exec(line)
    if (match) found.push(match[2])
  }
  return found
}

/** Frontmatter values of a repeated key, as a flat list. Only `redirectFrom` needs this. */
function frontmatterList(markdown, key) {
  const block = /^---\n([\s\S]*?)\n---/.exec(markdown)
  if (!block) return []
  const lines = block[1].split('\n')
  const at = lines.findIndex((line) => line.trim() === `${key}:`)
  if (at === -1) return []
  const values = []
  for (let i = at + 1; i < lines.length; i++) {
    const item = /^\s+-\s+(.*?)\s*$/.exec(lines[i])
    if (!item) break
    values.push(item[1].replace(/^['"]|['"]$/g, ''))
  }
  return values
}

// ---------------------------------------------------------------------------
// This site's pages, indexed by the URL paths they answer to
// ---------------------------------------------------------------------------

/** `/extend/manifests.html` and `/extend/manifests` and `/extend/` all name one page. */
function urlKeys(docRelPath) {
  const withoutExt = docRelPath.replace(/\.md$/, '')
  const asIndex = withoutExt.replace(/(^|\/)README$/, '$1')
  const keys = new Set([`/${withoutExt}.html`, `/${withoutExt}`, `/${asIndex}`])
  if (asIndex !== withoutExt) keys.add(`/${asIndex}index.html`)
  return [...keys].map((key) => key.replace(/\/{2,}/g, '/'))
}

function loadSitePages() {
  const pages = new Map() // url path -> { anchors, source }
  if (!existsSync(docsRoot)) {
    failures.push(`no docs directory at ${docsRoot}`)
    return pages
  }
  for (const file of walk(docsRoot)) {
    if (!file.endsWith('.md')) continue
    const source = rel(siteRoot, file)
    const markdown = readFileSync(file, 'utf8')
    const anchors = new Set(headingsOf(markdown).map(siteSlug))
    const entry = { anchors, source }
    for (const key of urlKeys(rel(docsRoot, file))) pages.set(key, entry)
    // A moved page carries its own `redirectFrom`, so an old URL still resolves for a reader and
    // must still resolve here. Reading them off the pages keeps this guard free of a second list.
    for (const from of frontmatterList(markdown, 'redirectFrom')) {
      pages.set(from, entry)
      pages.set(from.replace(/\.html$/, ''), entry)
    }
  }
  return pages
}

// ---------------------------------------------------------------------------
// Direction 1: the code repo links this site
// ---------------------------------------------------------------------------

const CODE_EXTENSIONS = new Set(['.md', '.ts', '.tsx', '.js', '.mjs', '.vue', '.json', '.yml', '.yaml'])

function checkRepoToSite(pages) {
  let checked = 0
  for (const file of walk(repoRoot)) {
    if (!CODE_EXTENSIONS.has(path.extname(file))) continue
    if (isChangelog(file)) continue
    const source = rel(repoRoot, file)
    const contents = readFileSync(file, 'utf8')
    for (const match of contents.matchAll(/https?:\/\/(?:www\.)?catfactory\.ai[^\s)'"`\]]*/g)) {
      const url = match[0].replace(/[.,;:]+$/, '')
      const [, rawPath = '/'] = SITE_HOST.exec(url) ?? []
      const [urlPath, anchor] = rawPath.split('#')
      const key = (urlPath || '/').replace(/\/$/, '/') || '/'
      const page = pages.get(key) ?? pages.get(key === '/' ? '/index.html' : key)
      checked++
      if (!page) {
        failures.push(`${source}: ${url} names no page on this site`)
        continue
      }
      if (anchor && !page.anchors.has(anchor)) {
        failures.push(`${source}: ${url} resolves to ${page.source}, which has no such heading`)
      }
    }
  }
  return checked
}

// ---------------------------------------------------------------------------
// Direction 2: this site links the code repo
// ---------------------------------------------------------------------------

function checkSiteToRepo() {
  let checked = 0
  const anchorsByPath = new Map()
  for (const file of walk(docsRoot)) {
    if (!file.endsWith('.md')) continue
    const source = rel(siteRoot, file)
    const contents = readFileSync(file, 'utf8')
    for (const match of contents.matchAll(
      /https?:\/\/github\.com\/kibertoad\/cat-factory\/blob\/main\/[^\s)'"`\]]+/g,
    )) {
      const url = match[0].replace(/[.,;:]+$/, '')
      const [, target] = REPO_BLOB.exec(url) ?? []
      if (!target) continue
      const [repoPath, anchor] = decodeURIComponent(target).split('#')
      const onDisk = path.join(repoRoot, ...repoPath.split('/'))
      checked++
      if (!existsSync(onDisk)) {
        failures.push(`${source}: ${url} names no file in the code repository`)
        continue
      }
      if (!anchor) continue
      if (!repoPath.endsWith('.md')) continue
      if (!anchorsByPath.has(repoPath)) {
        anchorsByPath.set(repoPath, new Set(headingsOf(readFileSync(onDisk, 'utf8')).map(repoSlug)))
      }
      if (!anchorsByPath.get(repoPath).has(anchor)) {
        failures.push(`${source}: ${url} resolves to ${repoPath}, which has no such heading`)
      }
    }
  }
  return checked
}

// ---------------------------------------------------------------------------

if (!existsSync(repoRoot) || !statSync(repoRoot).isDirectory()) {
  console.error(
    `Could not find a cat-factory checkout at ${repoRoot}.\n` +
      'Clone kibertoad/cat-factory beside this repo, or set CAT_FACTORY_REPO to its path.',
  )
  process.exit(1)
}

const pages = loadSitePages()
const inbound = checkRepoToSite(pages)
const outbound = checkSiteToRepo()

if (failures.length) {
  for (const failure of failures) console.error(`error: ${failure}`)
  console.error(
    `\n${failures.length} cross-repository link(s) do not resolve ` +
      `(${inbound} into this site, ${outbound} out of it, checked).`,
  )
  process.exit(1)
}

// A guard that silently stops matching reports green forever. These two counts are the evidence
// that it is still finding the links it was written to check.
if (inbound === 0 || outbound === 0) {
  console.error(
    `check-repo-links: found ${inbound} link(s) into this site and ${outbound} out of it. ` +
      'A zero means the link shape changed (a new host, a different blob base) and this guard is ' +
      'no longer checking that direction. Update the patterns at the top of this file.',
  )
  process.exit(1)
}

console.log(
  `cross-repository links resolve: ${inbound} from the code repo into this site, ` +
    `${outbound} from this site into the code repo.`,
)
