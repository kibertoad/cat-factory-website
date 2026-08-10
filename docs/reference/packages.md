# Packages & Repository Layout

For an extender or a contributor who needs to know which package owns what. Cat Factory is a
TypeScript monorepo; this page maps the published packages and the source tree, so you know where to
look when extending or debugging the platform.

## What a deployment actually depends on

Start here, because the table below is longer than anything you install. A deployment names **two**
packages in its own `package.json`: one runtime facade for the backend, and the SPA layer for the
frontend. Everything else arrives transitively.

| Package | Deployment | Entry point |
| --- | --- | --- |
| `@cat-factory/node-server` | [Node.js](../deploy/nodejs.md) (PostgreSQL + job queue) | `start()` |
| `@cat-factory/worker` | [Cloudflare Workers](../deploy/cloudflare.md) (D1, Durable Objects) | `createWorker()` |
| `@cat-factory/local-server` | [Local mode](../deploy/local.md), the same backend wired for one machine | `startLocal()` |
| `@cat-factory/app` | Every deployment's frontend | Nuxt `extends: ['@cat-factory/app']` |

The facade is a composition root, not a thin re-export: it depends on the core packages **and on the
opt-in ones**, so a capability like GitLab or Bedrock is turned on with configuration rather than
with a dependency change. That is why [Configuration](../deploy/configuration.md) can promise that
setting `GITLAB_TOKEN` is enough, and it is the fact to check first when a capability that "should be
optional" appears to be missing: it is present and unconfigured, not absent.

See [Deployment Repository](../deploy/deployment-repository.md) for the shape of the project that
consumes these, including the migrations that ship inside the facade.

## Core packages

Present in every deployment, whatever it has configured.

| Package | Responsibility |
| --- | --- |
| `@cat-factory/kernel` | Domain types, constants, repository ports, and the extension registries: the pipeline registry (`registerPipeline`), the gate registry (`registerGate`), the step-resolver registry (`registerStepResolver`), the typed provider registry (`defineProviderToken` / `wireProvider` / `requireProvider`), and the provider-neutral VCS registry (`registerVcsProvider` / `resolveVcsProvider`). |
| `@cat-factory/contracts` | Wire formats, validated with Valibot. Also the canonical `RESULT_VIEW_IDS` an agent kind's `presentation.resultView` is validated against. |
| `@cat-factory/orchestration` | Service composition root and workflow engines. Boot-time registration validation (`validateRegistrations` / `validateRegistrationsOnce`) lives here, since it cross-checks the gate, agent-kind, and pipeline registries. |
| `@cat-factory/server` | Runtime-neutral HTTP controllers, the shared agent-execution machinery (composite/container executors, runner-job client, GitHub App auth), and the web-search proxy. |
| `@cat-factory/agents` | Agent catalog, prompt composition, model-provider facade, the agent-kind registry (`registerAgentKind`), the document-template registry (`registerDocTemplate`), schema-driven structured output (`defineStructuredOutput`), and web-research/cache policy. |
| `@cat-factory/gates` | The built-in gate suite (CI, merge-conflicts, post-release health, the on-call escalation, and the [document-quality gate](../extend/custom-gates.md#the-document-quality-gate)), authored entirely through the public `registerGate` seam. Depends only on `@cat-factory/kernel` + `@cat-factory/contracts`, never the engine. A deployment imports it for its side effect and wires each gate's provider via the exported `wireX` handles. See [Add a Custom Agent Kind](../extend/custom-agents.md) and [Add a Custom Gate or Judge](../extend/custom-gates.md). |
| `@cat-factory/integrations` | GitHub, document/task sources (including the experimental Linear connector), ticket trackers, environments, runner pools. |
| `@cat-factory/prompt-fragments` | The curated, versioned best-practice [prompt fragments](../guide/prompt-fragments.md) injected into agent prompts, including the writing-style fragments applied to document tasks. Register your own with `registerPromptFragment`. |
| `@cat-factory/workspaces` | The tenancy base: workspaces and the accounts above them. See [Workspaces and accounts](../guide/core-concepts.md#workspaces-and-accounts). |
| `@cat-factory/spend` | Pricing tables and spend metering — what [budgets](../guide/budgets.md) and the usage endpoint are computed from. |
| `@cat-factory/caching` | The app-level caching seam: `createAppCaches` builds the named in-memory read-through caches services consume through the kernel `AppCaches` port. In-memory only; Redis (when `REDIS_URL` is set on a multi-node Node deployment) is an invalidation bus, never a data tier. |
| `@cat-factory/sandbox` | The [Sandbox](../guide/sandbox.md): versioned prompt candidates, experiment matrices, and judge/objective grading, with `@cat-factory/sandbox-fixtures` supplying the graded no-repo fixtures it runs against. |
| `@cat-factory/app` | Nuxt SPA layer — board UI and Pinia stores. Consumed as a Nuxt layer, not imported. |

## Opt-in capability packages

Each of these adds one capability and is inert until the deployment configures it. They ship inside
the runtime facades, so the column that matters is the last one.

| Package | Adds | Turned on by |
| --- | --- | --- |
| `@cat-factory/gitlab` | GitLab backend for the provider-neutral VCS layer: the neutral VCS client over GitLab's REST v4 API, a webhook verifier and mapper, project provisioning, and a PAT identity resolver for sign-in. Single-token model, one connection per deployment. | `GITLAB_TOKEN`, or `GITLAB_PAT` in [local mode](../deploy/local.md#gitlab-in-local-mode). See the [VCS support matrix](./vcs-support-matrix.md). |
| `@cat-factory/eks` | AWS EKS runner and environment backends. Reuses the native Kubernetes transport behind a short-lived IAM (SigV4-presigned STS) apiserver token, with no runtime AWS SDK. | Registering `eksRunnerBackend` / `eksEnvironmentBackend` to offer the `eks` backend kind. See [Kubernetes → Amazon EKS](../deploy/kubernetes.md#amazon-eks). |
| `@cat-factory/provider-bedrock` | The `bedrock` model provider, mixed into the composite provider. | `BEDROCK_REGION` + AWS credentials + `BEDROCK_MODELS`. See [Configuration](../deploy/configuration.md). |
| `@cat-factory/provider-cloudflare` | The `workers-ai` model provider (an in-process binding on the Worker, OpenAI-compatible REST elsewhere). | The Worker's `AI` binding, or `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` off Cloudflare. |
| `@cat-factory/provider-s3` | An S3 blob backend for binary-artifact storage, over the kernel `BinaryBlobBackend` port. Node deployments only. | Picking S3 as the account's [content store](../deploy/configuration.md#content-storage-binary-artifacts), in the app rather than the environment. |
| `@cat-factory/observability-otel` | An OpenTelemetry (OTLP/HTTP) publisher for LLM generations, container tool spans, structured logs, and deployment-level run-health gauges. The workerd-safe fetch exporter on Cloudflare, the official SDK on Node. | `OTEL_ENABLED` + `OTEL_EXPORTER_OTLP_*`. See [Observability](../operate/observability.md). |
| `@cat-factory/observability-langfuse` | A Langfuse trace sink for the same generations and tool spans, over `fetch` on both runtimes. | `LANGFUSE_ENABLED` + both project keys. See [Observability](../operate/observability.md). |
| `@cat-factory/consensus` | [Multi-model consensus](../guide/choosing-a-pipeline.md#multi-model-consensus) on eligible steps — specialist panel, debate, ranked voting — gated on the task's estimate. | `CONSENSUS_ENABLED`. |

`@cat-factory/cli` is the odd one out: it is a tool rather than a dependency. `npm create
@cat-factory/cli` scaffolds a standalone [local-mode deployment](../deploy/local.md#bootstrap-with-the-cli)
on the published libraries — generating the crypto secrets, minting a GitHub/GitLab PAT, and writing
the populated, git-ignored `.env` files. Its core functions (`buildPlan`, `generateSecrets`, …) are
exported for programmatic use.

::: tip Extending a deployment
The model-provider, agent-kind, gate, step-resolver, provider, and pipeline registries are opt-in
extension seams. A deployment (e.g. a proprietary org package) can mix in providers, agent kinds,
polling gates, and predefined pipelines without forking, registering each as a startup import side
effect. The built-in gate suite ships as `@cat-factory/gates`, authored through the same `registerGate`
seam a deployment uses. See [Add a Custom Agent Kind](../extend/custom-agents.md) and [Add a Custom Gate or Judge](../extend/custom-gates.md) and
[Architecture → Extending a deployment](./architecture.md#extending-a-deployment).
:::

## Repository layout

[kibertoad/cat-factory](https://github.com/kibertoad/cat-factory) holds the platform. Every package
above lives at the path its name suggests: `@cat-factory/<name>` is `backend/packages/<name>`, with
the four exceptions the tree names.

```
cat-factory/
├── backend/
│   ├── packages/      one directory per @cat-factory/* library above
│   ├── runtimes/      the composition roots: node/, cloudflare/, local/
│   │                  → @cat-factory/node-server, /worker, /local-server
│   ├── internal/      never published: the acceptance, conformance, e2e and
│   │                  benchmark harnesses, and example-custom-agent/
│   └── docs/          the backend's own design notes and ADRs
├── frontend/app/      @cat-factory/app, the Nuxt SPA layer
├── sdk/               the four official clients (typescript/, python/, go/,
│                      java/), plus mcp/ and gatekeeper/
├── deploy/            worked example deployments — the shape your own
│                      deployment repository copies
└── docs/              openapi.json and the canonical environment-variable
                       list, both of which this site renders
```

Two directories in that tree are the source of pages here rather than reading of their own:
`docs/openapi.json` is rendered as the [API Endpoint Reference](./api-reference.md), and
`docs/environment-variables.md` as [Environment Variables](./environment-variables.md). Both pages
carry a generated banner and a CI check, so neither can drift from the code.

`backend/docs/` is where the platform's own design notes live — deeper than this site goes, written
for someone changing the code rather than deploying it. Read them from a checkout; they assume one.

---

The platform is MIT licensed. Source, issues, and contribution guidelines live at
[kibertoad/cat-factory](https://github.com/kibertoad/cat-factory).

Next: [Architecture](./architecture.md) for how these pieces fit together at runtime, or
[Add a Custom Agent Kind](../extend/custom-agents.md) to build against them.
