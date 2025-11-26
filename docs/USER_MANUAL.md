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
9. [Field Team Management](#9-field-team-management)
10. [Financial Operations](#10-financial-operations)
11. [Budget Management](#11-budget-management)
12. [Wallet System](#12-wallet-system)
13. [Cost Submission & Approvals](#13-cost-submission--approvals)
14. [Reports & Analytics](#14-reports--analytics)
15. [Communication Features](#15-communication-features)
16. [Maps & Location Services](#16-maps--location-services)
17. [Archive Management](#17-archive-management)
18. [Calendar & Scheduling](#18-calendar--scheduling)
19. [Settings & Preferences](#19-settings--preferences)
20. [Mobile App Guide](#20-mobile-app-guide)
21. [Troubleshooting](#21-troubleshooting)
22. [Glossary](#22-glossary)

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

## 1.2 Key Benefits

| Benefit | Description |
|---------|-------------|
| **Streamlined Workflows** | Automate approval processes and reduce manual coordination |
| **Real-Time Visibility** | Track field team locations and site visit progress instantly |
| **Financial Control** | Manage budgets, track expenses, and approve payments |
| **Role-Based Security** | Ensure users only access what they need |
| **Mobile-Ready** | Access the platform from any device, anywhere |
| **Data Integrity** | Complete audit trails for all operations |

## 1.3 System Requirements

### Web Browser Requirements
- Google Chrome (recommended) - Version 90+
- Mozilla Firefox - Version 88+
- Microsoft Edge - Version 90+
- Safari - Version 14+

### Mobile Requirements
- iOS 13.0 or later
- Android 8.0 or later

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
5. You will be redirected to your personalized dashboard

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

---

# 3. Dashboard Overview

The Mission Control Dashboard is your central hub for all operations.

## 3.1 Dashboard Zones

The dashboard is organized into distinct zones based on your role:

### Planning Zone
- View upcoming site visits
- Track MMP progress
- See pending assignments

### Operations Zone
- Monitor active field operations
- View real-time team status
- Track completion rates

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

Click on any notification to view details or take action.

## 3.4 View Mode Toggle

Switch between:
- **Desktop View**: Full-featured interface with all panels
- **Mobile View**: Optimized layout for smaller screens

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
| **Data Collector** | Collects field data | Site visit execution |
| **Reviewer** | Reviews submissions | Read-only access to verify data |

### Super Admin Exclusive Capabilities

Super Admin is the highest role in the system with these exclusive permissions:

- **Manage Super Admins**: Create, deactivate, and manage other super admin accounts (maximum 3 allowed)
- **Audit Log Access**: Full access to deletion audit logs
- **Record Restoration**: Ability to restore deleted records
- **System Override**: Override system restrictions and approvals
- **All Wallet Management**: Full control over all user wallets
- **Complete Permission Bypass**: All permission checks automatically pass

## 4.2 Viewing Users

1. Navigate to **Users** from the sidebar
2. View the list of all users in the system
3. Use filters to find specific users:
   - By role
   - By status (active/inactive)
   - By name or email

## 4.3 User Details

Click on any user to view:
- Profile information
- Assigned roles
- Activity history
- Performance metrics
- Wallet balance (if applicable)

## 4.4 Managing User Status

Administrators can:
- Activate/deactivate user accounts
- Reset user passwords
- Update user information
- Assign/remove roles

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
- Site ID
- Site Name
- Location (coordinates)
- Planned Visit Date
- Assigned Coordinator
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
- User references

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

## 7.7 Assigning Coordinators

Field Operation Managers assign coordinators:

1. Open the MMP
2. Click **"Assign Coordinators"**
3. View available coordinators
4. Select coordinators for each site
5. Review assignments
6. Click **"Dispatch"**

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
Pending → Assigned → In Progress → Completed → Verified
                          ↓
                     Cancelled
```

| Status | Description |
|--------|-------------|
| **Pending** | Created but not assigned |
| **Assigned** | Collector assigned, awaiting start |
| **In Progress** | Visit actively being conducted |
| **Completed** | Data collection finished |
| **Verified** | Supervisor has verified data |
| **Cancelled** | Visit cancelled |

## 8.3 Conducting Site Visits

For Data Collectors:

1. View your assigned visits on the dashboard
2. Click on a visit to open details
3. Click **"Start Visit"**
4. Capture required data:
   - GPS location
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
   - PDF
   - Excel
4. Download the report

## 8.6 Editing Site Visits

1. Open the site visit
2. Click **"Edit"**
3. Make necessary changes
4. Click **"Save Changes"**

Note: Some fields may be locked based on visit status.

---

# 9. Field Team Management

## 9.1 Team Overview

Access from **Field Team** in the sidebar:

- View all team members
- See current status (online/offline)
- Track real-time locations
- Monitor workload distribution

## 9.2 Team Member Status

| Status | Indicator | Meaning |
|--------|-----------|---------|
| **Online** | Green dot | Currently active |
| **Active** | Orange dot | Has recent activity |
| **Offline** | Gray dot | Not recently active |

## 9.3 Location Tracking

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

## 9.4 Team Assignment

Assign team members to sites:

1. Select sites to assign
2. Click **"Assign Collector"**
3. View available collectors with:
   - Current workload
   - Proximity to site
   - Skill match
4. Select collector(s)
5. Confirm assignment

## 9.5 Smart Assignment

The system suggests optimal assignments based on:
- Geographic proximity
- Current workload
- Past performance
- Skill requirements
- Availability

---

# 10. Financial Operations

## 10.1 Financial Dashboard

Access from **Finance** or **Financial Operations**:

- **Overview**: Total budgets, expenses, pending approvals
- **Transactions**: All financial activities
- **Pending Approvals**: Awaiting your action
- **Reports**: Financial summaries

## 10.2 Transportation Costs

Before dispatching collectors:

1. Admin calculates transportation costs
2. Based on:
   - Distance to site
   - Transportation mode
   - Number of visits
3. Costs attached to site visits
4. Tracked through completion

## 10.3 Down Payment System

### Requesting Down Payment

1. Go to **Cost Submission**
2. Click **"Request Down Payment"**
3. Enter details:
   - Amount requested
   - Purpose
   - Associated site visit
   - Supporting documents
4. Submit for approval

### Approval Workflow

1. **Tier 1 - Supervisor Review**
   - Supervisor reviews request
   - Approves or requests changes

2. **Tier 2 - Admin Approval**
   - Admin verifies request
   - Approves final payment

### Tracking Status

| Status | Meaning |
|--------|---------|
| **Pending** | Awaiting first review |
| **Supervisor Approved** | Passed to admin |
| **Approved** | Ready for payment |
| **Rejected** | Request denied |
| **Paid** | Payment completed |

## 10.4 Cost Adjustments

For changes to approved costs:

1. Open the cost submission
2. Click **"Request Adjustment"**
3. Enter adjustment details:
   - New amount
   - Reason for change
4. Submit for re-approval

## 10.5 Audit Trail

All financial actions are logged:
- Who made the action
- When it occurred
- What changed
- Previous values

---

# 11. Budget Management

## 11.1 Creating Budgets

### Project Budget

1. Go to **Budget**
2. Click **"Create Project Budget"**
3. Fill in details:
   - Project selection
   - Total amount
   - Period (start/end dates)
   - Category allocations
4. Submit for approval

### MMP Budget

1. Click **"Create MMP Budget"**
2. Select project and MMP
3. Define budget parameters
4. Submit

## 11.2 Budget Categories

Standard categories:
- Transportation
- Accommodation
- Equipment
- Personnel
- Contingency
- Miscellaneous

## 11.3 Budget Status

| Status | Description |
|--------|-------------|
| **Draft** | Being prepared |
| **Submitted** | Awaiting approval |
| **Approved** | Ready for use |
| **Active** | Currently in use |
| **Exceeded** | Over budget limit |
| **Closed** | No longer active |

## 11.4 Budget Monitoring

Real-time tracking:
- Total allocated
- Amount spent
- Remaining balance
- Burn rate
- Projected end date

## 11.5 Budget Alerts

Configure alerts for:
- 50% utilization
- 75% utilization
- 90% utilization
- Over budget

## 11.6 Top-Up Requests

When additional funds needed:

1. Open the budget
2. Click **"Request Top-Up"**
3. Enter:
   - Additional amount
   - Justification
4. Submit for approval

---

# 12. Wallet System

## 12.1 Personal Wallet

Every field team member has a wallet:

- **View Balance**: Current available funds
- **Transaction History**: All credits and debits
- **Pending**: Awaiting transactions
- **Withdrawal**: Request fund withdrawal

## 12.2 Wallet Transactions

| Type | Description |
|------|-------------|
| **Credit** | Funds added to wallet |
| **Debit** | Funds removed from wallet |
| **Transfer** | Between wallets |
| **Withdrawal** | Cash out request |
| **Adjustment** | Admin corrections |

## 12.3 Withdrawal Requests

1. Go to **Wallet**
2. Click **"Request Withdrawal"**
3. Enter withdrawal amount
4. Select bank account
5. Submit request

### Withdrawal Status

- **Pending**: Awaiting processing
- **Approved**: Ready for payment
- **Processing**: Being transferred
- **Completed**: Successfully paid
- **Rejected**: Request denied

## 12.4 Admin Wallet Management

Administrators can:

1. View all user wallets
2. Adjust balances
3. Process withdrawals
4. Generate wallet reports

Access via **Admin** > **Wallets**

## 12.5 Bank Account Management

Add bank accounts:

1. Go to **Settings** > **Bank Accounts**
2. Click **"Add Account"**
3. Enter details:
   - Bank Name
   - Account Number
   - Account Name
   - Branch
4. Verify account
5. Save

---

# 13. Cost Submission & Approvals

## 13.1 Submitting Costs

After completing a site visit:

1. Go to **Cost Submission**
2. Click **"Submit Cost"**
3. Select the site visit
4. Enter expenses:
   - Transportation
   - Meals
   - Accommodation
   - Other costs
5. Upload receipts
6. Submit for approval

## 13.2 Supporting Documents

Required documents:
- Receipts (photos or scans)
- Transport tickets
- Fuel receipts
- Invoices

Document requirements:
- Clear and legible
- Dated
- Showing amounts
- Matching claimed costs

## 13.3 Approval Process

1. **Submission**: Collector submits costs
2. **Supervisor Review**: Verifies claims
3. **Admin Approval**: Final authorization
4. **Payment Processing**: Funds disbursed
5. **Confirmation**: Both parties notified

## 13.4 Cost History

View all past submissions:
- Filter by status
- Filter by date range
- Filter by project
- Export to Excel

## 13.5 Dispute Resolution

If a cost is rejected:

1. View rejection reason
2. Click **"Appeal"**
3. Provide additional information
4. Resubmit for review

---

# 14. Reports & Analytics

## 14.1 Available Reports

| Report Type | Description |
|-------------|-------------|
| **Site Visit Summary** | Overview of all visits |
| **MMP Progress** | MMP completion status |
| **Team Performance** | Individual and team metrics |
| **Financial Summary** | Budget utilization |
| **Compliance Report** | Audit and verification status |
| **Wallet Report** | Transaction summaries |

## 14.2 Generating Reports

1. Go to **Reports**
2. Select report type
3. Set parameters:
   - Date range
   - Project filter
   - Team filter
4. Click **"Generate"**
5. View or download

## 14.3 Export Formats

- **PDF**: Formatted document
- **Excel**: Spreadsheet data
- **CSV**: Raw data export

## 14.4 Scheduled Reports

Set up automatic reports:

1. Configure report parameters
2. Set schedule (daily, weekly, monthly)
3. Add recipients
4. Enable notifications

## 14.5 Custom Reports

Build custom reports:

1. Select data sources
2. Choose columns
3. Apply filters
4. Set grouping
5. Save template

## 14.6 Dashboard Analytics

Real-time metrics:
- Completion rates
- Average visit duration
- Cost per visit
- Team utilization
- Geographic coverage

---

# 15. Communication Features

## 15.1 In-App Messaging

### Starting a Conversation

1. Go to **Chat**
2. Click **"New Message"**
3. Select recipient(s)
4. Type your message
5. Send

### Group Chats

Create team discussions:

1. Click **"New Group"**
2. Name the group
3. Add members
4. Set purpose/description
5. Create

## 15.2 Message Features

- **Text Messages**: Standard text communication
- **File Sharing**: Attach documents and images
- **Read Receipts**: Know when messages are read
- **Message Search**: Find past conversations

## 15.3 Notification System

Configure notifications:

1. Go to **Settings** > **Notifications**
2. Toggle notification types:
   - Assignment notifications
   - Approval requests
   - Message alerts
   - System updates
3. Set delivery method:
   - In-app
   - Email
   - Push (mobile)

## 15.4 Assignment Alerts

When assigned to a site visit:

1. Popup notification appears
2. View assignment details
3. Accept or request reassignment
4. Access navigation to site

## 15.5 Floating Messenger

Quick access to messages:

1. Click the chat icon in bottom corner
2. View recent conversations
3. Send quick replies
4. Minimize to continue working

---

# 16. Maps & Location Services

## 16.1 Advanced Map Features

Access from **Map** in the sidebar:

- **Site Locations**: All monitoring sites
- **Team Positions**: Real-time team locations
- **Visit Status**: Color-coded by progress
- **Clustering**: Groups nearby points

## 16.2 Map Controls

| Control | Function |
|---------|----------|
| **Zoom** | Increase/decrease detail |
| **Pan** | Move around the map |
| **Layers** | Toggle map types |
| **Filter** | Show/hide categories |
| **Search** | Find specific locations |

## 16.3 Location Markers

Marker colors indicate status:

| Color | Status |
|-------|--------|
| Green | Completed |
| Blue | In Progress |
| Yellow | Assigned |
| Red | Overdue |
| Gray | Pending |

## 16.4 Team Location Map

View team members on map:

- Profile photos as markers
- Status ring (green/orange/gray)
- Click for details
- Navigate to member

## 16.5 GPS Capture

During site visits:

1. System requests location permission
2. GPS coordinates captured automatically
3. Accuracy indicator shown
4. Manual override available

## 16.6 Offline Maps

For areas with poor connectivity:

1. Download map region
2. Access offline during visits
3. Sync when connected

---

# 17. Archive Management

## 17.1 What Gets Archived

- Completed MMPs
- Finished site visits
- Closed projects
- Old documents
- Historical records

## 17.2 Accessing Archives

1. Go to **Archive**
2. Select category:
   - MMPs
   - Site Visits
   - Documents
3. Use filters:
   - Date range
   - Project
   - Status
4. View archived items

## 17.3 Archive Search

Find archived items:

1. Enter search terms
2. Select search scope
3. Apply date filters
4. Review results

## 17.4 Restoring Items

To unarchive:

1. Find the archived item
2. Click **"Restore"**
3. Confirm restoration
4. Item returns to active status

## 17.5 Archive Statistics

View archive metrics:
- Total archived items
- Archive by category
- Storage utilization
- Archive trends

## 17.6 Calendar View

Browse archives by date:

1. Switch to calendar view
2. Navigate to date
3. View items archived that day
4. Click to access details

---

# 18. Calendar & Scheduling

## 18.1 Calendar Views

| View | Description |
|------|-------------|
| **Month** | Full month overview |
| **Week** | 7-day detailed view |
| **Day** | Single day schedule |
| **Agenda** | List of upcoming events |

## 18.2 Event Types

- **Site Visits**: Scheduled monitoring
- **Deadlines**: MMP and project deadlines
- **Meetings**: Team meetings
- **Reminders**: Personal reminders

## 18.3 Creating Events

1. Click on a date
2. Select event type
3. Fill in details:
   - Title
   - Date/Time
   - Description
   - Participants
4. Save event

## 18.4 Deadline Tracking

Automatic deadline display:
- MMP submission deadlines
- Visit completion dates
- Budget closure dates
- Report due dates

## 18.5 Reminders

Set reminders:

1. Open any item
2. Click **"Set Reminder"**
3. Choose when to remind
4. Select notification method
5. Save

---

# 19. Settings & Preferences

## 19.1 Profile Settings

Update your profile:

1. Go to **Settings**
2. Click **"Profile"**
3. Update:
   - Display Name
   - Profile Photo
   - Contact Information
   - Bio
4. Save changes

## 19.2 Security Settings

Manage account security:

- **Change Password**: Update your password
- **Two-Factor Authentication**: Add extra security to your account
- **Session Management**: View active sessions
- **Login History**: See recent logins

### 19.2.1 Two-Factor Authentication (2FA)

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

## 19.3 Notification Preferences

Configure how you receive alerts:

| Category | Options |
|----------|---------|
| **Assignments** | In-app, Email, Push |
| **Approvals** | In-app, Email, Push |
| **Messages** | In-app, Email, Push |
| **System** | In-app, Email |

## 19.4 Display Settings

Customize your view:

- **Theme**: Light or Dark mode
- **Language**: Interface language
- **Timezone**: Your local timezone
- **Date Format**: Preferred date display

## 19.5 Location Settings

Control location sharing:

- Enable/disable location
- Set sharing preferences
- View location history
- Privacy controls

## 19.6 Data Management

- **Export Data**: Download your data
- **Clear Cache**: Free up storage
- **Sync**: Force data synchronization

---

# 20. Mobile App Guide

## 20.1 Installation

### iOS
1. Open App Store
2. Search "PACT Workflow"
3. Tap "Install"
4. Open and login

### Android
1. Open Google Play Store
2. Search "PACT Workflow"
3. Tap "Install"
4. Open and login

## 20.2 Mobile-Specific Features

| Feature | Description |
|---------|-------------|
| **Offline Mode** | Work without internet |
| **GPS Capture** | Automatic location |
| **Camera Integration** | Photo capture |
| **Push Notifications** | Instant alerts |
| **Touch ID/Face ID** | Biometric login |

## 20.3 Granting Permissions

On first use, grant permissions:

1. **Location**: Required for GPS capture
   - Enable "While Using App" or "Always"
2. **Camera**: For photo capture
   - Enable access
3. **Notifications**: For alerts
   - Enable push notifications
4. **Storage**: For offline files
   - Grant access

## 20.4 Offline Functionality

When offline:

1. View cached data
2. Complete site visits
3. Capture photos and GPS
4. Queue submissions
5. Auto-sync when online

## 20.5 Mobile Navigation

Bottom navigation bar includes:
- **Home**: Dashboard
- **Visits**: Site visits
- **Map**: Location view
- **Messages**: Chat
- **Profile**: Settings

## 20.6 Quick Actions

From home screen:
- Start Visit (button)
- Check In (location)
- Capture Photo
- View Notifications

## 20.7 Mobile Tips

- **Swipe**: Navigate between items
- **Pull down**: Refresh data
- **Long press**: Access options
- **Pinch**: Zoom on maps

---

# 21. Troubleshooting

## 21.1 Common Issues

### Cannot Login

1. Check email spelling
2. Verify password (case-sensitive)
3. Clear browser cache
4. Try password reset
5. Contact administrator

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
5. Try smaller batches

## 21.2 Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| "Session Expired" | Login timeout | Log in again |
| "Permission Denied" | Insufficient access | Contact admin |
| "Network Error" | Connection lost | Check internet |
| "Validation Failed" | Invalid data | Fix highlighted fields |
| "Server Error" | System issue | Try again later |

## 21.3 Getting Help

1. **In-App Help**: Click ? icon
2. **User Guide**: This document
3. **Support Chat**: Contact support team
4. **Email**: support@pact-platform.com
5. **Phone**: Emergency support line

## 21.4 Reporting Bugs

To report an issue:

1. Note the exact steps to reproduce
2. Take screenshots if possible
3. Note error messages
4. Record date and time
5. Submit via support channel

---

# 22. Glossary

| Term | Definition |
|------|------------|
| **MMP** | Monthly Monitoring Plan - Scheduled site monitoring document |
| **Site Visit** | A scheduled or ad-hoc visit to a monitoring location |
| **Coordinator** | Field team member who coordinates site visits |
| **Data Collector** | Field team member who collects data at sites |
| **FOM** | Field Operation Manager - Manages field operations |
| **RLS** | Row Level Security - Database access control |
| **Down Payment** | Advance payment for field expenses |
| **Dispatch** | Sending field teams to assigned sites |
| **Verification** | Process of validating data accuracy |
| **Archive** | Historical storage for completed items |
| **Wallet** | Digital account for managing field payments |
| **Permit** | Authorization document for site access |
| **GPS** | Global Positioning System - Location tracking |
| **KPI** | Key Performance Indicator - Success metrics |
| **Classification** | Categorization of sites or users |
| **Audit Trail** | Record of all system actions |
| **Real-time** | Instant updates without delay |
| **Sync** | Synchronize data between devices |
| **Offline Mode** | Functionality without internet |
| **Push Notification** | Alert sent to mobile device |

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

## Role Quick Reference

| Need To... | Required Role |
|------------|---------------|
| Create users | Admin, ICT |
| Upload MMP | Admin, ICT, FOM |
| Approve costs | Financial Admin, Admin |
| Assign visits | Admin, FOM, Supervisor |
| Collect data | Data Collector |
| Manage budgets | Financial Admin, Admin |

---

**Document Version**: 1.0  
**Last Updated**: November 2024  
**PACT Workflow Platform**

For the latest updates and additional resources, visit the Help section in the application.
