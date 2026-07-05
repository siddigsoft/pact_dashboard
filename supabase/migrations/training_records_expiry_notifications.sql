-- T014: Training & Certification expiry alerts
-- Previously expiring/expired training_records were only ever surfaced as a
-- KPI count and a filter tab inside the Training & Certifications page —
-- nothing notified the staff member or HR, so certifications could lapse
-- silently if nobody happened to open the page. This adds a tracking column
-- so the app can dispatch an in-app/email notification once per record when
-- it enters the "expiring soon" or "expired" window, without re-notifying on
-- every page load.
--
-- Apply manually in the Supabase SQL editor. Not auto-run by the app.

alter table public.training_records
  add column if not exists last_expiry_notified_at timestamptz,
  add column if not exists last_expiry_notified_state text; -- 'expiring' | 'expired'
