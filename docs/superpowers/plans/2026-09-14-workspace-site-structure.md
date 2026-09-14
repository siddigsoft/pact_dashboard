# Workspace Hub Site Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Workspace category views show real site/project structure (like Documents) by backfilling `workspace_files` labels, fixing writers, polishing library display, then filling MMPs / Project documents / Reports pills correctly.

**Architecture:** Hybrid index model. Keep `workspace_files` as the hub cache. Phase 1 backfills `site_label` / `project_label` from source joins and normalizes Unknown-site grouping in the UI. Phase 2 re-indexes MMPs (incl. R2), sets `project_document` on project mirrors, and indexes true report documents as `report` (photos stay `site_image`). Ongoing writers pass labels into `workspace_private.index_hub_source` so new rows do not regress.

**Tech Stack:** Supabase Postgres migrations (PL/pgSQL), React + TypeScript (Vite), Vitest, existing Workspace library components.

## Global Constraints

- Do not widen `audience` / admin-only rules for `site_permit`, `payment_receipt`, `site_image`, `mmp`.
- Do not reclassify `report_photos` into `document_category = 'report'`.
- Payment `source_id` format remains `uuid:index` (split on `:` before joining `down_payment_requests`).
- Prefer idempotent SQL (`UPDATE` only when resolved label is better than blank / `Unknown Site`).
- Follow existing Vitest patterns under `src/lib/__tests__/`.
- Spec: `docs/superpowers/specs/2026-09-14-workspace-site-structure-design.md`.

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/workspaceDocuments.ts` | Label normalization + `groupSiteImages` / filter behavior |
| `src/lib/__tests__/workspaceDocuments.test.ts` | Unit tests for normalization + grouping |
| `src/components/workspace/DocumentLibraryBrowse.tsx` | List/gallery display of site · project context |
| `src/utils/projectDocumentWorkspace.ts` | Mirror inserts set `document_category` + `project_label` |
| `supabase/migrations/20260914150000_workspace_site_label_backfill.sql` | Phase 1 label backfill + improved source indexing helper usage |
| `supabase/migrations/20260914160000_workspace_category_reindex.sql` | Phase 2 MMP R2 / project docs / reports indexing |
| `docs/superpowers/specs/2026-09-14-workspace-site-structure-design.md` | Approved design (read-only reference) |

---

### Task 1: Normalize blank / Unknown site labels in `workspaceDocuments`

**Files:**
- Create: `src/lib/__tests__/workspaceDocuments.test.ts`
- Modify: `src/lib/workspaceDocuments.ts`
- Test: `src/lib/__tests__/workspaceDocuments.test.ts`

**Interfaces:**
- Consumes: existing `DocumentMetadata`, `groupSiteImages`, `matchesDocumentFilters`
- Produces: `normalizeSiteLabel(label: string | null | undefined): string | null` — returns trimmed label, or `null` when empty / case-insensitive `unknown site`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from 'vitest';
import {
  groupSiteImages,
  matchesDocumentFilters,
  normalizeSiteLabel,
  type DocumentMetadata,
} from '../workspaceDocuments';

describe('normalizeSiteLabel', () => {
  it('returns null for blank and Unknown Site variants', () => {
    expect(normalizeSiteLabel(null)).toBeNull();
    expect(normalizeSiteLabel('')).toBeNull();
    expect(normalizeSiteLabel('  ')).toBeNull();
    expect(normalizeSiteLabel('Unknown Site')).toBeNull();
    expect(normalizeSiteLabel('unknown site')).toBeNull();
  });

  it('returns trimmed real names', () => {
    expect(normalizeSiteLabel('  Port Sudan Clinic  ')).toBe('Port Sudan Clinic');
  });
});

describe('groupSiteImages', () => {
  it('does not treat literal Unknown Site as a real site when project exists', () => {
    const files: (DocumentMetadata & { id: string; updated_at: string })[] = [
      {
        id: '1',
        document_category: 'site_image',
        site_label: 'Unknown Site',
        project_label: 'Red Sea Hub',
        updated_at: '2026-09-01T00:00:00.000Z',
      },
      {
        id: '2',
        document_category: 'site_image',
        site_label: 'Clinic A',
        project_label: 'Red Sea Hub',
        updated_at: '2026-09-02T00:00:00.000Z',
      },
    ];
    const groups = groupSiteImages(files);
    expect(groups.map((g) => g.siteName).sort()).toEqual(['Clinic A', 'Red Sea Hub']);
  });
});

describe('matchesDocumentFilters site', () => {
  it('does not match Unknown Site label as a real site filter value', () => {
    const file: DocumentMetadata = {
      document_category: 'site_image',
      site_label: 'Unknown Site',
    };
    expect(
      matchesDocumentFilters(file, {
        category: 'site_image',
        project: '',
        site: 'Unknown Site',
        period: '',
        adminOnly: false,
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/workspaceDocuments.test.ts`

Expected: FAIL — `normalizeSiteLabel` is not exported / grouping still uses raw `Unknown Site`.

- [ ] **Step 3: Implement minimal helpers**

In `src/lib/workspaceDocuments.ts`, add and use:

```typescript
export function normalizeSiteLabel(label: string | null | undefined): string | null {
  const trimmed = label?.trim() ?? '';
  if (!trimmed) return null;
  if (/^unknown site$/i.test(trimmed)) return null;
  return trimmed;
}
```

Update `groupSiteImages` site resolution to:

```typescript
const siteName =
  normalizeSiteLabel(file.site_label) ||
  file.project_label?.trim() ||
  'Unknown site';
```

Update `matchesDocumentFilters` site clause to compare using `normalizeSiteLabel(file.site_label)` (if null, site filter does not match unless filter.site is empty).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/workspaceDocuments.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/workspaceDocuments.ts src/lib/__tests__/workspaceDocuments.test.ts
git commit -m "fix: treat Unknown Site as missing in Workspace document grouping"
```

---

### Task 2: Phase 1 SQL — backfill site/project labels on existing hub rows

**Files:**
- Create: `supabase/migrations/20260914150000_workspace_site_label_backfill.sql`

**Interfaces:**
- Consumes: `workspace_files`, `report_photos`, `reports`, `mmp_site_entries`, `mmp_files`, `down_payment_requests`, `operational_cost_submissions`, `document_index`
- Produces: updated `site_label` / `project_label` on matching `workspace_files` rows; no schema change

- [ ] **Step 1: Add migration with idempotent UPDATEs**

Create `supabase/migrations/20260914150000_workspace_site_label_backfill.sql` with this logic (keep comments; do not change audience):

```sql
-- Phase 1: backfill workspace_files site/project labels from source joins.
-- Idempotent: only fills blank / 'Unknown Site' when a better name exists.

-- Helper predicate: treat blank + Unknown Site as missing
-- (inlined in WHERE/CASE below).

-- 1) Site images from report_photos
UPDATE public.workspace_files wf
SET
  site_label = resolved.site_name,
  project_label = coalesce(nullif(btrim(wf.project_label), ''), resolved.project_name),
  updated_at = now()
FROM (
  SELECT
    wf2.id AS workspace_file_id,
    coalesce(
      nullif(btrim(mse.site_name), ''),
      nullif(btrim(mse.locality), '')
    ) AS site_name,
    coalesce(
      nullif(btrim(mf.name), ''),
      nullif(btrim(mf.hub), ''),
      nullif(btrim(mse.hub), '')
    ) AS project_name
  FROM public.workspace_files wf2
  JOIN public.report_photos rp
    ON wf2.source_type = 'report_photos'
   AND wf2.source_id = rp.id::text
  LEFT JOIN public.reports r ON r.id = rp.report_id
  LEFT JOIN public.mmp_site_entries mse ON mse.id = r.site_visit_id
  LEFT JOIN public.mmp_files mf ON mf.id = mse.mmp_file_id
  WHERE wf2.archived = false
    AND wf2.document_category = 'site_image'
) resolved
WHERE wf.id = resolved.workspace_file_id
  AND resolved.site_name IS NOT NULL
  AND (
    wf.site_label IS NULL
    OR btrim(wf.site_label) = ''
    OR lower(btrim(wf.site_label)) = 'unknown site'
  );

-- 2) Payment receipts from down_payment_requests (source_id = uuid:index)
UPDATE public.workspace_files wf
SET
  site_label = resolved.site_name,
  project_label = coalesce(nullif(btrim(wf.project_label), ''), resolved.project_name),
  updated_at = now()
FROM (
  SELECT
    wf2.id AS workspace_file_id,
    coalesce(
      nullif(btrim(dpr.site_name), ''),
      nullif(btrim(mse.site_name), ''),
      nullif(btrim(dpr.hub_name), '')
    ) AS site_name,
    coalesce(
      nullif(btrim(dpr.hub_name), ''),
      nullif(btrim(mf.name), ''),
      nullif(btrim(mf.hub), '')
    ) AS project_name
  FROM public.workspace_files wf2
  JOIN public.down_payment_requests dpr
    ON wf2.source_type = 'down_payment_requests'
   AND split_part(wf2.source_id, ':', 1) = dpr.id::text
  LEFT JOIN public.mmp_site_entries mse
    ON mse.id = coalesce(dpr.mmp_site_entry_id, dpr.site_visit_id)
  LEFT JOIN public.mmp_files mf ON mf.id = mse.mmp_file_id
  WHERE wf2.archived = false
    AND wf2.document_category = 'payment_receipt'
) resolved
WHERE wf.id = resolved.workspace_file_id
  AND resolved.site_name IS NOT NULL
  AND (
    wf.site_label IS NULL
    OR btrim(wf.site_label) = ''
    OR lower(btrim(wf.site_label)) = 'unknown site'
  );

-- 3) Optional: operational_cost_submissions receipts if site/hub columns exist on that table.
-- Inspect columns before writing; if hub/site fields exist, mirror the payment pattern with
-- source_type = 'operational_cost_submissions' and split_part(source_id, ':', 1).
-- If no site columns exist, skip this block (do not invent labels).
```

Before applying, confirm `mmp_site_entries` / `mmp_files` column names used above (`locality`, `hub`, `name`, `mmp_file_id`) against live schema and adjust the SELECT list if a column differs. Prefer `information_schema` / `\d` over guessing.

- [ ] **Step 2: Dry-run counts in SQL editor (read-only)**

```sql
-- Before/after style check (run SELECT equivalents of the FROM subqueries):
SELECT count(*) AS can_fix_site_images
FROM public.workspace_files wf
JOIN public.report_photos rp ON wf.source_type = 'report_photos' AND wf.source_id = rp.id::text
LEFT JOIN public.reports r ON r.id = rp.report_id
LEFT JOIN public.mmp_site_entries mse ON mse.id = r.site_visit_id
WHERE wf.archived = false AND wf.document_category = 'site_image'
  AND coalesce(nullif(btrim(mse.site_name), ''), nullif(btrim(mse.locality), '')) IS NOT NULL
  AND (wf.site_label IS NULL OR btrim(wf.site_label) = '' OR lower(btrim(wf.site_label)) = 'unknown site');
```

Expected: thousands for site images; similar non-zero for receipts.

- [ ] **Step 3: Apply migration to the target environment**

Run via the project’s normal Supabase migration path (CLI `supabase db push` / hosted migration apply). Do not hand-edit production outside migrations.

Expected: migration succeeds; spot-check:

```sql
SELECT document_category,
  count(*) FILTER (WHERE site_label IS NULL OR btrim(site_label) = '' OR lower(btrim(site_label)) = 'unknown site') AS missing_site,
  count(*) AS total
FROM public.workspace_files
WHERE archived = false
  AND document_category IN ('site_image', 'payment_receipt')
GROUP BY 1;
```

Expected: `missing_site` near zero for both categories (tiny residual OK).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260914150000_workspace_site_label_backfill.sql
git commit -m "fix: backfill Workspace hub site and project labels from source tables"
```

---

### Task 3: Phase 1 writers — index new photos/receipts with labels

**Files:**
- Modify: `supabase/migrations/20260914150000_workspace_site_label_backfill.sql` (same file if not yet applied) **or** Create: `supabase/migrations/20260914151500_workspace_index_hub_source_with_labels.sql` if Task 2 already shipped

**Interfaces:**
- Consumes: `workspace_private.index_hub_source(jsonb)` (already accepts `project_label` / `site_label`)
- Produces: a replaceable helper `workspace_private.reindex_hub_sources_with_labels()` (or inline DO) that re-calls `index_hub_source` **with** labels for report photos, payments, and operational costs so ON CONFLICT updates labels for any rows still missing them / future re-runs

- [ ] **Step 1: Add labeled reindex loops**

Append a `CREATE OR REPLACE FUNCTION` + one-time `PERFORM` that mirrors the original backfill loops in `20260907212603_workspace_document_library_backfill.sql`, but passes labels:

**report_photos example payload:**

```sql
PERFORM workspace_private.index_hub_source(jsonb_build_object(
  'source_type', 'report_photos',
  'source_id', r.id::text,
  'file_url', r.photo_url,
  'file_name', coalesce(nullif(split_part(r.photo_url, '/', -1), ''), 'Site photo'),
  'document_category', 'site_image',
  'site_label', coalesce(nullif(btrim(mse.site_name), ''), nullif(btrim(mse.locality), '')),
  'project_label', coalesce(nullif(btrim(mf.name), ''), nullif(btrim(mf.hub), '')),
  'reporting_period', r.created_at::text
));
```

Join `report_photos` → `reports` → `mmp_site_entries` → `mmp_files` inside the loop SELECT.

**down_payment_requests example:** include `site_label` / `project_label` from `dpr.site_name` / `dpr.hub_name` (and site entry fallback) in the `jsonb_build_object` for each proof URL.

Keep the existing Supabase-storage URL filter for Phase 1 writers (R2 expansion is Task 5).

Because `index_hub_source` `ON CONFLICT` already updates `project_label` / `site_label`, this also repairs any rows the UPDATE missed when `source_url` matches.

- [ ] **Step 2: Apply migration and verify a sample row**

```sql
SELECT site_label, project_label, source_type, source_id
FROM public.workspace_files
WHERE source_type = 'report_photos'
ORDER BY updated_at DESC
LIMIT 5;
```

Expected: non-null `site_label` for joinable photos.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260914151500_workspace_index_hub_source_with_labels.sql
git commit -m "fix: index Workspace hub sources with site and project labels"
```

---

### Task 4: Phase 1 UI — surface site · project on library rows / gallery

**Files:**
- Modify: `src/components/workspace/DocumentLibraryBrowse.tsx`
- Test: manual + existing `workspaceDocuments` unit tests

**Interfaces:**
- Consumes: `normalizeSiteLabel` from `workspaceDocuments.ts`
- Produces: list rows that prefer normalized site; gallery titles use already-fixed `groupSiteImages`

- [ ] **Step 1: Update RegistryRow metadata display**

Import `normalizeSiteLabel`. When rendering site:

```tsx
const siteLabel = normalizeSiteLabel(file.site_label);
// ...
{file.project_label && (
  <span className="truncate max-w-[140px]">{file.project_label}</span>
)}
{siteLabel && (
  <span className="inline-flex items-center gap-1 truncate max-w-[140px]">
    <Home className="h-3 w-3" />
    {siteLabel}
  </span>
)}
```

For structured categories (`payment_receipt`, `site_image`, `mmp`, `project_document`, `report`), if both project and site are missing after normalization, show a muted `No site linked` span so the row is not context-free (do not show the literal string `Unknown Site`).

- [ ] **Step 2: Confirm gallery path**

Gallery already calls `groupSiteImages(files)`. After Task 1, titles should split by real sites. No API change required beyond using the updated helper.

- [ ] **Step 3: Manual UI check**

Run: `npm run dev` → open `/workspace` as admin → Site images → expect multiple site cards; Payment receipts → expect site names on rows; Site filter reduces the list.

- [ ] **Step 4: Commit**

```bash
git add src/components/workspace/DocumentLibraryBrowse.tsx
git commit -m "fix: show resolved site context on Workspace library rows"
```

---

### Task 5: Phase 2 — MMP reindex including R2 URLs

**Files:**
- Create: `supabase/migrations/20260914160000_workspace_category_reindex.sql` (start of file)
- Modify: extend `workspace_private.index_hub_source` URL parsing in that migration

**Interfaces:**
- Consumes: `mmp_files(file_url, name, original_filename, hub, month, …)`
- Produces: hub rows with `document_category = 'mmp'`, `project_label` set; R2 https URLs accepted

- [ ] **Step 1: Broaden `index_hub_source` URL handling**

In the new migration, `CREATE OR REPLACE FUNCTION workspace_private.index_hub_source(d jsonb)` copying the existing body, but change the `ELSE RETURN` branch to accept Cloudflare R2 / https object URLs used by the app:

```sql
  ELSIF url LIKE 'r2:%' THEN
    key := substr(url, 4); provider := 'r2'; bucket := NULL;
  ELSIF url ~ '/storage/v1/object/(public|sign|authenticated)/' THEN
    -- existing supabase parsing
  ELSIF url ~ '^https?://' THEN
    -- Store full URL as public_url path key fallback used elsewhere for R2
    key := regexp_replace(split_part(url, '?', 1), '^https?://[^/]+/', '');
    provider := 'r2';
    bucket := NULL;
  ELSE
    RETURN;
  END IF;
```

Preserve insert of `public_url` behavior consistent with how Hub already opens R2 files (if Hub expects `public_url` set for https, set `public_url := url` in the https branch instead of NULL — match existing R2 rows in `workspace_files`).

- [ ] **Step 2: Reindex all `mmp_files` with labels**

```sql
FOR r IN
  SELECT id, name, original_filename, file_url, created_at, hub, month
  FROM public.mmp_files
  WHERE file_url IS NOT NULL AND btrim(file_url) <> ''
LOOP
  PERFORM workspace_private.index_hub_source(jsonb_build_object(
    'source_type', 'mmp_files',
    'source_id', r.id::text,
    'file_url', r.file_url,
    'file_name', coalesce(nullif(r.original_filename, ''), nullif(r.name, ''), 'MMP file'),
    'document_category', 'mmp',
    'project_label', coalesce(nullif(btrim(r.hub), ''), nullif(btrim(r.name), '')),
    'reporting_period', CASE
      WHEN r.month ~ '^\d{4}-(0[1-9]|1[0-2])$' THEN r.month
      ELSE left(r.created_at::text, 7)
    END
  ));
END LOOP;
```

- [ ] **Step 3: Verify**

```sql
SELECT count(*) FROM public.workspace_files
WHERE archived = false AND document_category = 'mmp';
```

Expected: closer to `select count(*) from mmp_files where file_url is not null` (15 previously vs 6 indexed).

- [ ] **Step 4: Commit** (can wait until end of Task 7 if bundling Phase 2 migration; otherwise commit after Step 3)

```bash
git add supabase/migrations/20260914160000_workspace_category_reindex.sql
git commit -m "fix: reindex MMP files into Workspace including R2 URLs"
```

---

### Task 6: Phase 2 — Project documents category on mirror + backfill

**Files:**
- Modify: `src/utils/projectDocumentWorkspace.ts`
- Modify: `supabase/migrations/20260914160000_workspace_category_reindex.sql` (append)
- Create: `src/utils/__tests__/projectDocumentWorkspace.test.ts` **only if** pure helpers are extractable; otherwise cover via a small exported mapper helper

**Interfaces:**
- Consumes: `upsertWorkspaceFile` params
- Produces: inserts/updates including `document_category: 'project_document'`, `project_label: projectName`, `tags` retaining `project` / `project-document`

- [ ] **Step 1: Extend mirror insert/update**

Update `upsertWorkspaceFile` / `mirrorProjectDocumentToWorkspace` so both insert and update paths set:

```typescript
document_category: 'project_document',
project_label: params.projectName, // thread projectName into upsertWorkspaceFile params
audience: 'workspace',
```

Thread `projectName` from `mirrorProjectDocumentToWorkspace` into `upsertWorkspaceFile`.

- [ ] **Step 2: SQL backfill for existing mirrored rows**

Append to Phase 2 migration:

```sql
UPDATE public.workspace_files
SET
  document_category = 'project_document',
  project_label = coalesce(nullif(btrim(project_label), ''), nullif(btrim(name), '')),
  updated_at = now()
WHERE archived = false
  AND document_category = 'other'
  AND tags @> ARRAY['project-document']::text[];
```

(Confirm tag spelling matches inserts: `['project','project-document']`.)

- [ ] **Step 3: Run unit/typecheck as available**

Run: `npx tsc --noEmit -p tsconfig.json` (or project’s usual check) and any new vitest file if added.

Expected: no type errors from new required fields.

- [ ] **Step 4: Commit**

```bash
git add src/utils/projectDocumentWorkspace.ts supabase/migrations/20260914160000_workspace_category_reindex.sql
git commit -m "feat: classify mirrored project documents in Workspace hub"
```

---

### Task 7: Phase 2 — Index true report documents (not photos)

**Files:**
- Modify: `supabase/migrations/20260914160000_workspace_category_reindex.sql` (append)

**Interfaces:**
- Consumes: `document_index` rows with `category = 'report'` (already mapped by `index_document`); optionally `reports` rows that have a real file attachment URL distinct from `report_photos`
- Produces: `workspace_files` with `document_category = 'report'` and site/project labels

- [ ] **Step 1: Inventory sources (read-only)**

```sql
SELECT category, count(*) FROM public.document_index GROUP BY 1 ORDER BY 2 DESC;
SELECT count(*) FILTER (WHERE file_url IS NOT NULL AND btrim(file_url) <> '') AS with_file
FROM public.reports;
```

Use results to choose indexing source(s). Prefer `document_index` where `category = 'report'`. If site-visit “reports” are rows in `reports` with `file_url`, index those as `source_type = 'reports'` with site via `site_visit_id` → `mmp_site_entries`.

- [ ] **Step 2: Re-sync document_index reports + optional reports files**

```sql
-- Ensure document_index report rows are in the hub with labels
FOR d IN
  SELECT to_jsonb(i) AS j FROM public.document_index i WHERE i.category = 'report'
LOOP
  PERFORM workspace_private.index_document(d.j);
END LOOP;
```

If indexing `reports.file_url` directly:

```sql
PERFORM workspace_private.index_hub_source(jsonb_build_object(
  'source_type', 'reports',
  'source_id', r.id::text,
  'file_url', r.file_url,
  'file_name', coalesce(nullif(r.name, ''), 'Site report'),
  'document_category', 'report',
  'site_label', coalesce(nullif(btrim(mse.site_name), ''), nullif(btrim(mse.locality), '')),
  'project_label', coalesce(nullif(btrim(mf.hub), ''), nullif(btrim(mf.name), '')),
  'reporting_period', left(r.created_at::text, 7)
));
```

Do **not** insert `report_photos` as `report`.

- [ ] **Step 3: Verify pills**

```sql
SELECT document_category, count(*)
FROM public.workspace_files
WHERE archived = false
GROUP BY 1
ORDER BY 2 DESC;
```

Expected: `mmp` and `project_document` and `report` non-zero when sources exist; `site_image` count unchanged in meaning (photos still photos).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260914160000_workspace_category_reindex.sql
git commit -m "feat: index Workspace report documents with site labels"
```

---

### Task 8: End-to-end verification checklist

**Files:** none (verification only)

- [ ] **Step 1: DB residual Unknown check**

```sql
SELECT document_category, count(*) AS unknownish
FROM public.workspace_files
WHERE archived = false
  AND document_category IN ('site_image','payment_receipt','mmp','project_document','report')
  AND (site_label IS NULL OR btrim(site_label) = '' OR lower(btrim(site_label)) = 'unknown site')
GROUP BY 1;
```

Expected: site_image / payment_receipt residuals tiny; others acceptable when multi-site.

- [ ] **Step 2: UI checklist**

1. `/workspace` → Site images → multiple named site cards; Browse photos opens files.
2. Payment receipts → rows show site (and project when present).
3. Filters: pick one site → list shrinks correctly.
4. MMPs / Project documents / Reports pills no longer stuck at 0 when sources exist.
5. Non-admin still cannot see admin-only categories.
6. Duplicate check:

```sql
SELECT source_type, source_id, source_url, count(*)
FROM public.workspace_files
WHERE source_type IS NOT NULL
GROUP BY 1,2,3 HAVING count(*) > 1;
```

Expected: 0 rows.

- [ ] **Step 3: Final commit only if verification fixes were needed; otherwise stop**

No empty commit.

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| Backfill site images via report_photos → reports → mmp_site_entries | Task 2 |
| Backfill payment receipts via down_payment_requests `uuid:n` | Task 2 |
| Fix writers so new indexes include labels | Task 3 |
| UI gallery/list show site · project; filters work | Tasks 1, 4 |
| Normalize Unknown Site | Task 1 |
| MMP reindex + R2 | Task 5 |
| Project documents category on mirror + backfill | Task 6 |
| Reports ≠ photos; index real report docs | Task 7 |
| Verification + no audience widening | Task 8 + Global Constraints |

No TBD placeholders remain. Column-name confirmation is an explicit Step inside Task 2 (schema check before apply), not an open design question.
