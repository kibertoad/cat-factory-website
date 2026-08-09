# Documentation revamp: website restructure

Status: **reopened at phase E.** Phases A, B, C and D have landed, and the structure they built is
holding. What reopened it is the code repo's reduction pass: a reduction is the first thing that
reads a page for DEPTH rather than existence, and four destinations turned out to be missing or too
shallow to receive the content the sibling tracker planned to send. Two of them BLOCK slices there,
so "complete" was a status this repo could not honestly hold while the other side waited on it.

The sibling tracker for the code repo's side of the revamp (which docs move here, which stay there,
and the ownership model behind the split) lives in
[kibertoad/cat-factory `docs/initiatives/documentation-revamp.md`](https://github.com/kibertoad/cat-factory/blob/main/docs/initiatives/documentation-revamp.md).

This file lives under `planning/`, outside `docs/`, so VuePress never publishes it.

Tracker PRs: this repo [#22](https://github.com/kibertoad/cat-factory-website/pull/22), code
repo [cat-factory#1847](https://github.com/kibertoad/cat-factory/pull/1847).

## Goal and rationale

The site's three sections (Guide, Deploy & Operate, Reference) were laid down when the site had a
dozen pages. At 41 pages the structure no longer matched how people use documentation:

- The **"Using Cat Factory" sidebar was 18 pages flat.** The navbar dropdown had grouping (Board &
  Team, Planning & Pipelines, Repos & Sources, Models & Prompts), but the sidebar, the surface a
  reading user actually navigates, did not.
- **"Deploy & Operate" was 14 pages flat, mixing four different jobs**: install a runtime, configure
  the deployment, operate it, and extend it.
- **The extender had no single entry point.** Extension docs sat in Deploy & Operate while their
  reference sat in Reference.
- **Missing destinations**: troubleshooting, an environment-variable reference, a glossary, a
  security-model page, SDK and MCP docs, a GitHub/GitLab support matrix, upgrade notes. Most existed
  only in the code repo; the sibling tracker assigns them here.

## Research: how mature projects structure documentation

- **[Diátaxis](https://diataxis.fr/)** (Daniele Procida; adopted by Django, Canonical/Ubuntu,
  Cloudflare, Gatsby): four forms of documentation serving four needs. Tutorials
  (learning-oriented lessons), how-to guides (goal-oriented directions), reference
  (information-oriented description), explanation (understanding-oriented discussion). The
  core discipline: do not mix forms on one page, and organise navigation around the reader's
  need of the moment.
- **Kubernetes** (kubernetes.io/docs): Setup / Concepts / Tasks / Tutorials / Reference. A
  doc-type split at the top level; "Tasks" are single-goal how-tos with a strict page shape.
- **GitLab** (docs.gitlab.com): Use GitLab / Administer / Extend / Contribute. An
  audience-and-job split at the top level; each area is task-grouped inside.
- **Stripe** (stripe.com/docs): task-first guides per product area, with the API reference
  strictly separated and complete. The guides assume a goal ("accept a payment"), never a
  feature inventory.
- **Terraform** (developer.hashicorp.com/terraform): per-audience components (Intro,
  Language, CLI, Cloud) plus generated registry reference.
- **React** (react.dev): Learn (tutorial plus concepts) vs Reference, on a site separate from
  the code repo, which keeps only contributor docs. The same repo-vs-site split the sibling
  tracker adopts.

Properties they share, which this restructure copies:

1. The top navigation answers "what is my job right now", not "what does the product have".
2. How-to pages carry task titles ("Connect GitLab"), not feature titles ("VCS providers").
3. Tutorials are separated from how-to guides; a first-run lesson is not a reference page.
4. Reference is isolated, complete, and never interleaved with narrative.
5. Troubleshooting is a first-class destination, not a paragraph at the bottom of each page.
6. Every page ends with where to go next.

## Target structure

Six top-level sections replacing the current three:

1. **Start** (learning-oriented): introduction, core-concepts, quick-start, plus the end-to-end
   tutorial: first task to merged PR.
2. **Guides** (task-oriented how-to, grouped in the sidebar, not only the navbar):
   - Recipes: the cookbook, cross-linking into the groups below
   - Plan the work: designing-your-board, requirements, documents, initiatives
   - Run pipelines: running-pipelines, recurring-pipelines, pull-requests, budgets
   - Connect: repositories, issue-sources, frontend-preview
   - Models & prompts: model-providers, prompt-fragments, skills, sandbox
   - Collaborate: team-and-access, shared-services, foundational-services
3. **Deploy** (install and configure): local, nodejs, cloudflare, kubernetes, github-app,
   deployment-repository, configuration.
4. **Operate** (run it in production): observability, notifications, runner-pools, environments,
   troubleshooting, upgrades & data retention.
5. **Extend** (the extender's single entry point): custom-agents, custom-providers,
   frontend-extensions, manifests, public-api, SDKs, MCP server.
6. **Reference** (information-oriented): architecture, agent-isolation, security-model, packages,
   environment-variables, vcs-support-matrix, glossary.

Start and Guides are both `/guide/` on disk. That is deliberate: regrouping them changed no URL,
which is what let the cheap half of the restructure land with nothing to redirect.

### Page mapping (current → target)

| Current | Target | Change |
| --- | --- | --- |
| `guide/introduction`, `core-concepts`, `quick-start` | Start | stays, regrouped |
| `guide/cookbook` | Guides → Recipes | stays |
| `guide/designing-your-board`, `requirements`, `documents`, `initiatives` | Guides → Plan the work | regrouped |
| `guide/running-pipelines`, `recurring-pipelines`, `pull-requests`, `budgets` | Guides → Run pipelines | regrouped |
| `guide/repositories`, `issue-sources`, `frontend-preview` | Guides → Connect | regrouped |
| `guide/model-providers`, `prompt-fragments`, `skills`, `sandbox` | Guides → Models & prompts | regrouped |
| `guide/team-and-access`, `shared-services`, `foundational-services` | Guides → Collaborate | regrouped |
| `deploy/local`, `nodejs`, `cloudflare`, `kubernetes`, `github-app`, `deployment-repository`, `configuration` | Deploy | stays, section split |
| `deploy/observability`, `notifications`, `runner-pools`, `environments` | Operate | moved, redirected |
| `deploy/custom-agents`, `custom-providers`, `frontend-extensions` | Extend | moved, redirected |
| `reference/manifests`, `public-api` | Extend | moved, redirected |
| `reference/architecture`, `agent-isolation`, `packages` | Reference | stays |
| new | Start → first-task tutorial; Operate → troubleshooting, upgrades & retention; Extend → SDKs, MCP server; Reference → env vars, glossary, security model, VCS support matrix | added |

## Execution plan

Phased so the cheap, URL-stable wins land first and every URL change ships with redirects.

### Phase A: regroup navigation, move no files

No URL changes, so nothing in the code repo breaks.

- [x] A1. Sidebar groups for `/guide/` matching the target Guides groups, plus a separate
      Start group.
- [x] A2. Split the Deploy & Operate navbar entry into Deploy, Operate and Extend.

### Phase B: new pages

Each coordinated with the sibling tracker's authority moves (the content comes from the code
repo; the page lands here first, then the repo links it).

- [x] B1. Troubleshooting (Operate).
- [x] B2. Environment-variable reference (Reference). Generated: see the note under gotchas.
- [x] B3. Glossary (Reference). Product vocabulary A to Z; the repo keeps its code-level naming map.
- [x] B4. Security model (Reference; the layer taxonomy, the non-boundaries, the hardening
      checklist and the known gaps, beside what agent-isolation already covers).
- [x] B5. SDKs and MCP server (Extend), as two pages rather than one.
- [x] B6. GitHub/GitLab support matrix (Reference).
- [x] B7. Upgrades & data retention (Operate).

### Phase C: moves and redirects

- [x] C1. Extension pages moved to `/extend/`, operating pages to `/operate/`, with a
      `redirectFrom` on every moved page and `@vuepress/plugin-redirect` wired so the build emits
      a static redirect for each old URL.
- [x] C2. The code repo's links updated to the moved URLs (tracked on the sibling checklist).

### Phase D: page-quality pass

- [x] D1 (new pages only). Every page added in phase B opens with who it is for and ends with next
      steps.
- [x] D1 (existing pages). The same opening and closing shape across the pages that predate this
      revamp. Every page now carries a `---` rule and a `Next:` line naming two destinations; the
      home page is the one exception, since its whole body is destinations. The trailing pointers
      that already existed were kept and reworded, not replaced, so no page lost a link it had.
- [x] D2. Task-oriented titles for how-to pages. 26 pages renamed, and every link whose text was the
      old title updated with it. Reference pages kept their noun titles on purpose: the Diátaxis
      split this revamp adopted puts task titles on how-to pages and descriptive ones on reference.
      So `Glossary`, `Architecture`, `Public API`, `Integration Manifests` and the rest are
      unchanged, while `Model Providers & Subscriptions` became `Connect a Model Provider` and
      `Ephemeral Environments` became `Provision Ephemeral Environments`.
- [x] D3. Both oversized pages split.
      - `guide/running-pipelines.md` (671 lines) split by *when you need it* rather than by doc
        type, which is where its two needs actually part: design time (which chain to run, and how
        to edit one) versus run time (start it, watch it, answer what it asks). The catalog,
        presets, builder edits, step gating, binary-output steps and consensus moved to the new
        `guide/choosing-a-pipeline.md` ("Choose and Edit a Pipeline"); starting, models, live
        progress, the test report, the human gates, retries and the lifecycle stayed on
        `running-pipelines.md` ("Run a Pipeline"), which keeps the URL the code repo links.
      - `extend/custom-agents.md` (966 lines) split by extension shape: authoring an agent kind
        stayed, and gates, step-completion resolvers and judges moved to the new
        `extend/custom-gates.md` ("Add a Custom Gate or Judge"). A how-to/reference split was the
        first plan and was rejected: the generated `reference/environment-variables.md` links
        `custom-agents.md#skills-and-tool-servers` through `scripts/sync-env-vars.mjs`, so moving
        the definition tables off that page would break a link on a page that must not be
        hand-edited. Splitting by shape leaves that anchor where it is, and the two halves are two
        genuinely different jobs. Packaging, wiring and boot-time validation are shared and stayed
        on the agent page, linked from the gate page rather than duplicated.
- [x] D4. The first-task-to-merged-PR tutorial (Start).

Neither split moved a URL, so neither needed a redirect: each new page is a new URL and each old
page kept its own. Every in-site link and heading anchor was re-checked after the moves and the
renames; one pre-existing broken anchor (`budgets.md` → `#budget-of-0-local--or-subscription-only`,
a doubled dash) turned up in that sweep and was fixed.

### Phase E: the depth the reductions asked for

Ordered by what unblocks the other repo. E1 is the only one two code-repo slices are parked on.

- [ ] E1. **`extend/manifests.md` gains the field level, or the format goes back.** The page is 102
      lines: shared building blocks, a secrets rule, `providerConfig`, and one three-row operations
      table per manifest. The code repo's two manifest sections are 152 and 203 lines of field
      schema, auth-scheme tables, template-variable rules, response-mapping notes and worked
      examples, and both reductions stopped rather than cut toward a page that cannot hold them.
      Decide with the sibling tracker's item 17: either this page (or a split pair, one per
      manifest) becomes the authority at field level, or the format is named a repo-owned
      exception and neither reduction is planned again. The reader test points at the first: a
      manifest is authored in the app's own editor by someone with no checkout.
- [ ] E2. **Enterprise SSO has no destination here.** `deploy/configuration.md#authentication` names
      GitHub OAuth, Google OAuth and email/password, and never mentions OIDC. The only trace of SSO
      on this site is one row of the GENERATED environment-variable page, whose Description links
      back into the code repo. So the deployment shape an enterprise actually buys is documented
      only where a checkout is required, which is the exact problem the revamp exists to fix. Land
      it as a section on the configuration page or its own Deploy page, sourced from the code
      repo's `backend/docs/auth.md` (`## Enterprise SSO (generic OIDC)`, its access-control
      subsections, and why SSO is configured by environment rather than in the UI).
- [ ] E3. **Reusable operations has no page.** A deployment-registered operation bundles a per-case
      form, standing context and its own canned pipeline. It is an Extend-section topic by every
      rule this site uses, `backend/docs/reusable-operations.md` is 675 lines, and the phrase
      appears nowhere in `docs/`.
- [ ] E4. **Design-context sources (Figma, Zeplin) are a passing mention.** Two pages name them in a
      list of document sources; nothing says what a design-context source feeds, what the UI agents
      receive from it, or how a workspace connects one. Smallest of the four: likely a section on
      `guide/documents.md` rather than a page.
- [ ] E5. **Check the code repo's links INTO this site, from here.** The code repo builds 44 distinct
      `catfactory.ai` URLs (docs, code and shipped READMEs) and its own guards deliberately cannot
      resolve them: a page list checked in there rots in the deletion direction. This repo has the
      pages, and already reaches into that repo on a schedule for `sync-env-vars.mjs --check`, so
      the same job resolves each URL to a page file and a heading. Use `@mdit-vue/shared`'s
      slugify, the one VuePress uses: it maps each punctuation run to `-`, so
      `## When the manifest isn't enough` is `#when-the-manifest-isn-t-enough` and a GitHub-style
      slugifier reports live links as broken. Resolve the reverse direction in the same job: seven
      links here point into the code repo, one of them anchored.
- [ ] E6. **Give `sync-docs` a row per new destination.** Its feature-area map has no row for
      authentication and SSO, reusable operations, design-context sources, or the debug endpoints,
      so a commit in any of those areas maps to nothing and is dropped as out of scope.

## Docs added since this tracker was written

Checked against the code repo on 2026-08-08. The revamp's own execution absorbed these rather than
leaving them for a later slice:

- **`backend/docs/custom-binary-stores.md`** (new in the code repo): the operator-facing half is
  binary-output storage selection, which `guide/foundational-services.md` already frames. Assigned
  to that page rather than a new one; the repo doc keeps the generator-registry design.
- **`backend/docs/adr/0050-public-api-headless-completeness.md`** and
  **`backend/internal/conformance/README.md`**: contributor-only by the ownership rule, so neither
  earns a page here. Recorded so a later audit does not re-open the question.
- **`NOTIFICATION_RETENTION_DAYS` and `PROVISIONING_LOG_RETENTION_DAYS`** were read by the code and
  documented nowhere canonical. They are in the code repo's list now, so they render here.
- The observability page claimed a 3-day telemetry retention default that the code changed to 14.
  Fixed, and the kind of drift the generated environment-variable page now prevents for variables.

## Gotchas

- **The code repo links these URLs.** kibertoad/cat-factory's root README links pages here by
  absolute URL; every URL change needs a redirect here and a link update there, in that order.
  Phase A existed because it changed no URL at all.
- **VuePress sidebar config keys on path prefixes** (`/guide/`, `/deploy/`, `/operate/`,
  `/extend/`, `/reference/`), so a page moved between sections needs its sidebar key changed with
  the file.
- **A moved page carries its own redirect.** `redirectFrom` frontmatter on the page that now owns
  the URL, never a central map, so a later move cannot leave a stale entry in a list nobody reads.
  The build emits one static HTML redirect per old URL, which is what GitHub Pages can serve.
- **`docs/reference/environment-variables.md` is generated and must not be hand-edited.**
  `node scripts/sync-env-vars.mjs` renders it from the code repo's canonical list, and `--check`
  fails on staleness. The canonical list has to stay in the code repo because a CI guard there
  reads it, and that guard is only useful when it fires in the PR that adds the variable.
- **The `sync-docs` skill maps code-repo changes onto doc paths.** Its table has been updated for
  the six sections and for phase D's two splits, and it names the two pages that are generated or
  owned elsewhere.
- **The search plugin indexes headings.** Heading text was kept stable through the moves, so
  remembered searches keep working. Phase D's renames changed page titles (H1s) but left every H2
  and H3 alone, which is also what kept the anchor churn to the two split pages.
- **New pages must not restate the code repo.** Content arrives by the sibling tracker's
  move-not-mirror rule; a page authored here from scratch while the repo doc lives on recreates the
  drift this revamp removes.
- **A section count is not coverage, and phase E is what that cost.** Both manifest sections here
  read as complete against a table of contents and stop above the field level, so the sibling
  repo scoped two reductions toward a page with nowhere to put them. When this tracker claims a
  topic, the claim is about DEPTH: name what a reader can do with the page alone, and where the
  page deliberately stops, say so on the page.
