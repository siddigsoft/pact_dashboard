# Database Migration Guide: Moving Permits to New Supabase Database

**Date:** March 9, 2026  
**Target Database:** `abznugnirnlrqnnfkein` (Supabase)

---

## Overview

This guide provides step-by-step instructions for migrating the PACT permits system (tables, buckets, and data) from the current test database to a new production database. This ensures:

1. ✅ All permit tables are created correctly (state, local, federal)
2. ✅ Document index table is set up for the Documents page
3. ✅ Site visit photos are indexed
4. ✅ Storage buckets are created with proper RLS policies
5. ✅ All data is transferred safely
6. ✅ The Documents page continues to work perfectly

---

## Pre-Migration Checklist

Before starting the migration, ensure:

- [ ] You have access to both databases (old and new)
- [ ] Service role keys are available for both databases
- [ ] Node.js 18+ is installed
- [ ] No users are actively uploading/modifying documents during migration
- [ ] You have a backup of the old database

---

## Step 1: Install Dependencies

Ensure Supabase JS client is available:

```bash
cd /Users/sgeorge/Desktop/PACT\ CONSULTANCY/Pact_Dashboard/pact_dashboard
npm install @supabase/supabase-js
```

---

## Step 2: Update Environment Variables

### Option A: Replace .env (Recommended for testing)

If you want to test on the new database first:

```bash
cp .env .env.backup
cp .env.new-db .env
```

**Content of `.env.new-db`:**
```
VITE_SUPABASE_URL=https://abznugnirnlrqnnfkein.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiem51Z25pcm5scnFubmZrZWluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxMzU2OTEsImV4cCI6MjA3NDcxMTY5MX0.eAX9yrtgr05OVjAn_Wr2Koi92rMaV32EFj70DFfIgdM
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiem51Z25pcm5scnFubmZrZWluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTEzNTY5MSwiZXhwIjoyMDc0NzExNjkxfQ.1WIbmd3eCpB15YFYgd8-ujWN8zVujdk7Aqi3RPEiIs8
```

### Option B: Keep both (Recommended for production)

Keep the old database connection and add the new one as a separate variable:

```bash
# In .env, add:
NEW_SUPABASE_URL=https://abznugnirnlrqnnfkein.supabase.co
NEW_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Step 3: Run the Migration Script

The migration script will:
1. Create all tables (state_permits, local_permits, federal_permits, site_visit_photos, document_index)
2. Create storage buckets with RLS policies
3. Copy data from old database to new database
4. Verify everything worked

```bash
# Run the migration script
node scripts/migrate_permits_to_new_db.js
```

**Expected Output:**
```
================================================================================
PACT Database Migration Script
================================================================================
Old Database: https://bccvfqvntpiusqoaijfn.supabase.co
New Database: https://abznugnirnlrqnnfkein.supabase.co

[STEP 1/5] Creating tables and database structures...
[STEP 2/5] Creating storage buckets...
[STEP 3/5] Migrating permits data...
[STEP 4/5] Migrating site visit photos...
[STEP 5/5] Migrating document index...

Verifying migration...
✓ state_permits: 1 records
✓ local_permits: 2 records
✓ federal_permits: 0 records
✓ site_visit_photos: 5 records
✓ document_index: 13 records

MIGRATION COMPLETE
Permits migrated: 3
Site photos migrated: 5
Document index entries migrated: 13

Log saved to: migration-log-1710000000000.txt
```

---

## Step 4: Verify Tables Are Created Correctly

### Check via Supabase Dashboard

1. Go to https://supabase.com → Your new project (abznugnirnlrqnnfkein)
2. Navigate to **SQL Editor**
3. Check that these tables exist:
   - `state_permits`
   - `local_permits`
   - `federal_permits`
   - `site_visit_photos`
   - `document_index`

### Check via Terminal

```bash
# Using the migration script output, verify the count of records in each table
# You can also run SQL queries directly via Supabase dashboard
```

### Table Schema Checklist

**state_permits table should have:**
- id (uuid, primary key)
- mmp_id, mmp_name
- state, locality
- file_url, file_name
- uploaded_by, uploaded_at
- issue_date, expiry_date
- verified, status
- created_at, updated_at

**document_index table should have:**
- id (uuid, primary key)
- file_name, file_url
- category (mmp_file, federal_permit, state_permit, local_permit, site_visit_photo)
- uploaded_at, uploaded_by
- mmp_id, mmp_name
- project_id, state, locality
- status, verified
- source_table, source_id (for deduplication)
- metadata, tags

See [Full Table Schema](#full-table-schema) below for complete details.

---

## Step 5: Verify Storage Buckets

### Check Buckets via Supabase Dashboard

1. Go to **Storage** in Supabase dashboard
2. Verify these buckets exist and are public:
   - `state-permits`
   - `local-permits`
   - `federal-permits`
   - `coordinator-permits`
   - `site-visit-photos`
   - `monitoring_photos`

### Verify RLS Policies

For each bucket, check that these policies exist:
- `[bucket]_insert_auth` - Allow authenticated users to upload
- `[bucket]_select_auth` - Allow authenticated users to view
- `[bucket]_delete_auth` - Allow authenticated users to delete their own files

---

## Step 6: Update Application Configuration

Once migration is verified:

### Option A: Switch to New Database

```bash
# Replace .env with new database config
cp .env.new-db .env

# Restart dev server
npm run dev
```

### Option B: Keep Running on Old Database (Parallel Testing)

Keep the old database active while testing the new one in a separate environment.

---

## Step 7: Test the Documents Page

After switching to the new database, test the Documents page:

```bash
# Start development server
npm run dev

# In browser, go to http://localhost:5173/documents
```

### Test Cases

- [ ] All MMPs appear (should be 5)
- [ ] All permits appear (3 permits total)
  - [ ] 1 state permit
  - [ ] 2 local permits
  - [ ] 0 federal permits
- [ ] All site photos appear (should be 5-200)
- [ ] Filters work correctly (by category, state, etc.)
- [ ] Document count shows total of ~13 documents
- [ ] Can click on documents to view/download
- [ ] Search by name/project works

### If Documents Don't Appear

Run the rebuild script to re-index documents:

```bash
node scripts/rebuild_document_index.js
```

This will scan all MMPs, permits, photos, etc. and index them in the document_index table.

---

## Step 8: Sync Documents After Migration

After successfully migrating to the new database, rebuild the document index to ensure everything is properly indexed:

```bash
# This re-scans all source tables and indexes them
node scripts/rebuild_document_index.js
```

Expected output:
```
Indexing mmp_files...
  Processing permits for 1111: federal=0, state=1, local=2
Indexed state permit 9e763589-26cf-4db6-a2cc-552b1d0204a4-state-0
Indexed locality permit 9e763589-26cf-4db6-a2cc-552b1d0204a4-locality-0
Indexed locality permit 9e763589-26cf-4db6-a2cc-552b1d0204a4-locality-1
...
Rebuild complete
```

---

## Troubleshooting

### Issue: "Table does not exist" errors

**Solution:** The migration script might not have completed successfully. Check the migration log file and run the SQL migration manually via Supabase SQL Editor.

### Issue: Documents don't appear after switching databases

**Solution:** Run the rebuild script:
```bash
node scripts/rebuild_document_index.js
```

### Issue: "Permission denied" when uploading files

**Solution:** Check that the storage bucket policies are correctly created. In Supabase dashboard, go to Storage → Your bucket → Policies and verify:
```sql
CREATE POLICY "bucket_insert_auth"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'bucket-name');
```

### Issue: Data transfer failed

**Solution:** 
1. Check that the old database credentials are in .env correctly
2. Verify service role key has sufficient permissions
3. Check network connectivity to both databases
4. Try running the migration again with more verbose logging

---

## Step 9: Backup and Cleanup

### After successful migration:

```bash
# 1. Backup the migration log
mkdir -p backups
cp migration-log-*.txt backups/

# 2. Keep .env.backup safe
# 3. Archive old database credentials securely
# 4. Update documentation to reference new database
```

---

## Rollback Plan (If Something Goes Wrong)

If the migration doesn't work as expected:

```bash
# 1. Restore the old .env
cp .env.backup .env

# 2. Restart application
npm run dev

# 3. Application will continue using old database
```

---

## Full Table Schema

### state_permits
```sql
CREATE TABLE state_permits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mmp_id UUID,
  mmp_name TEXT,
  project_id UUID,
  site_visit_id UUID,
  state TEXT,
  locality TEXT,
  file_key TEXT,
  file_url TEXT,
  file_name TEXT,
  uploaded_by UUID,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  issue_date DATE,
  expiry_date DATE,
  verified BOOLEAN DEFAULT FALSE,
  status TEXT,
  source_meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### local_permits
Same structure as state_permits.

### federal_permits
```sql
CREATE TABLE federal_permits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mmp_id UUID,
  mmp_name TEXT,
  project_id UUID,
  file_key TEXT,
  file_url TEXT,
  file_name TEXT,
  uploaded_by UUID,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  issue_date DATE,
  expiry_date DATE,
  verified BOOLEAN DEFAULT FALSE,
  status TEXT,
  source_meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### site_visit_photos
```sql
CREATE TABLE site_visit_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_visit_id UUID,
  mmp_id UUID,
  mmp_name TEXT,
  project_id UUID,
  state TEXT,
  locality TEXT,
  site_name TEXT,
  file_key TEXT,
  file_url TEXT,
  caption TEXT,
  uploaded_by UUID,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  verified BOOLEAN DEFAULT TRUE,
  source_meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### document_index
```sql
CREATE TABLE document_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_url TEXT,
  file_size INTEGER,
  file_type TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by UUID,
  uploaded_by_name TEXT,
  project_id UUID,
  project_name TEXT,
  hub_id TEXT,
  hub_name TEXT,
  state TEXT,
  locality TEXT,
  mmp_id UUID,
  mmp_name TEXT,
  site_visit_id UUID,
  site_visit_code TEXT,
  cost_submission_id UUID,
  transaction_id UUID,
  month_bucket TEXT,
  issue_date DATE,
  expiry_date DATE,
  status TEXT DEFAULT 'pending',
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  verified_by UUID,
  signature_id TEXT,
  signed_at TIMESTAMPTZ,
  signed_by UUID,
  signature_method TEXT,
  source_type TEXT,
  source_table TEXT,
  source_id TEXT,
  metadata JSONB,
  checksum TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Post-Migration Checklist

- [ ] All tables created successfully
- [ ] All buckets created successfully
- [ ] Data migrated (permits, photos, document_index)
- [ ] RLS policies created for all buckets
- [ ] Tests pass:
  - [ ] Documents page loads
  - [ ] All documents/permits visible
  - [ ] Can filter by category
  - [ ] Can search by name
- [ ] Users can still upload files
- [ ] Users can download/view documents
- [ ] No data loss detected

---

## Support & Questions

If you encounter any issues during migration:

1. Check the migration log file: `migration-log-*.txt`
2. Review the troubleshooting section above
3. Check Supabase dashboard for any error messages
4. Verify service role key credentials

---

**Date Created:** March 9, 2026  
**Database URL:** https://abznugnirnlrqnnfkein.supabase.co  
**Status:** Ready for Migration
