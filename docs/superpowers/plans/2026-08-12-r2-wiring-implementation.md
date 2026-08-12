# Cloudflare R2 Wiring — Technical Implementation Plan

**Date:** 12 August 2026
**Precedes:** `2026-08-03-cloudflare-r2-rollout.md` (business rollout — this is the "Tuesday build" spec)
**Status:** R2 purchased. Nothing wired yet.

---

## Architecture (one paragraph)

Supabase stays the brain: auth, RLS, and the `workspace_files` metadata table don't move.
R2 becomes the byte store for **new** Workspace Hub uploads. The browser never holds R2
credentials — a single Supabase Edge Function (`r2-sign`) verifies the user's JWT and hands
back short-lived presigned URLs (PUT for upload, GET for download/preview); file bytes go
**browser ↔ R2 directly**, never through the function (edge functions have memory/time
limits; presigning avoids them entirely). A `storage_provider` column on `workspace_files`
('supabase' | 'r2') tells the frontend which path to use. Existing ~80GB stays in Supabase
until an optional bulk migration later — nothing breaks on day one.

```
upload:   browser ──POST /r2-sign (JWT)──► edge fn ──► presigned PUT URL
          browser ──PUT bytes────────────► R2
          browser ──insert row───────────► workspace_files (provider='r2')

download: browser ──POST /r2-sign (JWT)──► edge fn ──► presigned GET URL (1h)
          browser ──GET──────────────────► R2
```

## Phase 0 — Cloudflare dashboard (manual, ~15 min)

1. R2 → Create bucket `pact-workspace-archive` (location: automatic).
2. R2 → Manage API Tokens → create token **scoped to that bucket only**, permission
   "Object Read & Write". Record: Access Key ID, Secret Access Key, Account ID.
3. Bucket → Settings → CORS policy (required for browser uploads — without this you get
   "Failed to fetch" / fake CORS errors even when the signed URL is valid):
   ```json
   [{
     "AllowedOrigins": ["https://app.pactorg.com", "http://localhost:5173"],
     "AllowedMethods": ["GET", "PUT", "HEAD", "DELETE"],
     "AllowedHeaders": ["*"],
     "ExposeHeaders": ["ETag"],
     "MaxAgeSeconds": 3600
   }]
   ```
   Apply via dashboard **or**:
   `npx wrangler r2 bucket cors put pact-workspace-archive --file cors.json`
4. Keep the bucket **private** (no public access, no custom domain). All reads go through
   presigned GETs, so existing `security_level` / workspace access checks keep meaning something.
5. Client uploads must **not** send `Content-Type` while the URL only signs `host`
   (`X-Amz-SignedHeaders=host`). Sending an unsigned Content-Type → 401 SignatureDoesNotMatch.

## Phase 1 — Secrets + DB migration

- `supabase secrets set R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=pact-workspace-archive`
- Migration `20260812_workspace_files_storage_provider.sql`:
  ```sql
  ALTER TABLE workspace_files ADD COLUMN storage_provider text NOT NULL DEFAULT 'supabase';
  -- same column on the versions table if it stores its own storage_path
  ```
  Backfill needs nothing — default covers all existing rows.

## Phase 2 — Edge function `supabase/functions/r2-sign/index.ts`

One function, three actions in the request body. Use **aws4fetch** (`npm:aws4fetch`,
~2KB, Deno-native SigV4) — not the full AWS SDK.

| action | input | returns |
|--------|-------|---------|
| `sign-upload` | `key`, `contentType` | presigned PUT URL (15 min expiry) |
| `sign-download` | `key`, optional `filename` (Content-Disposition) | presigned GET URL (1h expiry) |
| `delete` | `key` | 204 (delete executed server-side with signed DELETE) |

Guards (trust boundary — not skippable):
- Verify Supabase JWT (standard `Authorization` header; reject anon).
- `key` must match `^[a-zA-Z0-9/_.-]+$` and must not contain `..`.
- For `sign-upload`: prefix the key server-side with the caller's user id
  (mirrors the existing `${currentUserId}/...` convention at WorkspaceHub.tsx:589)
  so users can't sign writes into other people's prefixes.
- For `delete`: look up the `workspace_files` row by storage_path with the caller's
  JWT-scoped client so RLS decides, then delete the object.

Endpoint: `https://<account_id>.r2.cloudflarestorage.com/<bucket>` with
`region: "auto"`.

## Phase 3 — Frontend: `src/lib/r2Storage.ts` + branch points

New tiny module wrapping `supabase.functions.invoke('r2-sign', ...)`:
`r2Upload(file, key, onProgress?)` (uses XHR for progress since fetch PUT has none),
`r2SignedUrl(key, filename?)`, `r2Delete(key)`.

Branch points (all check `storage_provider`):

| Location | Today | Change |
|----------|-------|--------|
| WorkspaceHub.tsx:589-606 `uploadOne` | supabase `.upload()` + `getPublicUrl` | presign → PUT to R2 → insert row with `storage_provider: 'r2'`, `public_url: null` |
| WorkspaceHub.tsx:914 download | `.download(storage_path)` | if r2: `window.open(await r2SignedUrl(path, name))` |
| WorkspaceHub.tsx:1094 version link | `createSignedUrl` | if r2: `r2SignedUrl` |
| WorkspaceHub.tsx:1517 + orphan cleanup (622, 636) | `.remove([path])` | if r2: `r2Delete(path)` |
| src/pages/FileViewer.tsx | supabase signed/public URL | same provider branch for the preview URL |

`public_url` is null for R2 rows — audit that FileViewer/preview paths never assume
it's set (they already handle signed URLs, so this should be a small check, not a rework).

## Phase 4 — Test checklist (maps to rollout plan's Wednesday)

- [ ] Upload PDF / DOCX / image / ~100MB file → row has `storage_provider='r2'`, object visible in R2 dashboard
- [ ] Folder upload (nested paths) still recreates structure
- [ ] Download + preview both providers side by side (old supabase file, new r2 file)
- [ ] Version history signed links work for r2 files
- [ ] Delete removes both the row and the R2 object; cancel-mid-upload cleans orphans
- [ ] Logged-out / wrong-permission call to `r2-sign` → 401/403
- [ ] Key traversal attempt (`../`, other user's prefix) → rejected

## Explicitly deferred (do NOT build now)

- **Bulk migration of existing 80GB** — separate pass, `rclone` from Supabase S3 endpoint
  to R2 + one SQL update of `storage_path`/`storage_provider`. Only when Mohamed asks.
- Custom domain / CDN in front of R2.
- Multipart upload for >5GB files (presigned PUT handles up to 5GB; nobody archives bigger).
- Provider abstraction layer — two providers, one `if`, that's fine.

## Effort

Phases 0–3 fit the rollout plan's single build day. Phase 2 is ~120 lines,
Phase 3 is ~80 lines plus five small branch edits.
