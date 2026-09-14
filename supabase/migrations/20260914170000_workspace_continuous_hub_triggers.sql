-- Continuous Workspace hub indexing for new photos/receipts + human-readable names.
-- Triggers call labeled index helpers so reindex_hub_sources_with_labels is not required
-- for day-to-day inserts/updates.

CREATE OR REPLACE FUNCTION workspace_private.hub_file_extension(url text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(lower(substring(split_part(coalesce(url, ''), '?', 1) from '\.([a-z0-9]{1,8})$')), '');
$$;

CREATE OR REPLACE FUNCTION workspace_private.hub_human_file_name(
  kind text,
  site_label text,
  url text,
  seq int DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  site text := nullif(btrim(coalesce(site_label, '')), '');
  ext text := workspace_private.hub_file_extension(url);
  base text;
BEGIN
  IF kind = 'site_image' THEN
    base := CASE WHEN site IS NOT NULL THEN site || ' - Site Visit Photo' ELSE 'Site Visit Photo' END;
  ELSIF kind = 'payment_receipt' THEN
    base := CASE
      WHEN site IS NOT NULL AND seq IS NOT NULL THEN site || ' - Payment proof ' || seq::text
      WHEN site IS NOT NULL THEN site || ' - Payment proof'
      WHEN seq IS NOT NULL THEN 'Payment proof ' || seq::text
      ELSE 'Payment proof'
    END;
  ELSIF kind = 'cost_receipt' THEN
    base := CASE
      WHEN site IS NOT NULL THEN site || ' - Cost receipt'
      ELSE 'Cost receipt'
    END;
  ELSE
    base := coalesce(nullif(split_part(split_part(coalesce(url, ''), '?', 1), '/', -1), ''), 'Document');
  END IF;

  IF ext IS NOT NULL AND right(lower(base), length(ext) + 1) <> ('.' || ext) THEN
    RETURN base || '.' || ext;
  END IF;
  RETURN base;
END;
$$;

CREATE OR REPLACE FUNCTION workspace_private.index_report_photo_row(p public.report_photos)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  site_label text;
  project_label text;
BEGIN
  IF p.deleted_at IS NOT NULL OR p.photo_url IS NULL OR btrim(p.photo_url) = '' THEN
    UPDATE public.workspace_files
    SET archived = true, updated_at = now()
    WHERE source_type = 'report_photos' AND source_id = p.id::text;
    RETURN;
  END IF;

  SELECT
    coalesce(nullif(btrim(mse.site_name), ''), nullif(btrim(mse.locality), '')),
    coalesce(nullif(btrim(mf.name), ''), nullif(btrim(mf.hub), ''))
  INTO site_label, project_label
  FROM public.reports r
  LEFT JOIN public.mmp_site_entries mse ON mse.id = r.site_visit_id
  LEFT JOIN public.mmp_files mf ON mf.id = mse.mmp_file_id
  WHERE r.id = p.report_id;

  PERFORM workspace_private.index_hub_source(jsonb_build_object(
    'source_type', 'report_photos',
    'source_id', p.id::text,
    'file_url', p.photo_url,
    'file_name', workspace_private.hub_human_file_name('site_image', site_label, p.photo_url, NULL),
    'document_category', 'site_image',
    'site_label', site_label,
    'project_label', project_label,
    'reporting_period', p.created_at::text
  ));
END;
$$;

CREATE OR REPLACE FUNCTION workspace_private.sync_report_photo_hub()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.workspace_files
    SET archived = true, updated_at = now()
    WHERE source_type = 'report_photos' AND source_id = OLD.id::text;
    RETURN OLD;
  END IF;
  PERFORM workspace_private.index_report_photo_row(NEW);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION workspace_private.index_down_payment_proofs(d public.down_payment_requests)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  urls jsonb;
  u text;
  idx int := 0;
  site_label text;
  project_label text;
BEGIN
  SELECT
    coalesce(
      nullif(btrim(d.site_name), ''),
      nullif(btrim(mse.site_name), ''),
      nullif(btrim(d.hub_name), '')
    ),
    coalesce(
      nullif(btrim(d.hub_name), ''),
      nullif(btrim(mf.name), ''),
      nullif(btrim(mf.hub), '')
    )
  INTO site_label, project_label
  FROM (SELECT coalesce(d.mmp_site_entry_id, d.site_visit_id) AS site_entry_id) s
  LEFT JOIN public.mmp_site_entries mse ON mse.id = s.site_entry_id
  LEFT JOIN public.mmp_files mf ON mf.id = mse.mmp_file_id;

  -- Archive previous proof rows for this request; reinsert active URLs below.
  UPDATE public.workspace_files
  SET archived = true, updated_at = now()
  WHERE source_type = 'down_payment_requests'
    AND source_id LIKE (d.id::text || ':%')
    AND source_id !~ ':doc:';

  IF d.payment_proof_url IS NULL OR btrim(d.payment_proof_url) = '' THEN
    RETURN;
  END IF;

  BEGIN
    IF left(btrim(d.payment_proof_url), 1) = '[' THEN
      urls := btrim(d.payment_proof_url)::jsonb;
    ELSE
      urls := jsonb_build_array(btrim(d.payment_proof_url));
    END IF;
  EXCEPTION WHEN others THEN
    RETURN;
  END;

  IF jsonb_typeof(urls) <> 'array' THEN RETURN; END IF;

  FOR u IN SELECT jsonb_array_elements_text(urls)
  LOOP
    idx := idx + 1;
    IF coalesce(u, '') = '' THEN CONTINUE; END IF;
    -- Accept supabase storage, r2:, or https (index_hub_source decides).
    PERFORM workspace_private.index_hub_source(jsonb_build_object(
      'source_type', 'down_payment_requests',
      'source_id', d.id::text || ':' || idx::text,
      'file_url', u,
      'file_name', workspace_private.hub_human_file_name('payment_receipt', site_label, u, idx),
      'document_category', 'payment_receipt',
      'site_label', site_label,
      'project_label', project_label,
      'reporting_period', d.created_at::text
    ));
    -- Un-archive if conflict path left an older archived twin (unique is source_url).
    UPDATE public.workspace_files
    SET archived = false, updated_at = now()
    WHERE source_type = 'down_payment_requests'
      AND source_id = d.id::text || ':' || idx::text
      AND source_url = u;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION workspace_private.sync_down_payment_proof_hub()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.workspace_files
    SET archived = true, updated_at = now()
    WHERE source_type = 'down_payment_requests'
      AND source_id LIKE (OLD.id::text || ':%');
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.payment_proof_url IS NOT DISTINCT FROM NEW.payment_proof_url
     AND OLD.site_name IS NOT DISTINCT FROM NEW.site_name
     AND OLD.hub_name IS NOT DISTINCT FROM NEW.hub_name
     AND OLD.mmp_site_entry_id IS NOT DISTINCT FROM NEW.mmp_site_entry_id
     AND OLD.site_visit_id IS NOT DISTINCT FROM NEW.site_visit_id THEN
    RETURN NEW;
  END IF;

  PERFORM workspace_private.index_down_payment_proofs(NEW);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION workspace_private.index_operational_cost_proofs(o public.operational_cost_submissions)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  project_label text;
  u text;
  idx int;
BEGIN
  SELECT coalesce(nullif(btrim(mf.hub), ''), nullif(btrim(mf.name), ''), nullif(btrim(o.hub_id), ''))
  INTO project_label
  FROM (SELECT o.mmp_file_id AS mmp_file_id) s
  LEFT JOIN public.mmp_files mf ON mf.id = s.mmp_file_id;

  UPDATE public.workspace_files
  SET archived = true, updated_at = now()
  WHERE source_type = 'operational_cost_submissions'
    AND source_id LIKE (o.id::text || ':%');

  IF o.payment_proof_url IS NOT NULL AND btrim(o.payment_proof_url) <> '' THEN
    PERFORM workspace_private.index_hub_source(jsonb_build_object(
      'source_type', 'operational_cost_submissions',
      'source_id', o.id::text || ':proof',
      'file_url', btrim(o.payment_proof_url),
      'file_name', workspace_private.hub_human_file_name('cost_receipt', NULL, o.payment_proof_url, NULL),
      'document_category', 'payment_receipt',
      'project_label', project_label,
      'reporting_period', o.created_at::text
    ));
    UPDATE public.workspace_files
    SET archived = false, updated_at = now()
    WHERE source_type = 'operational_cost_submissions'
      AND source_id = o.id::text || ':proof'
      AND source_url = btrim(o.payment_proof_url);
  END IF;

  IF o.supporting_documents IS NULL THEN RETURN; END IF;
  BEGIN
    IF jsonb_typeof(o.supporting_documents) = 'array' THEN
      idx := 0;
      FOR u IN
        SELECT coalesce(nullif(elem->>'url', ''), nullif(elem->>'file_url', ''), nullif(elem#>>'{}', ''))
        FROM jsonb_array_elements(o.supporting_documents) AS elem
      LOOP
        idx := idx + 1;
        IF coalesce(u, '') = '' THEN CONTINUE; END IF;
        PERFORM workspace_private.index_hub_source(jsonb_build_object(
          'source_type', 'operational_cost_submissions',
          'source_id', o.id::text || ':doc:' || idx::text,
          'file_url', u,
          'file_name', workspace_private.hub_human_file_name('cost_receipt', NULL, u, idx),
          'document_category', 'payment_receipt',
          'project_label', project_label,
          'reporting_period', o.created_at::text
        ));
        UPDATE public.workspace_files
        SET archived = false, updated_at = now()
        WHERE source_type = 'operational_cost_submissions'
          AND source_id = o.id::text || ':doc:' || idx::text
          AND source_url = u;
      END LOOP;
    END IF;
  EXCEPTION WHEN others THEN
    NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION workspace_private.sync_operational_cost_proof_hub()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.workspace_files
    SET archived = true, updated_at = now()
    WHERE source_type = 'operational_cost_submissions'
      AND source_id LIKE (OLD.id::text || ':%');
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.payment_proof_url IS NOT DISTINCT FROM NEW.payment_proof_url
     AND OLD.supporting_documents IS NOT DISTINCT FROM NEW.supporting_documents
     AND OLD.mmp_file_id IS NOT DISTINCT FROM NEW.mmp_file_id
     AND OLD.hub_id IS NOT DISTINCT FROM NEW.hub_id THEN
    RETURN NEW;
  END IF;

  PERFORM workspace_private.index_operational_cost_proofs(NEW);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspace_report_photos_hub ON public.report_photos;
CREATE TRIGGER workspace_report_photos_hub
  AFTER INSERT OR UPDATE OR DELETE ON public.report_photos
  FOR EACH ROW EXECUTE FUNCTION workspace_private.sync_report_photo_hub();

DROP TRIGGER IF EXISTS workspace_down_payment_proofs_hub ON public.down_payment_requests;
CREATE TRIGGER workspace_down_payment_proofs_hub
  AFTER INSERT OR UPDATE OR DELETE ON public.down_payment_requests
  FOR EACH ROW EXECUTE FUNCTION workspace_private.sync_down_payment_proof_hub();

DROP TRIGGER IF EXISTS workspace_operational_cost_proofs_hub ON public.operational_cost_submissions;
CREATE TRIGGER workspace_operational_cost_proofs_hub
  AFTER INSERT OR UPDATE OR DELETE ON public.operational_cost_submissions
  FOR EACH ROW EXECUTE FUNCTION workspace_private.sync_operational_cost_proof_hub();

REVOKE ALL ON FUNCTION workspace_private.hub_file_extension(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION workspace_private.hub_human_file_name(text, text, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION workspace_private.index_report_photo_row(public.report_photos) FROM PUBLIC;
REVOKE ALL ON FUNCTION workspace_private.sync_report_photo_hub() FROM PUBLIC;
REVOKE ALL ON FUNCTION workspace_private.index_down_payment_proofs(public.down_payment_requests) FROM PUBLIC;
REVOKE ALL ON FUNCTION workspace_private.sync_down_payment_proof_hub() FROM PUBLIC;
REVOKE ALL ON FUNCTION workspace_private.index_operational_cost_proofs(public.operational_cost_submissions) FROM PUBLIC;
REVOKE ALL ON FUNCTION workspace_private.sync_operational_cost_proof_hub() FROM PUBLIC;

-- One-shot: rename existing machine basenames to human titles when site/project known.
UPDATE public.workspace_files wf
SET
  name = workspace_private.hub_human_file_name(
    'site_image',
    wf.site_label,
    coalesce(wf.source_url, wf.public_url, wf.name),
    NULL
  ),
  updated_at = now()
WHERE wf.archived = false
  AND wf.document_category = 'site_image'
  AND (
    wf.name ~* '^batch_'
    OR wf.name ~* '^[0-9]{10,}_'
    OR lower(wf.name) IN ('site photo', 'document')
    OR wf.name ~* '^[a-z0-9]{6,}_[a-z0-9]+\.(jpe?g|png|webp|gif)$'
  );

UPDATE public.workspace_files wf
SET
  name = workspace_private.hub_human_file_name(
    'payment_receipt',
    wf.site_label,
    coalesce(wf.source_url, wf.public_url, wf.name),
    CASE
      WHEN wf.source_type = 'down_payment_requests'
       AND wf.source_id ~ ':[0-9]+$'
       AND split_part(wf.source_id, ':', 2) ~ '^[0-9]+$'
      THEN split_part(wf.source_id, ':', 2)::int
      ELSE NULL
    END
  ),
  updated_at = now()
WHERE wf.archived = false
  AND wf.document_category = 'payment_receipt'
  AND (
    wf.name ~* '^batch_'
    OR wf.name ~* '^[0-9]{10,}_'
    OR lower(wf.name) IN ('payment proof', 'cost receipt', 'supporting document', 'document')
    OR wf.name ~* '^[a-z0-9]{6,}_[a-z0-9]+\.(jpe?g|png|webp|gif|pdf)$'
  );

-- Improve document_index → hub naming for site photos / receipts when metadata has site.
CREATE OR REPLACE FUNCTION workspace_private.index_document(d jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  category text;
  url text := d->>'file_url';
  key text;
  bucket text;
  provider text;
  site_label text := coalesce(nullif(d->'metadata'->>'site_name', ''), nullif(d->'metadata'->>'siteName', ''));
  file_name text;
BEGIN
  IF coalesce(url, '') = '' THEN RETURN; END IF;
  category := CASE d->>'category'
    WHEN 'mmp_file' THEN 'mmp' WHEN 'federal_permit' THEN 'site_permit' WHEN 'state_permit' THEN 'site_permit'
    WHEN 'local_permit' THEN 'site_permit' WHEN 'cost_receipt' THEN 'payment_receipt'
    WHEN 'transaction_receipt' THEN 'payment_receipt' WHEN 'site_visit_photo' THEN 'site_image'
    WHEN 'report' THEN 'report' ELSE 'other' END;

  file_name := nullif(d->>'file_name', '');
  IF category = 'site_image' AND (
       file_name IS NULL
       OR file_name ~* '^batch_'
       OR file_name ~* '^[0-9]{10,}_'
       OR lower(file_name) IN ('site photo', 'document')
     ) THEN
    file_name := workspace_private.hub_human_file_name('site_image', site_label, url, NULL);
  ELSIF category = 'payment_receipt' AND (
       file_name IS NULL
       OR file_name ~* '^batch_'
       OR lower(file_name) IN ('payment proof', 'cost receipt', 'document')
     ) THEN
    file_name := workspace_private.hub_human_file_name('payment_receipt', site_label, url, NULL);
  END IF;
  file_name := coalesce(file_name, 'Document');

  IF url LIKE 'r2:%' THEN key := substr(url, 4); provider := 'r2'; bucket := NULL;
  ELSIF url ~ '/storage/v1/object/(public|sign|authenticated)/' THEN
    key := regexp_replace(split_part(url, '?', 1), '^.*/storage/v1/object/(public|sign|authenticated)/', '');
    bucket := split_part(key, '/', 1); key := substr(key, length(bucket) + 2); provider := 'supabase';
  ELSIF url ~ '^https?://' THEN
    key := regexp_replace(split_part(url, '?', 1), '^https?://[^/]+/', '');
    provider := 'r2'; bucket := NULL;
  ELSE RETURN;
  END IF;

  INSERT INTO public.workspace_files(name, storage_path, storage_provider, storage_bucket, public_url,
    file_size, mime_type, extension, security_level, document_category, audience,
    source_type, source_id, source_url, project_label, site_label, reporting_period, tags)
  VALUES(file_name, key, provider, bucket,
    CASE WHEN provider = 'r2' AND url ~ '^https?://' THEN split_part(url, '?', 1) ELSE NULL END,
    CASE WHEN d->>'file_size' ~ '^\d+$' THEN (d->>'file_size')::bigint ELSE 0 END,
    d->>'file_type', lower(substring(key from '\.([^./]+)$')), 'internal', category,
    CASE WHEN category IN ('site_permit','payment_receipt','site_image','mmp') THEN 'admin_only' ELSE 'workspace' END,
    'document_index', d->>'id', url, d->>'project_name', site_label,
    CASE WHEN left(d->>'uploaded_at',7) ~ '^\d{4}-(0[1-9]|1[0-2])$' THEN left(d->>'uploaded_at',7) END, ARRAY['source-document'])
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

REVOKE ALL ON FUNCTION workspace_private.index_document(jsonb) FROM PUBLIC;
