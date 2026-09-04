-- Managed external guest access for Workspace folders.
-- Raw bearer tokens are returned once and never stored; only SHA-256 hashes
-- are persisted. Guest content access is performed by the workspace-guest
-- Edge Function, which validates revocation and expiry on every request.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.workspace_guest_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES public.workspace_folders(id) ON DELETE CASCADE,
  guest_name text NOT NULL,
  guest_email text NOT NULL,
  access_level text NOT NULL DEFAULT 'viewer'
    CHECK (access_level IN ('viewer', 'editor')),
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_accessed_at timestamptz,
  CONSTRAINT workspace_guest_access_email_nonempty
    CHECK (length(btrim(guest_email)) > 3),
  CONSTRAINT workspace_guest_access_name_nonempty
    CHECK (length(btrim(guest_name)) > 0)
);

CREATE INDEX IF NOT EXISTS workspace_guest_access_folder_idx
  ON public.workspace_guest_access(folder_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workspace_guest_access_active_idx
  ON public.workspace_guest_access(folder_id, expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.workspace_guest_access ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.workspace_guest_upload_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_id uuid NOT NULL REFERENCES public.workspace_guest_access(id) ON DELETE CASCADE,
  folder_id uuid NOT NULL REFERENCES public.workspace_folders(id) ON DELETE CASCADE,
  token_hash_snapshot text NOT NULL,
  upload_key text NOT NULL UNIQUE,
  final_key text NOT NULL UNIQUE,
  expected_size bigint NOT NULL CHECK (expected_size >= 0 AND expected_size <= 524288000),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_guest_upload_intents_active_idx
  ON public.workspace_guest_upload_intents(access_id, expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE public.workspace_guest_upload_intents ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.workspace_can_manage_guest_access(p_folder_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND lower(replace(COALESCE(p.role, ''), ' ', '_'))
          IN ('admin', 'super_admin', 'superadmin')
    )
    AND EXISTS (
      SELECT 1
      FROM public.workspace_folders f
      WHERE f.id = p_folder_id
        AND COALESCE(f.archived, false) = false
    );
$$;

REVOKE ALL ON FUNCTION public.workspace_can_manage_guest_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workspace_can_manage_guest_access(uuid) TO authenticated;

DROP POLICY IF EXISTS "workspace_guest_access_select" ON public.workspace_guest_access;
CREATE POLICY "workspace_guest_access_select"
  ON public.workspace_guest_access
  FOR SELECT
  TO authenticated
  USING (public.workspace_can_manage_guest_access(folder_id));

-- Creation is intentionally RPC-only so the database generates the secret.
DROP POLICY IF EXISTS "workspace_guest_access_insert" ON public.workspace_guest_access;
DROP POLICY IF EXISTS "workspace_guest_access_update" ON public.workspace_guest_access;
DROP POLICY IF EXISTS "workspace_guest_access_delete" ON public.workspace_guest_access;

CREATE OR REPLACE FUNCTION public.create_workspace_guest_access(
  p_folder_id uuid,
  p_guest_name text,
  p_guest_email text,
  p_access_level text,
  p_expires_at timestamptz,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_row public.workspace_guest_access%ROWTYPE;
BEGIN
  IF NOT public.workspace_can_manage_guest_access(p_folder_id) THEN
    RAISE EXCEPTION 'Not authorized to manage guest access for this folder';
  END IF;
  IF p_access_level NOT IN ('viewer', 'editor') THEN
    RAISE EXCEPTION 'Guest access must be viewer or editor';
  END IF;
  IF length(btrim(COALESCE(p_guest_name, ''))) = 0 THEN
    RAISE EXCEPTION 'Guest name is required';
  END IF;
  IF length(btrim(COALESCE(p_guest_email, ''))) < 4
     OR position('@' IN p_guest_email) < 2 THEN
    RAISE EXCEPTION 'A valid guest email is required';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'Expiry must be in the future';
  END IF;
  IF p_expires_at > now() + interval '1 year' THEN
    RAISE EXCEPTION 'Guest access cannot exceed one year';
  END IF;

  v_token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO public.workspace_guest_access (
    folder_id, guest_name, guest_email, access_level,
    token_hash, token_prefix, expires_at, notes, created_by
  ) VALUES (
    p_folder_id, btrim(p_guest_name), lower(btrim(p_guest_email)), p_access_level,
    encode(digest(v_token, 'sha256'), 'hex'), left(v_token, 8),
    p_expires_at, NULLIF(btrim(p_notes), ''), auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'token', v_token,
    'guest_name', v_row.guest_name,
    'guest_email', v_row.guest_email,
    'access_level', v_row.access_level,
    'expires_at', v_row.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rotate_workspace_guest_access(p_access_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_row public.workspace_guest_access%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.workspace_guest_access
  WHERE id = p_access_id;

  IF NOT FOUND OR NOT public.workspace_can_manage_guest_access(v_row.folder_id) THEN
    RAISE EXCEPTION 'Guest access not found or not authorized';
  END IF;
  IF v_row.revoked_at IS NOT NULL OR v_row.expires_at <= now() THEN
    RAISE EXCEPTION 'Revoked or expired guest access cannot be rotated';
  END IF;

  v_token := encode(gen_random_bytes(24), 'hex');
  UPDATE public.workspace_guest_access
  SET token_hash = encode(digest(v_token, 'sha256'), 'hex'),
      token_prefix = left(v_token, 8),
      updated_at = now()
  WHERE id = p_access_id;

  RETURN jsonb_build_object('id', p_access_id, 'token', v_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_workspace_guest_access(
  p_access_id uuid,
  p_access_level text,
  p_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.workspace_guest_access%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.workspace_guest_access
  WHERE id = p_access_id;

  IF NOT FOUND OR NOT public.workspace_can_manage_guest_access(v_row.folder_id) THEN
    RAISE EXCEPTION 'Guest access not found or not authorized';
  END IF;
  IF v_row.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Revoked guest access cannot be reactivated';
  END IF;
  IF p_access_level NOT IN ('viewer', 'editor') THEN
    RAISE EXCEPTION 'Guest access must be viewer or editor';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= now() OR p_expires_at > now() + interval '1 year' THEN
    RAISE EXCEPTION 'Expiry must be in the future and within one year';
  END IF;

  UPDATE public.workspace_guest_access
  SET access_level = p_access_level,
      expires_at = p_expires_at,
      updated_at = now()
  WHERE id = p_access_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_workspace_guest_access(p_access_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_folder_id uuid;
BEGIN
  SELECT folder_id INTO v_folder_id
  FROM public.workspace_guest_access
  WHERE id = p_access_id;

  IF v_folder_id IS NULL OR NOT public.workspace_can_manage_guest_access(v_folder_id) THEN
    RAISE EXCEPTION 'Guest access not found or not authorized';
  END IF;

  UPDATE public.workspace_guest_access
  SET revoked_at = COALESCE(revoked_at, now()),
      updated_at = now()
  WHERE id = p_access_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_workspace_guest_upload_intent(
  p_access_id uuid,
  p_token_hash text,
  p_folder_id uuid,
  p_upload_key text,
  p_final_key text,
  p_expected_size bigint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access public.workspace_guest_access%ROWTYPE;
  v_intent_id uuid;
  v_pending_count integer;
  v_pending_bytes bigint;
BEGIN
  SELECT * INTO v_access
  FROM public.workspace_guest_access
  WHERE id = p_access_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_access.revoked_at IS NOT NULL
     OR v_access.expires_at <= now()
     OR v_access.access_level <> 'editor'
     OR v_access.token_hash <> p_token_hash THEN
    RAISE EXCEPTION 'Guest editor access is no longer valid';
  END IF;
  IF p_expected_size < 0 OR p_expected_size > 524288000 THEN
    RAISE EXCEPTION 'Guest uploads are limited to 500 MB per file';
  END IF;

  SELECT count(*), COALESCE(sum(expected_size), 0)
  INTO v_pending_count, v_pending_bytes
  FROM public.workspace_guest_upload_intents
  WHERE access_id = p_access_id
    AND consumed_at IS NULL
    AND expires_at > now();

  IF v_pending_count >= 3 OR v_pending_bytes + p_expected_size > 1073741824 THEN
    RAISE EXCEPTION 'Guest upload limit reached; finish or wait for pending uploads to expire';
  END IF;

  INSERT INTO public.workspace_guest_upload_intents (
    access_id, folder_id, token_hash_snapshot, upload_key, final_key,
    expected_size, expires_at
  ) VALUES (
    p_access_id, p_folder_id, p_token_hash, p_upload_key, p_final_key,
    p_expected_size, now() + interval '15 minutes'
  )
  RETURNING id INTO v_intent_id;

  RETURN v_intent_id;
END;
$$;

-- Service-only transactional finalization. R2 existence and size are checked
-- by the Edge Function before this function consumes the one-time intent.
CREATE OR REPLACE FUNCTION public.finalize_workspace_guest_upload(
  p_access_id uuid,
  p_upload_id uuid,
  p_final_key text,
  p_file_name text,
  p_actual_size bigint,
  p_mime_type text,
  p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intent public.workspace_guest_upload_intents%ROWTYPE;
  v_access public.workspace_guest_access%ROWTYPE;
  v_security_level text;
  v_file_id uuid;
  v_extension text;
BEGIN
  SELECT * INTO v_intent
  FROM public.workspace_guest_upload_intents
  WHERE id = p_upload_id
    AND access_id = p_access_id
    AND final_key = p_final_key
  FOR UPDATE;

  IF NOT FOUND OR v_intent.consumed_at IS NOT NULL OR v_intent.expires_at <= now() THEN
    RAISE EXCEPTION 'Upload intent is invalid, expired, or already used';
  END IF;
  IF p_actual_size <> v_intent.expected_size THEN
    RAISE EXCEPTION 'Uploaded file size does not match the authorized size';
  END IF;

  SELECT * INTO v_access
  FROM public.workspace_guest_access
  WHERE id = p_access_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_access.revoked_at IS NOT NULL
     OR v_access.expires_at <= now()
     OR v_access.access_level <> 'editor'
     OR v_access.token_hash <> v_intent.token_hash_snapshot THEN
    RAISE EXCEPTION 'Guest editor access is no longer valid';
  END IF;

  SELECT security_level INTO v_security_level
  FROM public.workspace_folders
  WHERE id = v_intent.folder_id AND COALESCE(archived, false) = false;
  IF v_security_level IS NULL THEN
    RAISE EXCEPTION 'Target folder is unavailable';
  END IF;

  v_extension := CASE
    WHEN position('.' IN p_file_name) > 0
      THEN lower(regexp_replace(p_file_name, '^.*\.', ''))
    ELSE NULL
  END;

  INSERT INTO public.workspace_files (
    folder_id, name, description, storage_path, public_url, storage_provider,
    file_size, mime_type, extension, security_level,
    created_by, last_modified_by, tags
  ) VALUES (
    v_intent.folder_id, p_file_name, NULLIF(btrim(p_description), ''),
    p_final_key, NULL, 'r2', p_actual_size, NULLIF(p_mime_type, ''),
    v_extension, v_security_level, NULL, NULL, ARRAY[]::text[]
  )
  RETURNING id INTO v_file_id;

  UPDATE public.workspace_guest_upload_intents
  SET consumed_at = now()
  WHERE id = p_upload_id;

  RETURN jsonb_build_object('id', v_file_id, 'name', p_file_name);
END;
$$;

REVOKE ALL ON FUNCTION public.create_workspace_guest_access(uuid, text, text, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rotate_workspace_guest_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_workspace_guest_access(uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_workspace_guest_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_workspace_guest_upload_intent(uuid, text, uuid, text, text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_workspace_guest_upload(uuid, uuid, text, text, bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_workspace_guest_access(uuid, text, text, text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_workspace_guest_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_workspace_guest_access(uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_workspace_guest_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_workspace_guest_upload_intent(uuid, text, uuid, text, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_workspace_guest_upload(uuid, uuid, text, text, bigint, text, text) TO service_role;

COMMENT ON TABLE public.workspace_guest_access IS
  'Expiring, individually revocable external Workspace folder access. Stores only hashed bearer tokens.';
COMMENT ON TABLE public.workspace_guest_upload_intents IS
  'Short-lived one-time upload authorizations for managed Workspace guest editors.';