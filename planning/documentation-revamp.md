# Documentation revamp: website restructure

Status: **executing.** Phases A, B and C have landed; phase D is partly done and the rest is
itemised at the bottom. The sibling tracker for the code repo's side of the revamp (which docs move
here, which stay there, and the ownership model behind the split) lives in
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
      steps. The 41 pre-existing pages have not been swept.
- [ ] D1 (existing pages). The same opening and closing shape across the pages that predate this
      revamp.
- [ ] D2. Task-oriented titles for how-to pages. Several still carry feature titles
      ("Model Providers & Subscriptions", "Ephemeral Environments").
- [ ] D3. Split pages that mix doc types where they have grown past one need. The two candidates
      are `extend/custom-agents.md` (961 lines, authoring how-to plus reference) and
      `guide/running-pipelines.md` (671 lines).
- [x] D4. The first-task-to-merged-PR tutorial (Start).

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
  the six sections, and it now names the two pages that are generated or owned elsewhere.
- **The search plugin indexes headings.** Heading text was kept stable through the moves, so
  remembered searches keep working.
- **New pages must not restate the code repo.** Content arrives by the sibling tracker's
  move-not-mirror rule; a page authored here from scratch while the repo doc lives on recreates the
  drift this revamp removes.
