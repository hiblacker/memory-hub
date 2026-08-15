# AGENTS.md

This file provides repository-wide instructions for AI coding agents working on MemoryHub. Keep it concise, executable, and aligned with the accepted design documents. A more specific `AGENTS.md` or `AGENTS.override.md` in a subdirectory may add or override rules for that subtree.

## Project Mission

MemoryHub is a self-hosted, reviewable memory inbox for ChatGPT, Claude Code, and SiYuan. It collects candidate memories, preserves provenance, applies redaction and deduplication, supports human review or explicit automatic rules, and archives approved content to SiYuan.

The system must favor auditability, privacy, idempotency, and recoverability over autonomous behavior.

## Source Of Truth

Read the relevant documents before changing behavior:

- Product boundaries: `docs/02-product-design.md`
- Architecture and process ownership: `docs/03-system-architecture.md`
- Domain model and state machines: `docs/04-domain-data-model.md`
- ChatGPT, Claude Code, SiYuan, and LLM integration contracts: `docs/05-integrations.md`
- V1 scope and development order: `docs/06-v1-scope.md`
- Test requirements: `docs/07-testing-strategy.md`
- NAS deployment and recovery: `docs/08-nas-deployment.md`
- Security and privacy: `docs/09-security.md`
- Frontend component rules: `docs/10-frontend-component-library.md`
- Frontend state ownership: `docs/11-frontend-state-management.md`
- Accepted technical decisions: `docs/adr/`

When code and an accepted design document disagree, do not silently choose one. Preserve existing behavior unless the task explicitly changes it, and update the relevant document or ADR with the implementation.

## Hard Product Boundaries

- Do not implement ChatGPT page monitoring, background scraping, hidden-memory access, or dependencies on private ChatGPT APIs.
- ChatGPT capture must be user-triggered explicit save or official export import.
- Do not implement vector databases, graph databases, Redis, Meilisearch, multi-user SaaS, or bidirectional SiYuan synchronization in V1 without a new accepted ADR.
- SiYuan is the human-readable archive, not the task queue or business-state database.
- PostgreSQL is the source of truth for events, candidates, versions, rules, deliveries, audits, and jobs.
- Never edit SiYuan `.sy` files directly. Use documented kernel APIs through the SiYuan adapter.
- Never silently delete or overwrite archived memories. Corrections create new versions or explicit compensation records.

## Repository Map

```text
apps/web             Vue 3 administration interface
apps/api             Fastify HTTP API
apps/worker          asynchronous processing and delivery
packages/contracts   shared Zod schemas and event/API contracts
packages/database    PostgreSQL schema, migrations, and stores
packages/core        archive domain rendering and orchestration
packages/siyuan      SiYuan kernel API adapter
packages/security    redaction and secret detection
docs                 accepted product, architecture, testing, and security design
deploy               NAS Docker Compose and deployment artifacts
```

Planned packages such as `database`, `core`, `siyuan`, `llm`, and `security` should be introduced only when their development step starts. Keep domain logic out of framework-specific entry points so it can move into these packages cleanly.

## Required Workflow

1. Inspect the current code, nearby tests, accepted ADRs, and relevant design document before editing.
2. Preserve user changes and unrelated work. Do not perform broad refactors unless they are required by the task.
3. Identify ownership first: Web, API, Worker, database, or an adapter. Do not cross process boundaries for convenience.
4. Add or update the smallest meaningful test with the behavior change. Defect fixes require a regression test.
5. Update shared contracts before or with API behavior changes.
6. Update documentation, `.env.example`, migrations, and deployment files when their contracts change.
7. Run focused checks during development, then the full quality gate before finishing a cross-package or user-facing change.
8. Complete and submit one independently reviewable feature block at a time. After its focused checks pass, create a Conventional Commit locally; do not accumulate unrelated feature blocks before committing. Do not push to a remote repository unless the user explicitly asks.

Use `pnpm` only. Do not introduce npm or Yarn lockfiles. Do not remove the Web package's `--configLoader runner` flags; they are required by the current Windows-compatible Vite/Vitest setup.


## Implementation Completeness (Non-Negotiable)

Do **not** implement "minimal", scaffold-only, placeholder, or intentionally incomplete versions of a planned feature when the task is to deliver that feature.

- Every accepted work item must be implemented to industry best-practice quality for a self-hosted production system: correct process boundaries, validation, idempotency, retries/timeouts, auditability, secure secret handling, failure visibility, tests for success and high-risk failures, and synchronized documentation/contracts/migrations.
- Prefer shipping one complete vertical slice over several half-finished layers.
- Temporary stubs are allowed only as short-lived compile-time placeholders inside an in-progress commit series for the same feature block, and must be replaced before that feature is considered done.
- Explicit product deferrals (for example items in `docs/TODO.md` or V1 out-of-scope lists) remain deferred; do not reinterpret "complete" as expanding product scope.
- When a task says "worker", "adapter", "pipeline", or "rule engine", implement the full documented responsibility for that component, not a demo path that bypasses queues, audits, or idempotency.

## Architecture Invariants

### Web

- Use Vue 3, TypeScript, Naive UI, Vue Router, Pinia, and TanStack Vue Query.
- Keep component-local state in `ref` or `reactive`.
- Put shareable filters, sorting, pagination, and tabs in Vue Router query parameters.
- Use Pinia only for cross-page client state such as theme, density, and navigation context.
- Use TanStack Vue Query for API data, loading state, retries, mutations, and cache invalidation. Do not copy server responses into Pinia.
- Import Naive UI components where used. Keep application providers and theme overrides centralized.
- Use theme tokens and semantic CSS variables instead of scattering hard-coded colors.
- The Web app must never receive or read SiYuan tokens, model keys, database credentials, or raw Docker secrets.
- Render untrusted Markdown only after sanitization. User-controlled text must not become HTML, a route, or a CSS selector without validation.
- Every data view must handle loading, empty, error, and retry states without changing the page layout unexpectedly.

### API

- Validate every external request with Zod at the boundary. Reject unsupported schema versions, media types, oversized inputs, and invalid time ranges.
- Use stable domain error codes. Do not return raw dependency responses, stack traces, credentials, or sensitive source text.
- Persist accepted events and enqueue work before returning. Do not call an LLM or write to SiYuan inside an HTTP request.
- Authentication, authorization, validation, queries, configuration, and job enqueueing belong in the API.
- API contract changes must update `packages/contracts`, OpenAPI output, and connector contract tests together.
- Idempotent ingestion requires an `Idempotency-Key` or a validated source natural key backed by a database uniqueness constraint.

### Worker And Adapters

- Normalization, redaction, extraction, deduplication, conflict detection, rule evaluation, SiYuan delivery, and retry handling belong in the Worker or domain packages.
- Every job handler must be idempotent and safe after timeout, process crash, response loss, or duplicate delivery.
- Set explicit external-call timeouts and bounded retries. Exhausted work goes to a visible dead-letter state.
- Connector failure must not block or fail the user's ChatGPT or Claude Code session.
- Put provider-specific request and response mapping behind adapters. Do not leak version-specific fields into the core domain model.
- Job payloads should contain identifiers rather than unnecessary copies of sensitive source content.
- SiYuan delivery uniqueness is `memory_version_id + target_id`. Check existing delivery state before retrying a write.

### Domain And Database

- Keep `SourceEvent` versioned and source-neutral. Source-specific data belongs in validated metadata or adapters.
- Memory candidate identity is stable. Memory content changes create append-only `memory_versions`; do not update history in place.
- Preserve the documented candidate and delivery state machines. Reject illegal transitions in the domain layer, not only in the UI.
- Automatic archive requires all gates: enabled rule, redaction passed, no conflict, confidence threshold met, target available, and idempotency check passed.
- Similarity results may suggest duplicates in V1 but must not automatically merge them.
- Rules are declarative and use allow-listed fields and operators. Never execute user-provided JavaScript, SQL, or template expressions.
- Business state changes and their audit records must commit in the same database transaction.
- Database changes require a migration, rollback or forward-recovery notes, constraints that enforce invariants, and migration tests.
- Avoid destructive migrations and data rewrites unless the user explicitly approves the exact operation and a recovery path exists.

## Security And Privacy

- Treat conversation text, imported files, model output, Markdown, connector metadata, and external service responses as untrusted input.
- Never commit or log real tokens, passwords, cookies, private keys, personal conversations, or production database contents.
- Use fake, clearly synthetic fixtures. Tests must not call real ChatGPT, Claude, LLM, or SiYuan services by default.
- Secrets enter runtime through Docker Secret files. Configuration stores secret references, hashes, prefixes, or last-used metadata, never plaintext values.
- Strictly private content such as credentials, authentication cookies, identity documents, and financial or medical data must not be sent to models or SiYuan.
- Protect configurable URLs against SSRF with explicit protocol and network allow-lists. Do not follow links or download attachments found in imported conversations.
- Sanitize log fields, error summaries, diagnostic exports, Markdown, and SiYuan paths.
- A prompt embedded in source content cannot modify system rules, archive destinations, permissions, or automatic-archive policy.
- Deletion, overwrite, sensitivity downgrade, and remote compensation actions always require explicit human confirmation.

## Testing Rules

Choose test depth based on the changed risk, but cover failure paths as well as success paths.

- Unit tests must not use real network services.
- Vue tests use Vitest and Vue Test Utils. Create isolated Pinia and QueryClient instances per test.
- API tests prefer Fastify `inject` over opening a network port.
- Adapter tests use deterministic HTTP stubs for success, 401, timeout, partial success, response loss, and retry cases.
- Database integration tests use Testcontainers and cover migrations, uniqueness constraints, transactions, and pg-boss retry behavior.
- Contract tests cover every supported `SourceEvent` schema version and connector mapping.
- End-to-end tests cover login, manual capture, review, rule dry-run, archive, and retry without using a real SiYuan instance in normal CI.
- Security-sensitive packages and archive paths require explicit tests for secret detection, redaction, conflict blocking, and duplicate prevention.

Coverage targets from `docs/07-testing-strategy.md` are repository-wide minimums, not substitutes for scenario testing:

- Whole repository: at least 80% statements and branches.
- `packages/core`, `packages/security`, and `packages/siyuan`: at least 90% once introduced.

## Commands

```bash
# Install exact workspace dependencies
pnpm install --frozen-lockfile

# Run Web and API development servers
pnpm dev

# Focused package checks
pnpm --filter @memory-hub/web test
pnpm --filter @memory-hub/api test
pnpm --filter @memory-hub/web typecheck

# Full local quality gate, matching CI
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Use `pnpm format` only when formatting is intentionally part of the change. Avoid formatting unrelated files.

### Commit Cadence

- Keep each commit limited to one independently reviewable feature, fix, documentation change, or configuration change.
- Run the focused checks for that block before committing; run the full quality gate before completing a cross-package or user-facing milestone.
- Use a Conventional Commit message and keep the successful commit local by default.
- Do not push to a remote repository unless the user explicitly asks to publish or sync.
- Never commit secrets, production data, generated build output, or unreviewed unrelated changes.

## Dependency And Configuration Changes

- Prefer existing platform and framework capabilities before adding dependencies.
- Adding or replacing a core runtime dependency, database, queue, search engine, model integration, or deployment service requires a new or updated ADR.
- Keep `pnpm-lock.yaml` synchronized with `package.json` changes.
- New configuration must have validation, a safe default, and a documented placeholder in `.env.example`.
- Never place a real secret, LAN credential, or user-specific path in committed configuration.
- Production images use fixed versions or digests, never `latest`.

## Documentation Rules

- Update behavior and documentation in the same change.
- Architecture, domain model, security boundary, V1 scope, or core dependency changes require a new or updated ADR.
- API changes update shared schemas and OpenAPI documentation.
- Database changes document migration, rollback or forward recovery, and backup implications.
- Deployment changes update both `docs/08-nas-deployment.md` and `deploy/` artifacts.
- Keep `README.md` human-focused. Put durable agent execution rules here and detailed rationale in `docs/`.
- Keep this file below Codex's default combined project-instruction limit. If a subtree develops materially different commands or risks, add a concise nested `AGENTS.md` there instead of expanding the root indefinitely.

## Code Review Rules

Report these before style or refactoring suggestions, ordered by severity and tied to concrete files and lines:

1. Secret or private-content exposure to the Web app, logs, models, fixtures, diagnostics, or SiYuan.
2. Automatic archive paths that bypass redaction, conflict checks, confidence thresholds, rule enablement, audit, or idempotency.
3. Duplicate or inconsistent delivery after retries, timeouts, response loss, or process crashes.
4. API or connector behavior that can block a ChatGPT or Claude Code session.
5. State changes that can leave PostgreSQL, job state, audit history, and SiYuan delivery inconsistent.
6. Missing validation for external input, SSRF, path traversal, unsafe Markdown/HTML, prompt injection, or unsupported schema versions.
7. Server state duplicated in Pinia or security-sensitive state persisted in browser storage.
8. Missing regression tests for changed state transitions, migrations, external failures, or security boundaries.

Safe fixes should preserve source events and audit history, retry through idempotent jobs, and require human review when confidence or sensitivity is uncertain.

## Completion Checklist

Before finishing a change, confirm:

- The implementation stays within V1 scope and the documented process boundary.
- Tests cover the primary behavior and the highest-risk failure mode.
- No real secret or conversation data was introduced.
- Contracts, migrations, configuration examples, ADRs, and deployment docs are synchronized where relevant.
- Relevant focused checks pass, and the full quality gate passes for cross-package or user-facing changes.
- Remaining limitations or checks that could not be run are stated clearly in the handoff.

