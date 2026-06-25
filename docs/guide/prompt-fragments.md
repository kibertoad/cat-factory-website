# Prompt Fragments

Prompt fragments are reusable, version-controlled guidelines that agents pull into their
prompts at run time. Encode your team's standards once - coding conventions, review
checklists, security rules - and apply them everywhere.

## The three scopes

Fragments are organized in a tenant-scoped library with three tiers. Lower tiers layer on top of
higher ones:

| Scope | Applies to | Use it for |
| --- | --- | --- |
| **Built-in** | Everyone | Best practices shipped with the platform. |
| **Account** | All workspaces in your account | Organization-wide standards. |
| **Workspace** | A single board | Per-project customization. |

You can also source fragments from a repository so they live under version control alongside
your code. On Node and local that library source is opt-in: set
[`PROMPT_LIBRARY_ENABLED`](../deploy/configuration.md#feature-toggles).

## How agents use them

Fragments are assigned **per service**. You choose which fragments a
service uses in its inspector, and from then on every run on that service applies them. To avoid
setting the same list on each new service, set **workspace defaults** that new services inherit.

Fragments only fold into **code-aware** agent kinds (such as the coder, CI fixer, fixer, reviewer,
and architect). A code-style or review-checklist fragment reaches those steps automatically; steps
that never touch code are left untouched.

## Versioning

Fragments are version-controlled. This gives you:

- A stable history of how guidance has changed.
- The ability to pin a service to a known fragment version.
- A clean way to evolve standards without disrupting in-flight work.

## Putting it together

```
Built-in defaults
   └─ + Account standards
        └─ + Workspace tweaks
             └─ assigned per service  →  code-aware agent steps
```

::: tip Start small
Begin with one or two account-level fragments (a coding-style guide and a review checklist), then
add workspace fragments only where a specific board needs to differ.
:::

---

That completes the usage guides. For operating the platform, head to
[Deploy & Operate](../deploy/cloudflare.md), or browse the [Reference](../reference/architecture.md).
