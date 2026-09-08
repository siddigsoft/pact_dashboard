-- Hub-only backfill: index source attachments into workspace_files as admin_only.
-- Does not change RLS on report_photos / payments / mmp_files.
CREATE OR REPLACE FUNCTION workspace_private.index_hub_source(d jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  category text := coalesce(nullif(d->>'document_category', ''), 'other');
  url text := nullif(d->>'file_url', '');
  key text;
  bucket text;
  provider text;
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
  ELSE
    RETURN;
  END IF;

  INSERT INTO public.workspace_files(
    name, storage_path, storage_provider, storage_bucket, public_url,
    file_size, mime_type, extension, security_level, document_category, audience,
    source_type, source_id, source_url, project_label, site_label, reporting_period, tags
  ) VALUES (
    coalesce(nullif(d->>'file_name', ''), 'Document'),
    key, provider, bucket, NULL,
    CASE WHEN d->>'file_size' ~ '^\d+$' THEN (d->>'file_size')::bigint ELSE 0 END,
    d->>'file_type',
    lower(substring(key from '\.([^./]+)$')),
    'internal',
    category,
    CASE WHEN category IN ('site_permit','payment_receipt','site_image','mmp') THEN 'admin_only' ELSE 'workspace' END,
    src_type, src_id, url,
    d->>'project_label', d->>'site_label',
    CASE WHEN left(coalesce(d->>'reporting_period', ''), 7) ~ '^\d{4}-(0[1-9]|1[0-2])$'
      THEN left(d->>'reporting_period', 7) END,
    ARRAY['source-document']
  )
  ON CONFLICT (source_type, source_id, source_url) WHERE source_type IS NOT NULL
  DO UPDATE SET
    name = excluded.name,
    document_category = excluded.document_category,
    audience = excluded.audience,
    project_label = excluded.project_label,
    site_label = excluded.site_label,
    reporting_period = excluded.reporting_period,
    updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION workspace_private.index_hub_source(jsonb) FROM PUBLIC;

DO $$
DECLARE
  r record;
  u text;
  idx int;
  urls jsonb;
BEGIN
  -- Site images not already covered via document_index sync.
  FOR r IN
    SELECT id, photo_url, created_at
    FROM public.report_photos
    WHERE deleted_at IS NULL
      AND photo_url IS NOT NULL
      AND photo_url ~ '/storage/v1/object/(public|sign|authenticated)/'
  LOOP
    PERFORM workspace_private.index_hub_source(jsonb_build_object(
      'source_type', 'report_photos',
      'source_id', r.id::text,
      'file_url', r.photo_url,
      'file_name', coalesce(nullif(split_part(r.photo_url, '/', -1), ''), 'Site photo'),
      'document_category', 'site_image',
      'reporting_period', r.created_at::text
    ));
  END LOOP;

  -- MMP source files.
  FOR r IN
    SELECT id, name, original_filename, file_url, created_at, hub, month
    FROM public.mmp_files
    WHERE file_url IS NOT NULL
      AND file_url ~ '/storage/v1/object/(public|sign|authenticated)/'
  LOOP
    PERFORM workspace_private.index_hub_source(jsonb_build_object(
      'source_type', 'mmp_files',
      'source_id', r.id::text,
      'file_url', r.file_url,
      'file_name', coalesce(nullif(r.original_filename, ''), nullif(r.name, ''), 'MMP file'),
      'document_category', 'mmp',
      'project_label', r.hub,
      'reporting_period', CASE
        WHEN r.month ~ '^\d{4}-(0[1-9]|1[0-2])$' THEN r.month
        WHEN left(coalesce(r.created_at::text, ''), 7) ~ '^\d{4}-(0[1-9]|1[0-2])$' THEN left(r.created_at::text, 7)
        ELSE NULL END
    ));
  END LOOP;

  -- Payment proofs (plain URL or JSON array string).
  FOR r IN
    SELECT id, payment_proof_url, created_at
    FROM public.down_payment_requests
    WHERE payment_proof_url IS NOT NULL AND btrim(payment_proof_url) <> ''
  LOOP
    urls := NULL;
    BEGIN
      IF left(btrim(r.payment_proof_url), 1) = '[' THEN
        urls := btrim(r.payment_proof_url)::jsonb;
      ELSE
        urls := jsonb_build_array(btrim(r.payment_proof_url));
      END IF;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
    IF jsonb_typeof(urls) <> 'array' THEN CONTINUE; END IF;
    idx := 0;
    FOR u IN SELECT jsonb_array_elements_text(urls)
    LOOP
      idx := idx + 1;
      IF coalesce(u, '') = '' OR u !~ '/storage/v1/object/(public|sign|authenticated)/' THEN CONTINUE; END IF;
      PERFORM workspace_private.index_hub_source(jsonb_build_object(
        'source_type', 'down_payment_requests',
        'source_id', r.id::text || ':' || idx::text,
        'file_url', u,
        'file_name', coalesce(nullif(split_part(split_part(u, '?', 1), '/', -1), ''), 'Payment proof'),
        'document_category', 'payment_receipt',
        'reporting_period', r.created_at::text
      ));
    END LOOP;
  END LOOP;

  -- Operational cost payment proofs + supporting docs (URL strings in JSON).
  FOR r IN
    SELECT id, payment_proof_url, supporting_documents, created_at
    FROM public.operational_cost_submissions
    WHERE (payment_proof_url IS NOT NULL AND btrim(payment_proof_url) <> '')
       OR supporting_documents IS NOT NULL
  LOOP
    IF r.payment_proof_url IS NOT NULL AND btrim(r.payment_proof_url) <> ''
       AND r.payment_proof_url ~ '/storage/v1/object/(public|sign|authenticated)/' THEN
      PERFORM workspace_private.index_hub_source(jsonb_build_object(
        'source_type', 'operational_cost_submissions',
        'source_id', r.id::text || ':proof',
        'file_url', btrim(r.payment_proof_url),
        'file_name', coalesce(nullif(split_part(split_part(r.payment_proof_url, '?', 1), '/', -1), ''), 'Cost receipt'),
        'document_category', 'payment_receipt',
        'reporting_period', r.created_at::text
      ));
    END IF;

    IF r.supporting_documents IS NULL THEN CONTINUE; END IF;
    BEGIN
      IF jsonb_typeof(r.supporting_documents) = 'array' THEN
        idx := 0;
        FOR u IN
          SELECT coalesce(nullif(elem->>'url', ''), nullif(elem->>'file_url', ''), nullif(elem#>>'{}', ''))
          FROM jsonb_array_elements(r.supporting_documents) AS elem
        LOOP
          idx := idx + 1;
          IF coalesce(u, '') = '' OR u !~ '/storage/v1/object/(public|sign|authenticated)/' THEN CONTINUE; END IF;
          PERFORM workspace_private.index_hub_source(jsonb_build_object(
            'source_type', 'operational_cost_submissions',
            'source_id', r.id::text || ':doc:' || idx::text,
            'file_url', u,
            'file_name', coalesce(nullif(split_part(split_part(u, '?', 1), '/', -1), ''), 'Supporting document'),
            'document_category', 'payment_receipt',
            'reporting_period', r.created_at::text
          ));
        END LOOP;
      END IF;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END LOOP;
END $$;
