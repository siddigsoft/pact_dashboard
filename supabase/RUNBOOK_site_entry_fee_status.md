# Runbook: Enumerator Fee ↔ Down Payment Cross-Reference

## What this does
Adds a read-only SECURITY DEFINER function, `get_site_entry_fee_status`, that
lets the Down Payment / Transport Advance approval page look up whether the
Enumerator Fee / Transport Fee for a site has already been marked "paid" in
the Enumerator Fees Report ledger (`mmp_site_entries.fee_paid_status` /
`fee_paid_amount` / `fee_paid_at` / `fee_payment_method` /
`enumerator_fee` / `transport_fee`).

It follows the same pattern as the existing `get_entry_enrichment` and
`get_dp_requests_for_user` RPCs already used by this page — it bypasses RLS
in a narrow, read-only way so supervisors/admins reviewing advances for sites
outside their own hub can still see the fee status.

## What changes on the page
On each Transport Advance / Down Payment request card:
- If the site's fee is marked **paid** in the ledger → a green "Fees Paid"
  badge appears next to the status badge, plus a highlighted green row
  showing the paid amount and date.
- If **not paid** and the site has an enumerator/transport fee on record →
  an amber "Transport Fee Not Paid" badge appears, plus a highlighted amber
  row showing the remaining Enumerator Fee still owed.
- If the site entry doesn't have fee amounts recorded at all, no fee badge is
  shown (unchanged behavior).

No existing columns, tables, or RPCs are modified — this only adds one new
function.

## How to apply
1. Open the Supabase SQL Editor for this project.
2. Run the contents of:
   `supabase/migrations/20260706_get_site_entry_fee_status.sql`
3. Verify it succeeded — you should see `get_site_entry_fee_status` under
   Database → Functions.
4. Refresh the Down Payment Approval page. Cards for sites with a recorded
   fee status will now show the badges described above.

## Rollback
```sql
DROP FUNCTION IF EXISTS public.get_site_entry_fee_status(uuid[]);
```
Dropping it just removes the lookup — the page falls back to showing no fee
badges (same as before this change), nothing else is affected.
