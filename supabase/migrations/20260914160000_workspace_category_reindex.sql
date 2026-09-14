-- Phase 2: broaden URL parsing for R2/https, reindex MMPs, project documents, reports.

CREATE OR REPLACE FUNCTION workspace_private.index_hub_source(d jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  category text := coalesce(nullif(d->>'document_category', ''), 'other');
  url text := nullif(d->>'file_url', '');
  key text;
  bucket text;
  provider text;
  public_url text := NULL;
  src_type text := nullif(d->>'source_type', '');
  src_id text := nullif(d->>'source_id', '');
BEGIN
  IF url IS NULL OR src_type IS NULL OR src_id IS NULL THEN RETURN; END IF;
  IF url LIKE 'r2:%' THEN
    key := substr(url, 4); provider := 'r2'; bucket := NULL;
  ELSIF url ~ '/storage/v1/object/(public|sign|authenticated)/' THEN
    key := regexp_replace(split_part(url, '?', 1), '^.*/storage/v1/object/(public|sign|authenticated)/', '');
    bucket := split_part(key, '/', 1);
    key := substr(key, length(bucket) + 2);
    provider := 'supabase';
  ELSIF url ~ '^https?://' THEN
    key := regexp_replace(split_part(url, '?', 1), '^https?://[^/]+/', '');
    IF key IS NULL OR key = '' THEN
      key := split_part(url, '?', 1);
    END IF;
    provider := 'r2';
    bucket := NULL;
    public_url := split_part(url, '?', 1);
  ELSE
    RETURN;
  END IF;

  INSERT INTO public.workspace_files(
    name, storage_path, storage_provider, storage_bucket, public_url,
    file_size, mime_type, extension, security_level, document_category, audience,
    source_type, source_id, source_url, project_label, site_label, reporting_period, tags
  ) VALUES (
    coalesce(nullif(d->>'file_name', ''), 'Document'),
    key, provider, bucket, public_url,
    CASE WHEN d->>'file_size' ~ '^\d+$' THEN (d->>'file_size')::bigint ELSE 0 END,
    d->>'file_type',
    lower(substring(key from '\.([^./]+)$')),
    'internal',
    category,
    CASE WHEN category IN ('site_permit','payment_receipt','site_image','mmp') THEN 'admin_only' ELSE 'workspace' END,
    src_type, src_id, url,
    nullif(d->>'project_label', ''),
    nullif(d->>'site_label', ''),
    CASE WHEN left(coalesce(d->>'reporting_period', ''), 7) ~ '^\d{4}-(0[1-9]|1[0-2])$'
      THEN left(d->>'reporting_period', 7) END,
    ARRAY['source-document']
  )
  ON CONFLICT (source_type, source_id, source_url) WHERE source_type IS NOT NULL
  DO UPDATE SET
    name = excluded.name,
    document_category = excluded.document_category,
    audience = excluded.audience,
    project_label = coalesce(excluded.project_label, public.workspace_files.project_label),
    site_label = coalesce(excluded.site_label, public.workspace_files.site_label),
    reporting_period = coalesce(excluded.reporting_period, public.workspace_files.reporting_period),
    public_url = coalesce(excluded.public_url, public.workspace_files.public_url),
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION workspace_private.index_hub_source(jsonb) FROM PUBLIC;

-- Task 5: reindex all MMP files (any URL scheme index_hub_source accepts)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id, name, original_filename, file_url, created_at, hub, month
    FROM public.mmp_files
    WHERE file_url IS NOT NULL AND btrim(file_url) <> ''
  LOOP
    PERFORM workspace_private.index_hub_source(jsonb_build_object(
      'source_type', 'mmp_files',
      'source_id', r.id::text,
      'file_url', r.file_url,
      'file_name', coalesce(nullif(r.original_filename, ''), nullif(r.name, ''), 'MMP file'),
      'document_category', 'mmp',
      'project_label', coalesce(nullif(btrim(r.hub), ''), nullif(btrim(r.name), '')),
      'reporting_period', CASE
        WHEN r.month ~ '^\d{4}-(0[1-9]|1[0-2])$' THEN r.month
        ELSE left(r.created_at::text, 7)
      END
    ));
  END LOOP;
END $$;

-- Task 6: classify mirrored project docs + index project_documents table
UPDATE public.workspace_files
SET
  document_category = 'project_document',
  project_label = coalesce(nullif(btrim(project_label), ''), nullif(btrim(name), '')),
  updated_at = now()
WHERE archived = false
  AND document_category = 'other'
  AND tags @> ARRAY['project-document']::text[];

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      pd.id,
      pd.name,
      pd.file_url,
      pd.file_type,
      pd.file_size,
      pd.created_at,
      coalesce(nullif(btrim(p.name), ''), 'Project') AS project_name
    FROM public.project_documents pd
    LEFT JOIN public.projects p ON p.id = pd.project_id
    WHERE pd.file_url IS NOT NULL AND btrim(pd.file_url) <> ''
  LOOP
    PERFORM workspace_private.index_hub_source(jsonb_build_object(
      'source_type', 'project_documents',
      'source_id', r.id::text,
      'file_url', r.file_url,
      'file_name', coalesce(nullif(btrim(r.name), ''), 'Project document'),
      'file_type', r.file_type,
      'file_size', r.file_size::text,
      'document_category', 'project_document',
      'project_label', r.project_name,
      'reporting_period', left(r.created_at::text, 7)
    ));
  END LOOP;
END $$;

-- Task 7: sync document_index rows categorized as report (none may exist today).
-- Site-visit `reports` rows are structured visit records without file_url attachments;
-- photos remain site_image. Do not invent report files from report_photos.
DO $$
DECLARE
  d record;
BEGIN
  FOR d IN
    SELECT to_jsonb(i) AS j FROM public.document_index i WHERE i.category = 'report'
  LOOP
    PERFORM workspace_private.index_document(d.j);
  END LOOP;
END $$;
