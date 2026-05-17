# Natural-Language Task Routing

Use this file when a developer asks for an agent in natural language.

Primary workflow:

1. Parse the requested capabilities.
2. Map each capability to SoulForge primitives.
3. Inspect existing examples before creating new files.
4. Implement typed contracts first.
5. Add tests, eval goldens, observability, docs, and env examples in the same change.

## Capability Map

| Request phrase | Required primitives | Notes |
| --- | --- | --- |
| `research agent` | soul, tools, endpoint/example, eval, observability | Add citations and refusal golden for unsupported claims. |
| `with memory` | memory, eval, observability | Use short-term, long-term, recall, and reflection where relevant. |
| `x402-paid` | endpoint, tools, observability, eval | Validate payment before tool execution. Persist receipts. |
| `Base-native` | endpoint/tools, observability, eval | Keep Base-only defaults. Document env and network. |
| `Bankr` | `tools/bankr`, observability, eval | Dry-run default. Require caps and idempotency for live swaps. |
| `trading` | economic action pattern, Bankr or direct tool, eval, receipts | Do not enable autonomous live trading by default. |
| `long-horizon` | memory checkpoints, idempotency, observability, eval | Persist cursors before side effects. |
| `watchdog` | scheduler docs, memory checkpoints, endpoint/example | Prevent duplicate actions. |
| `planner` | planner soul, executor tool, typed handoff records, eval | Avoid a central orchestrator. |
| `Farcaster` | isolated social tool, dry-run default, rate-limit handling | Preview content before posting. |

## File Placement

| Need | Put it here |
| --- | --- |
| Reusable tool primitive | `tools/<tool-name>/` |
| Reference endpoint agent | `endpoints/examples/<agent-name>/` |
| Soul example | `souls/examples/<agent-name>-soul.md` |
| Repo-level evals | `eval/goldens/<soul-name>/` |
| Generated standalone agent | `<agent-name>/` outside primitive folders or under a user-selected output directory |
| AI guidance | `.ai/*.md` |

## Completion Rule

An agent implementation is incomplete until it has:

- typed contracts
- tests
- eval goldens
- observability
- memory lifecycle if requested
- env docs
- README
- verification commands
