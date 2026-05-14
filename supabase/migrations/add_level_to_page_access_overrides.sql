-- Add access level to page_access_overrides
-- level: 'view' (default) = read-only access, 'manage' = full edit/create/delete rights
ALTER TABLE page_access_overrides
  ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'view';
