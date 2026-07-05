# Packages & Repository Layout

Cat Factory is a TypeScript monorepo. This page maps the published packages and the source tree,
so you know where to look when extending or debugging the platform.

## Published libraries

| Package | Responsibility |
| --- | --- |
| `@cat-factory/app` | Nuxt SPA layer - board UI and Pinia stores. |
| `@cat-factory/kernel` | Domain types, constants, repository ports, and the extension registries: the pipeline registry (`registerPipeline`), the gate registry (`registerGate`), the step-resolver registry (`registerStepResolver`), the typed provider registry (`defineProviderToken` / `wireProvider` / `requireProvider`), and the provider-neutral VCS registry (`registerVcsProvider` / `resolveVcsProvider`). |
| `@cat-factory/orchestration` | Service composition root and workflow engines. Boot-time registration validation (`validateRegistrations` / `validateRegistrationsOnce`) lives here, since it cross-checks the gate, agent-kind, and pipeline registries. |
| `@cat-factory/agents` | Agent catalog, prompt composition, model-provider facade, the agent-kind registry (`registerAgentKind`), the document-template registry (`registerDocTemplate`), schema-driven structured output (`defineStructuredOutput`), and web-research/cache policy. |
| `@cat-factory/gates` | The built-in gate suite (CI, merge-conflicts, post-release health, the on-call escalation, and the [document-quality gate](../deploy/custom-agents.md#the-document-quality-gate)), authored entirely through the public `registerGate` seam. Depends only on `@cat-factory/kernel` + `@cat-factory/contracts`, never the engine. A deployment imports it for its side effect and wires each gate's provider via the exported `wireX` handles. See [Custom Agents & Gates](../deploy/custom-agents.md). |
| `@cat-factory/prompt-fragments` | The curated, versioned best-practice [prompt fragments](../guide/prompt-fragments.md) injected into agent prompts, including the writing-style fragments applied to document tasks. Register your own with `registerPromptFragment`. |
| `@cat-factory/eks` | Opt-in AWS EKS runner and environment backends. Reuses the native Kubernetes transport behind a short-lived IAM (SigV4-presigned STS) apiserver token, with no runtime AWS SDK. Register `eksRunnerBackend` / `eksEnvironmentBackend` to offer the `eks` backend kind. See [Kubernetes → Amazon EKS](../deploy/kubernetes.md#amazon-eks). |
| `@cat-factory/caching` | The app-level caching seam: `createAppCaches` builds the named in-memory read-through caches services consume through the kernel `AppCaches` port. In-memory only; Redis (when `REDIS_URL` is set on a multi-node Node deployment) is an invalidation bus, never a data tier. |
| `@cat-factory/server` | Runtime-neutral HTTP controllers, the shared agent-execution machinery (composite/container executors, runner-job client, GitHub App auth), and the web-search proxy. |
| `@cat-factory/integrations` | GitHub, document/task sources (including the experimental Linear connector), ticket trackers, environments, runner pools. |
| `@cat-factory/gitlab` | GitLab backend for the provider-neutral VCS layer: the neutral VCS client over GitLab's REST v4 API, a webhook verifier and mapper, project provisioning, and a PAT identity resolver for sign-in. Works on every runtime: set `GITLAB_TOKEN` on Cloudflare/Node or `GITLAB_PAT` in [local mode](../deploy/local.md#gitlab-in-local-mode) to drive clone/push, the CI gate, mergeability, real merge, merge-request creation, and GitLab PAT sign-in. Single-token model, one connection per deployment. |
| `@cat-factory/cli` | The bootstrap CLI (`npm create @cat-factory/cli`). Scaffolds a standalone [local-mode deployment](../deploy/local.md#bootstrap-with-the-cli) on the published libraries: generates the crypto secrets, mints a GitHub/GitLab PAT, and writes the populated, git-ignored `.env` files. Its core functions (`buildPlan`, `generateSecrets`, …) are exported for programmatic use. |
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
