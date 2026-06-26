# Packages & Repository Layout

Cat Factory is a TypeScript monorepo. This page maps the published packages and the source tree,
so you know where to look when extending or debugging the platform.

## Published libraries

| Package | Responsibility |
| --- | --- |
| `@cat-factory/app` | Nuxt SPA layer - board UI and Pinia stores. |
| `@cat-factory/kernel` | Domain types, constants, repository ports, and the extension registries: the pipeline registry (`registerPipeline`), the gate registry (`registerGate`), the step-resolver registry (`registerStepResolver`), and the typed provider registry (`defineProviderToken` / `wireProvider` / `requireProvider`). |
| `@cat-factory/orchestration` | Service composition root and workflow engines. Boot-time registration validation (`validateRegistrations` / `validateRegistrationsOnce`) lives here, since it cross-checks the gate, agent-kind, and pipeline registries. |
| `@cat-factory/agents` | Agent catalog, prompt composition, model-provider facade, the agent-kind registry (`registerAgentKind`), schema-driven structured output (`defineStructuredOutput`), and web-research/cache policy. |
| `@cat-factory/gates` | The built-in polling-gate suite (CI, merge-conflicts, post-release health, plus the on-call escalation), authored entirely through the public `registerGate` seam. Depends only on `@cat-factory/kernel` + `@cat-factory/contracts`, never the engine. A deployment imports it for its side effect and wires each gate's provider via the exported `wireX` handles. See [Custom Agents & Gates](../deploy/custom-agents.md). |
| `@cat-factory/server` | Runtime-neutral HTTP controllers, the shared agent-execution machinery (composite/container executors, runner-job client, GitHub App auth), and the web-search proxy. |
| `@cat-factory/integrations` | GitHub, document/task sources, ticket trackers, environments, runner pools. |
| `@cat-factory/contracts` | Wire formats, validated with Valibot. Also the canonical `RESULT_VIEW_IDS` an agent kind's `presentation.resultView` is validated against. |

::: tip Extending a deployment
The model-provider, agent-kind, gate, step-resolver, provider, and pipeline registries are opt-in
extension seams. A deployment (e.g. a proprietary org package) can mix in providers, agent kinds,
polling gates, and predefined pipelines without forking, registering each as a startup import side
effect. The built-in gate suite ships as `@cat-factory/gates`, authored through the same `registerGate`
seam a deployment uses. See [Custom Agents & Gates](../deploy/custom-agents.md) and
[Architecture → Extending a deployment](./architecture.md#extending-a-deployment).
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
