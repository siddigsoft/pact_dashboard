# Accounting Phase 3 — Workflow Enhancements Runbook

## 1. Apply the SQL Migration

Go to **Supabase Dashboard → SQL Editor** and run:

```
supabase/migrations/20260712_accounting_phase3_workflow_enhancements.sql
```

When prompted, choose **"Enable RLS"**.

This migration does:
- Adds `tier1_approved_by/at`, `tier2_approved_by/at`, `reviewed_by/at`, `rejection_reason`, `paid_at`, `paid_by` columns to `acct_expense_reports`
- Adds `submitted_at`, `processed_at`, `completed_at`, `swift_confirm_ref`, `rejection_reason` to `acct_wire_transfers`
- Creates `acct_petty_cash_replenishments` table with RLS
- Adds aging-query indexes on `acct_customer_invoices`

---

## 2. Deploy the Recurring Journal Edge Function

### a) Deploy via Supabase CLI

```bash
supabase functions deploy post-recurring-journals --no-verify-jwt
```

### b) Schedule with pg_cron (run in SQL Editor once)

```sql
-- Run daily at 00:05 UTC
SELECT cron.schedule(
  'recurring-journal-autopost',
  '5 0 * * *',
  $$
    SELECT net.http_post(
      url      := current_setting('app.supabase_url') || '/functions/v1/post-recurring-journals',
      headers  := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body     := '{}'::jsonb
    ) AS request_id;
  $$
);
```

> **Alternative:** Schedule via Supabase Dashboard → Edge Functions → post-recurring-journals → Schedule (Cron: `5 0 * * *`)

### c) Test manually

```bash
curl -X POST https://<YOUR_PROJECT>.supabase.co/functions/v1/post-recurring-journals \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

---

## 3. Feature Summary

| Feature | Where |
|---|---|
| Two-tier expense approval | Accounting → Expense Reports |
| Invoice PDF export | Accounting → Customer Invoices → printer icon |
| Petty cash replenishments | Accounting → Petty Cash → "Request Top-up" button |
| Per diem auto-calculation | Accounting → Expense Reports → New Report → Per Diem Calculator section |
| AR Aging Report | Accounting → Financial Operations → AR Aging Report |
| Wire transfer pipeline | Accounting → Wire Transfers → ✓ / ✗ action buttons |
| Recurring journal auto-post | Edge function `post-recurring-journals` — daily cron |

---

## 4. Making a Recurring Journal Auto-post

In **Accounting → Recurring Journals**, when creating a journal:
- Set **Auto Post** = ON
- Set **Next Run Date** = when you want it to first post
- The edge function will post it at 00:05 UTC on the due date and advance `next_run_date` automatically
