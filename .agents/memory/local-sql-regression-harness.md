---
name: Local SQL regression harness
description: Environment-specific details for validating transaction-scoped Supabase SQL tests against a disposable local PostgreSQL server.
---

When validating a SQL test without a configured Supabase database, initialize
the bundled PostgreSQL cluster as the workspace user and connect with that same
role. Do not create the default `postgres` database after `initdb`; it already
exists.

**Why:** The local client defaults can point at the `postgres` role, which is
not created in a cluster initialized by the workspace user. Attempting to
create the already-present default database also stops an otherwise valid
disposable-harness run before the SQL test executes.

**How to apply:** Use the directory containing `initdb` for `pg_ctl`, `psql`,
and related commands; initialize under `/tmp`, use a non-default port and
socket directory, then stop the server after the check. Treat `psql` success
and the final `ROLLBACK` as the result; PostgreSQL `NOTICE` messages are
written to stderr.

When compiling a Supabase migration that grants permissions, create the
`authenticated` role in the disposable schema before loading the migration.

**Why:** The local PostgreSQL cluster does not include Supabase runtime roles,
so an otherwise-valid `GRANT ... TO authenticated` fails only in the harness.

**How to apply:** Add `CREATE ROLE authenticated;` to the local schema setup;
do not remove the production grant from the migration.