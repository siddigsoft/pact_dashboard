# Quick Start: Ad-hoc MMP Site Management

## What This Does

Create and manage **ad-hoc MMP site visits** with:
- ✅ Excel file upload (parses automatically)
- ✅ Manual site entry (no file needed)
- ✅ Edit sites before/after saving
- ✅ Track: site name, location, fees, assignments, status

## Database Tables Created

1. **`ad_hoc_mmp_files`** - Stores uploaded files
2. **`ad_hoc_mmp_site_entries`** - Stores individual sites

## Quick Test

### Test 1: Insert a Site (SQL)

```sql
-- Get your user ID first
SELECT id FROM auth.users WHERE email = 'your-email@example.com';

-- Insert a site (replace USER_ID)
INSERT INTO ad_hoc_mmp_site_entries (
    user_id, state, locality, site_name, 
    transport_fee, enumerator_fee
) VALUES (
    'YOUR_USER_ID',
    'Kassala',
    'Madeinat Kassala',
    'Al Nour School',
    20000,
    20000
);

-- Verify
SELECT * FROM ad_hoc_mmp_site_entries;
```

### Test 2: Upload Excel File

1. **Prepare Excel** with columns:
   ```
   Site Name | Code | State | Locality | Transport | Enum. Fee
   Al Nour   | AN1  | Kassala | Town   | 20000    | 20000
   ```

2. **Upload** in the app
3. **Click** "Create X Site Visits"
4. **Check** database - sites are saved!

## UI Workflows

### Workflow A: Upload Excel
```
1. Click "Upload MMP"
2. Select Excel file
3. System parses → shows row count
4. Edit rows if needed (inline table)
5. Click "Create X Site Visits"
6. ✓ Saved to database!
```

### Workflow B: Manual Entry
```
1. Click "Add Site Manually"
2. Fill in site details
3. Click "Add to List"
4. Repeat for all sites
5. Fill month/state/locality
6. Click "Create X Site Visits"
7. ✓ Saved to database!
```

### Workflow C: Edit After Creation
```
1. Go to "Site Tracking" tab
2. Find your site in the table
3. Click "Edit" button
4. Change status/fees/assignments
5. Click "Save"
6. ✓ Database updated!
```

## Status Workflow

```
dispatched → assigned/claimed → completed → verified
   ↓              ↓                ↓           ↓
  New     →    Assigned    →   Done    →  Confirmed
```

## Common Operations

### Update Site Status
```sql
UPDATE ad_hoc_mmp_site_entries 
SET status = 'verified'
WHERE id = 'site-id' 
  AND user_id = 'your-user-id';
```

### List All Your Sites
```sql
SELECT * FROM ad_hoc_mmp_site_entries 
WHERE user_id = 'your-user-id'
ORDER BY created_at DESC;
```

### List Sites by Status
```sql
SELECT status, COUNT(*) 
FROM ad_hoc_mmp_site_entries 
WHERE user_id = 'your-user-id'
GROUP BY status;
```

### Delete Site (Soft Delete)
```sql
UPDATE ad_hoc_mmp_site_entries 
SET deleted_at = NOW()
WHERE id = 'site-id' 
  AND user_id = 'your-user-id';
```

## Files Created

```
MMP Tables
  ├── supabase/migrations/20260429_ad_hoc_mmp_tables.sql
  ├── TEST_MMP_MANUAL.sql
  
Frontend
  ├── src/components/mmp/AdHocMmpUploadForm.tsx
  ├── src/components/mmp/AdHocMmpSiteList.tsx
  ├── src/services/adHocMmp.service.ts
  ├── src/types/tables/adHocMmp.ts
  └── src/pages/AdHocMmpManagement.tsx

Docs
  ├── AD_HOC_MMP_SETUP.md
  └── FIXES_SUMMARY.md
```

## Troubleshooting

### Issue: "auth.uid() is null" in SQL Editor
**Cause:** SQL Editor runs without user context  
**Fix:** Use actual user ID or create via app

### Issue: Sites not appearing in UI
**Cause:** Row Level Security (RLS)  
**Fix:** Make sure you're logged in as the user who created them

### Issue: File upload fails
**Cause:** File > 50MB or wrong format  
**Fix:** Use Excel (.xlsx) under 50MB

### Issue: Can't edit site
**Cause:** RLS policy or wrong user  
**Fix:** Only site creator can edit

## Key Features

✅ **Excel Upload** - Auto-parse, validate, create  
✅ **Manual Entry** - Add sites without file  
✅ **Inline Edit** - Edit before/after saving  
✅ **Bulk Operations** - Create/update multiple  
✅ **Status Tracking** - dispatched → verified  
✅ **Fee Tracking** - Transport + enumerator fees  
✅ **Assignment** - Assign to enumerators  
✅ **Due Dates** - Track deadlines  
✅ **Security** - RLS enforced  
✅ **Audit Trail** - Soft delete, timestamps  

## Support

- Check `FIXES_SUMMARY.md` for detailed info
- Check `AD_HOC_MMP_SETUP.md` for setup guide
- Check `TEST_MMP_MANUAL.sql` for test queries
- Review console for JavaScript errors
- Check network tab for API failures
