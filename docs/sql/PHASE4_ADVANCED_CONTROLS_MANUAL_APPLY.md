# PACT Accounting — Phase 4 Advanced Controls · Manual Apply Runbook

## What this migration does

`supabase/migrations/20260520_acct_phase4_advanced.sql` (188 lines)

Creates the schema that Phase 4 GL bridge triggers depend on, plus a complete
Tax Management module and exchange-rate registry:

| Part | What |
|---|---|
| 1 | `acct_tax_codes` — tax code registry with 6 seeded Sudan codes (VAT17, VAT0, WHT5, WHT10, STAMP, CUSTOMS) + `acct_tax_codes_updated_at` trigger |
| 2 | `acct_exchange_rates` — FX rate history table + `acct_get_exchange_rate(from, to, date)` RPC |
| 3 | `acct_tax_summary()` RPC + adds `tax_code_id` column to `acct_invoices` |
| 4 | `acct_period_close_log` — audit trail for period status transitions |
| 5 | `acct_budget_encumbrances` — commitment accounting table (required by Phase 4 bridge trigger) |
| 6 | 4 feature flags: `acct.multi_currency.enabled`, `acct.tax.auto_apply`, `acct.encumbrance.enabled`, `acct.period_auto_close` (all disabled by default) |

---

## Prerequisites

- ✅ Phase 1 applied (provides `acct_accounts`, `acct_fiscal_periods`, `acct_funds`)
- ✅ Phase 2 applied (provides `acct_invoices` for the `tax_code_id` column patch)

This file is the **prerequisite for `accounting_gl_bridges_phase4.sql`**
(the bridge trigger for `acct_budget_encumbrances` needs that table to exist).

Apply order:
1. `20260520_acct_phase4_advanced.sql` ← **this file**
2. `accounting_gl_bridges_phase4.sql`

---

## Pre-flight checks

```sql
-- 1. Phase 2 tables present (acct_invoices needed for tax_code_id patch)
SELECT count(*) FROM public.acct_invoices;       -- must not error

-- 2. acct_accounts present (tax_codes GL link)
SELECT count(*) FROM public.acct_accounts;       -- must not error

-- 3. acct_fiscal_periods present (period_close_log FK)
SELECT count(*) FROM public.acct_fiscal_periods; -- must not error

-- 4. acct_funds present (budget_encumbrances FK)
SELECT count(*) FROM public.acct_funds;          -- must not error
```

---

## Apply steps

1. Open **Supabase Dashboard → SQL Editor** for `abznugnirnlrqnnfkein`
2. Create a new query tab
3. Paste the **entire** content of `supabase/migrations/20260520_acct_phase4_advanced.sql`
4. Click **Run** — this file uses `BEGIN` … `COMMIT` via Supabase auto-transaction; all idempotent

---

## Smoke tests

```sql
-- 1. Tax codes seeded
SELECT code, name_en, rate_pct
FROM public.acct_tax_codes
ORDER BY code;         -- expect 6 rows: CUSTOMS, STAMP, VAT0, VAT17, WHT10, WHT5

-- 2. acct_invoices now has tax_code_id
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'acct_invoices'
  AND column_name  = 'tax_code_id';   -- expect 1 row

-- 3. Tax summary RPC works
SELECT * FROM public.acct_tax_summary();

-- 4. Exchange rate helper works
SELECT public.acct_get_exchange_rate('USD', 'SDG', current_date);
-- returns NULL if no rates loaded yet — that's expected

-- 5. Budget encumbrances table ready
SELECT count(*) FROM public.acct_budget_encumbrances;   -- expect 0

-- 6. Period close log table ready
SELECT count(*) FROM public.acct_period_close_log;      -- expect 0

-- 7. Feature flags
SELECT key, is_enabled
FROM public.feature_flags
WHERE key IN (
  'acct.multi_currency.enabled',
  'acct.tax.auto_apply',
  'acct.encumbrance.enabled',
  'acct.period_auto_close'
)
ORDER BY key;          -- expect 4 rows, all false
```

---

## Rollback

Apply `docs/sql/PHASE4_ADVANCED_CONTROLS_ROLLBACK.sql`.

---

## Next step

After smoke tests pass, apply `accounting_gl_bridges_phase4.sql` following
`docs/sql/PHASE4_GL_BRIDGES_MANUAL_APPLY.md`.
