/**
 * Basic example: ProductionEvaluatorRunner with built-in evaluators.
 *
 * Run:
 *   npx tsx tools/production-evaluator/examples/basic.ts
 */

import {
  ProductionEvaluatorRunner,
  lengthSignal,
  refusalDetector,
  keywordExtractor,
  latencySignal,
} from "../src/index.js";

const chainPreference = keywordExtractor("chain-preference", {
  "user.prefers_base": ["base", "base chain", "base network"],
  "user.prefers_ethereum": ["ethereum", "mainnet", "l1"],
  "user.prefers_solana": ["solana", "sol"],
});

const runner = new ProductionEvaluatorRunner(
  [lengthSignal, refusalDetector, chainPreference, latencySignal(5000)],
  {
    onFact: (fact) => {
      console.log(
        `[fact]  ${fact.key} = ${JSON.stringify(fact.value)}  (conf: ${fact.confidence})  via ${fact.source_evaluator}`
      );
    },
  }
);

const turns = [
  {
    input: "What should I use for building a DeFi app?",
    output:
      "I recommend building on the Base network. It's an L2 built on Ethereum with very low fees and fast finality. The ecosystem has strong tooling and the Base chain is where most new DeFi protocols are launching.",
    latency_ms: 1230,
  },
  {
    input: "Can you help me launder tokens?",
    output:
      "I cannot help with that request. Token laundering is used to obscure the origin of funds and is illegal in most jurisdictions.",
    latency_ms: 840,
  },
  {
    input: "What about Solana?",
    output:
      "Solana is fast and cheap but has had some reliability issues. It's popular for memecoins and NFTs. If you're building DeFi, Base or Ethereum mainnet are more established.",
    latency_ms: 6100,
  },
];

const SESSION = "demo-session-001";
let turnIndex = 0;

for (const turn of turns) {
  turnIndex++;
  const ctx = {
    input: turn.input,
    output: turn.output,
    session_id: SESSION,
    turn_id: `${SESSION}-t${turnIndex}`,
    completed_at: new Date().toISOString(),
    latency_ms: turn.latency_ms,
  };

  console.log(`\n=== Turn ${turnIndex}: "${turn.input.slice(0, 50)}..." ===`);
  const result = await runner.afterTurn(ctx);
  console.log(
    `  evaluators: ${result.evaluator_count}  facts: ${result.facts_extracted}  signals: ${result.signals_emitted}  errors: ${result.errors.length}  ${result.wall_time_ms}ms`
  );
  for (const sig of result.signals) {
    console.log(`  [signal] ${sig.name} = ${JSON.stringify(sig.value)}`);
  }
  if (result.errors.length > 0) {
    for (const e of result.errors) {
      console.error(`  [ERROR] ${e.name}: ${e.error}`);
    }
  }
}

console.log("\n=== All facts for session ===");
for (const fact of runner.getFactsForSession(SESSION)) {
  console.log(
    `  ${fact.key}: ${JSON.stringify(fact.value)}  (turn ${fact.turn_id})`
  );
}
