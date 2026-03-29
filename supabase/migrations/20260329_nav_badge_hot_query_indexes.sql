-- Indexes for high-frequency COUNT/HEAD queries (nav badges, admin queues).
-- Reduces seq scans and planner work on small instances when combined with serialized client fetches.

-- Profiles: pending registration queue
CREATE INDEX IF NOT EXISTS idx_profiles_status
  ON public.profiles (status);

-- Tier-1 + tier-2 filters together (admin tier-2 queue; supersedes separate tier scans for that pattern)
CREATE INDEX IF NOT EXISTS idx_ocs_tier1_tier2
  ON public.operational_cost_submissions (tier1_status, tier2_status);

-- Supervisor hub queue: hub + tier1 + submitter filter uses hub + tier1 for narrow bitmap scans
CREATE INDEX IF NOT EXISTS idx_ocs_hub_tier1
  ON public.operational_cost_submissions (hub_id, tier1_status);

-- Down payments: hub + status (supervisor pending)
CREATE INDEX IF NOT EXISTS idx_dpr_hub_status
  ON public.down_payment_requests (hub_id, status);

-- Notifications: unread count per recipient
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read
  ON public.notifications (recipient_id, is_read);
