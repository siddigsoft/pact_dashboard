# PACT Database Migration Guide

## Overview

This guide explains how to migrate your PACT application to work with a new Supabase database that uses `mmp_site_entries` instead of the traditional `site_visits` table structure.

---

## Database Schema Compatibility

Your new Supabase database has **33 tables** with enhanced features:

### ✅ Core Tables (Compatible)
- `profiles` - User accounts and authentication
- `mmp_files` - Monthly Monitoring Plans
- `mmp_site_entries` - **Site visit details (replaces site_visits)**
- `projects` - Project information
- `user_roles` - Role assignments
- `dashboard_settings` - Dashboard preferences
- `data_visibility_settings` - Visibility controls
- `user_settings` - User preferences
- `notifications` - User notifications

### ➕ Enhanced Features (New Tables)
- **Chat System**: `chats`, `chat_messages`, `chat_participants`, `chat_message_reads`
- **Wallet System**: `wallets`, `wallet_transactions`, `payout_requests`, `wallet_settings`
- **Monitoring**: `comprehensive_monitoring_checklists`
- **Safety & Reports**: `safety_checklists`, `reports`, `report_photos`
- **Location Tracking**: `location_logs`, `site_locations`
- **Others**: `feedback`, `incident_reports`, `equipment`

---

## Migration Steps

### Step 1: Run the SQL Migration

Execute the migration file in your Supabase SQL Editor to add the missing tables:

**File**: `supabase/migrations/20250122_add_missing_tables.sql`

This migration adds:
1. **`site_visits` table** - For backwards compatibility and assignment tracking
2. **`archive_settings` table** - For archive functionality
3. **`field_team_settings` table** - For field team preferences

**To run:**
1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Copy the contents of `supabase/migrations/20250122_add_missing_tables.sql`
4. Paste and click **Run**

### Step 2: Verify Table Creation

After running the migration, verify the tables were created:

```sql
-- Check if site_visits table exists
SELECT * FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'site_visits';

-- Check if other tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('archive_settings', 'field_team_settings');
```

### Step 3: Update Supabase Credentials

Your Supabase credentials have been configured via Replit Secrets:
- `VITE_SUPABASE_URL` - Your new project URL
- `VITE_SUPABASE_ANON_KEY` - Your new anon/public key

The application will automatically use these credentials on restart.

### Step 4: Restart the Application

The application workflow has been restarted to use the new database connection.

---

## How the Application Handles Both Tables

### Dual-Table Strategy

The application has been modified to work with **both** `site_visits` and `mmp_site_entries` tables:

### Automatic Fallback for Standalone Visits

**NEW**: If the `site_visits` table doesn't exist and you create a standalone visit (without MMP context), the application will:

1. **Auto-create a default MMP file** named `"Standalone Site Visits (Auto-generated)"`
2. **Link the visit** to this default MMP file
3. **Store the visit** in `mmp_site_entries` table
4. **Reuse** the same default MMP file for all future standalone visits

This ensures that:
- ✅ You can create site visits **without running the migration**
- ✅ All visits satisfy the `mmp_site_entries` foreign key requirement
- ✅ Standalone visits are grouped under a recognizable default MMP
- ✅ No functionality is lost when `site_visits` table is missing

**Important**: Monitor the logs for any unique-key conflicts during concurrent writes. If multiple users create standalone visits simultaneously, the system will automatically reuse the existing default MMP file.

#### Data Fetching Priority:
1. **Primary**: Query `site_visits` table first
2. **Fallback**: If `site_visits` is empty or doesn't exist, query `mmp_site_entries`
3. **Adapter Layer**: `mmpSiteEntriesAdapter.ts` maps `mmp_site_entries` data to `SiteVisit` format

#### Data Flow:

```
┌─────────────────────────────────────────────────────────────┐
│                  PACT Application Layer                      │
│                  (Uses SiteVisit interface)                 │
└─────────────────┬───────────────────────────────────────────┘
                  │
        ┌─────────▼──────────┐
        │  fetchSiteVisits() │
        └─────────┬──────────┘
                  │
        ┌─────────▼──────────────────────────────┐
        │  Try site_visits table first           │
        │  (Traditional workflow tracking)        │
        └─────────┬──────────────────────────────┘
                  │
                  │ If empty or doesn't exist
                  │
        ┌─────────▼──────────────────────────────┐
        │  Fallback to mmp_site_entries          │
        │  (MMP-based site visit data)           │
        └─────────┬──────────────────────────────┘
                  │
        ┌─────────▼──────────────────────────────┐
        │  mmpSiteEntriesAdapter maps data to    │
        │  SiteVisit format                      │
        └────────────────────────────────────────┘
```

### Table Relationship

```
mmp_files (MMP Upload)
    │
    ├─── mmp_site_entries (Site details from MMP)
    │         │
    │         └─── Can create → site_visits (Assignment tracking)
    │
    └─── Direct query for site visit list
```

---

## Field Mapping

### `mmp_site_entries` → `SiteVisit` Mapping

| mmp_site_entries | SiteVisit Interface | Notes |
|------------------|---------------------|-------|
| `id` | `id` | Primary key |
| `site_name` | `siteName` | Site name |
| `site_code` | `siteCode` | Unique site code |
| `status` | `status` | Mapped: "Pending"→"pending", "Completed"→"completed" |
| `locality` | `locality` | Locality/district |
| `state` | `state` | State/region |
| `activity_at_site` | `activity`, `siteActivity` | Activity type |
| `main_activity` | `mainActivity` | Main activity |
| `visit_date` | `dueDate`, `scheduledDate` | Scheduled date |
| `cost` | `fees.total` | Total fee |
| `enumerator_fee` | `fees.baseFee` | Enumerator fee |
| `transport_fee` | `fees.transportation` | Transport fee |
| `hub_office` | `hub`, `hubOffice` | Hub location |
| `cp_name` | `cpName` | Cooperation Partner name |
| `monitoring_by` | `monitoringBy` | Monitoring organization |
| `survey_tool` | `surveyTool` | Survey tool used |
| `use_market_diversion` | `useMarketDiversion` | Market diversion flag |
| `use_warehouse_monitoring` | `useWarehouseMonitoring` | Warehouse monitoring flag |
| `comments` | `notes`, `description` | Comments/notes |
| `additional_data` | Various (coordinates, arrival data) | JSON data |
| `verified_by` | `permitDetails.verifiedBy` | Verifier |
| `verified_at` | `permitDetails.verifiedAt` | Verification timestamp |
| `dispatched_by` | `assignedBy` | Assignment by |
| `dispatched_at` | `assignedAt` | Assignment timestamp |
| `mmp_files` (join) | `mmpDetails` | MMP metadata |

---

## File Structure Changes

### New Files Created:

1. **`supabase/migrations/20250122_add_missing_tables.sql`**
   - SQL migration to add missing tables
   - Creates `site_visits`, `archive_settings`, `field_team_settings`
   - Includes RLS policies and indexes

2. **`src/context/siteVisit/mmpSiteEntriesAdapter.ts`**
   - Adapter layer for mapping `mmp_site_entries` to `SiteVisit` format
   - Functions: `mapMMPSiteEntryToSiteVisit`, `fetchSiteVisitsFromMMPEntries`
   - Handles status mapping and field transformation

### Modified Files:

1. **`src/context/siteVisit/supabase.ts`**
   - Updated `fetchSiteVisits()` to try both tables
   - Fallback logic: `site_visits` → `mmp_site_entries`
   - Error handling for missing tables

---

## Testing the Migration

### 1. Check Database Connection

```javascript
// In browser console
const { data, error } = await supabase.from('profiles').select('count');
console.log('Connection:', error ? 'Failed' : 'Success');
```

### 2. Verify Site Visits Load

- Navigate to the Operations Zone in the dashboard
- The site visits table should load data from either:
  - `site_visits` table (if populated)
  - `mmp_site_entries` table (fallback)

### 3. Check Browser Console

Look for these log messages:
- ✅ `"Connection: Success"` - Database connection works
- ✅ `"site_visits table is empty, fetching from mmp_site_entries"` - Fallback working
- ❌ `"Error fetching site visits:"` - Connection issue

---

## Troubleshooting

### Issue: "Table does not exist" Error

**Cause**: Migration not run or incomplete

**Solution**:
1. Run the migration SQL in Supabase SQL Editor
2. Verify tables exist with query above
3. Restart the application

### Issue: No site visits showing

**Cause**: Both tables are empty

**Solution**:
1. Upload an MMP file to populate `mmp_site_entries`
2. Or create site visits manually via the UI
3. Check browser console for error messages

### Issue: Data not updating

**Cause**: Cached queries or RLS policies

**Solution**:
1. Clear browser cache and hard refresh
2. Check RLS policies allow your user to view data
3. Verify your user's role has proper permissions

---

## Row Level Security (RLS)

All tables have RLS enabled. Ensure your user profile has:

1. **Status**: `active` (not `pending`)
2. **Role**: One of: `admin`, `ict`, `fom`, `supervisor`, `coordinator`, `dataCollector`
3. **Profile exists** in `profiles` table

### Check Your Access:

```sql
-- Check your profile
SELECT id, email, full_name, role, status 
FROM profiles 
WHERE id = auth.uid();

-- Check your roles
SELECT ur.role, r.display_name 
FROM user_roles ur
LEFT JOIN roles r ON ur.role_id = r.id
WHERE ur.user_id = auth.uid();
```

---

## Next Steps

1. ✅ Run the SQL migration
2. ✅ Verify tables are created
3. ✅ Test site visits loading
4. ✅ Upload an MMP file to populate data
5. ✅ Verify Operations Zone displays data correctly

---

## Support

If you encounter issues:

1. Check browser console for error messages
2. Verify Supabase credentials are correct
3. Confirm migration SQL ran successfully
4. Check RLS policies and user permissions
5. Review the adapter mapping logic in `mmpSiteEntriesAdapter.ts`

---

## Technical Details

### Adapter Pattern

The application uses the **Adapter Pattern** to provide a unified interface for two different table structures:

```typescript
// Adapter exports
export const fetchSiteVisitsFromMMPEntries: () => Promise<SiteVisit[]>
export const mapMMPSiteEntryToSiteVisit: (entry: MMPSiteEntry) => SiteVisit
export const createMMPSiteEntry: (mmpFileId, siteVisit) => Promise<SiteVisit>
export const updateMMPSiteEntry: (id, updates) => Promise<SiteVisit>
export const deleteMMPSiteEntry: (id) => Promise<boolean>
```

### Status Mapping

| Database Status | Application Status |
|-----------------|-------------------|
| Pending | pending |
| Assigned | assigned |
| In Progress | inProgress |
| Completed | completed |
| Cancelled | cancelled/canceled |
| Verified | permitVerified |

---

## Conclusion

Your PACT application now supports both the traditional `site_visits` table and the new `mmp_site_entries` table structure. The adapter layer ensures seamless operation regardless of which table contains your data.

The dual-table approach provides:
- ✅ Backwards compatibility
- ✅ Flexibility for different database schemas
- ✅ Seamless user experience
- ✅ Enhanced MMP integration
