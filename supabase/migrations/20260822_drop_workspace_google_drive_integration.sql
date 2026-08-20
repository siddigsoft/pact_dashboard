-- Remove Workspace Google Drive integration
DELETE FROM public.user_integration_tokens
WHERE provider = 'google_drive';

ALTER TABLE public.user_integrations
  DROP COLUMN IF EXISTS google_drive_connected,
  DROP COLUMN IF EXISTS google_drive_email;
