# Runbook: Equipment & Asset Tracking Module (Task #82)

## Summary
Adds two tables to track organizational assets and their assignment history per employee.

## Tables

### `hr_assets`
The central asset registry. One row per physical or digital asset.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | auto-generated |
| asset_type | text | laptop, phone, access_card, sim_card, software_license, vehicle, tablet, camera, radio, generator, other |
| name | text | human-readable name e.g. "Dell Latitude 5420 #3" |
| serial_number | text | manufacturer serial |
| model | text | model string |
| purchase_date | date | |
| purchase_value | numeric(14,2) | cost in local/USD |
| current_condition | text | excellent / good / fair / damaged |
| status | text | available / assigned / maintenance / retired |
| notes | text | |
| created_by | uuid → profiles | who added the record |
| hub_id | uuid → hubs | optional hub scoping |
| created_at / updated_at | timestamptz | |

### `hr_asset_assignments`
One row per assignment event. A returned asset creates a new row with `returned_date` filled.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| asset_id | uuid → hr_assets | |
| user_id | uuid → profiles | assigned employee |
| assigned_date | date | |
| returned_date | date | null = still outstanding |
| condition_at_assignment | text | |
| condition_at_return | text | |
| notes | text | |
| assigned_by | uuid → profiles | HR staff who made assignment |
| created_at / updated_at | timestamptz | |

## Migration

Apply in Supabase SQL Editor or via CLI:

```bash
supabase db push
# or
psql -h <host> -U postgres -d postgres -f supabase/migrations/20250715_hr_assets.sql
```

## RLS Summary
- `hr_assets`: all authenticated users can SELECT; admin/super_admin/hr_admin/ict can INSERT/UPDATE/DELETE
- `hr_asset_assignments`: users can SELECT their own rows; admins can SELECT all; only admins can INSERT/UPDATE/DELETE

## Verify

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('hr_assets','hr_asset_assignments');

-- Check RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename IN ('hr_assets','hr_asset_assignments');

-- Sample query: all active assignments
SELECT a.name, a.asset_type, p.full_name, aa.assigned_date
FROM hr_asset_assignments aa
JOIN hr_assets a ON a.id = aa.asset_id
JOIN profiles p ON p.id = aa.user_id
WHERE aa.returned_date IS NULL;
```

## Offboarding Integration
When an employee's offboarding is initiated, the Offboarding page will automatically
query `hr_asset_assignments` filtered by `user_id` and `returned_date IS NULL`.
Assets must be marked as returned before the offboarding can be marked "Complete"
(HR admin override allowed with confirmation).

## UI Entry Points
- **HR Hub → People & Development → Equipment & Assets** — full registry + admin management
- **User Profile → Background → Equipment** — per-employee view of assigned assets
- **Offboarding → Equipment Clearance card** — inline return workflow
