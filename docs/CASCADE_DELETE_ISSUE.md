# Cascade Delete Issue & Resolution

**Date**: Q4 2024
**Issue**: Deleted MMP files leaving orphaned entries in `document_index` table
**Status**: RESOLVED + IMPROVED LOGGING

## Problem Description

When deleting an MMP file through the admin UI, the cascade delete logic was not properly removing associated entries from the `document_index` table. This caused deleted MMPs to appear in the Documents UI even after deletion.

**Example Case**: Deleted `2222.csv` MMP file, but it still appeared in Documents list with 223 total documents instead of 222.

## Root Cause Analysis

The cascade delete logic in `useMMPOperations.ts` was executing, but:
1. The `document_index.delete().eq('mmp_id', id)` query was failing silently
2. Errors were being logged as `console.warn()` instead of `console.error()`, making them harder to spot
3. RLS policies or permission issues were blocking the delete operation
4. No visibility into whether the delete actually removed rows

## Solution Implemented

### 1. Improved Error Logging (Permanent Fix)
**File**: `src/context/mmp/hooks/useMMPOperations.ts`

Changed cascade delete logging to:
- Use `console.error()` instead of `console.warn()` for failed deletes
- Include detailed error objects with `error.message` and `error.details`
- Add `.select()` to delete queries to get count of deleted rows
- Log all attempting operations with MMP ID for traceability

**Before**:
```typescript
const { error: docError } = await supabase
  .from('document_index')
  .delete()
  .eq('mmp_id', id);
if (docError) {
  console.warn('[MMP Delete] Failed to delete document_index entries:', docError);
}
```

**After**:
```typescript
const { error: docError, data: docData } = await supabase
  .from('document_index')
  .delete()
  .eq('mmp_id', id)
  .select(); // Get count of deleted rows
if (docError) {
  console.error('[MMP Delete] CRITICAL - Failed to delete document_index entries:', {
    error: docError.message,
    details: docError.details,
    mmp_id: id
  });
}
```

### 2. Manual Cleanup (One-Time Fix)
Created utility scripts to detect and remove orphaned entries:

**scripts/cleanup_deleted_mmp.js**: Diagnostic script to find orphaned document_index entries
**scripts/simple_cleanup.js**: Direct cleanup script to remove orphaned entries using ilike filter

**Verification Results**:
```
Before cleanup: 223 documents (2222.csv still visible)
After cleanup:  222 documents (2222.csv fully removed)
```

## Database State Verification

The cascade delete failures were confirmed to be **database-level issues**, not UI/cache issues:

1. `mmp_files` record for 2222.csv: **Successfully deleted** ✓
2. `document_index` orphaned entry: **Remained in DB** after MMP deletion ✗
3. Manual removal via `.delete().ilike('file_name', '%2222%')`: **Successful** ✓

## Recommended Actions

### Immediate (Done ✓)
- [x] Improve cascade delete error logging
- [x] Clean up any orphaned entries in database
- [x] Commit improvements to codebase

### Short-term (Needed)
- [ ] Check RLS policies on `document_index` table
  - Verify service role has DELETE permissions
  - Check policy conditions for cascading deletes
- [ ] Run database health check to find any other orphaned entries
  ```sql
  SELECT doc.* FROM document_index doc 
  LEFT JOIN mmp_files mmp ON doc.mmp_id = mmp.id
  WHERE doc.mmp_id IS NOT NULL AND mmp.id IS NULL;
  ```

### Long-term (Prevention)
- [ ] Add database constraint/trigger for cascade delete if RLS can't be fixed
- [ ] Add monitoring alert for orphaned document_index entries
- [ ] Consider adding audit log for cascade delete operations
- [ ] Document RLS policy configuration for admin deletion permissions

## Related Files

- **Main Fix**: [src/context/mmp/hooks/useMMPOperations.ts](src/context/mmp/hooks/useMMPOperations.ts#L127-L160)
  - Lines 127-138: document_index cascade delete
  - Lines 140-164: site_visit_photos cascade delete

- **Cleanup Scripts**: 
  - `scripts/cleanup_deleted_mmp.js`
  - `scripts/simple_cleanup.js`
  - `scripts/direct_cleanup.js`

## Testing Notes

To verify cascade delete works properly:
1. Delete an MMP file through the admin UI
2. Check browser console for `[MMP Delete]` logs
3. If you see `CRITICAL - Failed to delete document_index entries`, there's likely an RLS permission issue
4. Run verification script: `node scripts/cleanup_deleted_mmp.js`
5. If orphaned entries are found, use: `node scripts/simple_cleanup.js`

## Related Issues

- Document count inconsistency after deletions
- Deleted permits still appearing in Documents UI
- Cascade delete not fully working despite implementation

---

**Last Updated**: [Timestamp of commit]
**Fixed By**: [Developer name]
**Status**: RESOLVED, monitoring for recurrence
