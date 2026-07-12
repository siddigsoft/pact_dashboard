-- ============================================================
-- EMAIL DELIVERY DIAGNOSTIC — run in Supabase SQL Editor
-- Shows exactly why emails are or aren't being sent
-- ============================================================

-- 1. Check if notifications table has the email columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'notifications'
ORDER BY ordinal_position;

-- ============================================================
-- 2. Recent notifications — are any being created at all?
-- ============================================================
SELECT
  id,
  event_type,
  recipient_id,
  recipient_email,
  title_en,
  email_sent,
  email_error,
  status,
  created_at
FROM notifications
ORDER BY created_at DESC
LIMIT 20;

-- ============================================================
-- 3. Project-specific notifications in the last 7 days
-- ============================================================
SELECT
  event_type,
  recipient_email,
  title_en,
  email_sent,
  email_error,
  status,
  created_at
FROM notifications
WHERE event_type LIKE 'project_%'
  AND created_at > now() - interval '7 days'
ORDER BY created_at DESC;

-- ============================================================
-- 4. Email audit log — success and failures
-- ============================================================
SELECT
  entity_name,
  description,
  success,
  error_message,
  metadata->>'recipient' AS recipient_email,
  metadata->>'event_type' AS event_type,
  created_at
FROM audit_logs
WHERE module = 'notification'
  AND action = 'send'
  AND entity_type = 'email'
ORDER BY created_at DESC
LIMIT 20;

-- ============================================================
-- 5. Are profiles missing email addresses?
-- ============================================================
SELECT
  id,
  full_name,
  email,
  role,
  status
FROM profiles
WHERE status = 'approved'
ORDER BY full_name;
