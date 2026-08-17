---
name: GL Bridge Account Codes
description: Confirmed account codes, fallback strategy, and common failure modes for the GL bridge in this project.
---

# GL Bridge Account Codes

## Confirmed postable account codes in COA (as of 2026-08-17)

| Code   | Name                        | Variants |
|--------|-----------------------------|----------|
| 120000 | Cash at Bank                | Country-specific + global (NULL) added by 20260817_fix_gl_bridge_v2 |
| 151000 | Travel Advances             | Country-specific + global (NULL) added by 20260817_fix_gl_bridge_v2 |
| 505000 | Operational Field Costs     | Country-specific (SD, SS) + global |
| 507000 | Data Collector Incentives   | Country-specific (SD, SS) + global |
| 520001 | Programme Supplies          | Global only |
| 532001 | Training & Workshops        | Global only |
| 570000 | Programme Vehicle & Fuel    | Global only |
| 631000 | Legal Fees                  | Global only |

**All codes are 6-digit.** 4-digit codes (1510, 1200, 5050, etc.) do NOT exist.

## Fallback strategy for account lookups

Always use a 3-tier COALESCE:
1. Country-specific: `code = X AND country_id = source.country_id`
2. Global null: `code = X AND country_id IS NULL`
3. Any: `code = X` (last resort)

Never do a single `WHERE code = X` — it will miss country-specific accounts or fail on global-only ones.

## Key source tables and their GL mapping

| Source table | Trigger event | DR account | CR account |
|---|---|---|---|
| `down_payment_requests` | status → `fully_paid` | 151000 | 120000 |
| `operational_cost_submissions` | status → `paid` | category-mapped via `acct_bridge_ops_cost_account()` | 120000 |

## Common failure modes (fixed 2026-08-17)

- `BRIDGE_ACCOUNT_NOT_FOUND: code=1200` — old trigger passed 4-digit code; fix: use `'120000'`
- `null value in column "idempotency_key"` — backfill RPC omitted it from INSERT
- `record "new" has no field "approved_by"` — old trigger used wrong column; correct: `tier1/2_approved_by`
- `CR 120000: MISSING` — no global (NULL country_id) row for 120000; fixed by inserting one

## idempotency_key patterns

- Down payments: `'dpr::' || id::text || '::fully_paid'`
- Ops costs: `'ocs::' || id::text || '::paid'`

**Why:** `acct_journal_entries.idempotency_key` is NOT NULL — omitting it crashes every INSERT.

## acct_bridge_post_journal() dependency

Older trigger functions called this helper. It works but only when account codes already exist in the DB. Newer trigger functions use inline SQL directly — more robust and no dependency on the helper.
