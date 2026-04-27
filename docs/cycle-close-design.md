# Cycle Close & Site Visit Status — Design Document

**Status:** Discussion / Planning — Ready for Build Approval
**Last updated:** 2026-04-27
**Participants:** Product Owner, Engineering

---

## 1. The Core Problem

The current status `completed` on a site visit means the enumerator finished entering data in the PACT app. It does NOT mean WFP's ODK server actually received it. Only WFP's cleaned data Excel export can prove that.

We need two separate facts to live as two separate statuses.

---

## 2. New Site Visit Status Chain

| Status | Set By | Meaning |
|---|---|---|
| `assigned` | Supervisor | Site allocated to enumerator for this cycle |
| `dispatched` | Supervisor | Enumerator sent to field |
| `submitted` | Enumerator (self-report) | Claims form was filled and sent to WFP ODK |
| `confirmed` | Cycle Close — WFP file match | WFP cleaned data file proves submission received |
| `rejected` | Cycle Close — WFP file match | Site not found in WFP file — needs resolution |
| `not_covered` | Supervisor (with mandatory reason) | Site not visited — officially documented |

**`submitted` fully replaces `completed`.** All existing `completed` records migrate to `submitted`.

Key principle:
- `submitted` = enumerator's claim (their accountability)
- `confirmed` = WFP's evidence (external proof)

---

## 3. How "Submitted" Works

The enumerator:
1. Goes to the field, collects data, submits the XLSForm to WFP ODK Central
2. Opens the PACT app → marks the site **Submitted**
3. Optionally notes an ODK submission reference or uploads a screenshot as evidence

This is a self-report recorded with timestamp + user ID. No external check happens here.

The Pre-Close Checklist gate "All site visits resolved" accepts `submitted` (or `not_covered`) as resolved — just like `completed` was before.

---

## 4. How "Confirmed" Works — WFP Cleaned Data File Upload

### The WFP File (from real file analysis)

WFP sends back a cleaned Excel file after every cycle (e.g., `February_2026_cleaned_data_PACT.xlsx`). From the actual file examined, the relevant columns are:

| WFP Column Name | Maps to PACT field | Role in matching |
|---|---|---|
| `SECTION_1/sitename` | `site_name` | **Primary match key** |
| `1.9. State of the site/where the site is located` | `state` | **Supporting match** |
| `1.10. Locality of the site/where the site is located` | `locality` | **Supporting match** |
| `1.15 Name of Implementing Partner` | `cp_name` / partner | **Supporting match** |
| `1.16.What kind of process monitoring are you going to conduct?` | `main_activity` / `activity_at_site` | **Supporting match** |
| `SECTION_1/fullsitename` | display only | For human review of match results |
| `1.4. Name of interviewer (or ID)` | `accepted_by_name` | Informational — not used for matching |
| `1:1.2. Monitoring cycle month` | cycle month | Sanity check — should match the cycle |
| `1:1.Monitoring cycle year` | cycle year | Sanity check |
| `Geographic Coordinates` | GPS | Informational |

**There is no P Code / Site Code column in the WFP file.** Matching is done on site name + location.

### Matching Algorithm

**Step 1 — Exact name + state + locality**
`SECTION_1/sitename` matches `mmp_site_entries.site_name` (case-insensitive, trimmed)
AND `1.9 State` matches `state`
AND `1.10 Locality` matches `locality`

→ If all three match: **Strong Match → Confirmed**

**Step 2 — Name + state only (locality mismatch)**
Site name and state match but locality differs slightly.
→ **Weak Match → Needs human review** — shown to admin for manual confirm/reject

**Step 3 — Name only (fuzzy)**
Site name matches but state or locality don't.
→ **Fuzzy Match → Always needs human review**

**Step 4 — No match**
Site is in PACT as `submitted` but has no row in WFP file at all.
→ **No Match → status becomes `rejected`** (goes to Exceptions)

**Step 5 — WFP row has no PACT site**
A row in the WFP file has no matching site in the cycle.
→ Logged as an **anomaly** — could mean a site submitted under a wrong MMP.

### Who Uploads the WFP File
Admin and super admin only.

### Match Outcomes Summary

| Result | Condition | PACT Status Update |
|---|---|---|
| Strong Match | Name + State + Locality all match | `submitted` → `confirmed` (auto) |
| Weak/Fuzzy Match | Partial match | Stays `submitted` — admin reviews |
| No Match | Nothing in WFP file | `submitted` → `rejected` |
| Not Covered | Site is `not_covered` | No change |
| WFP anomaly row | Row in WFP, no PACT site | Logged, no status change |

### Partial Confirmation is Allowed
A cycle can close with some sites still `rejected` or in `exceptions`. These are tracked in the Exceptions tab and handled via the resolution workflow below. The cycle field window is permanently closed after cycle close.

---

## 5. Scenario C — Not Covered Sites With Approved Money

This is the highest-risk case. An enumerator received approved payment (down-payment, transport advance) but the site was never visited.

When a supervisor marks a site `not_covered` and an associated cost exists, the system immediately opens a **Cost Recovery Decision** dialog.

### The Three Resolution Options

#### Option 1 — Roll to Next MMP (preferred)
The approved amount is pre-allocated to the same enumerator for the same site in a future MMP.

**Eligibility filter for the MMP selection list shown to admin:**
- Same state as the not-covered site
- Same data collector (same `accepted_by` user)
- Target MMP status is `active` or `draft` (not closed)
- Site exists in the target MMP's site list OR can be matched by name+location

The enumerator does not re-request — the money is already pre-allocated.

**Record created in `cost_recovery_log`:**
- Source MMP + site + amount
- Target MMP + site
- Decision: `rolled_over`
- Made by + timestamp

#### Option 2 — Return Required
Enumerator must return the money. Finance tracks repayment.

**Record:** Decision `return_required`, recovery amount, deadline (default 30 days), repayment status `pending → partially_repaid → repaid`.

#### Option 3 — Write-Off / Waiver
Amount written off with mandatory written justification. Requires Finance approval (or Super Admin override).

**Record:** Decision `written_off`, justification text (required), authorized by.

### Who Can Make Each Decision

| Decision | Supervisor | Admin | Finance | Super Admin |
|---|---|---|---|---|
| Roll to Next MMP | Propose | Approve | Approve | Approve |
| Return Required | Yes | Yes | Yes | Yes |
| Write-Off | Propose only | Propose | Approve (joint) | Approve solo |

### New Pre-Close Gate
> **All not-covered cost recoveries addressed**
> Every not-covered site that had an approved cost must have a resolution decision on record.

This gate blocks cycle close unless every such site has a decision (any option counts).

---

## 6. Scenario B — Submitted But Rejected (Not in WFP File)

The enumerator claimed to submit but WFP has no record.

### Resolution Options in Exceptions Tab

| Option | Who | Result |
|---|---|---|
| Evidence Provided | Enumerator provides ODK submission ID / screenshot | Admin reviews → manually override to `confirmed` with note |
| Accept Rejection | Admin accepts the gap | Status stays `rejected_final`, cost reviewed by finance |
| Dispute | Finance flags if enumerator did not go | Cost goes to `disputed` state for recovery decision |

**Key principle:** Cost is NOT automatically clawed back on rejection — the enumerator made the field visit. Finance reviews case by case.

Rejected sites do NOT block cycle close — they go to Exceptions.

---

## 7. Cycle Close Page — Full Revised Structure

### Phase 1 — Pre-Close Checklist (revised)

| Gate | Change | Notes |
|---|---|---|
| All site visits resolved | Updated | Now accepts `submitted` or `not_covered` as resolved (was `completed`) |
| No pending cost submissions | No change | |
| All transport advances reconciled | No change | |
| All withdrawal requests processed | No change | |
| All not-covered cost recoveries addressed | **NEW** | Only appears if any not-covered sites have associated costs |

### Phase 2 — WFP Data Confirmation (new)

Unlocks after Phase 1 passes (or Super Admin Override).

1. Upload WFP cleaned data Excel file
2. System reads file → matches by site name + state + locality
3. Admin reviews match results:
   - Strong matches: auto-confirmed
   - Weak/fuzzy: admin manually approves or rejects each
   - No match: flagged as rejected
4. Admin clicks "Apply Results" → bulk status updates
5. Anomaly rows (WFP data with no PACT site) shown separately

### Tab Structure

| Tab | Content |
|---|---|
| **Readiness** | Pre-close checklist (Phase 1) |
| **Sites** | All cycle sites — filterable by status, bulk mark actions |
| **WFP Confirmation** | Upload WFP file, match results, apply (Phase 2) |
| **Finance Review** | Existing reconciliation summary (no change) |
| **Exceptions** | Rejected sites + not-covered cost resolutions + disputed costs |
| **History** | Full audit log — who did what, when, with justification |

---

## 8. WFP File Column Mapping (Confirmed from Real File)

```
WFP Column                                          → PACT Field Used
──────────────────────────────────────────────────────────────────────
SECTION_1/sitename                                  → site_name (primary match)
1.9. State of the site/where the site is located    → state (supporting match)
1.10. Locality of the site/where the site is located → locality (supporting match)
1.15 Name of Implementing Partner                   → cp_name (supporting)
1.16.What kind of process monitoring...             → main_activity (supporting)
SECTION_1/fullsitename                              → display only
1.4. Name of interviewer (or ID)                    → enumerator name (informational)
1:1.Monitoring cycle year                           → cycle year (sanity check)
1:1.2. Monitoring cycle month                       → cycle month (sanity check)
```

No P Code / Site Code exists in the WFP file. Name + state + locality is the match key.

---

## 9. Answered Design Decisions

| Decision | Answer |
|---|---|
| Who uploads WFP file | Admin and Super Admin only |
| Who makes cost recovery decisions | Supervisor (propose), Admin, Finance, Super Admin |
| Cycle can close with some rejected sites | Yes — they go to Exceptions |
| Rejected sites re-openable | No — once cycle closed, field window is permanently closed |
| `submitted` replaces `completed` | Yes, fully |
| Roll-to-Next-MMP filter | Same state + same data collector + target MMP active/draft |
| Write-off authorization | Finance approval or Super Admin solo |

---

## 10. Open Questions (Still Pending)

| # | Question |
|---|---|
| Q1 | For Roll-to-Next-MMP: does the site need to already exist in the target MMP's site list, or can the system add it if not present? |
| Q2 | For Return Required: repayment mechanism — cash return, deduction from next payment, or both options available? |
| Q3 | Should the enumerator see their own rejection/exception status in the app, or is this admin-only? |
| Q4 | Write-off: is a text justification sufficient, or does Finance need to digitally sign (like existing approval signatures)? |
| Q5 | When admin does manual review of weak/fuzzy WFP matches, is one reviewer enough or does it need a second sign-off? |

---

## 11. Implementation Plan — Four Phases

### Phase A — Status Rename (Lowest Risk, Fastest)
**What:** Rename `completed` → `submitted` across the system.
**Scope:**
- Add `submitted` to all status dropdowns, badges, and filters
- Update `useCycleCloseReadiness.ts`: accept `submitted` as a resolved state (currently accepts `completed`)
- Update `MMPCycleClose.tsx`: all references to `completed` status
- Update `SuperAdminDataManagement.tsx` status filter options
- SQL migration: `UPDATE mmp_site_entries SET status = 'submitted' WHERE status = 'completed'`

**Impact:** Zero data loss. Purely a rename. Does not change any logic.
**Effort:** Small — 1 day

---

### Phase B — Not-Covered Cost Recovery Gate
**What:** Track and resolve approved costs for not-covered sites.
**Scope:**
- New DB table: `cost_recovery_log` (source_mmp_id, source_site_id, cost_amount, decision, target_mmp_id, target_site_id, resolved_by, resolved_at, justification, repayment_status)
- When a site is marked `not_covered` AND has associated approved costs → trigger resolution dialog
- Build resolution dialog with three options (Roll / Return / Write-Off)
- Roll option: query eligible MMPs (same state + same collector + active/draft)
- New checklist gate in `useCycleCloseReadiness.ts`
- Exceptions tab: show all not-covered sites with unresolved costs

**Effort:** Medium — 3–4 days

---

### Phase C — WFP Data Confirmation (XLS Upload + Matching)
**What:** Upload WFP cleaned data file and auto-match against cycle sites.
**Scope:**
- New "WFP Confirmation" tab on Cycle Close page
- File upload using existing xlsx.js parser
- Column mapping using flexible synonym system (same pattern as MMP upload)
- Three-tier matching: Strong (auto) / Weak (manual review) / No match (rejected)
- Anomaly detection: WFP rows with no PACT site
- Bulk status update: `submitted → confirmed` or `submitted → rejected`
- Manual override for weak/fuzzy matches with admin note
- Exceptions tab: show all `rejected` sites with resolution options

**Effort:** Medium-Large — 4–5 days

---

### Phase D — Roll-to-Next-MMP Full Flow
**What:** Complete the pre-allocated advance flow when rolling money forward.
**Scope:**
- Eligibility query: available MMPs for same state + same data collector
- Link rolled cost to target MMP as pre-approved advance (no new request needed)
- Notify supervisor and enumerator of the roll-over
- Show pre-allocated amounts in target MMP's finance view
- Badge on target MMP: "Includes rolled-over advance from [cycle]"

**Effort:** Medium — 3 days

---

### Suggested Build Order
```
Phase A → Phase B → Phase C → Phase D
  │           │          │         │
  Week 1    Week 1-2   Week 2-3  Week 3-4
```

Phase A can go live immediately. Each phase is independently deployable.

---

*Document is live — updated as decisions are finalized. Implementation begins after owner approval.*
