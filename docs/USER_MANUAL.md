# PACT Workflow Platform
## Complete User Manual

---

# Table of Contents

1. [Introduction](#1-introduction)
2. [Getting Started](#2-getting-started)
3. [Dashboard Overview](#3-dashboard-overview)
4. [User Management](#4-user-management)
5. [Role-Based Access Control](#5-role-based-access-control)
6. [Projects Management](#6-projects-management)
7. [Monthly Monitoring Plans (MMPs)](#7-monthly-monitoring-plans-mmps)
8. [Site Visits](#8-site-visits)
9. [First-Claim Dispatch System](#9-first-claim-dispatch-system)
10. [Classification & Fee Structure](#10-classification--fee-structure)
11. [Field Team Management](#11-field-team-management)
12. [Financial Operations](#12-financial-operations)
13. [Budget Management](#13-budget-management)
14. [Wallet System](#14-wallet-system)
15. [Cost Submission & Approvals](#15-cost-submission--approvals)
16. [Tracker Preparation Plan](#16-tracker-preparation-plan)
17. [Reports & Analytics](#17-reports--analytics)
18. [Communication Features](#18-communication-features)
19. [Maps & Location Services](#19-maps--location-services)
20. [Sites Registry](#20-sites-registry)
21. [Archive Management](#21-archive-management)
22. [Calendar & Scheduling](#22-calendar--scheduling)
23. [Settings & Preferences](#23-settings--preferences)
24. [Notification System](#24-notification-system)
25. [Mobile Application](#25-mobile-application)
26. [Troubleshooting](#26-troubleshooting)
27. [Glossary](#27-glossary)

---

# 1. Introduction

## 1.1 What is PACT?

**PACT** stands for **Planning, Approval, Coordination, and Tracking**. The PACT Workflow Platform is a comprehensive field operations management system designed to streamline:

- Monthly Monitoring Plans (MMPs)
- Site visits and field data collection
- Field team coordination
- Financial tracking and approvals
- Real-time location sharing
- Role-based access control
- Mobile field operations with offline support

## 1.2 Key Benefits

| Benefit | Description |
|---------|-------------|
| **Streamlined Workflows** | Automate approval processes and reduce manual coordination |
| **Real-Time Visibility** | Track field team locations and site visit progress instantly |
| **Financial Control** | Manage budgets, track expenses, and approve payments |
| **Role-Based Security** | Ensure users only access what they need |
| **Mobile-Ready** | Native Android app with offline capabilities |
| **Data Integrity** | Complete audit trails for all operations |
| **Smart Dispatch** | Uber/Lyft-style site claiming for field teams |
| **Classification Fees** | Automatic fee calculation based on enumerator level |

## 1.3 System Requirements

### Web Browser Requirements
- Google Chrome (recommended) - Version 90+
- Mozilla Firefox - Version 88+
- Microsoft Edge - Version 90+
- Safari - Version 14+

### Mobile Requirements
- Android 8.0 (API 26) or later
- iOS 13.0 or later
- Minimum 2GB RAM recommended
- GPS/Location services enabled

---

# 2. Getting Started

## 2.1 Account Registration

1. Navigate to the PACT platform URL
2. Click **"Get Started"** on the landing page
3. Click **"Register"** to create a new account
4. Fill in the required information:
   - Full Name
   - Email Address
   - Phone Number
   - Password (minimum 8 characters)
   - Select your primary role
5. Click **"Create Account"**
6. Check your email for verification link
7. Click the verification link to activate your account

## 2.2 Logging In

1. Go to the login page
2. Enter your registered email address
3. Enter your password
4. Click **"Sign In"**
5. If 2FA is enabled, enter the verification code
6. You will be redirected to your personalized dashboard

## 2.3 Forgot Password

1. Click **"Forgot Password?"** on the login page
2. Enter your registered email address
3. Click **"Send Reset Link"**
4. Check your email for the password reset link
5. Click the link and create a new password
6. Log in with your new password

## 2.4 First-Time Setup

After your first login, complete these steps:

1. **Update Profile**: Add your profile photo and contact details
2. **Set Preferences**: Configure notifications and display settings
3. **Review Permissions**: Understand what actions you can perform
4. **Enable Location**: Allow location access for field operations (if applicable)
5. **Install Mobile App**: Download the Android app for field work

---

# 3. Dashboard Overview

The Mission Control Dashboard is your central hub for all operations.

## 3.1 Dashboard Zones

The dashboard is organized into distinct zones based on your role:

### Operations Center
- Total Operations count
- Completed Visits with completion rate
- Active Operations in progress
- Pending Queue awaiting assignment
- Overdue Alerts
- Performance Score

### Planning Zone
- View upcoming site visits
- Track MMP progress
- See pending assignments

### Performance Zone
- Key performance indicators (KPIs)
- Completion statistics
- Trend analysis

### Team Zone
- Field team locations
- Online/offline status
- Quick team actions

### Compliance Zone
- Audit status
- Compliance metrics
- Pending verifications

## 3.2 Quick Actions

Located at the top of your dashboard:

| Action | Description |
|--------|-------------|
| **Create Site Visit** | Start a new site visit assignment |
| **Upload MMP** | Import monthly monitoring plans |
| **View Reports** | Access analytics and reports |
| **Search** | Global search across all data |

## 3.3 Notifications

The notification bell displays:
- New assignments
- Approval requests
- System alerts
- Message notifications
- Site claim updates

Click on any notification to view details or take action.

## 3.4 Live Mode Toggle

Toggle **"Live"** mode to enable:
- Real-time data updates
- Automatic refresh
- Live location tracking
- Instant notifications

---

# 4. User Management

## 4.1 User Roles Overview

| Role | Description | Primary Permissions |
|------|-------------|---------------------|
| **Super Admin** | Highest authority with full system access | All Admin permissions PLUS: manage super admins, view/restore deleted records, system overrides, manage all wallets |
| **Admin** | System administrator | User management, role management, project/MMP/site visit CRUD, financial approvals |
| **ICT** | Technical administrator | System configuration, user support, MMP management |
| **Field Operation Manager (FOM)** | Manages field operations | MMP approval, team coordination, site visit assignment |
| **Financial Admin** | Manages financial operations | Budget management, payment approvals, wallet operations |
| **Supervisor** | Supervises field teams | Team monitoring, site visit review |
| **Coordinator** | Coordinates field activities | Site visit management |
| **Data Collector** | Collects field data | Site visit execution, site claiming |
| **Reviewer** | Reviews submissions | Read-only access to verify data |

### Super Admin Exclusive Capabilities

Super Admin is the highest role in the system with these exclusive permissions:

- **Manage Super Admins**: Create, deactivate, and manage other super admin accounts (maximum 3 allowed)
- **Audit Log Access**: Full access to deletion audit logs
- **Record Restoration**: Ability to restore deleted records
- **System Override**: Override system restrictions and approvals
- **All Wallet Management**: Full control over all user wallets
- **Complete Permission Bypass**: All permission checks automatically pass

## 4.2 User Classifications

Users can be assigned classification levels that affect their fee rates:

| Classification | Level | Description |
|---------------|-------|-------------|
| **Classification A** | Senior | Highest fee tier, experienced enumerators |
| **Classification B** | Standard | Mid-level fee tier |
| **Classification C** | Junior | Entry-level fee tier |

## 4.3 Viewing Users

1. Navigate to **Users** from the sidebar
2. View the list of all users in the system
3. Use filters to find specific users:
   - By role
   - By status (active/inactive)
   - By classification
   - By name or email

## 4.4 User Details

Click on any user to view:
- Profile information
- Assigned roles
- Classification level
- Activity history
- Performance metrics
- Wallet balance (if applicable)

## 4.5 Managing User Status

Administrators can:
- Activate/deactivate user accounts
- Reset user passwords
- Update user information
- Assign/remove roles
- Change classification level

---

# 5. Role-Based Access Control

## 5.1 Understanding Permissions

Permissions are organized by:
- **Resource**: What the user can access (users, projects, MMPs, etc.)
- **Action**: What they can do (create, read, update, delete, approve)

### Permission Matrix

| Resource | create | read | update | delete | approve | assign | archive |
|----------|--------|------|--------|--------|---------|--------|---------|
| Users | Admin, ICT | All | Admin, ICT | Admin | - | Admin | - |
| Projects | Admin, ICT | All | Admin, ICT, FOM | Admin | - | Admin | - |
| MMPs | Admin, ICT, FOM | All | Admin, ICT, FOM | Admin | Admin, ICT, FOM | - | Admin, FA |
| Site Visits | Admin, ICT, FOM | All | All (own) | Admin | - | Admin, FOM | - |
| Finances | - | FA, Admin | FA, Admin | - | FA, Admin | - | - |
| Reports | Admin, FA | All | - | - | - | - | - |

## 5.2 Role Management

### Creating Custom Roles

1. Go to **Role Management** from the sidebar
2. Click **"Create Role"**
3. Enter role details:
   - Role Name
   - Display Name
   - Description
   - Category (Field, Administrative, Financial, Technical)
4. Select permissions using:
   - Permission presets (Read Only, Field Operations, etc.)
   - Role templates (Project Manager, Field Supervisor, etc.)
   - Individual permission selection
5. Click **"Create Role"**

### Editing Roles

1. Find the role in the Role Management page
2. Click the **Edit** icon
3. Modify permissions as needed
4. Click **"Save Changes"**

### Assigning Roles to Users

1. Go to **Users** > Select a user
2. Click **"Manage Roles"**
3. Select roles to assign
4. Click **"Save"**

## 5.3 Permission Templates

Pre-configured templates for common scenarios:

| Template | Best For |
|----------|----------|
| **Project Manager** | Overseeing projects and teams |
| **Field Supervisor** | Managing field operations |
| **Finance Officer** | Financial operations and approvals |
| **Data Analyst** | Reporting and data analysis |
| **Regional Coordinator** | Regional activity coordination |
| **HR Manager** | User account management |
| **Auditor** | Read-only compliance review |
| **Technical Support** | System configuration and support |

---

# 6. Projects Management

## 6.1 Creating a Project

1. Navigate to **Projects** from the sidebar
2. Click **"Create Project"**
3. Fill in project details:
   - Project Name
   - Description
   - Start Date
   - End Date
   - Project Manager
   - Budget (optional)
4. Click **"Create Project"**

## 6.2 Project Details

Each project includes:
- **Overview**: Basic project information
- **Team**: Assigned team members
- **Activities**: Project activities and tasks
- **MMPs**: Associated Monthly Monitoring Plans
- **Site Visits**: Related site visits
- **Budget**: Financial allocation
- **Timeline**: Project schedule

## 6.3 Managing Project Team

1. Open the project
2. Go to **Team** tab
3. Click **"Add Team Member"**
4. Search and select users
5. Assign team roles
6. Click **"Add"**

## 6.4 Project Activities

Create activities within projects:

1. In project detail, go to **Activities**
2. Click **"Create Activity"**
3. Enter activity details:
   - Activity Name
   - Type
   - Start/End Date
   - Assigned Members
4. Click **"Create"**

## 6.5 Project Status

Projects can have the following statuses:
- **Draft**: Initial creation
- **Active**: Currently running
- **Completed**: Successfully finished
- **On Hold**: Temporarily paused
- **Cancelled**: Terminated

---

# 7. Monthly Monitoring Plans (MMPs)

## 7.1 Understanding MMPs

MMPs are structured plans that define:
- Sites to be monitored
- Monitoring schedule
- Assigned personnel
- Budget allocation
- Permit requirements

## 7.2 MMP Upload

### Preparing Your CSV File

Your CSV file should include:
- Site Code (unique identifier)
- Site Name
- State
- Locality
- Location (coordinates - optional)
- Planned Visit Date
- Classification
- Special Requirements

### Upload Process

1. Navigate to **MMP** > **Upload**
2. Select your project
3. Choose the month/period
4. Click **"Select File"** or drag-and-drop your CSV
5. Review the validation results
6. Fix any errors shown
7. Click **"Upload"**

### Validation Checks

The system validates:
- File format (CSV)
- Required columns
- Data types
- Date formats
- Coordinate validity
- Duplicate site detection (same site in same month)
- User references

### Duplicate Prevention

The system prevents:
- **Same file + same project + same month**: Blocked as exact duplicate
- **Same site in same month across MMPs**: Shows which sites already exist
- **Allows**: Same file for different months (monthly recurring)
- **Allows**: Different files for same project/month (supplementary data)

## 7.3 MMP Workflow Stages

| Stage | Description | Actions Available |
|-------|-------------|-------------------|
| **Draft** | Initial upload | Edit, Delete |
| **Submitted** | Awaiting review | Review |
| **Under Review** | Being reviewed | Approve, Reject, Request Changes |
| **Approved** | Ready for dispatch | Forward to FOM |
| **Forwarded to FOM** | With Field Operations | Assign Coordinators |
| **Dispatched** | Sites assigned | Monitor Progress |
| **Completed** | All visits done | Archive |
| **Archived** | Historical record | View Only |

## 7.4 MMP Verification

Verifying MMP data ensures accuracy:

1. Open the MMP
2. Click **"Verify"**
3. Review each site entry:
   - Location accuracy
   - Permit status
   - Classification correctness
4. Mark items as verified or flag issues
5. Complete verification

## 7.5 Permit Management

For sites requiring permits:

1. Go to MMP detail
2. Click **"Permit Upload"**
3. Upload permit document
4. Enter permit details:
   - Permit Number
   - Issue Date
   - Expiry Date
   - Issuing Authority
5. Submit for verification

## 7.6 Forwarding MMPs

After approval, forward to Field Operations:

1. Open the approved MMP
2. Click **"Forward to FOM"**
3. Select target Field Operation Manager
4. Add any notes
5. Click **"Forward"**

## 7.7 Dispatching Sites

Field Operation Managers dispatch sites to collectors:

1. Open the MMP
2. Select sites to dispatch
3. Choose dispatch mode:
   - **Open**: Available to all collectors
   - **State**: Available to collectors in specific states
   - **Locality**: Available to collectors in specific localities
   - **Individual**: Assigned to specific collectors
4. Click **"Dispatch"**

---

# 8. Site Visits

## 8.1 Creating Site Visits

### Standard Site Visit

1. Go to **Site Visits** > **Create**
2. Select creation method:
   - **From MMP**: Select from approved MMP sites
   - **Urgent**: Create ad-hoc urgent visit
3. Fill in details:
   - Site information
   - Planned date
   - Assigned collector
   - Special instructions
4. Click **"Create"**

### From MMP

1. Click **"Create from MMP"**
2. Select the project
3. Choose the MMP
4. Select sites to create visits for
5. Assign dates and collectors
6. Click **"Create Visits"**

## 8.2 Site Visit Status Flow

```
Dispatched → Claimed → Accepted → In Progress → Completed → Verified
                                        ↓
                                   Cancelled
```

| Status | Description |
|--------|-------------|
| **Dispatched** | Available for claiming |
| **Claimed** | Collector has claimed the site |
| **Accepted** | Claim approved, ready to start |
| **Assigned** | Directly assigned by operations |
| **In Progress** | Visit actively being conducted |
| **Completed** | Data collection finished |
| **Verified** | Supervisor has verified data |
| **Cancelled** | Visit cancelled |

## 8.3 Conducting Site Visits

For Data Collectors:

1. View your assigned/claimed visits on the dashboard
2. Click on a visit to open details
3. Click **"Start Visit"** to begin
4. Capture required data:
   - GPS location (automatic)
   - Photos
   - Form responses
   - Face verification (if required)
5. Click **"Complete Visit"**

## 8.4 Site Entry Management

Each site visit may have multiple entries:

1. Open the site visit
2. Click **"Add Entry"**
3. Fill in entry details
4. Capture location and photos
5. Save the entry
6. Repeat for additional entries

## 8.5 Site Visit Reports

Generate visit reports:

1. Open the site visit
2. Click **"Generate Report"**
3. Select report format:
   - PDF (detailed report with photos)
   - Excel (data export)
4. Download the report

## 8.6 Editing Site Visits

1. Open the site visit
2. Click **"Edit"**
3. Make necessary changes
4. Click **"Save Changes"**

Note: Some fields may be locked based on visit status.

---

# 9. First-Claim Dispatch System

## 9.1 Overview

The First-Claim Dispatch System works like Uber/Lyft - sites are made available and field collectors can claim them on a first-come, first-served basis.

## 9.2 Dispatch Modes

| Mode | Description | Who Can Claim |
|------|-------------|---------------|
| **Open** | Available to all qualified collectors | Any active data collector |
| **State** | Limited to collectors in specific states | Collectors assigned to those states |
| **Locality** | Limited to collectors in specific localities | Collectors in matching state + locality |
| **Individual** | Direct assignment to specific person | Only the assigned collector |

## 9.3 How Claiming Works

### For Data Collectors

1. Open the **Site Visits** or **My Sites** page
2. View available dispatched sites in your area
3. Click **"Claim"** on a site you want to visit
4. The system instantly reserves the site for you
5. Wait for acceptance (or auto-accept if enabled)
6. Once accepted, the site appears in your assignments

### Claim Protection

- Uses atomic database operations to prevent race conditions
- Only one collector can claim each site
- Claims are processed in order received
- Failed claims show immediate feedback

## 9.4 Fee Calculation at Claim Time

When you claim a site:

1. Your classification level (A, B, or C) is checked
2. The fee structure for your classification is applied
3. Enumerator fee and transport fee are calculated
4. Fees are locked in at claim time
5. Upon completion, fees are credited to your wallet

## 9.5 For Operations Team

### Setting Up Dispatch

1. Go to the MMP detail page
2. Select sites to dispatch
3. Choose dispatch mode and criteria
4. Set any special requirements
5. Click **"Dispatch Selected"**

### Monitoring Claims

1. View real-time claim status on MMP page
2. See who claimed each site
3. Approve or reject claims (if manual approval enabled)
4. Reassign unclaimed sites as needed

---

# 10. Classification & Fee Structure

## 10.1 User Classifications

Enumerators are classified into tiers that determine their payment rates:

| Level | Classification | Description |
|-------|---------------|-------------|
| A | Senior | Experienced field workers with proven track record |
| B | Standard | Regular field workers with adequate experience |
| C | Junior | New or less experienced field workers |

## 10.2 Fee Structure

Each classification has associated fee rates:

| Fee Type | Description |
|----------|-------------|
| **Enumerator Fee** | Base payment for completing a site visit |
| **Transport Fee** | Reimbursement for travel costs |
| **Total Cost** | Enumerator Fee + Transport Fee |

## 10.3 Managing Classification Fees

Administrators can configure fee rates:

1. Go to **Administration** > **Classification Fees**
2. View current fee structure for each classification
3. Click **"Edit"** to modify rates
4. Enter new fee amounts
5. Click **"Save Changes"**

### Fee Configuration Example

| Classification | Enumerator Fee (SDG) | Transport Fee (SDG) |
|---------------|---------------------|---------------------|
| A | 5,000 | 2,000 |
| B | 3,500 | 1,500 |
| C | 2,500 | 1,000 |

## 10.4 Fee Application

Fees are applied when:
- A collector claims and accepts a site (claim flow)
- A site is directly assigned to a collector (assignment flow)
- Operations team manually sets fees

Fees are paid to wallet when:
- Site visit is marked as **Completed**
- Creates wallet transaction with full audit trail

---

# 11. Field Team Management

## 11.1 Team Overview

Access from **Field Team** in the sidebar:

- View all team members
- See current status (online/offline)
- Track real-time locations
- Monitor workload distribution
- View classification levels

## 11.2 Team Member Status

| Status | Indicator | Meaning |
|--------|-----------|---------|
| **Online** | Green dot | Currently active |
| **Active** | Orange dot | Has recent activity |
| **Offline** | Gray dot | Not recently active |

## 11.3 Location Tracking

Real-time location features:

1. **Team Map**: View all team members on a map
2. **Location History**: Track movement patterns
3. **Proximity Alerts**: Get notified when collectors near sites
4. **Location Sharing**: Team members share location during visits

### Enabling Location Sharing

1. Go to **Settings** > **Location**
2. Enable **"Share My Location"**
3. Set sharing duration:
   - Always during work hours
   - Only during active visits
   - Manual toggle
4. Click **"Save"**

## 11.4 Nearest Enumerators

The system can find the nearest available enumerators to any site:

1. Open a site visit or MMP site entry
2. Click **"Find Nearest Enumerators"**
3. View list sorted by distance (using GPS coordinates)
4. See each enumerator's:
   - Distance from site
   - Current status
   - Workload
   - Classification level
5. Click to assign directly

### How Distance is Calculated

Uses the Haversine formula to calculate accurate distances between:
- Site GPS coordinates
- Enumerator's last known location

## 11.5 Team Assignment

Assign team members to sites:

1. Select sites to assign
2. Click **"Assign Collector"**
3. View available collectors with:
   - Current workload
   - Proximity to site
   - Skill match
   - Classification level
4. Select collector(s)
5. Confirm assignment

## 11.6 Smart Assignment

The system suggests optimal assignments based on:
- Geographic proximity
- Current workload
- Past performance
- Skill requirements
- Availability
- Classification match

---

# 12. Financial Operations

## 12.1 Financial Dashboard

Access from **Finance** or **Financial Operations**:

- **Overview**: Total budgets, expenses, pending approvals
- **Cash Flow**: Income vs expenses tracking
- **Pending Approvals**: Items awaiting review
- **Recent Transactions**: Latest financial activity

## 12.2 Transaction Types

| Type | Description |
|------|-------------|
| **Down Payment** | Advance payment for field expenses |
| **Site Visit Fee** | Payment for completed site visits |
| **Transport Cost** | Travel expense reimbursement |
| **Adjustment** | Manual balance corrections |
| **Withdrawal** | Cash out from wallet |

## 12.3 Approval Workflow

Two-tier approval process:

1. **Supervisor Approval**: First level review
2. **Finance Approval**: Final authorization

Both levels must approve before payment is processed.

## 12.4 Financial Reports

Generate financial reports:

1. Go to **Finance** > **Reports**
2. Select report type:
   - Expense Summary
   - Payment History
   - Budget Utilization
   - Wallet Transactions
3. Set date range
4. Choose format (PDF/Excel)
5. Download

---

# 13. Budget Management

## 13.1 Creating Budgets

1. Navigate to **Budget**
2. Click **"Create Budget"**
3. Enter details:
   - Budget Name
   - Project (optional)
   - Total Amount
   - Start/End Date
   - Categories
4. Click **"Create"**

## 13.2 Budget Categories

Pre-defined categories:
- Personnel
- Transportation
- Equipment
- Communications
- Contingency

## 13.3 Budget Tracking

Monitor budget usage:

- **Allocated**: Total budget amount
- **Spent**: Amount used
- **Committed**: Pending expenses
- **Available**: Remaining balance
- **Utilization %**: Percentage used

## 13.4 Budget Alerts

Configure alerts for:
- 50% utilization
- 75% utilization
- 90% utilization
- Over budget

---

# 14. Wallet System

## 14.1 Understanding Wallets

Each field user has a digital wallet for:
- Receiving site visit payments
- Tracking earnings history
- Managing withdrawals
- Viewing transaction history

## 14.2 Wallet Dashboard

View on your wallet page:

| Metric | Description |
|--------|-------------|
| **Current Balance** | Available funds (SDG) |
| **Total Earned** | Lifetime earnings |
| **Pending** | Awaiting approval |
| **This Month** | Current month earnings |

## 14.3 Earning Payments

Payments are credited when:
1. You complete a site visit
2. The system calculates fees based on your classification
3. Transaction is created in your wallet
4. Balance is updated immediately

### Payment Breakdown

Each earning shows:
- Enumerator fee amount
- Transport fee amount
- Total payment
- Site visit reference
- Date/time of completion

## 14.4 Transaction History

View all wallet transactions:
- Filter by type (earning, withdrawal, adjustment)
- Filter by date range
- Export to Excel
- View transaction details

## 14.5 Admin Wallet Management

Administrators can:
- View all user wallets
- See earnings breakdown
- Process withdrawals
- Make adjustments
- Generate wallet reports

---

# 15. Cost Submission & Approvals

## 15.1 Submitting Costs

Field users can submit expenses:

1. Go to **Finance** > **Submit Cost**
2. Select cost type:
   - Transportation
   - Down Payment Request
   - Other Expenses
3. Enter details:
   - Amount
   - Description
   - Supporting documents
4. Submit for approval

## 15.2 Approval Process

```
Submitted → Supervisor Review → Finance Review → Approved/Rejected
```

### For Supervisors

1. Go to **Supervisor Approval**
2. Review pending submissions
3. Check documentation
4. Approve or reject with comments

### For Finance

1. Go to **Finance Approval**
2. Review supervisor-approved items
3. Verify budget availability
4. Final approve or reject

## 15.3 Tracking Submissions

View submission status:
- **Pending**: Awaiting review
- **Supervisor Approved**: First level passed
- **Approved**: Fully approved
- **Rejected**: Not approved (see reason)
- **Paid**: Payment processed

---

# 16. Tracker Preparation Plan

## 16.1 Overview

The Tracker Preparation Plan provides comprehensive analysis of planned vs. actual site coverage, helping with invoice preparation and cost tracking.

## 16.2 Accessing Tracker

1. Navigate to **Tracker Preparation** from sidebar
2. Or access from MMP detail page via **"Tracker Plan"** button

## 16.3 Analysis Views

### Summary View
- Total planned sites
- Completed sites
- Completion percentage
- Total costs incurred

### Site-by-Site View
- Individual site status
- Enumerator assigned
- Fees calculated
- Completion date

### Cost Breakdown
- Enumerator fees total
- Transport fees total
- Combined costs
- By classification level

## 16.4 Real-Time Updates

The tracker updates in real-time via Supabase Realtime:
- Site completions appear instantly
- Cost calculations update automatically
- Status changes reflect immediately

## 16.5 Export Capabilities

Export tracker data:

| Format | Contents |
|--------|----------|
| **Excel** | Full data with calculations |
| **PDF** | Formatted report for printing |

## 16.6 Filter Presets

Save commonly used filter combinations:
- By project
- By date range
- By status
- By state/locality

---

# 17. Reports & Analytics

## 17.1 Available Reports

| Report | Description |
|--------|-------------|
| **Operations Summary** | Overview of all field operations |
| **Site Visit Report** | Detailed site visit data |
| **Financial Summary** | Budget and expense overview |
| **Team Performance** | Individual and team metrics |
| **Completion Analysis** | Planned vs actual completion |
| **Geographic Coverage** | Map-based coverage analysis |

## 17.2 Generating Reports

1. Go to **Reports** from sidebar
2. Select report type
3. Configure parameters:
   - Date range
   - Projects
   - States/localities
   - Status filters
4. Click **"Generate"**
5. View or download

## 17.3 Scheduled Reports

Set up automatic reports:

1. Create report configuration
2. Set schedule (daily, weekly, monthly)
3. Choose recipients
4. Reports are emailed automatically

## 17.4 Dashboard Analytics

Interactive charts showing:
- Completion trends
- Geographic distribution
- Team workload
- Budget utilization
- Performance metrics

---

# 18. Communication Features

## 18.1 In-App Notifications

Receive notifications for:
- New assignments
- Approval requests
- Status changes
- System alerts
- Team messages

## 18.2 Notification Center

Access via bell icon:
- View all notifications
- Mark as read/unread
- Filter by type
- Clear notifications

## 18.3 Push Notifications

Configure push notifications for mobile:
- Assignment alerts
- Approval requests
- Completion confirmations
- Urgent messages

## 18.4 Team Messaging

Send messages to team members:
1. Open team member profile
2. Click **"Message"**
3. Type message
4. Send

---

# 19. Maps & Location Services

## 19.1 Interactive Maps

Map features include:
- Site locations with status markers
- Team member locations
- Clustering for dense areas
- Satellite/terrain views

## 19.2 Map Markers

| Color | Meaning |
|-------|---------|
| Blue | Pending/planned |
| Green | Completed |
| Orange | In progress |
| Red | Overdue/urgent |
| Gray | Cancelled |

## 19.3 Location Capture

During site visits:
1. GPS automatically captured
2. Accuracy indicator shown
3. Manual adjustment if needed
4. Location saved with visit data

## 19.4 Geofencing

Optional geofencing features:
- Verify collector is at site location
- Alert if outside expected area
- Log location verification

---

# 20. Sites Registry

## 20.1 Understanding the Registry

The Sites Registry is a master database of all monitoring sites, preventing duplicates and enabling GPS enrichment over time.

## 20.2 Site Matching

When uploading MMPs, the system uses three-tier matching:

1. **Exact Code Match**: Site code matches existing registry entry
2. **Name + State + Locality**: Same name in same location
3. **Name + State**: Same name in same state

If matched, the existing site is linked. If not, a new registry entry is created.

## 20.3 GPS Enrichment

Sites can be enriched with GPS coordinates:
- From field visits (automatic capture)
- Manual entry by coordinators
- Bulk import from external sources

## 20.4 Viewing Registry

1. Go to **Hub Operations** > **Sites Registry**
2. View all registered sites
3. Filter by state, locality, or project
4. See GPS coverage status

## 20.5 Managing Sites

Administrators can:
- Add new sites manually
- Edit site information
- Merge duplicate entries
- Update GPS coordinates
- Archive inactive sites

---

# 21. Archive Management

## 21.1 What Gets Archived

- Completed MMPs
- Finished projects
- Historical site visits
- Closed budgets

## 21.2 Accessing Archives

1. Navigate to **Archive**
2. Select category (MMPs, Projects, etc.)
3. Use search and filters
4. View archived items

## 21.3 Archive Features

- **View Only**: No modifications allowed
- **Full History**: Complete audit trail preserved
- **Export**: Download archived data
- **Restore**: Super Admins can restore if needed

---

# 22. Calendar & Scheduling

## 22.1 Calendar View

Access the calendar to see:
- Scheduled site visits
- MMP deadlines
- Team availability
- Project milestones

## 22.2 Creating Events

1. Click on a date
2. Select event type
3. Fill in details
4. Set reminders
5. Save

## 22.3 Reminders

1. Open any item
2. Click **"Set Reminder"**
3. Choose when to remind
4. Select notification method
5. Save

---

# 23. Settings & Preferences

## 23.1 Profile Settings

Update your profile:

1. Go to **Settings**
2. Click **"Profile"**
3. Update:
   - Display Name
   - Profile Photo
   - Contact Information
   - Bio
4. Save changes

## 23.2 Security Settings

Manage account security:

- **Change Password**: Update your password
- **Two-Factor Authentication**: Add extra security to your account
- **Session Management**: View active sessions
- **Login History**: See recent logins

### 23.2.1 Two-Factor Authentication (2FA)

Two-factor authentication adds an extra layer of security to your account by requiring both your password and a verification code from your mobile device.

#### Why Enable 2FA?

| Benefit | Description |
|---------|-------------|
| **Enhanced Security** | Protects your account even if your password is compromised |
| **Compliance** | Meets security requirements for sensitive data access |
| **Peace of Mind** | Know your account is protected by industry-standard security |

#### Setting Up 2FA

1. Go to **Settings** > **Security**
2. Find the **Two-Factor Authentication** section
3. Click **"Enable Two-Factor Authentication"**
4. A QR code will appear on screen
5. Open your authenticator app (Google Authenticator, Authy, Microsoft Authenticator, or 1Password)
6. Scan the QR code with your app
7. Enter the 6-digit verification code shown in your app
8. Click **"Verify & Enable"**

**Important**: If you cannot scan the QR code, click "Cannot scan?" to view the secret key that you can manually enter into your authenticator app.

#### Logging In with 2FA

Once 2FA is enabled, your login process will include an additional step:

1. Enter your email and password as usual
2. Click **"Sign In"**
3. A verification screen will appear
4. Open your authenticator app
5. Enter the 6-digit code shown in your app
6. Click **"Verify"** to complete login

#### Managing 2FA

- **View Enrolled Authenticators**: See which devices are set up for 2FA
- **Add Backup Authenticator**: Set up a second authenticator app as backup
- **Remove Authenticator**: Remove an authenticator device (requires verification)

#### Disabling 2FA

1. Go to **Settings** > **Security**
2. Find your enrolled authenticator in the **Two-Factor Authentication** section
3. Click the trash icon next to the authenticator
4. Confirm removal in the dialog
5. Your account will return to password-only authentication

**Warning**: Disabling 2FA reduces your account security. Only disable if necessary.

#### Supported Authenticator Apps

The following apps are compatible with PACT 2FA:

- Google Authenticator (iOS, Android)
- Authy (iOS, Android, Desktop)
- Microsoft Authenticator (iOS, Android)
- 1Password (iOS, Android, Desktop)
- Any TOTP-compatible authenticator app

#### Troubleshooting 2FA

| Issue | Solution |
|-------|----------|
| **Code not working** | Ensure your device time is synchronized (Settings > Date & Time > Automatic) |
| **Lost authenticator device** | Contact your administrator to reset 2FA |
| **QR code not scanning** | Use the manual secret key entry option |
| **App not showing codes** | Check that you added the correct account in your authenticator app |

## 23.3 Display Settings

Customize your view:

- **Theme**: Light or Dark mode
- **Language**: Interface language
- **Timezone**: Your local timezone
- **Date Format**: Preferred date display

## 23.4 Location Settings

Control location sharing:

- Enable/disable location
- Set sharing preferences
- View location history
- Privacy controls

## 23.5 Data Management

- **Export Data**: Download your data
- **Clear Cache**: Free up storage
- **Sync**: Force data synchronization

---

# 24. Notification System

## 24.1 Notification Settings

The notification settings provide granular control over how you receive alerts, featuring a WhatsApp-style interface with animated toggles.

### Accessing Settings

1. Go to **Settings** from sidebar
2. Click **"Notifications"** tab
3. View notification preferences organized by category

### Notification Categories

| Category | Description |
|----------|-------------|
| **Site Visits** | Assignment, completion, and update notifications |
| **Approvals** | Pending approval requests and status changes |
| **Financial** | Payment, wallet, and budget notifications |
| **Team** | Team member updates and location sharing |
| **System** | Platform updates and maintenance alerts |

## 24.2 Notification Channels

Configure how you receive each notification type:

| Channel | Description |
|---------|-------------|
| **In-App** | Notifications appear in the notification center |
| **Push** | Mobile push notifications (requires app permission) |
| **Email** | Email notifications (configurable frequency) |

## 24.3 Push Notifications

### Enabling Push Notifications

1. Go to **Settings** > **Notifications**
2. Find **"Push Notifications"** section
3. Toggle on to enable
4. Grant browser/app permission when prompted

### Push Notification Features

- **Rich Notifications**: Include images and action buttons
- **Vibration Patterns**: Different patterns for priority levels
- **Background Delivery**: Receive while app is closed
- **Action Buttons**: Quick actions directly from notification

## 24.4 Quiet Hours

Set times when notifications are muted:

1. Enable **"Quiet Hours"**
2. Set start time (e.g., 10:00 PM)
3. Set end time (e.g., 7:00 AM)
4. Choose which notifications can still come through

---

# 25. Mobile Application

## 25.1 Overview

The PACT mobile application is a native Android app built with Capacitor, providing full access to field operations features with offline support.

### Key Mobile Features

| Feature | Description |
|---------|-------------|
| **Offline Mode** | Work without internet connection |
| **GPS Capture** | Automatic location tracking |
| **Camera Integration** | Photo capture for site visits |
| **Push Notifications** | Instant alerts even when app is closed |
| **Edge-to-Edge Display** | Full-screen immersive experience |
| **Dark Mode Support** | Automatic theme switching |

## 25.2 Installation

### Android APK Installation

#### Option 1: Direct APK Download
1. Download the APK file from your organization
2. On your Android device, go to **Settings** > **Security**
3. Enable **"Install from Unknown Sources"** or **"Install unknown apps"**
4. Open the downloaded APK file
5. Tap **"Install"**
6. Open the app and login

#### Option 2: Build from Source

**Prerequisites:**
- Java JDK 17 or later
- Android SDK (API 26+)
- VS Code or Android Studio

**Building in VS Code:**

1. Download the project from Replit
2. Open terminal in VS Code
3. Navigate to android folder:
   ```bash
   cd android
   ```
4. Build the APK:
   
   **Windows:**
   ```cmd
   gradlew.bat assembleDebug
   ```
   
   **Mac/Linux:**
   ```bash
   chmod +x gradlew
   ./gradlew assembleDebug
   ```
5. Find APK at:
   ```
   android/app/build/outputs/apk/debug/app-debug.apk
   ```

**Building in Android Studio:**

1. Open Android Studio
2. Select **"Open an Existing Project"**
3. Navigate to the `android` folder
4. Wait for Gradle sync to complete
5. Go to **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**
6. Click **"locate"** to find the APK

### iOS Installation

1. Open App Store (when available)
2. Search "PACT Workflow"
3. Tap "Install"
4. Open and login

## 25.3 Granting Permissions

On first use, grant these permissions:

| Permission | Purpose | Recommended Setting |
|------------|---------|---------------------|
| **Location** | GPS capture for site visits | "While Using App" or "Always" |
| **Camera** | Photo capture during visits | Allow |
| **Notifications** | Push alerts for assignments | Allow |
| **Storage** | Offline data and file uploads | Allow |

## 25.4 Mobile Navigation

The app features bottom navigation:

| Tab | Contents |
|-----|----------|
| **Dashboard** | Operations overview, quick stats |
| **Sites** | Your assigned and available sites |
| **Map** | Interactive location view |
| **Notifications** | All alerts and messages |
| **Menu** | Full navigation, settings, profile |

## 25.5 Edge-to-Edge Display

The app uses modern edge-to-edge display:
- Content extends behind status bar
- Safe area padding prevents overlap
- Navigation buttons don't block content
- Immersive full-screen experience

### Screen Fit Features

- **Status Bar**: Transparent with theme-aware icons
- **Navigation Bar**: Transparent with content padding
- **Safe Areas**: Automatic padding for notches and buttons
- **Responsive**: Adapts to all screen sizes

## 25.6 Conducting Visits on Mobile

### Starting a Visit

1. Open the **Sites** tab
2. Find your assigned site
3. Tap on the site to view details
4. Tap **"Start Visit"**
5. GPS location is automatically captured
6. Complete required data entry

### Capturing Data

- **Photos**: Tap camera icon to take photos
- **GPS**: Automatic, shows accuracy indicator
- **Forms**: Fill in required fields
- **Notes**: Add observations

### Completing a Visit

1. Review all captured data
2. Tap **"Complete Visit"**
3. Data syncs to server (or queues if offline)
4. Payment is processed to your wallet

## 25.7 Offline Functionality

When offline, you can:

| Action | Available Offline |
|--------|-------------------|
| View cached site data | Yes |
| Start and complete visits | Yes |
| Capture photos and GPS | Yes |
| Submit visit data | Queued |
| View pending work | Yes |
| Sync when online | Automatic |

### Sync Status Indicators

| Indicator | Meaning |
|-----------|---------|
| Green check | Synced |
| Orange clock | Pending sync |
| Red X | Sync failed (retry) |

### Offline Queue

Pending items are stored locally and automatically sync when connectivity returns:

1. Data is encrypted on device
2. Queued in order of submission
3. Auto-syncs when online
4. Shows sync progress

## 25.8 Mobile Notifications

### Push Notification Types

| Type | Priority | Sound |
|------|----------|-------|
| **Urgent Assignment** | High | Alert tone |
| **New Assignment** | Normal | Notification sound |
| **Approval Request** | Normal | Notification sound |
| **Status Update** | Low | Silent |
| **System Alert** | High | Alert tone |

### Notification Actions

Tap notification to:
- Open relevant screen
- Quick action buttons (Accept, Reject)
- View full details

### Managing Notifications

1. Go to **Menu** > **Settings** > **Notifications**
2. Toggle categories on/off
3. Set quiet hours
4. Configure per-category preferences

## 25.9 Troubleshooting Mobile App

### App Won't Start

1. Force close and reopen
2. Clear app cache (Settings > Apps > PACT > Clear Cache)
3. Ensure sufficient storage space
4. Reinstall if persistent

### Location Not Working

1. Check device location is enabled
2. Verify app has location permission
3. Try outdoor location
4. Check GPS accuracy setting

### Data Not Syncing

1. Check internet connection
2. Pull down to refresh
3. Check sync status in settings
4. Force sync from settings

### White Screen Issue

If app shows white screen:
1. Wait 10-15 seconds for initial load
2. Check internet connectivity
3. Reinstall app with latest APK
4. Contact IT support

### Battery Optimization

If notifications aren't received:
1. Go to device Settings > Apps > PACT
2. Disable **"Battery Optimization"**
3. Enable **"Background Activity"**
4. Keep app in recent apps

---

# 26. Troubleshooting

## 26.1 Common Issues

### Cannot Login

1. Check email spelling
2. Verify password (case-sensitive)
3. Clear browser cache
4. Try password reset
5. Check if 2FA is enabled
6. Contact administrator

### Location Not Working

1. Check device location settings
2. Grant app location permission
3. Ensure GPS is enabled
4. Try outdoor location
5. Restart the app

### Data Not Syncing

1. Check internet connection
2. Pull down to refresh
3. Log out and back in
4. Clear app cache
5. Contact support

### Slow Performance

1. Close unused browser tabs
2. Clear browser cache
3. Check internet speed
4. Try different browser
5. Reduce date range in filters

### Upload Failures

1. Check file format (CSV)
2. Verify file size limit
3. Check required columns
4. Fix validation errors
5. Check for duplicate sites
6. Try smaller batches

### Wallet Not Updating

1. Refresh the page
2. Check if visit is marked completed
3. Verify fee was calculated
4. Contact finance team

## 26.2 Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| "Session Expired" | Login timeout | Log in again |
| "Permission Denied" | Insufficient access | Contact admin |
| "Network Error" | Connection lost | Check internet |
| "Validation Failed" | Invalid data | Fix highlighted fields |
| "Server Error" | System issue | Try again later |
| "Site Already Claimed" | Another user claimed first | Try different site |
| "Duplicate Site" | Site exists in this month | Check existing MMPs |

## 26.3 Getting Help

1. **In-App Help**: Click ? icon
2. **User Guide**: This document
3. **Support Chat**: Contact support team
4. **Email**: support@pact-platform.com
5. **Phone**: Emergency support line

## 26.4 Reporting Bugs

To report an issue:

1. Note the exact steps to reproduce
2. Take screenshots if possible
3. Note error messages
4. Record date and time
5. Include device/browser info
6. Submit via support channel

---

# 27. Glossary

| Term | Definition |
|------|------------|
| **MMP** | Monthly Monitoring Plan - Scheduled site monitoring document |
| **Site Visit** | A scheduled or ad-hoc visit to a monitoring location |
| **Coordinator** | Field team member who coordinates site visits |
| **Data Collector** | Field team member who collects data at sites |
| **Enumerator** | Field worker who conducts site visits (same as Data Collector) |
| **FOM** | Field Operation Manager - Manages field operations |
| **RLS** | Row Level Security - Database access control |
| **Down Payment** | Advance payment for field expenses |
| **Dispatch** | Making sites available for claiming/assignment |
| **Claim** | Reserving a dispatched site for yourself |
| **Verification** | Process of validating data accuracy |
| **Archive** | Historical storage for completed items |
| **Wallet** | Digital account for managing field payments |
| **Permit** | Authorization document for site access |
| **GPS** | Global Positioning System - Location tracking |
| **KPI** | Key Performance Indicator - Success metrics |
| **Classification** | Categorization of enumerators (A, B, C levels) |
| **Audit Trail** | Record of all system actions |
| **Real-time** | Instant updates without delay |
| **Sync** | Synchronize data between devices |
| **Offline Mode** | Functionality without internet |
| **Push Notification** | Alert sent to mobile device |
| **Safe Area** | Screen padding for notches/navigation |
| **Edge-to-Edge** | Full-screen display mode |
| **APK** | Android Package - Android app installer file |

---

# Quick Reference Cards

## Keyboard Shortcuts (Web)

| Shortcut | Action |
|----------|--------|
| `Ctrl + K` | Global search |
| `Ctrl + N` | New item |
| `Ctrl + S` | Save |
| `Esc` | Close modal |
| `?` | Show help |

## Status Color Guide

| Color | Meaning |
|-------|---------|
| Green | Complete/Online/Success |
| Blue | In Progress/Active |
| Yellow | Pending/Warning |
| Orange | Attention Required |
| Red | Overdue/Error/Offline |
| Gray | Inactive/Archived |
| Purple | Claimed/Reserved |

## Role Quick Reference

| Need To... | Required Role |
|------------|---------------|
| Create users | Admin, ICT |
| Upload MMP | Admin, ICT, FOM |
| Approve costs | Financial Admin, Admin |
| Assign visits | Admin, FOM, Supervisor |
| Claim sites | Data Collector |
| Collect data | Data Collector |
| Manage budgets | Financial Admin, Admin |
| Configure fees | Admin |
| Manage wallets | Admin, Super Admin |

## Mobile Quick Actions

| Gesture | Action |
|---------|--------|
| Swipe left/right | Navigate between items |
| Pull down | Refresh data |
| Long press | Access options menu |
| Pinch | Zoom on maps |
| Double tap | Quick zoom |

---

**Document Version**: 2.0  
**Last Updated**: November 2025  
**PACT Workflow Platform**

For the latest updates and additional resources, visit the Help section in the application.
