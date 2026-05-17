# Tool Authoring

Tool module shape:

```text
tools/<tool-name>/
├── README.md
├── src/index.ts
├── src/<tool>.test.ts
└── examples/
```

Contracts:

- Inputs: Zod schemas or strict TypeScript interfaces.
- Outputs: schema-validated objects.
- Side effects: isolated and documented.
- Observability: emit latency and errors; emit cost/receipt when relevant.
- Failure: typed errors with actionable messages.
- Tests: unit tests with mocked network; integration tests gated by env.

Financial tools:

- Dry-run default.
- Explicit live flag.
- Spending cap.
- Network allowlist.
- Idempotency key.
- Receipt logging.
