# PACT Workflow Platform - Complete Page Reference Guide

This document provides detailed documentation for every page in the PACT Workflow Platform, organized by functional area.

---

## Table of Contents

1. [Authentication Pages](#1-authentication-pages)
2. [Dashboard & Navigation](#2-dashboard--navigation)
3. [Monthly Monitoring Plans (MMP)](#3-monthly-monitoring-plans-mmp)
4. [Site Visits](#4-site-visits)
5. [Financial Management](#5-financial-management)
6. [Projects](#6-projects)
7. [Field Operations](#7-field-operations)
8. [User Administration](#8-user-administration)
9. [Reports & Analytics](#9-reports--analytics)
10. [Communication](#10-communication)
11. [System Settings](#11-system-settings)

---

## 1. Authentication Pages

### 1.1 Landing Page
**URL:** `/`  
**Access:** Public (no login required)

**Purpose:** Welcome page for the PACT platform with key features overview.

**Page Elements:**
- Platform introduction and branding
- "Get Started" button
- Login/Register links
- Feature highlights
- Contact information

---

### 1.2 Login Page
**URL:** `/auth`  
**Access:** Public

**Purpose:** Authenticate users to access the platform.

**How to Use:**
1. Enter your registered email address
2. Enter your password
3. Click "Sign In"
4. If 2FA is enabled, enter the 6-digit code from your authenticator app

**Features:**
| Feature | Description |
|---------|-------------|
| Email Login | Standard email/password authentication |
| Google SSO | Sign in with Google account (if configured) |
| Remember Me | Stay logged in on trusted devices |
| Forgot Password | Link to password reset |

**Troubleshooting:**
- Clear browser cache if login fails repeatedly
- Check CAPS LOCK is off
- Contact admin if account is locked

---

### 1.3 Registration Page
**URL:** `/register`  
**Access:** Public

**Purpose:** Create a new user account.

**Required Fields:**
- Full Name
- Email Address
- Phone Number
- Password (minimum 8 characters)
- Confirm Password
- State (location assignment)
- Locality (location assignment)

**After Registration:**
1. You'll see a success confirmation
2. Account requires admin approval
3. Email notification sent when approved
4. Login with your credentials once approved

---

### 1.4 Registration Success
**URL:** `/registration-success`  
**Access:** Redirect after registration

**Purpose:** Confirms successful account creation.

**Information Displayed:**
- Confirmation message
- Next steps instructions
- Contact information for support
- Link to login page

---

### 1.5 Forgot Password
**URL:** `/forgot-password`  
**Access:** Public

**Purpose:** Reset a forgotten password.

**Steps:**
1. Enter your registered email
2. Click "Send Reset Link"
3. Check email for reset link (check spam folder)
4. Click link and create new password
5. Login with new password

---

## 2. Dashboard & Navigation

### 2.1 Main Dashboard
**URL:** `/dashboard`  
**Access:** All authenticated users

**Purpose:** Central hub displaying personalized metrics and quick actions.

**Dashboard Zones:**

#### Operations Zone
| Metric | Description |
|--------|-------------|
| Total Sites | All sites across active MMPs |
| Pending | Sites awaiting completion |
| In Progress | Sites currently being visited |
| Completed | Successfully completed visits |

**Role-Based Filtering:**
- **Admins/Super Admins:** See all data across platform
- **Supervisors:** Data filtered by assigned Hub
- **Coordinators:** Data filtered by assigned State (shows badge "State: [Name]")
- **Data Collectors:** Only their assigned/claimed sites

#### Financial Zone
- Current wallet balance
- Pending earnings
- Recent transactions
- Quick withdrawal button

#### Activity Zone
- Recent site completions
- New assignments
- Team updates
- System notifications

**Quick Actions Panel:**
- Upload MMP
- View Site Visits
- Check Wallet
- Access Reports

---

### 2.2 Global Search
**URL:** `/search`  
**Access:** All authenticated users

**Purpose:** Search across all platform data.

**Search Capabilities:**
- Sites (by name, code, location)
- MMPs (by name, project, month)
- Users (by name, email, role)
- Projects (by name, description)

**How to Use:**
1. Click search icon or press `/`
2. Type search query
3. Results grouped by category
4. Click result to navigate

**Search Tips:**
- Use site codes for exact matches
- Partial name matches supported
- Filter by category tabs

---

## 3. Monthly Monitoring Plans (MMP)

### 3.1 MMP List
**URL:** `/mmp`  
**Access:** All authenticated users (role-based content)

**Purpose:** View and manage all Monthly Monitoring Plans.

**Available Tabs:**

#### All MMPs Tab
View all MMPs with filtering options:
- Filter by status (Draft, Pending, Approved, Rejected, Dispatched)
- Filter by project
- Filter by month/year
- Sort by date, name, status

#### Claimable Sites Tab
*Available to: Data Collectors, Coordinators*

Shows sites available for claiming based on dispatch mode:
| Dispatch Mode | Who Can Claim |
|---------------|---------------|
| Open | Any field team member |
| State | Users assigned to that state |
| Locality | Users in matching locality |
| Individual | Specifically assigned user only |

**Claiming a Site:**
1. Review site details
2. Click "Claim" button
3. Confirm claim
4. Site moves to "My Sites"
5. Fee calculated based on your classification

#### My Sites Tab
Shows your claimed/assigned sites:
- Current assignments
- Site status tracking
- Quick action buttons

---

### 3.2 MMP Upload
**URL:** `/mmp/upload`  
**Access:** Admin, ICT, FOM

**Purpose:** Upload new Monthly Monitoring Plan from CSV file.

**Upload Process:**

**Step 1: Select Project**
Choose the project this MMP belongs to

**Step 2: Select Month**
Pick the monitoring period (month/year)

**Step 3: Prepare CSV File**
Required columns:
```csv
site_code,site_name,state,locality,gps_latitude,gps_longitude
SITE001,Main Office,Khartoum,Khartoum Bahri,15.6,32.5
```

**Step 4: Upload & Validate**
- Drag-and-drop or click to select file
- System validates format and data
- Review validation results
- Fix any flagged errors

**Step 5: Submit**
Click "Upload" to create MMP

**Validation Rules:**
- No duplicate site codes within same month
- State and locality must match Sudan administrative data
- GPS coordinates validated for format
- Site names required

---

### 3.3 MMP Detail
**URL:** `/mmp/:id`  
**Access:** All authenticated users

**Purpose:** View detailed MMP information and site list.

**Information Displayed:**
- MMP name and status
- Project association
- Monitoring period
- Site count and breakdown
- Creator and dates

**Site List Features:**
- Search by name/code
- Filter by status
- Sort options
- Pagination

**Available Actions (role-dependent):**
| Action | Available To |
|--------|-------------|
| Edit | Admin, ICT, FOM (before dispatch) |
| Delete | Admin only |
| Dispatch | Admin, FOM |
| Forward to FOM | Admin, ICT |
| Assign Coordinators | FOM |
| Generate Report | All viewers |

---

### 3.4 MMP Detail View (Read-Only)
**URL:** `/mmp/:id/view`  
**Access:** All authenticated users

**Purpose:** Read-only view of MMP details.

Same as MMP Detail but without edit capabilities.

---

### 3.5 Edit MMP
**URL:** `/mmp/:id/edit` or `/mmp/edit/:id`  
**Access:** Admin, ICT, FOM

**Purpose:** Modify existing MMP details.

**Editable Fields:**
- MMP name
- Description
- Status (within workflow rules)
- Individual site details (if not dispatched)

**Restrictions:**
- Cannot edit dispatched/claimed sites
- Cannot change project
- Audit trail maintained

---

### 3.6 MMP Verification
**URL:** `/mmp/verify/:id` or `/mmp/:id/verification`  
**Access:** Admin, ICT, FOM, Coordinators

**Purpose:** Verify MMP data quality before deployment.

**Verification Steps:**
1. Review each site entry
2. Check GPS coordinates accuracy
3. Verify contact information
4. Confirm permit status
5. Mark as verified or flag issues

**Verification Actions:**
- Approve verified sites
- Reject sites with issues
- Add comments/notes
- Request corrections

---

### 3.7 MMP Detailed Verification
**URL:** `/mmp/:id/detailed-verification`  
**Access:** Admin, ICT, FOM

**Purpose:** In-depth verification with detailed checks.

Enhanced verification including:
- Document verification
- Cross-reference checks
- Historical comparison
- Compliance validation

---

### 3.8 MMP Permit Message
**URL:** `/mmp/:id/permit-message`  
**Access:** Admin, ICT, FOM

**Purpose:** Manage permit requirements and notifications.

**Features:**
- View permit status for sites
- Send permit requirement notifications
- Track permit submission
- Upload permit documents

---

### 3.9 Review & Assign Coordinators
**URL:** `/mmp/:id/review-assign-coordinators`  
**Access:** FOM, Admin

**Purpose:** Assign coordinators to manage sites in an MMP.

**Process:**
1. View sites grouped by state/locality
2. See available coordinators for each area
3. Select coordinator for assignment
4. Review assignments
5. Confirm and dispatch

**Assignment Information:**
- Coordinator name and contact
- Current workload
- State/locality match
- Assignment history

---

## 4. Site Visits

### 4.1 Site Visits List
**URL:** `/site-visits`  
**Access:** All authenticated users

**Purpose:** View and manage all site visits.

**List Features:**
- Filter by status
- Filter by date range
- Filter by enumerator
- Filter by MMP/project
- Search functionality

**Status Types:**
| Status | Description | Color |
|--------|-------------|-------|
| Pending | Not yet assigned | Gray |
| Dispatched | Assigned, not claimed | Yellow |
| Claimed | Claimed by enumerator | Blue |
| Assigned | Directly assigned | Blue |
| In Progress | Visit started | Orange |
| Completed | Visit finished | Green |
| Verified | Data verified | Green |
| Cancelled | Visit cancelled | Red |

---

### 4.2 Site Visit Detail
**URL:** `/site-visits/:id`  
**Access:** All authenticated users (role-based actions)

**Purpose:** View complete site visit information.

**Information Sections:**

#### Site Information
- Site code and name
- State and locality
- GPS coordinates (with map)
- Contact details
- Site classification

#### Visit Information
- Current status
- Assigned enumerator
- Claimed/assigned date
- Start and end times
- Visit duration

#### Cost Breakdown
- Enumerator fee (based on classification)
- Transportation allowance
- Total cost
- Payment status

#### Workflow Timeline
- Creation date
- Dispatch date
- Claim date
- Start date
- Completion date
- Verification date
- Each with responsible user

**Available Actions:**
| Action | For Status | Role |
|--------|-----------|------|
| Claim | Dispatched | Data Collector, Coordinator |
| Start Visit | Claimed/Assigned | Assigned user |
| Complete Visit | In Progress | Assigned user |
| Verify | Completed | Coordinator, Supervisor, Admin |
| Edit | Any (before verify) | Admin, original creator |

---

### 4.3 Edit Site Visit
**URL:** `/site-visits/:id/edit`  
**Access:** Admin, original creator

**Purpose:** Modify site visit details.

**Editable Fields:**
- Site information
- Planned date
- Assignment
- Special instructions
- Status (within rules)

---

### 4.4 Create Site Visit
**URL:** `/site-visits/create`  
**Access:** Admin, FOM

**Purpose:** Create new site visit manually.

**Creation Options:**
- Standard creation (manual entry)
- From MMP (select from approved MMP)
- Urgent (expedited creation)

---

### 4.5 Create from MMP
**URL:** `/site-visits/create/mmp`  
**Access:** Admin, FOM

**Purpose:** Create site visits from approved MMP sites.

**Process:**
1. Select project
2. Choose MMP
3. Select sites for visit creation
4. Set visit parameters
5. Assign enumerators (optional)
6. Create visits

---

### 4.6 Create from MMP Detail
**URL:** `/site-visits/create/mmp/:id`  
**Access:** Admin, FOM

**Purpose:** Create visits from a specific MMP.

Direct access to site selection from a chosen MMP.

---

### 4.7 Create Urgent Site Visit
**URL:** `/site-visits/create/urgent`  
**Access:** Admin, FOM, Supervisor

**Purpose:** Create emergency/ad-hoc site visits.

**Use Cases:**
- Emergency assessments
- Unplanned site checks
- Urgent monitoring needs
- Follow-up visits

**Required Information:**
- Site name and location
- Urgency reason
- Priority level
- Target completion date

---

## 5. Financial Management

### 5.1 My Wallet
**URL:** `/wallet`  
**Access:** All users with wallet

**Purpose:** View personal earnings and manage withdrawals.

**Wallet Overview:**
| Balance Type | Description |
|--------------|-------------|
| Available | Ready to withdraw |
| Pending | Being processed |
| Total Earned | Lifetime earnings |

**Features:**
- Transaction history
- Filter by date/type
- Request withdrawal
- View earning sources

**Transaction Types:**
- Earning (from completed visits)
- Withdrawal
- Adjustment
- Transfer

---

### 5.2 Withdrawal Approval (Supervisor)
**URL:** `/withdrawal-approval`  
**Access:** Supervisors

**Purpose:** First-tier approval for withdrawal requests.

**Approval Queue:**
- View pending requests
- See requester details
- Check wallet balance
- View request history

**Actions:**
| Action | Result |
|--------|--------|
| Approve | Moves to Finance approval |
| Reject | Returns to user with reason |
| Request Info | Ask for clarification |

**Approval Workflow:**
```
User Request → Supervisor Review → Supervisor Approved → Finance Approval → Paid
```

---

### 5.3 Finance Approval
**URL:** `/finance-approval`  
**Access:** Finance, Admin

**Purpose:** Final approval and payment processing.

**Queue Features:**
- View supervisor-approved requests
- Verify payment details
- Process payments
- Batch processing option

**Actions:**
- Approve & Process
- Reject (with reason)
- Hold (temporary pause)
- Mark as Paid

---

### 5.4 Admin Wallets
**URL:** `/admin/wallets`  
**Access:** Admin, Finance

**Purpose:** Overview of all user wallets.

**Dashboard Features:**
- Total platform balance
- User wallet list
- Filter by balance range
- Search by user name
- Export capabilities

**Information Per Wallet:**
- User name
- Available balance
- Pending balance
- Total earned
- Last transaction

---

### 5.5 Admin Wallet Detail
**URL:** `/admin/wallets/:userId`  
**Access:** Admin, Finance

**Purpose:** Detailed view of individual user wallet.

**Information:**
- User profile
- Complete balance breakdown
- Full transaction history
- Associated site visits
- Withdrawal history

**Admin Actions:**
- Adjust balance (with audit trail)
- View site visit earnings
- Export user report
- Process pending items

---

### 5.6 Budget Management
**URL:** `/budget`  
**Access:** Finance, Admin

**Purpose:** Manage project and MMP budgets.

**Budget Types:**
- Project budgets
- MMP budgets
- Operational budgets

**Budget Categories:**
| Category | Description |
|----------|-------------|
| Enumerator Fees | Site visit payments |
| Transportation | Travel allowances |
| Equipment | Tools and supplies |
| Administration | Overhead costs |
| Contingency | Emergency funds |

**Features:**
- Create budgets
- Track spending
- View utilization
- Forecast remaining
- Set alerts

---

### 5.7 Cost Submission
**URL:** `/cost-submission`  
**Access:** Field team, Coordinators

**Purpose:** Submit operational costs for approval.

**Submission Process:**
1. Select cost category
2. Enter amount
3. Attach receipts
4. Add description
5. Link to site visit (if applicable)
6. Submit for approval

**Cost Categories:**
- Transportation
- Meals
- Accommodation
- Equipment
- Supplies
- Other

---

### 5.8 Financial Operations
**URL:** `/financial-operations`  
**Access:** Finance, Admin

**Purpose:** Comprehensive financial management dashboard.

**Sections:**
- Daily/weekly/monthly summaries
- Pending approvals overview
- Budget utilization charts
- Cost breakdown analysis
- Transaction logs

---

### 5.9 Wallet Reports
**URL:** `/wallet-reports`  
**Access:** Finance, Admin

**Purpose:** Generate financial reports.

**Available Reports:**
| Report | Description |
|--------|-------------|
| Transaction Summary | All transactions by period |
| Withdrawal History | Withdrawal requests and status |
| Earnings by User | Individual user earnings |
| Cost Analysis | Cost breakdown by category |
| Budget vs Actual | Spending comparison |

**Export Formats:**
- PDF
- Excel (XLSX)
- CSV

---

### 5.10 Finance Dashboard
**URL:** `/finance`  
**Access:** Finance, Admin

**Purpose:** Financial overview and quick access.

**Dashboard Elements:**
- Financial KPIs
- Pending approvals count
- Recent transactions
- Budget status
- Quick links

---

## 6. Projects

### 6.1 Projects List
**URL:** `/projects`  
**Access:** All authenticated users

**Purpose:** View and manage all projects.

**List Features:**
- Search by name
- Filter by status
- Sort options
- Create new project

**Project Statuses:**
- Draft
- Active
- Completed
- On Hold
- Archived

---

### 6.2 Create Project
**URL:** `/projects/create`  
**Access:** Admin, ICT

**Purpose:** Create a new monitoring project.

**Required Information:**
- Project name
- Description
- Start date
- End date
- Project manager
- Budget (optional)

---

### 6.3 Project Detail
**URL:** `/projects/:id`  
**Access:** All authenticated users

**Purpose:** View complete project information.

**Tabs:**
| Tab | Content |
|-----|---------|
| Overview | Basic info, status, timeline |
| Team | Assigned team members |
| MMPs | Associated monitoring plans |
| Activities | Project activities |
| Budget | Financial allocation |
| Reports | Project reports |

---

### 6.4 Edit Project
**URL:** `/projects/:id/edit`  
**Access:** Admin, ICT

**Purpose:** Modify project details.

**Editable Fields:**
- Name and description
- Dates
- Status
- Budget
- Settings

---

### 6.5 Project Activities
**URL:** `/projects/:id/activities/:activityId`  
**Access:** Project team members

**Purpose:** View activity details.

**Activity Information:**
- Activity name and type
- Timeline
- Assigned members
- Progress status
- Related documents

---

### 6.6 Create Project Activity
**URL:** `/projects/:id/activities/create`  
**Access:** Project managers, Admin

**Purpose:** Create new project activity.

**Activity Types:**
- Planning
- Field Work
- Data Collection
- Analysis
- Reporting

---

### 6.7 Project Team Management
**URL:** `/projects/:id/team`  
**Access:** Project managers, Admin

**Purpose:** Manage project team members.

**Features:**
- Add team members
- Assign project roles
- Remove members
- View member activity
- Set permissions

---

## 7. Field Operations

### 7.1 Field Team
**URL:** `/field-team`  
**Access:** Supervisors, Coordinators, Admin

**Purpose:** Manage field team members.

**Dashboard Features:**
- Team member list
- Status indicators (online/offline)
- Current assignments
- Workload distribution
- Performance metrics

**Team Information:**
- Name and contact
- Classification (A, B, C)
- Assigned hub/state
- Current workload
- Recent activity

---

### 7.2 Hub Operations
**URL:** `/hub-operations`  
**Access:** Supervisors, Admin

**Purpose:** Manage operations at hub level.

**Hub Dashboard:**
- Sites assigned to hub
- Team members in hub
- Completion rates
- Pending tasks
- Performance metrics

**Hub Actions:**
- Assign sites to team
- Monitor progress
- Generate hub reports
- Manage resources
- View financial summary

---

### 7.3 Coordinator Sites
**URL:** `/coordinator/sites`  
**Access:** Coordinators

**Purpose:** Manage sites within coordinator's assigned area.

**Features:**
- View sites in assigned state
- Filter by locality
- Track completion status
- Assign enumerators
- Monitor progress

**Filtering Options:**
- By locality
- By status
- By enumerator
- By date range

---

### 7.4 Sites for Verification
**URL:** `/coordinator/sites-for-verification`  
**Access:** Coordinators

**Purpose:** Verify completed site visits.

**Verification Process:**
1. View completed visits queue
2. Review site visit data
3. Check attached photos
4. Verify GPS accuracy
5. Confirm data quality
6. Approve or request corrections

**Verification Actions:**
- Approve (move to verified)
- Request correction (return to enumerator)
- Flag for review (escalate)
- Add notes

---

### 7.5 Tracker Preparation Plan
**URL:** `/tracker-preparation-plan`  
**Access:** FOM, Supervisors, Admin

**Purpose:** Analyze planned vs. actual site coverage.

**Features:**
- Compare planned sites with completions
- Identify coverage gaps
- Real-time progress updates
- Invoice preparation data

**Views:**
| View | Description |
|------|-------------|
| Summary | High-level statistics |
| Detail | Site-by-site breakdown |
| Map | Geographic visualization |
| Timeline | Temporal analysis |

**Export Options:**
- Excel report
- PDF summary
- Invoice data

---

### 7.6 Field Operation Manager Dashboard
**URL:** `/field-operation-manager`  
**Access:** FOM, Admin

**Purpose:** FOM-specific operations overview.

**Dashboard Sections:**
- Pending MMP reviews
- Site visit progress
- Team performance
- Issue escalations
- Quick actions

---

### 7.7 Monitoring Plan Page
**URL:** `/monitoring-plan`  
**Access:** FOM, Coordinators, Admin

**Purpose:** Overview of monitoring plan execution.

**Features:**
- Active monitoring plans
- Progress tracking
- Resource allocation
- Timeline view

---

### 7.8 Advanced Map
**URL:** `/map`  
**Access:** All authenticated users

**Purpose:** Geographic visualization of all sites.

**Map Features:**
- All sites on interactive map
- Color-coded by status
- Cluster view for dense areas
- Click for site details
- Team member locations

**Controls:**
| Control | Function |
|---------|----------|
| Zoom | Increase/decrease detail |
| Pan | Move around map |
| Layers | Toggle map types |
| Filter | Show/hide by status |
| Search | Find locations |

**Legend:**
| Color | Status |
|-------|--------|
| Green | Completed |
| Blue | In Progress |
| Yellow | Pending |
| Red | Overdue |
| Gray | Not Started |

---

## 8. User Administration

### 8.1 Users List
**URL:** `/users`  
**Access:** Admin, ICT

**Purpose:** Manage all user accounts.

**List Features:**
- Search by name/email
- Filter by role
- Filter by status
- Sort options

**User Actions:**
- View profile
- Edit details
- Activate/deactivate
- Reset password
- Change role

---

### 8.2 User Detail
**URL:** `/users/:id`  
**Access:** Admin, ICT, Self

**Purpose:** View and edit user profile.

**Profile Sections:**
| Section | Information |
|---------|-------------|
| Personal | Name, email, phone |
| Location | State, locality, hub |
| Role | Assigned roles and permissions |
| Classification | A, B, or C level |
| Activity | Recent actions |
| Financial | Wallet summary |

**Admin Actions:**
- Update profile
- Change classification
- Assign to hub/state
- Reset password
- Manage 2FA

---

### 8.3 Role Management
**URL:** `/role-management`  
**Access:** Admin

**Purpose:** Manage roles and permissions.

**Features:**
- View all roles
- Create custom roles
- Edit permissions
- Assign users
- Role templates

**Permission Categories:**
- User management
- Project management
- MMP management
- Site visit management
- Financial management
- Report access
- System settings

---

### 8.4 Classifications
**URL:** `/classifications`  
**Access:** Admin, Supervisors

**Purpose:** Manage user classification levels.

**Classification Levels:**
| Level | Description | Typical Fee |
|-------|-------------|-------------|
| A | Senior/Experienced | Highest |
| B | Intermediate | Medium |
| C | Entry Level | Standard |

**Features:**
- View user classifications
- Update classification level
- Classification history
- Criteria management

---

### 8.5 Classification Fee Management
**URL:** `/classification-fees`  
**Access:** Admin, Finance

**Purpose:** Set fee rates for classification levels.

**Configurable Fees:**
- Base fee per classification
- Transportation allowance
- Special rates
- Overtime rates

---

### 8.6 Super Admin Management
**URL:** `/super-admin-management`  
**Access:** Super Admin only

**Purpose:** System-wide administration.

**Capabilities:**
- Manage super admin accounts (max 3)
- Override approvals
- Access all audit logs
- Restore deleted records
- System configuration
- Emergency controls

---

### 8.7 Data Visibility
**URL:** `/data-visibility`  
**Access:** Admin

**Purpose:** Configure data access rules.

**Settings:**
- Role-based visibility
- Geographic restrictions
- Time-based access
- Field-level permissions

---

### 8.8 Audit & Compliance
**URL:** `/audit-compliance`  
**Access:** Admin, Super Admin

**Purpose:** Track all system activities.

**Audit Features:**
- Complete activity logs
- User action tracking
- Data change history
- Financial audit trail
- Export compliance reports

---

### 8.9 Archive
**URL:** `/archive`  
**Access:** All authenticated users

**Purpose:** Access archived/historical data.

**Archived Content:**
- Old MMPs
- Completed projects
- Historical reports
- Deactivated users

**Actions:**
- Search archives
- View details
- Restore items (Admin)
- Export data

---

## 9. Reports & Analytics

### 9.1 Reports Dashboard
**URL:** `/reports`  
**Access:** All authenticated users (role-based content)

**Purpose:** Generate and view various reports.

**Report Categories:**

#### Operational Reports
- Site Visit Summary
- MMP Progress
- Team Performance
- Coverage Analysis

#### Financial Reports
- Payment Summary
- Budget Utilization
- Cost Analysis
- Wallet Transactions

#### Administrative Reports
- User Activity
- Role Distribution
- Compliance Summary
- Audit Report

**Generation Process:**
1. Select report type
2. Choose date range
3. Apply filters
4. Generate
5. View or download

---

## 10. Communication

### 10.1 Chat
**URL:** `/chat`  
**Access:** All authenticated users

**Purpose:** In-app messaging.

**Features:**
- Direct messages
- Group conversations
- File attachments
- Message search
- Read receipts

---

### 10.2 Calls
**URL:** `/calls`  
**Access:** All authenticated users

**Purpose:** Voice/video communication.

**Features:**
- Voice calls
- Video calls (if enabled)
- Call history
- Contact directory

---

### 10.3 Calendar
**URL:** `/calendar`  
**Access:** All authenticated users

**Purpose:** Schedule and event management.

**Views:**
- Month
- Week
- Day
- Agenda

**Event Types:**
- Site visits
- Deadlines
- Meetings
- Reminders

---

## 11. System Settings

### 11.1 Settings Page
**URL:** `/settings`  
**Access:** All authenticated users

**Purpose:** Personal and system preferences.

**Setting Categories:**

#### Profile Settings
- Personal information
- Profile photo
- Contact details

#### Security Settings
- Password change
- Two-factor authentication
- Active sessions
- Login history

#### Notification Preferences
- Email notifications
- Push notifications
- In-app alerts
- Category toggles

#### Display Settings
- Theme (Light/Dark)
- Language
- Timezone
- Date format

#### Location Settings
- Location sharing
- GPS preferences
- Privacy controls

---

## Quick Reference Tables

### URL Summary by Role

#### Admin URLs
All URLs accessible

#### Supervisor URLs
- `/dashboard`
- `/mmp`, `/mmp/:id`
- `/site-visits`, `/site-visits/:id`
- `/withdrawal-approval`
- `/hub-operations`
- `/field-team`
- `/classifications`
- `/reports`
- `/settings`

#### Coordinator URLs
- `/dashboard`
- `/mmp`, `/mmp/:id`
- `/site-visits`, `/site-visits/:id`
- `/coordinator/sites`
- `/coordinator/sites-for-verification`
- `/wallet`
- `/reports`
- `/settings`

#### Data Collector URLs
- `/dashboard`
- `/mmp` (Claimable Sites, My Sites tabs)
- `/site-visits/:id`
- `/wallet`
- `/cost-submission`
- `/settings`

---

## Error Pages

### Not Found (404)
**URL:** Any invalid path  
**Purpose:** Displayed when page doesn't exist

Shows:
- Error message
- Navigation back to dashboard
- Help link

---

**Document Version:** 2.0  
**Last Updated:** November 2025  
**PACT Workflow Platform**
