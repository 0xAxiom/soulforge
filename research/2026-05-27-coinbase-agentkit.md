# Coinbase AgentKit

**Target:** https://github.com/coinbase/agentkit — https://docs.cdp.coinbase.com/agentkit/docs/welcome

## What it is

AgentKit is Coinbase's toolkit for giving AI agents onchain capabilities. Built on the Coinbase Developer Platform (CDP) SDK, it provides a wallet layer plus 50+ domain-specific action providers for DeFi, NFTs, social, and infrastructure protocols. Its tagline: "Every AI Agent deserves a wallet." It ships adapters for LangChain, Vercel AI SDK, Eliza, and OpenAI Agents SDK.

## Architecture

- **Two root primitives: WalletProvider + ActionProvider.** WalletProvider holds signing capability (CDP Smart Wallet, Privy, Viem). ActionProvider encapsulates protocol interactions (e.g., CompoundActionProvider, ZoraActionProvider, X402ActionProvider). Neither leaks into the other.
- **`getActions(walletProvider)` filters by network at runtime.** Each ActionProvider implements `supportsNetwork(networkId) → bool`. When `AgentKit.getActions()` runs, it iterates providers, skips unsupported ones (with a logged warning), and returns only compatible actions. Silent capability pruning — the agent never sees a tool it can't use on the current chain.
- **Factory method pattern for guaranteed preconditions.** `AgentKit.from()` is the only constructor. If no WalletProvider is passed, it initializes one from CDP credentials before returning. You cannot construct a half-wired AgentKit. The instance contract is: wallet always present.
- **Decorator-based action registration.** `@action` decorator on a class method registers the action schema and metadata alongside the implementation. Schema travels with code, not in a separate file. Actions are grouped by provider class, not by a global registry.
- **Domain buckets for organization.** 36+ TypeScript providers organized by: DeFi (Compound, Morpho, Sushi, Moonwell), NFT (Zora, Clanker, OpenSea, ERC721), Social (Farcaster, Twitter), Infrastructure (x402, ERC8004, ZeroDev, SuperFluid), Data (DefiLlama, Pyth, Messari, Allora).
- **Framework adapters as thin translation layers.** Each adapter (langchain-agentkit, openai-agentkit, etc.) translates AgentKit's `Action[]` into the framework's tool format. Pure mapping — no logic.
- **x402 is a first-class action provider.** Not a plugin, not bolted on. The x402ActionProvider is one of the named 36+ providers alongside Compound and Zora. Validates that x402 is infrastructure-tier for Base agents, not a curiosity.

## What soulforge can learn

- **Capability scoping.** Tools should declare `networks: ["base", "base-sepolia"]` (or equivalent) alongside their input schema. Dispatchers — or soul bodies — can filter before calling, preventing silent no-ops when a tool isn't available on the current chain. Relevant to: `tools/` schema convention, `endpoints/` README. Today, soulforge tools have no network declaration and the Bankr tool hardcodes `base` inside logic instead of surfacing it at the schema boundary.
- **Wallet as explicit typed input, not ambient config.** AgentKit passes `walletProvider` explicitly to `getActions(walletProvider)`. The wallet is a typed parameter at the capability layer, not read from env inside the tool. In soulforge terms: economic tools should accept a `walletProvider` input rather than resolve it from environment at call time. This makes signing replaceable and auditable — you can swap in a test wallet without monkey-patching env vars.
- **Fail-fast factory initialization.** `AgentKit.from()` refuses to return a partial instance. Applied to soulforge endpoints: an endpoint's `initialize()` should verify required tools and credentials before accepting requests, not on the first call. Surfaces misconfiguration at startup, not mid-conversation.
- **Domain-bucketed tool taxonomy.** As soulforge's tool library grows past `bankr/`, a bucket taxonomy (finance / social / data / infrastructure) makes the library navigable for both humans and coding agents. Directly actionable when the second non-Bankr tool module ships.
- **ERC8004 as a recognized primitive.** AgentKit ships an `erc8004ActionProvider` for agent-wallet bindings. Soulforge's economic boundary section should reference ERC8004 alongside ERC8257 — they address different layers (account binding vs tool registry) and can compose.

## What soulforge should NOT copy

- **CDP dependency as default wallet path.** AgentKit's fallback when you don't supply a wallet is to initialize a Coinbase Smart Wallet via CDP APIs. Single-vendor dependency baked into the default path. Soulforge's tool layer should default to Viem/local signing — bring-your-own-wallet is the right default for a substrate.
- **50+ action providers in one monorepo.** Breadth over depth. Each provider is a maintenance obligation and a versioning surface. Soulforge is a substrate and template library, not a service catalog. Three well-documented, tested tool modules beat fifty stubs.
- **Framework adapters pattern.** AgentKit ships separate packages (langchain-agentkit, vercel-ai-sdk-agentkit, openai-agentkit) to bridge its Action[] to each framework's tool type. Soulforge avoids this by design: the soul document IS the adapter. An agent reading a soul knows the tool contract without a translation package.
- **Decorator-based action registration.** Works for a maintained SDK with TypeScript class infrastructure. Wrong for soulforge's "copy and customize" model — a soul template with decorator-magic is harder to fork and modify than a soul with explicit `# Tools` sections and a typed schema file.

## Sources

- https://github.com/coinbase/agentkit
- https://docs.cdp.coinbase.com/agentkit/docs/welcome
- https://github.com/coinbase/agentkit/tree/main/typescript/agentkit/src/action-providers
