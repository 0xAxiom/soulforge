import { BankrClient } from "../src/index.js";

const bankr = new BankrClient();

const receipt = await bankr.swap({
  fromToken: "USDC",
  toToken: "ETH",
  amountUsd: 10,
  spendingCapUsd: 10,
  network: "base-sepolia",
  dryRun: true,
  traceId: "example-bankr-dry-run"
});

console.log(JSON.stringify(receipt, null, 2));
