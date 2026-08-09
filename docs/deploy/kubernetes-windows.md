# Set Up a Local Kubernetes Cluster on Windows

For a developer running Cat Factory on a Windows machine who wants the Kubernetes backends locally:
agent containers as pods, ephemeral test environments in real namespaces, or both. It installs the
four CLIs without administrator rights, brings up a throwaway cluster, and hands off to the connect
form.

You are probably here because `cat-factory k3s` sent you. That command installs k3s directly on
Linux and cannot on Windows, so it points at this page instead and picks the cluster up on its next
run.

[Deploy on Kubernetes](./kubernetes.md) is the page for connecting a cluster you already have, and
[Lay Out a Kubernetes Cluster](./kubernetes-topology.md) is for a cluster that matters. This one is
a local cluster on a laptop.

## Why k3d rather than k3s

k3s is Linux-only: there is no native Windows build. k3d runs a real k3s cluster **inside Docker**,
which on Windows means Docker Desktop. You get the same distribution and the same behaviour, one
container layer down, and no WSL2 k3s install to maintain.

Pointing at a k3s running inside WSL2 works too and is supported, but k3d on Docker Desktop is the
shorter path and the one this page installs.

## Before you start

**Docker Desktop, running.** The cluster's nodes are Docker containers. Check with
`docker version`.

Nothing else is required. The steps below download release binaries into a per-user directory, so
there is no package manager to install, no UAC prompt, and nothing written to `Program Files`.
Chocolatey and winget also carry all four tools if you prefer them; `choco install` needs
elevation.

## Install the CLIs

Four tools: `kubectl` drives the cluster, `k3d` creates it, and `kustomize` and `helm` render the
manifests an ephemeral environment deploys. Run this in PowerShell.

```powershell
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'                       # faster Invoke-WebRequest
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$bin = Join-Path $env:USERPROFILE 'bin'
New-Item -ItemType Directory -Force -Path $bin | Out-Null
$tmp = Join-Path $env:TEMP 'k8s-dl'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

# kubectl (single exe)
Invoke-WebRequest 'https://dl.k8s.io/release/v1.36.3/bin/windows/amd64/kubectl.exe' -OutFile "$bin\kubectl.exe"

# k3d (single exe, renamed)
Invoke-WebRequest 'https://github.com/k3d-io/k3d/releases/download/v5.7.5/k3d-windows-amd64.exe' -OutFile "$bin\k3d.exe"

# kustomize (the Windows asset is a .zip)
Invoke-WebRequest 'https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize/v5.8.1/kustomize_v5.8.1_windows_amd64.zip' -OutFile "$tmp\kustomize.zip"
Expand-Archive "$tmp\kustomize.zip" -DestinationPath "$tmp\kustomize" -Force
Move-Item "$tmp\kustomize\kustomize.exe" "$bin\kustomize.exe" -Force

# helm (the .zip contains windows-amd64\helm.exe)
Invoke-WebRequest 'https://get.helm.sh/helm-v4.2.3-windows-amd64.zip' -OutFile "$tmp\helm.zip"
Expand-Archive "$tmp\helm.zip" -DestinationPath "$tmp\helm" -Force
Move-Item "$tmp\helm\windows-amd64\helm.exe" "$bin\helm.exe" -Force

# Add the bin dir to the USER PATH (persistent, no admin). Skips if already present.
$userPath = [Environment]::GetEnvironmentVariable('Path','User')
if (($userPath -split ';') -notcontains $bin) {
  [Environment]::SetEnvironmentVariable('Path', "$userPath;$bin", 'User')
}
```

On **arm64** Windows, swap `amd64` for `arm64` in the URLs. All four publish arm64 builds, and the
helm and kustomize archives put their binary under `windows-arm64` instead.

The versions above are the ones Cat Factory's own deploy image ships, so a local run behaves like a
deployed one. Any recent release drives a cluster fine; pin these if you want to reproduce what the
product does when it renders manifests for you.

Open a **new** terminal so the PATH change takes effect, then verify:

```powershell
kubectl version --client   # Client Version: v1.36.3 ; Kustomize Version: v5.8.1 (bundled)
kustomize version          # v5.8.1
helm version --short       # v4.2.3+g...
k3d version                # k3d version v5.7.5
```

### Docker Desktop ships its own kubectl

Docker Desktop installs a `kubectl` of its own under
`C:\Program Files\Docker\Docker\resources\bin`, which sits on the **machine** PATH. Windows searches
the machine PATH before the user PATH, so a bare `kubectl` in a fresh shell may resolve to Docker's
client rather than the one you just installed.

Both drive a k3d cluster (a slightly older client is compatible), so this is usually harmless. To
make yours win:

- call it explicitly: `& "$env:USERPROFILE\bin\kubectl.exe" ...`, or
- prepend the directory for the session: `$env:Path = "$env:USERPROFILE\bin;$env:Path"`, or
- with admin rights, move `%USERPROFILE%\bin` ahead of the Docker entry on the machine PATH.

`helm`, `kustomize` and `k3d` have no such conflict: Docker Desktop ships none of them.

## Bring up the cluster

```powershell
# A single-server cluster. Disabling traefik frees port 80 for test workloads;
# drop that flag if you want the built-in ingress and load balancer.
k3d cluster create cf-local --servers 1 --api-port 127.0.0.1:6443 `
  --k3s-arg "--disable=traefik@server:*" --wait --timeout 180s

kubectl get nodes -o wide        # the k3d-cf-local-server-0 node should be Ready
```

`k3d cluster create` writes and merges your kubeconfig and switches the current context, so
`kubectl` and `helm` talk to the new cluster immediately. The first create pulls the `rancher/k3s`
and k3d helper images (a few hundred MB) once; later ones are fast.

Tear it down with `k3d cluster delete cf-local`. Nothing outside Docker is left behind.

## Point Cat Factory at it

Re-run the guided command, which now finds the cluster:

```powershell
cat-factory k3s
```

It probes the host, offers to reuse the cluster you just created (or to create another), applies a
least-privilege ServiceAccount and RBAC rather than `cluster-admin`, mints a token, and opens the
Infrastructure form pre-filled. The token is printed to the terminal rather than put in the URL, so
you paste it, then use **Test** and **Save**. The full walkthrough, including the deploy runner a
test environment also needs, is
[Local k3s guided setup](./kubernetes.md#local-k3s-guided-setup).

To fill the form yourself instead, the connection is your new cluster: API server
`https://127.0.0.1:6443`, the ServiceAccount token, and **Skip TLS verify** for a throwaway cluster
whose apiserver certificate is self-signed. Both the **Agent containers** and **Test environments**
tabs accept it; see [Deploy on Kubernetes](./kubernetes.md) for what each field does.

---

Next: connect the cluster on [Deploy on Kubernetes](./kubernetes.md), or set up the rest of a local
install with [Run Cat Factory Locally](./local.md).
