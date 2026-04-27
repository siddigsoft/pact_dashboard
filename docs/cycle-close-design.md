# Cycle Close & Site Visit Status — Design Document

**Status:** Discussion / Planning
**Last updated:** 2026-04-27
**Participants:** Product Owner, Engineering

---

## 1. The Core Problem

The current status `completed` on a site visit means the enumerator finished entering data in the PACT app. It does NOT mean the data was received by WFP's ODK server. The system has no way to know whether the actual XLSForm submission reached WFP — only WFP's cleaned data export can prove that.

We need to separate these two facts into distinct statuses.

---

## 2. New Site Visit Status Chain

| Status | Set By | Meaning |
|---|---|---|
| `assigned` | Supervisor | Site allocated to enumerator for this cycle |
| `dispatched` | Supervisor | Enumerator sent to field |
| `submitted` | Enumerator (self-report in app) | Claims data was filled and sent to WFP ODK server |
| `confirmed` | Cycle Close — XLS file match | WFP cleaned data file proves submission was received |
| `rejected` | Cycle Close — XLS file match | Site code not found in WFP cleaned data — needs follow-up |
| `not_covered` | Supervisor (with reason) | Site not visited — officially documented with reason |

### Key Design Principle
- `submitted` = what the enumerator claims (their responsibility)
- `confirmed` = what WFP's data proves (external evidence)
- These are deliberately kept separate because you cannot control the WFP server

### What happens to `completed`?
`submitted` replaces `completed` entirely. Any existing `completed` records should be treated as `submitted` during migration.

---

## 3. How "Submitted" Works — Self-Report in the App

The enumerator:
1. Finishes data collection in the field
2. Sends the XLSForm to WFP ODK Central
3. Opens the PACT app and marks the site as **Submitted**
4. Optionally uploads a screenshot or notes an ODK submission reference number as evidence

This is a self-report. The system records it with a timestamp and the enumerator's user ID. No external verification happens at this step.

---

## 4. How "Confirmed" Works — WFP Cleaned Data File Upload

After the cycle field window closes, WFP generates a cleaned data Excel file (e.g., `February_2026_cleaned_data_PACT.xlsx`). This is uploaded by admin or super admin into the Cycle Close page.

### Matching Logic
The system reads the Excel file using the same xlsx.js parser already in the codebase. It maps columns flexibly (same synonym system used for MMP uploads).

**Primary match key:** `site_code` (P Code) — matched against `mmp_site_entries.site_code` for the selected cycle.

**Fallback match key:** `site_name` + `state` + `locality` combination, if site code is missing.

### Match Outcomes
| Outcome | Condition | New Status |
|---|---|---|
| Confirmed | Site code found in WFP file | `confirmed` |
| Rejected | Site is `submitted` but NOT in WFP file | `rejected` |
| No action | Site is `not_covered` | remains `not_covered` |
| Unmatched row | WFP file has a row with no matching site in cycle | logged as anomaly, no action |

### Who Uploads
Admin and super admin only (not supervisor — this is a data governance action).

### Partial Confirmation is Allowed
A cycle can close with some sites in `rejected` or `exceptions` status. These are tracked in the Exceptions tab. The cycle is still formally closed — you cannot re-open the field window. Rejected sites are handled through the resolution workflow below.

---

## 5. Scenario C — Not Covered Sites With Money Already Paid

This is the highest-risk scenario. An enumerator received approved transport advance or down-payment, but the site was never visited (marked `not_covered`).

### Resolution Options for Each Not-Covered Cost

When a supervisor or admin marks a site as `not_covered` and there is an associated approved cost, the system immediately prompts for a cost resolution decision:

#### Option 1 — Roll to Next MMP (Preferred)
Transfer the approved amount to the same data collector for the same site in a future MMP.

**Eligibility filter for the MMP selection list:**
- Same state as the not-covered site
- Same data collector (accepted_by user)
- MMP status is `active` or `draft` (not closed)
- Site exists in the target MMP's site list

The system shows a dropdown of eligible MMPs. Admin selects one. The approved cost is linked to the new MMP as a "pre-approved advance" — the enumerator does not request again; the money is already allocated.

**Design note:** The roll-over creates a record in `cost_recovery_log` with:
- Source MMP, source site, source cost amount
- Target MMP, target site
- Decision: `rolled_over`
- Made by: [user] at [timestamp]

#### Option 2 — Return Required
The enumerator must return the money. System creates a recovery record and sends a notification to the enumerator and their supervisor. The finance team tracks repayment.

The `cost_recovery_log` record:
- Decision: `return_required`
- Recovery amount
- Recovery deadline (configurable, default 30 days)
- Repayment status: `pending` → `partially_repaid` → `repaid`

#### Option 3 — Write-Off / Waiver
The amount is written off with justification. Requires higher authorization (admin + finance sign-off, or super admin override).

The `cost_recovery_log` record:
- Decision: `written_off`
- Justification text (required)
- Authorized by: [user]

### Who Can Make Each Decision
| Decision | Supervisor | Admin | Finance | Super Admin |
|---|---|---|---|---|
| Roll to Next MMP | Propose only | Approve | Approve | Approve |
| Return Required | Yes | Yes | Yes | Yes |
| Write-Off | No | Propose | Approve jointly | Approve solo |

### Impact on Cycle Close Checklist
A new gate is added to the Pre-Close Checklist:
> **All not-covered cost recoveries addressed**
> Every site marked not-covered that has an associated approved cost must have a resolution decision recorded.

This gate blocks cycle close unless all such sites have a decision (any of the three options above counts).

---

## 6. Scenario B — Submitted But Rejected (Not in WFP File)

The enumerator claimed to submit but WFP has no record of it.

### Resolution Options
1. **Evidence Provided** — Enumerator uploads ODK submission ID or screenshot. Admin reviews and can manually override to `confirmed` with a note.
2. **Re-submission Not Possible** — Cycle is closed; field window gone. Mark as `rejected_final`. Cost stays approved (enumerator made the effort) but noted as unverified by WFP.
3. **Disputed** — If there is reason to believe the enumerator did not actually submit, finance can flag the cost for review.

### Impact on Costs (Rejected Sites)
- Cost is NOT automatically clawed back on rejection — the enumerator went to the field.
- Finance has the option to flag individual rejected-site costs for review.
- A rejection does not prevent cycle close — it goes to the Exceptions tab.

---

## 7. Cycle Close Page — Revised Structure

### Phase 1 — Pre-Close Checklist (existing, with additions)

| Gate | Existing? | Notes |
|---|---|---|
| All site visits resolved (submitted / not_covered) | Yes (currently checks `completed`) | Update to accept `submitted` |
| No pending cost submissions | Yes | No change |
| All transport advances reconciled | Yes | No change |
| All withdrawal requests processed | Yes | No change |
| All not-covered cost recoveries addressed | **NEW** | Blocks unless every not-covered site with paid costs has a decision |

### Phase 2 — WFP Data Confirmation (new step)

Appears after Phase 1 passes (or Super Admin Override).

1. Upload WFP cleaned data Excel file
2. System matches by site_code (fallback: name + state + locality)
3. Results shown: X Confirmed, Y Rejected, Z Not Covered (skipped)
4. Anomalies shown: rows in WFP file with no matching PACT site
5. Admin reviews and confirms the match results
6. Status updates are applied in bulk

### Tab Structure

| Tab | Purpose |
|---|---|
| **Readiness** | Pre-close checklist (Phase 1) |
| **Sites** | All sites in cycle — filterable by status, bulk actions |
| **WFP Confirmation** | Upload WFP cleaned file, view match results (Phase 2) |
| **Finance Review** | Existing reconciliation summary |
| **Exceptions** | Rejected sites + not-covered cost resolutions + disputed costs |
| **History** | Full audit log: who did what, when, with what justification |

---

## 8. MMP Upload File — Fields Available for Matching

The system already parses these fields from the MMP XLS on upload (relevant to matching):

| Field | Maps to | Used for matching |
|---|---|---|
| Site Code / P Code | `site_code` | **Primary match key** |
| Site Name | `site_name` | Fallback match |
| State | `state` | Fallback match + Roll-to-MMP filter |
| Locality | `locality` | Fallback match + Roll-to-MMP filter |
| Monitoring By | `monitoring_by` / `accepted_by` | Roll-to-MMP same-collector filter |
| Main Activity | `main_activity` | Informational |

The WFP cleaned data file is expected to have the same site codes (P Codes) since WFP assigns them. This is the most reliable match key.

---

## 9. Open Questions (Still to Resolve)

| # | Question | Status |
|---|---|---|
| Q1 | What exact column name does the WFP cleaned data file use for the site code? (Column header from the actual file) | **Pending — need sample headers** |
| Q2 | For Roll-to-Next-MMP: does the site need to already exist in the target MMP's site list, or can the system add it? | Pending |
| Q3 | For Return Required: what is the repayment mechanism — cash return, deduction from next payment, or both? | Pending |
| Q4 | Should the enumerator be able to see their own rejection/exception status, or is this admin-only information? | Pending |
| Q5 | For write-off authorization — does finance need to digitally sign (like existing approval signatures), or is a text justification enough? | Pending |

---

## 10. Answered Design Decisions

| Decision | Answer |
|---|---|
| Who uploads WFP confirmation file | Admin and Super Admin only |
| Who makes cost recovery decisions | Supervisor (propose), Admin, Finance, Super Admin |
| Can cycle close with some rejected sites | Yes — they go to Exceptions, cycle still closes |
| Can rejected sites be re-opened for re-submission | No — once cycle is closed, field window is gone |
| Does `submitted` replace `completed` entirely | Yes |
| Roll-to-Next-MMP filter criteria | Same state + same data collector + target MMP active/draft |

---

## 11. Implementation Phases (Suggested Order)

### Phase A — Status Change Only (lowest risk, highest value)
- Add `submitted` status to site visits (rename `completed`)
- Update Cycle Close checklist to accept `submitted` as resolved
- Update all status badges, filters, and displays

### Phase B — Not-Covered Cost Recovery Gate
- Build `cost_recovery_log` table
- Add resolution dialog (Roll / Return / Write-Off)
- Add new gate to Pre-Close Checklist

### Phase C — WFP File Confirmation
- Build WFP file upload + matching engine on Cycle Close page
- Add Exceptions tab
- Add History/audit tab

### Phase D — Roll-to-Next-MMP
- Build MMP eligibility query (same state + collector + active)
- Link rolled costs to target MMP as pre-approved
- Notify supervisor and enumerator of the roll

---

*This document will be updated as decisions are made. All implementation must wait until design is finalized.*
