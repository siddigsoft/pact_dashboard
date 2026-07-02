-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: page_role_configs — super-admin editable default-role overrides
-- Run this once against your Supabase database (SQL Editor or psql).
--
-- Purpose:
--   Allows super admins to customise which roles have DEFAULT access to any
--   page, directly from the Page Access Control panel.
--   When a row exists for a page_slug, its `roles` array replaces the
--   hardcoded PAGE_DEFS[slug].roles for that page.
--   When no row exists, PAGE_DEFS roles are used as usual (safe fallback).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS page_role_configs (
  page_slug  TEXT        PRIMARY KEY,
  roles      TEXT[]      NOT NULL DEFAULT '{}',
  updated_by UUID        REFERENCES profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE page_role_configs IS
  'Super-admin overrides for which roles get default access to a page. '
  'Rows here win over hardcoded PAGE_DEFS roles.';

ALTER TABLE page_role_configs ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read (sidebar + page-visibility checks need it)
CREATE POLICY "Authenticated users can read page_role_configs"
  ON page_role_configs FOR SELECT
  TO authenticated
  USING (true);

-- Only super admins can write
CREATE POLICY "Super admins manage page_role_configs"
  ON page_role_configs FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'superAdmin', 'Super Admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'superAdmin', 'Super Admin')
    )
  );
