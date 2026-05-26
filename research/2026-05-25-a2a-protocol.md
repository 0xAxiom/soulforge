# Agent2Agent (A2A) Protocol

**Target** — https://a2a-protocol.org · https://github.com/a2aproject/A2A · [Google announcement](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)

## What it is

A2A is an open HTTP + JSON-RPC + SSE standard for agent-to-agent communication, launched by Google in April 2025 and donated to the Linux Foundation in June 2025. As of May 2026, 150+ organizations including Google, Microsoft, AWS, Salesforce, SAP, and IBM have adopted it. It is the network-level complement to MCP: where MCP gives agents tools and context, A2A lets agents delegate tasks to *other agents* across framework and vendor boundaries.

## Architecture

- **Three-layer model**: Data Model (Task, Message, Artifact, Agent Card — defined as Protocol Buffers) → Operations (11 abstract capabilities: send message, stream updates, push notifications, etc.) → Bindings (JSON-RPC 2.0, gRPC, HTTP/REST). The proto is normative; all other representations are derived.

- **Agent Card** — a JSON document at `GET /.well-known/agent.json` (or a declared URL) that describes a remote agent's capabilities, skills, security requirements, and supported transports. This is formal, machine-readable self-description. Fields: `id`, `name`, `description`, `capabilities` (streaming, push), `skills` (array of {id, name, description, inputModes, outputModes}), `securitySchemes`, optional `signature`.

- **Task lifecycle** — Seven explicit states: `SUBMITTED → WORKING → INPUT_REQUIRED / AUTH_REQUIRED → COMPLETED / FAILED / CANCELED / REJECTED`. Human-in-the-loop is a named state, not an exception path.

- **Artifact model** — Task outputs are structured `Artifact` objects (artifactId, parts, metadata). Parts carry typed content: text, raw bytes, URLs, or structured data. Output is not a freeform string.

- **Multi-turn via contextId** — Related tasks share a `contextId`. Individual tasks have a `taskId`. This separation lets a client have a conversation with an agent (same context) while tracking each work unit independently (individual tasks).

- **Three update delivery modes**: polling (`GetTask`), streaming (SSE, persistent connection), push notifications (webhooks). Protocol declares it is "Async First" for long-running work.

- **Opaque execution** — Agents interoperate based only on declared capabilities and exchanged artifacts, never shared internal state. This is a protocol invariant, not a recommendation.

- **Standard reuse** — HTTP, SSE, JSON-RPC 2.0. No proprietary wire format. This is a deliberate contrast to earlier agent frameworks that invented bespoke protocols.

## What soulforge can learn

- **Agent Card ↔ manifest route is already the right instinct, not yet formalized.** Soulforge's `GET /api/manifest` is an informal Agent Card: it declares the endpoint's name, auth, and routes. A2A makes the pattern formal. Soulforge endpoints should align the manifest shape to include `capabilities` (does this endpoint support streaming? async tasks?) and `skills` (what named capabilities does it offer). This costs nothing architecturally — it's a schema enrichment of something already happening. See the new `a2a-endpoint.md` template for the mapping.

- **Task states map directly to soul loop contracts.** A2A names `INPUT_REQUIRED` as a first-class state — the agent pauses and waits for human or upstream input before continuing. Soulforge's `loop_stop` predicates and `approval_required` souls cover this implicitly, but A2A's vocabulary is crisper. Souls that run long tasks should name their pause states explicitly: not just "retry_budget_exhausted" but "awaiting_user_input" or "awaiting_external_data".

- **Artifacts, not strings.** A2A makes "task output is a structured artifact" a protocol invariant. Soulforge already pushes structured outputs via `output_schema` in soul frontmatter, but the eval layer captures traces as raw strings. Aligning trace output to typed artifact shapes would make eval results more composable — a trace from one soul could be an input artifact for another without schema translation.

- **Opaque execution is the colocation principle at network scale.** A2A's "collaborate via declared capabilities only, never internal state" is exactly soulforge's colocation principle lifted to the network boundary. The soul is self-describing; the endpoint's manifest is the network-level version of that. When a soulforge agent exposes a manifest, it should be complete enough that no caller ever needs to read the soul file to know how to interact with it.

- **contextId as lightweight session.** A2A's contextId (group related tasks into a conversation) is lighter than a full memory session. For soulforge endpoints, this maps well: accept an optional `session_id` in requests that maps to a memory context, without requiring full session infrastructure for stateless callers.

## What soulforge should NOT copy

- **Proto as normative source.** Soulforge is markdown-first by design. The soul schema is JSON Schema validated against human-readable markdown files. Migrating to proto for normativity would break the "souls are documents humans read first" principle and add toolchain complexity (protoc, generated types, maintained bindings). This is the right call for a 150-org open standard; it's the wrong call for a substrate that competes on readability.

- **gRPC binding.** Soulforge targets TypeScript web deployments behind HTTP. gRPC adds a dependency (grpc-js, envoy proxy), a new port, and generated stubs. The JSON-RPC binding achieves the same goal for typical soulforge endpoints. If a caller needs gRPC, they use a gateway layer in front of soulforge — the endpoint doesn't change.

- **Cryptographic Agent Card signing.** Signing Agent Cards with public keys is a valid enterprise security mechanism for when you can't trust the discovery path. Most soulforge use cases deploy to trusted hosts. Implementing signing infrastructure for development-mode endpoints is over-engineering; it should be documented as an available pattern, not required by default.

- **Push notification infrastructure.** Webhooks for async task completion add an ops surface: the callee must reach back to the caller's webhook URL, handle retries, and deal with webhook delivery failures. Soulforge endpoints are better served by SSE (streaming) or polling for long-running work. Push notifications belong in a production-ops layer in front of soulforge, not inside the endpoint primitive.

- **The 11-operation abstraction layer.** A2A's "operations" layer exists to support gRPC + REST + JSON-RPC binding equivalence. Soulforge has one target binding (HTTP/JSON). Adding an operations abstraction layer today would be speculative — it would only pay off if soulforge needed a second binding, which it doesn't yet.

## Sources

- https://a2a-protocol.org/latest/specification/
- https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/
- https://github.com/a2aproject/A2A
- https://atlan.com/know/google-a2a-protocol/ (architecture overview)
