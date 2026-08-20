# ADR-0006: Memory Revision Updates Existing SiYuan Document

## Status

Proposed

## Context

V1 treated `archived` as a terminal state. The detail page disabled editing after the first successful delivery. That conflicts with how memories are used: titles and bodies are corrected over time.

The existing model already has append-only `memory_versions` and unique deliveries on `(memory_version_id, target_id)`. The missing piece is a revision loop that creates a new version and updates the same SiYuan document instead of appending or creating a duplicate.

ADR-0005 still applies: the API must not call SiYuan, and successful deliveries must not be silently rewritten. Corrections happen through new versions and new deliveries.

## Decision

1. Rename candidate status `archived` to `synced`. UI and API both use 同步 / synced.
2. Allow `PATCH` on a `synced` candidate. If the working copy hash differs from `current_version`, transition to `pending` and audit `candidate.revise`. Do not create a version until approve.
3. Approve always creates the next append-only version and a new delivery. If a previous successful delivery exists for the same candidate and target, the worker updates that `document_id` with `updateBlock` (and rename/move when the title path changes). It must not `appendBlock` onto an existing memory document.
4. `current_version_id` changes only after the new delivery succeeds.
5. Version listing and compare are read APIs over `memory_versions`. Compare returns field diffs plus line-level body hunks. Restoring a version copies it into the working copy and returns the candidate to `pending`.

## Consequences

- Synced memories can re-enter the inbox as revisions.
- SiYuan holds the latest readable document; PostgreSQL remains the source of truth for history.
- Worker archive logic must distinguish first-time create from subsequent update and from a missing remote document.
- Product copy across inbox, detail, archives, and confirmations changes from 归档 to 同步.
