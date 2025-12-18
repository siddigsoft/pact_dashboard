-- Recall System Database Tables
-- Run this migration in your Supabase SQL Editor

-- recall_events table: Stores all recall events
CREATE TABLE IF NOT EXISTS recall_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mmp_id UUID NOT NULL REFERENCES mmp_files(id) ON DELETE CASCADE,
  recall_event_id TEXT UNIQUE NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('admin_to_fom', 'fom_to_coordinator', 'coordinator_to_collector')),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('full_mmp', 'by_activity', 'by_site', 'by_locality', 'by_state', 'by_hub', 'by_cp', 'by_date_range')),
  scope_filters JSONB,
  affected_site_ids TEXT[] DEFAULT '{}',
  reason TEXT,
  is_force_recall BOOLEAN DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
  affected_site_count INTEGER DEFAULT 0,
  affected_collector_count INTEGER DEFAULT 0,
  financial_amount NUMERIC(12, 2) DEFAULT 0,
  recovery_method TEXT CHECK (recovery_method IN ('deduct_future', 'cash_return', 'write_off')),
  initiated_by UUID NOT NULL REFERENCES profiles(id),
  initiated_by_name TEXT,
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by UUID REFERENCES profiles(id),
  approved_by_name TEXT,
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  previous_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- recall_approvals table: Stores approval workflow records
CREATE TABLE IF NOT EXISTS recall_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recall_event_id TEXT NOT NULL REFERENCES recall_events(recall_event_id) ON DELETE CASCADE,
  approver_id UUID NOT NULL REFERENCES profiles(id),
  approver_name TEXT,
  approver_role TEXT,
  action TEXT NOT NULL CHECK (action IN ('approve', 'reject')),
  notes TEXT,
  acted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sla_deadline TIMESTAMPTZ,
  sla_status TEXT CHECK (sla_status IN ('on_time', 'approaching', 'overdue')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- recovery_records table: Stores financial recovery records
CREATE TABLE IF NOT EXISTS recovery_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recall_event_id TEXT REFERENCES recall_events(recall_event_id) ON DELETE SET NULL,
  mmp_id UUID NOT NULL REFERENCES mmp_files(id) ON DELETE CASCADE,
  site_entry_id UUID NOT NULL,
  data_collector_id UUID REFERENCES profiles(id),
  data_collector_name TEXT,
  original_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  recovered_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  pending_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'SDG',
  recovery_method TEXT CHECK (recovery_method IN ('deduct_future', 'cash_return', 'write_off')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'recovered', 'written_off', 'cancelled')),
  wallet_transaction_id TEXT,
  receipt_reference TEXT,
  evidence_url TEXT,
  notes TEXT,
  processed_by UUID REFERENCES profiles(id),
  processed_by_name TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_recall_events_mmp_id ON recall_events(mmp_id);
CREATE INDEX IF NOT EXISTS idx_recall_events_status ON recall_events(status);
CREATE INDEX IF NOT EXISTS idx_recall_events_tier ON recall_events(tier);
CREATE INDEX IF NOT EXISTS idx_recall_events_initiated_by ON recall_events(initiated_by);
CREATE INDEX IF NOT EXISTS idx_recall_events_initiated_at ON recall_events(initiated_at DESC);

CREATE INDEX IF NOT EXISTS idx_recall_approvals_recall_event_id ON recall_approvals(recall_event_id);
CREATE INDEX IF NOT EXISTS idx_recall_approvals_approver_id ON recall_approvals(approver_id);

CREATE INDEX IF NOT EXISTS idx_recovery_records_mmp_id ON recovery_records(mmp_id);
CREATE INDEX IF NOT EXISTS idx_recovery_records_site_entry_id ON recovery_records(site_entry_id);
CREATE INDEX IF NOT EXISTS idx_recovery_records_status ON recovery_records(status);
CREATE INDEX IF NOT EXISTS idx_recovery_records_recall_event_id ON recovery_records(recall_event_id);

-- Enable Row Level Security
ALTER TABLE recall_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE recall_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies for recall_events
CREATE POLICY "Users can view recall events they initiated or are involved in"
  ON recall_events FOR SELECT
  USING (
    auth.uid() = initiated_by OR
    auth.uid() = approved_by OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() 
      AND role IN ('super_admin', 'admin', 'ict', 'finance')
    )
  );

CREATE POLICY "Authorized users can create recall events"
  ON recall_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() 
      AND role IN ('super_admin', 'admin', 'ict', 'fom', 'hub_supervisor', 'coordinator')
    )
  );

CREATE POLICY "Authorized users can update recall events"
  ON recall_events FOR UPDATE
  USING (
    auth.uid() = initiated_by OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() 
      AND role IN ('super_admin', 'admin', 'ict')
    )
  );

-- RLS Policies for recall_approvals
CREATE POLICY "Users can view approvals they made or for events they initiated"
  ON recall_approvals FOR SELECT
  USING (
    auth.uid() = approver_id OR
    EXISTS (
      SELECT 1 FROM recall_events re WHERE re.recall_event_id = recall_approvals.recall_event_id
      AND (re.initiated_by = auth.uid() OR auth.uid() = re.approved_by)
    ) OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() 
      AND role IN ('super_admin', 'admin', 'ict', 'finance')
    )
  );

CREATE POLICY "Authorized users can create approvals"
  ON recall_approvals FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() 
      AND role IN ('super_admin', 'admin', 'ict', 'fom', 'hub_supervisor')
    )
  );

-- RLS Policies for recovery_records
CREATE POLICY "Finance and admin users can view recovery records"
  ON recovery_records FOR SELECT
  USING (
    auth.uid() = data_collector_id OR
    auth.uid() = processed_by OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() 
      AND role IN ('super_admin', 'admin', 'ict', 'finance', 'fom', 'hub_supervisor')
    )
  );

CREATE POLICY "Authorized users can create recovery records"
  ON recovery_records FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() 
      AND role IN ('super_admin', 'admin', 'ict', 'finance')
    )
  );

CREATE POLICY "Authorized users can update recovery records"
  ON recovery_records FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() 
      AND role IN ('super_admin', 'admin', 'ict', 'finance')
    )
  );

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_recall_events_updated_at
  BEFORE UPDATE ON recall_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recovery_records_updated_at
  BEFORE UPDATE ON recovery_records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comment on tables
COMMENT ON TABLE recall_events IS 'Stores MMP recall events with tiered recall workflow';
COMMENT ON TABLE recall_approvals IS 'Stores approval/rejection records for recall events';
COMMENT ON TABLE recovery_records IS 'Stores financial recovery records for recalled site visits';
