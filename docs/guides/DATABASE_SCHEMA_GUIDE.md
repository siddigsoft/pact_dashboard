# 📊 PACT Database Schema Reference Guide

**Complete Database Documentation for the PACT Workflow Platform**

**Version:** 1.0  
**Last Updated:** November 23, 2025  
**Platform:** Supabase PostgreSQL  
**Status:** Production Ready

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Database Architecture](#database-architecture)
3. [Core Tables](#core-tables)
   - [User Management](#user-management-tables)
   - [MMP Management](#mmp-management-tables)
   - [Financial Management](#financial-management-tables)
   - [Project Management](#project-management-tables)
4. [Views](#database-views)
5. [Relationships & Foreign Keys](#relationships--foreign-keys)
6. [Indexes](#database-indexes)
7. [Triggers & Functions](#triggers--functions)
8. [RLS Policies](#row-level-security-policies)
9. [Migration Guide](#migration-guide)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The PACT platform uses **Supabase PostgreSQL** as its primary database, providing:

✅ **Relational data model** for complex relationships  
✅ **Row Level Security (RLS)** for multi-tenant access control  
✅ **Real-time subscriptions** for live updates  
✅ **JSONB columns** for flexible schema design  
✅ **Triggers & functions** for automated workflows  
✅ **Full-text search** capabilities  

### **Key Statistics**

- **Total Tables:** 40+ tables
- **Total Views:** 8+ views
- **Total Indexes:** 50+ performance indexes
- **Total RLS Policies:** 100+ security policies
- **Total Triggers:** 15+ automated triggers

---

## Database Architecture

### **Entity Relationship Overview**

```
┌─────────────────────────────────────────────────────────┐
│                    PACT DATABASE                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐      ┌──────────────┐               │
│  │   Users &    │◄────►│   Projects   │               │
│  │    Roles     │      │              │               │
│  └──────────────┘      └──────────────┘               │
│         │                      │                       │
│         ▼                      ▼                       │
│  ┌──────────────┐      ┌──────────────┐               │
│  │   MMPs &     │◄────►│   Budgets    │               │
│  │   Sites      │      │              │               │
│  └──────────────┘      └──────────────┘               │
│         │                      │                       │
│         ▼                      ▼                       │
│  ┌──────────────┐      ┌──────────────┐               │
│  │ Site Visits  │◄────►│   Wallets    │               │
│  │ & Costs      │      │ & Payments   │               │
│  └──────────────┘      └──────────────┘               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Core Tables

### **User Management Tables**

#### **1. `profiles`**

Stores core user profile information.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key (matches auth.users.id) |
| `email` | TEXT | YES | NULL | User email address |
| `username` | TEXT | YES | NULL | Unique username |
| `full_name` | TEXT | YES | NULL | User's full name |
| `role` | TEXT | YES | NULL | Primary role (legacy field) |
| `avatar_url` | TEXT | YES | NULL | Profile picture URL |
| `hub_id` | UUID | YES | NULL | Assigned hub office |
| `state_id` | UUID | YES | NULL | Assigned state |
| `locality_id` | UUID | YES | NULL | Assigned locality |
| `employee_id` | TEXT | YES | NULL | Unique employee identifier |
| `phone` | TEXT | YES | NULL | Contact phone number |
| `status` | TEXT | YES | `'active'` | Account status |
| `availability` | TEXT | YES | `'available'` | Field availability status |
| `location` | JSONB | YES | NULL | GPS coordinates + metadata |
| `location_sharing` | BOOLEAN | YES | `false` | Location sharing enabled |
| `created_at` | TIMESTAMPTZ | YES | `NOW()` | Account creation timestamp |
| `updated_at` | TIMESTAMPTZ | YES | `NOW()` | Last profile update |

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE on `username`
- UNIQUE on `employee_id`
- INDEX on `email`
- INDEX on `hub_id`
- INDEX on `status`

**Foreign Keys:**
- None (root table)

**RLS Policies:**
- Users can read own profile
- Admins/ICT can read all profiles
- Users can update own profile (limited fields)
- Only admins can delete profiles

---

#### **2. `user_roles`**

Maps users to one or more roles (supports custom roles).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key |
| `user_id` | UUID | NO | - | References `profiles.id` |
| `role` | TEXT | YES | NULL | System role (admin, fom, etc.) |
| `role_id` | UUID | YES | NULL | Custom role ID (references `roles.id`) |
| `assigned_by` | UUID | YES | NULL | User who assigned this role |
| `assigned_at` | TIMESTAMPTZ | YES | `NOW()` | Assignment timestamp |
| `created_at` | TIMESTAMPTZ | YES | `NOW()` | Record creation |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `user_id`
- INDEX on `role`
- INDEX on `role_id`

**Foreign Keys:**
- `user_id` → `profiles(id)` ON DELETE CASCADE
- `role_id` → `roles(id)` ON DELETE SET NULL
- `assigned_by` → `profiles(id)` ON DELETE SET NULL

**Constraints:**
- Must have either `role` OR `role_id` (not both NULL)

---

#### **3. `roles`**

Defines custom roles (system roles are hardcoded in application).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key |
| `name` | TEXT | NO | - | Role identifier (e.g., 'custom_auditor') |
| `display_name` | TEXT | NO | - | Human-readable name |
| `description` | TEXT | YES | NULL | Role purpose description |
| `is_system_role` | BOOLEAN | YES | `false` | System vs custom role |
| `is_active` | BOOLEAN | YES | `true` | Active/inactive status |
| `created_at` | TIMESTAMPTZ | YES | `NOW()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | YES | `NOW()` | Last update |
| `created_by` | UUID | YES | NULL | Creator user ID |

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE on `name`
- INDEX on `is_active`

**Foreign Keys:**
- `created_by` → `profiles(id)` ON DELETE SET NULL

---

#### **4. `permissions`**

Granular permissions for each role.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key |
| `role_id` | UUID | NO | - | References `roles.id` |
| `resource` | TEXT | NO | - | Resource name (e.g., 'mmp', 'finances') |
| `action` | TEXT | NO | - | Action (create, read, update, delete, etc.) |
| `conditions` | JSONB | YES | NULL | Conditional logic (e.g., {"own_data_only": true}) |
| `created_at` | TIMESTAMPTZ | YES | `NOW()` | Creation timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `role_id`
- INDEX on `(resource, action)`

**Foreign Keys:**
- `role_id` → `roles(id)` ON DELETE CASCADE

**Example Data:**
```sql
-- Admin role has all permissions
INSERT INTO permissions (role_id, resource, action) VALUES
  ('admin-role-uuid', 'users', 'create'),
  ('admin-role-uuid', 'users', 'read'),
  ('admin-role-uuid', 'users', 'update'),
  ('admin-role-uuid', 'mmp', 'approve');
```

---

### **MMP Management Tables**

#### **5. `mmp_files`**

Core table for Monthly Monitoring Plans.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key |
| `name` | TEXT | NO | - | MMP display name |
| `mmp_id` | TEXT | YES | NULL | Formatted MMP ID (e.g., 'MMP-2025-01-WD') |
| `status` | TEXT | YES | `'pending'` | Workflow status |
| `uploaded_by` | UUID | YES | NULL | Uploader user ID |
| `uploaded_at` | TIMESTAMPTZ | YES | `NOW()` | Upload timestamp |
| `approved_by` | UUID | YES | NULL | Approver user ID |
| `approved_at` | TIMESTAMPTZ | YES | NULL | Approval timestamp |
| `region` | TEXT | YES | NULL | Geographic region |
| `year` | INTEGER | YES | NULL | Plan year |
| `month` | INTEGER | YES | NULL | Plan month (1-12) |
| `entries` | INTEGER | YES | `0` | Total site entries |
| `processed_entries` | INTEGER | YES | `0` | Processed entries |
| `file_url` | TEXT | YES | NULL | Supabase storage URL |
| `project_id` | UUID | YES | NULL | Associated project |
| `workflow` | JSONB | YES | NULL | Workflow stage data |
| `permits` | JSONB | YES | NULL | Permit documents |
| `created_at` | TIMESTAMPTZ | YES | `NOW()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | YES | `NOW()` | Last update |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `uploaded_by`
- INDEX on `status`
- INDEX on `project_id`
- INDEX on `year, month`

**Foreign Keys:**
- `uploaded_by` → `profiles(id)` ON DELETE SET NULL
- `approved_by` → `profiles(id)` ON DELETE SET NULL
- `project_id` → `projects(id)` ON DELETE SET NULL

**Status Values:**
- `pending` - Awaiting first review
- `awaitingPermits` - Permit verification needed
- `verified` - Passed verification
- `approved` - Final approval granted
- `rejected` - Approval denied
- `archived` - No longer active

---

#### **6. `mmp_site_entries`**

Individual site entries within an MMP.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key |
| `mmp_file_id` | UUID | NO | - | Parent MMP file |
| `site_code` | TEXT | YES | NULL | Unique site identifier |
| `site_name` | TEXT | YES | NULL | Site display name |
| `hub_office` | TEXT | YES | NULL | Hub assignment |
| `state` | TEXT | YES | NULL | State location |
| `locality` | TEXT | YES | NULL | Locality location |
| `cp_name` | TEXT | YES | NULL | Cooperating Partner |
| `visit_date` | DATE | YES | NULL | Planned visit date |
| `status` | TEXT | YES | `'pending'` | Entry status |
| `cost` | INTEGER | YES | `0` | Estimated cost (cents) |
| `enumerator_fee` | INTEGER | YES | `0` | Base fee (cents) |
| `transport_fee` | INTEGER | YES | `0` | Transport fee (cents) |
| `additional_data` | JSONB | YES | NULL | Extra metadata |
| `created_at` | TIMESTAMPTZ | YES | `NOW()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | YES | `NOW()` | Last update |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `mmp_file_id`
- INDEX on `site_code`
- INDEX on `status`
- INDEX on `visit_date`

**Foreign Keys:**
- `mmp_file_id` → `mmp_files(id)` ON DELETE CASCADE

---

### **Financial Management Tables**

#### **7. `wallets`**

User wallet balances and financial summary.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key |
| `user_id` | UUID | NO | - | Wallet owner |
| `balances` | JSONB | YES | `{}` | Balances by currency |
| `total_earned` | INTEGER | YES | `0` | Lifetime earned (cents, SDG) |
| `total_withdrawn` | INTEGER | YES | `0` | Lifetime withdrawn (cents, SDG) |
| `created_at` | TIMESTAMPTZ | YES | `NOW()` | Wallet creation |
| `updated_at` | TIMESTAMPTZ | YES | `NOW()` | Last transaction |

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE INDEX on `user_id`

**Foreign Keys:**
- `user_id` → `profiles(id)` ON DELETE CASCADE

**JSONB Structure (`balances`):**
```json
{
  "SDG": 150000,
  "USD": 5000,
  "EUR": 0
}
```

---

#### **8. `wallet_transactions`**

All wallet transactions (credits, debits, adjustments).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key |
| `wallet_id` | UUID | NO | - | Associated wallet |
| `user_id` | UUID | NO | - | User (denormalized) |
| `type` | TEXT | NO | - | Transaction type |
| `amount_cents` | BIGINT | NO | - | Amount in cents |
| `currency` | VARCHAR(3) | NO | `'SDG'` | Currency code |
| `balance_before_cents` | BIGINT | YES | NULL | Balance before transaction |
| `balance_after_cents` | BIGINT | YES | NULL | Balance after transaction |
| `site_visit_id` | UUID | YES | NULL | Related site visit |
| `description` | TEXT | YES | NULL | Transaction description |
| `metadata` | JSONB | YES | NULL | Extra data |
| `created_at` | TIMESTAMPTZ | YES | `NOW()` | Transaction timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `wallet_id`
- INDEX on `user_id`
- INDEX on `type`
- INDEX on `created_at DESC`

**Foreign Keys:**
- `wallet_id` → `wallets(id)` ON DELETE CASCADE
- `user_id` → `profiles(id)` ON DELETE CASCADE
- `site_visit_id` → `site_visits(id)` ON DELETE SET NULL

**Transaction Types:**
- `fee_credit` - Site visit fee earned
- `transport_credit` - Transport fee earned
- `adjustment_credit` - Manual credit
- `adjustment_debit` - Manual debit
- `withdrawal` - Payout to user
- `refund` - Returned payment

---

#### **9. `payout_requests`**

Withdrawal requests from users.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key |
| `user_id` | UUID | NO | - | Requesting user |
| `amount_cents` | BIGINT | NO | - | Requested amount (cents) |
| `currency` | VARCHAR(3) | YES | `'SDG'` | Currency |
| `status` | TEXT | YES | `'pending'` | Request status |
| `payment_method` | TEXT | YES | NULL | Bank transfer, mobile money, etc. |
| `payment_details` | JSONB | YES | NULL | Account numbers, phone, etc. |
| `requested_at` | TIMESTAMPTZ | YES | `NOW()` | Request timestamp |
| `approved_by` | UUID | YES | NULL | Approver ID |
| `approved_at` | TIMESTAMPTZ | YES | NULL | Approval timestamp |
| `paid_at` | TIMESTAMPTZ | YES | NULL | Payment timestamp |
| `rejection_reason` | TEXT | YES | NULL | Why rejected |
| `notes` | TEXT | YES | NULL | Admin notes |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `user_id`
- INDEX on `status`
- INDEX on `requested_at DESC`

**Foreign Keys:**
- `user_id` → `profiles(id)` ON DELETE CASCADE
- `approved_by` → `profiles(id)` ON DELETE SET NULL

**Status Flow:**
```
pending → approved → paid
        ↘ rejected
```

---

#### **10. `site_visit_cost_submissions`**

Actual cost submissions by enumerators after site visits.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key |
| `site_visit_id` | UUID | YES | NULL | Associated site visit |
| `mmp_file_id` | UUID | YES | NULL | Source MMP |
| `project_id` | UUID | YES | NULL | Project context |
| `submitted_by` | UUID | YES | NULL | Submitter ID |
| `submitted_at` | TIMESTAMPTZ | YES | `NOW()` | Submission time |
| `transportation_cost_cents` | BIGINT | NO | `0` | Transport cost |
| `accommodation_cost_cents` | BIGINT | NO | `0` | Accommodation |
| `meal_allowance_cents` | BIGINT | NO | `0` | Meals |
| `other_costs_cents` | BIGINT | NO | `0` | Other expenses |
| `total_cost_cents` | BIGINT | NO | `0` | Auto-calculated total |
| `currency` | VARCHAR(3) | NO | `'SDG'` | Currency code |
| `transportation_details` | TEXT | YES | NULL | Transport justification |
| `supporting_documents` | JSONB | YES | `[]` | Receipt URLs |
| `status` | VARCHAR(20) | NO | `'pending'` | Approval status |
| `reviewed_by` | UUID | YES | NULL | Reviewer ID |
| `reviewed_at` | TIMESTAMPTZ | YES | NULL | Review time |
| `reviewer_notes` | TEXT | YES | NULL | Review comments |
| `wallet_transaction_id` | UUID | YES | NULL | Payment transaction |
| `paid_at` | TIMESTAMPTZ | YES | NULL | Payment time |
| `created_at` | TIMESTAMPTZ | YES | `NOW()` | Record creation |
| `updated_at` | TIMESTAMPTZ | YES | `NOW()` | Last update |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `site_visit_id`
- INDEX on `submitted_by`
- INDEX on `status`
- INDEX on `created_at DESC`

**Foreign Keys:**
- `site_visit_id` → `site_visits(id)` ON DELETE CASCADE
- `mmp_file_id` → `mmp_files(id)` ON DELETE SET NULL
- `project_id` → `projects(id)` ON DELETE SET NULL
- `submitted_by` → `profiles(id)` ON DELETE SET NULL
- `reviewed_by` → `profiles(id)` ON DELETE SET NULL
- `wallet_transaction_id` → `wallet_transactions(id)` ON DELETE SET NULL

**Constraints:**
- CHECK: `status` IN ('pending', 'under_review', 'approved', 'rejected', 'paid', 'cancelled')
- CHECK: All cost fields >= 0
- CHECK: `currency` IN ('SDG', 'USD', 'EUR', 'GBP', 'SAR', 'AED')

**Trigger:**
- `trg_calculate_total_cost` - Auto-calculates `total_cost_cents`

---

### **Project Management Tables**

#### **11. `projects`**

High-level project management.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key |
| `name` | TEXT | NO | - | Project name |
| `project_code` | TEXT | YES | NULL | Unique identifier |
| `description` | TEXT | YES | NULL | Project details |
| `project_type` | TEXT | YES | NULL | Type classification |
| `status` | TEXT | YES | `'draft'` | Project status |
| `start_date` | DATE | YES | NULL | Project start |
| `end_date` | DATE | YES | NULL | Project end |
| `budget` | JSONB | YES | NULL | Budget data |
| `location` | JSONB | YES | NULL | Geographic scope |
| `team` | JSONB | YES | NULL | Team members |
| `created_by` | UUID | YES | NULL | Creator ID |
| `created_at` | TIMESTAMPTZ | YES | `NOW()` | Creation time |
| `updated_at` | TIMESTAMPTZ | YES | `NOW()` | Last update |

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE on `project_code`
- INDEX on `status`
- INDEX on `created_by`

**Foreign Keys:**
- `created_by` → `profiles(id)` ON DELETE SET NULL

**Project Types:**
- `infrastructure`
- `survey`
- `compliance`
- `monitoring`
- `training`
- `other`

---

## Database Views

### **1. `pending_cost_approvals`**

Convenient view for finance team to see all pending cost submissions.

```sql
CREATE OR REPLACE VIEW pending_cost_approvals AS
SELECT 
  cs.*,
  p.full_name as submitter_name,
  p.email as submitter_email,
  sv.site_name,
  sv.status as site_visit_status,
  mf.name as mmp_name,
  proj.name as project_name,
  EXTRACT(DAY FROM (NOW() - cs.submitted_at)) as days_pending
FROM site_visit_cost_submissions cs
LEFT JOIN profiles p ON cs.submitted_by = p.id
LEFT JOIN site_visits sv ON cs.site_visit_id = sv.id
LEFT JOIN mmp_files mf ON cs.mmp_file_id = mf.id
LEFT JOIN projects proj ON cs.project_id = proj.id
WHERE cs.status IN ('pending', 'under_review')
ORDER BY cs.submitted_at ASC;
```

**Usage:**
```sql
-- Get all pending approvals
SELECT * FROM pending_cost_approvals;

-- Get approvals older than 3 days
SELECT * FROM pending_cost_approvals 
WHERE days_pending > 3;
```

---

## Relationships & Foreign Keys

### **Foreign Key Cascade Rules**

| Parent Table | Child Table | Column | ON DELETE | Reason |
|--------------|-------------|--------|-----------|--------|
| `profiles` | `user_roles` | `user_id` | CASCADE | Remove roles when user deleted |
| `profiles` | `wallets` | `user_id` | CASCADE | Remove wallet when user deleted |
| `roles` | `permissions` | `role_id` | CASCADE | Remove perms when role deleted |
| `mmp_files` | `mmp_site_entries` | `mmp_file_id` | CASCADE | Remove entries when MMP deleted |
| `mmp_files` | `site_visit_cost_submissions` | `mmp_file_id` | SET NULL | Keep submissions after MMP archived |
| `wallets` | `wallet_transactions` | `wallet_id` | CASCADE | Remove transactions with wallet |

---

## Database Indexes

### **Performance Indexes**

Critical indexes for query performance:

```sql
-- User lookups
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_employee_id ON profiles(employee_id);
CREATE INDEX idx_profiles_hub_id ON profiles(hub_id);

-- Role queries
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role);

-- MMP queries
CREATE INDEX idx_mmp_files_status ON mmp_files(status);
CREATE INDEX idx_mmp_files_uploaded_by ON mmp_files(uploaded_by);
CREATE INDEX idx_mmp_files_project_id ON mmp_files(project_id);

-- Financial queries
CREATE INDEX idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE INDEX idx_wallet_transactions_type ON wallet_transactions(type);
CREATE INDEX idx_wallet_transactions_created_at_desc ON wallet_transactions(created_at DESC);

-- Cost submissions
CREATE INDEX idx_cost_submissions_status ON site_visit_cost_submissions(status);
CREATE INDEX idx_cost_submissions_submitted_by ON site_visit_cost_submissions(submitted_by);
CREATE INDEX idx_cost_submissions_created_at_desc ON site_visit_cost_submissions(created_at DESC);
```

---

## Triggers & Functions

### **1. Auto-Calculate Total Cost**

Automatically calculates `total_cost_cents` when cost submission is inserted/updated.

```sql
CREATE OR REPLACE FUNCTION calculate_total_cost_submission()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_cost_cents := 
    COALESCE(NEW.transportation_cost_cents, 0) +
    COALESCE(NEW.accommodation_cost_cents, 0) +
    COALESCE(NEW.meal_allowance_cents, 0) +
    COALESCE(NEW.other_costs_cents, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calculate_total_cost
  BEFORE INSERT OR UPDATE OF transportation_cost_cents, accommodation_cost_cents, 
                              meal_allowance_cents, other_costs_cents
  ON site_visit_cost_submissions
  FOR EACH ROW
  EXECUTE FUNCTION calculate_total_cost_submission();
```

---

### **2. Update Timestamp**

Automatically updates `updated_at` timestamp on any row change.

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER trg_update_profiles_timestamp
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

## Row Level Security Policies

### **General Access Pattern**

All tables follow this RLS pattern:

1. **Admins bypass all checks** - Full access to everything
2. **Users see own data** - Can read/update their own records
3. **Role-based access** - Additional rules for specific roles

### **Example: `profiles` Table**

```sql
-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Admins can do anything
CREATE POLICY admin_all_access ON profiles
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'ict')
    )
  );

-- Users can read own profile
CREATE POLICY users_read_own ON profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Users can update own profile (limited fields)
CREATE POLICY users_update_own ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
```

---

### **Example: `site_visit_cost_submissions` Table**

```sql
ALTER TABLE site_visit_cost_submissions ENABLE ROW LEVEL SECURITY;

-- Admins and Financial Admins see all
CREATE POLICY finance_read_all ON site_visit_cost_submissions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'ict', 'financialAdmin', 'fom')
    )
  );

-- Users see only their own submissions
CREATE POLICY users_read_own_submissions ON site_visit_cost_submissions
  FOR SELECT
  TO authenticated
  USING (submitted_by = auth.uid());

-- Users can insert own submissions
CREATE POLICY users_create_own ON site_visit_cost_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (submitted_by = auth.uid());

-- Only finance can approve/reject
CREATE POLICY finance_update_status ON site_visit_cost_submissions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'financialAdmin', 'fom')
    )
  );
```

---

## Migration Guide

### **Applying the Migration**

The complete cost submission system migration is in:
```
supabase/migrations/20251123_cost_submission_system.sql
```

**To apply via Supabase Dashboard:**

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of migration file
3. Click "Run"
4. Verify success

**To apply via CLI:**
```bash
supabase db push
```

---

### **Creating New Migrations**

**Best Practices:**
1. **Never modify existing migrations** - Create new ones
2. **Test locally first** - Use local Supabase instance
3. **Use transactions** - Wrap in BEGIN/COMMIT
4. **Add rollback script** - For emergency reversals

**Example Migration:**
```sql
-- Migration: Add new column
-- Created: 2025-11-24

BEGIN;

-- Add column
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS department TEXT;

-- Create index
CREATE INDEX IF NOT EXISTS idx_profiles_department 
ON profiles(department);

-- Add comment
COMMENT ON COLUMN profiles.department IS 'User department assignment';

COMMIT;
```

---

## Troubleshooting

### **Common Issues**

#### **Issue: "pending_cost_approvals view not found"**

**Solution:**
```sql
-- Run this SQL in Supabase Dashboard
CREATE OR REPLACE VIEW pending_cost_approvals AS
SELECT 
  cs.*,
  p.full_name as submitter_name,
  p.email as submitter_email,
  sv.site_name,
  sv.status as site_visit_status,
  mf.name as mmp_name,
  proj.name as project_name,
  EXTRACT(DAY FROM (NOW() - cs.submitted_at)) as days_pending
FROM site_visit_cost_submissions cs
LEFT JOIN profiles p ON cs.submitted_by = p.id
LEFT JOIN site_visits sv ON cs.site_visit_id = sv.id
LEFT JOIN mmp_files mf ON cs.mmp_file_id = mf.id
LEFT JOIN projects proj ON cs.project_id = proj.id
WHERE cs.status IN ('pending', 'under_review')
ORDER BY cs.submitted_at ASC;
```

---

#### **Issue: "Permission denied for table X"**

**Cause:** RLS policy blocking access

**Solution:**
1. Check user role: `SELECT * FROM user_roles WHERE user_id = auth.uid();`
2. Review RLS policies: Check Supabase Dashboard → Authentication → Policies
3. Temporarily disable RLS (dev only): `ALTER TABLE X DISABLE ROW LEVEL SECURITY;`

---

#### **Issue: "Foreign key violation"**

**Cause:** Referenced record doesn't exist

**Solution:**
```sql
-- Check if parent exists
SELECT * FROM parent_table WHERE id = 'referenced-id';

-- If missing, create parent first or use NULL
```

---

#### **Issue: "Duplicate key value"**

**Cause:** Unique constraint violation

**Solution:**
```sql
-- Find existing record
SELECT * FROM table_name WHERE unique_column = 'value';

-- Update instead of insert, or change value
```

---

## Quick Reference

### **Essential Queries**

```sql
-- Get user's roles
SELECT r.* FROM user_roles ur
JOIN roles r ON r.id = ur.role_id
WHERE ur.user_id = 'user-uuid';

-- Get pending MMPs
SELECT * FROM mmp_files WHERE status = 'pending';

-- Get user wallet balance
SELECT balances FROM wallets WHERE user_id = 'user-uuid';

-- Get recent transactions
SELECT * FROM wallet_transactions 
WHERE user_id = 'user-uuid'
ORDER BY created_at DESC LIMIT 10;

-- Get pending cost approvals
SELECT * FROM pending_cost_approvals;
```

---

**Last Updated:** November 23, 2025  
**Maintained By:** PACT Development Team  
**Questions?** Contact your database administrator

---

*This guide is auto-generated from the live PACT database schema. For the most up-to-date information, always check the Supabase Dashboard.*
