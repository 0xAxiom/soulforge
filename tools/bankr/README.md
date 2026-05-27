# tools/bankr/

Optional Bankr primitives for programmable finance agents. This module is isolated from souls and from the rest of SoulForge: agents import it only when they need Bankr-backed reads, quotes, simulations, or live swaps.

## Network Scope

| Operation | Supported networks |
| --- | --- |
| `price` | `base`, `base-sepolia` |
| `portfolio` | `base`, `base-sepolia` |
| `swap` | `base`, `base-sepolia` |
| `deployToken` | `base` only (Sepolia not supported by `/token-launches/deploy`) |

Callers should filter tool availability by network before exposing this module to an agent. See `souls/examples/onchain-action-soul.md` for the reference pattern — never call a tool on a network it doesn't declare. A tool invoked on an unsupported network will fail at the API layer; filtering at the capability layer fails faster and more clearly.

## Contract

| Operation | Inputs | Outputs | Side effects | Replay guarantee |
| --- | --- | --- | --- | --- |
| `price` | token, network, dry-run flag | typed price result or Bankr job receipt | optional Bankr API request | prompt and receipt are deterministic records |
| `portfolio` | wallet, network, dry-run flag | typed portfolio result or Bankr job receipt | optional Bankr API request | wallet/network/request metadata preserved |
| `swap` | from token, to token, amount, cap, idempotency key, dry-run/live | typed swap receipt | dry-run by default; live submits only with explicit guardrails | idempotency key and receipt make retries auditable |
| `deployToken` | name, symbol, feeRecipient (`wallet`/`x`/`farcaster`/`ens`), optional metadata, dry-run/live, idempotency key | typed deploy receipt with `tokenAddress` and `txHash` | dry-run synthesizes a receipt locally; live POSTs to `/token-launches/deploy` (Base only, Doppler v4 — 100B supply, non-mintable, 1.2% swap fee fixed by Bankr) | prompt summary, idempotency key, token address, and tx hash persist as a receipt |

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `BANKR_API_KEY` | only for live Bankr Agent API calls | API key with the minimum capability required |
| `BANKR_API_URL` | no | Overrides the default `https://api.bankr.bot` |
| `SOULFORGE_OBS_DIR` | no | Local JSONL observability directory |

## Safety defaults

- Dry-run is the default for swaps and deploys.
- Live swaps require `live: true`, `dryRun: false`, a positive `spendingCapUsd`, and an `idempotencyKey`.
- Live deploys require `live: true`, `dryRun: false`, `network: "base"`, and an `idempotencyKey` of at least 8 characters. Bankr has no native idempotency field — callers are expected to dedupe locally on this key before retrying. Rate limits are 20 deploys per 24h on a partner key.
- Swap networks are restricted to `base` and `base-sepolia`. Deploys are Base mainnet only (Sepolia is not supported by `/token-launches/deploy`).
- Direct sign and submit APIs are not exposed here.
- The module emits observability events for successful calls and errors.

## Example

```ts
import { BankrClient } from "./src/index.js";

const bankr = new BankrClient({ apiKey: process.env.BANKR_API_KEY });
const receipt = await bankr.swap({
  fromToken: "USDC",
  toToken: "ETH",
  amountUsd: 10,
  spendingCapUsd: 10,
  network: "base-sepolia",
  dryRun: true
});

console.log(receipt.status);
```

## Verification

```bash
npm run test -- tools/bankr
npm run typecheck
npm run lint
npx tsx tools/bankr/examples/dry-run-swap.ts
npx tsx tools/bankr/examples/dry-run-deploy.ts
```
