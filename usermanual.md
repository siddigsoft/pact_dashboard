# PACT Workflow Platform - User Manual

**Version 2.0 | Last Updated: December 2025**

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Getting Started](#2-getting-started)
3. [User Roles & Permissions](#3-user-roles--permissions)
4. [Dashboard](#4-dashboard)
5. [Monthly Monitoring Plans (MMP)](#5-monthly-monitoring-plans-mmp)
6. [Site Visits](#6-site-visits)
7. [Field Team Management](#7-field-team-management)
8. [Financial Operations](#8-financial-operations)
9. [Communication Features](#9-communication-features)
10. [Documents & Signatures](#10-documents--signatures)
11. [Reports & Analytics](#11-reports--analytics)
12. [Settings & Configuration](#12-settings--configuration)
13. [Mobile App Features](#13-mobile-app-features)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Introduction

### 1.1 What is PACT?

PACT (Planning, Approval, Coordination, and Tracking) is a comprehensive field operations management platform designed to streamline:

- **Monthly Monitoring Plans (MMPs)** - Plan and track field activities
- **Site Visits** - Manage and coordinate field visits
- **Team Coordination** - Real-time location sharing and communication
- **Financial Tracking** - Budgets, wallets, cost submissions, and approvals
- **Reporting** - Comprehensive analytics and export capabilities

### 1.2 Key Features

| Feature | Description |
|---------|-------------|
| Real-time Dashboard | Live statistics and operational overview |
| MMP Management | Upload, edit, verify, and track monitoring plans |
| Site Visit Workflow | Create, assign, track, and complete field visits |
| GPS Location Sharing | Real-time team location with accuracy indicators |
| Video & Voice Calls | WebRTC and Jitsi-based calling |
| Chat & Messaging | Real-time team communication |
| Digital Signatures | Secure document and transaction signing |
| Financial Management | Wallets, budgets, cost submissions, approvals |
| Offline Support | Work without internet on mobile devices |
| Push Notifications | Stay updated with actionable alerts |

### 1.3 Supported Platforms

- **Web Application**: Modern browsers (Chrome, Firefox, Safari, Edge)
- **Mobile App**: Android APK with offline capabilities
- **Production URL**: `app.pactorg.com`
- **Staging URL**: Vercel deployment for testing

---

## 2. Getting Started

### 2.1 Accessing the Platform

1. Navigate to the PACT login page
2. Enter your email address and password
3. Click "Sign In" to access the dashboard

### 2.2 First-Time Registration

1. Click "Sign Up" on the login page
2. Fill in your personal information:
   - Full Name
   - Email Address
   - Phone Number
   - Password (minimum 8 characters)
3. Select your role (if self-registration is enabled)
4. Complete email verification
5. Wait for admin approval (if required)

### 2.3 Two-Factor Authentication (2FA)

For enhanced security, you can enable 2FA:

1. Go to **Settings** > **Security**
2. Click "Enable Two-Factor Authentication"
3. Scan the QR code with an authenticator app
4. Enter the verification code to confirm

### 2.4 Password Recovery

1. Click "Forgot Password" on the login page
2. Enter your email address
3. Check your email for the reset link
4. Create a new password

---

## 3. User Roles & Permissions

### 3.1 System Roles

| Role | Category | Description |
|------|----------|-------------|
| **SuperAdmin** | Administrative | Full system access, manages all users and settings |
| **Admin** | Administrative | User management, system configuration |
| **Project Manager** | Administrative | Full project oversight, budget approval, team coordination |
| **Field Operation Manager (FOM)** | Field | Manages field operations, coordinates supervisors |
| **Senior Operations Lead** | Administrative | High-level operations oversight |
| **Supervisor** | Field | Supervises data collectors, reviews submissions |
| **Coordinator** | Field | Regional coordination, site visit management |
| **Finance Officer** | Financial | Financial operations, expense approvals |
| **Data Collector** | Field | Conducts site visits, submits data |
| **ICT** | Technical | Technical support, system maintenance |
| **Reviewer** | Administrative | Reviews and validates submissions |
| **Data Analyst** | Technical | Data analysis, report generation |

### 3.2 Permission Categories

**Resources:**
- `users` - User management
- `roles` - Role assignment
- `projects` - Project management
- `mmp` - Monthly Monitoring Plans
- `site_visits` - Site visit operations
- `finances` - Financial transactions
- `reports` - Reporting and analytics
- `wallets` - Wallet management
- `audit_logs` - Audit trail access
- `settings` - System configuration

**Actions:**
- `create` - Create new records
- `read` - View records
- `update` - Modify records
- `delete` - Remove records
- `approve` - Approve submissions
- `assign` - Assign tasks/users
- `archive` - Archive records
- `restore` - Restore archived items
- `override` - Override restrictions

### 3.3 Role Management

**For Administrators:**

1. Navigate to **Planning & Setup** > **Role Management**
2. View existing roles and their permissions
3. Create custom roles with specific permissions
4. Assign roles to users
5. Test permissions using the Permission Tester tool

---

## 4. Dashboard

### 4.1 Overview

The Mission Control Dashboard provides a real-time overview of operations, organized into zones:

**For Desktop:**
- Full dashboard with all zones visible
- Interactive statistics cards
- Quick action buttons
- Live notifications feed

**For Mobile:**
- Simplified grid view
- Touch-optimized interface
- Quick access to common actions

### 4.2 Dashboard Zones

| Zone | Content |
|------|---------|
| **Overview Zone** | Total projects, active MMPs, pending visits, team online |
| **Operations Zone** | Active site visits, completion rates, urgent items |
| **Financial Zone** | Budget utilization, pending approvals, wallet balances |
| **Team Zone** | Online team members, location map, recent activity |
| **Performance Zone** | Charts, trends, KPIs |
| **ICT Zone** | System status, sync indicators, error logs |

### 4.3 Real-Time Statistics

The dashboard displays live data from the database:
- Active users count
- Pending site visits
- Budget utilization percentage
- Team locations on map

---

## 5. Monthly Monitoring Plans (MMP)

### 5.1 What is an MMP?

An MMP (Monthly Monitoring Plan) defines the sites to visit and activities to complete within a specific month. Each MMP contains:

- Target sites with GPS coordinates
- Planned activities
- Assigned teams
- Timeline and deadlines
- Budget allocation

### 5.2 MMP Lifecycle

```
Draft → Under Review → Approved → In Progress → Completed → Archived
```

### 5.3 Creating an MMP

**Method 1: Manual Entry**
1. Go to **MMP Management** > **Create MMP**
2. Fill in plan details (name, month, project)
3. Add sites manually with coordinates
4. Set activities and timelines
5. Submit for approval

**Method 2: CSV Upload**
1. Go to **MMP Management** > **Upload MMP**
2. Download the CSV template
3. Fill in site data in the spreadsheet
4. Upload the completed CSV file
5. Review parsed data for accuracy
6. Confirm upload

### 5.4 MMP Verification

Before approval, MMPs undergo verification:

1. **GPS Validation** - Coordinates are within valid ranges
2. **Duplicate Check** - No duplicate site entries
3. **Data Completeness** - All required fields are filled
4. **Budget Validation** - Activities align with budget

### 5.5 Editing an MMP

1. Navigate to the MMP detail page
2. Click "Edit MMP"
3. Modify sites, activities, or assignments
4. Save changes
5. Re-submit for approval if required

---

## 6. Site Visits

### 6.1 Site Visit Workflow

```
Planned → Assigned → Claimed → In Progress → Submitted → Reviewed → Approved
```

### 6.2 Creating a Site Visit

**From MMP:**
1. Open an approved MMP
2. Click on a site
3. Select "Create Visit"
4. Assign a data collector
5. Set visit date

**Direct Creation:**
1. Go to **Field Operations** > **Site Visits**
2. Click "Create Visit"
3. Select project and MMP (if applicable)
4. Enter site details
5. Assign team member

### 6.3 Claiming a Site Visit

Data collectors can claim available visits:

1. View available visits in "My Site Visits"
2. Filter by location, date, or priority
3. Click "Claim" on a visit
4. Confirm assignment
5. Visit is now assigned to you

### 6.4 Conducting a Site Visit

1. Start the visit by clicking "Begin Visit"
2. GPS location is captured automatically
3. Complete required data collection
4. Take photos if required
5. Submit any costs incurred
6. Mark visit as complete
7. Submit for review

### 6.5 Site Visit Details

Each visit record includes:
- Site information (name, coordinates, locality)
- Assigned collector and supervisor
- Start/end timestamps with GPS accuracy
- Collected data and photos
- Cost submissions
- Status history

---

## 7. Field Team Management

### 7.1 Team Overview

Navigate to **Field Operations** > **Field Team** to see:
- All team members with roles
- Online/offline status
- Current location (if sharing enabled)
- Recent activity

### 7.2 Real-Time Location Tracking

**For Team Members:**
1. Enable location sharing in Settings
2. Allow GPS permissions when prompted
3. Your location updates automatically

**For Supervisors/Managers:**
1. View team locations on the interactive map
2. Color-coded accuracy indicators:
   - Green: High accuracy (< 10m)
   - Yellow: Medium accuracy (10-50m)
   - Red: Low accuracy (> 50m)
3. Click on a team member for details

### 7.3 Hub Operations

The Hub Operations page allows management of:
- Hub assignments
- State and locality groupings
- Team distribution across regions
- Workload balancing

---

## 8. Financial Operations

### 8.1 Wallets

Each user/project can have a wallet for:
- Receiving funds
- Making payments
- Tracking balance history

**Wallet Actions:**
- View balance and transactions
- Request withdrawal
- Submit for top-up

### 8.2 Cost Submissions

Field workers submit costs during site visits:

1. Open active site visit
2. Click "Submit Cost"
3. Select cost type (transport, meals, materials)
4. Enter amount
5. Upload receipt photo (required)
6. Add description
7. Submit for approval

### 8.3 Down Payment Requests

Before field activities, request advance payments:

1. Go to **Finance** > **Down Payment**
2. Click "Request Down Payment"
3. Select project and activity
4. Enter requested amount with justification
5. Submit for approval

### 8.4 Approval Workflows

**Two-Tier Approval Process:**

1. **First Level** - Supervisor approval
2. **Second Level** - Finance Officer approval

**Finance Approval Page Features:**
- Real-time wallet balances
- Shortfall warnings
- Batch processing
- Receipt viewing
- Audit trail

### 8.5 Budget Management

**Budget Features:**
- Task-level budget tracking
- Variance analysis (CPI, SPI, EAC)
- 80% utilization alerts
- Spending restrictions
- Override capabilities for authorized users

---

## 9. Communication Features

### 9.1 Chat & Messaging

**Accessing Chat:**
1. Click the **Chat** icon in the sidebar
2. Select a conversation or start new
3. Type your message
4. Send text, images, or files

**Features:**
- Real-time messaging
- Typing indicators
- Read receipts
- File attachments
- Group conversations

### 9.2 Video & Voice Calls

**Making a Call:**
1. Go to **Communication** > **Calls**
2. Search for the contact
3. Click the phone or video icon
4. Choose call method:
   - **Direct Call (WebRTC)** - Peer-to-peer, fastest
   - **Jitsi Meet** - Server-based, most reliable

**Receiving a Call:**
1. Incoming call notification appears
2. Click "Accept" to answer or "Reject" to decline
3. For Jitsi calls, you'll join the same video room

**Call Features:**
- Mute/unmute audio
- Turn camera on/off
- Screen sharing
- Chat during call
- Full-screen mode

### 9.3 Notifications

**Notification Types:**
- Incoming messages
- Call notifications
- Site visit updates
- Approval requests
- System alerts

**Actionable Notifications:**
- Click "Open" to navigate to the related item
- Click "OK" to dismiss

**Sound Settings:**
1. Go to Settings > Notifications
2. Enable/disable sounds
3. Adjust volume
4. Test notification sounds

---

## 10. Documents & Signatures

### 10.1 Document Management

**Uploading Documents:**
1. Go to **Documents**
2. Click "Upload Document"
3. Select file from device
4. Add title and description
5. Set visibility permissions
6. Upload

**Document Types Supported:**
- PDF, DOCX, XLSX
- Images (JPG, PNG)
- CSV files

### 10.2 Digital Signatures

**Signature Methods:**
1. **Handwritten** - Draw signature on screen
2. **OTP Verification** - Email or SMS code
3. **Biometric** - Fingerprint (mobile only)

**Signing a Document:**
1. Open document requiring signature
2. Click "Sign Document"
3. Choose verification method
4. Complete verification
5. Signature is recorded with timestamp and hash

**Signature Security:**
- SHA-256 hashing
- Audit logging
- Tamper detection
- Cryptographically secure OTP

---

## 11. Reports & Analytics

### 11.1 Available Reports

| Report | Description |
|--------|-------------|
| Site Visit Summary | Completion rates, timelines, status |
| Financial Report | Budget vs actual, cost breakdown |
| Team Performance | Visits per collector, response times |
| MMP Progress | Planned vs completed activities |
| Wallet Transactions | All financial movements |
| Audit Log | System activity history |

### 11.2 Generating Reports

1. Go to **Reports**
2. Select report type
3. Set date range and filters
4. Click "Generate"
5. View in browser or export

### 11.3 Export Options

- **PDF** - Formatted document with charts
- **Excel** - Editable spreadsheet
- **CSV** - Raw data for analysis

### 11.4 Tracker Preparation Plan

Specialized report for:
- Planned vs actual site coverage
- Invoice preparation
- Real-time progress updates
- Gap analysis

---

## 12. Settings & Configuration

### 12.1 User Profile

1. Click your avatar in the header
2. Select "Profile"
3. Update:
   - Profile photo
   - Display name
   - Phone number
   - Notification preferences

### 12.2 Security Settings

- Change password
- Enable 2FA
- View active sessions
- Revoke device access

### 12.3 Notification Preferences

Configure which notifications you receive:
- Push notifications
- Email notifications
- Sound alerts
- Quiet hours

### 12.4 Theme Settings

- Light mode
- Dark mode
- System preference (auto)

### 12.5 Data Visibility

Control what data is visible based on:
- Role permissions
- Project assignments
- Geographic scope

---

## 13. Mobile App Features

### 13.1 Installation

1. Download APK from provided link
2. Enable "Install from unknown sources"
3. Install the application
4. Grant required permissions

### 13.2 Offline Capabilities

**Works Offline:**
- View cached MMP lists
- Complete site visits
- Capture GPS locations
- Take photos
- Submit cost entries

**Requires Connection:**
- Real-time dashboard
- Chat and calls
- Live location map
- Push notifications
- User management

### 13.3 Sync Management

**Automatic Sync:**
- Syncs when connection restored
- Exponential backoff retry
- Conflict resolution

**Manual Sync:**
1. Pull down to refresh
2. Or tap "Sync Now" button
3. View sync progress

### 13.4 Mobile-Specific Features

- Touch-optimized UI
- Biometric login (fingerprint/face)
- Camera integration for photos
- Native GPS with high accuracy
- Push notifications
- Battery-efficient location tracking

### 13.5 Permissions Required

| Permission | Purpose |
|------------|---------|
| Camera | Photo capture for site visits |
| Location | GPS tracking and site verification |
| Storage | Offline data and photo storage |
| Notifications | Push alerts |
| Microphone | Voice/video calls |

---

## 14. Troubleshooting

### 14.1 Login Issues

**Problem: Cannot login**
- Check email/password spelling
- Reset password if forgotten
- Clear browser cache
- Try different browser

**Problem: 2FA code not working**
- Ensure device time is correct
- Use latest code (they expire in 30 seconds)
- Contact admin to reset 2FA

### 14.2 Location Issues

**Problem: Location not updating**
- Check GPS is enabled
- Grant location permission
- Move to area with better signal
- Restart the app

**Problem: Low GPS accuracy**
- Wait for better satellite lock
- Move away from buildings
- Enable high accuracy mode

### 14.3 Call Issues

**Problem: Call not connecting**
- Check internet connection
- Try Jitsi method instead of Direct
- Grant camera/microphone permissions
- Ensure other person is online

**Problem: No audio/video**
- Check device permissions
- Test microphone/camera in other apps
- Restart the call

### 14.4 Sync Issues

**Problem: Data not syncing**
- Check internet connection
- Tap "Sync Now" manually
- Check for error messages
- Restart the app

**Problem: Sync conflicts**
- Review conflict details
- Choose resolution strategy
- Contact support if data lost

### 14.5 Performance Issues

**Problem: App is slow**
- Clear browser cache
- Close unused tabs
- Update browser
- Check internet speed

**Problem: Mobile app crashing**
- Update to latest version
- Clear app cache
- Restart device
- Reinstall app

---

## Quick Reference

### Keyboard Shortcuts (Web)

| Shortcut | Action |
|----------|--------|
| `/` | Open search |
| `n` | New item |
| `?` | Help menu |
| `Esc` | Close dialog |

### Status Colors

| Color | Meaning |
|-------|---------|
| Green | Active/Approved/Online |
| Yellow | Pending/Warning |
| Red | Rejected/Error/Urgent |
| Blue | In Progress/Information |
| Gray | Inactive/Archived |

### Contact Support

For technical issues or questions:
- Email: `noreply@pactorg.com`
- In-app chat support
- Help documentation

---

**PACT Workflow Platform**
*Enhancing Field Operations Efficiency*

Copyright 2025 PACT Consultancy. All rights reserved.
