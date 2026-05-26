# soulforge-launch

End-to-end Base-native agent launcher. Takes an agent description + Twitter handle + token name/symbol, scaffolds a `token-agent` from `generator/templates/token-agent/`, calls Bankr Bot's `/token-launches/deploy` (Doppler v4 on Base — 100B supply, non-mintable, 1.2% swap fee fixed by Bankr), and injects the returned `tokenAddress` into the scaffolded agent's `.env`. The launch is attributed on X via `feeRecipient: { type: "x", value: "@handle" }`, so the token surfaces on the user's profile.

## Contract

| Operation | Inputs | Outputs | Side effects | Replay guarantee |
| --- | --- | --- | --- | --- |
| `SoulForgeLauncher.launch` | `agentName`, `agentDescription`, `twitterHandle`, `tokenName`, `tokenSymbol`, optional metadata + `paymentReceipt` + `idempotencyKey`, `dryRun` | `{agentDir, tokenAddress, txHash, traceId, bankrReceipt, paymentReceipt}` | dry-run synthesizes a Bankr receipt locally and writes a blank `AGENT_TOKEN_ADDRESS`; live POSTs to `/token-launches/deploy`, writes the real address into `.env`, and persists a Bankr receipt | trace id + idempotency key + bankr receipt are all stored in the returned object and emitted via observability |

## Safety defaults

- Dry-run is the default. Live launches require **all** of: `dryRun: false`, a populated `paymentReceipt` (x402), and a `idempotencyKey` ≥ 8 chars.
- Bankr deploys are Base mainnet only — Sepolia is not supported by `/token-launches/deploy`.
- The launcher does not custody funds. The payment receipt is supplied by an upstream x402 middleware (see `endpoints/templates/x402-endpoint.md`).
- Bankr has no native idempotency field; callers must dedupe locally on `idempotencyKey` before retrying.
- Rate limits apply (partner key: 20 deploys / 24h, 1 / min, 1 concurrent per fee recipient).

## Example

```ts
import { SoulForgeLauncher } from "./src/launch.js";

const launcher = new SoulForgeLauncher();
const result = await launcher.launch({
  agentName: "axiom-token-agent",
  agentDescription: "Base-native agent bonded to its own token.",
  twitterHandle: "@axiom",
  tokenName: "Axiom Agent",
  tokenSymbol: "AXAGT",
  outDir: "./out",
  dryRun: true
});

console.log(result.bankrReceipt.status); // "simulated" or "submitted"
console.log(result.tokenAddress);        // null on dry-run, 0x... on live
```

## Verification

```bash
npm run test -- endpoints/examples/soulforge-launch
npx tsx endpoints/examples/soulforge-launch/src/demo.ts
```

## Where the x402 wiring lives

This module exposes a pure function. The HTTP/x402 surface (Next.js + `x402-next` middleware) is generated from `endpoints/templates/x402-endpoint.md`. A deployed launcher mounts this `SoulForgeLauncher.launch` as the paid route's handler, treats the verified `X-PAYMENT` header as the `paymentReceipt`, and returns `result` as JSON to the caller.
