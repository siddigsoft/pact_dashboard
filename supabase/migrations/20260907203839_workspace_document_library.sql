-- Document categories are independent of legacy clearance levels.
-- Apply to the PACT database, then deploy r2-sign / workspace-guest / r2-extract.
BEGIN;
CREATE SCHEMA IF NOT EXISTS workspace_private;
REVOKE ALL ON SCHEMA workspace_private FROM PUBLIC;
GRANT USAGE ON SCHEMA workspace_private TO authenticated, anon, service_role;

ALTER TABLE public.workspace_files
  ADD COLUMN IF NOT EXISTS document_category text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'workspace',
  ADD COLUMN IF NOT EXISTS project_label text,
  ADD COLUMN IF NOT EXISTS site_label text,
  ADD COLUMN IF NOT EXISTS reporting_period text,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS storage_bucket text DEFAULT 'workspace-files';
ALTER TABLE public.workspace_folders ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'workspace';
ALTER TABLE public.workspace_files ADD CONSTRAINT workspace_document_category_check
  CHECK (document_category IN ('site_permit','payment_receipt','site_image','mmp','project_document','report','other'));
ALTER TABLE public.workspace_files ADD CONSTRAINT workspace_document_audience_check CHECK (audience IN ('workspace','admin_only'));
ALTER TABLE public.workspace_folders ADD CONSTRAINT workspace_folder_audience_check CHECK (audience IN ('workspace','admin_only'));
ALTER TABLE public.workspace_files ADD CONSTRAINT workspace_document_period_check
  CHECK (reporting_period IS NULL OR reporting_period ~ '^\d{4}-(0[1-9]|1[0-2])$');
CREATE INDEX workspace_documents_category_idx ON public.workspace_files(document_category, updated_at DESC) WHERE NOT archived;
CREATE UNIQUE INDEX workspace_documents_source_idx ON public.workspace_files(source_type, source_id, source_url)
  WHERE source_type IS NOT NULL;

CREATE FUNCTION workspace_private.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid()
    AND lower(replace(coalesce(role, ''), '_', '')) IN ('admin','superadmin')
  );
$$;
CREATE FUNCTION workspace_private.folder_protected(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_folder_id, audience FROM public.workspace_folders WHERE id = p_id
    UNION
    SELECT f.id, f.parent_folder_id, f.audience FROM public.workspace_folders f JOIN ancestors a ON f.id = a.parent_folder_id
  ) SELECT EXISTS (SELECT 1 FROM ancestors WHERE audience = 'admin_only');
$$;
CREATE FUNCTION workspace_private.file_protected(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_files f WHERE f.id = p_id AND
    (f.audience = 'admin_only' OR f.document_category IN ('site_permit','payment_receipt','site_image','mmp')
      OR workspace_private.folder_protected(f.folder_id)));
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA workspace_private FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA workspace_private TO authenticated, anon, service_role;

CREATE FUNCTION workspace_private.enforce_document_audience() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.document_category IN ('site_permit','payment_receipt','site_image','mmp')
    OR workspace_private.folder_protected(NEW.folder_id) THEN NEW.audience := 'admin_only'; END IF;
  -- Protection survives moves, copies registered under the same key, and restores.
  IF TG_OP = 'UPDATE' AND OLD.audience = 'admin_only' THEN NEW.audience := 'admin_only'; END IF;
  IF EXISTS (SELECT 1 FROM public.workspace_files f WHERE f.storage_path = NEW.storage_path
    AND f.storage_provider = NEW.storage_provider AND f.audience = 'admin_only') THEN NEW.audience := 'admin_only'; END IF;
  IF NEW.audience = 'admin_only' THEN NEW.public_url := NULL; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION workspace_private.enforce_document_audience() FROM PUBLIC;
CREATE TRIGGER workspace_document_audience BEFORE INSERT OR UPDATE ON public.workspace_files
FOR EACH ROW EXECUTE FUNCTION workspace_private.enforce_document_audience();

-- Restrictive policies AND with every existing permissive grant, including owner access.
CREATE POLICY workspace_document_ceiling ON public.workspace_files AS RESTRICTIVE FOR ALL TO authenticated, anon
USING (workspace_private.is_admin() OR NOT workspace_private.file_protected(id))
WITH CHECK (workspace_private.is_admin() OR (audience <> 'admin_only'
  AND document_category NOT IN ('site_permit','payment_receipt','site_image','mmp')
  AND NOT workspace_private.folder_protected(folder_id)));
CREATE POLICY workspace_document_admin ON public.workspace_files FOR ALL TO authenticated
USING (workspace_private.is_admin()) WITH CHECK (workspace_private.is_admin());
CREATE POLICY workspace_folder_ceiling ON public.workspace_folders AS RESTRICTIVE FOR ALL TO authenticated, anon
USING (workspace_private.is_admin() OR NOT workspace_private.folder_protected(id))
WITH CHECK (workspace_private.is_admin() OR (audience <> 'admin_only' AND NOT workspace_private.folder_protected(parent_folder_id)));
CREATE POLICY workspace_folder_admin ON public.workspace_folders FOR ALL TO authenticated
USING (workspace_private.is_admin()) WITH CHECK (workspace_private.is_admin());

-- Dependent rows must not reveal titles, comments, old keys, or activity.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['workspace_file_versions','workspace_comments','workspace_activity','workspace_permissions'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('CREATE POLICY workspace_document_ceiling ON public.%I AS RESTRICTIVE FOR ALL TO authenticated, anon USING (workspace_private.is_admin() OR NOT workspace_private.file_protected(file_id)) WITH CHECK (workspace_private.is_admin() OR NOT workspace_private.file_protected(file_id))', t);
    END IF;
  END LOOP;
END $$;

-- File broker lookup only for trusted Edge Functions. It deliberately ignores RLS
-- so a hidden file cannot be mistaken for an unregistered object.
CREATE FUNCTION public.workspace_storage_classification(p_key text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE protected boolean; found_file boolean;
BEGIN
  SELECT coalesce(bool_or(workspace_private.file_protected(id)), false), count(*) > 0
    INTO protected, found_file FROM public.workspace_files
    WHERE storage_path IN (p_key, 'trash/' || p_key, regexp_replace(p_key, '^trash/', ''));
  IF NOT protected AND to_regclass('public.workspace_file_versions') IS NOT NULL THEN
    SELECT coalesce(bool_or(workspace_private.file_protected(file_id)), false) INTO protected
      FROM public.workspace_file_versions WHERE storage_path IN (p_key, 'trash/' || p_key, regexp_replace(p_key, '^trash/', ''));
  END IF;
  -- Hub-only: protect keys registered as admin_only workspace rows.
  -- Do not blanket-classify SiteVisits/ (or other source paths) -- those remain
  -- readable through existing site-visit / MMP / payment flows.
  IF protected THEN RETURN 'admin_only'; END IF;
  RETURN CASE WHEN found_file THEN 'workspace' ELSE 'unregistered' END;
END;
$$;
REVOKE ALL ON FUNCTION public.workspace_storage_classification(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_storage_classification(text) TO service_role;

-- Legacy capability RPCs bypass RLS. Keep their implementation private and apply
-- the ceiling to every returned object, including children of mixed folders.
ALTER FUNCTION public.get_shared_workspace_file(text) SET SCHEMA workspace_private;
ALTER FUNCTION public.get_shared_workspace_folder(text, uuid) SET SCHEMA workspace_private;
REVOKE ALL ON FUNCTION workspace_private.get_shared_workspace_file(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION workspace_private.get_shared_workspace_folder(text, uuid) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.get_shared_workspace_file(p_code text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; BEGIN
  result := workspace_private.get_shared_workspace_file(p_code);
  IF result IS NULL OR (NOT workspace_private.is_admin() AND workspace_private.file_protected((result->>'id')::uuid)) THEN RETURN NULL; END IF;
  RETURN result;
END; $$;
CREATE FUNCTION public.get_shared_workspace_folder(p_code text, p_folder_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; BEGIN
  result := workspace_private.get_shared_workspace_folder(p_code, p_folder_id);
  IF result IS NULL OR (NOT workspace_private.is_admin() AND workspace_private.folder_protected((result->'folder'->>'id')::uuid)) THEN RETURN NULL; END IF;
  IF NOT workspace_private.is_admin() THEN
    result := jsonb_set(result, '{files}', coalesce((SELECT jsonb_agg(v) FROM jsonb_array_elements(result->'files') v WHERE NOT workspace_private.file_protected((v->>'id')::uuid)), '[]'::jsonb));
    result := jsonb_set(result, '{subfolders}', coalesce((SELECT jsonb_agg(v) FROM jsonb_array_elements(result->'subfolders') v WHERE NOT workspace_private.folder_protected((v->>'id')::uuid)), '[]'::jsonb));
  END IF;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.get_shared_workspace_file(text), public.get_shared_workspace_folder(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_workspace_file(text), public.get_shared_workspace_folder(text, uuid) TO anon, authenticated;

-- Persistent document index integration: references existing bytes, no duplicate upload.
CREATE FUNCTION workspace_private.index_document(d jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE category text; url text := d->>'file_url'; key text; bucket text; provider text;
BEGIN
  IF coalesce(url, '') = '' THEN RETURN; END IF;
  category := CASE d->>'category'
    WHEN 'mmp_file' THEN 'mmp' WHEN 'federal_permit' THEN 'site_permit' WHEN 'state_permit' THEN 'site_permit'
    WHEN 'local_permit' THEN 'site_permit' WHEN 'cost_receipt' THEN 'payment_receipt'
    WHEN 'transaction_receipt' THEN 'payment_receipt' WHEN 'site_visit_photo' THEN 'site_image'
    WHEN 'report' THEN 'report' ELSE 'other' END;
  IF url LIKE 'r2:%' THEN key := substr(url, 4); provider := 'r2'; bucket := NULL;
  ELSIF url ~ '/storage/v1/object/(public|sign|authenticated)/' THEN
    key := regexp_replace(split_part(url, '?', 1), '^.*/storage/v1/object/(public|sign|authenticated)/', '');
    bucket := split_part(key, '/', 1); key := substr(key, length(bucket) + 2); provider := 'supabase';
  ELSE RETURN; -- Unknown external locations remain in the source register for review.
  END IF;
  INSERT INTO public.workspace_files(name, storage_path, storage_provider, storage_bucket, public_url,
    file_size, mime_type, extension, security_level, document_category, audience,
    source_type, source_id, source_url, project_label, site_label, reporting_period, tags)
  VALUES(coalesce(nullif(d->>'file_name',''), 'Document'), key, provider, bucket, NULL,
    CASE WHEN d->>'file_size' ~ '^\d+$' THEN (d->>'file_size')::bigint ELSE 0 END,
    d->>'file_type', lower(substring(key from '\.([^./]+)$')), 'internal', category,
    CASE WHEN category IN ('site_permit','payment_receipt','site_image','mmp') THEN 'admin_only' ELSE 'workspace' END,
    'document_index', d->>'id', url, d->>'project_name', coalesce(d->'metadata'->>'site_name', d->'metadata'->>'siteName'),
    CASE WHEN left(d->>'uploaded_at',7) ~ '^\d{4}-(0[1-9]|1[0-2])$' THEN left(d->>'uploaded_at',7) END, ARRAY['source-document'])
  ON CONFLICT (source_type, source_id, source_url) WHERE source_type IS NOT NULL
  DO UPDATE SET name = excluded.name, document_category = excluded.document_category, audience = excluded.audience,
    project_label = excluded.project_label, site_label = excluded.site_label, reporting_period = excluded.reporting_period,
    updated_at = now();
END; $$;
CREATE FUNCTION workspace_private.sync_document_index() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.workspace_files SET archived = true WHERE source_type = 'document_index' AND source_id = OLD.id::text;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.file_url IS DISTINCT FROM NEW.file_url THEN
    UPDATE public.workspace_files SET archived = true WHERE source_type = 'document_index' AND source_id = OLD.id::text AND source_url = OLD.file_url;
  END IF;
  PERFORM workspace_private.index_document(to_jsonb(NEW)); RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION workspace_private.index_document(jsonb), workspace_private.sync_document_index() FROM PUBLIC;
DO $$ DECLARE d jsonb; BEGIN
  IF to_regclass('public.document_index') IS NOT NULL THEN
    CREATE TRIGGER workspace_document_index AFTER INSERT OR UPDATE OR DELETE ON public.document_index
      FOR EACH ROW EXECUTE FUNCTION workspace_private.sync_document_index();
    -- Backfill hub index copies as admin_only. Do not add a document_index SELECT
    -- ceiling: Documents / MMP / site workflows still need to read that table.
    FOR d IN SELECT to_jsonb(i) FROM public.document_index i LOOP PERFORM workspace_private.index_document(d); END LOOP;
  END IF;
END $$;

-- Private hub bucket: public buckets bypass object SELECT policies.
-- Limit storage ceilings to workspace-files only so indexing source photos/receipts
-- into the hub does not revoke access in site-visit / payment / MMP storage paths.
UPDATE storage.buckets SET public = false WHERE id = 'workspace-files';
CREATE FUNCTION workspace_private.storage_protected(p_bucket text, p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (SELECT 1 FROM public.workspace_files f WHERE f.storage_bucket = p_bucket AND f.storage_path = p_name AND workspace_private.file_protected(f.id))
 OR EXISTS (SELECT 1 FROM public.workspace_file_versions v JOIN public.workspace_files f ON f.id = v.file_id WHERE f.storage_bucket = p_bucket AND v.storage_path = p_name AND workspace_private.file_protected(f.id));
$$;
REVOKE ALL ON FUNCTION workspace_private.storage_protected(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION workspace_private.storage_protected(text,text) TO anon, authenticated;
CREATE POLICY workspace_storage_document_ceiling ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated, anon
USING (
  bucket_id <> 'workspace-files'
  OR workspace_private.is_admin()
  OR NOT workspace_private.storage_protected(bucket_id, name)
);
CREATE POLICY workspace_storage_admin_read ON storage.objects FOR SELECT TO authenticated
USING (workspace_private.is_admin() AND bucket_id = 'workspace-files');
COMMIT;
