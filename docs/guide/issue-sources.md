# Issue & Document Sources

Most requirements already live somewhere — a tracker ticket or a spec document. Cat-Factory lets
you **link those sources directly to blocks**, import them, and use them as agent context.

## Supported sources

| Type | Sources |
| --- | --- |
| **Issue trackers** | Jira, Linear, GitHub Issues |
| **Documents** | Confluence, Notion |

## Linking a source to a block

Attach one or more sources to a block to bring their content into its context:

1. Link the **Jira/Linear/GitHub issue** or **Confluence/Notion document**.
2. **Import and expand** it into structural components — descriptions, and where appropriate,
   child blocks.
3. The imported content becomes part of the block's [requirements](./requirements.md) and is used
   as **agent context** during runs.

## From import to structure

Multi-source requirements aren't just pasted in — they can be **expanded into structural
components** on the board. A large epic, for example, can seed a module with several task leaves,
each carrying the relevant slice of context.

## Using sources as agent context

Once linked and imported, source content travels with the block:

- The **reviewer agent** uses it to find gaps and risks.
- The **coder agent** uses it to implement the task accurately.
- Subsequent steps reference the same shared definition.

## Enabling integrations

Document and issue integrations are controlled by **feature toggles and credentials** on the
deployment side — for example, Confluence and Notion API access. See
[Configuration](../deploy/configuration.md#feature-toggles) for the relevant settings.

::: tip Keep the source of truth where your team works
Linking beats copy-pasting: when the upstream ticket or doc is the canonical spec, importing keeps
the agent's context aligned with what your team is actually tracking.
:::

---

Next: keep agent costs predictable with [Budgets & Spend](./budgets.md).
