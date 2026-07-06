---
name: Untracked SECURITY DEFINER RPCs
description: Some Supabase RPCs used by the app (e.g. get_entry_enrichment) exist live in the DB but have no matching migration file in the repo.
---

`get_entry_enrichment` (used for site/state/locality/MMP-name lookups bypassing
RLS) is called from the app but its `CREATE FUNCTION` SQL is not present in
`supabase/migrations/`. It was created directly in the Supabase SQL editor at
some point and never checked into the repo.

**Why this matters:** never try to "fix" or "extend" `get_entry_enrichment`
by guessing its current signature/body from usage — you cannot see its real
definition. If a related RPC is needed, create a **new**, separately named
SECURITY DEFINER function instead of touching the untracked one.

**How to apply:** when a new SECURITY DEFINER RPC is needed for a cross-entity
lookup, follow the pattern in `supabase/migrations/20260430_get_dp_requests_for_user.sql`
or `supabase/migrations/20260706_get_site_entry_fee_status.sql` — write a
fresh migration file, grant execute to `authenticated`, and give the user a
`supabase/RUNBOOK_*.md` describing how to run it manually (all accounting/HR
SQL in this project is applied manually by the user, never auto-run by the
agent).
