# Cycle Close & Site Visit Status — Full Design & Build Plan

**Status:** Design Finalized — Ready for Build Approval
**Last updated:** 2026-04-27 (rev 2 — full money tracking + timestamps added)
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

## PART 2B — MONEY TRACKING & TIMESTAMPS (FULL ACCOUNTABILITY LAYER)

### 2B.1 — The Core Principle

Every single SDG that moves in the system must have a complete, unbroken paper trail. Any user — enumerator, supervisor, admin, finance, super admin — should be able to look at a site, a payment, or an MMP and see the full history of that money: where it came from, when it was approved, when it moved, where it went, and what happened to it.

No money can disappear silently. No status can change without a timestamp and a name.

---

### 2B.2 — What Gets Tracked for Every Payment

For every down-payment or transport advance tied to a site, the system records and displays a **Money Trail**. This is a chronological log of every event that touched that payment.

Every entry in the trail records:
- **What happened** (the event type)
- **Amount** (SDG X)
- **Site** (Site Name + Site Code)
- **MMP** (MMP name, month, year)
- **Who did it** (full name of the user who triggered the event)
- **Role of that user** (enumerator, supervisor, admin, finance, etc.)
- **When exactly** (full timestamp: date + time + timezone)
- **Note or justification** (if applicable)

---

### 2B.3 — The Full Money Event List (Every Event That Gets Logged)

| Event | When It Happens |
|---|---|
| `payment_requested` | Enumerator submits a down-payment or transport advance request |
| `payment_approved_tier1` | First-tier approver (supervisor/admin) approves |
| `payment_approved_tier2` | Second-tier approver (finance/admin) approves |
| `payment_rejected` | Request rejected at any tier — reason recorded |
| `payment_sent` | Money physically sent / disbursed to the enumerator |
| `payment_received_confirmed` | Enumerator confirms receipt |
| `site_claimed` | Enumerator claims the site for this MMP |
| `site_dispatched` | Supervisor dispatches enumerator to site |
| `site_submitted` | Enumerator marks site as submitted to WFP |
| `site_confirmed` | System confirms site from WFP file upload |
| `site_rejected` | System marks site as not found in WFP file |
| `site_not_covered` | Site marked as Not Covered with reason |
| `recovery_decision_rolled` | Money rolled to next MMP — target MMP + site recorded |
| `recovery_decision_return` | Return required — amount + method + deadline recorded |
| `recovery_decision_writeoff` | Write-off approved — justification + signature recorded |
| `recovery_repayment_received` | Partial or full repayment recorded by finance |
| `recovery_deducted` | Deduction taken from next payment |
| `wfp_match_confirmed` | Admin manually confirmed a weak/fuzzy WFP match |
| `wfp_match_rejected` | Admin manually rejected a weak/fuzzy WFP match |
| `cycle_closed` | Cycle officially closed |
| `status_override` | Any manual status change by admin/super admin (with reason) |

---

### 2B.4 — Where This Trail Is Visible

#### For the Enumerator (in their app view — My Sites / Field View)

Every site the enumerator has ever been assigned shows a **"Money Timeline"** section on the site detail card. It shows only events relevant to them:

```
Site: ALMATAR | MMP: February 2026 | State: Gedaref

💰 Money Timeline
─────────────────────────────────────────────────────────
✅  SDG 1,200 requested          — You          — 14 Feb 2026, 09:14 AM
✅  SDG 1,200 approved (Tier 1)  — Ahmed Hassan  — 14 Feb 2026, 02:30 PM
✅  SDG 1,200 approved (Tier 2)  — Finance Desk  — 15 Feb 2026, 10:05 AM
💸  SDG 1,200 sent to you        — Finance Desk  — 15 Feb 2026, 11:00 AM
📋  Site submitted to WFP        — You          — 17 Feb 2026, 04:22 PM
⚠️  Not found in WFP file        — System       — 25 Feb 2026, 09:00 AM
    "Your submission was not found in the February WFP data.
     Your supervisor has been notified."
```

The enumerator sees exactly what happened to the money for this site in this MMP. Nothing is hidden.

If money was rolled to a next MMP:
```
🔄  SDG 1,200 rolled to next MMP — Admin: Sara Ali — 28 Feb 2026, 03:15 PM
    "Rolled to: March 2026 MMP | Site: ALMATAR"
    "Reason: Site not covered in February 2026"
```

If return was required:
```
⚠️  SDG 1,200 return required    — Finance: Omar — 28 Feb 2026, 02:00 PM
    "Method: Deduction from next payment"
    "Deadline: 30 Mar 2026"
```

---

#### For the Supervisor / Admin / Finance (full trail, all users)

In the Down-Payment Approval page and the Cycle Close Exceptions tab, every payment row has an expandable **Full Money Trail** panel showing every event above, with full names, timestamps, and notes.

In the admin view, they also see events the enumerator does not see:
- Internal approval notes
- Finance authorization details
- Digital signature IDs for write-offs

---

#### For Super Admin (in Super Admin Data Management)

In the Claimed Sites tab and any financial summary view, a "Payments" column shows the total amount sent to each enumerator for each site/MMP combination, with a drill-down link to the full trail.

---

### 2B.5 — Timestamps on Every Status Change

Every time a site visit status changes, the following is recorded in a `site_visit_status_log` table:

```
site_visit_id     — which site entry
old_status        — what the status was before
new_status        — what it changed to
changed_by        — user id (with role at time of change)
changed_at        — full timestamp with timezone
change_source     — 'user_action' | 'system_wfp_match' | 'admin_override' | 'bulk_action' | 'migration'
note              — optional text (required for overrides)
mmp_id            — which MMP this belongs to
mmp_name          — MMP name at time of change (denormalized for history clarity)
```

This table is append-only — records are never deleted or updated. Every state the site has ever been in is preserved forever.

**Example for ALMATAR site:**
```
assigned    → dispatched   | Ahmed (supervisor)  | 10 Feb 2026 08:00 | user_action
dispatched  → submitted    | Enumerator          | 17 Feb 2026 16:22 | user_action
submitted   → rejected     | System              | 25 Feb 2026 09:00 | system_wfp_match
rejected    → confirmed    | Sara Ali (admin)    | 26 Feb 2026 11:30 | admin_override
                             "Evidence provided: ODK ref #ABC123"
```

---

### 2B.6 — Money Trail Database Table: `payment_event_log`

```
id               (uuid, pk)
event_type       (text — from the event list in 2B.3)
amount           (numeric — SDG amount at time of event)
site_entry_id    (uuid, fk mmp_site_entries)
site_name        (text — denormalized for history)
site_code        (text — denormalized for history)
mmp_id           (uuid, fk mmp_files)
mmp_name         (text — denormalized for history, e.g. "February 2026 — Gedaref")
payment_ref_id   (uuid — ID of the down_payment_request or cost_recovery_log row)
triggered_by     (uuid, fk profiles)
triggered_by_name (text — denormalized full name)
triggered_by_role (text — role at time of event)
triggered_at     (timestamptz — full timestamp with timezone)
note             (text, nullable)
metadata         (jsonb — any extra context, e.g. target MMP for roll-over)
```

This table is the single source of truth for money accountability. It is append-only and never modified after insert.

---

### 2B.7 — Site Visit Status Log Table: `site_visit_status_log`

```
id               (uuid, pk)
site_entry_id    (uuid, fk mmp_site_entries)
mmp_id           (uuid, fk mmp_files)
mmp_name         (text — denormalized)
site_name        (text — denormalized)
old_status       (text)
new_status       (text)
changed_by       (uuid, fk profiles)
changed_by_name  (text — denormalized)
changed_by_role  (text — role at time of change)
changed_at       (timestamptz)
change_source    (text: 'user_action' | 'system_wfp_match' | 'admin_override' | 'bulk_action' | 'migration')
note             (text, nullable — required for admin_override)
```

Append-only. Never deleted.

---

### 2B.8 — Notification Triggers for Money Events

When any money event occurs, the relevant users are notified automatically:

| Event | Who Gets Notified | Channel |
|---|---|---|
| Payment approved | Enumerator | In-app + WhatsApp (if opted in) |
| Payment sent | Enumerator | In-app + WhatsApp |
| Site rejected by WFP | Enumerator + Supervisor | In-app + WhatsApp |
| Site confirmed by WFP | Enumerator | In-app |
| Return required | Enumerator + Finance | In-app + Email |
| Money rolled to next MMP | Enumerator + Supervisor | In-app + WhatsApp |
| Write-off signed | Finance + Super Admin | In-app + Email |
| Repayment recorded | Enumerator | In-app |
| Repayment overdue | Enumerator + Finance + Admin | In-app + Email |

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

**2. New table: `site_visit_status_log`** *(append-only — never updated or deleted)*
```
id               (uuid, pk, default gen_random_uuid())
site_entry_id    (uuid, fk mmp_site_entries)
mmp_id           (uuid, fk mmp_files)
mmp_name         (text — denormalized for permanent record)
site_name        (text — denormalized)
site_code        (text — denormalized)
old_status       (text)
new_status       (text)
changed_by       (uuid, fk profiles)
changed_by_name  (text — denormalized full name)
changed_by_role  (text — role at time of change)
changed_at       (timestamptz, default now())
change_source    (text: 'user_action' | 'system_wfp_match' | 'admin_override' | 'bulk_action' | 'migration')
note             (text, nullable — required when change_source = 'admin_override')
```

**3. New table: `payment_event_log`** *(append-only — never updated or deleted)*
```
id                (uuid, pk, default gen_random_uuid())
event_type        (text — see full event list in 2B.3)
amount            (numeric — SDG amount at time of event)
site_entry_id     (uuid, fk mmp_site_entries, nullable)
site_name         (text — denormalized)
site_code         (text — denormalized)
mmp_id            (uuid, fk mmp_files, nullable)
mmp_name          (text — denormalized, e.g. "February 2026 — Gedaref")
payment_ref_id    (uuid — fk to down_payment_requests or cost_recovery_log)
triggered_by      (uuid, fk profiles)
triggered_by_name (text — denormalized full name)
triggered_by_role (text — role at time of event)
triggered_at      (timestamptz, default now())
note              (text, nullable)
metadata          (jsonb — extra context: target_mmp_id, target_site_id, repayment_method, etc.)
```

**4. New table: `cost_recovery_log`**
```
id                (uuid, pk, default gen_random_uuid())
source_mmp_id     (uuid, fk mmp_files)
source_mmp_name   (text — denormalized)
source_site_id    (uuid, fk mmp_site_entries)
source_site_name  (text — denormalized)
cost_type         (text: 'down_payment' | 'transport_advance' | 'enumerator_fee')
cost_amount       (numeric)
cost_reference_id (uuid — fk to down_payment_requests)
decision          (text: 'rolled_over' | 'return_required' | 'written_off' | 'deducted' | 'reused')
target_mmp_id     (uuid, nullable)
target_mmp_name   (text, nullable — denormalized)
target_site_id    (uuid, nullable)
target_site_name  (text, nullable — denormalized)
repayment_method  (text[], nullable)
repayment_status  (text: 'pending' | 'in_progress' | 'settled', nullable)
repayment_deadline (date, nullable)
justification     (text, nullable — required for written_off, min 50 chars)
signature_id      (uuid, nullable — for written_off)
resolved_by       (uuid, fk profiles)
resolved_by_name  (text — denormalized)
resolved_at       (timestamptz, default now())
notes             (text, nullable)
created_at        (timestamptz, default now())
updated_at        (timestamptz)
```

**5. New table: `wfp_confirmation_uploads`**
```
id              (uuid, pk, default gen_random_uuid())
mmp_id          (uuid, fk mmp_files)
mmp_name        (text — denormalized)
uploaded_by     (uuid, fk profiles)
uploaded_by_name (text — denormalized)
uploaded_at     (timestamptz, default now())
filename        (text)
storage_path    (text)
total_rows      (int)
strong_matches  (int)
weak_matches    (int)
no_matches      (int)
anomalies       (int)
status          (text: 'pending_review' | 'applied')
applied_at      (timestamptz, nullable)
applied_by      (uuid, nullable)
applied_by_name (text, nullable — denormalized)
notes           (text, nullable)
```

**6. New table: `wfp_match_results`**
```
id              (uuid, pk, default gen_random_uuid())
upload_id       (uuid, fk wfp_confirmation_uploads)
site_entry_id   (uuid, fk mmp_site_entries)
site_name       (text — denormalized)
mmp_id          (uuid, fk mmp_files)
match_tier      (text: 'strong' | 'weak' | 'fuzzy' | 'none')
wfp_site_name   (text)
wfp_state       (text)
wfp_locality    (text)
wfp_partner     (text)
wfp_activity    (text)
admin_decision  (text: 'confirmed' | 'rejected' | null)
admin_note      (text, nullable)
reviewed_by     (uuid, nullable)
reviewed_by_name (text, nullable — denormalized)
reviewed_at     (timestamptz, nullable)
created_at      (timestamptz, default now())
```

**Denormalization policy:** Name fields (site_name, mmp_name, triggered_by_name, etc.) are stored directly in every log table. This ensures the history is readable even if the source record is later renamed or deleted. These fields are never updated after insert.

---

## PART 4 — BUILD PHASES

### Phase A — Status Rename + Logging Infrastructure (1–2 days)
**Scope:** Rename `completed` → `submitted` everywhere AND create the two core tracking tables that all future phases depend on.

- SQL migration: `UPDATE mmp_site_entries SET status = 'submitted' WHERE status = 'completed'`
- Create `site_visit_status_log` table (append-only, RLS: read for own records + admin/finance/super_admin)
- Create `payment_event_log` table (append-only, empty shell — events start from Phase B)
- Write shared `logStatusChange(siteId, oldStatus, newStatus, user, source, note?)` service — called by every status mutation going forward
- Write shared `logPaymentEvent(eventType, amount, siteId, mmpId, paymentRefId, user, note?, metadata?)` service
- Backfill `site_visit_status_log` for all existing records with `change_source = 'migration'`
- Update status badges, filters, dropdowns on all affected pages to show `submitted`
- Update `useCycleCloseReadiness.ts`: accept `submitted` as resolved (alongside `approved`, `cancelled`, `not_covered`)
- Update `MMPCycleClose.tsx`: coverage counts, display labels
- Update `SuperAdminDataManagement.tsx`: status filter — add `submitted`, `confirmed`, `rejected`

**Pages touched:** Cycle Close, Super Admin Data Management, any status dropdowns
**New tables:** `site_visit_status_log`, `payment_event_log`
**Can deploy independently:** Yes — zero functional change for users, pure infrastructure

---

### Phase B — Cost Recovery Gate + Money Trail (3–4 days)
**Scope:** Track and resolve approved costs for not-covered sites. Every money event writes to `payment_event_log`.

- Create `cost_recovery_log` table
- Build Cost Recovery Dialog (Roll / Return / Write-Off) — each decision calls `logPaymentEvent()`
- Trigger dialog when a site is marked Not Covered AND an approved cost exists for that site+MMP
- Add 5th Pre-Close Checklist gate: "All not-covered cost recoveries addressed"
- Add Exceptions tab to Cycle Close — Section B: Not-Covered Resolutions
- Digital signature flow for write-offs (same as existing cost approvals)
- Repayment tracking for Return Required (status: pending → in_progress → settled)
- **Money Timeline panel** — enumerator sees it in their site detail view (filtered to their own events)
- **Full Money Trail panel** — admin/finance see complete trail with internal approval notes
- Notification triggers: roll-over → enumerator + supervisor, return required → enumerator + finance
- Overdue repayment check: if deadline passed and status still `pending` → notify enumerator + finance + admin

**Pages touched:** Cycle Close (Uncovered tab + new Exceptions tab), Down-Payment Approval, Enumerator site view
**New tables:** `cost_recovery_log`
**Can deploy independently:** Yes (after Phase A)

---

### Phase C — WFP Confirmation + Status Audit Trail (4–5 days)
**Scope:** Upload WFP cleaned Excel, match sites, apply confirmed/rejected outcomes. Every outcome writes to `site_visit_status_log` and `payment_event_log`.

- Create `wfp_confirmation_uploads` and `wfp_match_results` tables
- Build WFP Confirmation tab on Cycle Close page
- File upload using existing xlsx.js parser (same engine as MMP upload)
- Column synonym mapping: `SECTION_1/sitename` → site_name, `1.9. State...` → state, `1.10. Locality...` → locality, `1.15 Name...` → partner, `1.16 What kind...` → activity
- Three-tier matching: Strong (auto) / Weak+Fuzzy (manual) / None (rejected)
- Manual review UI for weak/fuzzy: reviewer name + timestamp + note → stored in `wfp_match_results`
- Bulk "Apply Results": each outcome calls `logStatusChange()` with `change_source = 'system_wfp_match'` or `'admin_override'`
- Each match result also calls `logPaymentEvent('site_confirmed' or 'site_rejected', ...)`
- Add `confirmed` (green, checkmark) and `rejected` (red, warning) status badges everywhere
- Exceptions tab Section A: Rejected Sites — resolution options (Evidence / Accept / Dispute)
- History tab: reads chronologically from `site_visit_status_log` + `payment_event_log` for the selected cycle
- Enumerator view: shows `rejected` badge + "Not found in WFP data" message when their site is rejected
- Notification: enumerator + supervisor notified on `rejected`; enumerator notified on `confirmed`

**Pages touched:** Cycle Close (WFP Confirmation tab, Exceptions tab, History tab), Enumerator site view, Super Admin Data
**New tables:** `wfp_confirmation_uploads`, `wfp_match_results`
**Can deploy independently:** Yes (after Phase A)

---

### Phase D — Roll-to-Next-MMP Full Flow + Pre-Allocation Tracking (3 days)
**Scope:** Complete the money roll-over flow so the enumerator sees the money trail spanning both the source MMP and the target MMP.

- Eligibility query: MMPs where state matches + same `accepted_by` user + status `active` or `draft`
- If site not in target MMP: auto-insert site entry with warning logged to `site_visit_status_log`
- Mark rolled cost in target MMP down-payment view: badge "Pre-Approved (Rolled from [Source MMP Name])"
- Log `recovery_decision_rolled` to `payment_event_log` with `metadata: {target_mmp_id, target_mmp_name, target_site_id}`
- Log `payment_approved_tier2` (pre-approval event) to `payment_event_log` for target MMP — so the trail shows money as already approved without a new request
- Enumerator Money Timeline in target MMP shows: "SDG X pre-allocated from [Source MMP] — [Date]"
- Enumerator Money Timeline in source MMP shows: "SDG X rolled to [Target MMP] — [Date] — [Admin Name]"
- Notify supervisor and enumerator of the roll-over with names and amounts
- Finance view in target MMP shows total pre-allocated amounts with source links

**Pages touched:** Down-Payment Approval, Cycle Close Exceptions tab, Enumerator site view (source and target MMP)
**Can deploy independently:** Yes (after Phase B)

---

### Suggested Order and Timeline
```
Week 1:     Phase A — Status rename + logging tables        (1–2 days)
Week 1–2:   Phase B — Cost recovery gate + money trail      (3–4 days)
Week 2–3:   Phase C — WFP confirmation + status audit       (4–5 days)
Week 3–4:   Phase D — Roll-to-next-MMP full flow            (3 days)
```

Each phase is independently deployable. Phase A goes first — it creates the shared logging infrastructure that all other phases depend on. No phase needs to wait for the one after it to be designed — each has a clear, self-contained scope.

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
