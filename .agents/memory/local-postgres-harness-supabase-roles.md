---
name: Local PostgreSQL harness Supabase roles
description: Requirements for compiling Supabase migrations in a disposable local PostgreSQL cluster.
---

When compiling a migration that grants policies to `authenticated`, a disposable local PostgreSQL harness must create that role first and connect using the OS user created by `initdb`, not `postgres`.

**Why:** `initdb` creates the invoking workspace user as the local superuser, while Supabase-specific roles such as `authenticated` do not exist in a bare cluster.

**How to apply:** Create `authenticated` in the schema stub and call `psql -U "$(id -un)"`; run server setup, migration, and assertions in the same shell invocation so the temporary server remains available. In this environment, also set `pg_ctl -o "-k <temporary-socket-directory>"` and pass that directory to `psql -h`, because the default `/run/postgresql` socket directory is absent.

When testing an authenticated `UPDATE` trigger under RLS, the fixture needs both
an UPDATE policy and a SELECT policy for the target row. Without SELECT
visibility PostgreSQL may update zero rows, so the statement succeeds without
ever invoking the trigger.

**Why:** A permissive UPDATE-only fixture produced a false bypass result because
the protected row was invisible rather than writable.

**How to apply:** Mirror production read visibility in trigger-bypass fixtures,
and assert the protected trigger error instead of accepting a zero-row update.