# Eval Guide

Use `eval/` for repo-level soul evals and generated agent `eval/` folders for local replay.

Golden requirements:

- `input`
- `expected_behavior` or `must_include`
- `criteria`
- `allowed_tools`
- `refusal_expected`
- `tags`

Rules:

- Add at least one refusal golden per agent.
- Cache expensive calls by content hash.
- Diff soul versions with the same goldens.
- Eval replay must not move money or call live social APIs.

Repo commands:

```bash
npm run eval -- run --soul souls/examples/starter-soul.md
npm run eval -- diff --a souls/examples/starter-soul.md --b souls/examples/starter-soul.md
```
