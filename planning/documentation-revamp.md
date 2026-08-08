# Documentation revamp: website restructure

Status: **proposal stage.** This PR lands the tracker only; no pages move yet. The sibling
tracker for the code repo's side of the revamp (which docs move here, which stay there, and
the ownership model behind the split) lives in
[kibertoad/cat-factory `docs/initiatives/documentation-revamp.md`](https://github.com/kibertoad/cat-factory/blob/main/docs/initiatives/documentation-revamp.md).

This file lives under `planning/`, outside `docs/`, so VuePress never publishes it.

Tracker PRs: this repo [#22](https://github.com/kibertoad/cat-factory-website/pull/22), code
repo [cat-factory#1847](https://github.com/kibertoad/cat-factory/pull/1847).

## Goal and rationale

The site's three sections (Guide, Deploy & Operate, Reference) were laid down when the site
had a dozen pages. At 41 pages the structure no longer matches how people use documentation:

- The **"Using Cat Factory" sidebar is 18 pages flat.** The navbar dropdown has grouping
  (Board & Team, Planning & Pipelines, Repos & Sources, Models & Prompts), but the sidebar,
  the surface a reading user actually navigates, does not.
- **"Deploy & Operate" is 14 pages flat, mixing four different jobs**: install a runtime
  (cloudflare, nodejs, local, kubernetes), configure the deployment (configuration,
  github-app, deployment-repository), operate it (observability, notifications, runner-pools,
  environments), and extend it (custom-agents, custom-providers, frontend-extensions).
- **The extender has no single entry point.** Extension docs sit in Deploy & Operate while
  their reference (manifests, packages, public-api) sits in Reference.
- **Missing destinations**: troubleshooting/FAQ, an environment-variable reference, a
  glossary, a security-model page, SDK and MCP docs, a GitHub/GitLab support matrix, upgrade
  notes. Most exist only in the code repo today; the sibling tracker assigns them here.

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

1. **Start** (learning-oriented): introduction, core-concepts, quick-start, plus a new
   end-to-end tutorial: first task to merged PR.
2. **Guides** (task-oriented how-to, grouped in the sidebar, not only the navbar):
   - Plan the work: designing-your-board, requirements, documents, initiatives
   - Run pipelines: running-pipelines, recurring-pipelines, pull-requests, budgets
   - Connect: repositories, issue-sources, frontend-preview
   - Models & prompts: model-providers, prompt-fragments, skills, sandbox
   - Collaborate: team-and-access, shared-services, foundational-services
   - The cookbook stays as the recipe index, cross-linking into the groups.
3. **Deploy** (install and configure): local, nodejs, cloudflare, kubernetes, github-app,
   deployment-repository, configuration.
4. **Operate** (run it in production): observability, notifications, runner-pools,
   environments, plus new pages: troubleshooting, upgrades & data retention.
5. **Extend** (the extender's single entry point): custom-agents, custom-providers,
   frontend-extensions, manifests, public-api, plus new pages: SDKs, MCP server.
6. **Reference** (information-oriented): architecture, agent-isolation, packages, plus new
   pages: environment variables, glossary, security model, GitHub/GitLab support matrix.

### Page mapping (current → target)

| Current | Target | Change |
| --- | --- | --- |
| `guide/introduction`, `core-concepts`, `quick-start` | Start | stays, regrouped |
| `guide/cookbook` | Guides (index) | stays |
| `guide/designing-your-board`, `requirements`, `documents`, `initiatives` | Guides → Plan the work | regrouped |
| `guide/running-pipelines`, `recurring-pipelines`, `pull-requests`, `budgets` | Guides → Run pipelines | regrouped |
| `guide/repositories`, `issue-sources`, `frontend-preview` | Guides → Connect | regrouped |
| `guide/model-providers`, `prompt-fragments`, `skills`, `sandbox` | Guides → Models & prompts | regrouped |
| `guide/team-and-access`, `shared-services`, `foundational-services` | Guides → Collaborate | regrouped |
| `deploy/local`, `nodejs`, `cloudflare`, `kubernetes`, `github-app`, `deployment-repository`, `configuration` | Deploy | stays, section split |
| `deploy/observability`, `notifications`, `runner-pools`, `environments` | Operate | moved |
| `deploy/custom-agents`, `custom-providers`, `frontend-extensions` | Extend | moved |
| `reference/manifests`, `public-api` | Extend | moved |
| `reference/architecture`, `agent-isolation`, `packages` | Reference | stays |
| new | Start → first-task tutorial; Operate → troubleshooting, upgrades; Extend → SDKs, MCP; Reference → env vars, glossary, security model, support matrix | added (content sourced per the sibling tracker) |

## Execution plan

Phased so the cheap, URL-stable wins land first and every URL change ships with redirects.

### Phase A: regroup navigation, move no files

No URL changes, so nothing in the code repo breaks.

- [ ] A1. Sidebar groups for `/guide/` matching the target Guides groups, plus a separate
      Start group.
- [ ] A2. Split the Deploy & Operate navbar entry into Deploy and Operate (files stay under
      `deploy/`).

### Phase B: new pages

Each coordinated with the sibling tracker's authority moves (the content comes from the code
repo; land the page here first, then the repo links it).

- [ ] B1. Troubleshooting (Operate).
- [ ] B2. Environment-variable reference (Reference).
- [ ] B3. Glossary (Reference).
- [ ] B4. Security model (Reference; extends what agent-isolation covers).
- [ ] B5. SDKs and MCP server (Extend).
- [ ] B6. GitHub/GitLab support matrix (Reference).
- [ ] B7. Upgrades & data retention (Operate).

### Phase C: moves and redirects

- [ ] C1. Move extension pages to `/extend/`, operate pages to `/operate/`; add redirects
      for every old URL in the same PR.
- [ ] C2. Update the code repo's links to the moved URLs (tracked on the sibling checklist).

### Phase D: page-quality pass

- [ ] D1. Every page opens with who it is for and what it assumes, and ends with next steps.
- [ ] D2. Task-oriented titles for how-to pages.
- [ ] D3. Split pages that mix doc types where they have grown past one need.
- [ ] D4. The first-task-to-merged-PR tutorial (Start).

## Gotchas

- **The code repo links these URLs.** kibertoad/cat-factory's root README links the cookbook
  and other pages by absolute URL; every URL change needs a redirect here and a link update
  there, in that order. Phase A exists because it changes no URL at all.
- **VuePress sidebar config keys on path prefixes** (`/guide/`, `/deploy/`), so phase C's
  moves rewrite `docs/.vuepress/config.js` sidebar keys along with the files.
- **The `sync-docs` skill maps code-repo changes onto `guide/` / `deploy/` / `reference/`
  paths.** Teach it the new sections in the same PR that moves them, or the next sync writes
  to paths that no longer exist.
- **The search plugin indexes headings.** Keep heading text stable through moves where
  possible, so remembered searches keep working.
- **New pages must not restate the code repo.** Content arrives by the sibling tracker's
  move-not-mirror rule; a page authored here from scratch while the repo doc lives on
  recreates the drift this revamp removes.
