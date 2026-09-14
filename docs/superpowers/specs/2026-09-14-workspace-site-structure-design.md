# Workspace Hub site structure (hybrid) — design

**Date:** 2026-09-14  
**Status:** Approved for planning (pending user review of this file)  
**Scope:** Make Workspace category views show site/project context like Documents; refill empty MMPs / Project documents / Reports pills without rewriting Workspace into a live multi-source registry.

## Problem

Workspace Hub lists files from denormalized `workspace_files`. Site/project only appear when `site_label` / `project_label` were written at index time. Documents resolves site at read time (`report_photos` → `reports` → `mmp_site_entries`).

Live checks (2026-09-14):

| Category | Hub rows | Missing `site_label` | Resolvable from source |
|---|---|---|---|
| Site images | ~3,681 | ~3,363 | ~3,358 of 3,363 via `report_photos` |
| Payment receipts | ~5,783 | all | all joined `down_payment_requests` (source_id `uuid:n`) |
| MMPs | 6 | all | sparse; R2 URLs skipped in prior backfill |
| Project documents | 0 | — | not indexed as `project_document` |
| Reports | 0 | — | site-visit photos indexed as `site_image`, not `report` |

UI symptoms: Site images collapsed under **Unknown site**; Payment receipts show **Unknown** with no site; MMPs / Project documents / Reports pills stay at 0 despite site reports existing in the DB.

## Decision

**Hybrid approach (phased):**

1. Keep `workspace_files` as the hub index.
2. Backfill labels from source joins (same resolution path Documents uses).
3. Fix writers so new inserts/upserts store labels.
4. Polish library UI to surface site · project · period.
5. Phase 2: correctly index MMPs, project documents, and true report documents.

Rejected alternatives:

- **Backfill-only:** regresses on every new upload.
- **Live joins every load:** accurate but heavy and fights the hub cache model for v1.

## Architecture

```
Source tables (reports, report_photos, down_payment_requests, mmp_files, project_documents, …)
        │
        ▼
 index / backfill writers  ──►  workspace_files (site_label, project_label, document_category, source_*)
        │
        ▼
 Workspace library UI (category pills, site gallery groups, list rows, filters)
```

No change to admin-only access rules for protected categories.

## Phase 1 — Labels + UI structure

### Data backfill

Idempotent SQL migration against `workspace_files` where `archived = false`:

**Site images (`document_category = 'site_image'`)**

- `source_type = 'report_photos'`: join `report_photos` → `reports` → `mmp_site_entries`.
  - `site_label` ← `mmp_site_entries.site_name` (fallback locality when name empty).
  - `project_label` ← MMP/hub name when available via linked MMP.
- `source_type = 'document_index'`: when `site_label` is null/blank/`Unknown Site`, resolve via the indexed photo’s underlying report/site entry when joinable; otherwise leave unchanged.

**Payment receipts (`document_category = 'payment_receipt'`)**

- `source_type = 'down_payment_requests'` with `source_id` format `uuid:index`.
- Join on `split_part(source_id, ':', 1) = down_payment_requests.id::text`.
- `site_label` ← `site_name`, else site entry name, else hub name.
- `project_label` ← hub/project fields available on the payment request / linked entry.

**Rules**

- Prefer filling empty labels; overwrite literal `Unknown Site` / blank when a better resolved name exists.
- Do not invent sites for rows that cannot join; residual Unknown is acceptable and should be tiny.
- Preserve `source_type` / `source_id` uniqueness; do not duplicate rows.

### Writers (no regression)

Any path that upserts photos or payment proofs into `workspace_files` (including `index_hub_source` / backfill helpers and payment-proof indexers) must write `site_label` and `project_label` at write time using the same joins as the migration.

### UI

Reuse existing Workspace library components (`WorkspaceHub`, `DocumentLibraryBrowse`, `DocumentLibraryFilters`, `workspaceDocuments` grouping):

- **Site images gallery:** group by resolved `site_label` (and project when present). Stop presenting the bulk as one Unknown site card.
- **List categories (receipts and others):** each row shows **site · project · period** when present (Documents-style context), not only uploader Unknown / relative date.
- **Filters:** Project / Site / Period continue to filter on the filled label columns; no new navigation tree.

Out of scope for Phase 1 UI: new IA, redesign of folders, changing admin-only policy.

## Phase 2 — Empty category pills

### MMPs

- Re-index `mmp_files` with `document_category = 'mmp'`.
- Allow R2 (and other) file URLs; remove Supabase-storage-only filter from backfill.
- `project_label` from hub / MMP name; site label only when a single clear site applies.

### Project documents

- Mirror/index path sets `document_category = 'project_document'` plus `project_label` (site when known).
- Backfill existing mirrored rows wrongly left as `other` / unlabeled.

### Reports (explicit product meaning)

| Pill | Contents |
|---|---|
| **Site images** | Photos from site visits (`report_photos` → `site_image`) |
| **Reports** | Actual report documents / indexed report files (`document_category = 'report'`), linked via site visit / site entry |

Do **not** reclassify the photo gallery into Reports. Backfill/index real report docs with site + project labels so the Reports pill is non-zero where source docs exist and rows are structured by site.

## Error handling & edge cases

- Unjoinable source rows remain Unknown; surface count in verification, do not block release.
- Composite payment `source_id` (`uuid:n`) must always split before join.
- Repeated migrations must be safe (idempotent upserts / conditional updates).
- Admin-only categories stay admin-only; label backfill must not widen audience.
- Display names that are still system hashes (e.g. batch_*.jpeg) may remain until a later naming pass; Phase 1 priority is site/project structure.

## Verification

**Phase 1**

- Site images gallery shows multiple site cards for known sites; Unknown residual is small.
- Payment receipt rows show real site names for joinable sources.
- Site / project filters return proper subsets.
- Spot-check: no duplicate `source_type`+`source_id` rows; new photo/receipt ingest writes labels without re-running migration.

**Phase 2**

- MMP / Project documents / Reports counts reflect source inventory (not stuck at 0 when sources exist).
- List/gallery for those categories shows site/project context.
- Photos remain under Site images; Reports holds report documents only.

## Non-goals

- Replacing Workspace with a full live Documents multi-source fetch on every load (can be a later hardening step).
- Changing payment approval workflows or source-of-truth modules.
- Renaming every historical file to human titles.
- Broad RLS / admin-only policy redesign.

## Implementation order

1. Phase 1 migration (label backfill) + writer fixes + UI label surfacing.
2. Verify Phase 1 against live counts and UI.
3. Phase 2 category indexing (MMP R2, project_document, report docs).
4. Verify Phase 2 pill counts and structure.

## Key code / DB touchpoints

- `src/pages/WorkspaceHub.tsx` — library load from `workspace_files`
- `src/lib/workspaceDocuments.ts` — category helpers, `groupSiteImages` Unknown fallback
- `src/components/workspace/DocumentLibraryBrowse.tsx` — list + gallery
- `src/components/workspace/DocumentLibraryFilters.tsx` — pills / filters
- `src/utils/projectDocumentWorkspace.ts` — project mirror category/labels
- Hub index/backfill SQL under `supabase/migrations/` (workspace document library)
- Source tables: `report_photos`, `reports`, `mmp_site_entries`, `down_payment_requests`, `mmp_files`, `project_documents`, `document_index`
