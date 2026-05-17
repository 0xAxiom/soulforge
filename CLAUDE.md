# SoulForge — Agent Constitution

This file is the operating contract for any AI assistant (Claude, Codex, etc.) doing work inside this repository. Read it before making changes.

## What this repo is

An AI-native repository substrate for building production agents from natural-language instructions given to coding agents. The repo is organized around explicit primitives: **souls, tools, endpoints, memory, eval, observability**. The `.ai/` folder is the machine-readable guidance layer for coding agents, and `generator/` provides optional copyable scaffolds. See `README.md` and `docs/ARCHITECTURE.md`.

## What this repo is NOT

- Not a framework. There is no `soulforge` runtime to import. The repo provides schemas, templates, and reference implementations.
- Not opinionated about model provider. Examples may use Anthropic, OpenAI, or local models. Soul schema is provider-agnostic.

## Boundaries

| Layer            | Owner of decisions                              | Boundary                                              |
| ---------------- | ----------------------------------------------- | ----------------------------------------------------- |
| Repo structure   | Top-level architecture (`docs/ARCHITECTURE.md`) | New top-level folders require an explicit architecture update. |
| Module shape     | Each module's `README.md`                       | If module README and the code diverge, README is law. |
| Examples         | Each example's local `README.md`                | Examples are illustrative, not load-bearing.          |
| Soul schema      | `souls/schema/soul.schema.json`                 | Breaking changes require schema version bump.         |

## Editing rules

1. **No half-finished modules.** If you can't ship a module that runs end-to-end, ship a README that explains the direction and mark it explicitly as a v2 placeholder.
2. **No speculative abstractions.** Three concrete examples before extracting a shared utility. Two souls don't justify a soul framework yet.
3. **Update the docs in the same commit as the code.** README and ARCHITECTURE are not optional.
4. **Validate examples actually run.** A broken example is worse than no example.
5. **Souls are markdown, not YAML.** The schema describes structure; the file is human-readable first.

## Conventions

- **Language:** TypeScript for runnable code, Markdown for souls and docs, JSON Schema for soul validation.
- **Package manager:** npm (no pnpm/yarn lockfiles).
- **Node version:** >=20 (pin in `.nvmrc` if a module needs anything specific).
- **License:** MIT, declared at repo root.

## Doing work here

When asked to add a feature:

1. **Identify the primitive.** Soul, tool, endpoint, memory, eval, or observability? If it's none of these, the request is wrong for this repo.
2. **Find the right module.** Add implementation inside an existing primitive folder. Use `.ai/` only for machine guidance and `generator/` only for scaffold tooling.
3. **Show, don't tell.** New capability → working example. Schema change → updated soul that uses the change.
4. **Update READMEs upward.** Module README, then root README if the change is user-visible.

When asked to refactor:

1. Confirm the refactor is justified by current code, not anticipated needs.
2. Keep the diff small. One refactor per commit.
3. Don't churn formatting — the noise drowns out the signal.

## Forbidden

- Adding `.env` files with real credentials.
- Adding placeholder API keys that look real (`sk-...`).
- Adding a CONTRIBUTING.md until there's enough contributor activity to warrant one.
- Committing generated `node_modules`, `.next`, or `dist` directories.
- Pushing to `main` without verifying the example you touched still builds.
- Adding new top-level folders without updating `README.md`, `docs/ARCHITECTURE.md`, `CLAUDE.md`, and `.ai/repo-map.json`.

## Out of scope

SoulForge only builds agents. If a user asks for a mobile app, static website, dApp, or non-agent plugin, decline and explain that this repo is agent-only.
