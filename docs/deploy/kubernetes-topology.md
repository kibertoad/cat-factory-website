# Lay Out a Kubernetes Cluster

For the operator who has to decide where each piece runs before filling in a connect form: which
namespaces, which node pools, what the `NetworkPolicy` allows, what the ServiceAccount is allowed to
do, and how many run pods a workspace will want at once.

[Deploy on Kubernetes](./kubernetes.md) is the page for connecting a cluster you already have. This
one is the shape of the cluster itself. Everything here is a reference layout: namespace names, node
pools and managed services are yours to choose, and nothing in the product depends on the names used
below.

## The two backends differ in one hop

Cat Factory's runner backend is pluggable, and two of them reach Kubernetes:

- **Kubernetes (recommended).** The backend talks to the kube-apiserver directly. It creates the run
  pod, reads its status, drives the in-pod harness through the apiserver's pod-proxy, and deletes
  the pod when the run is done. Nothing extra to build or operate.
- **Manifest (bring your own scheduler).** You run a small HTTP service that Cat Factory calls with
  `dispatch`, `poll` and `release`, and your service translates those into cluster operations. Reach
  for it when apiserver access has to sit behind your own service, or when the scheduler is not
  Kubernetes at all (Nomad, an internal queue).

Everything else on this page (the control plane, the trust boundary, proxy-only model egress,
direct-to-GitHub) is the same either way. Only the dispatch hop moves. Start with Kubernetes, and
see [Bring your own scheduler](#bring-your-own-scheduler) for what changes.

## What runs where

| Component | What it is | Lifecycle | Where it belongs |
| --- | --- | --- | --- |
| **Backend** | The REST API, the WebSocket push transport, and the durable-execution workers that drive runs. With the Kubernetes backend it also drives the apiserver to create, poll and delete run pods. | Long-lived Deployment. The API scales horizontally; the durable-execution workers stay single-or-few. | Control-plane namespace, in cluster. |
| **Model proxy** | The OpenAI-compatible `/v1` route agents call. It injects the real vendor key (which never enters a run pod), meters spend and records telemetry. It ships in the same image as the backend. | Same Deployment as the backend, or its own Deployment of the same image when model egress needs separate scaling or a separate egress IP. | Control-plane namespace, in cluster. |
| **Postgres** | The domain database plus the telemetry schema. Migrations run on boot. | StatefulSet, or a managed service (RDS, Cloud SQL, Neon). | In cluster or your cloud. |
| **Run pods** | The executor-harness image: it clones the repo, runs the coding agent, pushes a branch and opens a pull request. It holds no standing secrets. | Ephemeral. One bare pod per run, named `cf-run-<runId>`, which the run's steps re-attach to and which is deleted on release. | Runner namespace, on its own node pool. |
| **Web app** | The single-page app, built to a static bundle. | Static. | A CDN, an object store, or an nginx pod. Out of cluster is fine. |

## Who owns what

**The control plane owns durable state and orchestration.** It drives the execution engine, persists
everything to Postgres, and pushes live run updates back to the browser over WebSocket. With the
Kubernetes backend it also holds the ServiceAccount token for the cluster (encrypted per workspace)
and the RBAC to manage run pods. API replicas scale freely.

**The runner namespace is the trust boundary.** A run pod is where model-authored code executes, so
treat it as the least trusted thing in the cluster. It receives short-lived per-job credentials in
its dispatch body (a VCS installation token and a model-locked proxy session token) and holds
nothing else. Give it its own namespace and node pool, and a `NetworkPolicy` that allows only the
two destinations in [What a run pod needs to reach](#what-a-run-pod-needs-to-reach). What an
adversarial agent can do from inside one is [Agent Isolation](../reference/agent-isolation.md).

**A run pod has no Service, on purpose.** It is reachable only through the apiserver's pod-proxy
subresource, which is gated by the ServiceAccount's RBAC. That is what lets the harness run with no
inbound shared secret of its own: there is no route to it that does not pass an authorization check
the apiserver makes.

**The proxy is the only path to model vendors.** Run pods never hold vendor API keys and never call
a vendor directly. They call the in-cluster `/v1` proxy with a session token; the proxy leases the
real key, forwards the call, meters the spend and records the telemetry. This is what makes
[budgets](../guide/budgets.md) apply to jobs running on your own cluster rather than only to hosted
ones. Subscription harnesses (Claude Code, Codex) are the exception: they reach the vendor API
directly with a longer-lived credential, so point those steps only at a pool you fully trust.

**Your VCS host is reached directly** by the run pod for clone, push and pull-request calls,
authenticated by the per-job installation token. It does not go through the proxy.

## The path a run takes

One pod serves a whole run. Each step dispatches to it and polls it; the pod is deleted only once
the run no longer needs it.

1. The engine mints the per-job credentials: a VCS installation token and a model-locked proxy
   session token, both scoped to this job.
2. It creates the pod `cf-run-<runId>`. A `409 AlreadyExists` is treated as an idempotent
   re-attach, so a later step or a replayed workflow lands on the pod that is already up rather than
   creating a second one.
3. It waits for the pod to become ready, then posts the job spec to the harness through the
   pod-proxy (`.../pods/<name>:8080/proxy/jobs` by default).
4. The pod clones the repository and starts the agent. Model calls go to the in-cluster proxy, which
   forwards them to the vendor with the real key and records what they cost.
5. The engine polls the job through the same pod-proxy every few seconds and turns the harness's
   progress into the step's live subtask counts.
6. The agent pushes its branch and opens the pull request directly against your VCS host.
7. When the run is finished with the pod, the engine deletes it, and the board updates over
   WebSocket.

## What the ServiceAccount is allowed to do

The token you paste into the connect form needs, in the runner namespace only:

| Resource | Verbs | Why |
| --- | --- | --- |
| `pods` | `create`, `get`, `delete` | Stand a run pod up, watch it become ready, reclaim it on release. |
| `pods/proxy` | `create`, `get` | Dispatch a job to the harness and poll it. This is the only route into a pod that has no Service. |

Nothing here needs `cluster-admin`, and nothing needs cluster-wide scope for the runner backend. The
[local k3s guided setup](./kubernetes.md#local-k3s-guided-setup) provisions a least-privilege
ServiceAccount along these lines if you want a worked example to copy. Ephemeral environments are a
separate job with a wider grant, because they create a namespace per pull request; see
[Provision Ephemeral Environments](../operate/environments.md).

## What a run pod needs to reach

Egress from the runner namespace can be closed down to two destinations:

- **The in-cluster model proxy**, at the public base URL the deployment advertises to run pods. Every
  model call goes here.
- **Your VCS host**, `github.com`, `gitlab.com`, or your self-hosted instance, for clone, push and
  pull-request calls.

A step running a subscription harness needs the vendor's own API host as well, which is the reason
those steps belong on a pool you trust. Anything else a job's own build needs (a package registry, a
private artifact store) is yours to allow deliberately: the default posture is that a run pod
reaches nothing it was not given a reason to reach.

## Reaching the apiserver

- **A private cluster address is fine.** The apiserver URL must be `https`, and cloud metadata
  endpoints are refused (including their obfuscated IP spellings), but a private cluster IP or a
  cluster DNS name is accepted: you are pointing the product at your own cluster on purpose.
- **Paste the cluster CA bundle** so the apiserver's certificate verifies. Skipping TLS verification
  is for kind and k3d development clusters, not for a cluster that matters.
- **A custom CA or skipped verification needs the Node or local runtime.** The Cloudflare Worker
  runtime cannot pin a custom CA, so it refuses such a connection at registration rather than
  failing mid-run. To run this backend on Cloudflare, give the apiserver a publicly trusted
  certificate.

## Reaping: a bare pod is not garbage collected

A run pod is a bare pod with `restartPolicy: Never`. It has no owner reference and no Job TTL, so
nothing in Kubernetes will clean it up for you:

- **Release is the cleanup path.** The engine deletes the pod when the run is done with it. A
  release that fails leaks the pod and the node slot it holds.
- **Set the harness watchdogs** on run pods (a maximum job duration and an inactivity timeout) so a
  hung agent ends itself rather than occupying the pool until someone notices.
- **Add a sweeper as a backstop.** Every run pod carries a `cat-factory.runId` label. A scheduled
  job that deletes labelled pods past a maximum age turns a leaked pod into a bounded cost. This is
  worth having even when releases are healthy, because the failure it covers is the one where the
  control plane went away mid-run.

## Sizing the pool

One pod handles a task's pipeline steps in sequence, so the number of pods in flight is the number
of runs in flight, not the number of steps. Size the runner node pool for concurrent runs across all
workspaces, and set default pod requests and limits on the connect form so a single run cannot take
a node hostage. Per-instance-size overrides let a heavier step (a UI tester carrying a browser) ask
for more than the default without raising it for everything.

## Bring your own scheduler

Choosing the manifest backend means the backend never touches the apiserver. It calls your scheduler
service over HTTPS with `dispatch`, `poll` and `release`, described by the JSON manifest you register
per workspace, and your service performs the cluster operations. The control plane, the proxy egress
rule, the trust boundary and the VCS path are all unchanged.

- **Map the three operations onto the cluster**: `dispatch` creates a Job, `poll` reads it and asks
  the harness for the job view, `release` deletes it. The format is
  [Integration Manifests](../extend/manifests.md#runner-pool-manifest); operating a pool is
  [Run Jobs on Your Own Runners](../operate/runner-pools.md).
- **Route by job id, stickily.** A durable replay re-dispatches the same job id, and your service is
  what decides whether that re-attaches or duplicates the work.
- **One Job per pipeline step** is the natural shape here, rather than the native backend's one bare
  pod per run.
- **A Job TTL is a real reaping backstop**, which the native backend cannot use because it creates
  no Jobs. Release stays best-effort cleanup, and the harness watchdogs still apply.
- **The scheduler URL is SSRF-guarded.** It must be public HTTPS by default. To keep the scheduler
  internal to the cluster with no public ingress, widen the guard to exactly that host:
  [Reaching an internal pool](../operate/runner-pools.md#reaching-an-internal-pool).

---

Next: connect the cluster you just laid out with [Deploy on Kubernetes](./kubernetes.md), or give
agents somewhere to test their work with
[Provision Ephemeral Environments](../operate/environments.md).
