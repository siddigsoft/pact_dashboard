# Apply Down-Payment Migration to Supabase

## ⚠️ IMPORTANT: Migration Required

The down-payment request system tables exist in your **local development database** but need to be applied to your **Supabase cloud database** where the frontend connects.

## Quick Fix: Apply Migration in Supabase

### Option 1: Using Supabase Dashboard (Recommended)

1. **Go to your Supabase Dashboard**: https://supabase.com/dashboard/project/YOUR_PROJECT_ID
2. **Navigate to**: SQL Editor (left sidebar)
3. **Click**: "+ New query"
4. **Copy and paste** the entire contents of `supabase/migrations/20251125_down_payment_and_super_admin_system.sql`
5. **Click**: "Run" button
6. **Wait** for "Success" message
7. **Refresh** your PACT app - errors should be gone!

### Option 2: Using Supabase CLI (Advanced)

If you have Supabase CLI installed:

```bash
# Link to your project (one-time setup)
supabase link --project-ref YOUR_PROJECT_REF

# Push all pending migrations
supabase db push

# Or push specific migration
supabase db push --include-migrations 20251125_down_payment_and_super_admin_system
```

## What This Migration Creates

✅ **4 New Tables:**
- `down_payment_requests` - Two-tier approval workflow
- `cost_adjustment_audit` - Complete cost modification tracking
- `super_admins` - Maximum 3 active accounts (database-enforced)
- `deletion_audit_log` - Tracks all deletions

✅ **Enhanced Table:**
- `site_visit_costs` - Adds `cost_status`, `calculated_by`, `calculation_notes`

✅ **Security:**
- Row Level Security (RLS) policies for all tables
- Database triggers enforcing 3-account limit
- Audit trail for all modifications

## Verification

After applying the migration, refresh your app and check:
- No more "Could not find table" errors in browser console
- Down-payment request features work correctly
- All new tables are accessible

## Need Help?

If you encounter any issues:
1. Check Supabase Dashboard → Database → Tables (you should see 4 new tables)
2. Check SQL Editor → Query history for any error messages
3. Ensure you're connected to the correct project

---

**Migration File Location**: `supabase/migrations/20251125_down_payment_and_super_admin_system.sql`
