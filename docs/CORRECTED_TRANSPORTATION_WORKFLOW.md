# CORRECTED Transportation & Down-Payment Workflow

## ✅ Correct Workflow (Updated Requirements)

### CRITICAL CLARIFICATIONS

1. **❌ NO cost submission by enumerators/coordinators**
   - Only ADMIN can calculate and adjust costs
   - Enumerators/coordinators ONLY request down-payments

2. **✅ Down-Payment Request System (NEW)**
   - After site assignment → Request up-front transportation costs
   - Two-tier approval: Hub Supervisor → Admin
   - Flexible payment: Installments OR full advance

3. **✅ Super-Admin Role (NEW)**
   - Maximum 3 accounts system-wide
   - Only role that can DELETE records
   - To add 4th account, must drop one existing

4. **✅ Complete Audit Trail**
   - All cost modifications logged with reasons
   - No deletions except super-admin
   - Every change tracked in database

---

## Complete Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│              CORRECTED TRANSPORTATION WORKFLOW                      │
└─────────────────────────────────────────────────────────────────────┘

STAGE 1: ADMIN CALCULATES COSTS (BEFORE DISPATCH)
┌────────────────────────────────────────────────────────────────┐
│ DispatchSitesDialog (Admin Only)                               │
│                                                                │
│ Admin MUST enter transportation costs for EACH site:          │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Site: Al-Fashir Health Center                            │ │
│ │                                                          │ │
│ │ Transportation Cost: [50] SDG (REQUIRED)                 │ │
│ │ Distance: 45 km                                          │ │
│ │ Calculation notes: [2 days @ 25 SDG/day]                 │ │
│ │                                                          │ │
│ │ Optional estimates:                                      │ │
│ │ Accommodation: [30] SDG                                  │ │
│ │ Meals: [15] SDG                                          │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                                │
│ ✅ Creates record in site_visit_costs:                        │
│    - transportation_cost = 50                                 │
│    - accommodation_cost = 30                                  │
│    - meal_allowance = 15                                      │
│    - total_cost = 95                                          │
│    - cost_status = 'estimated'                                │
│    - calculated_by = admin_id                                 │
│    - calculation_notes = "2 days @ 25 SDG/day"                │
│                                                                │
│ ✅ Site status = 'Dispatched'                                  │
└────────────────────────────────────────────────────────────────┘
                            │
                            ▼
STAGE 2: SITE ASSIGNMENT
┌────────────────────────────────────────────────────────────────┐
│ Admin assigns site to Data Collector/Coordinator              │
│                                                                │
│ • Site status: 'Dispatched' → 'Assigned'                      │
│ • Assigned to: Ahmed Mohammed (Data Collector)                │
│ • Hub: Khartoum Hub                                            │
│ • Supervisor: Sarah Ahmed                                      │
│                                                                │
│ Notification sent:                                             │
│ "Site Al-Fashir assigned. Transportation budget: 50 SDG"      │
└────────────────────────────────────────────────────────────────┘
                            │
                            ▼
STAGE 3: DOWN-PAYMENT REQUEST (✅ NEW FEATURE)
┌────────────────────────────────────────────────────────────────┐
│ Down-Payment Request (Enumerator/Coordinator)                  │
│                                                                │
│ Ahmed Mohammed requests DOWN-PAYMENT:                          │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Site: Al-Fashir Health Center                            │ │
│ │ Total Transportation Budget: 50 SDG                      │ │
│ │                                                          │ │
│ │ Request Type:                                            │ │
│ │ ○ Full Advance (50 SDG)                                  │ │
│ │ ● Installments                                           │ │
│ │                                                          │ │
│ │ ┌────────────────────────────────────────────────────┐  │ │
│ │ │ Installment Plan:                                  │  │ │
│ │ │                                                    │  │ │
│ │ │ 1st Payment (Before travel): [30] SDG              │  │ │
│ │ │ 2nd Payment (After completion): [20] SDG           │  │ │
│ │ │                                                    │  │ │
│ │ │ Total: 50 SDG ✓                                    │  │ │
│ │ └────────────────────────────────────────────────────┘  │ │
│ │                                                          │ │
│ │ Justification:                                           │ │
│ │ [Need funds for taxi and fuel before departure]         │ │
│ │                                                          │ │
│ │ [Request Down-Payment]                                   │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                                │
│ ✅ Creates record in down_payment_requests:                   │
│    - site_visit_id                                            │
│    - requested_by = ahmed_id                                  │
│    - total_amount = 50                                        │
│    - payment_type = 'installments'                            │
│    - installments = [{amount: 30, stage: 'before'}, ...]     │
│    - status = 'pending_supervisor'                            │
│    - supervisor_id = sarah_id (auto-assigned from hub)        │
│                                                                │
│ Notification sent to Hub Supervisor (Sarah Ahmed)             │
└────────────────────────────────────────────────────────────────┘
                            │
                            ▼
STAGE 4: SUPERVISOR APPROVAL (✅ NEW - TIER 1)
┌────────────────────────────────────────────────────────────────┐
│ Hub Supervisor Review (Sarah Ahmed)                            │
│                                                                │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Down-Payment Request #12345                              │ │
│ │                                                          │ │
│ │ Requested by: Ahmed Mohammed (Data Collector)           │ │
│ │ Site: Al-Fashir Health Center                            │ │
│ │ Hub: Khartoum Hub                                        │ │
│ │                                                          │ │
│ │ Budget Details:                                          │ │
│ │ Total Transportation Budget: 50 SDG                      │ │
│ │ Requested Down-Payment: 50 SDG (100%)                    │ │
│ │                                                          │ │
│ │ Payment Plan:                                            │ │
│ │ • 1st: 30 SDG (Before travel)                            │ │
│ │ • 2nd: 20 SDG (After completion)                         │ │
│ │                                                          │ │
│ │ Justification:                                           │ │
│ │ "Need funds for taxi and fuel before departure"         │ │
│ │                                                          │ │
│ │ Supervisor Notes:                                        │ │
│ │ [Verified collector has no pending advances]            │ │
│ │                                                          │ │
│ │ [Approve] [Reject] [Request Changes]                     │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                                │
│ Sarah APPROVES:                                                │
│ ✅ Updates down_payment_requests:                             │
│    - status = 'pending_supervisor' → 'pending_admin'          │
│    - supervisor_approved_at = NOW()                           │
│    - supervisor_approved_by = sarah_id                        │
│    - supervisor_notes = "Verified no pending advances"        │
│                                                                │
│ Notification sent to Admin                                     │
└────────────────────────────────────────────────────────────────┘
                            │
                            ▼
STAGE 5: ADMIN APPROVAL & PAYMENT (✅ NEW - TIER 2)
┌────────────────────────────────────────────────────────────────┐
│ Admin Payment Processing                                       │
│                                                                │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Down-Payment Request #12345                              │ │
│ │ ✅ Supervisor Approved by: Sarah Ahmed                   │ │
│ │                                                          │ │
│ │ Requested by: Ahmed Mohammed                             │ │
│ │ Site: Al-Fashir Health Center                            │ │
│ │ Amount: 50 SDG (Installments: 30 + 20)                   │ │
│ │                                                          │ │
│ │ Payment Details:                                         │ │
│ │ ┌────────────────────────────────────────────────────┐  │ │
│ │ │ Process 1st Installment (Before Travel)           │  │ │
│ │ │ Amount: 30 SDG                                     │  │ │
│ │ │ Payment Method: [Wallet Credit ▼]                 │  │ │
│ │ │                                                    │  │ │
│ │ │ Admin Notes:                                       │  │ │
│ │ │ [First installment approved for travel expenses]  │  │ │
│ │ │                                                    │  │ │
│ │ │ [Process Payment]                                  │  │ │
│ │ └────────────────────────────────────────────────────┘  │ │
│ │                                                          │ │
│ │ Remaining: 20 SDG (After completion)                     │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                                │
│ Admin PROCESSES 1st installment:                               │
│ ✅ Creates wallet_transaction:                                │
│    - user_id = ahmed_id                                       │
│    - type = 'down_payment'                                    │
│    - amount = 30                                              │
│    - description = "Down-payment 1/2 for Al-Fashir"           │
│    - down_payment_request_id = 12345                          │
│                                                                │
│ ✅ Updates down_payment_requests:                             │
│    - status = 'partially_paid'                                │
│    - paid_installments = [{amount: 30, paid_at: NOW()}]       │
│    - admin_processed_by = admin_id                            │
│    - admin_notes = "First installment approved..."            │
│                                                                │
│ ✅ Updates user wallet:                                        │
│    - Ahmed's wallet: +30 SDG                                  │
│                                                                │
│ Notification sent to Ahmed Mohammed                            │
└────────────────────────────────────────────────────────────────┘
                            │
                            ▼
STAGE 6: SITE VISIT WORK
┌────────────────────────────────────────────────────────────────┐
│ Data Collector Completes Site Visit                           │
│                                                                │
│ Ahmed Mohammed:                                                │
│ • Receives 30 SDG down-payment in wallet                       │
│ • Travels to Al-Fashir                                         │
│ • Completes site visit                                         │
│ • Marks status: 'Assigned' → 'Completed'                       │
│                                                                │
│ ✅ No cost submission - Admin handles all costs                │
└────────────────────────────────────────────────────────────────┘
                            │
                            ▼
STAGE 7: FINAL PAYMENT (2nd Installment)
┌────────────────────────────────────────────────────────────────┐
│ Admin Processes Final Payment                                  │
│                                                                │
│ Admin reviews completion and processes 2nd installment:        │
│                                                                │
│ ✅ Creates wallet_transaction:                                │
│    - amount = 20                                              │
│    - description = "Final payment 2/2 for Al-Fashir"          │
│                                                                │
│ ✅ Updates down_payment_requests:                             │
│    - status = 'fully_paid'                                    │
│    - paid_installments = [{30, ...}, {20, paid_at: NOW()}]    │
│                                                                │
│ ✅ Updates user wallet:                                        │
│    - Ahmed's wallet: +20 SDG                                  │
│    - Total received: 50 SDG                                   │
└────────────────────────────────────────────────────────────────┘
                            │
                            ▼
STAGE 8: ADMIN COST ADJUSTMENT (Optional)
┌────────────────────────────────────────────────────────────────┐
│ Admin Adjusts Final Costs (If Needed)                          │
│                                                                │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Cost Adjustment for Al-Fashir Site Visit                 │ │
│ │                                                          │ │
│ │ Original Estimated Costs:                                │ │
│ │ • Transportation: 50 SDG                                 │ │
│ │ • Accommodation: 30 SDG                                  │ │
│ │ • Meals: 15 SDG                                          │ │
│ │ Total: 95 SDG                                            │ │
│ │                                                          │ │
│ │ Actual Situation:                                        │ │
│ │ • Road closure required detour (+10 SDG)                 │ │
│ │ • Additional night stay (+20 SDG)                        │ │
│ │                                                          │ │
│ │ Adjusted Costs:                                          │ │
│ │ Transportation: [60] SDG (+10)                           │ │
│ │ Accommodation: [50] SDG (+20)                            │ │
│ │ Meals: [15] SDG (no change)                              │ │
│ │ Total: 125 SDG (+30)                                     │ │
│ │                                                          │ │
│ │ ⚠️  REASON (MANDATORY):                                  │ │
│ │ [Road closure required 20km detour adding 10 SDG.        │ │
│ │  Security situation required additional night stay       │ │
│ │  adding 20 SDG accommodation. Both verified by           │ │
│ │  field report and receipts.]                             │ │
│ │                                                          │ │
│ │ Adjusted by: [Admin Name]                                │ │
│ │ Date: [2025-11-25]                                       │ │
│ │                                                          │ │
│ │ [Save Adjustment]                                        │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                                │
│ ✅ Creates cost_adjustment_audit record:                      │
│    - site_visit_cost_id                                       │
│    - previous_transportation = 50                             │
│    - new_transportation = 60                                  │
│    - previous_accommodation = 30                              │
│    - new_accommodation = 50                                   │
│    - adjustment_reason = "Road closure required..."           │
│    - adjusted_by = admin_id                                   │
│    - adjusted_at = NOW()                                      │
│                                                                │
│ ✅ Updates site_visit_costs:                                  │
│    - transportation_cost = 60                                 │
│    - accommodation_cost = 50                                  │
│    - total_cost = 125                                         │
│    - cost_status = 'adjusted'                                 │
│                                                                │
│ ✅ Processes additional payment if needed:                    │
│    - Already paid: 50 SDG (down-payment)                      │
│    - New total: 125 SDG                                       │
│    - Additional payment needed: 75 SDG                        │
│    - Creates wallet_transaction for +75 SDG                   │
└────────────────────────────────────────────────────────────────┘
```

---

## Database Schema (New Tables)

### 1. down_payment_requests
```sql
CREATE TABLE down_payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Request details
  site_visit_id UUID REFERENCES site_visits(id) NOT NULL,
  mmp_site_entry_id UUID REFERENCES mmp_site_entries(id),
  
  -- Requester information
  requested_by UUID REFERENCES profiles(id) NOT NULL,
  requested_at TIMESTAMP DEFAULT NOW(),
  requester_role TEXT, -- 'dataCollector' or 'coordinator'
  hub_id UUID,
  
  -- Payment details
  total_transportation_budget NUMERIC(12,2) NOT NULL, -- From site_visit_costs
  requested_amount NUMERIC(12,2) NOT NULL,
  payment_type TEXT NOT NULL, -- 'full_advance' | 'installments'
  
  -- Installment details (JSONB array if payment_type = 'installments')
  installments JSONB DEFAULT '[]', -- [{amount: 30, stage: 'before', paid: false, paid_at: null}, ...]
  paid_installments JSONB DEFAULT '[]', -- [{amount: 30, paid_at: '2025-11-25T10:00:00Z', transaction_id: '...'}]
  
  -- Justification
  justification TEXT NOT NULL,
  supporting_documents JSONB DEFAULT '[]',
  
  -- Supervisor approval (TIER 1)
  supervisor_id UUID REFERENCES profiles(id),
  supervisor_status TEXT, -- 'pending' | 'approved' | 'rejected' | 'changes_requested'
  supervisor_approved_by UUID REFERENCES profiles(id),
  supervisor_approved_at TIMESTAMP,
  supervisor_notes TEXT,
  supervisor_rejection_reason TEXT,
  
  -- Admin approval (TIER 2)
  admin_status TEXT, -- 'pending' | 'approved' | 'rejected'
  admin_processed_by UUID REFERENCES profiles(id),
  admin_processed_at TIMESTAMP,
  admin_notes TEXT,
  admin_rejection_reason TEXT,
  
  -- Payment tracking
  status TEXT NOT NULL DEFAULT 'pending_supervisor', 
  -- 'pending_supervisor' | 'pending_admin' | 'approved' | 'rejected' | 
  -- 'partially_paid' | 'fully_paid' | 'cancelled'
  
  total_paid_amount NUMERIC(12,2) DEFAULT 0,
  remaining_amount NUMERIC(12,2),
  
  -- Wallet transactions (array of transaction IDs)
  wallet_transaction_ids JSONB DEFAULT '[]',
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_payment_type CHECK (payment_type IN ('full_advance', 'installments')),
  CONSTRAINT valid_status CHECK (status IN (
    'pending_supervisor', 'pending_admin', 'approved', 'rejected', 
    'partially_paid', 'fully_paid', 'cancelled'
  ))
);

CREATE INDEX idx_down_payment_requests_requester ON down_payment_requests(requested_by);
CREATE INDEX idx_down_payment_requests_supervisor ON down_payment_requests(supervisor_id);
CREATE INDEX idx_down_payment_requests_status ON down_payment_requests(status);
CREATE INDEX idx_down_payment_requests_site_visit ON down_payment_requests(site_visit_id);
```

### 2. cost_adjustment_audit
```sql
CREATE TABLE cost_adjustment_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Cost record being adjusted
  site_visit_cost_id UUID REFERENCES site_visit_costs(id) NOT NULL,
  site_visit_id UUID REFERENCES site_visits(id) NOT NULL,
  
  -- Previous values
  previous_transportation_cost NUMERIC(12,2),
  previous_accommodation_cost NUMERIC(12,2),
  previous_meal_allowance NUMERIC(12,2),
  previous_other_costs NUMERIC(12,2),
  previous_total_cost NUMERIC(12,2),
  
  -- New values
  new_transportation_cost NUMERIC(12,2),
  new_accommodation_cost NUMERIC(12,2),
  new_meal_allowance NUMERIC(12,2),
  new_other_costs NUMERIC(12,2),
  new_total_cost NUMERIC(12,2),
  
  -- Adjustment details
  adjustment_type TEXT NOT NULL, -- 'increase' | 'decrease'
  adjustment_reason TEXT NOT NULL, -- MANDATORY reason for change
  supporting_documents JSONB DEFAULT '[]',
  
  -- Who made the adjustment
  adjusted_by UUID REFERENCES profiles(id) NOT NULL,
  adjusted_by_role TEXT NOT NULL, -- Must be 'admin' or 'financialAdmin'
  adjusted_at TIMESTAMP DEFAULT NOW(),
  
  -- Additional payment if needed
  additional_payment_needed NUMERIC(12,2) DEFAULT 0,
  additional_payment_transaction_id UUID,
  additional_payment_processed BOOLEAN DEFAULT false,
  
  -- Audit trail
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_adjustment_type CHECK (adjustment_type IN ('increase', 'decrease'))
);

CREATE INDEX idx_cost_adjustment_audit_site_visit_cost ON cost_adjustment_audit(site_visit_cost_id);
CREATE INDEX idx_cost_adjustment_audit_adjusted_by ON cost_adjustment_audit(adjusted_by);
CREATE INDEX idx_cost_adjustment_audit_date ON cost_adjustment_audit(adjusted_at);
```

### 3. super_admins (Maximum 3 accounts)
```sql
CREATE TABLE super_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User reference
  user_id UUID REFERENCES profiles(id) UNIQUE NOT NULL,
  
  -- Appointment details
  appointed_by UUID REFERENCES profiles(id),
  appointed_at TIMESTAMP DEFAULT NOW(),
  appointment_reason TEXT NOT NULL,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  deactivated_at TIMESTAMP,
  deactivated_by UUID REFERENCES profiles(id),
  deactivation_reason TEXT,
  
  -- Activity tracking
  last_activity_at TIMESTAMP,
  deletion_count INTEGER DEFAULT 0, -- Track number of deletions performed
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Constraint: Maximum 3 active super-admins
CREATE UNIQUE INDEX idx_super_admins_active ON super_admins(is_active) 
WHERE is_active = true;

-- Trigger to enforce 3-account limit
CREATE OR REPLACE FUNCTION enforce_super_admin_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM super_admins WHERE is_active = true) >= 3 THEN
    RAISE EXCEPTION 'Maximum 3 active super-admin accounts allowed. Please deactivate an existing account first.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_super_admin_limit
  BEFORE INSERT OR UPDATE ON super_admins
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION enforce_super_admin_limit();
```

### 4. deletion_audit_log (Track all deletions)
```sql
CREATE TABLE deletion_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What was deleted
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  record_data JSONB NOT NULL, -- Complete snapshot of deleted record
  
  -- Who deleted it
  deleted_by UUID REFERENCES profiles(id) NOT NULL,
  deleted_by_role TEXT NOT NULL, -- Must be 'superAdmin'
  deletion_reason TEXT NOT NULL, -- MANDATORY reason
  
  -- When
  deleted_at TIMESTAMP DEFAULT NOW(),
  
  -- Can it be restored?
  is_restorable BOOLEAN DEFAULT true,
  restored_at TIMESTAMP,
  restored_by UUID REFERENCES profiles(id),
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_deletion_audit_log_table ON deletion_audit_log(table_name);
CREATE INDEX idx_deletion_audit_log_deleted_by ON deletion_audit_log(deleted_by);
CREATE INDEX idx_deletion_audit_log_date ON deletion_audit_log(deleted_at);
```

---

## Summary of Complete System

### Workflow Steps:
1. ✅ Admin calculates costs BEFORE dispatch
2. ✅ Site assigned to enumerator/coordinator
3. ✅ Enumerator requests down-payment (full or installments)
4. ✅ Hub supervisor approves (Tier 1)
5. ✅ Admin processes payment (Tier 2)
6. ✅ Enumerator completes site visit
7. ✅ Admin adjusts costs if needed (with reason)
8. ✅ Complete audit trail maintained

### Role Permissions:
- **Enumerators/Coordinators**: Request down-payments only
- **Hub Supervisors**: Approve/reject down-payment requests (Tier 1)
- **Admins**: Calculate costs, process payments, adjust costs
- **Super-Admins (max 3)**: Delete records, complete system control

### Audit Trail:
- All cost calculations logged
- All adjustments require reasons
- All down-payment requests tracked
- All deletions logged (super-admin only)
- No soft deletes - hard deletes only by super-admin

---

Ready to implement!
