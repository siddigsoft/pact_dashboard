# Full Application — Suggested Changes (Navigation & IA)

**Date:** 2026-10-04  
**Status:** Proposal — Phase A (P0) implemented 2026-10-05  
**Scope:** App-wide information architecture, navigation sources, hub patterns  
**Trigger:** Accounting hub density + sidebar vs hub duplication review  

---

## 1. Verdict

The shell is fine. **shadcn Sidebar + custom HubLayout is the right split.**

What needs change is **information architecture and source-of-truth drift**, not replacing shadcn:

| Keep | Change |
|------|--------|
| `components/ui/sidebar` as chrome | Stop mirroring every hub tab in the left sidebar |
| `HubLayout` for domain hubs | Collapse flat 20–80 tab grids into job-based groups |
| Manifest / `access-registry` gating | One nav source of truth; delete parallel builders |
| Role-based page access | Fix broken quick-link URLs before redesign ships |

---

## 2. Current state (inventory)

### 2.1 Layout primitives

| Layer | File | Job |
|-------|------|-----|
| App chrome | `src/components/ui/sidebar.tsx` + `AppSidebar.tsx` | Cross-app destinations |
| Domain hub | `src/components/ui/hub-layout.tsx` | Within-domain sections/tabs |
| Quick links | `src/components/ui/connected-pages-bar.tsx` | Cross-hub shortcuts in hub headers |
| Shell | `src/components/MainLayout.tsx` | Sidebar + inset |

### 2.2 Parallel navigation sources (drift)

Four places currently describe “what appears in nav”:

1. **`src/lib/access-registry.ts`** — canonical `PAGE_DEFS` + `PAGE_NAVIGATION_GROUPS` (intended source of truth)
2. **`src/components/AppSidebar.tsx`** — local mega `getWorkflowMenuGroups` (~2k lines; used for View As / Super Admin density)
3. **`src/navigation/menu.ts`** — slim builder (mobile / Role Perspective)
4. **`src/config/navigation.ts`** — older unified-navigation config

Experts pick **one** and generate the rest.

### 2.3 Hub density

| Hub | File | Sections | Tabs | Severity |
|-----|------|----------|------|----------|
| Accounting | `AccountingHub.tsx` | 5 | ~80 | Critical |
| HR | `HRHub.tsx` | 4 | ~32 | High |
| Super Admin | `SuperAdminHub.tsx` | 5 | 17 | Medium-high |
| Finance | `FinanceHub.tsx` | 2 | 14 | Medium |
| Field Ops | `FieldOpsHub.tsx` | 3 | 9 | OK |
| Analytics | `AnalyticsHub.tsx` | 2 | 8 | OK |
| Pre-Funding | `PreFundingHub.tsx` | 1 | 8 | OK |
| Programme | `ProgrammeHub.tsx` | 2 | 6 | OK |
| Communication / CRM | respective hubs | 2 | 5 | OK |

**Not on HubLayout (inconsistent):** Admin Hub, Approvals Hub, Field Data Hub, Workspace Hub (~6.5k lines).

### 2.4 Highest-pain duplication

Same destinations appear in **sidebar subgroups** and **hub tab grids**:

- Accounting (`/accounting?tab=…`) — dozens of deep links in both places
- Finance Hub tabs
- Pre-Funding (plus path vs `?tab=` URL mismatch risk)
- HR Hub + standalone routes that redirect into `/hr?tab=…`

### 2.5 Known broken / divergent quick links (`ConnectedPagesBar`)

| ID | Current target | Actual route |
|----|----------------|--------------|
| `accounting` | `/accounting-hub` | `/accounting` |
| `field-ops` | `/field-ops-hub` | `/field-ops` |
| `analytics-hub` | `/analytics-hub` | `/analytics` |
| `hr` | `/hr-hub?tab=payslips` | `/hr` (tab ids differ) |

---

## 3. Expert principles (apply app-wide)

1. **Sidebar = hubs + personal tools.** Not every ledger screen.
2. **Hub = progressive disclosure.** Overview → section → tool. Max ~8–12 visible peers per view.
3. **One navigation source of truth.** Registry (+ hub-tab-defs) only.
4. **One hub shell.** Prefer `HubLayout` (or document explicit exceptions).
5. **One URL scheme per hub.** Prefer `/hub?tab=` everywhere; redirects for legacy paths.
6. **Role defaults over god-mode catalogs.** Super Admin can open everything; first paint should still be job-shaped.
7. **Favorites / Recents** replace pinning 40 accounting tabs in the tree.

---

## 4. Suggested changes

### P0 — Fix correctness (do first)

#### P0.1 Repair `ConnectedPagesBar` URLs
- File: `src/components/ui/connected-pages-bar.tsx`
- Align every hub ID to real routes (`/accounting`, `/field-ops`, `/analytics`, `/hr`, …)
- Add a unit test that asserts quick-link paths exist in `App.tsx` route table

#### P0.2 Normalize Pre-Funding URLs
- Pick `/pre-funding?tab=<id>` as canonical
- Sidebar + registry + redirects all use that scheme
- Keep path redirects (`/pre-funding/registry` → `?tab=registry`) for bookmarks

#### P0.3 Stop shipping broken dual deep-links
- Audit Accounting / Finance / HR / Pre-Funding sidebar entries that point at non-canonical URLs
- One redirect map in `App.tsx`; no competing absolute paths in nav builders

---

### P1 — Navigation source of truth

#### P1.1 Single builder
- **Canonical:** `access-registry.ts` (`PAGE_DEFS`, `PAGE_NAVIGATION_GROUPS`) + `hub-tab-defs.ts`
- AppSidebar reads **only** `getManifestNavigationPages(manifest)` (already true for normal signed-in users)
- Delete or generate from registry:
  - local `getWorkflowMenuGroups` density lists in `AppSidebar.tsx`
  - `src/navigation/menu.ts`
  - `src/config/navigation.ts`
- View As / Super Admin preview should filter the **same** registry, not a parallel tree

#### P1.2 Sidebar IA rules
For each `SECTION_CFG` parent, sidebar may show:

| Allowed in sidebar | Not allowed in sidebar |
|--------------------|------------------------|
| Hub entry (e.g. Accounting) | Every hub tab (`coa`, `ar-aging`, …) |
| Personal tools (My Tasks, Wallet, Calendar) | Duplicate ConnectedPagesBar hubs |
| 1–3 high-frequency shortcuts per domain (optional) | Full P2P / Controls catalogs |

**Concrete Accounting change**

- Sidebar under Accounting: **Accounting** + **Accounting Hub** (or merge to one) + maybe Finance Dashboard
- Remove the expanded subgroup that lists Core Ledger / FinOps / P2P / Controls / Advanced as sidebar clones of hub sections
- Discovery happens inside the hub

Apply the same rule to Finance, HR, Pre-Funding.

#### P1.3 Registry parent completeness
- Add or map missing parents (`incentives`, `help`) in `PAGE_NAVIGATION_GROUPS`
- Decide whether Audit stays under Administration or gets its own parent — document once

---

### P2 — Hub information architecture

#### P2.1 Accounting hub redesign (pilot)
Current: 5 sections × ~80 tabs → flat multi-column dropdown (Financial Operations alone ~23 tiles).

**Suggested structure**

```
Accounting
├── Home (KPIs + Recents + Favorites)
├── Close the books     → journals, TB, period close, lock dates, fiscal years
├── Money in / out      → AR, AP, bank recon, petty cash, wire, cheques
├── Buy & pay (P2P)     → PR, PO, GRN, vendors, invoices
├── Plan & fund         → budgets, grants, funds, encumbrance
└── Reports & control   → statements, aging, SOD, AML, audit, settings
```

Rules for the pilot:

- Landing shows **≤8** primary cards + search (“Jump to…”)
- Section view shows **≤12** tools; overflow under “More”
- Keep all existing `?tab=` IDs; only change grouping / first paint
- Super Admin “Manage Access” stays

#### P2.2 HR hub follow same pattern
- Split HR (~32 tabs) into job groups: Me / Payroll / Leave & time / People / Recruit & perform
- Extract panels out of `HRHub.tsx` (~1.9k) into `src/pages/hr/` or `src/components/hr/`

#### P2.3 HubLayout UX upgrades (shared)
File: `src/components/ui/hub-layout.tsx`

- Replace raw dense icon grid with: **search + grouped lists + recent**
- Optional second-level “tool rail” instead of 4-column tile dump
- Persist last section/tab per hub in localStorage
- Show badge counts only on section level, not every tile

#### P2.4 Normalize non-HubLayout hubs
| Page | Suggestion |
|------|------------|
| Admin Hub | Migrate to `HubLayout` or keep custom but share ConnectedPagesBar + tab registry only |
| Approvals Hub | Same section/tab model; stop one-off card chrome unless UX requires it |
| Field Data Hub | Register fully in `HUB_TAB_REGISTRY`; align shell |
| Workspace Hub | **Split** (~6.5k): shell + feature modules; do not leave as mega-page |

---

### P3 — Product surface & file health

#### P3.1 Mega-file budget
Target: no page/hub file over ~800 lines without extraction.

Priority splits:

1. `WorkspaceHub.tsx` (~6.5k)
2. `AppSidebar.tsx` (~2k) → thin shell + `src/navigation/*` modules
3. `HRHub.tsx` (~1.9k)
4. Large domain pages (`Departments.tsx`, etc.) as encountered

#### P3.2 Route / redirect cleanup
- Inventory ~100 `Route` entries in `App.tsx`
- Keep redirects for 1–2 release cycles; mark deprecated in registry
- Remove registry slugs that only exist as redirects once traffic is gone

#### P3.3 Gating consistency
One evaluation path for “can see X”:

```
PAGE_DEFS → manifest (page_role_configs + overrides) → hub-tab-defs → route guard
```

Remove divergent role string sets from `menu.ts` / `navigation.ts` once deleted.

#### P3.4 Personalization (reduces pressure on IA)
- Recents (last 10 tools across hubs)
- Favorites (user-pinned; already partially present in Settings / sidebar pins)
- Role starter packs (e.g. Accountant sees Close-the-books first)

---

## 5. Proposed target IA (sidebar)

```
My Workspace
  Dashboard · My Tasks · Calendar · Notifications · Workspace Hub · Search

Programme Management
  Programme Hub · (optional: Projects)

Communication
  Communication Hub

Field Operations
  Field Ops Hub

Coordination & Oversight
  (keep short; coordinator-critical only)

Payments & Finance
  Wallet · Cost Submission · Approvals Hub · Finance Hub · Pre-Funding Hub

Accounting
  Accounting   ← single entry into hub

HR & People
  HR Hub · (optional: My Leave / My Payslip)

CRM
  CRM Hub

Surveys / Field Data
  Surveys · Field Data Hub

Analytics & Reports
  Analytics Hub

Administration
  Admin Hub · (audit tools if role allows)

Super Admin
  Super Admin Hub

Help & Support
  Documentation · Helpline
```

Deep Accounting/HR/Finance tools live **only** inside hubs.

---

## 6. Phased rollout

| Phase | Outcome | Effort |
|-------|---------|--------|
| **A** | P0 URL fixes + tests | Small |
| **B** | Sidebar: strip Accounting/Finance/HR/Pre-Funding tab mirrors | Medium |
| **C** | Accounting hub regroup + HubLayout search/recents | Medium |
| **D** | Kill parallel nav builders; registry-only | Medium–Large |
| **E** | HR regroup; Admin/Approvals/Field Data shell alignment | Large |
| **F** | WorkspaceHub / AppSidebar extraction | Large |

Ship **A → B → C** before any visual redesign of tiles. That alone removes the “disorganised” feeling without touching shadcn.

---

## 7. Success metrics

- Sidebar parent sections: ≤ 15 (keep), but **expanded item count for Accounting ≤ 3**
- Any hub first paint: ≤ 12 primary actions
- Zero ConnectedPagesBar 404s / wrong hubs
- Single module owns nav labels/URLs (registry)
- Time-to-tool for top 10 accountant tasks (measure before/after)

---

## 8. Explicit non-goals

- Replacing shadcn Sidebar
- Merging Accounting into Finance Hub (domains stay separate)
- Removing Super Admin full access
- Big-bang rewrite of all hubs in one PR

---

## 9. Decision checklist (product)

Before implementation, confirm:

- [ ] Sidebar may keep **at most N** shortcuts per domain (recommend N = 2)
- [ ] Accounting pilot groups above are acceptable to Finance owners
- [ ] Pre-Funding canonical URL is `?tab=`
- [ ] Workspace Hub split is in scope for a later phase
- [ ] Favorites/Recents are required for phase C or can wait

---

## 10. Key file map (implementation starting points)

| Change | Primary files |
|--------|----------------|
| Quick link fixes | `connected-pages-bar.tsx` |
| Sidebar thinning | `AppSidebar.tsx`, `access-registry.ts` |
| Hub regroup | `AccountingHub.tsx`, `hub-layout.tsx`, `hub-tab-defs.ts` |
| Nav consolidation | delete/generate `menu.ts`, `config/navigation.ts` |
| URL redirects | `App.tsx` |
| Access gating | `current-user-access.ts`, `hub-tab-defs.ts` |

---

## 11. Summary

Expert developers keep **shadcn for chrome** and **hubs for domains**. They do **not** mirror an 80-tab product in the left rail.  

Recommended direction for PACT: **fix URLs → thin the sidebar → regroup Accounting as the pilot → one registry → normalize other hubs.** That is organization; the current stack is mostly duplication and density, not the wrong UI library.
