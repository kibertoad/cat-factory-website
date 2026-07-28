# Notifications

Cat Factory raises a notification whenever a run needs attention or reaches a milestone: a merge
review is waiting, a pipeline completed, CI failed, or a requirement review is ready. Every
notification lands in the in-app inbox. Slack and an outbound webhook are optional additional
transports for the same events.

## In-app inbox

The inbox is always on and needs no configuration. Notifications fan out live over the same stream
that drives the board, so they appear the moment an event fires on any workspace you can see.

## Slack

Slack delivery is opt-in at the deployment and connected per workspace, so each team posts into its
own Slack with its own routing. The bot token is encrypted at rest under
[`ENCRYPTION_KEY`](./configuration.md#credential-encryption).

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
raised. This is the transport a headless integration needs: a [public-API](../reference/public-api.md)
caller has no inbox to watch and no browser holding a WebSocket, so without a push it only learns that
its run parked by polling.

Manage it on the workspace's `notification-webhook` endpoint (session-authenticated, behind the
`integrations.manage` permission):

| Method & path | What it does |
| --- | --- |
| `GET /workspaces/:workspaceId/notification-webhook` | Return the registered webhook, or `null`. Never returns the secret. |
| `PUT /workspaces/:workspaceId/notification-webhook` | Register or update it. Body `{ url, types?, enabled?, secret? }`. |
| `DELETE /workspaces/:workspaceId/notification-webhook` | Remove it (deliveries stop). Idempotent. |

`url` must be `https://`. `secret` is write-only: omit it to keep the stored one, pass a new value to
rotate it. Omitting `types` delivers the defaults, the cards a headless overseer must react to:
`requirement_review`, `clarity_review`, `decision_required`, `fork_decision_pending`, `merge_review`,
`pipeline_complete`, `ci_failed`, and `test_failed`. Operator-only cards such as `platform_health` and
`budget_paused` are excluded by default so the endpoint isn't a firehose; list them explicitly if you
want them.

Each delivery POSTs `{ deliveryId, sentAt, workspaceId, runId, taskId, notification }`. `runId` and
`taskId` are lifted out of the card so a receiver can route without unpacking it, and `deliveryId` is
stable across retries so you can dedupe on it. Two headers carry the authenticity proof:

| Header | Value |
| --- | --- |
| `x-cat-factory-timestamp` | Epoch milliseconds the delivery was produced. |
| `x-cat-factory-signature` | `v1=<hex HMAC-SHA256>` over `<timestamp>.<body>`, keyed by your secret. |

Delivery is best-effort and bounded: a few attempts inside a short wall-clock budget, giving up on a
4xx. The budget is deliberately tight because raising a notification is what parks a run, so a dead
receiver can never add seconds of latency to the park itself.

By default the endpoint must be a public host: private, internal, and cloud-metadata addresses are
blocked. Widen it with `NOTIFICATION_WEBHOOK_ALLOW_URL_HOSTS` and `NOTIFICATION_WEBHOOK_ALLOW_HTTP_URLS`
(see [Configuration → Notifications](./configuration.md#notifications-slack-and-webhooks)). That guard
is scoped to webhooks alone: widening it does not widen the runner-pool or environment guards.

---

Next: see the full variable list in [Configuration](./configuration.md), or scale execution with
[Runner Pools](./runner-pools.md).
