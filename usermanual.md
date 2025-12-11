# PACT Command Center - Complete User Manual

**Version 3.0 | Last Updated: December 2025**

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Architecture](#2-system-architecture)
3. [User Roles & Permissions](#3-user-roles--permissions)
4. [Complete Page Reference](#4-complete-page-reference)
5. [Database Tables & Relationships](#5-database-tables--relationships)
6. [Workflows & Processes](#6-workflows--processes)
7. [Communication Features](#7-communication-features)
8. [Mobile App Features](#8-mobile-app-features)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Introduction

### 1.1 About PACT Command Center

**PACT Command Center** is the centralized Field Operations Command Center designed for comprehensive management of humanitarian and development field operations. The platform serves as a unified command hub that enables organizations to plan, coordinate, execute, and monitor all field activities from a single integrated interface.

**What PACT Command Center Delivers:**

- **Unified Operations Management** - Single platform for all field operations coordination
- **Real-Time Command & Control** - Live monitoring of team locations, activities, and status
- **Enterprise-Grade Security** - Role-based access control with 12 specialized user roles
- **Financial Oversight** - Complete budget tracking, wallet management, and approval workflows
- **Mobile-First Design** - Full offline capability for field teams in remote areas
- **Comprehensive Reporting** - Analytics, audit trails, and exportable reports

**Core Modules:**

- **Monthly Monitoring Plans (MMPs)** - Strategic planning and site targeting for field activities
- **Site Visit Management** - End-to-end coordination of field visits with GPS tracking and photo documentation
- **Team Coordination Center** - Real-time location sharing, voice/video calling, and instant messaging
- **Financial Control System** - Budgets, digital wallets, cost submissions, multi-tier approvals, and Bank of Khartoum integration
- **Reporting & Analytics** - Comprehensive dashboards, custom reports, and data export capabilities
- **Document Management** - Centralized document storage with digital signature verification

### 1.2 Platform Environments

| Environment | URL | Purpose |
|-------------|-----|---------|
| Production | `app.pactorg.com` | Live production system |
| Staging | Vercel URL | Testing and development |

---

## 2. System Architecture

### 2.1 Technology Stack

| Component | Technology |
|-----------|------------|
| Frontend | React 18, TypeScript, Tailwind CSS, Shadcn UI |
| Backend | Supabase (PostgreSQL), Edge Functions |
| Real-time | Supabase Realtime, WebRTC |
| Authentication | Supabase Auth, Google OAuth, 2FA |
| Mobile | Capacitor (Android/iOS) |
| Email | IONOS SMTP (noreply@pactorg.com) |

### 2.2 Core Features

- Real-time Dashboard with live statistics
- Role-based access control (RBAC)
- Offline-first mobile support
- Digital signatures with OTP verification
- Video/Voice calling (WebRTC & Jitsi)
- Push notifications
- Comprehensive audit logging

---

## 3. User Roles & Permissions

### 3.1 System Roles

| Role | Category | Description | Key Permissions |
|------|----------|-------------|-----------------|
| **SuperAdmin** | Administrative | Full system control | All permissions, system configuration |
| **Admin** | Administrative | User and system management | Users, roles, settings management |
| **Project Manager** | Administrative | Project oversight | Projects CRUD, MMP approve, finances approve |
| **Field Operation Manager (FOM)** | Field | Field operations management | Site visits, team coordination, approvals |
| **Senior Operations Lead** | Administrative | Senior leadership with override | Budget override, final approvals |
| **Supervisor** | Field | Team supervision | Site visits assign/update, submissions review |
| **Coordinator** | Field | State Coordination | Site visits create/assign, MMP updates |
| **Finance Officer** | Financial | Financial operations | Finances CRUD, approvals, reports |
| **Data Collector** | Field | Field data collection | Site visits claim/complete, costs submit |
| **ICT** | Technical | Technical support | System maintenance, audit logs |
| **Reviewer** | Administrative | Quality assurance | Submissions review, data validation |
| **Data Analyst** | Technical | Data analysis | Reports read/create, data export |

### 3.2 Permission Matrix

| Resource | Actions Available |
|----------|-------------------|
| `users` | create, read, update, delete, assign |
| `roles` | create, read, update, delete, assign |
| `projects` | create, read, update, delete, approve, assign, archive |
| `mmp` | create, read, update, delete, approve, assign |
| `site_visits` | create, read, update, delete, approve, assign |
| `finances` | create, read, update, approve, override |
| `reports` | create, read |
| `wallets` | read, approve, override |
| `audit_logs` | read |
| `settings` | read, update |

---

## 4. Complete Page Reference

### 4.1 Public Pages (No Authentication Required)

---

#### Landing Page (`/`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Welcome page introducing PACT platform to visitors |
| **How It Works** | Displays platform branding, live clock, system status, and key statistics. Users can click "Get Started" to proceed to login |
| **Who Can Access** | Everyone (public) |
| **Connected Pages** | Auth (`/auth`), Register (`/register`) |
| **Database Tables** | None (static content) |
| **Key Features** | System operational status indicator, platform statistics display, animated background |

---

#### Authentication Page (`/auth`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | User login and authentication |
| **How It Works** | Users enter email/password or use Google OAuth. Supports 2FA verification. Shows security features and platform stats |
| **Who Can Access** | Everyone (public) |
| **Connected Pages** | Dashboard (`/dashboard`), Register (`/register`), Forgot Password (`/forgot-password`) |
| **Database Tables** | `profiles`, `user_roles` |
| **Key Features** | Email/password login, Google OAuth, "Forgot Password?" link, 2FA support, mobile-optimized view |

---

#### Registration Page (`/register`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | New user account creation |
| **How It Works** | Multi-step form: 1) Select role category (Field Team/Management), 2) Choose specific role, 3) Enter personal details, 4) Upload avatar, 5) Select hub/state/locality for field roles |
| **Who Can Access** | Everyone (public) |
| **Connected Pages** | Registration Success (`/registration-success`), Auth (`/auth`) |
| **Database Tables** | `profiles`, `user_roles` |
| **Key Features** | Role selection, avatar upload, hub/state/locality selection, form validation |

---

#### Forgot Password (`/forgot-password`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Initiate password reset process |
| **How It Works** | User enters email, system sends OTP verification code via IONOS SMTP |
| **Who Can Access** | Everyone (public) |
| **Connected Pages** | Reset Password (`/reset-password`), Auth (`/auth`) |
| **Database Tables** | `profiles` |
| **Key Features** | Email validation, OTP generation, "Back to Login" navigation |

---

#### Reset Password (`/reset-password`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Complete password reset with OTP verification |
| **How It Works** | User enters OTP code received via email, then sets new password |
| **Who Can Access** | Users with valid OTP |
| **Connected Pages** | Auth (`/auth`) |
| **Database Tables** | `profiles` |
| **Key Features** | OTP verification, password strength validation, secure password update |

---

### 4.2 Protected Pages (Authentication Required)

---

#### Dashboard (`/dashboard`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Central command center showing real-time operational overview |
| **How It Works** | Displays role-specific zones with live statistics, charts, team locations, and quick actions. Data refreshes automatically via Supabase Realtime |
| **Who Can Access** | All authenticated users |
| **Connected Pages** | All major sections (MMP, Site Visits, Projects, Field Team, etc.) |
| **Database Tables** | `profiles`, `mmp_files`, `projects`, `site_visits`, `notifications` |
| **Key Features** | Overview Zone, Operations Zone, Financial Zone, Team Zone, Performance Zone, ICT Zone |

**Dashboard Zones by Role:**
- **SuperAdmin/Admin**: All zones visible
- **Project Manager**: Projects, MMPs, Team, Performance
- **FOM**: Operations, Team, Site Visits
- **Data Collector**: My Visits, Tasks, Location

---

#### MMP Management (`/mmp`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | View and manage Monthly Monitoring Plans |
| **How It Works** | Lists all MMPs with filtering by status, month, year. Users can search, sort, and access individual MMP details |
| **Who Can Access** | All authenticated users (view varies by role) |
| **Connected Pages** | MMP Upload (`/mmp/upload`), MMP Detail (`/mmp/:id`), Edit MMP (`/mmp/:id/edit`) |
| **Database Tables** | `mmp_files`, `profiles` |
| **Key Features** | Status filtering, search, pagination, bulk actions, export |

---

#### MMP Upload (`/mmp/upload`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Upload new MMP files via CSV |
| **How It Works** | 1) Download CSV template, 2) Fill in site data, 3) Upload file, 4) System validates and parses data, 5) Review parsed entries, 6) Confirm upload |
| **Who Can Access** | Admin, Project Manager, Coordinator |
| **Connected Pages** | MMP List (`/mmp`), MMP Detail (`/mmp/:id`) |
| **Database Tables** | `mmp_files`, `site_entries` |
| **Key Features** | CSV template download, Zod validation, duplicate detection, rollback support |

---

#### MMP Detail View (`/mmp/:id`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | View complete MMP information and site entries |
| **How It Works** | Displays MMP metadata, site list with GPS coordinates, status, assigned team, and action buttons based on current stage |
| **Who Can Access** | All authenticated users |
| **Connected Pages** | Edit MMP, Verification, Review Assign Coordinators |
| **Database Tables** | `mmp_files`, `site_entries`, `profiles` |
| **Key Features** | Site table with GPS, status workflow, export options, map view |

---

#### MMP Verification (`/mmp/verify/:id`, `/mmp/:id/verification`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Verify MMP data quality before approval |
| **How It Works** | System runs validation checks on GPS coordinates, duplicates, completeness. Reviewer can approve or reject with comments |
| **Who Can Access** | Admin, Project Manager, Reviewer |
| **Connected Pages** | MMP Detail, Approval Dashboard |
| **Database Tables** | `mmp_files`, `site_entries` |
| **Key Features** | GPS validation, duplicate check, data completeness, approval workflow |

---

#### Edit MMP (`/mmp/:id/edit`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Modify existing MMP details and site entries |
| **How It Works** | Form-based editing of MMP metadata and site list. Changes tracked in modification history |
| **Who Can Access** | Admin, Project Manager, Coordinator |
| **Connected Pages** | MMP Detail, MMP List |
| **Database Tables** | `mmp_files`, `site_entries` |
| **Key Features** | Inline editing, GPS coordinate updates, status management |

---

#### Review Assign Coordinators (`/mmp/:id/review-assign-coordinators`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Assign coordinators to MMP sites |
| **How It Works** | Displays unassigned sites grouped by state/locality. Admin selects coordinators and assigns them to sites |
| **Who Can Access** | Admin, Project Manager, FOM |
| **Connected Pages** | MMP Detail, Users |
| **Database Tables** | `mmp_files`, `profiles`, `user_roles` |
| **Key Features** | Bulk assignment, coordinator filtering, geographic grouping |

---

#### Site Visits (`/site-visits`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Manage all site visit operations |
| **How It Works** | Lists site visits with status filters. Data collectors see available visits to claim. Supervisors see visits to review |
| **Who Can Access** | All authenticated users |
| **Connected Pages** | Create Site Visit, Site Visit Detail |
| **Database Tables** | `site_visits`, `profiles`, `mmp_files` |
| **Key Features** | Status filtering, claim system, GPS tracking, cost submissions |

---

#### Site Visit Detail (`/site-visits/:id`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | View and manage individual site visit |
| **How It Works** | Shows visit details, GPS location, photos, costs, status history. Data collectors can start/complete visits, submit costs |
| **Who Can Access** | Assigned user, Supervisor, Admin |
| **Connected Pages** | Site Visits list, Cost Submission, Edit Site Visit |
| **Database Tables** | `site_visits`, `profiles`, `cost_submissions` |
| **Key Features** | Visit timeline, GPS capture, photo upload, cost tracking, status workflow |

---

#### Create Site Visit (`/site-visits/create`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Create new site visit manually |
| **How It Works** | Form to enter site details, select from MMP or enter manually, assign data collector |
| **Who Can Access** | Coordinator, Supervisor, Admin |
| **Connected Pages** | Site Visits, MMP selection |
| **Database Tables** | `site_visits`, `mmp_files`, `profiles` |
| **Key Features** | MMP linking, GPS entry, collector assignment |

---

#### Create Site Visit from MMP (`/site-visits/create/mmp`, `/site-visits/create/mmp/:id`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Create site visits directly from MMP entries |
| **How It Works** | Select MMP, view available sites, batch create visits for selected sites |
| **Who Can Access** | Coordinator, Supervisor, Admin |
| **Connected Pages** | MMP List, Site Visits |
| **Database Tables** | `site_visits`, `mmp_files`, `site_entries` |
| **Key Features** | MMP site selection, batch creation, auto-populate GPS |

---

#### Calls (`/calls`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Voice and video calling between team members |
| **How It Works** | Users select contact, choose call method (Direct WebRTC or Jitsi Meet), initiate call. Recipient receives notification and can accept/reject |
| **Who Can Access** | All authenticated users |
| **Connected Pages** | Chat, Field Team |
| **Database Tables** | `profiles` (for contacts), real-time signaling via Supabase |
| **Key Features** | WebRTC peer-to-peer calls, Jitsi Meet video rooms, incoming call notifications, call history |

**Call Flow:**
1. Caller selects contact from list
2. Caller chooses call method: Direct (WebRTC) or Jitsi Meet
3. Signal sent to recipient via Supabase Realtime
4. Recipient sees incoming call popup with ringtone
5. Recipient accepts (joins call) or rejects
6. Both parties connected in audio/video call
7. Call controls: mute, video toggle, end call

---

#### Chat (`/chat`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Real-time messaging between team members |
| **How It Works** | Users can start conversations, send text/files, see typing indicators and read receipts |
| **Who Can Access** | All authenticated users |
| **Connected Pages** | Calls, Field Team |
| **Database Tables** | `messages`, `conversations`, `profiles` |
| **Key Features** | Real-time messaging, typing indicators, file attachments, read receipts, message search |

---

#### Field Team (`/field-team`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | View team members and their real-time locations |
| **How It Works** | Displays team list with online/offline status. Interactive map shows GPS locations with accuracy indicators |
| **Who Can Access** | All authenticated users |
| **Connected Pages** | Calls, Chat, User Detail |
| **Database Tables** | `profiles`, `team_locations` |
| **Key Features** | Live location map, GPS accuracy (green/yellow/red), online status, team filtering |

---

#### Projects (`/projects`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Manage all projects |
| **How It Works** | Lists projects with status, dates, team. Users can create, edit, and manage project activities |
| **Who Can Access** | All authenticated users (actions vary by role) |
| **Connected Pages** | Create Project, Project Detail, MMP |
| **Database Tables** | `projects`, `project_activities`, `profiles` |
| **Key Features** | Project CRUD, activity management, team assignment, budget tracking |

---

#### Project Detail (`/projects/:id`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | View and manage individual project |
| **How It Works** | Shows project overview, activities, team, budget, and linked MMPs |
| **Who Can Access** | Project team members, Admin |
| **Connected Pages** | Edit Project, Team Management, Activities |
| **Database Tables** | `projects`, `project_activities`, `project_settings` |
| **Key Features** | Activity timeline, team management, budget overview, status workflow |

---

#### Create Project (`/projects/create`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Create new project |
| **How It Works** | Form with project details: name, description, dates, location, type, team, budget |
| **Who Can Access** | Admin, Project Manager |
| **Connected Pages** | Projects list |
| **Database Tables** | `projects` |
| **Key Features** | Multi-step form, location picker, team selection, budget setup |

---

#### Project Team Management (`/projects/:id/team`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Manage project team members |
| **How It Works** | Add/remove team members, assign roles within project |
| **Who Can Access** | Project Manager, Admin |
| **Connected Pages** | Project Detail, Users |
| **Database Tables** | `projects`, `profiles` |
| **Key Features** | Team composition, role assignment, workload view |

---

#### Users (`/users`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | User management and administration |
| **How It Works** | Lists all users with search/filter. Admins can edit profiles, assign roles, manage status |
| **Who Can Access** | Admin, SuperAdmin |
| **Connected Pages** | User Detail, Role Management |
| **Database Tables** | `profiles`, `user_roles` |
| **Key Features** | User search, role filtering, status management, bulk actions |

---

#### User Detail (`/users/:id`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | View and edit individual user profile |
| **How It Works** | Displays user info, roles, activity history. Admins can edit profile, manage roles |
| **Who Can Access** | Admin, SuperAdmin, User themselves |
| **Connected Pages** | Users list, Role Management |
| **Database Tables** | `profiles`, `user_roles`, `notifications` |
| **Key Features** | Profile editing, role management, activity log, status toggle |

---

#### Role Management (`/role-management`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Create and manage custom roles with permissions |
| **How It Works** | View existing roles, create custom roles with specific permissions, assign roles to users |
| **Who Can Access** | Admin, SuperAdmin |
| **Connected Pages** | Users, User Detail |
| **Database Tables** | `roles`, `permissions`, `user_roles` |
| **Key Features** | Role templates, permission matrix, user assignment, permission testing |

---

#### Wallet (`/wallet`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | View personal wallet and transaction history |
| **How It Works** | Shows current balance, transaction list, withdrawal requests |
| **Who Can Access** | All authenticated users (own wallet) |
| **Connected Pages** | Withdrawal Approval, Finance Approval |
| **Database Tables** | `wallets`, `wallet_transactions` |
| **Key Features** | Balance display, transaction history, withdrawal request |

---

#### Admin Wallets (`/admin/wallets`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Manage all user wallets |
| **How It Works** | Lists all wallets with balances. Admins can view details, adjust balances, process transactions |
| **Who Can Access** | Finance Officer, Admin |
| **Connected Pages** | Admin Wallet Detail |
| **Database Tables** | `wallets`, `profiles` |
| **Key Features** | Wallet overview, balance adjustments, bulk operations |

---

#### Finance Approval (`/finance-approval`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Approve cost submissions and financial requests |
| **How It Works** | Lists pending approvals with details. Finance officers review, approve/reject with comments |
| **Who Can Access** | Finance Officer, Admin |
| **Connected Pages** | Cost Submission, Wallet |
| **Database Tables** | `cost_submissions`, `wallets`, `approval_logs` |
| **Key Features** | Approval queue, receipt viewing, batch processing, shortfall warnings |

---

#### Down Payment Approval (`/down-payment-approval`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Approve down payment requests before field activities |
| **How It Works** | Lists pending down payment requests. Two-tier approval: Supervisor then Finance |
| **Who Can Access** | Supervisor, Finance Officer, Admin |
| **Connected Pages** | Budget, Wallet |
| **Database Tables** | `down_payments`, `approvals`, `wallets` |
| **Key Features** | Two-tier approval, budget check, justification review |

---

#### Withdrawal Approval (`/withdrawal-approval`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Approve wallet withdrawal requests |
| **How It Works** | Lists pending withdrawals. Finance officers verify and process |
| **Who Can Access** | Finance Officer, Admin |
| **Connected Pages** | Wallet, Admin Wallets |
| **Database Tables** | `wallets`, `withdrawal_requests` |
| **Key Features** | Withdrawal queue, bank details verification, batch processing |

---

#### Supervisor Approvals (`/supervisor-approvals`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Review and approve site visit submissions |
| **How It Works** | Lists completed site visits pending supervisor review. Can approve, reject, or request revision |
| **Who Can Access** | Supervisor, FOM |
| **Connected Pages** | Site Visits, Site Visit Detail |
| **Database Tables** | `site_visits`, `approvals` |
| **Key Features** | Submission review, GPS verification, photo review, approval workflow |

---

#### Budget (`/budget`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Manage project and task-level budgets |
| **How It Works** | Displays budget allocation, utilization, variance analysis. Alerts at 80% utilization |
| **Who Can Access** | Project Manager, Finance Officer, Admin |
| **Connected Pages** | Projects, Cost Submission |
| **Database Tables** | `budgets`, `projects`, `cost_submissions` |
| **Key Features** | Budget tracking, variance analysis (CPI, SPI), spending restrictions, override capability |

---

#### Cost Submission (`/cost-submission`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Submit costs incurred during field activities |
| **How It Works** | Data collectors submit costs with type, amount, description, and receipt photo |
| **Who Can Access** | Data Collector, Coordinator |
| **Connected Pages** | Site Visits, Finance Approval |
| **Database Tables** | `cost_submissions`, `site_visits` |
| **Key Features** | Cost categories, receipt upload, auto-calculation, submission history |

---

#### Reports (`/reports`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Generate and view operational reports |
| **How It Works** | Select report type, set date range and filters, generate report. Export to PDF/Excel |
| **Who Can Access** | All authenticated users (content varies by role) |
| **Connected Pages** | All data pages |
| **Database Tables** | All tables (read-only) |
| **Key Features** | Multiple report types, date filtering, PDF/Excel export |

**Report Types:**
- Site Visit Summary
- Financial Report
- Team Performance
- MMP Progress
- Wallet Transactions
- Audit Logs

---

#### Documents (`/documents`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Document management and storage |
| **How It Works** | Upload, organize, and share documents. Supports multiple file types |
| **Who Can Access** | All authenticated users |
| **Connected Pages** | Signatures |
| **Database Tables** | `documents`, `document_signatures` |
| **Key Features** | Upload, categorization, search, sharing, version history |

---

#### Signatures (`/signatures`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Digital signature management |
| **How It Works** | Sign documents using handwritten signature, OTP verification, or biometric (mobile) |
| **Who Can Access** | All authenticated users |
| **Connected Pages** | Documents, Wallet |
| **Database Tables** | `signatures`, `signature_audit_logs` |
| **Key Features** | Multiple verification methods, SHA-256 hashing, audit trail |

---

#### Notifications (`/notifications`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | View all system notifications |
| **How It Works** | Lists notifications with read/unread status. Click to navigate to related item |
| **Who Can Access** | All authenticated users |
| **Connected Pages** | All pages (via notification links) |
| **Database Tables** | `notifications` |
| **Key Features** | Mark as read, filtering, actionable links, bulk actions |

---

#### Settings (`/settings`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | User preferences and account settings |
| **How It Works** | Configure profile, notifications, security, and display preferences |
| **Who Can Access** | All authenticated users |
| **Connected Pages** | Profile, Security |
| **Database Tables** | `profiles`, `user_settings` |
| **Key Features** | Profile editing, 2FA setup, notification preferences, theme selection |

---

#### Audit Logs (`/audit-logs`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | View system activity history |
| **How It Works** | Comprehensive log of all system actions with filters |
| **Who Can Access** | Admin, ICT, SuperAdmin |
| **Connected Pages** | All pages (audit references) |
| **Database Tables** | `audit_logs` |
| **Key Features** | Action filtering, user filtering, date range, export |

---

#### Email Tracking (`/email-tracking`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Track sent email notifications |
| **How It Works** | Lists all emails sent via IONOS SMTP with delivery status |
| **Who Can Access** | Admin, ICT |
| **Connected Pages** | Settings |
| **Database Tables** | `email_logs` |
| **Key Features** | Delivery status, recipient filtering, date filtering |

---

#### Hub Operations (`/hub-operations`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Manage hub-based field operations |
| **How It Works** | View and manage hubs, states, localities. Assign teams to geographic areas |
| **Who Can Access** | Admin, FOM |
| **Connected Pages** | Field Team, Users |
| **Database Tables** | `profiles`, `hubs`, `states`, `localities` |
| **Key Features** | Geographic hierarchy, team assignment, workload distribution |

---

#### Tracker Preparation Plan (`/tracker-preparation-plan`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Analyze planned vs actual site coverage |
| **How It Works** | Compares MMP targets with completed visits, identifies gaps, prepares invoice data |
| **Who Can Access** | Project Manager, Finance Officer, Admin |
| **Connected Pages** | MMP, Site Visits, Reports |
| **Database Tables** | `mmp_files`, `site_visits` |
| **Key Features** | Coverage analysis, gap identification, invoice preparation |

---

#### Classifications (`/classifications`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Manage user classifications and categories |
| **How It Works** | Define classification types, assign to users, configure fee structures |
| **Who Can Access** | Admin |
| **Connected Pages** | Classification Fees, Users |
| **Database Tables** | `classifications` |
| **Key Features** | Classification CRUD, user assignment |

---

#### Classification Fee Management (`/classification-fees`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Configure fees per classification |
| **How It Works** | Set transport costs, daily allowances, and other fees based on classification |
| **Who Can Access** | Admin, Finance Officer |
| **Connected Pages** | Classifications, Cost Submission |
| **Database Tables** | `classification_fees` |
| **Key Features** | Fee structure, rate configuration |

---

#### Advanced Map (`/map`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Interactive map with all operational data |
| **How It Works** | Leaflet-based map showing sites, team locations, visit status with layers and filters |
| **Who Can Access** | All authenticated users |
| **Connected Pages** | Field Team, Site Visits, MMP |
| **Database Tables** | `mmp_files`, `site_visits`, `profiles` |
| **Key Features** | Multiple layers, clustering, GPS accuracy, real-time updates |

---

#### Calendar (`/calendar`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | View scheduled activities and deadlines |
| **How It Works** | Calendar view of site visits, MMP deadlines, project milestones |
| **Who Can Access** | All authenticated users |
| **Connected Pages** | Site Visits, Projects |
| **Database Tables** | `site_visits`, `projects`, `project_activities` |
| **Key Features** | Month/week/day views, event filtering, quick create |

---

#### Archive (`/archive`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Access archived items |
| **How It Works** | Lists archived MMPs, projects, and visits. Admins can restore items |
| **Who Can Access** | Admin, Supervisor, FOM |
| **Connected Pages** | MMP, Projects, Site Visits |
| **Database Tables** | All tables with archive flag |
| **Key Features** | Archive browsing, restore capability, permanent delete |

---

#### Approval Dashboard (`/approval-dashboard`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Central hub for all pending approvals |
| **How It Works** | Aggregates pending approvals across MMP, site visits, finances, down payments |
| **Who Can Access** | Supervisor, Finance Officer, Admin |
| **Connected Pages** | All approval pages |
| **Database Tables** | All approval-related tables |
| **Key Features** | Unified view, quick actions, priority sorting |

---

#### Coordinator Dashboard (`/coordinator-dashboard`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Coordinator-specific operational view |
| **How It Works** | Shows sites in coordinator's area, pending verifications, team status |
| **Who Can Access** | Coordinator |
| **Connected Pages** | Sites for Verification, Coordinator Sites |
| **Database Tables** | `mmp_files`, `site_visits`, `profiles` |
| **Key Features** | Area-specific data, verification queue, team overview |

---

#### Sites for Verification (`/coordinator/sites-for-verification`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Verify sites assigned to coordinator |
| **How It Works** | Lists sites needing verification. Coordinator confirms GPS, status, readiness |
| **Who Can Access** | Coordinator |
| **Connected Pages** | Coordinator Dashboard, MMP |
| **Database Tables** | `mmp_files`, `site_entries` |
| **Key Features** | Verification checklist, GPS confirmation, bulk actions |

---

#### Coordinator Sites (`/coordinator/sites`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Manage sites in coordinator's area |
| **How It Works** | Full site management for assigned geographic area |
| **Who Can Access** | Coordinator |
| **Connected Pages** | Site Visits, MMP |
| **Database Tables** | `mmp_files`, `site_entries`, `site_visits` |
| **Key Features** | Site listing, status management, visit creation |

---

#### Super Admin Management (`/super-admin-management`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Super admin system controls |
| **How It Works** | Full system configuration, user management, role assignment |
| **Who Can Access** | SuperAdmin only |
| **Connected Pages** | All pages |
| **Database Tables** | All tables |
| **Key Features** | System configuration, user promotion, data management |

---

#### Audit Compliance (`/audit-compliance`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Monitor system compliance and security |
| **How It Works** | Compliance reports, security audits, anomaly detection |
| **Who Can Access** | Admin, ICT |
| **Connected Pages** | Audit Logs |
| **Database Tables** | `audit_logs`, all tables |
| **Key Features** | Compliance scoring, security alerts, recommendations |

---

#### Monitoring Plan (`/monitoring-plan`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Plan and schedule monitoring activities |
| **How It Works** | Create monitoring schedules, assign resources, track progress |
| **Who Can Access** | Project Manager, FOM |
| **Connected Pages** | MMP, Site Visits, Calendar |
| **Database Tables** | `mmp_files`, `projects` |
| **Key Features** | Schedule creation, resource allocation, progress tracking |

---

#### Field Operation Manager (`/field-operation-manager`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | FOM-specific operational dashboard |
| **How It Works** | Overview of all field operations, team performance, pending actions |
| **Who Can Access** | FOM |
| **Connected Pages** | Site Visits, Field Team, Approvals |
| **Database Tables** | `site_visits`, `profiles`, `mmp_files` |
| **Key Features** | Operations overview, team management, approval queue |

---

#### Global Search (`/search`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Search across all system data |
| **How It Works** | Full-text search across users, MMPs, projects, site visits |
| **Who Can Access** | All authenticated users |
| **Connected Pages** | All pages (via search results) |
| **Database Tables** | All searchable tables |
| **Key Features** | Full-text search, result categorization, quick navigation |

---

## 5. Database Tables & Relationships

### 5.1 Core Tables

| Table | Purpose | Key Relationships |
|-------|---------|-------------------|
| `profiles` | User accounts | Links to `user_roles`, `notifications`, `wallets` |
| `user_roles` | Role assignments | Links to `profiles`, `roles` |
| `roles` | Role definitions | Links to `permissions` |
| `permissions` | Permission definitions | Links to `roles` |
| `projects` | Project management | Links to `project_activities`, `project_settings` |
| `project_activities` | Project tasks | Links to `projects` |
| `mmp_files` | Monthly Monitoring Plans | Links to `site_entries`, `profiles` |
| `site_visits` | Field visits | Links to `profiles`, `cost_submissions` |
| `wallets` | Financial accounts | Links to `profiles`, `wallet_transactions` |
| `notifications` | System notifications | Links to `profiles` |
| `audit_logs` | Activity history | Links to `profiles` |

### 5.2 Entity Relationship Diagram

```
profiles (users)
    |
    +-- user_roles -- roles -- permissions
    |
    +-- notifications
    |
    +-- wallets -- wallet_transactions
    |
    +-- dashboard_settings
    |
    +-- user_settings

projects
    |
    +-- project_activities
    |
    +-- project_settings
    |
    +-- mmp_files
            |
            +-- site_entries
                    |
                    +-- site_visits
                            |
                            +-- cost_submissions
```

---

## 6. Workflows & Processes

### 6.1 MMP Workflow

```
Draft -> Under Review -> Verified -> Approved -> In Progress -> Completed -> Archived
```

### 6.2 Site Visit Workflow

```
Planned -> Assigned -> Claimed -> In Progress -> Submitted -> Reviewed -> Approved
```

### 6.3 Financial Approval Workflow

```
Submitted -> Supervisor Review -> Finance Review -> Approved/Rejected -> Processed
```

---

## 7. Communication Features

### 7.1 Video/Voice Calling

**Two Methods Available:**

| Method | Technology | Best For |
|--------|------------|----------|
| Direct Call | WebRTC (peer-to-peer) | Fast 1-on-1 calls, good internet |
| Jitsi Meet | Server-mediated | Reliable calls, poor connectivity |

**Call Flow:**
1. Select contact from team list
2. Click phone (audio) or video icon
3. Choose call method in dialog
4. Recipient receives incoming call popup
5. Accept to join, Reject to decline
6. Call connected with controls (mute, video, end)

### 7.2 Chat Messaging

- Real-time text messaging
- Typing indicators
- Read receipts
- File attachments
- Conversation history

---

## 8. Mobile App Features

### 8.1 Offline Capabilities

**Works Offline:**
- View cached MMPs
- Complete site visits
- Capture GPS locations
- Take photos
- Submit costs (queued)

**Requires Connection:**
- Real-time dashboard
- Chat and calls
- Live location map
- Push notifications

### 8.2 Sync Process

1. Changes saved locally
2. Automatic sync when online
3. Conflict resolution (last-write-wins)
4. Manual "Sync Now" button available

---

## 9. Troubleshooting

### 9.1 Common Issues

| Issue | Solution |
|-------|----------|
| Cannot login | Check email/password, try forgot password |
| Page not loading | Clear cache, check internet |
| Call not connecting | Try Jitsi method, check permissions |
| Data not syncing | Tap Sync Now, check connection |
| Location not working | Enable GPS, grant permissions |

### 9.2 Contact Support

- Email: noreply@pactorg.com
- In-app help section
- System documentation

---

**PACT Command Center**
*Centralized Field Operations Command Center*

Copyright 2025 PACT Consultancy. All rights reserved.
