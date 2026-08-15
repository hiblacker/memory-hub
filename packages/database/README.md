# Database package

`@memory-hub/database` owns the PostgreSQL connection, schema initialization and the data-access boundary used by API authentication.

## Schema version 1

The API applies version 1 during startup and records it in `schema_migrations`. The migration creates:

- `users`
- `sessions`
- `memory_candidates`
- `archive_deliveries`

The initialization is idempotent. Existing tables and the applied migration record are preserved across restarts.

## Recovery

Version 1 only creates new tables and indexes. If startup fails before the transaction commits, PostgreSQL rolls back the versioned migration and the API can be restarted after correcting the database connection.

Do not remove the migration record or drop tables to retry initialization. Restore from the latest logical backup if a future migration changes persisted data.
