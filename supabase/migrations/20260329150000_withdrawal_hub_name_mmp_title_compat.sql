-- Compatibility columns referenced by legacy queries / external clients:
--   withdrawal_requests.hub_name
--   mmp_files.title (mirrors name for API parity)

ALTER TABLE public.mmp_files
  ADD COLUMN IF NOT EXISTS title text
  GENERATED ALWAYS AS (COALESCE(name, '')) STORED;

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS hub_name text;

UPDATE public.withdrawal_requests wr
SET hub_name = h.name
FROM public.profiles p
LEFT JOIN public.hubs h ON h.id = p.hub_id
WHERE wr.user_id = p.id
  AND wr.hub_name IS NULL
  AND h.name IS NOT NULL;
