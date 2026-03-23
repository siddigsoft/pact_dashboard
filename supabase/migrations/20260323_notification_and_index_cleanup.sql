-- Performance follow-up from DB audit:
-- 1) Support notification feed filters on user_id + created_at.
-- 2) Remove duplicate indexes that add write overhead.

create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);

create index if not exists idx_notifications_recipient_created
  on public.notifications (recipient_id, created_at desc);

drop index if exists public.idx_down_payment_requests_requester;
drop index if exists public.idx_mmp_site_entries_file_id;
drop index if exists public.idx_mmp_site_entries_mmp_file;
