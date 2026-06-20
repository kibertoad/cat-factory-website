# Packages & Repository Layout

Cat-Factory is a TypeScript monorepo. This page maps the published packages and the source tree,
so you know where to look when extending or debugging the platform.

## Published libraries

| Package | Responsibility |
| --- | --- |
| `@cat-factory/app` | Nuxt SPA layer - board UI and Pinia stores. |
| `@cat-factory/kernel` | Domain types, constants, repository ports, the pipeline registry (`registerPipeline`). |
| `@cat-factory/orchestration` | Service composition root and workflow engines. |
| `@cat-factory/agents` | Agent catalog, prompt composition, model-provider facade, the agent-kind registry (`registerAgentKind`) and web-research/cache policy. |
| `@cat-factory/server` | Runtime-neutral HTTP controllers, the shared agent-execution machinery (composite/container executors, runner-job client, GitHub App auth), and the web-search proxy. |
| `@cat-factory/integrations` | GitHub, document/task sources, ticket trackers, environments, runner pools. |
| `@cat-factory/contracts` | Wire formats, validated with Valibot. |

::: tip Extending a deployment
The model-provider, agent-kind, and pipeline registries are opt-in extension seams. A deployment
(e.g. a proprietary org package) can mix in providers, agent kinds, and predefined pipelines
without forking. See [Architecture → Extending a deployment](./architecture.md#extending-a-deployment).
:::

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

A headless harness scores agents across models and prompt versions, evaluating requirement-review
quality, code-review accuracy, and implementation correctness. A deterministic `FakeAgentExecutor`
keeps results reproducible.

```bash
cd backend/internal/benchmark-harness
cat-bench --models <model-a>,<model-b> --prompt-versions v1,v2
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

The platform is MIT licensed. Source, issues, and contribution guidelines live at
[kibertoad/cat-factory](https://github.com/kibertoad/cat-factory).
