-- Guest share links (/view/:code and /workspace/share/folder/:code) are
-- capability URLs: knowing the short_code is the access grant.
--
-- Anon RLS on workspace_files only allowed rows with public_url set and
-- not restricted/top_secret. R2 files store public_url as NULL, so WhatsApp /
-- mobile Safari (no session) always got "File not found". workspace_folders
-- had no anon SELECT policy at all.
--
-- These SECURITY DEFINER RPCs look up a single shared item by code without
-- exposing a list of all files. GRANT to anon + authenticated.

CREATE OR REPLACE FUNCTION public.get_shared_workspace_file(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := btrim(p_code);
  v_row  jsonb;
BEGIN
  IF v_code IS NULL OR v_code = '' OR length(v_code) > 36 THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', f.id,
    'name', f.name,
    'mime_type', f.mime_type,
    'extension', f.extension,
    'public_url', f.public_url,
    'storage_path', f.storage_path,
    'storage_provider', COALESCE(f.storage_provider, 'supabase'),
    'file_size', f.file_size,
    'description', f.description,
    'security_level', f.security_level,
    'short_code', f.short_code,
    'allow_download', COALESCE(f.allow_download, true),
    'is_pinned', COALESCE(f.is_pinned, false),
    'tags', COALESCE(f.tags, ARRAY[]::text[]),
    'created_at', f.created_at
  )
  INTO v_row
  FROM workspace_files f
  WHERE f.archived = false
    AND (
      lower(f.short_code) = lower(v_code)
      OR (
        v_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND f.id = v_code::uuid
      )
    )
  LIMIT 1;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_shared_workspace_folder(p_code text, p_folder_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code   text := btrim(p_code);
  v_root   workspace_folders%ROWTYPE;
  v_folder workspace_folders%ROWTYPE;
  v_under  boolean;
BEGIN
  IF v_code IS NULL OR v_code = '' OR length(v_code) > 36 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_root
  FROM workspace_folders
  WHERE archived = false
    AND (
      lower(short_code) = lower(v_code)
      OR (
        v_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND id = v_code::uuid
      )
    )
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF p_folder_id IS NULL OR p_folder_id = v_root.id THEN
    v_folder := v_root;
  ELSE
    SELECT EXISTS (
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_folder_id
        FROM workspace_folders
        WHERE id = p_folder_id AND archived = false
        UNION
        SELECT f.id, f.parent_folder_id
        FROM workspace_folders f
        JOIN ancestors a ON f.id = a.parent_folder_id
        WHERE f.archived = false
      )
      SELECT 1 FROM ancestors WHERE id = v_root.id
    ) INTO v_under;

    IF NOT COALESCE(v_under, false) THEN
      RETURN NULL;
    END IF;

    SELECT * INTO v_folder
    FROM workspace_folders
    WHERE id = p_folder_id AND archived = false;

    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'folder', jsonb_build_object(
      'id', v_folder.id,
      'name', v_folder.name,
      'description', v_folder.description,
      'parent_folder_id', v_folder.parent_folder_id,
      'security_level', v_folder.security_level,
      'color', COALESCE(v_folder.color, ''),
      'icon', COALESCE(v_folder.icon, ''),
      'short_code', v_folder.short_code,
      'password_protected', v_folder.password_hash IS NOT NULL
    ),
    'subfolders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'description', s.description,
        'parent_folder_id', s.parent_folder_id,
        'security_level', s.security_level,
        'color', COALESCE(s.color, ''),
        'icon', COALESCE(s.icon, ''),
        'short_code', s.short_code,
        'password_protected', s.password_hash IS NOT NULL
      ) ORDER BY s.name)
      FROM workspace_folders s
      WHERE s.parent_folder_id = v_folder.id AND s.archived = false
    ), '[]'::jsonb),
    'files', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id,
        'name', f.name,
        'description', f.description,
        'file_size', f.file_size,
        'mime_type', f.mime_type,
        'extension', f.extension,
        'security_level', f.security_level,
        'storage_path', f.storage_path,
        'storage_provider', COALESCE(f.storage_provider, 'supabase'),
        'public_url', f.public_url,
        'short_code', f.short_code,
        'allow_download', COALESCE(f.allow_download, true),
        'is_pinned', COALESCE(f.is_pinned, false),
        'tags', COALESCE(f.tags, ARRAY[]::text[]),
        'created_at', f.created_at
      ) ORDER BY f.name)
      FROM workspace_files f
      WHERE f.folder_id = v_folder.id AND f.archived = false
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_shared_workspace_file(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_workspace_file(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_shared_workspace_folder(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_workspace_folder(text, uuid) TO anon, authenticated;
