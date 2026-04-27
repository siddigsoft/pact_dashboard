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

## PART 4B — DEEP REVIEW: GAPS, ISSUES & ENHANCEMENTS

*This section documents a full codebase review conducted before build start. Every issue below is resolved and incorporated into the build phases above.*

---

### GAP 1 — Wrong Table Name Throughout (CRITICAL)
**Found:** The plan says `site_visits` in several places.
**Reality:** The `site_visits` table was dropped in migration `20250125_drop_site_visits_table.sql`. The real table is `mmp_site_entries`.
**Fix:** All SQL migration statements in this plan now use `mmp_site_entries`. Every code reference must use `mmp_site_entries`.

---

### GAP 2 — `visit_status` Table Already Exists (CRITICAL — DO NOT CREATE DUPLICATE)
**Found:** The plan proposes creating a new `site_visit_status_log` table.
**Reality:** A `visit_status` table already exists in `supabase/schema.sql` (line 430) with columns: `id`, `site_visit_id` (→ `mmp_site_entries.id`), `status`, `updated_at`, `updated_by`, `is_synced`, `last_modified`.
**Fix:** Do NOT create a separate `site_visit_status_log`. Instead:
- **Extend** `visit_status` by adding columns: `old_status`, `change_source`, `note`, `mmp_id`, `mmp_name`, `site_name`, `changed_by_name`, `changed_by_role`
- The existing `updated_by` = `changed_by`, `updated_at` = `changed_at`, `status` = `new_status`
- Rename in plan: everywhere `site_visit_status_log` appears → `visit_status` (extended)
- This preserves existing data and mobile sync (`sync_status_indicator.dart` line 392 already handles `visit_status`)

---

### GAP 3 — Mixed-Case Status Values in Database (CRITICAL)
**Found:** The database stores status values in inconsistent case: `Pending`, `Dispatched`, `Assigned`, `Completed`, `verified`, `Rejected`, `In Progress`.
**Reality:** Most code already uses `LOWER(status)` comparisons (see `claim_site_visit` RPC).
**Fix:**
- Migration SQL must use: `WHERE LOWER(status) = 'completed'` not `WHERE status = 'completed'`
- After migration, normalize ALL status values to lowercase as part of Phase A
- Add SQL: `UPDATE mmp_site_entries SET status = LOWER(TRIM(status));`
- After normalization, all new status values are lowercase: `submitted`, `confirmed`, `rejected`

---

### GAP 4 — `siteCompletionStatus.ts` Will Break (HIGH)
**Found:** `src/utils/siteCompletionStatus.ts` defines terminal completion statuses as `['completed', 'verified']` for raw DB and `['completed', 'permitVerified']` for app layer.
**Impact:** After renaming `completed` → `submitted`, coverage stats, analytics, and any "is this done?" check will break — sites will appear uncovered even after enumerators submit.
**Fix in Phase A:**
```typescript
// TERMINAL_COMPLETION_RAW_STATUSES becomes:
new Set(['submitted', 'confirmed', 'verified'])

// TERMINAL_COMPLETION_APP_STATUSES becomes:
new Set(['submitted', 'confirmed', 'permitVerified'])
```
Both `submitted` and `confirmed` count as visited for analytics purposes.

---

### GAP 5 — `confirmation_status` Naming Confusion
**Found:** `mmp_site_entries` has a separate column `confirmation_status` with values `pending`, `confirmed`, `auto_released`. This is for the 2-day claim confirmation window — NOT related to WFP confirmation.
**Risk:** Calling our WFP-based status `confirmed` could confuse developers and future maintainers.
**Fix (naming clarity):**
- Rename the WFP confirmation status to `wfp_confirmed` in the DB column value BUT keep displaying it as "WFP Confirmed" in the UI
- The `confirmation_status` column (claim confirmation) is completely separate and untouched
- Add a code comment everywhere `status = 'wfp_confirmed'` clarifying the distinction
- In this document: update all instances of `confirmed` status value → `wfp_confirmed`

---

### GAP 6 — `completed_at` Column Needs Handling
**Found:** `mmp_site_entries` has a `completed_at` timestamptz column.
**Impact:** When status changes from `completed` → `submitted`, `completed_at` contains the old "marked complete" timestamp. This column now semantically means "submitted_at".
**Fix in Phase A:**
- Rename column: `completed_at` → `submitted_at` (migration: `ALTER TABLE mmp_site_entries RENAME COLUMN completed_at TO submitted_at`)
- Any code that reads `completed_at` must be updated to `submitted_at`
- Add new column: `wfp_confirmed_at` timestamptz (set when status → `wfp_confirmed`)
- Add new column: `wfp_rejected_at` timestamptz (set when status → `rejected`)

---

### GAP 7 — No RLS Policies Defined for New Tables
**Found:** The plan creates 4 new tables but defines no Row Level Security policies.
**Reality:** All Supabase tables need RLS or they are blocked to all users.
**Fix — RLS policies for each new table:**

`visit_status` (extended — existing policy is too permissive):
- Enumerator: SELECT own records only (`updated_by = auth.uid()`)
- Supervisor/Admin/Finance/Super Admin: SELECT all in their scope

`payment_event_log` (new):
- Enumerator: SELECT where `triggered_by = auth.uid()` OR `site_entry_id IN (their assigned sites)`
- Admin/Finance/Super Admin: SELECT all
- INSERT: service role only (via server-side functions) — no direct client inserts

`cost_recovery_log` (new):
- Supervisor: SELECT + INSERT (propose only)
- Admin/Finance: SELECT + INSERT + UPDATE (full access)
- Super Admin: full access
- Enumerator: SELECT own records only (where source site was theirs)

`wfp_confirmation_uploads` + `wfp_match_results` (new):
- Admin/Super Admin: full access
- Finance: SELECT only
- Enumerator: no access

---

### GAP 8 — No Supabase Storage Bucket for WFP Files or Evidence
**Found:** The plan handles WFP file uploads and enumerator evidence uploads but never defines where the files are stored.
**Fix:** Two new Supabase Storage buckets are needed:
- `wfp-confirmation-files` — admin uploads, private bucket, admin/super_admin access only
- `site-submission-evidence` — enumerator evidence uploads (screenshots, references), private, accessible to enumerator + their supervisor + admin

Add these to Phase A infrastructure setup.

---

### GAP 9 — Arabic / Bilingual Labels Missing from Plan
**Found:** The system is fully bilingual (English + Arabic, with RTL support). The plan describes all new UI in English only.
**Fix:** Every new label, badge, message, notification, and guide text needs an Arabic translation. This is added to each phase's scope:
- Status badge labels: `submitted` → "مُقدَّم", `wfp_confirmed` → "مؤكد من WFP", `rejected` → "غير مؤكد"
- Money Timeline events: all 20 event types need Arabic labels
- Cost Recovery Dialog: all 3 options with Arabic text
- Guide texts: all 4 guide texts need Arabic versions
- Notifications: all new notification templates need Arabic variants

---

### GAP 10 — Mobile App Status: What Changes and What Doesn't
**Found by user question:** "Will the mobile be affected or should we copy to local?"

**Answer:** The Flutter mobile app (`PACT_mobile/`) IS in this repository. You do not need to copy anything — any file changes here are already local. Deployment to users happens via Shorebird OTA (over-the-air update) without app store submission.

**What AUTOMATICALLY works** (database-driven, no Flutter code change needed):
- New status values in the DB are just text strings — they flow through to mobile immediately
- New tables (`payment_event_log`, `cost_recovery_log`) are readable by existing Supabase Flutter client

**What NEEDS Flutter code changes:**
1. Status display widgets — need cases for `submitted`, `wfp_confirmed`, `rejected` with correct colors and Arabic labels
2. "Mark as Submitted" button — replaces "Mark as Completed" in field agent screens. Needs a guided checklist flow:
   > "Before marking submitted, confirm: (1) Did you open ODK Collect? (2) Did you fill the form? (3) Did you press Submit in ODK? Then tap 'Mark as Submitted' below."
3. **Money Timeline panel** — new widget showing `payment_event_log` entries for the enumerator's site
4. **WFP Rejection badge** — when `status = 'rejected'`, show red "Not Confirmed by WFP" card with the explanation message
5. **Offline handling** — the Hive cache (used for offline) stores site entry models. After Phase A migration, the cached `status` field will show `submitted` once synced. No Hive schema change needed — it's just a text string.
6. **Sync** — `visit_status` is already in the sync engine (`sync_status_indicator.dart` line 392). Extended columns will sync automatically once added.

**What is WEB ONLY (no Flutter needed):**
- WFP file upload and matching
- Cost Recovery Dialog (admin action)
- Cycle Close page management
- Exceptions tab
- History tab
- Write-off digital signature

---

### GAP 11 — Deduplication for WFP File Uploads
**Found:** No protection against an admin uploading the same WFP file twice.
**Risk:** If uploaded twice, all `submitted` sites would be double-confirmed, and the match results table would have duplicates.
**Fix:** Before processing, check `wfp_confirmation_uploads` for:
- Same `mmp_id` + same `filename` → warn: "A file with this name has already been uploaded for this cycle. Are you sure you want to upload again?"
- Same `mmp_id` + status = `applied` → warn: "WFP confirmation has already been applied for this cycle. Uploading again will override the previous results."

---

### GAP 12 — What Happens to Transport Fee Submission Logic
**Found:** `supabase/migrations/20251123_remove_transport_from_fee_structures.sql` (line 78) blocks transport fee submissions unless `status IN ('approved', 'approved_stage_one', 'approved_stage_two', 'completed', 'closed')`.
**Impact:** After rename, a site in `submitted` status will NOT be able to have transport fees submitted — the old check won't match.
**Fix in Phase A migration:** Update this check to include `submitted`, `wfp_confirmed`:
```sql
IF LOWER(visit_status) NOT IN ('approved', 'approved_stage_one', 'approved_stage_two',
                                'completed', 'submitted', 'wfp_confirmed', 'closed') THEN
```

---

### GAP 13 — Cycle Status Gating Not Fully Defined
**Found:** The plan says "WFP Confirmation tab unlocks after Phase 1 passes." But the exact mechanism is not defined.
**Fix:** The `mmp_files` table has a `cycle_status` column. Define the transition clearly:
- `active` → `closing` (when admin initiates close, after Phase 1 checklist passes)
- `closing` → `wfp_pending` (new intermediate state, after Phase 1 passed but before WFP upload)
- `wfp_pending` → `wfp_reviewed` (after WFP file uploaded and results applied)
- `wfp_reviewed` → `closed` (after all exceptions resolved or accepted)

The WFP Confirmation tab is enabled when `cycle_status IN ('wfp_pending', 'wfp_reviewed', 'closed')`.

---

### GAP 14 — No Plan for Enumerator's ODK Reference Number Storage
**Found:** The plan mentions the enumerator can "enter an ODK reference number as evidence" but there's no field or table for it.
**Fix:** Add to `mmp_site_entries`:
- `submitted_odk_reference` (text, nullable) — the ODK submission UUID entered by the enumerator
- `submitted_evidence_urls` (text[], nullable) — URLs to uploaded screenshots in `site-submission-evidence` bucket

These are set when the enumerator marks the site as `submitted`. Displayed in the Exceptions tab when a site is rejected (as evidence for the admin to review).

---

### GAP 15 — Repayment Overdue Escalation Missing from Notification Table
**Found:** Section 2B.8 notification table mentions "Repayment overdue" but Phase B doesn't define the escalation schedule.
**Fix:** Add to Phase B scope:
- At deadline day: notify enumerator + finance (first warning)
- At deadline + 7 days: notify admin (escalation)
- At deadline + 14 days: notify super admin (critical escalation)
- Use a Supabase Edge Function scheduled job (cron) to check daily

---

### GAP 16 — Money Trail Export / PDF Not in Build Phases
**Found:** Section 2B mentions the History tab can "export to PDF/Excel" but no Phase explicitly builds this.
**Fix:** Add to Phase C scope — export the full `visit_status` + `payment_event_log` audit trail for a selected cycle as:
- Excel export (using existing xlsx library)
- PDF export (using existing jspdf library)
Available to: Admin, Finance, Super Admin only.

---

### GAP 17 — Bulk Resolution for Rejected Sites
**Found:** The Exceptions tab shows rejected sites one by one. If 30 sites are rejected at once (from one WFP file upload), resolving them one by one is impractical.
**Fix:** Add to Phase C scope — bulk actions on the Exceptions tab:
- "Accept All Rejections" → marks all as `rejected_final` with one admin note for all
- "Send Evidence Request to All" → sends one notification to each affected enumerator asking for ODK reference
- Individual resolution still available for complex cases

---

### GAP 18 — "Mark as Submitted" Flow on Mobile Needs a Confirmation Step
**Found:** Mobile enumerators might accidentally tap "Mark as Submitted" before actually sending to WFP.
**Fix:** The mobile "Mark as Submitted" action must show a 3-step confirmation:
1. "Have you opened ODK Collect on your phone?" [Yes / Not yet]
2. "Have you filled all required questions in the form?" [Yes / Not yet]
3. "Have you pressed the Submit button in ODK?" [Yes / Not yet]
Only when all three are confirmed does the "Mark as Submitted" button become active. This checklist is the built-in accountability mechanism before self-reporting.

---

### ENHANCEMENT 1 — Confidence Score for WFP Matches
Show a percentage confidence on each match result row. Strong match = 100%, weak match = 60–80%, fuzzy = 30–59%. Helps admin prioritize which weak matches to review first.

### ENHANCEMENT 2 — Download WFP Match Results Report
After applying WFP results, generate an Excel report with all match outcomes (confirmed, rejected, anomalies) that admin can download for their records and share with WFP.

### ENHANCEMENT 3 — Bundled Rejection Notification to Enumerator
Instead of one notification per rejected site, bundle all rejections from one WFP upload into a single WhatsApp/in-app message: "3 of your sites were not found in the WFP data: ALMATAR, OCTOBER, ALRAD. Contact your supervisor for next steps."

### ENHANCEMENT 4 — Cross-Cycle Money Trail Navigation
When an enumerator's Money Timeline shows a rolled-over payment from a previous cycle, clicking on it navigates to that cycle's site detail — so the full chain is traceable even across cycles.

### ENHANCEMENT 5 — Super Admin Cycle Health Dashboard
A single view for super admin showing, across ALL active cycles:
- Total sites: submitted / wfp_confirmed / rejected / not_covered
- Total money: approved / sent / under recovery / written off
- Cycles ready for WFP upload vs. already confirmed
This gives leadership a real-time accountability view without clicking into each cycle.

---

### SUMMARY — RESOLVED GAPS BY PHASE

| Gap # | Issue | Fixed In |
|---|---|---|
| 1 | Wrong table name (`site_visits`) | Phase A |
| 2 | `visit_status` already exists | Phase A — extend, don't recreate |
| 3 | Mixed-case status values | Phase A — normalize to lowercase |
| 4 | `siteCompletionStatus.ts` breaks | Phase A |
| 5 | `confirmation_status` naming conflict | Phase A — use `wfp_confirmed` as status value |
| 6 | `completed_at` column rename | Phase A |
| 7 | RLS policies missing | Each phase adds RLS for its tables |
| 8 | No storage buckets | Phase A |
| 9 | Arabic labels missing | Each phase |
| 10 | Mobile impact unclear | Phase A (status display) + Phase B (Money Timeline + Submit flow) |
| 11 | WFP file dedup | Phase C |
| 12 | Transport fee check breaks | Phase A |
| 13 | Cycle status gating undefined | Phase A — define `mmp_files.cycle_status` transitions |
| 14 | ODK reference storage | Phase A (add columns) + Phase B (mobile UI) |
| 15 | Overdue escalation schedule | Phase B |
| 16 | Money trail export | Phase C |
| 17 | Bulk rejection handling | Phase C |
| 18 | Mobile submit confirmation checklist | Phase B (mobile) |

---

## PART 4C — FULL NOTIFICATION PLAN (In-App + WhatsApp + Email)

*This section defines every notification event triggered by the Cycle Close & Site Visit Status system. All notifications use the existing `dispatchNotification` helper (`src/lib/notify.ts`) which covers all three channels through the `dispatch-notification` and `send-whatsapp` edge functions. Every message is bilingual (English + Arabic).*

---

### How the Notification System Works (Reference)

The platform has three delivery channels:
- **In-App** — stored in `notifications` table, shown in real-time via Supabase Realtime in the bell icon / Notifications page. Always sent.
- **Email** — SMTP via IONOS. Sent for financial and approval events unless `sendEmail: false` is set.
- **WhatsApp** — WasenderAPI (primary) / Meta Cloud API (fallback). Sent only when `sendWhatsApp: true` AND the user has opted in. Bilingual message.

Priority levels affect how the notification appears:
- `normal` — standard bell notification
- `high` — orange highlight in notification list
- `urgent` — blocking popup that requires user dismissal + red highlight

---

### Notification Event Registry — Cycle Close System

The following 16 new event types are added to the system. Each entry shows: the trigger, who is notified, channels, priority, and the exact English and Arabic message templates.

---

#### EVENT 1 — `site_marked_submitted`
**When:** Enumerator marks a site as Submitted (to WFP) in the app
**Who is notified:** Enumerator's supervisor
**Channels:** In-app + WhatsApp
**Priority:** `normal`

| Field | English | Arabic |
|---|---|---|
| Title | Site Marked as Submitted | تم تسجيل الموقع كمُقدَّم |
| Message | [Enumerator Name] has marked [Site Name] as submitted to WFP. MMP: [MMP Name]. | قام [اسم العداد] بتسجيل موقع [اسم الموقع] كمُقدَّم إلى WFP. خطة المراقبة: [اسم الخطة]. |

**Action URL:** `/mmp/cycle-close?mmp=[mmp_id]`

---

#### EVENT 2 — `site_wfp_confirmed`
**When:** System auto-confirms site from WFP file (strong match) OR admin manually confirms a weak match
**Who is notified:** Enumerator
**Channels:** In-app + WhatsApp
**Priority:** `normal`

| Field | English | Arabic |
|---|---|---|
| Title | Your Site Was Confirmed by WFP ✓ | تم تأكيد موقعك من قِبَل WFP ✓ |
| Message | Great news — [Site Name] in the [MMP Name] cycle has been confirmed in WFP's data. No further action needed. | خبر جيد — تم تأكيد موقع [اسم الموقع] في دورة [اسم الخطة] في بيانات WFP. لا يلزم اتخاذ أي إجراء. |

**Action URL:** `/my-sites?site=[site_entry_id]`

---

#### EVENT 3 — `site_wfp_rejected`
**When:** System marks site as Not Found in WFP file (no match) OR admin manually rejects a weak match
**Who is notified:** Enumerator + Supervisor
**Channels:** In-app + WhatsApp + Email
**Priority:** `high`

| Field | English | Arabic |
|---|---|---|
| Title | Site Not Confirmed by WFP — Action Needed | الموقع غير مؤكد من WFP — يلزم اتخاذ إجراء |
| Message (enumerator) | Your submission for [Site Name] was not found in WFP's data file. Your supervisor has been notified. You may be asked to provide your ODK reference number. | لم يُعثَر على تقريرك لموقع [اسم الموقع] في ملف بيانات WFP. تم إشعار مشرفك. قد يُطلب منك تقديم رقم مرجعك في ODK. |
| Message (supervisor) | [Site Name] submitted by [Enumerator Name] was not found in the WFP data file for [MMP Name]. Review required in the Exceptions tab. | لم يُعثَر على موقع [اسم الموقع] الذي قدّمه [اسم العداد] في ملف بيانات WFP لخطة [اسم الخطة]. يرجى المراجعة في تبويب الاستثناءات. |

**Action URL (supervisor):** `/mmp/cycle-close?mmp=[mmp_id]&tab=exceptions`

---

#### EVENT 4 — `site_wfp_rejected_bulk`
**When:** Multiple sites rejected from a single WFP file upload (replaces individual EVENT 3 per site — bundled message)
**Who is notified:** Each affected enumerator individually (one bundled message per enumerator) + Supervisors
**Channels:** In-app + WhatsApp
**Priority:** `high`

| Field | English | Arabic |
|---|---|---|
| Title | [N] Sites Not Confirmed by WFP | [N] مواقع غير مؤكدة من WFP |
| Message | [N] of your submitted sites were not found in the WFP data: [Site 1], [Site 2], [Site 3]. Your supervisor has been notified. | [N] من مواقعك المُقدَّمة لم يُعثَر عليها في بيانات WFP: [اسم الموقع 1]، [اسم الموقع 2]، [اسم الموقع 3]. تم إشعار مشرفك. |

*Note: If only 1 site rejected, use EVENT 3 (individual). If 2+ sites rejected from same enumerator in same upload, use EVENT 4 (bundled).*

---

#### EVENT 5 — `cost_recovery_rolled`
**When:** Admin decides to roll the approved money to a future MMP
**Who is notified:** Enumerator + Supervisor
**Channels:** In-app + WhatsApp
**Priority:** `normal`

| Field | English | Arabic |
|---|---|---|
| Title | Your Payment Rolled to Next Cycle | تم ترحيل دفعتك إلى الدورة القادمة |
| Message | SDG [Amount] approved for [Site Name] has been rolled forward to [Target MMP Name]. The amount will be pre-approved for your next visit. | تم ترحيل [المبلغ] جنيه سوداني المعتمد لموقع [اسم الموقع] إلى خطة [اسم الخطة الهدف]. سيكون المبلغ معتمداً مسبقاً لزيارتك القادمة. |

**Action URL:** `/down-payment?mmp=[target_mmp_id]`

---

#### EVENT 6 — `cost_recovery_return_required`
**When:** Admin requires the enumerator to return the money
**Who is notified:** Enumerator + Finance Officer
**Channels:** In-app + WhatsApp + Email
**Priority:** `high`

| Field | English | Arabic |
|---|---|---|
| Title | Return of Payment Required | مطلوب إعادة الدفعة |
| Message (enumerator) | SDG [Amount] received for [Site Name] must be returned by [Deadline Date]. Method: [Return Method]. Contact your supervisor for details. | يجب إعادة [المبلغ] جنيه سوداني المستلم لموقع [اسم الموقع] بحلول [تاريخ الاستحقاق]. الطريقة: [طريقة الإعادة]. تواصل مع مشرفك للتفاصيل. |
| Message (finance) | A repayment of SDG [Amount] has been requested from [Enumerator Name] for [Site Name] — [MMP Name]. Deadline: [Date]. Method: [Return Method]. | تم طلب استرداد [المبلغ] جنيه سوداني من [اسم العداد] لموقع [اسم الموقع] — [اسم الخطة]. الموعد النهائي: [التاريخ]. الطريقة: [طريقة الإعادة]. |

**Action URL (finance):** `/down-payment?tab=recoveries`

---

#### EVENT 7 — `cost_recovery_writeoff_approved`
**When:** Write-off digitally signed and approved
**Who is notified:** Finance Officer + Super Admin
**Channels:** In-app + Email
**Priority:** `normal`

| Field | English | Arabic |
|---|---|---|
| Title | Payment Write-Off Approved | تمت الموافقة على شطب الدفعة |
| Message | SDG [Amount] for [Site Name] in [MMP Name] has been written off. Approved by: [Approver Name]. Reason: [Reason]. This has been recorded in the financial audit log. | تم شطب [المبلغ] جنيه سوداني لموقع [اسم الموقع] في خطة [اسم الخطة]. اعتمده: [اسم المعتمِد]. السبب: [السبب]. تم تسجيل ذلك في سجل التدقيق المالي. |

---

#### EVENT 8 — `repayment_overdue_day0`
**When:** Repayment deadline has passed (day 0 — deadline day itself)
**Who is notified:** Enumerator + Finance Officer
**Channels:** In-app + WhatsApp + Email
**Priority:** `high`

| Field | English | Arabic |
|---|---|---|
| Title | Repayment Overdue — Today Was the Deadline | الدفع متأخر — اليوم كان الموعد النهائي |
| Message (enumerator) | Your repayment of SDG [Amount] for [Site Name] was due today. Please contact your supervisor immediately. | كان يجب إعادة [المبلغ] جنيه سوداني لموقع [اسم الموقع] اليوم. يرجى التواصل مع مشرفك فوراً. |

**Trigger:** Supabase Edge Function cron job — runs daily at 08:00 AM Sudan time, checks `cost_recovery_log` for `repayment_deadline = today` + `status != settled`

---

#### EVENT 9 — `repayment_overdue_day7`
**When:** 7 days past the repayment deadline
**Who is notified:** Admin
**Channels:** In-app + Email
**Priority:** `urgent`

| Field | English | Arabic |
|---|---|---|
| Title | Repayment 7 Days Overdue — Escalation | الدفع متأخر 7 أيام — تصعيد |
| Message | [Enumerator Name] has not repaid SDG [Amount] for [Site Name] — [MMP Name]. Deadline was [Date], now 7 days overdue. Escalated from Finance. | لم يُعِد [اسم العداد] [المبلغ] جنيه سوداني لموقع [اسم الموقع] — [اسم الخطة]. كان الموعد النهائي [التاريخ]، متأخر الآن 7 أيام. تصعيد من المالية. |

---

#### EVENT 10 — `repayment_overdue_day14`
**When:** 14 days past the repayment deadline
**Who is notified:** Super Admin
**Channels:** In-app + Email + WhatsApp
**Priority:** `urgent`

| Field | English | Arabic |
|---|---|---|
| Title | CRITICAL: Repayment 14 Days Overdue | حرج: الدفع متأخر 14 يوماً |
| Message | UNRESOLVED: [Enumerator Name] owes SDG [Amount] for [Site Name] — [MMP Name] — now 14 days overdue. Finance and Admin have been notified previously. Immediate action required. | غير محلول: [اسم العداد] مدين بـ [المبلغ] جنيه سوداني لموقع [اسم الموقع] — [اسم الخطة] — متأخر الآن 14 يوماً. تم إشعار المالية والإدارة سابقاً. يلزم اتخاذ إجراء فوري. |

---

#### EVENT 11 — `repayment_received`
**When:** Finance records that the enumerator has returned money
**Who is notified:** Enumerator
**Channels:** In-app + WhatsApp
**Priority:** `normal`

| Field | English | Arabic |
|---|---|---|
| Title | Repayment Received — Thank You | تم استلام الدفعة المُعادة — شكراً |
| Message | We've received your repayment of SDG [Amount] for [Site Name]. Your account is now settled for this matter. | استلمنا مبلغ إعادة [المبلغ] جنيه سوداني لموقع [اسم الموقع]. حسابك الآن مُسوَّى بخصوص هذه المسألة. |

---

#### EVENT 12 — `wfp_file_uploaded`
**When:** Admin uploads a WFP cleaned data Excel file for a cycle
**Who is notified:** Admin who uploaded (confirmation) + Super Admin
**Channels:** In-app only
**Priority:** `normal`

| Field | English | Arabic |
|---|---|---|
| Title | WFP File Uploaded — Processing Complete | تم رفع ملف WFP — اكتملت المعالجة |
| Message | The WFP file for [MMP Name] has been processed. Results: [X] confirmed, [Y] needs review, [Z] rejected, [W] anomalies. Review the results in the WFP Confirmation tab. | تمت معالجة ملف WFP لخطة [اسم الخطة]. النتائج: [X] مؤكد، [Y] يحتاج مراجعة، [Z] مرفوض، [W] شذوذات. راجع النتائج في تبويب تأكيد WFP. |

---

#### EVENT 13 — `wfp_results_applied`
**When:** Admin clicks "Apply Results" and WFP match decisions are committed to the database
**Who is notified:** All supervisors in the MMP's hub
**Channels:** In-app
**Priority:** `normal`

| Field | English | Arabic |
|---|---|---|
| Title | WFP Confirmation Applied for [MMP Name] | تم تطبيق تأكيد WFP لخطة [اسم الخطة] |
| Message | WFP verification results have been applied for [MMP Name]. [X] sites confirmed, [Z] sites rejected. Check the Exceptions tab for rejected sites requiring follow-up. | تم تطبيق نتائج التحقق من WFP لخطة [اسم الخطة]. [X] مواقع مؤكدة، [Z] مواقع مرفوضة. تحقق من تبويب الاستثناءات للمواقع المرفوضة التي تحتاج متابعة. |

---

#### EVENT 14 — `cycle_closed`
**When:** Cycle is officially closed by admin/super admin
**Who is notified:** All supervisors in the cycle + Finance Officer + Country Director
**Channels:** In-app + Email
**Priority:** `normal`

| Field | English | Arabic |
|---|---|---|
| Title | Cycle Closed — [MMP Name] | تمت إغلاق الدورة — [اسم الخطة] |
| Message | The [MMP Name] monitoring cycle has been officially closed. Total sites: [X] confirmed, [Y] not covered, [Z] exceptions. Final report is available for download. | تم إغلاق دورة المراقبة [اسم الخطة] رسمياً. إجمالي المواقع: [X] مؤكد، [Y] غير مشمول، [Z] استثناءات. التقرير النهائي متاح للتحميل. |

**Action URL:** `/mmp/cycle-close?mmp=[mmp_id]&tab=reports`

---

#### EVENT 15 — `status_admin_override`
**When:** Admin or Super Admin manually overrides a site's status (outside the normal flow)
**Who is notified:** Enumerator + Supervisor
**Channels:** In-app
**Priority:** `normal`

| Field | English | Arabic |
|---|---|---|
| Title | Site Status Updated by Admin | تم تحديث حالة الموقع من قِبَل المدير |
| Message | The status of [Site Name] has been updated from [Old Status] to [New Status] by [Admin Name]. Reason: [Reason]. | تم تحديث حالة موقع [اسم الموقع] من [الحالة القديمة] إلى [الحالة الجديدة] بواسطة [اسم المدير]. السبب: [السبب]. |

---

#### EVENT 16 — `exception_resolved`
**When:** Admin resolves a rejected site in the Exceptions tab (accepts evidence, disputes, or accepts rejection)
**Who is notified:** Enumerator + Supervisor
**Channels:** In-app + WhatsApp
**Priority:** `normal`

| Field | English | Arabic |
|---|---|---|
| Title | Site Exception Resolved — [Site Name] | تم حل استثناء الموقع — [اسم الموقع] |
| Message | The exception for [Site Name] has been resolved by [Admin Name]. Resolution: [Evidence Accepted / Rejection Accepted / Disputed]. | تم حل استثناء موقع [اسم الموقع] بواسطة [اسم المدير]. القرار: [الأدلة مقبولة / الرفض مقبول / متنازع عليه]. |

---

### Notification Delivery Matrix

| Event | Enumerator | Supervisor | Finance | Admin | Super Admin | In-App | WhatsApp | Email |
|---|---|---|---|---|---|---|---|---|
| `site_marked_submitted` | — | ✓ | — | — | — | ✓ | ✓ | — |
| `site_wfp_confirmed` | ✓ | — | — | — | — | ✓ | ✓ | — |
| `site_wfp_rejected` | ✓ | ✓ | — | — | — | ✓ | ✓ | ✓ |
| `site_wfp_rejected_bulk` | ✓ | ✓ | — | — | — | ✓ | ✓ | — |
| `cost_recovery_rolled` | ✓ | ✓ | — | — | — | ✓ | ✓ | — |
| `cost_recovery_return_required` | ✓ | — | ✓ | — | — | ✓ | ✓ | ✓ |
| `cost_recovery_writeoff_approved` | — | — | ✓ | — | ✓ | ✓ | — | ✓ |
| `repayment_overdue_day0` | ✓ | — | ✓ | — | — | ✓ | ✓ | ✓ |
| `repayment_overdue_day7` | — | — | — | ✓ | — | ✓ | — | ✓ |
| `repayment_overdue_day14` | — | — | — | — | ✓ | ✓ | ✓ | ✓ |
| `repayment_received` | ✓ | — | — | — | — | ✓ | ✓ | — |
| `wfp_file_uploaded` | — | — | — | ✓ | ✓ | ✓ | — | — |
| `wfp_results_applied` | — | ✓ | — | — | — | ✓ | — | — |
| `cycle_closed` | — | ✓ | ✓ | — | — | ✓ | — | ✓ |
| `status_admin_override` | ✓ | ✓ | — | — | — | ✓ | — | — |
| `exception_resolved` | ✓ | ✓ | — | — | — | ✓ | ✓ | — |

---

### Where Notifications Are Triggered in Code

Each event maps to a call to `dispatchNotification()` in `src/lib/notify.ts`. The calls are placed in the service layer, not in the React components directly. New file: `src/services/cycleCloseNotifications.ts`.

```typescript
// Example — called when WFP match results are applied:
await dispatchNotification({
  event: 'wfp_results_applied',
  recipientIds: supervisorIds,
  titleEn: `WFP Confirmation Applied for ${mmpName}`,
  titleAr: `تم تطبيق تأكيد WFP لخطة ${mmpName}`,
  messageEn: `WFP verification results have been applied for ${mmpName}...`,
  messageAr: `تم تطبيق نتائج التحقق من WFP لخطة ${mmpName}...`,
  priority: 'normal',
  entityType: 'mmpFile',
  entityId: mmpId,
  actionUrl: `/mmp/cycle-close?mmp=${mmpId}&tab=exceptions`,
  sendWhatsApp: false,
  sendEmail: false,
});
```

---

### Cron Jobs for Overdue Escalation

Events 8, 9, and 10 (overdue repayments) are NOT triggered by user actions — they run on a schedule. A new Supabase Edge Function `repayment-overdue-check` is added and registered as a cron job:

```
-- Runs daily at 08:00 AM UTC (= 10:00 AM Sudan time)
SELECT cron.schedule(
  'repayment-overdue-check',
  '0 8 * * *',
  $$SELECT net.http_post(url := 'https://[project].supabase.co/functions/v1/repayment-overdue-check') $$
);
```

The edge function queries `cost_recovery_log` for all records where:
- `recovery_type = 'return'`
- `repayment_status != 'settled'`
- `repayment_deadline` is in the past

Then for each, calculates days overdue and fires EVENT 8, 9, or 10 accordingly — only firing once per threshold (tracks `day0_notified`, `day7_notified`, `day14_notified` flags in `cost_recovery_log`).

---

### Which Build Phase Adds Each Event

| Phase | Events Added |
|---|---|
| Phase A | EVENT 15 (`status_admin_override`) |
| Phase B | EVENTS 5, 6, 7, 8, 9, 10, 11 (cost recovery + money trail notifications) |
| Phase C | EVENTS 1, 2, 3, 4, 12, 13, 16 (WFP upload + match results + exceptions) |
| Phase D | EVENT 14 (`cycle_closed`), plus cron job for overdue check |

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
