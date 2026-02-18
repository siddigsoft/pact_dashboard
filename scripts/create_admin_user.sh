#!/usr/bin/env bash
set -euo pipefail

# Creates an auth user via Supabase Admin API and inserts a profile row.
# Usage: 
# 1) Ensure your repository .env contains VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or export them into the environment).
# 2) Optionally set PSQL_CONN to a psql connection string for your DB (e.g. postgresql://user:pass@host:5432/dbname).
# 3) Run: ./scripts/create_admin_user.sh

# Load .env variables if present
if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a
  source .env
  set +a
fi

: "${VITE_SUPABASE_URL:?VITE_SUPABASE_URL is required (from .env)}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required (from .env)}"

EMAIL="ssemagandageorge480@gmail.com"
PASSWORD="Pact1234"

echo "Creating Supabase auth user for ${EMAIL}..."

# create user via Supabase Admin API
resp=$(curl -s -w "\n%{http_code}" -X POST "${VITE_SUPABASE_URL}/auth/v1/admin/users" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"email_confirm\":true}")

# separate body and status
status=$(echo "$resp" | tail -n1)
body=$(echo "$resp" | sed '$d')

if [ "$status" != "200" ] && [ "$status" != "201" ]; then
  echo "Failed to create user. HTTP status: $status" >&2
  echo "Response body: $body" >&2
  exit 1
fi

# parse id (requires jq)
if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required to parse the response. Install jq or extract the id manually from: $body" >&2
  echo "Response: $body" >&2
  exit 1
fi

user_id=$(echo "$body" | jq -r '.id')
if [ -z "$user_id" ] || [ "$user_id" = "null" ]; then
  echo "No user id returned. Response: $body" >&2
  exit 1
fi

echo "Created auth user with id: $user_id"

# Insert profile row (use PSQL_CONN env var, or ask user to provide a connection string)
PSQL_CONN="${PSQL_CONN:-}
"
if [ -z "$PSQL_CONN" ]; then
  echo "No PSQL_CONN provided. To insert a profile row automatically, set PSQL_CONN env var to your Postgres connection string (e.g. postgresql://user:pass@host:5432/dbname) and re-run this script." 
  echo "Alternatively, run the following SQL manually in your DB (replace <USER_ID>):"
  echo
  echo "INSERT INTO public.profiles (id, email, full_name, role, created_at, updated_at) VALUES ('$user_id', '${EMAIL}', 'Admin', 'admin', now(), now());"
  exit 0
fi

# Run SQL to insert profile. Uses psql to connect.
psql "$PSQL_CONN" -v ON_ERROR_STOP=1 -c "INSERT INTO public.profiles (id, email, full_name, role, created_at, updated_at) VALUES ('$user_id', '${EMAIL}', 'Admin', 'admin', now(), now()) ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, full_name=EXCLUDED.full_name, role=EXCLUDED.role, updated_at=now();"

echo "Profile created/updated for user id $user_id"

echo "Done. The user should now be able to log in with the provided password (email confirmed)."
