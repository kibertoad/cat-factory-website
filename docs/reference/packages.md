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
