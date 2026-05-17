# souls/

A **soul** is a versioned authoring of an agent's identity, voice, values, and limits. It is markdown that a human can read, with a small amount of structured metadata that a machine can validate.

## Why markdown

Souls are edited often, by people who are not always engineers. A YAML schema-only soul is hostile to that workflow. A markdown soul with a frontmatter block keeps the writing primary and the structure light.

## Structure

```markdown
---
name: my-agent
version: 0.1.0
provider_hint: anthropic | openai | local
scope:
  - one
  - sentence
  - per
  - line
refuses:
  - one
  - sentence
  - per
  - line
---

# Identity

Who is this agent. One paragraph.

# Voice

How does it speak. Bullet list of three to seven traits, with one example each.

# Values

What does it care about. Bullet list, with rationale.

# Limits

What does it refuse to do, and how does it refuse. Specific examples.

# Tools

Brief description of each capability the agent has. Full type definitions live in the agent's code.

# Memory

What it remembers, what it forgets, what triggers reflection.
```

The frontmatter is validated against `schema/soul.schema.json`. The sections under `# Identity` etc. are convention, not strict requirement — but every soul in `examples/` follows the same shape, and tooling assumes it.

## Validation

```bash
# Coming in v2: soulforge soul validate <path>
# v1: validate the frontmatter against the JSON Schema manually
```

## Example

See `examples/starter-soul.md` for a complete, runnable soul.

## What's not here yet (v2)

- A soul → system-prompt compiler.
- A soul renderer for human review.
- A soul diff tool that shows semantic changes between versions.
- A soul library/registry.

v1 is the schema and one example. The tooling follows once the shape has been used enough to know what's actually needed.
