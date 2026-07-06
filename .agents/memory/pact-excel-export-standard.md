---
name: PACT Excel export standard
description: How report pages across the app should expose Excel downloads, and which utility to reach for.
---

PACT Command Center report/table pages should offer an Excel download that matches the "Down Payments" look: a merged title block (report name), a generated-date/total-records meta line, then headers + data.

Two shared utilities produce this style:
- `exportToExcel(rows, sheetName, filename)` in `src/utils/report-export.ts` — simplest option, single sheet, array-of-objects in, use for most list/table pages.
- `exportStandardExcel(opts)` in `src/utils/standardExcelExport.ts` — use when a page needs a totals row, a Summary sheet, or multiple breakdown sheets (e.g. By Hub, By Category).

Staff/HR directory pages (`Employees.tsx`, `StaffDirectory.tsx`) use their own dedicated branded exporter (`src/utils/staffDirectoryExport.ts`, built on ExcelJS with PACT navy branding) — that's intentionally richer than the plain utilities above and should NOT be replaced by them.

**Why:** the user wants every exportable report to look consistent (like Down Payments) instead of a mix of raw CSV, ad-hoc jsPDF layouts, and unstyled XLSX dumps. Several dozen pages had CSV/PDF-only exports before this was fixed.

**How to apply:** when adding/auditing export on any new report page, add Excel as an *additional* button — never remove an existing CSV/PDF export a user may already depend on. Map only the currently visible/filtered rows (not raw unfiltered state) into a flat object with human-readable column headers before calling the exporter.
