# 📋 MMP (Monthly Monitoring Plan) User Guide

**Complete Guide to Monthly Monitoring Plan Workflows**

**Version:** 1.0  
**Last Updated:** November 23, 2025  
**Platform:** PACT Workflow Platform  
**Status:** Production Ready

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Who Does What](#who-does-what)
3. [MMP Workflow](#mmp-workflow)
4. [Uploading an MMP](#uploading-an-mmp)
5. [CSV File Format](#csv-file-format)
6. [Verification Process](#verification-process)
7. [Approval Process](#approval-process)
8. [Site Visit Assignment](#site-visit-assignment)
9. [Field Data Collection](#field-data-collection)
10. [Financial Operations](#financial-operations)
11. [Reporting](#reporting)
12. [Troubleshooting](#troubleshooting)

---

## Overview

The **Monthly Monitoring Plan (MMP)** is the core workflow of the PACT platform. It manages the entire lifecycle of field monitoring activities, from planning through execution to payment.

### **What is an MMP?**

An MMP is a structured plan that defines:

✅ **Which sites** to visit  
✅ **When** to visit them  
✅ **Who** will visit (data collectors)  
✅ **What data** to collect  
✅ **Budget allocation** for visits  
✅ **Expected outcomes** and deliverables  

### **MMP Lifecycle**

```
Upload → Validate → Verify → Approve → Assign → Execute → Pay
  │         │          │         │        │         │        │
  │         │          │         │        │         │        └─→ Withdrawal
  │         │          │         │        │         └─→ Cost Submission
  │         │          │         │        └─→ Site Visit
  │         │          │         └─→ Final Approval
  │         │          └─→ Permit Verification
  │         └─→ Data Validation
  └─→ CSV File Upload
```

**Timeline:** 3-7 days from upload to approval  
**Key Roles:** Admin, ICT, FOM, Coordinators, Data Collectors  

---

## Who Does What

### **Role Responsibilities**

| Role | Responsibilities | Key Actions |
|------|------------------|-------------|
| **Admin / ICT** | Upload MMP files | Upload CSV, attach permits, configure settings |
| **FOM** | Approve MMPs | Review, approve/reject, assign workflows |
| **Supervisor** | Verify content | Check site details, validate data |
| **Coordinator** | Manage permits | Upload permits, verify cooperating partners |
| **Data Collector** | Execute visits | Accept assignments, collect data, submit costs |
| **Financial Admin** | Process payments | Approve costs, process withdrawals |

---

## MMP Workflow

### **Complete Workflow Diagram**

```
┌─────────────────────────────────────────────────────────────┐
│                    MMP WORKFLOW                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Step 1: UPLOAD                                            │
│  ┌──────────────────────────────────────────┐             │
│  │ Admin uploads CSV file                   │             │
│  │ • Select project                          │             │
│  │ • Choose month/year                       │             │
│  │ • Attach federal permits                  │             │
│  └──────────────────────────────────────────┘             │
│                    │                                        │
│                    ▼                                        │
│  Step 2: VALIDATION                                        │
│  ┌──────────────────────────────────────────┐             │
│  │ System validates file                     │             │
│  │ • Required headers present?               │             │
│  │ • Data format correct?                    │             │
│  │ • No duplicate sites?                     │             │
│  └──────────────────────────────────────────┘             │
│                    │                                        │
│         ┌──────────┴──────────┐                           │
│         ▼                      ▼                           │
│      ✅ Valid              ❌ Invalid                       │
│    Continue             → Fix errors, re-upload            │
│         │                                                  │
│         ▼                                                  │
│  Step 3: PERMIT VERIFICATION                               │
│  ┌──────────────────────────────────────────┐             │
│  │ Coordinator verifies permits              │             │
│  │ • Federal permits ✓                       │             │
│  │ • State permits ✓                         │             │
│  │ • Local permits ✓                         │             │
│  └──────────────────────────────────────────┘             │
│                    │                                        │
│                    ▼                                        │
│  Step 4: CP VERIFICATION                                   │
│  ┌──────────────────────────────────────────┐             │
│  │ Supervisor verifies cooperating partners  │             │
│  │ • Check site details                      │             │
│  │ • Verify CP names                         │             │
│  │ • Mark sites verified/rejected            │             │
│  └──────────────────────────────────────────┘             │
│                    │                                        │
│                    ▼                                        │
│  Step 5: APPROVAL                                          │
│  ┌──────────────────────────────────────────┐             │
│  │ FOM reviews and approves                  │             │
│  │ • First approval ✓                        │             │
│  │ • Final approval ✓                        │             │
│  └──────────────────────────────────────────┘             │
│                    │                                        │
│                    ▼                                        │
│  Step 6: SITE VISIT ASSIGNMENT                             │
│  ┌──────────────────────────────────────────┐             │
│  │ Coordinator assigns collectors            │             │
│  │ • Manual assignment OR                    │             │
│  │ • Auto-assignment (location-based)        │             │
│  │ Collectors notified                       │             │
│  └──────────────────────────────────────────┘             │
│                    │                                        │
│                    ▼                                        │
│  Step 7: DATA COLLECTION                                   │
│  ┌──────────────────────────────────────────┐             │
│  │ Collector executes visit                  │             │
│  │ • Accept assignment                       │             │
│  │ • Navigate to site                        │             │
│  │ • Collect data, photos                    │             │
│  │ • Mark complete                           │             │
│  └──────────────────────────────────────────┘             │
│                    │                                        │
│                    ▼                                        │
│  Step 8: COST SUBMISSION                                   │
│  ┌──────────────────────────────────────────┐             │
│  │ Collector submits costs                   │             │
│  │ • Transportation: X SDG                   │             │
│  │ • Accommodation: X SDG                    │             │
│  │ • Meals: X SDG                            │             │
│  │ • Upload receipts                         │             │
│  └──────────────────────────────────────────┘             │
│                    │                                        │
│                    ▼                                        │
│  Step 9: PAYMENT APPROVAL                                  │
│  ┌──────────────────────────────────────────┐             │
│  │ Financial Admin reviews costs             │             │
│  │ • Approve/adjust/reject                   │             │
│  │ • Credit to wallet                        │             │
│  └──────────────────────────────────────────┘             │
│                    │                                        │
│                    ▼                                        │
│  Step 10: WITHDRAWAL                                       │
│  ┌──────────────────────────────────────────┐             │
│  │ Collector requests payout                 │             │
│  │ • Minimum: 5,000 SDG                      │             │
│  │ • Admin approves                          │             │
│  │ • Payment processed                       │             │
│  └──────────────────────────────────────────┘             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Typical Timeline:**
- **Day 1:** Upload & validation
- **Day 2-3:** Permit verification
- **Day 3-4:** CP verification
- **Day 5:** Approval
- **Day 6-30:** Site visits
- **Day 31:** Cost submissions
- **Day 35:** Payments

---

## Uploading an MMP

### **Prerequisites**

Before uploading, ensure you have:

□ **CSV/Excel file** with correct format  
□ **Federal permits** (if required)  
□ **Project selected** in PACT system  
□ **Month and year** determined  
□ **Hub assignment** confirmed  

---

### **Upload Steps**

#### **Step 1: Navigate to Upload Page**

1. Login to PACT
2. Click **Monitoring Plan** in sidebar
3. Click **Upload MMP** button

---

#### **Step 2: Fill Form**

| Field | Description | Required | Example |
|-------|-------------|----------|---------|
| **MMP Name** | Descriptive name | Yes | "West Darfur January 2025" |
| **Project** | Associated project | Yes | "PACT WD Monitoring" |
| **Month** | Plan month | Yes | "January" |
| **Year** | Plan year | Yes | "2025" |
| **Hub** | Hub office | Yes | "Farchana Hub" |
| **File** | CSV/Excel file | Yes | `mmp_jan_2025.csv` |

---

#### **Step 3: Configure Options**

Optional settings:

- ☐ **Include Market Diversion** - Track market data
- ☐ **Include Warehouse Monitoring** - Monitor warehouses
- ☐ **Enable Auto-Assignment** - Auto-assign collectors

---

#### **Step 4: Upload File**

Two methods:

**Method A: Drag & Drop**
1. Drag CSV file to upload area
2. File auto-validates
3. Preview shown

**Method B: File Selector**
1. Click "Select File"
2. Choose file from computer
3. Click "Open"

---

#### **Step 5: Review Preview**

System shows:

✅ **File Statistics:**
- Total sites: 150
- Valid entries: 148
- Errors: 2
- Warnings: 5

✅ **Preview Table:**
- First 10 rows displayed
- Column headers shown
- Error rows highlighted

---

#### **Step 6: Fix Errors (if any)**

If errors found:

1. **Download error report** (CSV)
2. **Fix in source file**
3. **Re-upload**

---

#### **Step 7: Submit**

1. Click **Upload MMP** button
2. Progress bar shows:
   - Uploading file (20%)
   - Parsing data (40%)
   - Validating entries (60%)
   - Creating MMP (80%)
   - Finalizing (100%)

3. Success message appears
4. Redirected to MMP details page

---

## CSV File Format

### **Required Headers**

| Header | Description | Format | Example |
|--------|-------------|--------|---------|
| `Hub Office` | Hub name | Text | "Farchana Hub" |
| `State` | State location | Text | "West Darfur" |
| `Locality` | Locality name | Text | "Kulbus" |
| `Site Name` | Site identifier | Text | "ADAREEB" |
| `Site Code` | Unique code | Text | "WD-KUL-001" |
| `CP Name` | Cooperating Partner | Text | "World Relief (WR)" |
| `Activity at Site` | Main activity | Text | "GFA" |
| `Monitoring By` | Monitor org | Text | "PACT" |
| `Survey under Master tool` | Survey tool | Text | "PDM" |
| `Use Market Diversion Monitoring` | Market tracking | Yes/No | "Yes" |
| `Use Warehouse Monitoring` | Warehouse tracking | Yes/No | "No" |
| `Visit Date` | Planned date | DD/MM/YYYY | "15/01/2025" |
| `Comments` | Additional notes | Text | "Remote area" |

---

### **Optional Headers**

| Header | Description | Example |
|--------|-------------|---------|
| `Estimated Cost` | Budget estimate | "25000" (in SDG) |
| `Priority` | Visit priority | "High", "Medium", "Low" |
| `Special Instructions` | Extra notes | "Requires 4WD vehicle" |

---

### **Example CSV**

```csv
Hub Office,State,Locality,Site Name,Site Code,CP Name,Activity at Site,Monitoring By,Survey under Master tool,Use Market Diversion Monitoring,Use Warehouse Monitoring,Visit Date,Comments
Farchana Hub,West Darfur,Kulbus,ADAREEB,WD-KUL-001,World Relief (WR),GFA,PACT,PDM,Yes,No,15/01/2025,Remote area
Farchana Hub,West Darfur,Geneina,AL-FAROUQ,WD-GEN-002,ACTED,GFA,PACT,PDM,Yes,Yes,16/01/2025,Near warehouse
```

---

### **Validation Rules**

#### **Critical Errors** (Upload fails)

❌ **Missing required headers**  
❌ **Invalid date format** (must be DD/MM/YYYY)  
❌ **Duplicate site codes**  
❌ **Empty required fields**  

#### **Warnings** (Upload succeeds)

⚠️ **Missing optional fields**  
⚠️ **Date in the past**  
⚠️ **Unusual cost estimates**  
⚠️ **Formatting inconsistencies**  

---

## Verification Process

### **Permit Verification**

**Who:** Coordinators  
**When:** After upload, before approval  
**Duration:** 1-2 days  

#### **Step 1: Access Verification Page**

1. Navigate to MMP details
2. Click **Permits** tab
3. Review permit requirements

---

#### **Step 2: Upload Permits**

**Federal Permits:**
1. Click **Upload Federal Permit**
2. Select PDF file
3. Add description
4. Click **Upload**

**State Permits:** (for each state)
1. Select state
2. Click **Upload State Permit**
3. Upload document
4. Mark as verified

**Local Permits:** (for each locality)
1. Select locality
2. Upload permit
3. Verify

---

#### **Step 3: Mark Verification Complete**

1. Ensure all permits uploaded
2. Review permit checklist
3. Click **Complete Permit Verification**

---

### **Cooperating Partner Verification**

**Who:** Supervisors  
**When:** After permits verified  
**Duration:** 1-2 days  

#### **Step 1: Access CP Verification**

1. Open MMP details
2. Click **CP Verification** tab
3. Review site list

---

#### **Step 2: Verify Each Site**

For each site entry:

1. **Review Details:**
   - Site name
   - CP name
   - Location
   - Activity type

2. **Verify or Reject:**
   - ✅ Click **Verify** if correct
   - ❌ Click **Reject** if issues found

3. **Add Notes:**
   - Explain rejection reason
   - Document verification

---

#### **Step 3: Complete Verification**

1. All sites verified/rejected
2. Progress bar reaches 100%
3. Verification auto-completes
4. MMP ready for approval

---

## Approval Process

### **Who Can Approve**

- Admin
- ICT
- FOM (Field Operation Manager)

---

### **Approval Workflow**

**Two-stage approval:**

1. **First Approval** - Initial review
2. **Final Approval** - Complete authorization

---

### **Approval Steps**

#### **Step 1: Review MMP**

1. Navigate to MMP details
2. Review key information:
   - Total sites
   - Budget allocation
   - Permit status
   - Verification status

---

#### **Step 2: Verify Completeness**

Check that:

□ All permits uploaded  
□ CP verification complete  
□ Site entries valid  
□ Budget approved  
□ No critical errors  

---

#### **Step 3: Make Decision**

**Option A: Approve**
1. Click **Approve** button
2. Add approval notes
3. Confirm approval

**Option B: Reject**
1. Click **Reject** button
2. Enter rejection reason
3. Notify uploader

**Option C: Request Changes**
1. Add comments
2. Request modifications
3. Save without approving

---

#### **Step 4: Final Approval**

After first approval:

1. Second approver reviews
2. Checks first approval notes
3. Grants final approval
4. MMP status → "Approved"

---

### **Status Flow**

```
pending 
   → awaitingPermits 
   → verified 
   → approved 
   → (implementation)
```

---

## Site Visit Assignment

### **Assignment Methods**

#### **Method 1: Manual Assignment**

**Who:** Coordinators, Supervisors  
**Best for:** Small teams, specific expertise needed  

1. **Select Sites:**
   - Open MMP details
   - Click **Assign Sites** tab
   - Select sites to assign

2. **Choose Collector:**
   - Select data collector from list
   - Review collector workload
   - Check availability

3. **Assign:**
   - Click **Assign** button
   - Collector notified
   - Assignment pending acceptance

---

#### **Method 2: Auto-Assignment**

**Who:** System (with oversight)  
**Best for:** Large MMPs, balanced workload  

**Auto-assignment criteria:**
1. **Location proximity** - Closest collectors first
2. **Current workload** - Balanced distribution
3. **Performance history** - Reliable collectors prioritized
4. **Availability** - Only available collectors
5. **Classification match** - Skills alignment

**To enable:**
1. MMP upload → Check "Enable Auto-Assignment"
2. System assigns after approval
3. Review assignments
4. Adjust if needed

---

### **Assignment Notifications**

Collector receives notification with:

- Site details
- Visit date
- Location (map link)
- Expected duration
- Accept/Decline buttons

---

## Field Data Collection

### **For Data Collectors**

#### **Step 1: View Assignments**

1. Login to PACT
2. Go to **My Assignments** OR **Site Visits**
3. See pending assignments

---

#### **Step 2: Accept Assignment**

1. Review site details
2. Check visit date
3. Click **Accept** button

---

#### **Step 3: Navigate to Site**

1. Open assignment
2. View location map
3. Click **Navigate** (opens Google Maps)
4. Travel to site

---

#### **Step 4: Start Visit**

1. Arrive at site
2. Click **Start Visit**
3. GPS location captured
4. Timer starts

---

#### **Step 5: Collect Data**

**Basic Information:**
- Site name
- Date/time
- GPS coordinates
- Weather conditions

**Survey Data:**
- Answer survey questions
- Follow survey tool
- Record observations

**Photos:**
- Upload site photos
- Caption images
- Geotagged automatically

**Documents:**
- Scan receipts
- Upload permits
- Add notes

---

#### **Step 6: Complete Visit**

1. Review all data
2. Ensure photos uploaded
3. Click **Mark Complete**
4. Visit status → "Completed"

---

## Financial Operations

### **Cost Submission**

**Who:** Data Collectors  
**When:** After site visit completion  

#### **Step 1: Create Submission**

1. Open completed visit
2. Click **Submit Costs**
3. Enter actual costs:
   - Transportation: ___ SDG
   - Accommodation: ___ SDG
   - Meals: ___ SDG
   - Other: ___ SDG

---

#### **Step 2: Upload Receipts**

1. Click **Upload Receipt**
2. Select photo/PDF
3. Categorize (transport, meals, etc.)
4. Add notes

---

#### **Step 3: Submit**

1. Review total
2. Add submission notes
3. Click **Submit Costs**
4. Awaits approval

---

### **Cost Approval**

**Who:** Financial Admin, FOM  
**When:** After cost submission  

#### **Review Process:**

1. **Check Receipts:**
   - Receipts uploaded?
   - Amounts reasonable?
   - Details match?

2. **Verify Costs:**
   - Compare to estimates
   - Check policy limits
   - Review justification

3. **Decision:**
   - **Approve** → Credit to wallet
   - **Adjust** → Modify amount
   - **Reject** → Deny payment

---

### **Wallet & Withdrawals**

#### **View Wallet**

1. Navigate to **Wallet** page
2. See current balance
3. View transaction history

---

#### **Request Withdrawal**

1. Click **Request Withdrawal**
2. Enter amount (min 5,000 SDG)
3. Select payment method:
   - Bank transfer
   - Mobile money
4. Add account details
5. Submit request

---

#### **Withdrawal Approval**

**Flow:**
```
Request → Supervisor Review → Finance Approval → Payment
```

**Timeline:** 3-5 business days

---

## Reporting

### **Available Reports**

| Report Type | Who Can Generate | Description |
|-------------|------------------|-------------|
| **MMP Summary** | All (own data) | Sites, visits, completion rates |
| **Financial Report** | Financial Admin | Budgets, costs, payments |
| **Team Performance** | Supervisors | Team metrics, productivity |
| **Site Visit Report** | Coordinators | Visit details, data quality |

---

### **Generate Report**

1. Navigate to **Reports**
2. Select report type
3. Choose filters:
   - Date range
   - Project
   - Team/user
4. Click **Generate**
5. Download PDF/Excel

---

## Troubleshooting

### **Upload Issues**

#### **"Invalid CSV format"**

**Cause:** Missing headers or wrong format

**Solutions:**
1. Download template CSV
2. Compare headers
3. Ensure DD/MM/YYYY dates
4. Check for special characters

---

#### **"Duplicate site code"**

**Cause:** Site code appears multiple times

**Solutions:**
1. Download error report
2. Find duplicate rows
3. Make site codes unique
4. Re-upload

---

#### **"Validation failed"**

**Cause:** Data doesn't meet requirements

**Solutions:**
1. Review error messages
2. Fix specific issues
3. Check required fields
4. Verify date formats

---

### **Assignment Issues**

#### **"No collectors available"**

**Cause:** No collectors in area or all busy

**Solutions:**
1. Adjust assignment area
2. Wait for collectors to finish
3. Manually assign from other areas
4. Split MMP into phases

---

#### **"Collector declined assignment"**

**Cause:** Collector not available

**Solutions:**
1. Reassign to another collector
2. Contact collector for reason
3. Adjust visit date
4. Check workload balance

---

### **Cost Submission Issues**

#### **"Receipts required"**

**Cause:** Missing receipt uploads

**Solutions:**
1. Upload photos of receipts
2. If lost, provide explanation
3. Admin may approve without
4. Adjust amount if needed

---

#### **"Amount exceeds limit"**

**Cause:** Cost above policy threshold

**Solutions:**
1. Provide detailed justification
2. Split into categories
3. Contact supervisor
4. Admin override possible

---

## Quick Reference

### **Key Contacts**

| Issue | Contact |
|-------|---------|
| Upload problems | ICT Team |
| Approval delays | FOM |
| Payment issues | Financial Admin |
| Assignment questions | Coordinator |
| Technical errors | Admin |

---

### **Important Limits**

| Item | Limit |
|------|-------|
| Minimum withdrawal | 5,000 SDG |
| Maximum sites per MMP | 500 |
| Maximum file size | 10 MB |
| Approval timeout | 7 days |

---

### **Status Meanings**

| Status | Meaning | Next Step |
|--------|---------|-----------|
| `pending` | Uploaded, not reviewed | Wait for verification |
| `awaitingPermits` | Needs permit upload | Upload permits |
| `verified` | Permits & CP verified | Awaiting approval |
| `approved` | Ready for assignments | Assign collectors |
| `rejected` | Issues found | Fix and re-upload |

---

**Last Updated:** November 23, 2025  
**Maintained By:** PACT Platform Team  
**Questions?** Contact your supervisor or system administrator

---

*For technical details, see the Database Schema Guide and RBAC Guide.*
