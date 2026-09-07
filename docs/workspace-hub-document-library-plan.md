# Workspace Hub: document library and UI/UX draft

Status: Step 2–3 advanced (8 September 2026). Hub-only Admin restriction settled. Library + backfill migrations applied live; `r2-sign` and `workspace-guest` deployed.

## Product decision

Workspace Hub becomes the central place to find operational documents: site permits, payment receipts, site images, MMP files, project documents, reports, and supporting attachments. Existing business modules remain the source of their workflows; the hub indexes their documents rather than creating a second approval or payment system.

Separate category, priority, and visibility. Category describes the document. Priority indicates attention needed. Visibility controls access. A normal-priority receipt can still be Admin only.

Pending clarification: does Admin only apply to every document in the named categories, or selected sensitive documents? For this draft, conservatively propose all permits, receipts, site images, and MMP source documents default to Admin only. This is an assumption for review, not an applied policy. Other documents retain their existing authorized audience.

## What the repository establishes

- `src/pages/WorkspaceHub.tsx` already includes folders, file metadata, versions, sharing, guest access, and security-level UI. Build on these capabilities.
- `src/lib/workspaceHubLogic.ts` currently allows ownership, clearance, or explicit grants to qualify a file for visibility. This is not a strict admin-only check.
- `src/components/workspace/WorkspaceAccessGate.tsx` gives superadmins an automatic entry path; other users use workspace grants. Explicitly align admin entry with the new requirement.
- `src/utils/projectDocumentWorkspace.ts` mirrors project uploads into project/uploader folders and marks new records internal. New integration must preserve or strengthen classification, not reset it to internal.
- `src/lib/r2Storage.ts` exposes signed-URL helpers, including a documented one-hour GET lifetime. File delivery needs its own authorization review.
- Existing DESIGN.md provides PACT typography, colors, and component conventions. Reuse these rather than introduce another visual system.

These are source-code observations, not verification of deployed database policies or storage configuration.

## Access contract

1. Admin-only records are visible exclusively to authenticated admins and superadmins, within any applicable existing organizational scope.
2. Ownership, uploader status, clearance, folder grants, guest links, and direct shares cannot override this restriction.
3. Enforce access before returning metadata and before serving file bytes. Hiding a button is insufficient.
4. Non-admins see no restricted titles, thumbnails, counts, search suggestions, activity text, versions, or download links. Mixed folders show only permitted content and counts.
5. Protected folders impose a minimum restriction on descendants. Moving or copying a file, uploading a version, importing, or restoring from trash must not silently lower protection.
6. Admins and superadmins can view and download. Keep access-policy administration with superadmins initially, matching existing administrative separation; no general grant can expose Admin only content to another role.
7. Restricted documents cannot be shared externally. The UI explains this in the access panel. Source-module actions must enforce the same policy if the requirement is confidentiality across the application.
8. If operational users still need to submit permits/photos/receipts, preserve an authorized submission flow. Whether they can reopen their own submission is a separate decision; under strict admin-only visibility, submission does not grant read access.
9. Authorize at request time. Short-lived URLs limit exposure but remain usable until expiry; use an authenticated delivery endpoint if immediate revocation of issued access is required. Previously downloaded copies cannot be recalled.

## Information architecture

Keep the existing Workspace Hub route and application navigation. Within the hub:

- All documents, Recent, and Pinned are the main views.
- Categories: Site permits, Payment receipts, Site images, MMPs, Project documents, Reports, Other documents.
- Project, site, hub/state, and reporting period are filters, not several competing folder trees.
- Existing custom folders remain available through a secondary Folders section.
- Admin only is a saved filter visible to admins/superadmins, not a separate physical copy of files.
- Recycle bin and access administration remain secondary utilities.

A document appears once in the index and can be found through several views. Site and project links lead back to the originating record.

## Desktop UI

Physical usage assumption: operations staff review many records on office laptops in ordinary daylight. Use the existing light PACT surfaces, readable table density, and supported theme behavior.

Top row: Workspace Hub title, compact description, and one primary Upload documents action for authorized users. Avoid large metric cards above the library.

Left: compact library navigation with categories and folders. Omit inaccessible categories rather than showing locked placeholders or hidden-file totals.

Center: search field, Project / Site / Period / Category filters, sorting, and List / Gallery toggle. Default to a document list; gallery is useful for site images.

List columns: document name and type icon, category, linked project/site, reporting period or relevant document date, updated date, and access badge for authorized viewers. Secondary metadata belongs in the detail panel. Default sort: recently updated.

Selecting a row opens a right-hand detail panel while preserving filters and scroll position. Include preview, title, category, source link, relevant dates, uploaded by, visibility, and version history. Provide Download and Open source record actions when permitted. Unsupported previews show file details and an authorized download action.

Use a neutral lock badge labelled Admin only. Reserve warning colors for actual attention states such as an expired permit. Do not use five security colors as the primary navigation system.

## Key flows

Find a permit: choose Site permits, filter by project/site, open the document, review its expiry and source link, download if allowed.

Review a receipt: choose Payment receipts, filter by period/site, preview, and open the original payment record. The hub does not change payment approval status.

Browse site images: choose Site images, switch to gallery, filter by site/date, and open a larger preview with its source context. Authorize thumbnails as well as originals.

Upload: open an upload panel, select files, assign category and source context, show the resulting visibility before submission, and display per-file progress/retry. Batch metadata applies only when relevant to every selected file. Do not guess classification from the filename. Protected categories default to Admin only on the server.

Update: upload a new version on the existing document. Retain earlier versions and their protected access. Source-linked documents use the original module for workflow changes.

## Responsive and accessibility behavior

On narrow screens, collapse category navigation into a Library selector, place filters in a sheet, use compact document rows, and open details as a full-screen view. Avoid squeezing a desktop table into horizontal scrolling.

Provide keyboard navigation, visible focus, labelled filter controls, accessible preview titles, sufficient contrast, and touch-sized actions. Preserve applicable Arabic/RTL and localization patterns from the app.

Loading uses row skeletons. Empty categories explain how authorized users add documents. No-results views offer Clear filters. Failed loads offer Retry. Unauthorized deep links use a generic unavailable message without disclosing document details. Failed uploads preserve retryable selections.

## Implementation sequence and deliverables

### 1. Inventory and resolve access semantics

Map actual permit, receipt, image, MMP, and project-document records to upload code, database records, storage keys, and existing consumers. Review current role normalization, workspace entry, grants, live policies when available, public URLs, signing endpoints, and guest lookup paths. Confirm whole-application versus hub-only visibility and submission needs before changing permissions.

Deliverable: source mapping and agreed access cases. Do not relabel every legacy restricted/top_secret document blindly; existing meanings differ.

### 2. Add document metadata and access enforcement

Extend the existing document model with category, explicit audience, source type/id, linked project/site, relevant dates, and optional priority. Use a stable source attachment identifier to prevent duplicate indexing. Represent access explicitly rather than repurposing a clearance level that can be granted to other users.

Enforce the admin-only ceiling in record queries and file-delivery endpoints, then align the UI helpers. Cover versions, previews, exports, shares, archive/restore, and folder inheritance. Review permissive policy combinations and cached results. Clear protected client state after sign-out or role changes.

Deliverable: verified access behavior before opening the redesigned library.

### 3. Integrate and backfill existing documents

Start with one source category end to end, then extend to the others. Index existing storage references rather than uploading copies. Apply classification atomically with document creation. Make synchronization idempotent and recoverable, including updates and deletions. Produce a dry-run migration report; ambiguous records go to admin review, never automatic broad visibility. Reconcile counts against source records.

Deliverable: existing and new source documents appear once with correct provenance and access.

### 4. Build the library UI

Extract focused library navigation, filter toolbar, document list/gallery, detail panel, and upload components from WorkspaceHub. Reuse existing preview/version/storage behavior where compatible. Replace clearance-focused browsing with category and project/site browsing. Preserve custom folders and existing allowed workflows.

Deliverable: desktop and mobile flows for finding, opening, uploading, and revisiting documents.

### 5. Verify and release

Test admin, superadmin, ordinary staff, non-admin owner, explicitly granted non-admin, and guest. Verify UI and direct backend requests: list, search, preview, signed URL, download, old version, share lookup, export, and restore. A grant or ownership must not bypass Admin only.

Verify restricted filenames and counts do not leak, role changes clear UI state, updates preserve classification, repeated backfills do not duplicate records, and existing authorized non-sensitive documents remain available. Validate Arabic/RTL where supported and mobile/keyboard navigation.

Roll out behind a feature switch after backfill and access checks. UI rollback must retain the new security restrictions.

## First release boundary

Include document indexing, categories, filters/search, source links, list/gallery, previews, controlled uploads, and admin-only access. Reuse existing versions and recycle-bin behavior where verified. Defer OCR, AI tagging, new approval workflows, elaborate folder automation, and new external sharing capabilities.

## Decisions (settled, 8 September 2026)

1. **Whole-category Admin only in Workspace Hub** for Site permits, Payment receipts, Site images, and MMPs (not only selected files).
2. **Hub-only restriction** — admins and superadmins alone may find, open, preview, and download those categories through Workspace Hub (and hub guest/share/QR paths). Site visits, payments, MMP, Documents, and other source modules keep their existing access for authorized operational users.
3. **Submission unchanged** — non-admins continue uploading/submitting through source workflows; that does not grant them hub library access to Admin only categories.

Indexed hub copies are `audience = admin_only`. Do not tighten RLS on `report_photos`, payment tables, `mmp_files`, or blanket `document_index` SELECT for non-admins as part of this release.

---

## Step 1 inventory (live DB via Supabase MCP — 8 September 2026)

Project: `abznugnirnlrqnnfkein`. Status of local migration `20260907203839_workspace_document_library.sql`: **applied** (hub-only variant).

| Check | Live result |
|-------|-------------|
| `workspace_private` schema | present |
| `workspace_files.document_category` / `audience` / source columns | present |
| `workspace_storage_classification()` | present |
| `document_index` hub backfill | 326 rows → `admin_only` (318 site_image, 8 site_permit) |
| Existing hub uploads | 84 remain `other` / `workspace` |
| `workspace-files` bucket | private |
| `document_index` SELECT ceiling | not applied (source modules keep reading it) |

### Source volume map

| Category (plan) | Live source | Rows / attachments | Storage pointers | Notes |
|-----------------|-------------|--------------------|------------------|-------|
| Site images | `report_photos` (`deleted_at` null) | **3396** | `photo_url`, `storage_path` | Main volume. Any authenticated CRUD. |
| Site images (index) | `document_index` (`site_visit_photo`) | 318 | `file_url` | Partial index of visits; not a full mirror of `report_photos`. |
| Site permits | `federal` / `state` / `local` / `coordinator_locality_permits` | **0** | — | Tables empty. |
| Site permits (index) | `document_index` (`federal_permit`) | 8 | `file_url` | Orphaned relative to empty permit tables. |
| Payment receipts | `down_payment_requests.payment_proof_url` | **2845** non-empty | URL on row | Largest receipt source; not in hub yet. |
| Payment receipts | `operational_cost_submissions` | 120 proof + 58 `supporting_documents` | URL / JSON | Also `site_visit_cost_submissions.supporting_documents`. |
| Payment receipts | `acct_grn_receipts` | 0 | — | Empty. |
| MMPs | `mmp_files` | **14** | `file_path`, `file_url` | Read open to all; write/update more scoped; hub-scope restrictive exists alongside `mmp_files_all_auth`. |
| Project documents | `project_documents` | 1 | — | **RLS disabled** while a select policy exists (security advisor ERROR). |
| Project attachments | `project_field_task_attachments` | 4 | — | Small. |
| Hub library today | `workspace_files` (not archived) | **63** | R2 39 / Supabase 45 total incl. archived mix | No category/audience metadata live. |
| Parallel index | `document_index` | **326** | rich provenance columns | Already has category/source/project/site/period fields the hub migration plans to add on `workspace_files`. |
| HR docs (out of scope for first release) | `hr_employee_documents` | 7 | — | Do not auto-index into operational library. |

`document_index` is a ready-made provenance model (`source_type`, `source_table`, `source_id`, project/hub/site, dates). Prefer indexing **into** `workspace_files` (or a view over it) rather than teaching the hub UI to query two tables forever.

### Access gaps (must fix before library UI)

1. **Hub tables are effectively open:** `workspace_files_all` / folders / permissions / versions use `USING (true)` (or equivalent full authenticated access). UI clearance is not a security boundary.
2. **Public QR read** on `workspace_files` still allows anon SELECT of non-`restricted`/`top_secret` rows with `public_url`. Admin-only design must clear `public_url` and block guest share for protected categories (migration already plans this).
3. **`document_index_all_auth`:** any authenticated user full CRUD on the parallel index (including site photos and permit URLs).
4. **`report_photos`:** any authenticated insert/select/update/delete — site images are not admin-only today anywhere.
5. **Permit tables:** policies are `*_all_auth` (authenticated full access) though currently empty.
6. **`project_documents`:** RLS off — advisor critical; enable RLS only with verified policies, do not “flip on” blindly.
7. **`mmp_files`:** conflicting openness (`Allow read for all` + `mmp_files_all_auth`) vs hub-scope restrictive + admin bypass — tighten when classifying MMP as admin-only.
8. **Frontend ahead of DB:** `workspaceDocuments.ts` / hub filters already assume `audience` / `document_category`; live rows lack those columns, so library UI behavior is incomplete until migration.

### Backfill priority (recommended)

1. Apply library migration (columns + restrictive ceiling + storage classification RPC) after product sign-off on the three open decisions; coordinate Edge Functions (`r2-sign`, guest, extract).
2. Index `report_photos` → `site_image` / `admin_only` (idempotent on `source_type`+`source_id`).
3. Index payment proofs from `down_payment_requests` + operational cost supporting docs → `payment_receipt`.
4. Reconcile `document_index` rows into hub records (avoid duplicate URLs); treat the 8 federal_permit index rows carefully.
5. Index `mmp_files` and `project_documents` / field attachments.
6. Permits: wire create-time indexing when permit modules start writing rows.

### Migration / enforcement notes

- Restrictive RLS ceiling applies to **hub** `workspace_files` / folders / versions / comments / activity / permissions for Admin only content.
- Source tables (`report_photos`, payment proofs, `mmp_files`, `document_index`) were **not** locked down for non-admins.
- Storage object ceiling is limited to the `workspace-files` bucket only.
- Deploy updated `r2-sign` and `workspace-guest` so guest/QR paths honor Admin only.

### Still needed from product (blockers for step 2)

~~Settled — hub-only (see Decisions).~~
