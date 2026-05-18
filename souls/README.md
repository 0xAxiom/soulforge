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

A soul's frontmatter is validated against `schema/soul.schema.json` with `souls/validate.mjs`. From the repo root:

```bash
npm install                                       # one-time
npm run validate-souls                            # validates every souls/examples/*.md
node souls/validate.mjs path/to/your-soul.md      # validate a specific file
```

The validator exits non-zero on the first soul that fails, with a per-error path and reason. Both bundled examples pass.

## Optional frontmatter fields

Beyond the required fields, souls can declare behavioral hints in frontmatter that tooling and orchestrators can act on:

| Field | Values | Meaning |
|-------|--------|---------|
| `planning` | `scratchpad` \| `explicit-schema` \| `none` | How this agent plans before acting. `scratchpad` = reason goal → sub-steps → fallback before tool calls. `explicit-schema` = declare the full pipeline handoff record and step sequence before execution begins. See `examples/tool-planner-soul.md` and `examples/deterministic-workflow-soul.md`. |
| `tags` | list of strings | Free-form labels for soul registry/search. |

## Examples

| File | Pattern | When to copy it |
|------|---------|-----------------|
| `examples/starter-soul.md` | Minimal reference soul | Starting point for any new soul |
| `examples/tool-planner-soul.md` | GOAP planning posture | Agent loop — model decides next step; tasks where step sequence is unknowable upfront |
| `examples/deterministic-workflow-soul.md` | Typed step graph | Developer-defined sequence with typed handoff records between steps; halts cleanly on shape failures |

## Current boundary

The soul layer owns human-readable policy and schema validation. Generated agents keep executable wiring in their own `src/` files, not in the soul. If you need rendering, diffing, or provider-specific prompts, implement that as a tool or generator concern and keep the soul markdown provider-agnostic.
