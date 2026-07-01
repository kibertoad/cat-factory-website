# Kubernetes

Cat Factory runs on Kubernetes two ways, and they are independent. You can use either, both, or
neither:

- **Agent containers**: run each per-run coding job as a Kubernetes pod, instead of a manifest-driven
  [runner pool](./runner-pools.md) or local Docker.
- **Ephemeral environments**: provision a per-PR preview by applying your repo's own manifests into a
  namespace, instead of the generic [HTTP manifest provider](./environments.md).

Both are native backends: you fill in a form, not a manifest. You configure them in the top-level
**Infrastructure** window, under the **Agent containers** and **Test environments** tabs. On a
developer machine, the [`cat-factory k3s` guided setup](#local-k3s-guided-setup) wires a local
cluster into both in one command.

## Agent containers on Kubernetes

Select **Kubernetes** on the **Agent containers** tab and fill in the connect form. It creates one
pod per run, running the executor-harness image.

| Field | Purpose |
| --- | --- |
| **Label** | Human name for the connection. |
| **API server URL** | The kube-apiserver root, e.g. `https://cluster.example:6443`. |
| **Namespace** | Namespace the per-run pods are created in. |
| **API token** | A ServiceAccount bearer token, stored encrypted at rest (write-only). |
| **CA certificate** (PEM) | Optional. Verifies the apiserver's TLS certificate. |
| **Skip TLS verify** | Optional. Dev clusters with self-signed certs only. |
| **Image** | The executor-harness image reference. |
| **UI image** | Optional. A heavier Playwright image for the UI Tester. |
| **Deploy image** | Optional. A `kubectl`/`kustomize`/`helm` image, required for container-side manifest rendering. |
| **Image pull secret** | Optional. Name of an `imagePullSecrets` entry for a private registry. |
| **ServiceAccount** | Optional. The ServiceAccount the pod runs as. |
| **Resources** | Optional. Default pod requests/limits (`cpu`, `memory`), with per-instance-size overrides. |
| **Node selector / tolerations / labels / annotations** | Optional. Standard pod placement and metadata. |

Use **Test connection** to probe the apiserver before you save. This is an alternative to a
[runner pool](./runner-pools.md): a deployment reaches Kubernetes directly rather than dispatching to
a scheduler over HTTP.

## Ephemeral environments on Kubernetes

Select **Kubernetes** on the **Test environments** tab to provision a per-PR preview by applying the
repo's own manifests into a fresh namespace, then tearing it down when the run finishes.

| Field | Purpose |
| --- | --- |
| **Label** | Human name for the connection. |
| **API server URL**, **API token**, **CA certificate**, **Skip TLS verify** | Reach and authenticate to the cluster, same as above. |
| **Namespace template** | Per-PR namespace name, e.g. `cf-env-{{pullNumber}}`. |
| **Manifest source** | Where the manifests live (see below). |
| **URL source** | How the preview's live URL is derived (see below). |
| **Image template** | Optional. The CI-built image tag to roll out, e.g. a branch or SHA tag. |
| **Default TTL** | Optional. Fallback lifetime for auto-teardown. |
| **Rollout timeout** | Optional. How long to wait for the Deployment to roll out (180s default). |

### Where the manifests come from

- **Colocated**: a path inside the PR repo, e.g. `k8s/preview`.
- **Separate**: a different repo (`owner/repo`), an optional ref, and a path, for teams that keep
  deployment manifests out of the app repo.

A **renderer** turns the source into applied resources: `raw` (plain YAML, the default) or
`kustomize`. Kustomize and Helm versions must be pinned; floating tags like `latest` or `^1.0` are
rejected so a preview is reproducible. Image overrides use the kustomize `images:` shape; secret
injection is either a `Secret` resource or a `generatorEnvFile` `.env` consumed by a
`secretGenerator`.

### How the preview URL is resolved

Pick the **URL source** that matches how your cluster exposes services:

- **Ingress template**: build the host from a template, e.g. `{{branch}}.preview.example.com`.
- **Ingress status**: read the address back from a named Ingress once it is admitted.
- **Service status**: read a `LoadBalancer` Service's external address, with an optional port.
- **Gateway status** / **HTTPRoute status**: read a Gateway-API `Gateway` address, or resolve an
  `HTTPRoute` through its parent Gateway.

Each source takes an optional scheme (`http`, `https`, or left at the default, which is inferred from
the resource).

## Per-service provision types

A preview needs two decisions: **what** to stand up (the service's manifests) and **where/how** to
run it (the cluster and engine). Cat Factory splits them so a service owns the first and the workspace
owns the second.

Each service declares a **provision type**, the shape it produces:

| Provision type | Produces |
| --- | --- |
| `kubernetes` | A manifest source (colocated or separate) plus render inputs (images, Helm releases, secret injections). |
| `docker-compose` | A path to a compose file in the repo. See [Docker Compose environments](./environments.md#docker-compose-environments). |
| `custom` | Whatever a [custom manifest type](#custom-manifest-types) accepts. |
| `infraless` | Nothing; the service provisions no environment. |

The workspace then maps each provision type to a **handler** on the **Test environments** tab: an
**engine** plus its connection. A `kubernetes` service routes to either **Local k3s** (local mode) or
**Remote Kubernetes**; a `docker-compose` service routes to **Local Docker**; a `custom` service
routes to the matching remote-custom handler. This is why one workspace can preview a Kubernetes
service and a Compose service side by side: each provision type has its own handler.

### Auto-detecting a service's configuration

When you add a service from a repo, Cat Factory inspects the repo and pre-fills the provisioning
config. It is monorepo-aware and offers candidates rather than guessing once:

- **Manifest roots**: directories that look like a manifest tree (`k8s/`, `deploy/`, `manifests/`).
- **Overlays**: directories under `overlays/`, ranked so a `prenv`/`preview`/`pr`/`ephemeral` overlay
  is offered first.
- **Service directories**: for a monorepo service, the root-shared slices that belong to it
  (`deploy/api`, `k8s/auth`).
- **Compose services**: the services defined in a compose file (advisory).

Each candidate carries a short note explaining the confidence and rationale, so you can accept the
detected value or pick a different candidate.

### Custom manifest types

When a platform's deployment definition doesn't fit the built-in Kubernetes or Compose shapes,
register a **custom manifest type** on the **Test environments** tab. A type carries:

- A **manifest id** (a kebab slug) and a human **label**.
- An optional **default manifest path** used to seed path auto-detection.
- An optional **input hint** and **description** describing what the provider expects.
- An optional **fixer prompt** for the generate/fix agent below.

A service on the `custom` provision type names the manifest id; the workspace's matching
remote-custom handler provisions it.

### Generating or repairing the manifest

If a repo has no valid deployment manifest, Cat Factory can dispatch a coding agent to write or fix
one instead of failing the first run. The **env-config-repair** run clones the repo at the target
branch, uses the custom type's fixer prompt (or the built-in Kubernetes logic) to generate or repair
the manifest file in place, pushes the fix onto the same branch (or opens a PR), and re-validates.
The agent only edits an existing repo; it never re-initialises history or force-pushes. It runs as a
durable, tracked run like any other.

## Local k3s guided setup

On a developer machine, `cat-factory k3s` wires a local Kubernetes cluster into the app in one
command. It never mutates anything without asking:

```bash
cat-factory k3s               # probe, offer options, provision, hand off to the app
cat-factory k3s --k3s-runtime podman
cat-factory k3s --no-open     # print the deep-link instead of opening a browser
```

The command:

1. **Probes** the host for `kubectl`, `k3d`, `kind`, and `k3s`, a running Docker daemon, and any
   reachable cluster.
2. **Offers** a short menu: reuse an existing cluster, create a **k3d** cluster (the default when
   Docker is running), create a **kind** cluster, or install **k3s** (Linux only; the `sudo` command
   is printed, never run for you).
3. **Provisions** a least-privilege ServiceAccount and RBAC (never `cluster-admin`) and mints a
   long-lived token.
4. **Hands off** to the SPA: it prints the connection once to the terminal and opens a deep link that
   pre-fills the **Local k3s** connect form. The token is deliberately kept out of the URL, so you
   paste it from the terminal, then click **Test** and **Save**.

k3s itself runs only on Linux. On Windows and macOS the command steers you to k3d (k3s inside
Docker); a Windows walkthrough ships in the repo under `backend/docs`.

Selecting the **Local k3s** preset by hand (without the CLI) pre-fills the Kubernetes environment
form with local defaults: a `cf-env-{{pullNumber}}` namespace, a `{{branch}}.127.0.0.1.nip.io` host
(nip.io wildcard DNS, no local setup), and skipped TLS verification for the cluster's self-signed
cert.

---

Next: give agents somewhere to test their work with [Ephemeral Environments](./environments.md), or
bring your own scheduler with [Runner Pools](./runner-pools.md).
