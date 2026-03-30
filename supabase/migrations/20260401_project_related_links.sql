-- Migration: Add related_mmps and related_site_visits arrays to projects
-- These allow cross-page badge visibility on MMP and Site Visit pages.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS related_mmps text[] DEFAULT '{}';

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS related_site_visits text[] DEFAULT '{}';
