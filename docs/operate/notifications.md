---
redirectFrom:
  - /deploy/notifications.html
---

# Set Up Notifications

For whoever has to make sure a parked run reaches a human. Cat Factory raises a notification
whenever a run needs attention or reaches a milestone: a merge review is waiting, a pipeline
completed, CI failed, or a requirement review is ready. Every
notification lands in the in-app inbox. Slack and an outbound webhook are optional additional
transports for the same events.

## In-app inbox

The inbox is always on and needs no configuration. Notifications fan out live over the same stream
that drives the board, so they appear the moment an event fires on any workspace you can see.

## Slack

Slack delivery is opt-in at the deployment and connected per workspace, so each team posts into its
own Slack with its own routing. The bot token is encrypted at rest under
[`ENCRYPTION_KEY`](../deploy/configuration.md#credential-encryption).

### Enabling it on the deployment

```bash
SLACK_ENABLED=true
# Optional: enable the OAuth "Add to Slack" button instead of pasting a token by hand
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
SLACK_REDIRECT_URL=https://your-host/slack/oauth/callback
```

`SLACK_ENABLED=true` requires `ENCRYPTION_KEY`. The client credentials are optional: set them to
offer the OAuth flow; leave them unset and operators connect by pasting a bot token. On Cloudflare,
set `SLACK_CLIENT_SECRET` as a Worker secret.

### Connecting a workspace

Once Slack is enabled, a workspace admin connects Slack from the UI:

1. Open the workspace's integration settings.
2. Either click **Add to Slack** (OAuth, when client credentials are configured) or paste a bot
   token.
3. Choose which channel each board routes its notifications to.

### Mentions

Slack messages can @-mention by audience so the right people see the right event:

- Requirement reviews mention the product audience.
- CI failures and merge reviews mention the engineering audience.
- The task's creator is always mentioned.

Map your members to those audiences in the workspace's Slack settings. Each mapping row needs both a
user id and a Slack member id: a half-filled row blocks the save with a warning rather than being
silently dropped, so remove the row or complete it before saving.

## Outbound webhooks

A workspace can register one outbound HTTPS endpoint that receives its notifications as they are
raised. This is the transport a headless integration needs: a [public-API](../extend/public-api.md)
caller has no inbox to watch and no browser holding a WebSocket, so without a push it only learns that
its run parked by polling.

Manage it on the workspace's `notification-webhook` endpoint (session-authenticated, behind the
`integrations.manage` permission):

| Method & path | What it does |
| --- | --- |
| `GET /workspaces/:workspaceId/notification-webhook` | Return the registered webhook, or `null`. Never returns the secret. |
| `PUT /workspaces/:workspaceId/notification-webhook` | Register or update it. Body `{ url, types?, runEvents?, enabled?, secret? }`. |
| `DELETE /workspaces/:workspaceId/notification-webhook` | Remove it (deliveries stop). Idempotent. |

`url` must be `https://`. `secret` is write-only: omit it to keep the stored one, pass a new value to
rotate it.

### The two delivery families

One endpoint receives both families, told apart by the body's shape. Their filters have deliberately
opposite empty semantics.

**Notification cards** (`types`). Omitting `types`, or passing `[]`, delivers the defaults, the cards
a headless overseer must react to: `requirement_review`, `clarity_review`, `decision_required`,
`fork_decision_pending`, `merge_review`, `pipeline_complete`, `ci_failed`, `test_failed`, and
`deploy_blocked`.
Operator-only cards such as `platform_health`, `budget_paused`, and `key_drift` are excluded by
default so the endpoint isn't a firehose; list them explicitly if you want them. A card is pushed
when it is raised and again when it is resolved.

**Run-lifecycle events** (`runEvents`). `run.started`, `run.completed`, and `run.failed`, one
delivery per transition. These cover the case no card does: a run that succeeds end-to-end raises no
notification at all. Omitting `runEvents`, or passing `[]`, delivers none of them, so a receiver
registered for parked decisions does not silently start hearing about every run. Subscribe per event:

```bash
curl -X PUT -H "Authorization: Bearer <session token>" -H 'content-type: application/json' \
  -d '{
    "url": "https://hooks.example.com/cat-factory",
    "secret": "<16-200 chars, used to sign deliveries>",
    "types": [],
    "runEvents": ["run.started", "run.completed", "run.failed"],
    "enabled": true
  }' \
  "$BASE/workspaces/$WORKSPACE_ID/notification-webhook"
```

A card delivery POSTs `{ deliveryId, sentAt, workspaceId, runId, taskId, notification }`. `runId` and
`taskId` are lifted out of the card so a receiver can route without reading into it. `deliveryId` is
`<notificationId>-<status>`.

A lifecycle delivery POSTs `{ deliveryId, sentAt, workspaceId, event, run }`, where `run` carries
`runId`, `taskId`, `taskTitle`, `pipelineId`, `pipelineName`, `startedAt`, `occurredAt`,
`pullRequestUrl`, and (on `run.failed`) `failure`. `deliveryId` is `<runId>:<event>`.

Dedupe on `deliveryId`, never on the body. `run.started` is exactly-once per run by construction, but
the terminal events are at-least-once: a durable replay can re-emit a settled run, and a replay
re-stamps `sentAt` and `occurredAt`, so two deliveries of one transition are not byte-identical. One
id comparison collapses them. A retry or restart mints a fresh run id and announces it as a new
`run.started`. Headless [public-API](../extend/public-api.md#headless-jobs) jobs emit no lifecycle
events.

Two headers carry the authenticity proof:

| Header | Value |
| --- | --- |
| `x-cat-factory-timestamp` | Epoch milliseconds the delivery was produced. |
| `x-cat-factory-signature` | `v1=<hex HMAC-SHA256>` over `<timestamp>.<body>`, keyed by your secret. |

Verify the signature against the raw request bytes, before any JSON parsing. The timestamp is bound
into the MAC, so you can trust it for replay rejection.

Delivery is best-effort and bounded: three attempts with exponential backoff, five seconds per
attempt and a six-second total budget, giving up on a 4xx. The budget is tight because raising a
notification parks a run, so a dead receiver can never add seconds of latency to the park itself.
That also means missed deliveries are possible: treat the webhook as a trigger and the API as the
source of truth, answer with a 2xx fast, and process asynchronously.

By default the endpoint must be a public host: loopback, RFC 1918, link-local, `.internal`/`.local`
hosts, embedded credentials, and cloud-metadata addresses are refused at registration and re-checked
on every delivery hop. Redirects are followed at most five times, each hop re-validated, and a
cross-origin hop drops the body and auth headers.
Widen it with `NOTIFICATION_WEBHOOK_ALLOW_URL_HOSTS` and `NOTIFICATION_WEBHOOK_ALLOW_HTTP_URLS`
(see [Configuration → Notifications](../deploy/configuration.md#notifications-slack-and-webhooks)). That guard
is scoped to webhooks alone: widening it does not widen the runner-pool or environment guards.

---

Next: see the full variable list in [Configuration](../deploy/configuration.md), or scale execution with
[Run Jobs on Your Own Runners](./runner-pools.md).
