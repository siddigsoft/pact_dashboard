-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add granular-permission notes column to page_access_overrides
-- Run this once against your Supabase database (SQL Editor or psql).
--
-- Purpose:
--   The Page Access Control panel now stores 4 independent permission flags
--   (Read, Write, Create, Delete) per user per page as a JSON object in this
--   column:  {"r":true,"w":false,"c":false,"d":false}
--
--   The existing `level` column ('view'|'manage') is kept for backward
--   compatibility and is still set automatically:
--     level = 'manage'  when  w OR c OR d is true
--     level = 'view'    when  only r is true (or notes is null)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE page_access_overrides
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;

COMMENT ON COLUMN page_access_overrides.notes IS
  'JSON granular permissions: {"r":true,"w":false,"c":false,"d":false}. '
  'r=Read  w=Write  c=Create  d=Delete. NULL = treat as Read-only default.';
