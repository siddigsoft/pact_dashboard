# Permit Verification Questions - Complete Scenario Guide

This document explains all possible scenarios and outcomes when using the Permit Verification Questions component in the Coordinator Sites page.

## Overview

The Permit Verification Questions component guides coordinators through verifying state permit requirements. Based on their answers, different actions are taken with the sites.

## Flow Diagram

```
START: Permit Verification Questions Dialog Opens
│
├─ Question 1: "Do you require a State permit in your state?"
│  │
│  ├─ Option A: "Yes, it's required and I will upload it" (required_have_it)
│  │  │
│  │  └─→ Goes to State Permit Upload Screen
│  │     │
│  │     ├─ User uploads permit → handleStatePermitUploaded()
│  │     │  │
│  │     │  └─→ SCENARIO 1: State Permit Uploaded Successfully
│  │     │
│  │     └─ User cancels → Returns to Question 1
│  │
│  ├─ Option B: "Yes, it's required but I don't have it" (required_dont_have_it)
│  │  │
│  │  └─→ Goes to Follow-up Question
│  │     │
│  │     ├─ Question 2: "Are you able to work without the state permit?"
│  │     │  │
│  │     │  ├─ Answer: "Yes, I can proceed without it" (yes)
│  │     │  │  │
│  │     │  │  └─→ SCENARIO 2: Can Work Without State Permit
│  │     │  │
│  │     │  └─ Answer: "No, I cannot proceed without it" (no)
│  │     │     │
│  │     │     └─→ SCENARIO 3: Send Back to FOM
│  │     │
│  │     └─ User clicks Back → Returns to Question 1
│  │
│  └─ Option C: "No, it's not a requirement" (not_required)
│     │
│     └─→ SCENARIO 4: State Permit Not Required
```

---

## Scenario 1: State Permit Required & Uploaded ✅

### User Actions:
1. Selects: **"Yes, it's required and I will upload it"**
2. Clicks **"Next"**
3. Uploads state permit via `StatePermitUpload` component
4. Permit upload completes successfully

### What Happens:

#### In the Component:
- `handleStatePermitUploaded()` is called
- Sets `statePermitUploaded = true`
- Calls `handleComplete()` which creates a decision:
  ```typescript
  {
    statePermit: {
      requirement: 'required_have_it',
      canWorkWithout: null,
      uploaded: true
    },
    localityPermit: {
      requirement: null,
      canWorkWithout: null,
      uploaded: existingLocalityPermit
    }
  }
  ```
- Shows confirmation message: *"The state permit for {state} has been uploaded successfully. The verification process for the state permit is complete. You will now proceed to verify the permits for the localities."*

#### In CoordinatorSites.tsx (`handlePermitVerificationComplete`):

**For State-Level Verification:**
- Gets all sites in the state from `coordinatorSites`
- For each site:
  - Updates `additional_data` with `permit_decision`
  - Sets `status = 'verified'`
  - Sets `verified_at` and `verified_by`
  - Updates MMP workflow to mark as `coordinatorVerified: true`
- Shows toast: *"State Verified - {count} sites in {state} have been verified successfully."*
- Closes dialog
- Switches to **"Verified" tab**

**For Site-Level Verification:**
- Updates selected site(s) with same logic
- Shows toast: *"Site(s) Verified - {count} sites have been verified successfully."*
- Closes dialog
- Switches to **"Verified" tab**

### Final State:
- ✅ Sites status: `verified`
- ✅ Sites appear in **"Verified" tab**
- ✅ MMP workflow: `coordinatorVerified: true`
- ✅ State permit uploaded and stored
- ✅ Ready for locality permit verification

---

## Scenario 2: State Permit Required But Can Work Without It ⚠️

### User Actions:
1. Selects: **"Yes, it's required but I don't have it"**
2. Clicks **"Next"**
3. Selects: **"Yes, I can proceed without it"**
4. Clicks **"Continue"**

### What Happens:

#### In the Component:
- `handleStateFollowUpNext()` is called with `stateCanWorkWithout = 'yes'`
- Calls `handleComplete()` which creates a decision:
  ```typescript
  {
    statePermit: {
      requirement: 'required_dont_have_it',
      canWorkWithout: 'yes',
      uploaded: false
    },
    localityPermit: {
      requirement: null,
      canWorkWithout: null,
      uploaded: existingLocalityPermit
    }
  }
  ```
- Shows confirmation message: *"A state permit is required for {state}, but you can proceed without it. The verification process for the state permit is complete. You will now proceed to verify the permits for the localities."*

#### In CoordinatorSites.tsx (`handlePermitVerificationComplete`):

**For State-Level Verification:**
- Gets all sites in the state
- Calculates: `statePermitNotRequired = true` (because `required_dont_have_it` + `canWorkWithout = 'yes'`)
- For each site:
  - Updates `additional_data` with:
    - `permit_decision`
    - `state_permit_not_required: true`
  - **Does NOT change status to verified** (only updates `additional_data`)
  - Updates MMP workflow to mark as `coordinatorVerified: true`
- Shows toast: *"State Permit Not Required - {count} sites in {state} moved to Locality Permit Status."*
- Closes dialog
- Switches to **"Locality Permit" sub-tab** (under "New" tab)

**For Site-Level Verification:**
- Same logic but for selected site(s)
- Shows toast: *"State Permit Not Required - Site moved to Locality Permit Status."*
- Switches to **"Locality Permit" sub-tab**

### Final State:
- ⚠️ Sites status: **Unchanged** (remains `Pending`, `assigned`, etc.)
- ⚠️ Sites appear in **"New" tab → "Locality Permit" sub-tab**
- ✅ MMP workflow: `coordinatorVerified: true`
- ✅ `state_permit_not_required: true` flag set
- ✅ Ready for locality permit verification (can proceed without state permit)

---

## Scenario 3: State Permit Required & Cannot Proceed ❌

### User Actions:
1. Selects: **"Yes, it's required but I don't have it"**
2. Clicks **"Next"**
3. Selects: **"No, I cannot proceed without it"**
4. Clicks **"Send Back to FOM"** (red destructive button)

### What Happens:

#### In the Component:
- `handleStateFollowUpNext()` is called with `stateCanWorkWithout = 'no'`
- **Immediately calls `onSendBackToFOM()`** (does NOT call `handleComplete()`)
- Reason message: *"State permit is required for {state} but coordinator does not have it and cannot proceed without it."*

#### In CoordinatorSites.tsx (`handleSendBackToFOM`):

**For State-Level Verification:**
- Gets all sites in the state from `coordinatorSites`
- For each site:
  - Updates status to `returned_to_fom`
  - Sets `verification_notes` with the reason
  - Sets `verified_at` and `verified_by`
- Sends notifications:
  - **To FOM** (MMP uploader): *"Sites Returned by Coordinator - {count} sites in {state} have been returned. Reason: {reason}"*
  - **To Hub Supervisor**: Via `NotificationTriggerService.siteReturnedToFOM()`
- Shows toast: *"Sites Returned to FOM - {count} site(s) in {state} have been sent back to FOM for action."*
- Closes dialog
- Refreshes MMP files

**For Site-Level Verification:**
- Same logic but for selected site(s)
- Shows toast: *"Sites Returned to FOM - The site has been sent back to FOM for action."*

### Final State:
- ❌ Sites status: `returned_to_fom`
- ❌ Sites **removed from coordinator's view** (filtered out in `coordinatorSites`)
- ❌ Sites appear in **FOM's view** (awaiting action)
- ✅ Notifications sent to FOM and Hub Supervisor
- ✅ Reason stored in `verification_notes`

---

## Scenario 4: State Permit Not Required ✅

### User Actions:
1. Selects: **"No, it's not a requirement"**
2. Clicks **"Next"**

### What Happens:

#### In the Component:
- `handleStatePermitNext()` is called with `statePermitRequirement = 'not_required'`
- **Immediately calls `handleComplete()`** (skips upload and follow-up)
- Creates a decision:
  ```typescript
  {
    statePermit: {
      requirement: 'not_required',
      canWorkWithout: null,
      uploaded: false
    },
    localityPermit: {
      requirement: null,
      canWorkWithout: null,
      uploaded: existingLocalityPermit
    }
  }
  ```
- Shows confirmation message: *"No state permit is required for {state}. The verification process for the state permit is complete. You will now proceed to verify the permits for the localities."*

#### In CoordinatorSites.tsx (`handlePermitVerificationComplete`):

**For State-Level Verification:**
- Gets all sites in the state
- Calculates: `statePermitNotRequired = true` (because `requirement = 'not_required'`)
- For each site:
  - Updates `additional_data` with:
    - `permit_decision`
    - `state_permit_not_required: true`
  - **Does NOT change status to verified** (only updates `additional_data`)
  - Updates MMP workflow to mark as `coordinatorVerified: true`
- Shows toast: *"State Permit Not Required - {count} sites in {state} moved to Locality Permit Status."*
- Closes dialog
- Switches to **"Locality Permit" sub-tab** (under "New" tab)

**For Site-Level Verification:**
- Same logic but for selected site(s)
- Shows toast: *"State Permit Not Required - Site moved to Locality Permit Status."*
- Switches to **"Locality Permit" sub-tab**

### Final State:
- ✅ Sites status: **Unchanged** (remains `Pending`, `assigned`, etc.)
- ✅ Sites appear in **"New" tab → "Locality Permit" sub-tab**
- ✅ MMP workflow: `coordinatorVerified: true`
- ✅ `state_permit_not_required: true` flag set
- ✅ Ready for locality permit verification (state permit not needed)

---

## Summary Table

| Scenario | State Permit Status | Can Work Without? | Site Status | Tab Location | MMP Workflow |
|----------|---------------------|-------------------|-------------|--------------|--------------|
| **1. Uploaded** | Required & Uploaded | N/A | `verified` | Verified tab | `coordinatorVerified: true` |
| **2. Can Work Without** | Required but Missing | Yes | Unchanged | New → Locality Permit | `coordinatorVerified: true` |
| **3. Cannot Proceed** | Required but Missing | No | `returned_to_fom` | Removed (sent to FOM) | Unchanged |
| **4. Not Required** | Not Required | N/A | Unchanged | New → Locality Permit | `coordinatorVerified: true` |

---

## Key Differences: State-Level vs Site-Level Verification

### State-Level Verification:
- Triggered when clicking a **state card** or **"Upload Permits"** button on a state
- Processes **ALL sites in that state** at once
- Uses `stateForPermitVerification` state variable
- Gets sites by filtering `coordinatorSites` by state name

### Site-Level Verification:
- Triggered when verifying individual sites or bulk selected sites
- Processes only **selected site(s)**
- Uses `siteForPermitVerification` or `bulkSitesForPermitVerification`
- Can be from "Permits Attached" tab or bulk selection

---

## Important Notes

1. **State Permit Not Required Logic:**
   - When `statePermitNotRequired = true`, sites are **NOT** marked as `verified`
   - They remain in their current status but move to "Locality Permit" sub-tab
   - This allows coordinators to proceed with locality permit verification

2. **Returned to FOM:**
   - Sites with status `returned_to_fom` are **filtered out** from coordinator's view
   - They appear in FOM's view for correction/action
   - Notifications are sent to both FOM and Hub Supervisor

3. **MMP Workflow:**
   - All scenarios (except "Send Back to FOM") mark MMP as `coordinatorVerified: true`
   - This indicates the coordinator has reviewed and made a decision about permits

4. **Additional Data:**
   - All decisions are stored in `additional_data.permit_decision`
   - `state_permit_not_required` flag is set when applicable
   - This data is used for tracking and audit purposes

---

## User Experience Flow

```
Coordinator clicks State Card or "Upload Permits" button
    ↓
Permit Verification Questions Dialog Opens
    ↓
Question 1: State Permit Required?
    ├─→ Yes, will upload → Upload Screen → Scenario 1
    ├─→ Yes, don't have it → Question 2 → Scenario 2 or 3
    └─→ No, not required → Scenario 4
    ↓
Confirmation Dialog Shows
    ↓
User clicks "Okay"
    ↓
Sites Processed Based on Decision
    ↓
Dialog Closes, Page Updates
```

---

## Error Handling

- If no sites found for state: Shows error toast, returns early
- If database update fails: Logs error, continues with next site
- If notification fails: Logs warning, doesn't block main flow
- If MMP workflow update fails: Logs warning, doesn't block site update

