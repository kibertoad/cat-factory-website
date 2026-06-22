# Notifications

Cat Factory raises a notification whenever a run needs attention or reaches a milestone: a merge
review is waiting, a pipeline completed, CI failed, or a requirement review is ready. Every
notification lands in the in-app inbox. Slack is an optional second transport for the same events.

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

Map your members to those audiences in the workspace's Slack settings.

---

Next: see the full variable list in [Configuration](./configuration.md), or scale execution with
[Runner Pools](./runner-pools.md).
