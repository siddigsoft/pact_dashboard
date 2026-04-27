# Cycle Close & Site Visit Status — Full Design & Build Plan

**Status:** Design Finalized — Ready for Build Approval
**Last updated:** 2026-04-27
**Participants:** Product Owner, Engineering

---

## PART 1 — WHAT THE SYSTEM DOES TODAY (BASELINE)

### Current Site Visit Status Values
`assigned` → `dispatched` → `completed` → `verified` → `not_covered`

**Problem:** `completed` means the enumerator finished in the PACT app. It says nothing about whether WFP's ODK server received the data. The system has no way to know.

### Current Cycle Close Page (`/mmp/cycle-close`)
The page has five tabs:
| Tab | What it does today |
|---|---|
| Active | Shows all active MMPs with their coverage stats |
| Uncovered | Shows sites with no visit — supervisor assigns Not Covered reasons |
| Reports | Exports and reports for the cycle |
| Comparison | Compares two cycles side by side |
| Scorecard | Quality scores per hub/enumerator |

There is also a **Pre-Close Checklist** (above the tabs) that checks four gates before allowing cycle close:
1. All site visits resolved (checks for `completed`, `approved`, `cancelled`, or `not_covered`)
2. No pending cost submissions
3. All transport advances reconciled
4. All withdrawal requests processed

---

## PART 2 — ALL DESIGN DECISIONS (FINALIZED)

### 2.1 New Status: `submitted` Replaces `completed`

| Old Status | New Status | Who Sets It | What It Means |
|---|---|---|---|
| `completed` | **`submitted`** | Enumerator (self-report in app) | "I filled the XLSForm and sent it to WFP ODK" |
| *(new)* | **`confirmed`** | System (WFP file match) | WFP cleaned data file proves submission received |
| *(new)* | **`rejected`** | System (WFP file match) | Not found in WFP file — needs resolution |
| `not_covered` | `not_covered` | Supervisor (with mandatory reason) | Site not visited — officially documented |

All existing `completed` records become `submitted` via a one-time SQL update.

**Why keep `submitted` separate from `confirmed`?**
Because you cannot control the WFP server. The enumerator's claim and WFP's proof are two different facts and must live as two different statuses. `confirmed` is the only status that means "WFP has the data."

### 2.2 Roll-to-Next-MMP (Q1 — More Explanation)

When a site is marked Not Covered and money was already approved, one resolution option is to roll the money forward to the same enumerator in a future MMP.

**What "Roll to Next MMP" means exactly:**
- The approved amount stays with the same enumerator (not lost, not returned)
- It gets pre-allocated to a specific future site in a specific future MMP
- The enumerator does NOT need to submit a new request — the money is already there
- The pre-allocation shows up in the target MMP's down-payment view as "Pre-approved (Rolled Over)"
- A link back to the source MMP and reason is always visible

**How the system finds eligible MMPs:**
The dropdown shows only MMPs where ALL of the following are true:
- Same **state** as the not-covered site
- Same **data collector** (the `accepted_by` user)
- MMP status is `active` or `draft` (not already closed)
- The site exists in the target MMP site list OR (if not, see below)

**Q1 answered — Does the site need to exist in the target MMP?**
It is preferred that the site already exists in the target MMP's list. If it does not, the admin sees a warning ("Site not in target MMP") and can still proceed — the system will add the site entry to the target MMP automatically. This keeps the process flexible while flagging the edge case.

### 2.3 Return Required — Repayment Options (Q2 Answered)

When money must come back, the following repayment methods are available (admin selects one or more):

| Method | How It Works |
|---|---|
| **Cash Return** | Enumerator physically returns cash to the office. Finance records receipt. |
| **Deduction from Next Payment** | Amount is deducted automatically from the enumerator's next approved down-payment. System holds a deduction flag. |
| **Move to Enumerator Fees** | Amount is reclassified from transport/site cost to enumerator fee in the accounting records. |
| **Reuse for Other Sites** | Amount is re-allocated to a different site (same or different MMP) — admin selects target site. |

Admin picks which method applies. Finance tracks the status: `pending → in_progress → settled`.

### 2.4 Enumerator Sees Rejection in the App (Q3 Answered)
Yes. In the PACT mobile app and web app, when an enumerator's site is moved to `rejected` status, they see:
- Site card shows a red **"Not Confirmed by WFP"** badge
- A short message: "Your submission for [Site Name] was not found in the WFP data. Your supervisor has been notified."
- They can see any evidence they previously uploaded
- They cannot change the status themselves — only the admin can resolve it

### 2.5 Write-Off Requires Digital Signature (Q4 Answered)
Yes. Write-off approval follows the same digital signature flow as existing cost approvals. Finance signs off. Super Admin can override and sign solo. The signed record is stored and visible in the audit trail.

### 2.6 One Reviewer for Weak WFP Matches (Q5 Answered)
One admin reviewer is sufficient to confirm or reject a weak/fuzzy match from the WFP file. Their name, timestamp, and note are recorded in the audit log.

### 2.7 WFP File Matching Keys (from Real File Analysis)
The WFP cleaned data Excel (`February_2026_cleaned_data_PACT.xlsx`) has no P Code / Site Code column. Matching is done by:

| WFP Column | PACT Field | Role |
|---|---|---|
| `SECTION_1/sitename` | `site_name` | **Primary match key** |
| `1.9. State of the site/where the site is located` | `state` | Supporting |
| `1.10. Locality of the site/where the site is located` | `locality` | Supporting |
| `1.15 Name of Implementing Partner` | `cp_name` | Supporting |
| `1.16.What kind of process monitoring are you going to conduct?` | `main_activity` | Supporting |

**Match tiers:**
- **Strong:** site name + state + locality all match → auto-confirmed
- **Weak:** site name + state match, locality differs → admin reviews manually (one reviewer)
- **Fuzzy:** site name matches but location differs → admin reviews manually
- **No match:** site not found in WFP file at all → `rejected`
- **WFP anomaly:** row in WFP file with no matching PACT site → logged, no status change

---

## PART 3 — PAGE-BY-PAGE CHANGE PLAN

This section describes every page that changes, what it does now, what changes, and what stays the same.

---

### PAGE 1: MMP Cycle Close (`/mmp/cycle-close`)

**What this page does:**
This is the command center for officially ending a monitoring cycle. Supervisors and admins use it to check that all sites are accounted for, all money is settled, and the cycle is ready to close. It is where the MMP transitions from "active field work" to "officially closed and archived."

**Current state:**
- Pre-Close Checklist above tabs with 4 gates
- 5 tabs: Active, Uncovered, Reports, Comparison, Scorecard

#### Changes — Pre-Close Checklist (partial change)

**Gate 1 — Site Visits Resolved:**
Change: currently checks for `completed` as a resolved state. Update to accept `submitted` instead of `completed`. Logic otherwise identical.

**Gate 5 — NEW: Not-Covered Cost Recoveries Addressed:**
A fifth gate is added to the checklist. It only appears when at least one site in the cycle is `not_covered` AND has an associated approved cost. It checks that every such site has a cost recovery decision on record (Roll / Return / Write-Off).
- If none of the not-covered sites have approved costs → gate auto-passes (hidden or shown as N/A)
- If any such site has no decision → gate blocks cycle close
- Resolve link → jumps to the Exceptions tab

#### Changes — Existing Tabs

**Tab: Active** — Partial change
- Site visit status badges: rename `completed` → `submitted` everywhere
- Add two new badges: `confirmed` (green, checkmark) and `rejected` (red, warning)
- Progress bars and coverage stats now count `submitted` + `confirmed` as "visited"
- Coverage % formula: (submitted + confirmed + not_covered_with_reason) / total

**Tab: Uncovered** — Partial change
- When supervisor marks a site Not Covered AND there is an associated approved cost:
  - A warning banner appears on the site card: "This site has an approved cost of SDG X. A resolution is required."
  - Clicking "Set Resolution" opens the Cost Recovery Dialog (see below)
- No change to the Not Covered reason dropdown or existing bulk-reason logic

**Tab: Reports** — No change

**Tab: Comparison** — No change

**Tab: Scorecard** — No change

#### Changes — New Tabs Added

**New Tab: WFP Confirmation**
This is Phase 2 of the cycle close process. It only becomes active after the Pre-Close Checklist passes (or Super Admin Override is used).

Purpose: Upload the WFP cleaned data Excel file and match it against the cycle's submitted sites to produce `confirmed` or `rejected` outcomes.

What it shows:
- A page guide explaining the process (see Guide section below)
- Upload area: drag-and-drop or click to upload the WFP Excel file
- Cycle selector: which MMP this file belongs to
- After upload: a match results table showing:
  - Strong matches (auto-confirmed) — shown in green
  - Weak/fuzzy matches — shown in amber, with "Confirm" / "Reject" buttons and a note field
  - No matches / rejected sites — shown in red
  - WFP anomaly rows (in file but not in PACT) — shown separately
- Summary counts: X Confirmed, Y Needs Review, Z Rejected, W Anomalies
- "Apply Results" button: applies all auto-confirmed and manually reviewed decisions in bulk
- Audit note field: admin adds a note that goes into the history log with the upload

**In-page guide for WFP Confirmation tab:**
> "This tab is used to verify which sites' data was actually received by WFP. Upload the cleaned data Excel file that WFP sends after processing ODK submissions. The system will automatically match sites by name, state, and locality. Strong matches are confirmed automatically. Weaker matches need your review — you can confirm or reject each one with a note. Rejected sites will appear in the Exceptions tab for follow-up. This step is optional if you choose to close without WFP confirmation, but it is recommended for full accountability."

**New Tab: Exceptions**
A holding area for all unresolved issues that don't block cycle close but need follow-up.

Purpose: Give admin and finance a single place to see and resolve all outstanding issues from a cycle — rejected WFP matches, disputed costs, unresolved cost recoveries.

What it shows — three sections:

Section A — Rejected Sites (WFP not confirmed):
- Table of sites in `rejected` status
- Columns: Site Name, State, Locality, Enumerator, Submitted At, Resolution
- Resolution options per row:
  - "Evidence Provided" → admin uploads/enters ODK submission ID → manually override to `confirmed`
  - "Accept Rejection" → status becomes `rejected_final`, cost flagged for finance review
  - "Dispute" → marks cost as `disputed` → triggers cost recovery dialog

Section B — Not-Covered Cost Recoveries:
- Table of not-covered sites that have an approved cost and a decision recorded
- Shows: Decision type, amount, target MMP (if rolled), repayment status, authorized by
- Finance can update repayment status here

Section C — Disputed Costs:
- Sites where cost is under dispute
- Finance resolves via the same digital signature flow as cost approvals

**In-page guide for Exceptions tab:**
> "This tab shows all sites and costs from this cycle that need follow-up but did not block the cycle from closing. Rejected sites are ones where WFP's data file had no matching submission — work with the enumerator or accept the gap. Not-covered cost recoveries show how approved money was handled when a site was not visited. Resolve each item here to keep the cycle fully clean."

**New Tab: History**
A complete audit log of everything that happened during the cycle close process.

What it shows:
- Chronological list of events: who did what, when, with what note/justification
- Event types logged: gate checks, overrides, WFP file uploads, match results, cost recovery decisions, status changes, digital signatures
- Filter by: date, user, event type
- Export to PDF/Excel

**In-page guide for History tab:**
> "This tab is a full audit trail of the cycle close process. Every action taken — from checking the readiness gates to uploading the WFP file to approving write-offs — is recorded here with the person's name and timestamp. This is the record of accountability for the cycle."

---

### PAGE 2: Site Visits (wherever site visit status is displayed)

This covers all pages and components that show or filter by site visit status.

**Files affected:**
- `src/pages/MMPCycleClose.tsx` — status badges in the Active tab
- `src/components/superAdmin/SuperAdminDataManagement.tsx` — Claimed Sites tab status filter
- Any site visit cards, tables, or status dropdowns elsewhere

**Changes:**
- Add `submitted` as a recognized status everywhere `completed` was shown
- Add `confirmed` status: green badge with checkmark icon, label "WFP Confirmed"
- Add `rejected` status: red badge with warning icon, label "Not in WFP File"
- Status filter dropdowns: add `submitted`, `confirmed`, `rejected` options
- Coverage calculations: count both `submitted` and `confirmed` as "visited"

**No change to:** the visit assignment, dispatch, not-covered, or recall workflows.

---

### PAGE 3: Enumerator App View (My Sites / Field View)

**What this page does:**
The enumerator's view of their assigned sites for the current cycle. They use it to see which sites they need to visit, mark progress, and report submission.

**Changes:**

When the enumerator marks a site as Submitted:
- Site card status changes from the dispatch icon to a "Submitted" badge
- Timestamp recorded
- Optional: upload screenshot or enter ODK reference number as evidence

When a site becomes `rejected` (after admin runs WFP match):
- Site card shows red **"Not Confirmed by WFP"** badge
- Message shown: "Your submission for [Site Name] was not found in the WFP data. Your supervisor has been notified."
- Enumerator can see any evidence they uploaded
- Enumerator CANNOT change the status — it is read-only at this point
- A notification is also sent to the enumerator (in-app + WhatsApp if opted in)

When a site becomes `confirmed`:
- Site card shows green **"WFP Confirmed"** badge
- No action needed — this is good news

---

### PAGE 4: Down-Payment Approval (`/down-payment`)

**What this page does:**
Admins and finance use this page to approve, reject, and track transport advances and enumerator down-payments. It shows all requests with their approval status.

**Changes — Cost Recovery Display:**
When a cost has a recovery decision (from the Cycle Close Exceptions resolution), a new badge appears on that cost's row:
- **"Rolled Over →"** with the target MMP name (if rolled)
- **"Return Required"** with repayment status (if return)
- **"Written Off"** with authorization info (if write-off)
- **"Deducted from Next"** badge if deduction method was selected

**Changes — Pre-Approved Rolled Costs:**
When a cost was rolled from a previous cycle, it appears in the down-payment list with:
- A "Pre-Approved (Rolled from [Source MMP])" label
- No "Pending Approval" step — it is already approved
- Finance can see the source MMP and original reason

**What stays the same:** The approval workflow for new requests is unchanged. The existing approval tiers, bulk approve, admin approve — all unchanged.

---

### PAGE 5: Cost Recovery Dialog (New UI Component)

This is not a page — it is a dialog that appears in two places:
1. On the Uncovered tab of Cycle Close when a not-covered site has approved costs
2. On the Exceptions tab when admin resolves a rejected site

**What it shows:**
- Site name, state, locality, enumerator name
- Cost details: amount, cost type (transport/down-payment), approval date, approved by
- Three resolution sections (only one can be selected):

**Section A — Roll to Next MMP**
- Explanation text: "The approved amount stays with this enumerator but is pre-allocated to a future site."
- Dropdown: "Select target MMP" — shows only eligible MMPs (same state + same enumerator + active/draft)
- Warning if site not in target MMP: "Site not found in target MMP — it will be added automatically"
- Confirm button

**Section B — Return Required**
- Explanation text: "The enumerator must return the funds."
- Checkbox group: select repayment method(s) — Cash Return / Deduction from Next Payment / Move to Enumerator Fees / Reuse for Other Sites
- If "Reuse for Other Sites": additional field to select target site/MMP
- Recovery deadline date field (default: 30 days from today)
- Confirm button

**Section C — Write-Off / Waiver**
- Explanation text: "The amount is written off with justification. Requires Finance digital signature."
- Justification text field (required, minimum 50 characters)
- Digital signature component (same as existing cost approval signatures)
- Authorization levels shown: Finance approval needed, or Super Admin can override
- Confirm button (triggers signature flow)

---

### PAGE 6: Finance / Reconciliation (reference only, no structural changes)

The existing Finance and Reconciliation pages gain:
- Visibility of `cost_recovery_log` records in relevant views
- Repayment tracking for Return Required decisions
- Write-off records appear in the audit trail with digital signatures

No tab changes, no page restructuring.

---

### DATABASE CHANGES REQUIRED

The following new SQL objects are needed (to be written as migration files):

**1. Status value migration:**
```sql
-- Rename all completed site visits to submitted
UPDATE mmp_site_entries SET status = 'submitted' WHERE status = 'completed';
UPDATE site_visits SET status = 'submitted' WHERE status = 'completed';
```

**2. New table: `cost_recovery_log`**
```
id (uuid, pk)
source_mmp_id (uuid, fk mmp_files)
source_site_id (uuid, fk mmp_site_entries)
cost_type (text: 'down_payment' | 'transport_advance' | 'enumerator_fee')
cost_amount (numeric)
cost_reference_id (uuid — ID of the original down_payment_request or similar)
decision (text: 'rolled_over' | 'return_required' | 'written_off' | 'deducted' | 'reused')
target_mmp_id (uuid, nullable — for rolled_over and reused)
target_site_id (uuid, nullable)
repayment_method (text[], nullable — for return_required)
repayment_status (text: 'pending' | 'in_progress' | 'settled', nullable)
repayment_deadline (date, nullable)
justification (text, nullable — required for written_off)
signature_id (uuid, nullable — for written_off)
resolved_by (uuid, fk profiles)
resolved_at (timestamptz)
notes (text, nullable)
```

**3. New table: `wfp_confirmation_uploads`**
```
id (uuid, pk)
mmp_id (uuid, fk mmp_files)
uploaded_by (uuid, fk profiles)
uploaded_at (timestamptz)
filename (text)
storage_path (text)
total_rows (int)
strong_matches (int)
weak_matches (int)
no_matches (int)
anomalies (int)
status (text: 'pending_review' | 'applied')
applied_at (timestamptz, nullable)
applied_by (uuid, nullable)
notes (text, nullable)
```

**4. New table: `wfp_match_results`**
```
id (uuid, pk)
upload_id (uuid, fk wfp_confirmation_uploads)
site_entry_id (uuid, fk mmp_site_entries)
match_tier (text: 'strong' | 'weak' | 'fuzzy' | 'none')
wfp_site_name (text)
wfp_state (text)
wfp_locality (text)
wfp_partner (text)
wfp_activity (text)
admin_decision (text: 'confirmed' | 'rejected' | null — null until reviewed)
admin_note (text, nullable)
reviewed_by (uuid, nullable)
reviewed_at (timestamptz, nullable)
```

---

## PART 4 — BUILD PHASES

### Phase A — Status Rename (1 day)
**Scope:** Rename `completed` → `submitted` everywhere.
- SQL migration: update existing records
- Update status badges, filters, dropdowns on all affected pages
- Update `useCycleCloseReadiness.ts`: accept `submitted` as resolved
- Update `MMPCycleClose.tsx`: coverage counts, display labels
- Update `SuperAdminDataManagement.tsx`: status filter options

**Pages touched:** Cycle Close, Super Admin Data, any status dropdowns
**Can deploy independently:** Yes

---

### Phase B — Not-Covered Cost Recovery Gate (3–4 days)
**Scope:** Track and resolve approved costs for not-covered sites.
- Create `cost_recovery_log` table (SQL migration file)
- Build Cost Recovery Dialog component
- Trigger dialog when site marked Not Covered + cost exists
- Add 5th gate to Pre-Close Checklist
- Add "Section B" to Exceptions tab
- Finance sign-off flow for write-offs

**Pages touched:** Cycle Close (Uncovered tab + new Exceptions tab), Down-Payment Approval
**Can deploy independently:** Yes (after Phase A)

---

### Phase C — WFP Data Confirmation Tab (4–5 days)
**Scope:** Upload WFP cleaned Excel, match, apply results.
- Create `wfp_confirmation_uploads` and `wfp_match_results` tables
- Build WFP Confirmation tab on Cycle Close page
- File upload + xlsx.js parsing (reuse existing MMP upload engine)
- Column mapping with synonym system (same pattern as MMP upload)
- Three-tier matching logic
- Weak/fuzzy match manual review UI
- Bulk "Apply Results" action
- Add `confirmed` and `rejected` statuses to all status displays
- Add "Section A — Rejected Sites" to Exceptions tab
- Add History tab

**Pages touched:** Cycle Close (new WFP Confirmation tab, Exceptions tab, History tab), Enumerator view
**Can deploy independently:** Yes (after Phase A)

---

### Phase D — Roll-to-Next-MMP Full Flow (3 days)
**Scope:** Complete the pre-allocated advance flow.
- Eligibility query: active MMPs matching same state + collector
- Auto-add site to target MMP if not present (with warning)
- Mark cost as pre-approved in target MMP down-payment view
- Notify supervisor and enumerator of the roll-over
- Show rolled-from badge in target MMP finance view

**Pages touched:** Down-Payment Approval, Cycle Close Exceptions tab
**Can deploy independently:** Yes (after Phase B)

---

### Suggested Order and Timeline
```
Week 1:   Phase A (status rename)        — 1 day
Week 1-2: Phase B (cost recovery gate)   — 3-4 days
Week 2-3: Phase C (WFP confirmation)     — 4-5 days
Week 3-4: Phase D (roll-to-next-MMP)     — 3 days
```

Each phase is independently deployable. Phase A should go live first as it has zero risk and unblocks everything else visually.

---

## PART 5 — IN-PAGE GUIDES

Each new section/tab will have a "How this works" collapsible guide. Here are the exact texts:

**Cycle Close page (top of page):**
> "The cycle close process has two phases. Phase 1 is the Pre-Close Checklist — all gates must pass before closing. Phase 2 is WFP Confirmation — upload the cleaned data file from WFP to verify which sites were actually received. You can close the cycle after Phase 1 and handle Phase 2 afterwards, but Phase 2 is required for full accountability."

**WFP Confirmation tab:**
> "Upload the cleaned data Excel file that WFP sends after processing ODK submissions (e.g., 'February_2026_cleaned_data_PACT.xlsx'). The system matches sites using the site name, state, and locality columns. Strong matches are confirmed automatically. Amber rows need your review — confirm or reject each one. Red rows (no match) will be moved to Exceptions. Once you are satisfied, click 'Apply Results' to update all site statuses."

**Exceptions tab:**
> "This tab tracks all unresolved issues from this cycle. It does not block the cycle from being closed, but every item here should be resolved before the next cycle begins. Rejected sites need evidence or acceptance. Not-covered cost resolutions track how approved money was handled. Disputed costs require Finance sign-off."

**Cost Recovery Dialog:**
> "This site was not visited but has an approved payment. Choose how to handle the funds: roll them to the same enumerator's next assignment in the same state, require a return, or write off the amount with justification. All decisions are recorded and visible to Finance."

---

*This document is the single source of truth for this feature set. Implementation begins on Phase A after owner approval.*
