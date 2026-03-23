-- Rate limiting counters for Supabase Edge Functions
CREATE TABLE IF NOT EXISTS public.edge_rate_limits (
  limit_key text PRIMARY KEY,
  request_count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_edge_rate_limits_updated_at
  ON public.edge_rate_limits (updated_at);

COMMENT ON TABLE public.edge_rate_limits IS 'Sliding window counters for edge function rate limiting';
