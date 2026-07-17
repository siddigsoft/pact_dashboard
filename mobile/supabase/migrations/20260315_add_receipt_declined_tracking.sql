-- Add receipt_declined_at column to track when users mark payments as "Not Yet Received"
-- This prevents the receipt confirmation modal from appearing repeatedly

-- For operational_cost_submissions table
ALTER TABLE IF EXISTS operational_cost_submissions
ADD COLUMN IF NOT EXISTS receipt_declined_at TIMESTAMPTZ DEFAULT NULL;

-- Create index if column was added
CREATE INDEX IF NOT EXISTS idx_operational_cost_submissions_receipt_declined_at 
ON operational_cost_submissions(receipt_declined_at) 
WHERE receipt_declined_at IS NOT NULL;

-- For down_payment_requests table
ALTER TABLE IF EXISTS down_payment_requests
ADD COLUMN IF NOT EXISTS receipt_declined_at TIMESTAMPTZ DEFAULT NULL;

-- Create index for down_payment_requests
CREATE INDEX IF NOT EXISTS idx_down_payment_requests_receipt_declined_at 
ON down_payment_requests(receipt_declined_at) 
WHERE receipt_declined_at IS NOT NULL;


