# BankrBot Integration Research

Date: 2026-05-17

## Sources reviewed

- `BankrBot/claude-plugins` repository: https://github.com/BankrBot/claude-plugins
- `bankr-agent` Claude plugin, MCP server source, command, agent instructions, and skills
- `bankr-agent-dev` developer plugin, API basics, workflow, client patterns, project templates, examples, and safety notes
- `x402-sdk-dev` plugin, SDK README, changelog, wallet operations, job management, transaction builder, token swap, balance query, capability, and client pattern notes
- Bankr plugin metadata, package metadata, GitHub Actions build workflow, and repository license files

## Bankr model

Bankr exposes three related integration surfaces:

1. The Bankr Agent MCP plugin wraps an async Agent API behind Claude MCP tools.
2. The Bankr Agent API accepts natural-language prompts, returns a job, and lets callers poll or cancel that job.
3. The `@bankr/sdk` x402 path uses a payment wallet to pay per request and an optional context wallet that receives assets or becomes the target of built transactions.

These surfaces are useful to SoulForge, but they have different trust boundaries. The MCP plugin is a Claude integration. The Agent API is a hosted execution service keyed by `BANKR_API_KEY`. The x402 SDK is closer to SoulForge's Base-native commerce thesis because each request is paid by a payment wallet and returns structured job or transaction data.

## Wallet lifecycle

The API-key path ties capabilities to a Bankr account and key. The repo documents keys with flags such as Agent API access, LLM gateway access, read-only mode, and optional IP allowlisting. The safety guidance recommends dedicated agent wallets, small balances, environment-only secrets, and read-only keys for dashboards.

The x402 SDK path uses a two-wallet model:

- Payment wallet: holds Base USDC and pays the x402 request fee.
- Context wallet: optional target wallet for assets, balances, and built transactions.

SoulForge should map this to scoped wallets and sub-accounts. A SoulForge economic agent should never use an operator's primary wallet as its default execution wallet.

## Trading and execution flow

The async API flow is:

1. Submit a prompt to `/agent/prompt`.
2. Receive a job id and initial status.
3. Poll `/agent/job/{jobId}`.
4. Read status updates, rich data, transactions, or errors.
5. Cancel long-running jobs through `/agent/job/{jobId}/cancel` when appropriate.

The repo also documents direct sign and submit endpoints for synchronous signing or execution. Those paths are powerful and should be treated as high-risk because submit-style calls execute without an additional confirmation prompt.

For swaps, the SDK and skills describe quote and transaction-building behavior, possible ERC20 approval transactions, slippage concerns, gas costs, and chain-specific timing. SoulForge should preserve these as explicit outputs in receipts rather than hiding them behind a generic "trade succeeded" message.

## Supported chains and Base scope

Bankr materials describe support across Base, Ethereum, Polygon, Unichain, Solana, and some specialized venues such as Polymarket and Avantis. The SDK materials emphasize Base x402 payment and EVM transaction construction, with some docs noting narrower SDK coverage than the broader Bankr Agent product.

SoulForge v2 should stay Base-only by default. Bankr's broader chain support should be documented as a Bankr capability, not elevated into a SoulForge multichain abstraction.

## API and auth patterns

The Agent API uses `x-api-key` auth with `BANKR_API_KEY` and an optional `BANKR_API_URL`. The x402 SDK uses `BANKR_PRIVATE_KEY` for the payment wallet, optional `BANKR_WALLET_ADDRESS` for context, and optional `BANKR_API_URL`.

SoulForge should not pass user prompts directly to Bankr as its primary public contract. The safer shape is a typed tool boundary:

- `price(input) -> price output`
- `portfolio(input) -> portfolio output`
- `quoteSwap(input) -> quote output`
- `simulateSwap(input) -> simulation output`
- `submitSwap(input) -> receipt output`

Natural-language Bankr prompts may be useful inside reference examples, but SoulForge primitives should prefer structured inputs, Zod validation, and receipts.

## Rate limits and failure handling

The repo documents auth failures, read-only mode failures, insufficient funds, slippage, unsupported tokens, 429 rate limits with reset metadata, server errors, and long-running jobs. It recommends polling every two seconds for jobs and treating very long jobs as candidates for cancellation.

SoulForge should normalize these into typed error classes:

- `BankrAuthError`
- `BankrRateLimitError`
- `BankrReadOnlyError`
- `BankrInsufficientFundsError`
- `BankrSlippageError`
- `BankrUnsupportedAssetError`
- `BankrJobTimeoutError`
- `BankrExecutionRejectedError`

Every error should emit an observability event with `trace_id`, `session_id`, tool name, upstream, error class, latency, and cost metadata when available.

## What should be integrated

- Optional Bankr tool primitives under `tools/bankr/`.
- Portfolio reads and price queries as read-only operations.
- Quote, simulation, and dry-run swap flows before live execution.
- Async job submit, poll, timeout, and cancel helpers.
- x402 request payment support for Bankr SDK calls.
- Receipt capture for job id, status updates, transaction hashes, chain id, asset inputs, approvals, slippage, costs, and idempotency key.
- Spending caps, network allowlists, and scoped wallet inputs.
- Eval goldens that replay receipts and score execution quality without moving funds.
- Local JSONL observability for every financial action.

## What should not be integrated

- Do not import the Claude MCP plugin as a SoulForge runtime.
- Do not make Bankr a mandatory dependency of the repo.
- Do not hardcode Bankr fields into soul markdown or the soul schema.
- Do not expose direct sign or submit endpoints as default tools.
- Do not enable leverage, Polymarket, token deployment, or arbitrary calldata by default.
- Do not turn Bankr's multichain coverage into a SoulForge v2 multichain layer.
- Do not let a model choose live execution from freeform text without typed policy checks.

## Security implications

Bankr can prepare or execute economic actions. That means the integration must be treated like infrastructure automation, not chat convenience. The dangerous cases are unlimited wallets, stale approvals, ambiguous natural-language prompts, live trading without dry-run, retrying non-idempotent actions, and failing to persist receipts.

Recommended controls:

- Dry-run default for all money-moving paths.
- Explicit `live: true` flag for execution.
- Spending cap per action and per session.
- Network allowlist, Base-only by default.
- Idempotency key required before side effects.
- Approval transaction surfaced separately from swap transaction.
- Receipt persistence before and after upstream calls where possible.
- Dedicated scoped wallet or sub-account for each agent or strategy.
- Read-only API keys for dashboards and eval replay.
- No private keys, API keys, mnemonics, or session tokens in committed files.

## Wallet safety considerations

SoulForge should distinguish four wallet roles:

- Payment wallet: pays x402 or service fees.
- Execution wallet: signs or submits economic actions.
- Scoped task wallet: holds limited funds for a task or strategy.
- Read-only portfolio wallet: used for balances and monitoring only.

These roles should not collapse into one default wallet. For reference agents, the safe default is a read-only or dry-run mode with a scoped Base Sepolia wallet. Live mainnet execution should require explicit env flags and visible spending caps.

## How Bankr differs from direct wallet tooling

Direct wallet tooling exposes signing and transaction submission directly. Bankr adds a hosted interpretation and routing layer around economic actions, plus async jobs, status updates, rich data, and x402-paid request flow. That can reduce integration work, but it also creates an upstream execution boundary that must be observed, replayed, and constrained.

SoulForge should present Bankr as an optional programmable finance primitive. It should not make Bankr the authority for agent policy, approvals, memory, or evaluation.

## Primitive-first architecture

Bankr fits SoulForge when it is isolated as a tool module with typed APIs, tests, examples, env documentation, failure behavior, receipts, and observability. It does not fit if it becomes an invisible runtime dependency or if souls need to know Bankr-specific fields.

The right boundary is:

```text
soul policy -> typed economic tool -> Bankr adapter -> Base action -> receipt -> obs/eval/memory
```

The soul remains human-authored markdown. The tool owns the Bankr contract. Observability, eval, and memory consume receipts after execution.

## Preventing dangerous autonomous defaults

Financial execution must be opt-in at every risky step:

- The default mode is simulation.
- The agent cannot infer live mode from user enthusiasm.
- The tool rejects missing caps, missing idempotency keys, unsupported networks, and malformed asset inputs.
- The reference agent shows a preview before live execution.
- Eval replay never moves funds.
- Background agents can monitor and recommend, but posting or trading requires explicit live configuration.

## Implementation recommendations

1. Add `tools/bankr/` only when Track 4 begins, not during README positioning work.
2. Start with read-only portfolio and price primitives, then add quote and simulation, then add live swap behind caps.
3. Use Zod schemas at every input and output boundary.
4. Persist receipts as JSONL-compatible records that eval can replay.
5. Emit observability for request latency, cost, upstream errors, chain id, action class, and trace identifiers.
6. Keep Base-only examples for v2 even though Bankr supports additional chains.
7. Document direct sign and submit endpoints as advanced, disabled-by-default escape hatches.
8. Never let a Bankr integration mutate soul files, policy, spend caps, or approvals without human review.
