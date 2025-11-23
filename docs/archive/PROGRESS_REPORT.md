# PACT Platform — Progress Report (Sidebar Modules)

Date: 03 Oct 2025 (EAT)
Scope: Only modules shown in the sidebar, as defined in `src/components/AppSidebar.tsx`.

Sidebar groups and items are role-based via `getMenuGroups()` in `src/components/AppSidebar.tsx`:
- Overview: Dashboard
- Projects: Projects, MMP Management, Site Visits
- Team: Field Team (hidden for financialAdmin)
- Data & Reports: Data Visibility (admin/ict/fom/financialAdmin)
- Administration: User Management (admin/ict), Settings (all)

---

## Dashboard
Files: `src/pages/Dashboard.tsx`, components under `src/components/dashboard/`

- **Key metrics overview**: `DashboardStatsOverview` with KPI cards and progress visuals.
- **Responsive layouts**: `DashboardDesktopView` and `DashboardMobileView` selected via `useViewMode()`.
- **Reminder workflow**: `use-site-visit-reminders-ui` shows due site visit reminders on load.
- **User role context**: Displays active roles as badges from `useAppContext()`.
- **Operational helpers**: `FloatingMessenger`, location permission prompt, and `TooltipProvider` for UX polish.

---

## Projects
Files: `src/pages/Projects.tsx`, `src/components/project/ProjectList.tsx`
Related routes: `src/pages/CreateProject.tsx`, `src/pages/ProjectDetail.tsx`, `src/pages/EditProject.tsx`, `src/pages/ProjectTeamManagement.tsx` (see `src/App.tsx`)

- **Project list & navigation**: `ProjectList` with "View" navigation to `/projects/:id`.
- **Create project**: CTA to `/projects/create`.
- **Extended flows available**: detail, edit, and team management routes wired in `src/App.tsx` for end-to-end project lifecycle.

---

## MMP Management
Files: `src/pages/MMP.tsx`, `src/pages/MMPUpload.tsx`, `src/pages/MMPDetail.tsx`, `src/pages/MMPDetailView.tsx`, `src/pages/MMPVerification.tsx`, `src/pages/EditMMP.tsx`
Supporting components: `src/components/mmp/*`, `src/components/verification/*`, `src/components/site-visit/*`

- **MMP list & upload**: `MMP.tsx` lists files (from `MMPContext`). Upload flow at `/mmp/upload` with:
  - **Schema validation** using Zod; status badges for success/warnings/errors.
  - **Progress indicator** during validation, tabbed UI for Upload/Preview/Validation.
  - **Preview table** with per-row errors/warnings; template download and export utilities.
- **Detail and analysis**: `MMPDetail.tsx` with tabs:
  - **Core information** (`MMPOverallInformation`, `MMPSiteInformation`).
  - **Financial tracking**: allocation, fee breakdown, per-site totals, export.
  - **Performance**: progress, supervisor rating, tracking logs export.
  - **Verification & Approvals**: `MMPApprovalWorkflow`, `MMPVersionHistory`, `AuditLogViewer`.
- **Optimized detail view**: `MMPDetailView.tsx` consolidates overview, site entries (list/detail), validation summary, audit, compliance, version history, and file management (archive/delete/approve/reset) based on role.
- **Verification workflow**: `MMPVerification.tsx` calculates progress, site counts, and finalizes status to "verified"; integrates `MMPSiteInformation` for updates.
- **Editing**: `EditMMP.tsx` supports core details, sites, activities (`ActivityManager`), and version history.
- **Bulk maintenance**: Admin/ICT can use `BulkClearForwardedDialog` (triggered from MMP page header) to reset all forwarded flags (FOM & Coordinator) and optionally delete associated `site_visits` records in one controlled operation (double confirmation required).

---

## Site Visits
Files: `src/pages/SiteVisits.tsx`, `src/pages/SiteVisitDetail.tsx`, `src/pages/CreateSiteVisit.tsx`
Supporting components: `src/components/site-visit/*`, `src/components/map/*`

- **Site visits hub**: Search, filter by status, sort, and view toggles (Grid/Map/Calendar-ready). Stats via `SiteVisitStats`.
- **Map view & assignment**: `LeafletMapContainer` and `AssignmentMap` to select a site and assign; integrates MMP list of approved items (`ApprovedMMPList`).
- **Creation flows**: From MMP or Urgent (`/site-visits/create/mmp`, `/site-visits/create/urgent`), gated by role.
- **Detail view**: `SiteVisitDetail.tsx` shows header, info, dates, assignment button, nearby collectors (distance via `calculateDistance`), and related documents (deep links to MMP and reports).

---

## Field Team
File: `src/pages/FieldTeam.tsx`
Supporting: `src/components/field-team/*`, maps in `src/components/map/*`

- **Team situational awareness**: `SimpleFieldTeamMap` overlays users and active/pending site visits.
- **Workload insights**: `SiteVisitsSummary` and per-user workload via `calculateUserWorkload`.
- **Assignment entry points**: Selecting a site routes to the site visit details for actioning.

---

## Data & Reports (Data Visibility)
File: `src/pages/DataVisibility.tsx`

- **Integrated operational view**: Interactive map (`DynamicFieldTeamMap`), searchable & filterable table linking visits to MMPs.
- **Exports**: Excel/CSV/PDF and raw data export utilities (CSV generation helpers).
- **Reporting & trends**: KPIs and charts (Recharts Bar/Scatter), coverage analysis, and executive summary generation.
- **Audit & compliance**: Compliance metrics view with pie/sector interactions.

---

## Administration

### User Management
File: `src/pages/Users.tsx`

- **User directory**: Tabs for All, Pending Approvals, and Approved users.
- **Approvals workflow**: Approve/Reject actions with toasts; refresh from Supabase (`refreshUsers`).
- **Search & filters**: Search, role/state/hub filters; role badges per user.
- **Role administration**: Admin-only add/remove roles with persistence hints and inline dialogs.

### Settings
File: `src/pages/Settings.tsx`

- **General**: Default landing page per user.
- **Location**: `LocationCapture` with permissions.
- **Notifications**: Enable, email, sound; persisted via `SettingsContext`.
- **Appearance**: Dark mode and theme selector.
- **Profile**: Edit name/email, change password via Supabase auth.
- **Data Visibility**: Location sharing, personal metrics toggles.
- **Wallet**: Auto-withdraw, thresholds, payment notifications.

---

## Role-Based Sidebar Logic
File: `src/components/AppSidebar.tsx`

- **Dynamic groups**: `getMenuGroups(roles, defaultRole)` computes visible groups/items for roles `admin`, `ict`, `fom`, `financialAdmin`, `supervisor`, `dataCollector`.
- **Behavior**:
  - Team group hidden for `financialAdmin`.
  - Data & Reports shown for admin/ict/fom/financialAdmin.
  - Administration shows full (Users + Settings) for admin/ict; others see Settings only.

---

## Notes
- All protected routes are wrapped with `AuthGuard` in `src/App.tsx` and rendered inside `MainLayout` (`src/components/MainLayout.tsx`).
- Mobile vs desktop experience is handled via `ViewModeContext` and responsive components across modules.

---

## Next (Optional)
- **QA pass** across MMP verification and exports for edge cases.
- **Performance review** of large MMP previews and map renders.
- **Role matrix** confirmation to finalize sidebar visibility.
