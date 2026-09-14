-- Phase 1 writers: keep hub labels on reindex; re-run source indexing with site/project.
-- Improves ON CONFLICT so null labels do not wipe previously backfilled values.

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
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION workspace_private.reindex_hub_sources_with_labels() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r record;
  u text;
  idx int;
  urls jsonb;
BEGIN
  -- Site images with site/project labels
  FOR r IN
    SELECT
      rp.id,
      rp.photo_url,
      rp.created_at,
      coalesce(nullif(btrim(mse.site_name), ''), nullif(btrim(mse.locality), '')) AS site_label,
      coalesce(nullif(btrim(mf.name), ''), nullif(btrim(mf.hub), '')) AS project_label
    FROM public.report_photos rp
    LEFT JOIN public.reports rep ON rep.id = rp.report_id
    LEFT JOIN public.mmp_site_entries mse ON mse.id = rep.site_visit_id
    LEFT JOIN public.mmp_files mf ON mf.id = mse.mmp_file_id
    WHERE rp.deleted_at IS NULL
      AND rp.photo_url IS NOT NULL
      AND rp.photo_url ~ '/storage/v1/object/(public|sign|authenticated)/'
  LOOP
    PERFORM workspace_private.index_hub_source(jsonb_build_object(
      'source_type', 'report_photos',
      'source_id', r.id::text,
      'file_url', r.photo_url,
      'file_name', coalesce(nullif(split_part(r.photo_url, '/', -1), ''), 'Site photo'),
      'document_category', 'site_image',
      'site_label', r.site_label,
      'project_label', r.project_label,
      'reporting_period', r.created_at::text
    ));
  END LOOP;

  -- Payment proofs with site/project labels
  FOR r IN
    SELECT
      dpr.id,
      dpr.payment_proof_url,
      dpr.created_at,
      coalesce(
        nullif(btrim(dpr.site_name), ''),
        nullif(btrim(mse.site_name), ''),
        nullif(btrim(dpr.hub_name), '')
      ) AS site_label,
      coalesce(
        nullif(btrim(dpr.hub_name), ''),
        nullif(btrim(mf.name), ''),
        nullif(btrim(mf.hub), '')
      ) AS project_label
    FROM public.down_payment_requests dpr
    LEFT JOIN public.mmp_site_entries mse
      ON mse.id = coalesce(dpr.mmp_site_entry_id, dpr.site_visit_id)
    LEFT JOIN public.mmp_files mf ON mf.id = mse.mmp_file_id
    WHERE dpr.payment_proof_url IS NOT NULL AND btrim(dpr.payment_proof_url) <> ''
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
        'site_label', r.site_label,
        'project_label', r.project_label,
        'reporting_period', r.created_at::text
      ));
    END LOOP;
  END LOOP;

  -- Operational cost proofs: project/hub label only
  FOR r IN
    SELECT
      ocs.id,
      ocs.payment_proof_url,
      ocs.supporting_documents,
      ocs.created_at,
      coalesce(nullif(btrim(mf.hub), ''), nullif(btrim(mf.name), ''), nullif(btrim(ocs.hub_id), '')) AS project_label
    FROM public.operational_cost_submissions ocs
    LEFT JOIN public.mmp_files mf ON mf.id = ocs.mmp_file_id
    WHERE (ocs.payment_proof_url IS NOT NULL AND btrim(ocs.payment_proof_url) <> '')
       OR ocs.supporting_documents IS NOT NULL
  LOOP
    IF r.payment_proof_url IS NOT NULL AND btrim(r.payment_proof_url) <> ''
       AND r.payment_proof_url ~ '/storage/v1/object/(public|sign|authenticated)/' THEN
      PERFORM workspace_private.index_hub_source(jsonb_build_object(
        'source_type', 'operational_cost_submissions',
        'source_id', r.id::text || ':proof',
        'file_url', btrim(r.payment_proof_url),
        'file_name', coalesce(nullif(split_part(split_part(r.payment_proof_url, '?', 1), '/', -1), ''), 'Cost receipt'),
        'document_category', 'payment_receipt',
        'project_label', r.project_label,
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
            'project_label', r.project_label,
            'reporting_period', r.created_at::text
          ));
        END LOOP;
      END IF;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION workspace_private.index_hub_source(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION workspace_private.reindex_hub_sources_with_labels() FROM PUBLIC;

SELECT workspace_private.reindex_hub_sources_with_labels();
