-- Phase 1: backfill workspace_files site/project labels from source joins.
-- Idempotent: only fills blank / 'Unknown Site' when a better name exists.
-- Does not change audience / admin-only rules.

-- 1) Site images from report_photos → reports → mmp_site_entries → mmp_files
UPDATE public.workspace_files wf
SET
  site_label = resolved.site_name,
  project_label = coalesce(nullif(btrim(wf.project_label), ''), resolved.project_name),
  updated_at = now()
FROM (
  SELECT
    wf2.id AS workspace_file_id,
    coalesce(
      nullif(btrim(mse.site_name), ''),
      nullif(btrim(mse.locality), '')
    ) AS site_name,
    coalesce(
      nullif(btrim(mf.name), ''),
      nullif(btrim(mf.hub), '')
    ) AS project_name
  FROM public.workspace_files wf2
  JOIN public.report_photos rp
    ON wf2.source_type = 'report_photos'
   AND wf2.source_id = rp.id::text
  LEFT JOIN public.reports r ON r.id = rp.report_id
  LEFT JOIN public.mmp_site_entries mse ON mse.id = r.site_visit_id
  LEFT JOIN public.mmp_files mf ON mf.id = mse.mmp_file_id
  WHERE wf2.archived = false
    AND wf2.document_category = 'site_image'
) resolved
WHERE wf.id = resolved.workspace_file_id
  AND resolved.site_name IS NOT NULL
  AND (
    wf.site_label IS NULL
    OR btrim(wf.site_label) = ''
    OR lower(btrim(wf.site_label)) = 'unknown site'
  );

-- 2) Payment receipts from down_payment_requests (source_id = uuid:index)
UPDATE public.workspace_files wf
SET
  site_label = resolved.site_name,
  project_label = coalesce(nullif(btrim(wf.project_label), ''), resolved.project_name),
  updated_at = now()
FROM (
  SELECT
    wf2.id AS workspace_file_id,
    coalesce(
      nullif(btrim(dpr.site_name), ''),
      nullif(btrim(mse.site_name), ''),
      nullif(btrim(dpr.hub_name), '')
    ) AS site_name,
    coalesce(
      nullif(btrim(dpr.hub_name), ''),
      nullif(btrim(mf.name), ''),
      nullif(btrim(mf.hub), '')
    ) AS project_name
  FROM public.workspace_files wf2
  JOIN public.down_payment_requests dpr
    ON wf2.source_type = 'down_payment_requests'
   AND split_part(wf2.source_id, ':', 1) = dpr.id::text
  LEFT JOIN public.mmp_site_entries mse
    ON mse.id = coalesce(dpr.mmp_site_entry_id, dpr.site_visit_id)
  LEFT JOIN public.mmp_files mf ON mf.id = mse.mmp_file_id
  WHERE wf2.archived = false
    AND wf2.document_category = 'payment_receipt'
) resolved
WHERE wf.id = resolved.workspace_file_id
  AND resolved.site_name IS NOT NULL
  AND (
    wf.site_label IS NULL
    OR btrim(wf.site_label) = ''
    OR lower(btrim(wf.site_label)) = 'unknown site'
  );

-- 3) Operational cost receipts: project/hub only (no site column on source)
UPDATE public.workspace_files wf
SET
  project_label = coalesce(nullif(btrim(wf.project_label), ''), resolved.project_name),
  updated_at = now()
FROM (
  SELECT
    wf2.id AS workspace_file_id,
    coalesce(
      nullif(btrim(mf.hub), ''),
      nullif(btrim(mf.name), ''),
      nullif(btrim(ocs.hub_id), '')
    ) AS project_name
  FROM public.workspace_files wf2
  JOIN public.operational_cost_submissions ocs
    ON wf2.source_type = 'operational_cost_submissions'
   AND split_part(wf2.source_id, ':', 1) = ocs.id::text
  LEFT JOIN public.mmp_files mf ON mf.id = ocs.mmp_file_id
  WHERE wf2.archived = false
    AND wf2.document_category = 'payment_receipt'
) resolved
WHERE wf.id = resolved.workspace_file_id
  AND resolved.project_name IS NOT NULL
  AND (wf.project_label IS NULL OR btrim(wf.project_label) = '');

-- 4) document_index-sourced site images stuck as Unknown Site:
--    refresh from document_index metadata when it has a real site_name
UPDATE public.workspace_files wf
SET
  site_label = nullif(btrim(coalesce(di.metadata->>'site_name', di.metadata->>'siteName')), ''),
  project_label = coalesce(
    nullif(btrim(wf.project_label), ''),
    nullif(btrim(di.project_name), '')
  ),
  updated_at = now()
FROM public.document_index di
WHERE wf.source_type = 'document_index'
  AND wf.source_id = di.id::text
  AND wf.archived = false
  AND wf.document_category = 'site_image'
  AND (
    wf.site_label IS NULL
    OR btrim(wf.site_label) = ''
    OR lower(btrim(wf.site_label)) = 'unknown site'
  )
  AND nullif(btrim(coalesce(di.metadata->>'site_name', di.metadata->>'siteName')), '') IS NOT NULL
  AND lower(btrim(coalesce(di.metadata->>'site_name', di.metadata->>'siteName'))) <> 'unknown site';
