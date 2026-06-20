# Packages & Repository Layout

Cat-Factory is a TypeScript monorepo. This page maps the published packages and the source tree,
so you know where to look when extending or debugging the platform.

## Published libraries

| Package | Responsibility |
| --- | --- |
| `@cat-factory/app` | Nuxt SPA layer — board UI and Pinia stores. |
| `@cat-factory/kernel` | Domain types, constants, repository ports. |
| `@cat-factory/orchestration` | Service composition root and workflow engines. |
| `@cat-factory/agents` | Agent catalog, prompt composition, model-provider facade. |
| `@cat-factory/server` | Runtime-neutral HTTP controllers and middleware. |
| `@cat-factory/integrations` | GitHub, document sources, environments, runner pools. |
| `@cat-factory/contracts` | Wire formats, validated with Valibot. |

## Internal (Docker / tooling)

| Package | Responsibility |
| --- | --- |
| `@cat-factory/executor-harness` | Per-run container payload that executes coding agents. |
| `@cat-factory/benchmark-harness` | Headless agent scoring across models and prompt versions. |
| conformance suite | Validates feature parity between the Cloudflare and Node.js runtimes. |

## Deployment projects

| Package | Target |
| --- | --- |
| `@cat-factory/deploy-backend` | Cloudflare Worker wrangler project. |
| `@cat-factory/deploy-node` | Node.js service with Dockerfile. |
| `@cat-factory/deploy-frontend` | Cloudflare Pages project. |

## Repository structure

```
cat-factory/
├── frontend/
│   └── app/              (@cat-factory/app Nuxt layer)
├── backend/
│   ├── packages/
│   │   ├── contracts/    (@cat-factory/contracts)
│   │   ├── kernel/       (@cat-factory/kernel)
│   │   ├── orchestration/(@cat-factory/orchestration)
│   │   ├── agents/       (@cat-factory/agents)
│   │   ├── integrations/ (@cat-factory/integrations)
│   │   ├── server/       (@cat-factory/server)
│   │   └── prompt-fragments/
│   ├── runtimes/
│   │   ├── cloudflare/   (@cat-factory/worker)
│   │   └── node/         (@cat-factory/node-server)
│   ├── internal/
│   │   ├── executor-harness/
│   │   ├── benchmark-harness/
│   │   └── conformance/
│   └── docs/
├── deploy/
│   ├── backend/          (Cloudflare Worker wrangler)
│   ├── node/             (Node.js Docker service)
│   └── frontend/         (Pages project)
└── docs/
    ├── CLAUDE.md         (end-to-end flow documentation)
    ├── auth.md
    ├── github-integration.md
    └── adr/              (architecture decision records)
```

## Benchmarking harness

A headless harness scores agents across models and prompt versions — evaluating requirement-review
quality, code-review accuracy, and implementation correctness, with a deterministic
`FakeAgentExecutor` for reproducible results.

```bash
cd backend/internal/benchmark-harness
cat-bench --models claude-3-5-sonnet,gpt-4o --prompt-versions v1,v2
```

## Where to get help in the source repo

| Topic | Location |
| --- | --- |
| Backend / monorepo overview | `backend/README.md` |
| Frontend SPA | `frontend/app/README.md` |
| End-to-end runtime flow | `CLAUDE.md` |
| Authentication | `backend/docs/auth.md` |
| GitHub operations | `backend/docs/github-operations.md` |
| Runner pools | `backend/docs/runner-pool-integration.md` |

---

The platform is **MIT licensed**. Source, issues, and contribution guidelines live at
[kibertoad/cat-factory](https://github.com/kibertoad/cat-factory).
