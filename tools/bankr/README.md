# tools/bankr/

Optional Bankr primitives for programmable finance agents. This module is isolated from souls and from the rest of SoulForge: agents import it only when they need Bankr-backed reads, quotes, simulations, or live swaps.

## Contract

| Operation | Inputs | Outputs | Side effects | Replay guarantee |
| --- | --- | --- | --- | --- |
| `price` | token, network, dry-run flag | typed price result or Bankr job receipt | optional Bankr API request | prompt and receipt are deterministic records |
| `portfolio` | wallet, network, dry-run flag | typed portfolio result or Bankr job receipt | optional Bankr API request | wallet/network/request metadata preserved |
| `swap` | from token, to token, amount, cap, idempotency key, dry-run/live | typed swap receipt | dry-run by default; live submits only with explicit guardrails | idempotency key and receipt make retries auditable |

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `BANKR_API_KEY` | only for live Bankr Agent API calls | API key with the minimum capability required |
| `BANKR_API_URL` | no | Overrides the default `https://api.bankr.bot` |
| `SOULFORGE_OBS_DIR` | no | Local JSONL observability directory |

## Safety defaults

- Dry-run is the default for swaps.
- Live swaps require `live: true`, `dryRun: false`, a positive `spendingCapUsd`, and an `idempotencyKey`.
- Networks are restricted to `base` and `base-sepolia`.
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
```
