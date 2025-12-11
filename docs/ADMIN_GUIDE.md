# PACT Workflow Platform
## Administrator Guide

Complete guide for system administrators managing the PACT platform.

---

# Table of Contents

1. [Administrator Overview](#1-administrator-overview)
2. [User Management](#2-user-management)
3. [Role & Permission Management](#3-role--permission-management)
4. [Project Administration](#4-project-administration)
5. [MMP Workflow Management](#5-mmp-workflow-management)
6. [Financial Administration](#6-financial-administration)
7. [System Configuration](#7-system-configuration)
8. [Audit & Compliance](#8-audit--compliance)
9. [Super Admin Functions](#9-super-admin-functions)
10. [Troubleshooting Guide](#10-troubleshooting-guide)

---

# 1. Administrator Overview

## 1.1 Admin Role Hierarchy

```
Super Admin (Maximum 3 accounts)
    |
    +-- Admin (Full system access)
    |       |
    |       +-- ICT (Technical administration)
    |       +-- Financial Admin (Financial operations)
    |
    +-- Field Operation Manager
            |
            +-- Supervisor
            +-- Coordinator
            +-- Data Collector
```

## 1.2 Admin Dashboard

Administrators see an enhanced dashboard with:
- **System Health**: Platform status indicators
- **Pending Actions**: Items requiring admin attention
- **User Statistics**: Active users, registrations
- **Financial Overview**: Budget utilization, pending approvals
- **Audit Alerts**: Compliance notifications

## 1.3 Admin-Only Features

| Feature | Description |
|---------|-------------|
| User Management | Create, modify, deactivate users |
| Role Assignment | Assign and modify user roles |
| System Settings | Configure platform behavior |
| Financial Approvals | Final approval for payments |
| Audit Logs | View all system activity |
| Data Export | Bulk data operations |
| Super Admin Panel | Manage admin accounts |

---

# 2. User Management

## 2.1 Creating Users

### Manual Creation

1. Navigate to **Users**
2. Click **"Add User"**
3. Enter user information:
   - Full Name (required)
   - Email Address (required)
   - Phone Number (required)
   - Initial Password
4. Assign primary role
5. Click **"Create User"**

### Bulk Import

1. Go to **Users** > **Import**
2. Download the template CSV
3. Fill in user data
4. Upload completed CSV
5. Review validation
6. Confirm import

### Template CSV Format:
```csv
full_name,email,phone,role,classification
John Doe,john@example.com,+1234567890,DataCollector,Senior
Jane Smith,jane@example.com,+0987654321,Coordinator,Junior
```

## 2.2 User Account Actions

| Action | Steps |
|--------|-------|
| **Deactivate** | User list > Select user > Actions > Deactivate |
| **Reactivate** | User list > Filter: Inactive > Select > Reactivate |
| **Reset Password** | User detail > Security > Reset Password |
| **Reset 2FA** | User detail > Security > Reset Two-Factor Authentication |
| **Force Logout** | User detail > Sessions > End All Sessions |
| **Delete** | User detail > Actions > Delete (with audit log) |

### Two-Factor Authentication Management

As an administrator, you can help users manage their 2FA settings:

**When a user loses access to their authenticator:**
1. Navigate to the user's detail page
2. Go to **Security** settings
3. Click **"Reset Two-Factor Authentication"**
4. Confirm the reset
5. Notify the user they can now log in with just their password
6. Advise them to set up 2FA again from their Settings > Security page

**Best Practices:**
- Encourage all users to enable 2FA for enhanced security
- Recommend users set up a backup authenticator app
- Keep a secure process for verifying user identity before resetting 2FA
- Document all 2FA resets in the audit log for security compliance

## 2.3 User Classifications

Classifications categorize users for:
- Fee structures
- Assignment priorities
- Performance tracking

### Managing Classifications

1. Go to **Classifications**
2. View existing classifications
3. Click **"Add Classification"**
4. Enter:
   - Name
   - Description
   - Fee multiplier
   - Priority level
5. Save

## 2.4 User Monitoring

Track user activity:
- Last login date/time
- Session duration
- Actions performed
- Locations visited
- Performance metrics

---

# 3. Role & Permission Management

## 3.1 Understanding the Permission Model

Permissions follow the format: `resource:action`

**Resources:**
- users, roles, permissions
- projects, mmp, site_visits
- finances, reports, settings

**Actions:**
- create, read, update, delete
- approve, assign, archive

## 3.2 System Roles (Cannot be deleted)

| Role | Key Permissions |
|------|-----------------|
| Admin | Full access to all resources |
| ICT | User management, system config |
| FOM | Field operations, MMP management |
| Financial Admin | Budget, payments, approvals |
| Supervisor | Team management, site visits |
| Coordinator | Site coordination |
| DataCollector | Data collection, visits |
| Reviewer | Read-only access |

## 3.3 Creating Custom Roles

1. Navigate to **Role Management**
2. Click **"Create Role"**
3. Fill in details:
   - **Name**: Internal identifier (no spaces)
   - **Display Name**: User-friendly name
   - **Description**: Role purpose
   - **Category**: Field/Administrative/Financial/Technical
4. Set permissions:
   - Use a template as starting point
   - Add/remove individual permissions
   - Review permission summary
5. Click **"Create Role"**

## 3.4 Role Templates

Use pre-built templates:
- **Project Manager**: Project oversight
- **Field Supervisor**: Team management
- **Finance Officer**: Payment processing
- **Data Analyst**: Reporting access
- **State Coordinator**: State-level operations
- **HR Manager**: User administration
- **Auditor**: Compliance review
- **Technical Support**: System maintenance

## 3.5 Permission Inheritance

Roles do NOT inherit permissions. Each role must explicitly define its permissions.

Best practices:
- Start with a template
- Remove unnecessary permissions
- Test role in staging first
- Document custom roles

## 3.6 Assigning Multiple Roles

Users can have multiple roles:

1. Go to user profile
2. Click **"Manage Roles"**
3. Check additional roles
4. Save changes

Permissions are combined (union of all role permissions).

---

# 4. Project Administration

## 4.1 Project Lifecycle

```
Draft → Active → On Hold → Completed/Cancelled
```

## 4.2 Creating Projects

1. Go to **Projects** > **Create**
2. Enter project details:
   - Name and description
   - Start and end dates
   - Project manager
   - Budget allocation
   - Team structure
3. Define activities
4. Submit for activation

## 4.3 Project Budget Setup

1. Open project
2. Go to **Budget** tab
3. Click **"Create Budget"**
4. Allocate by category:
   - Transportation
   - Personnel
   - Equipment
   - Contingency
5. Set approval thresholds
6. Activate budget

## 4.4 Team Management

Assign team members:
1. Project > **Team** tab
2. **"Add Member"**
3. Select user
4. Assign project role
5. Set permissions

## 4.5 Project Reporting

Generate project reports:
- Progress reports
- Financial summaries
- Team performance
- Completion forecasts

---

# 5. MMP Workflow Management

## 5.1 MMP Lifecycle

```
Upload → Validation → Review → Approval → Forward to FOM → Dispatch → Monitoring → Completion → Archive
```

## 5.2 Upload Configuration

Settings for MMP uploads:

| Setting | Description | Default |
|---------|-------------|---------|
| Max file size | Maximum CSV size | 10MB |
| Required columns | Mandatory fields | Site ID, Name, Coords |
| Date format | Expected date format | YYYY-MM-DD |
| Coordinate format | GPS format | Decimal degrees |

## 5.3 Validation Rules

Configure validation:
1. Go to **Settings** > **MMP**
2. Set validation rules:
   - Required fields
   - Field formats
   - Cross-reference checks
   - Business rules
3. Save configuration

## 5.4 Approval Workflow

Configure approval stages:

| Stage | Approver | Actions |
|-------|----------|---------|
| 1. Validation | System | Auto-check data |
| 2. Review | ICT/Admin | Verify accuracy |
| 3. Approval | Admin/FOM | Authorize dispatch |
| 4. Assignment | FOM | Assign coordinators |

## 5.5 Dispatch Management

Before dispatch, ensure:
- All sites verified
- Coordinators assigned
- Transportation costs calculated
- Budget allocated
- Permits uploaded (where required)

## 5.6 Monitoring Progress

Track MMP progress:
- Site visit completion %
- Overdue visits
- Data quality scores
- Team performance

---

# 6. Financial Administration

## 6.1 Budget Administration

### Creating Organization Budgets

1. **Budget** > **Create**
2. Select scope (Organization/Project/MMP)
3. Set amounts and periods
4. Define approval thresholds
5. Activate

### Budget Monitoring

Dashboard shows:
- Total allocated
- Current utilization
- Pending requests
- Projected end date
- Alerts and warnings

## 6.2 Payment Approval Workflow

### Down Payment Requests

```
Submission → Supervisor Review → Admin Approval → Payment Processing → Completed
```

| Stage | Approver | Time Limit |
|-------|----------|------------|
| Submission | Collector | - |
| Supervisor | Supervisor | 24 hours |
| Final | Admin/FA | 48 hours |

### Approval Actions

- **Approve**: Move to next stage
- **Reject**: Return with reason
- **Request Changes**: Ask for modifications
- **Escalate**: Push to higher authority

## 6.3 Wallet Administration

### Wallet Operations

Access via **Admin** > **Wallets**:

| Operation | Description |
|-----------|-------------|
| View All | See all user wallets |
| Adjust Balance | Credit/debit wallets |
| Process Withdrawal | Approve cash-outs |
| Generate Reports | Wallet summaries |

### Balance Adjustments

1. Select user wallet
2. Click **"Adjust Balance"**
3. Enter:
   - Amount (positive/negative)
   - Reason
   - Reference
4. Confirm adjustment

All adjustments are logged in audit trail.

## 6.4 Fee Structure Management

Configure fees by classification:

1. **Classifications** > Select classification
2. **"Edit Fee Structure"**
3. Set rates:
   - Base fee
   - Distance multiplier
   - Urgency premium
   - Overtime rates
4. Save

## 6.5 Financial Reports

Generate reports:
- Daily transactions
- Weekly summaries
- Budget utilization
- Payment processing times
- Outstanding balances

---

# 7. System Configuration

## 7.1 General Settings

| Setting | Description |
|---------|-------------|
| Organization Name | Displayed in header |
| Logo | Platform branding |
| Timezone | Default timezone |
| Date Format | Display format |
| Currency | Financial display |

## 7.2 Notification Settings

Configure system notifications:

| Notification | Channels | Default |
|--------------|----------|---------|
| Assignment | Email, Push | On |
| Approval Request | Email, Push | On |
| Deadline Alert | Email | On |
| System Update | In-app | On |

## 7.3 Session Management

| Setting | Description | Range |
|---------|-------------|-------|
| Session Timeout | Auto-logout time | 15-120 min |
| Max Sessions | Per user | 1-5 |
| Remember Me | Duration | 7-30 days |

## 7.4 Location Settings

| Setting | Description |
|---------|-------------|
| Required Accuracy | GPS precision threshold |
| Update Frequency | How often to track |
| History Retention | Days to keep location data |
| Privacy Mode | Optional location hiding |

## 7.5 File Storage

| Setting | Description |
|---------|-------------|
| Max Upload Size | Per file limit |
| Allowed Types | Permitted extensions |
| Retention Period | Days to keep files |
| Compression | Auto-compress images |

---

# 8. Audit & Compliance

## 8.1 Audit Log Viewer

Access via **Audit Compliance**:

View all system activity:
- User actions
- Data modifications
- Login attempts
- Permission changes
- Financial transactions

## 8.2 Audit Log Fields

| Field | Description |
|-------|-------------|
| Timestamp | When action occurred |
| User | Who performed action |
| Action | What was done |
| Resource | What was affected |
| Details | Specific changes |
| IP Address | Origin of request |

## 8.3 Filtering Logs

Filter by:
- Date range
- User
- Action type
- Resource type
- Status (success/failure)

## 8.4 Compliance Reports

Generate compliance reports:
- User access audit
- Permission changes
- Financial approvals
- Data modifications
- Security events

## 8.5 Data Retention

| Data Type | Retention | Archive |
|-----------|-----------|---------|
| Audit logs | 2 years | Yes |
| Site visits | 1 year active | Yes |
| Financial records | 7 years | Yes |
| User data | Account lifetime | On deletion |

## 8.6 GDPR Compliance

User data rights:
- **Access**: Users can view their data
- **Export**: Download personal data
- **Deletion**: Request account deletion
- **Correction**: Update inaccurate data

Admin must process requests within 30 days.

---

# 9. Super Admin Functions

## 9.1 Super Admin Overview

Super Admin is the highest authority with:
- Full system access
- Admin account management
- System-wide configuration
- Override capabilities

**Important**: Maximum 3 Super Admin accounts allowed.

## 9.2 Accessing Super Admin Panel

1. Go to **Super Admin Management**
2. Authenticate with additional verification
3. Access super admin functions

## 9.3 Managing Admin Accounts

| Action | Description |
|--------|-------------|
| Create Admin | Add new admin user |
| Promote User | Elevate to admin |
| Demote Admin | Remove admin access |
| View Admin Activity | Audit admin actions |

## 9.4 Super Admin Audit Log

All super admin actions are logged separately:
- Admin account changes
- System configuration
- Override actions
- Security events

## 9.5 Emergency Actions

Super admins can:
- Force user logout
- Lock user accounts
- Reset system settings
- Restore from backup
- Override approvals

---

# 10. Troubleshooting Guide

## 10.1 User Issues

### User Cannot Login

1. Verify account is active
2. Check for locked status
3. Reset password if needed
4. Clear user sessions
5. Check IP restrictions

### User Missing Permissions

1. Review assigned roles
2. Check role permissions
3. Verify role is active
4. Test with permission tester
5. Assign additional role if needed

### User Data Not Syncing

1. Check user session
2. Force sync from admin
3. Clear user cache
4. Check network logs
5. Review error logs

## 10.2 System Issues

### Slow Performance

1. Check server resources
2. Review active users
3. Analyze slow queries
4. Clear system cache
5. Contact technical support

### File Upload Failures

1. Check file size limits
2. Verify file format
3. Check storage capacity
4. Review error messages
5. Test with smaller file

### Location Services Issues

1. Verify device permissions
2. Check GPS hardware
3. Review location settings
4. Test in different area
5. Check network connectivity

## 10.3 Financial Issues

### Payment Processing Errors

1. Verify wallet balance
2. Check approval status
3. Review transaction logs
4. Check bank details
5. Contact finance team

### Budget Discrepancies

1. Audit recent transactions
2. Check pending approvals
3. Verify calculation settings
4. Generate reconciliation report
5. Adjust if necessary

## 10.4 Getting Support

For issues requiring technical support:

1. Document the problem
2. Gather relevant logs
3. Note steps to reproduce
4. Record error messages
5. Contact support with details

---

# Admin Checklists

## Daily Checks

- [ ] Review pending approvals
- [ ] Check system alerts
- [ ] Monitor active users
- [ ] Review failed transactions
- [ ] Check backup status

## Weekly Tasks

- [ ] Review user activity
- [ ] Process pending registrations
- [ ] Check budget utilization
- [ ] Generate weekly report
- [ ] Review security logs

## Monthly Tasks

- [ ] User access audit
- [ ] Role permission review
- [ ] Financial reconciliation
- [ ] Performance review
- [ ] System maintenance

---

**Document Version**: 1.0  
**Last Updated**: November 2024  
**For Administrator Use Only**
