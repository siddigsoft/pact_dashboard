Backup Supabase schema (tables, FKs, constraints, extensions, and RLS policies)

What this does
- Uses pg_dump to create a schema-only dump (no row data).
- The dump includes: CREATE TABLE, CONSTRAINTs, FOREIGN KEYs, INDEXes, extensions, functions, triggers, and RLS policies (CREATE POLICY / ALTER TABLE ... ENABLE ROW LEVEL SECURITY).
- Output is gzipped and timestamped.

Why use this instead of copying files
- pg_dump is the authoritative way to export DDL from PostgreSQL and will include Postgres-native objects such as policies and FK constraints in the generated SQL.

Prerequisites
- Install PostgreSQL client tools (provides pg_dump and psql). On macOS:
  brew install postgresql

How to run
- Provide the database connection string as an environment variable or as the first argument:

  DATABASE_URL="postgresql://<user>:<pass>@<host>:5432/<db>" ./scripts/backup_supabase_schema.sh

  or

  ./scripts/backup_supabase_schema.sh "postgresql://<user>:<pass>@<host>:5432/<db>" ./backups

- The script writes a file named `supabase_schema_YYYYMMDD_HHMMSS.sql.gz` into the current directory (or provided out dir).

Security notes
- The connection string contains credentials. Keep it secret and do not commit it to git.
- The Supabase `SERVICE_ROLE` key is NOT the same as the database connection string. To get the DB connection string go to your Supabase project -> Settings -> Database -> Connection string (or see 'Connection pooling' section in Supabase dashboard).

Restoring the schema into a new database (example)
1. Create an empty Postgres database (on the target server). Ensure the Postgres version is compatible with the source.

2. Upload the SQL and restore:

   gunzip -c supabase_schema_YYYYMMDD_HHMMSS.sql.gz > supabase_schema.sql
   psql "postgresql://<user>:<pass>@<host>:5432/<new_db>" -f supabase_schema.sql

Notes and edge-cases
- Owners: The script uses --no-owner to avoid OWNER statements. If you need ownership preserved, remove --no-owner and run as a superuser.
- Privileges: --no-acl avoids copying GRANT/REVOKE statements. If you want privileges preserved, remove that flag.
- Extensions: pg_dump typically includes extension creation statements; some extensions require superuser or specific privileges—check the SQL and adjust as needed.
- Supabase internal schemas: Supabase uses schemas such as `auth`, `storage`, and `realtime`. Those should be included in the dump if present.
- Row-Level Security (RLS) policies: pg_dump includes CREATE POLICY statements and the RLS enable/disable statements; after restoring, verify RLS is enabled for tables that had it.

Verification (quick checks)
- Open the SQL file and search for `CREATE POLICY` — you should see policy definitions.
- Search for `FOREIGN KEY` or `REFERENCES` to confirm FK constraints are present.
- After restoring into a staging DB, test a small set of operations and check RLS behavior and referential integrity.

If you want, I can:
- Add an automated scheduled backup (cron or GitHub Actions) example that uses this script.
- Create a restore script that runs safety checks before applying.
