# WhatsApp Notification — Activation Runbook

All the code is already in place. This runbook tells you the exact steps to run once to make notifications live.

---

## Prerequisites

- Supabase CLI installed: `npm install -g supabase`
- Logged in: `supabase login`
- Your WasenderAPI API key (from https://wasenderapi.com → Dashboard → API Keys)

---

## Step 1 — Set secrets in Supabase Edge Functions

Go to: **Supabase Dashboard → Edge Functions → Secrets**

Add these secrets:

| Secret name | Value |
|---|---|
| `WASENDER_API_KEY` | Your WasenderAPI key |
| `WASENDER_WEBHOOK_SECRET` | Any strong random string (optional, secures inbound webhook) |

> Meta Cloud API secrets (optional — only needed if you also want Meta template messages):
> `META_WA_ACCESS_TOKEN_NEW`, `META_WA_PHONE_NUMBER_ID`, `META_WABA_ID`

---

## Step 2 — Deploy the edge functions

Run from the project root:

```bash
supabase functions deploy send-whatsapp --project-ref abznugnirnlrqnnfkein
supabase functions deploy whatsapp-webhook --project-ref abznugnirnlrqnnfkein
supabase functions deploy dispatch-notification --project-ref abznugnirnlrqnnfkein
```

> `dispatch-notification` also fires WhatsApp internally — redeploy it too so it picks up the `send-whatsapp` function URL.

---

## Step 3 — Run the database migration

Open **Supabase SQL Editor** and run:

```
supabase/migrations/20260428_whatsapp_final_setup.sql
```

This creates / updates the `whatsapp_logs` and `user_integrations` tables and their RLS policies. It is safe to re-run.

---

## Step 4 — Verify in the Admin Panel

1. Go to **Admin → WhatsApp** (or navigate to `/admin-whatsapp`)
2. Click the **Settings** tab
3. Click **Check Connection**
4. You should see a green "Connected" badge and a toast saying "WasenderAPI ✓"

If you see an error, double-check the `WASENDER_API_KEY` value in Supabase secrets and re-run Step 2.

---

## Step 5 — Enable WhatsApp per user

Each staff member needs to opt in:

1. Go to **My Profile → Notification Settings → WhatsApp**
2. Enter their WhatsApp phone number (Sudan: 09XXXXXXXX is auto-converted to +249)
3. Toggle **Enable WhatsApp notifications** ON
4. Select the categories they want: Tasks / Approvals / Payroll & HR / Projects / MMP

Or enable it directly in the database for all users:
```sql
UPDATE user_integrations
SET whatsapp_enabled = true
WHERE true;
```

---

## Step 6 — Configure inbound webhook (optional)

To receive replies from staff:

1. Copy the webhook URL from **Admin → WhatsApp → Settings → Inbound Webhook URL**
2. Paste it in: **WasenderAPI Dashboard → Settings → Webhook URL**
3. Replies will appear in the **Inbox** tab

---

## What fires WhatsApp notifications automatically

Once active, WhatsApp messages go out for:

| Category | Events |
|---|---|
| Tasks | Created, Assigned, Started, Acknowledged, Completed, Delayed, Rejected, Cancelled, Overdue, Due-tomorrow |
| Approvals | Leave requests, Cost submissions, Advance requests, Signatures, MMP forwarded |
| Status updates | Leave approved/rejected, Costs approved/rejected, Payslip ready, Project milestones, Site visits |
| Alerts | Task overdue, Contract expiring (7d / 30d), Budget 80% / 100% used, Project stalled |
| Reminders | Daily digest, Broadcast messages |

All messages are bilingual (English + Arabic) with timestamps.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Connection Error" on ping | Function not deployed — run Step 2 |
| "WASENDER_API_KEY not configured" | Key not in Supabase secrets — run Step 1 |
| Messages not arriving | User's `whatsapp_enabled` is false, or phone number is missing — run Step 5 |
| Delivery logs show `skipped` | Check `error_message` column — common: `no_phone`, `category_disabled`, `quiet_hours` |
| 401 errors in function logs | Run `supabase login` and redeploy |
