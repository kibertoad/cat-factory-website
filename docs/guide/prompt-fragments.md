# Prompt Fragments

**Prompt fragments** are reusable, version-controlled guidelines that agents pull into their
prompts at run time. They're how you encode your team's standards — coding conventions, review
checklists, security rules — once and apply them everywhere.

## The three scopes

Fragments are organized in a tenant-scoped library with three tiers. Lower tiers layer on top of
higher ones:

| Scope | Applies to | Use it for |
| --- | --- | --- |
| **Built-in** | Everyone | Best practices shipped with the platform. |
| **Account** | All workspaces in your account | Organization-wide standards. |
| **Workspace** | A single board | Per-project customization. |

You can also **source fragments from a repository** so they live under version control alongside
your code.

## How agents use them

Agents **select the applicable fragments per run**, based on the pipeline configuration. That
means the right guidelines are injected for the right step — for example, a code-style fragment
for the coder and a review checklist for the reviewer — without you re-pasting them each time.

## Versioning

Fragments are **version-controlled**, and a specific version can be selected **per run**. This
gives you:

- A stable history of how guidance has changed.
- The ability to pin a run to a known fragment version.
- A clean way to evolve standards without disrupting in-flight work.

## Putting it together

```
Built-in defaults
   └─ + Account standards
        └─ + Workspace tweaks
             └─ selected per-run, per-step  →  agent prompt
```

::: tip Start small
Begin with one or two account-level fragments (a coding-style guide and a review checklist), then
add workspace fragments only where a specific board needs to differ.
:::

---

That completes the usage guides. For operating the platform, head to
[Deploy & Operate](../deploy/cloudflare.md), or browse the [Reference](../reference/architecture.md).
