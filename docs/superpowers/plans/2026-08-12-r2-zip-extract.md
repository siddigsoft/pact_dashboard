# Workspace Hub — Server-side ZIP Extract (≤100MB)

**Date:** 12 August 2026  
**Depends on:** R2 wiring (`r2-sign`, `storage_provider`)  
**Status:** Shipped (migration applied, `r2-extract` deployed, UploadDialog wired)

## Flow

```
Upload .zip with "Extract into this folder" ON
  → PUT zip to R2 (r2-sign)
  → insert workspace_files (extract_status='pending')
  → POST /r2-extract { zipKey, folderId, securityLevel, zipFileId }
  → edge fn streams zip from R2, unpacks entries, PUTs each to R2,
     creates workspace_folders + workspace_files
  → zip row extract_status='done' | 'failed'
```

## Limits

- Max zip size: **100 MB**
- Max entries: **500** files
- Format: `.zip` only
- Skip: `__MACOSX/`, `.DS_Store`, directory-only entries
- Reject path traversal (`..`, absolute paths)

## Secrets

Same as `r2-sign`: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
