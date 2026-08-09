# Documentation revamp: website restructure

Status: **phase E in flight.** Phases A, B, C and D landed, and this tracker read complete while
still holding four destinations the code repo's reductions were waiting on. That is what phase E
closes. The sibling tracker for the code repo's side of the revamp (which docs move here, which stay
there, and the ownership model behind the split) lives in
[kibertoad/cat-factory `docs/initiatives/documentation-revamp.md`](https://github.com/kibertoad/cat-factory/blob/main/docs/initiatives/documentation-revamp.md).

**The lesson phase E is named after: a page EXISTING is not the topic being covered here.** Two of
the code repo's reductions were scoped against `extend/manifests.md` on the strength of its
per-manifest sections existing, and both were abandoned on reading it: the page stopped at a
three-row operations table per manifest, so cutting toward it would have deleted the only account of
the manifest format anyone could read. A section count made this site look like the senior partner
and a section count is not coverage. So a phase-E page states what DEPTH it owns, and the code repo's
matching doc says which half it kept.

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

### Phase E: the destinations the code repo's reductions are waiting on

Landed in [#25](https://github.com/kibertoad/cat-factory-website/pull/25), paired with
[cat-factory#1884](https://github.com/kibertoad/cat-factory/pull/1884), which is the reduction half.

Phases B and C filled the gaps the original audit could see. Phase E fills the four the code repo's
own reduction slices found afterwards, each one blocking a cut that could not otherwise land.

- [x] E1. **The manifest FORMAT, at the field level, for both manifests** (`extend/manifests.md`).
      This is the site's half of the sibling tracker's item 17, decided as outcome (a): a manifest is
      authored by a user, in the app, with no checkout, so the reader test puts the format here. The
      page gains the shared auth-scheme table (it was identical in both code-repo docs, so it is
      stated once), the request-template and response-mapping rules, and per manifest the field
      schema, the template-variable namespaces, the worked examples and the response-mapping notes.
      The three anchors other pages deep-link (`#environment-provider-manifest`,
      `#runner-pool-manifest`, `#per-workspace-config-for-code-adapters`) are unchanged on purpose.
- [x] E2. **Enterprise SSO** (`deploy/sso.md`, "Set Up Enterprise SSO"). The audit's sharpest
      repo-only row: `deploy/configuration.md#authentication` named three sign-in providers and never
      mentioned OIDC, so the only trace of SSO on this site was a generated environment-variable row
      linking back into the code repo. The page owns registering the application, the nine variables,
      the four boot refusals, the directory-as-allowlist admission model and its revocation
      behaviour, and why SSO is configured in the environment rather than in the UI.
- [x] E3. **Reusable operations** (`extend/reusable-operations.md`, "Package a Reusable Operation").
      The site had no page for it at all. The reader is a deployment author writing their own package
      against the published seams, which is exactly the Extend audience: the bundle, the form
      vocabulary, standing context, variant steering, the pipeline lifecycle, the boot-validation
      table, the composition-root walkthrough and the two dependency rules that bite.
- [x] E4. **Design context** (`guide/design-context.md`, "Feed Design Context to Agents"). Figma and
      Zeplin were a tip box on `guide/issue-sources.md`. The page owns connecting a source, what the
      agent actually receives, what each import cap asks the reader to DO about it, the freshness
      verdicts and their four fixes, renders, and the commit-it-don't-connect-it workflow for Claude
      Design. The tip box is now a pointer.
- [x] E6. **Two pages the code repo's reductions turned out to be blocked on**, found by measuring
      phase E rather than by the audit. `extend/tool-servers.md` ("Give Agents External Tools (MCP)")
      and `operate/debugging-a-run.md` ("Debug a Run from Outside the Browser"). Both are the same
      shape as E1: a repo doc many times the size of its page, so the reduction could not land until
      the page existed. `mcp-tool-servers.md` was 723 lines against 65 on `extend/custom-agents.md`;
      `debug-api.md` was 433 against about 25 spread over two pages. With the pages here they cut to
      347 and 207.

      The custom-agents page's tool-server subsection is now a pointer, which moved a load-bearing
      link: the generated environment-variable page maps that doc onto a site link through
      `scripts/sync-env-vars.mjs`, and the mapping was repointed and the page regenerated in the same
      change.

- [x] E5. **Resolve the crossing links from the repository that holds the pages**
      (`scripts/check-repo-links.mjs`, the sibling tracker's item 18). Both directions: a
      catfactory.ai URL anywhere in the code repo must name a page here and, when it deep-links one,
      a heading; a GitHub blob link on a page here must name a file there. No page list and no
      network, because both checkouts are on disk. It runs on a schedule
      (`cross-repo-links.yml`) rather than as a pull-request gate, for the reason `env-vars-drift.yml`
      does: the two repositories merge independently, so a paired change legitimately leaves one side
      leading the other.

Two traps E5 had to get right, both of them the reason a hand-check kept missing links:

- **The slug rules differ per renderer, and using the wrong one reports a live link as broken.**
  VuePress (`@mdit-vue/shared`) maps every RUN of punctuation to one hyphen, so
  `## When the manifest isn't enough` is `#when-the-manifest-isn-t-enough`; GitHub DROPS punctuation
  instead, so `## Enterprise SSO (generic OIDC)` is `#enterprise-sso-generic-oidc`.
- **A redirected URL still resolves for a reader, so it must resolve for the guard.** It reads each
  page's own `redirectFrom` frontmatter rather than keeping a second list, which is the same reason
  a moved page carries its redirect in the first place.

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
- **A page that receives a move lands BEFORE the code repo's reduction merges, and the reduction is
  what completes the move.** Landing the page alone leaves the material in two places, which is the
  state this revamp exists to end; landing the reduction alone leaves a pointer at a page that never
  gained the content. Phase E's four pages each have a named counterpart slice in the sibling
  tracker, and neither half is done until both have merged.
- **Say what depth a page owns when it takes one over.** Phase E's manifest page states that it is
  the authority for the format, because the previous version's silence on the question is what let
  two reductions be scoped against a page that could not receive them.
- **Measure the pair, not the page.** Phase E's first round added 1,139 lines here and removed 614
  there, which is two parallel accounts with a link between them rather than a move. A page landing
  is half a slice; the number that says whether the split happened is lines REMOVED from the code
  repo. E6 exists because that number was checked.
- **A repo doc many times the size of its page means the page is the blocker, not the doc.** It
  happened three times in one phase (both manifests, then MCP tool servers, then the debug API), so
  it is the expected shape: before scoping a reduction, compare the two lengths, and if the page is
  a fraction of the doc, the first deliverable is here.
