# ADR-0005: Full Archive Pipeline With Worker and Transactional Outbox

## Status

Accepted

## Context

Approved memories must be archived to SiYuan without blocking HTTP requests, without duplicating documents on retry, and without exposing SiYuan tokens to the browser. A "minimal worker" that writes from the API or skips queue/idempotency would violate reliability and security boundaries.

## Decision

1. API validates and persists state only. It never calls SiYuan or LLMs inside request handlers.
2. Approve creates an append-only `memory_version`, a unique `archive_delivery` for `(memory_version_id, target_id)`, transitions the candidate to `queued`, writes an `audit_log`, and inserts a transactional `outbox_message` in the same database transaction.
3. Worker publishes outbox messages to pg-boss, processes archive jobs with timeouts, bounded retries, and dead-letter visibility, and is the only process that loads the SiYuan token from environment or secret files.
4. Delivery success records document/block identifiers and content fingerprints. Retries re-check delivery state before writing. Corrections create new versions; successful deliveries are not silently overwritten.
5. Packages `siyuan`, `security`, and `core` own adapter, redaction, and domain orchestration respectively.

## Consequences

- Local development runs API, Worker, Web, and PostgreSQL.
- Connection tests and archive operations surface status through database-backed records visible to the Web API without returning secrets.
- Feature work after this ADR must keep the same outbox/idempotency invariants.
