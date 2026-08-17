-- Google Drive integration state for Workspace import
ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS google_drive_connected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_drive_email text;

