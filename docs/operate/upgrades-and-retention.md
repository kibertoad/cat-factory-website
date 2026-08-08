# Upgrades & Data Retention

Two operator concerns that turn out to be one topic: what an upgrade is allowed to break, and what
your deployment keeps on disk between upgrades.

## What an upgrade may and may not break

The platform draws a hard line, and knowing where it is decides how much upgrade testing you owe.

**The public surface does not break.** The `/api/v1` paths, request and response shapes, error codes
and their machine-readable reasons, event names, scope semantics, the four
[official SDKs](../extend/sdks.md), and the outbound webhook contract are stable. Additive changes
are the normal mode: a new endpoint, a new optional field, a new enum value, a new error code. The
SDKs tolerate values they have never heard of by design, so an additive server release is not an
outage for a client you have not upgraded. Anything beyond additive ships an incremental migration
path first (the old shape keeps working beside the new one) and a version change with it.

**Everything internal may break.** Internal wire shapes, persisted rows the product re-creates,
tokens, and internal config carry no compatibility promise. When a change makes existing state
obsolete, the state is allowed to break and be re-created rather than being kept alive by a shim.
The release notes flag it.

The practical consequence: pin your integrations to `/api/v1` and the SDKs, and do not build on
anything you had to read the source to find.

## Upgrading a deployment

1. **Read the release notes for flagged breaks.** They name internal state that will be re-created
   and any migration path on the public surface.
2. **Mirror the runner image into your own registry under a fresh, immutable tag.** This is the step
   that most often goes wrong. The project publishes the executor-harness image and declares the
   supported tag, but a deployment pulls from its own registry, and **reusing an existing tag does
   not roll out**: the nodes keep the layer they already have. The symptom of getting this wrong is
   `Container dispatch failed (HTTP 404)` on every run.
3. **Let migrations run at boot.** The Node facade runs them before it starts taking work, so a
   migration failure is a clean boot failure rather than a half-migrated deployment serving traffic.
4. **Re-check what the release added to configuration.** New capabilities are opt-in and wire only
   when configured, so an upgrade never turns one on behind you, but it may add a variable you want.
   See [Environment Variables](../reference/environment-variables.md).
5. **Watch the first few runs.** [Run and step diagnostics](./observability.md#run-and-step-diagnostics)
   shows a dispatch failure immediately; a stale image tag shows up there before anyone reports it.

::: tip Built-in presets and pipelines are reconciled, never overwritten
An upgrade that ships a newer built-in model preset or pipeline surfaces an advisory rather than
rewriting what you have edited. Adopting it is a click, and a preset you have customised stays as
you left it until you choose to reseed.
:::

## Where your data lives

Three stores, split on purpose, and the split is what makes the retention windows below independent:

- **The transactional store** holds the board, runs, settings, and connections. It is not pruned by
  age: it holds the product's state, not its history.
- **The telemetry store** holds per-call model telemetry and captured agent context. It is separate
  because it is append-heavy and pruned aggressively, and because losing it costs you a
  post-mortem rather than the product.
- **The audit log** is separate for the opposite reason: it must outlive everything around it, so
  it is never pruned on the same cadence as the operational data.

## Retention windows

Every window is an environment variable, so you set the trade between disk and how far back an
investigation can reach. A non-positive value disables that table's pass entirely.

| Variable | What it prunes | Default |
| --- | --- | --- |
| `LLM_CALL_METRICS_RETENTION_DAYS` | Per-call model telemetry and agent-context snapshots | 14 days |
| `PROVISIONING_LOG_RETENTION_DAYS` | The infrastructure provisioning event log | 14 days |
| `GITHUB_RATE_LIMIT_RETENTION_DAYS` | Rate-limit telemetry rows | 7 days |
| `NOTIFICATION_RETENTION_DAYS` | Resolved notifications. Open cards are never pruned | 90 days |
| `GITHUB_COMMIT_RETENTION_DAYS` | The commit projection, and the initial backfill's reach | 90 days |
| `GATE_OUTCOME_RETENTION_DAYS` | The settled-gate projection behind gate statistics | 90 days |
| `TOKEN_USAGE_RETENTION_DAYS` | The token-usage ledger | 395 days |
| `PLATFORM_RUN_DAY_RETENTION_DAYS` | The daily run rollup behind the 30- and 90-day dashboard windows | 400 days |
| `AUDIT_EVENT_RETENTION_DAYS` | The account audit log. `0` disables the prune entirely | 730 days |

Two windows deserve a second look before you tune them:

- **Model-call telemetry defaults to 14 days because a shorter window expires the record before most
  investigations start.** A run that failed over a weekend is the case that matters. The heavy half
  is the captured bodies, and those are double-gated (a deployment switch plus a per-workspace
  toggle), so a deployment that stores bodies and wants a smaller footprint can shorten this window
  without losing the numeric telemetry.
- **Durable cost attribution has no retention window at all**, deliberately. A total-cost-of-
  ownership table that expires is a slower ledger, not a smaller one.

The prune runs as a cron beside the run sweeper, isolated per table: one table's failure is reported
and does not stop the rest. See [Retention cron](./observability.md#retention-cron).

## Keeping less in the first place

Retention bounds how long something is kept. Two switches decide whether it is captured at all:

- **Prompt and agent-context capture is off unless both a deployment switch and the workspace's own
  toggle are on.** Numeric telemetry (tokens, timing, finish reason, counts) is recorded either way.
  See [Controlling prompt retention](./observability.md#controlling-prompt-retention).
- **Trace export is opt-in per destination.** Nothing leaves the deployment until you configure a
  sink.

---

Next: [Observability](./observability.md) for what the stores hold, or
[Troubleshooting](./troubleshooting.md) when an upgrade does not take.
