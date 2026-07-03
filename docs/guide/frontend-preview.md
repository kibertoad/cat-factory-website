# Frontend Previews & UI Testing

A **frontend** [repository type](./repositories.md#repository-types) turns a service frame into a UI
app that Cat Factory can build, wire to its backends, and drive in a browser. Two things run off one
configuration:

- A **self-contained UI test**: in one container Cat Factory builds the app from its branch, points it
  at the live backend under test (and mocks every other upstream), serves it, and runs the **UI
  Tester** against it in a real browser. This works on every runtime and is torn down with the run.
- A **browsable preview** (Local and Node runtimes): a long-lived build-and-serve you can open in your
  own browser at a stable URL to click through the app with its upstreams mocked.

## Configuring a frontend frame

Open a frontend frame's **Frontend** inspector panel. Its fields are grouped into collapsible
sections:

| Group | What it sets |
| --- | --- |
| **Build** | Package manager (`pnpm`/`npm`/`yarn`), the frontend directory, install command, build script, and output directory. |
| **Serve** | How the built app is served, and on which port. |
| **Mocking** | The WireMock mappings directory (default `mocks/`), holding stub mappings and response bodies for upstreams. |
| **Env injection** | How backend URLs reach the app: **Build-time** (as build env vars) or **Runtime** (written into a `window.env` shim). |
| **Backend bindings** | Which backend each env var points at (see below). |
| **Preview** | The browsable-preview toggle (see below). |

### Serve modes

The **Serve** group offers two modes:

- **Static**: serve the built output directory as static files. The cheapest option for testing a
  fully built app.
- **Command**: run a `package.json` script (for example `preview`) to serve the app, for builds that
  need a running server. You name the serve script and the port (default 4173).

Serve mode is separate from **Env injection**: serve mode is how the app is served, env injection is
how backend URLs reach it.

### Detect from repo

Rather than filling every field by hand, click **Detect**. Cat Factory reads the linked repo and
proposes a config for you to review before anything is saved: it infers the package manager and
install command from the lockfile, the output directory and build script from the framework (Vite,
Create React App, Nuxt, Next.js, Angular), the serve mode from a `preview`/`serve` script, and
candidate backend bindings from env-var names in `.env.example`-style files. Each proposal carries a
**sure** or **guess** confidence badge; you **Apply** or **Dismiss**. Detected bindings are appended,
never overwriting an existing service link.

For a monorepo, set the **Frontend directory** (the app's subfolder, e.g. `frontend/`) first: it
scopes both what Detect reads and where install, build, and serve run. Leave it empty when the app is
at the repo root.

## Backend bindings

A binding maps one frontend **env var** to a source:

- **A backend service**: the env var resolves to that service frame's live ephemeral-environment URL
  during a run, so the frontend talks to the real backend under test. This draws a cyan edge on the
  board from the frontend to the backend, so you can see what a frontend is wired to.
- **A mock (WireMock)**: the env var points at WireMock on localhost, served from your mappings
  directory.

The **Resolves to** view in the inspector shows, per env var, whether it currently resolves to a live
environment or is mocked, and warns when two bindings share an env var (only the last applies) or when
a bound service has no live environment (it falls back to the mock).

When a run starts, non-fatal notes are stamped on it if some bound services are live and others fall
back to mocks, or if an env var is duplicated. A frontend whose only bound service has no live
environment is refused at start with a clear reason rather than testing against a half-wired app.

## Running a UI-test pipeline

A pipeline is a **visual** pipeline when it contains a **UI Tester** or **Visual Confirmation** step
(for example the **Build & visual confirmation** pipeline). A visual pipeline only runs on a
**frontend** frame, or a frame a frontend binds to; starting one on a plain backend frame is refused,
and the pipeline pickers hide visual pipelines for frames that can't run them.

The UI-test flow and the **Visual Confirmation** gate are covered in
[Running Pipelines → Visual confirmation](./running-pipelines.md#visual-confirmation).

## Browsable preview

On Local and Node deployments you can keep a served preview running past a run and open it in your own
browser. Turn on **Enable browsable preview** in the frontend inspector's **Preview** group, then use
**Start preview**, **Open preview** (the clickable URL once it's ready), and **Stop**. Status reads
Starting, Running, Failed, or Not running.

The preview mocks upstreams the same way the UI test does, so you get a clickable app without standing
up its backends. On runtimes that can't host it (the Cloudflare Worker), the toggle is disabled with a
note to run on Local or Node.

::: tip Local port
In local mode the preview is served on the frontend's configured serve port (default 4173), so its URL
is stable at `http://localhost:<port>`. If that port is already in use (a second preview, or a local
`vite preview`), starting the preview reports the clash instead of picking a random port. Free the
port and start again.
:::
