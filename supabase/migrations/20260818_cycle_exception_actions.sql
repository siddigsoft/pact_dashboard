-- ─────────────────────────────────────────────────────────────────────────────
-- cycle_exception_actions
-- Persists every Step-5 exception decision when a cycle is closed.
-- Immediate decisions (cancel/reduce/reassign) are written to
-- down_payment_requests at close time and marked executed=true here.
-- Deferred decisions (roll/hold) remain executed=false until Finance
-- completes the rollover via the Exception Tracker page.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cycle_exception_actions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source cycle
  mmp_file_id         uuid NOT NULL REFERENCES mmp_files(id) ON DELETE CASCADE,
  mmp_site_entry_id   uuid REFERENCES mmp_site_entries(id),
  advance_id          uuid,           -- down_payment_requests.id (may be NULL if record not found at close)
  enumerator_id       uuid,           -- profiles.id
  enumerator_name     text,
  site_name           text,
  advance_amount      numeric NOT NULL DEFAULT 0,
  advance_status      text,           -- 'paid' | 'fully_paid' | 'partially_paid' | 'approved'

  -- Decision recorded in Step 5
  decision            text NOT NULL CHECK (decision IN (
                        'roll','return','writeoff','redirect',
                        'cancel','hold','reassign','reduce'
                      )),
  decision_amount     numeric,        -- redirect amount OR reduced amount
  justification       text,
  target_site_id      uuid REFERENCES mmp_site_entries(id),

  -- Execution tracking (deferred rollover/hold actions)
  executed            boolean NOT NULL DEFAULT false,
  executed_at         timestamptz,
  executed_by         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  executed_by_name    text,
  execution_note      text,

  -- Rollover destination (set when Finance executes a roll/hold)
  rollover_mmp_id     uuid REFERENCES mmp_files(id),
  rollover_site_id    uuid REFERENCES mmp_site_entries(id),
  rollover_site_name  text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by_name     text
);

-- Index for the rollover page query (pending deferred actions)
CREATE INDEX IF NOT EXISTS idx_cea_pending
  ON cycle_exception_actions (decision, executed)
  WHERE executed = false AND decision IN ('roll', 'hold');

-- Index for lookup by MMP
CREATE INDEX IF NOT EXISTS idx_cea_mmp
  ON cycle_exception_actions (mmp_file_id);

-- RLS: Finance, Admin, SuperAdmin can manage; anyone can read their own MMP
ALTER TABLE cycle_exception_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance and Admin can manage cycle exception actions"
  ON cycle_exception_actions
  FOR ALL
  USING (true)
  WITH CHECK (true);
