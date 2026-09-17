-- Speed up the secure MMP report payload without changing its response,
-- authorization, or row scope.

-- The report loads all sites for one MMP and aggregates them in this order.
-- A matching index avoids a broad table scan and an additional sort.
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_report_payload
  ON public.mmp_site_entries (mmp_file_id, created_at, id);

-- Cost submissions can reference an MMP through either mmp_file_id or mmp_id.
-- mmp_file_id is already indexed; add the missing side of that OR predicate so
-- PostgreSQL can use a bitmap index plan instead of scanning the whole table.
CREATE INDEX IF NOT EXISTS idx_operational_cost_submissions_mmp_id_created
  ON public.operational_cost_submissions (mmp_id, created_at DESC);

-- The report resolves payment activity for its collected site-entry IDs.
-- Keep the entry lookup and newest-first aggregation covered by one index.
CREATE INDEX IF NOT EXISTS idx_down_payment_requests_mmp_entry_created
  ON public.down_payment_requests (mmp_site_entry_id, created_at DESC);

ANALYZE public.mmp_site_entries;
ANALYZE public.operational_cost_submissions;
ANALYZE public.down_payment_requests;