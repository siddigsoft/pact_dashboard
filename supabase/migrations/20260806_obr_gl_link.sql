-- Link OBR approvals back into GL budget lines for full accounting traceability.
-- When an OBR is approved (tier2), the system creates acct_budget_lines entries
-- tagged with this obr_id so finance can see OBR-sourced budget allocations in
-- the Budget Planning page alongside manually entered lines.

ALTER TABLE acct_budget_lines
  ADD COLUMN IF NOT EXISTS obr_id    uuid REFERENCES operational_budget_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS obr_notes text;

CREATE INDEX IF NOT EXISTS acct_budget_lines_obr_idx
  ON acct_budget_lines(obr_id)
  WHERE obr_id IS NOT NULL;
