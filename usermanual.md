# PACT Command Center - Complete Operations Manual

**Version 4.0 | Last Updated: December 2025**

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Architecture](#2-system-architecture)
3. [User Roles & Permissions](#3-user-roles--permissions)
4. [Complete System Inventory](#4-complete-system-inventory)
5. [Site Visit Claiming & Confirmation Process](#5-site-visit-claiming--confirmation-process)
6. [MMP Lifecycle](#6-mmp-lifecycle)
7. [Financial Management System](#7-financial-management-system)
8. [Communication System](#8-communication-system)
9. [Complete Page Reference](#9-complete-page-reference)
10. [Database Architecture](#10-database-architecture)
11. [Mobile App Features](#11-mobile-app-features)
12. [Audit & Compliance](#12-audit--compliance)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Introduction

### 1.1 About PACT Command Center

**PACT Command Center** is the centralized Field Operations Command Center designed for comprehensive management of humanitarian and development field operations. The platform serves as a unified command hub that enables organizations to plan, coordinate, execute, and monitor all field activities from a single integrated interface.

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                         PACT COMMAND CENTER                                   ║
║                  Centralized Field Operations Command Center                  ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   ║
║   │   PLAN      │───►│  APPROVE    │───►│  COORDINATE │───►│   TRACK     │   ║
║   │   (MMPs)    │    │  (Workflow) │    │  (Teams)    │    │  (Monitor)  │   ║
║   └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘   ║
║         │                  │                  │                  │            ║
║         └──────────────────┴──────────────────┴──────────────────┘            ║
║                              ▼                                                ║
║                    ┌─────────────────────┐                                    ║
║                    │  UNIFIED DASHBOARD  │                                    ║
║                    │  Real-Time Control  │                                    ║
║                    └─────────────────────┘                                    ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### 1.2 Core Capabilities

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        PACT COMMAND CENTER CAPABILITIES                    │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐         │
│  │ MMP MANAGEMENT   │  │ SITE VISITS      │  │ TEAM MANAGEMENT  │         │
│  ├──────────────────┤  ├──────────────────┤  ├──────────────────┤         │
│  │ • CSV Upload     │  │ • Dispatch       │  │ • User Profiles  │         │
│  │ • Multi-stage    │  │ • First-Claim    │  │ • Role Assignment│         │
│  │ • Verification   │  │ • GPS Tracking   │  │ • Location Share │         │
│  │ • Approval Flow  │  │ • Photo Capture  │  │ • Performance    │         │
│  │ • Site Entries   │  │ • Cost Submit    │  │ • Hub Structure  │         │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘         │
│                                                                            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐         │
│  │ FINANCIAL        │  │ COMMUNICATIONS   │  │ REPORTING        │         │
│  ├──────────────────┤  ├──────────────────┤  ├──────────────────┤         │
│  │ • Digital Wallets│  │ • Real-time Chat │  │ • Analytics      │         │
│  │ • Down-payments  │  │ • Voice Calls    │  │ • PDF/Excel      │         │
│  │ • Cost Approval  │  │ • Video (Jitsi)  │  │ • Audit Logs     │         │
│  │ • Bank Transfer  │  │ • Push Notify    │  │ • KPI Dashboard  │         │
│  │ • Budget Track   │  │ • Email (IONOS)  │  │ • Custom Reports │         │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘         │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Platform Environments

| Environment | URL | Purpose |
|-------------|-----|---------|
| Production | `app.pactorg.com` | Live production system |
| Staging | Vercel URL | Testing and development |

---

## 2. System Architecture

### 2.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PACT COMMAND CENTER ARCHITECTURE                  │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────┐
                              │   WEB BROWSER   │
                              │  (React App)    │
                              └────────┬────────┘
                                       │
                              ┌────────┴────────┐
                              │  MOBILE APPS    │
                              │ Android / iOS   │
                              │  (Capacitor)    │
                              └────────┬────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         │                             │                             │
         ▼                             ▼                             ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   SUPABASE      │         │   JITSI MEET    │         │   IONOS SMTP    │
│   BACKEND       │         │   (Video Call)  │         │   (Email)       │
├─────────────────┤         └─────────────────┘         └─────────────────┘
│ • PostgreSQL DB │
│ • Auth Service  │                  ▲
│ • Realtime WS   │                  │
│ • Edge Functions│         ┌────────┴────────┐
│ • File Storage  │         │    WebRTC       │
│ • Row Security  │         │  (P2P Calls)    │
└─────────────────┘         └─────────────────┘

                    ┌─────────────────────────────┐
                    │     FIREBASE CLOUD          │
                    │  • Push Notifications       │
                    │  • Crashlytics              │
                    └─────────────────────────────┘
```

### 2.2 Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React 18, TypeScript | UI Framework |
| **Styling** | Tailwind CSS, Shadcn UI | Component Library |
| **State** | TanStack Query, Context API | Data Management |
| **Routing** | React Router DOM v6 | Navigation |
| **Backend** | Supabase (PostgreSQL) | Database & Auth |
| **Real-time** | Supabase Realtime, WebRTC | Live Updates |
| **Mobile** | Capacitor | Native Apps |
| **Email** | IONOS SMTP | Notifications |
| **Video** | Jitsi Meet, WebRTC | Video/Voice Calls |
| **Maps** | Leaflet | GPS & Location |

### 2.3 Data Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              DATA FLOW                                     │
└────────────────────────────────────────────────────────────────────────────┘

USER ACTION                    SYSTEM PROCESS                    DATA STORE
───────────                    ──────────────                    ──────────

  ┌─────────┐                 ┌─────────────────┐               ┌──────────┐
  │ Login   │────────────────►│ Supabase Auth   │──────────────►│ profiles │
  └─────────┘                 │ • Validate      │               │ sessions │
                              │ • Create JWT    │               └──────────┘
                              │ • Set Cookie    │
                              └─────────────────┘

  ┌─────────┐                 ┌─────────────────┐               ┌──────────┐
  │ Upload  │────────────────►│ Parse CSV       │──────────────►│ mmp_files│
  │ MMP     │                 │ Validate Zod    │               │ mmp_site │
  └─────────┘                 │ Insert Records  │               │ _entries │
                              └─────────────────┘               └──────────┘

  ┌─────────┐                 ┌─────────────────┐               ┌──────────┐
  │ Claim   │────────────────►│ RPC Function    │──────────────►│ site_    │
  │ Site    │                 │ • Check Status  │               │ visits   │
  └─────────┘                 │ • Atomic Update │               │ audit_   │
                              │ • Log Event     │               │ logs     │
                              │ • Notify        │               └──────────┘
                              └─────────────────┘

  ┌─────────┐                 ┌─────────────────┐               ┌──────────┐
  │ Submit  │────────────────►│ Validate Costs  │──────────────►│ cost_    │
  │ Costs   │                 │ Create Request  │               │ submiss  │
  └─────────┘                 │ Queue Approval  │               │ wallets  │
                              └─────────────────┘               └──────────┘
```

---

## 3. User Roles & Permissions

### 3.1 Role Hierarchy Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ROLE HIERARCHY                                    │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────┐
                              │   SUPERADMIN    │
                              │  (Full Control) │
                              └────────┬────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
              ▼                        ▼                        ▼
    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
    │     ADMIN       │    │ SENIOR OPS LEAD │    │   ICT/TECH      │
    │ (User Mgmt)     │    │ (Budget Override)│    │ (System Maint)  │
    └────────┬────────┘    └────────┬────────┘    └─────────────────┘
             │                      │
    ┌────────┴────────┐    ┌────────┴────────────────────┐
    │                 │    │                              │
    ▼                 ▼    ▼                              ▼
┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ PROJECT  │  │  FINANCIAL   │  │    FIELD     │  │    DATA      │
│ MANAGER  │  │    ADMIN     │  │   OPERATION  │  │   ANALYST    │
│          │  │              │  │   MANAGER    │  │              │
└────┬─────┘  └──────┬───────┘  └──────┬───────┘  └──────────────┘
     │               │                 │
     │               │    ┌────────────┴────────────┐
     │               │    │                         │
     ▼               ▼    ▼                         ▼
┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ REVIEWER │  │   FINANCE    │  │  SUPERVISOR  │  │    STATE     │
│          │  │   OFFICER    │  │              │  │ COORDINATOR  │
└──────────┘  └──────────────┘  └──────┬───────┘  └──────┬───────┘
                                       │                 │
                                       └────────┬────────┘
                                                │
                                                ▼
                                       ┌──────────────┐
                                       │    DATA      │
                                       │  COLLECTOR   │
                                       │ (Field Team) │
                                       └──────────────┘
```

### 3.2 Complete Role Definitions

| Role | ID | Category | Description | Key Permissions |
|------|-----|----------|-------------|-----------------|
| **SuperAdmin** | `superadmin` | Administrative | Complete system control with all permissions | All resources, all actions, system config |
| **Admin** | `admin` | Administrative | User and role management | Users CRUD, roles assign, settings |
| **Project Manager** | `project_manager` | Administrative | Full project oversight with budget approval and team coordination | Projects CRUD/approve, MMP approve, finances approve, wallets approve |
| **Field Operation Manager** | `fom` | Field | Field operations leadership managing site visits and team coordination | Site visits CRUD/approve, MMP update, team management |
| **Senior Operations Lead** | `senior_operations_lead` | Administrative | Senior leadership with budget override authority for restricted transactions | Budget override, final approvals, wallet override |
| **Supervisor** | `field_supervisor` | Field | Team supervision managing data collectors and reviewing submissions | Site visits assign/update, MMP update, submissions review |
| **State Coordinator** | `state_coordinator` | Field | State-level activity coordination managing site visits and work assignments | Site visits CRUD/assign, MMP update, state-level monitoring |
| **Finance Officer** | `finance_officer` | Financial | Financial operations handling payments and expense approvals | Finances CRUD/approve, reports, down-payments |
| **Data Collector** | `data_collector` | Field | Field data collection executing site visits and submitting costs | Site visits claim/complete, costs submit, photos upload |
| **ICT/Technical** | `ict` | Technical | Technical support maintaining system and resolving issues | Users update, settings, audit logs, system config |
| **Reviewer** | `reviewer` | Administrative | Quality assurance reviewing data and submissions | Read-only access, data validation, compliance review |
| **Data Analyst** | `data_analyst` | Technical | Data analysis generating reports and insights | Reports read/create, data export, analytics |

### 3.3 Permission Matrix

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PERMISSION MATRIX                                         │
├─────────────────┬───────┬───────┬───────┬───────┬─────────┬────────┬─────────┬────────┤
│ Resource        │Create │ Read  │Update │Delete │ Approve │ Assign │Override │Archive │
├─────────────────┼───────┼───────┼───────┼───────┼─────────┼────────┼─────────┼────────┤
│ users           │   C   │   R   │   U   │   D   │    -    │   A    │    -    │   -    │
│ roles           │   C   │   R   │   U   │   D   │    -    │   A    │    -    │   -    │
│ projects        │   C   │   R   │   U   │   D   │   AP    │   A    │    -    │  AR    │
│ mmp             │   C   │   R   │   U   │   D   │   AP    │   A    │    -    │   -    │
│ site_visits     │   C   │   R   │   U   │   D   │   AP    │   A    │    -    │   -    │
│ finances        │   C   │   R   │   U   │   -   │   AP    │   -    │   OV    │   -    │
│ wallets         │   -   │   R   │   -   │   -   │   AP    │   -    │   OV    │   -    │
│ reports         │   C   │   R   │   -   │   -   │    -    │   -    │    -    │   -    │
│ audit_logs      │   -   │   R   │   -   │   -   │    -    │   -    │    -    │   -    │
│ settings        │   -   │   R   │   U   │   -   │    -    │   -    │    -    │   -    │
└─────────────────┴───────┴───────┴───────┴───────┴─────────┴────────┴─────────┴────────┘
```

---

## 4. Complete System Inventory

### 4.1 All System Pages

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        COMPLETE PAGE INVENTORY                             │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  PUBLIC PAGES (6)                                                          │
│  ├── /                          Landing Page                               │
│  ├── /auth                      Login/Authentication                       │
│  ├── /register                  User Registration                          │
│  ├── /forgot-password           Password Recovery                          │
│  ├── /reset-password            Password Reset                             │
│  └── /public-docs               Public Documentation                       │
│                                                                            │
│  DASHBOARD & OVERVIEW (3)                                                  │
│  ├── /dashboard                 Main Command Center                        │
│  ├── /approval-dashboard        Approval Queue Dashboard                   │
│  └── /calendar                  Calendar View                              │
│                                                                            │
│  MMP MANAGEMENT (8)                                                        │
│  ├── /mmp                       MMP List                                   │
│  ├── /mmp/upload                MMP Upload                                 │
│  ├── /mmp/:id                   MMP Detail                                 │
│  ├── /mmp/:id/edit              Edit MMP                                   │
│  ├── /mmp/:id/verify            MMP Verification                           │
│  ├── /mmp/:id/detailed-verify   Detailed MMP Verification                  │
│  ├── /mmp-management            MMP Management Console                     │
│  └── /monitoring-plan           Monitoring Plan View                       │
│                                                                            │
│  SITE VISITS (8)                                                           │
│  ├── /site-visits               Site Visits List                           │
│  ├── /site-visits/:id           Site Visit Detail                          │
│  ├── /site-visits/:id/edit      Edit Site Visit                            │
│  ├── /site-visits/create        Create Site Visit                          │
│  ├── /site-visits/create-mmp    Create from MMP                            │
│  ├── /site-visits/urgent        Create Urgent Visit                        │
│  ├── /coordinator/sites         Coordinator Sites View                     │
│  └── /tracker-preparation       Tracker Preparation Plan                   │
│                                                                            │
│  PROJECTS (5)                                                              │
│  ├── /projects                  Projects List                              │
│  ├── /projects/:id              Project Detail                             │
│  ├── /projects/:id/edit         Edit Project                               │
│  ├── /projects/create           Create Project                             │
│  └── /projects/:id/team         Team Management                            │
│                                                                            │
│  FINANCIAL (9)                                                             │
│  ├── /finance                   Finance Dashboard                          │
│  ├── /finance-approval          Finance Approval Queue                     │
│  ├── /financial-operations      Financial Operations                       │
│  ├── /budget                    Budget Management                          │
│  ├── /cost-submission           Cost Submission                            │
│  ├── /down-payment-approval     Down Payment Approval                      │
│  ├── /withdrawal-approval       Withdrawal Approval                        │
│  ├── /wallet                    Wallet Management                          │
│  └── /wallet-reports            Wallet Reports                             │
│                                                                            │
│  USER & TEAM MANAGEMENT (6)                                                │
│  ├── /users                     Users List                                 │
│  ├── /users/:id                 User Detail                                │
│  ├── /role-management           Role Management                            │
│  ├── /field-team                Field Team Management                      │
│  ├── /review-assign             Review & Assign Coordinators               │
│  └── /hub-operations            Hub Operations                             │
│                                                                            │
│  COMMUNICATION (4)                                                         │
│  ├── /chat                      Real-time Chat                             │
│  ├── /calls                     Voice/Video Calls                          │
│  ├── /notifications             Notification Center                        │
│  └── /email-tracking            Email Tracking                             │
│                                                                            │
│  REPORTS & ANALYTICS (4)                                                   │
│  ├── /reports                   Reports Dashboard                          │
│  ├── /audit-logs                Audit Logs                                 │
│  ├── /audit-compliance          Compliance Dashboard                       │
│  └── /login-analytics           Login Analytics                            │
│                                                                            │
│  ADMINISTRATION (8)                                                        │
│  ├── /settings                  System Settings                            │
│  ├── /documents                 Document Management                        │
│  ├── /signatures                Digital Signatures                         │
│  ├── /classifications           Classification Management                  │
│  ├── /classification-fees       Classification Fee Management              │
│  ├── /data-visibility           Data Visibility Settings                   │
│  ├── /advanced-map              Advanced Map View                          │
│  └── /archive                   Archive Management                         │
│                                                                            │
│  ADMIN-ONLY PAGES (3)                                                      │
│  ├── /admin-wallets             Admin Wallet Management                    │
│  ├── /admin-wallets/:id         Admin Wallet Detail                        │
│  └── /supervisor-approvals      Supervisor Approvals                       │
│                                                                            │
│  MOBILE-SPECIFIC (1)                                                       │
│  └── /demo-data-collector       Demo Data Collector View                   │
│                                                                            │
│  TOTAL ROUTES: ~65 (based on App.tsx router configuration)                 │
│  SOURCE: src/pages/ directory contains 89 page component files             │
└────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 All System Components

```
┌────────────────────────────────────────────────────────────────────────────┐
│        COMPONENT INVENTORY (Verified via: find src/components -name *.tsx) │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  SITE VISIT COMPONENTS (src/components/site-visit/ - 32 files)             │
│  ├── ClaimSiteButton.tsx        First-claim via RPC: claim_site_visit      │
│  ├── AcceptSiteButton.tsx       Accept via RPC: claim_site_visit           │
│  ├── ConfirmationAcknowledgment Uses: src/utils/confirmationDeadlines.ts   │
│  ├── SmartCollectorSelector.tsx Sorting: online > hub > state > locality   │
│  ├── SiteVisitStats.tsx         Visit statistics with status counts        │
│  ├── SiteVisitCard.tsx          Visit card with action buttons             │
│  ├── SiteVisitCosts.tsx         Cost breakdown display                     │
│  ├── StartVisitDialog.tsx       GPS capture on visit start                 │
│  ├── VisitReportDialog.tsx      Report submission form                     │
│  ├── SiteVisitAuditTrail.tsx    Audit log viewer                           │
│  ├── AssignmentMap.tsx          Leaflet map for assignments                │
│  ├── NearestEnumeratorsCard.tsx GPS proximity matching                     │
│  ├── BatchConfirmation.tsx      Bulk confirmation actions                  │
│  ├── EditSiteEntryForm.tsx      Site entry editing                         │
│  ├── RequestDownPaymentButton   Down-payment request trigger               │
│  └── (17 more files - run ls src/components/site-visit for full list)     │
│                                                                            │
│  MMP COMPONENTS (src/components/mmp/ + root level MMP*.tsx)                │
│  ├── MMPStageIndicator.tsx      Stage: draft/submitted/approved/active     │
│  ├── MMPApprovalWorkflow.tsx    Multi-tier approval UI                     │
│  ├── MMPVersionHistory.tsx      Version diff tracking                      │
│  ├── MMPComprehensiveVerif.tsx  Full verification checklist                │
│  ├── MMPPermitVerification.tsx  Permit document verification               │
│  └── (Related files in src/pages/mmp/ directory)                          │
│                                                                            │
│  FINANCIAL COMPONENTS                                                      │
│  ├── src/components/wallet/     Wallet cards, transactions, history        │
│  ├── src/components/finance/    Finance dashboards, approval lists         │
│  ├── src/components/cost-submission/  Cost forms, receipt upload           │
│  └── src/components/downPayment/ Down-payment request workflows            │
│                                                                            │
│  COMMUNICATION COMPONENTS                                                  │
│  ├── src/components/chat/       ChatWindow, MessageList, ChatInput         │
│  ├── src/components/calls/      JitsiCallModal, IncomingJitsiCall          │
│  ├── src/components/notification-center/  NotificationList, filters        │
│  └── src/components/notifications/  Toast, popup, badge components         │
│                                                                            │
│  UI COMPONENTS (src/components/ui/ - Shadcn primitives)                    │
│  └── 50+ Shadcn UI base components (button, card, dialog, etc.)           │
│                                                                            │
│  TOTAL: 465 component files (verified via find command)                    │
└────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 All System Services

```
┌────────────────────────────────────────────────────────────────────────────┐
│      SERVICE INVENTORY (21 files in src/services/ - verified via find)    │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  CORE SERVICES (Location: src/services/)                                   │
│  ├── ChatService.ts             Real-time messaging via Supabase Realtime  │
│  ├── NotificationService.ts     Push & popup notifications                 │
│  ├── NotificationTriggerService.ts  Automated notification triggers        │
│  ├── NotificationSoundService.ts    Audio notification handling            │
│  ├── FCMService.ts              Firebase Cloud Messaging setup             │
│  ├── FCMMessagingService.ts     FCM token management                       │
│  │                                                                         │
│  COMMUNICATION SERVICES                                                    │
│  ├── WebRTCService.ts           P2P voice/video via RTCPeerConnection      │
│  ├── JitsiMeetService.ts        Jitsi video conferencing integration       │
│  ├── email-notification.service.ts  Email via IONOS SMTP                   │
│  ├── otp-delivery.service.ts    OTP code delivery (email/SMS)              │
│  │                                                                         │
│  FINANCIAL SERVICES                                                        │
│  ├── budget-notification.service.ts  80% utilization alerts               │
│  ├── budget-restriction.service.ts   Spending limit enforcement           │
│  ├── task-budget.service.ts     Task-level budget tracking (CPI/SPI)       │
│  ├── auto-release.service.ts    Auto-release unconfirmed claims            │
│  │                                                                         │
│  REPORTING SERVICES                                                        │
│  ├── reporting.service.ts       PDF/Excel report generation                │
│  ├── scheduled-reports.service.ts  Automated report scheduling             │
│  │                                                                         │
│  SECURITY SERVICES                                                         │
│  ├── signature.service.ts       Digital signatures (SHA-256 hashing)       │
│  ├── verification-enforcement.service.ts  Verification rule engine        │
│  │                                                                         │
│  UTILITY SERVICES                                                          │
│  ├── document-index.service.ts  Document search indexing                   │
│  ├── kpi-definitions.ts         KPI calculation definitions                │
│  └── offline-queue.ts           IndexedDB offline sync queue               │
│                                                                            │
│  RELATED UTILITY FILES:                                                    │
│  └── src/utils/confirmationDeadlines.ts  Deadline calculation logic        │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Site Visit Claiming & Confirmation Process

### 5.1 Complete Site Visit Lifecycle Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE SITE VISIT LIFECYCLE                            │
└─────────────────────────────────────────────────────────────────────────────┘

 PHASE 1: PLANNING                PHASE 2: DISPATCH              PHASE 3: EXECUTION
 ─────────────────                ─────────────────              ─────────────────

┌──────────────┐               ┌──────────────┐               ┌──────────────┐
│  MMP CREATED │               │  DISPATCHED  │               │   CLAIMED    │
│   (Draft)    │───────────────│  (Available) │───────────────│  (Assigned)  │
└──────────────┘               └──────────────┘               └──────────────┘
       │                              │                              │
       ▼                              ▼                              ▼
┌──────────────┐               ┌──────────────┐               ┌──────────────┐
│ MMP APPROVED │               │ FIRST-CLAIM  │               │ CONFIRMATION │
│   (Active)   │               │   WINDOW     │               │  REQUIRED    │
└──────────────┘               │  OPENS       │               │ (2 days pre) │
       │                       └──────────────┘               └──────────────┘
       ▼                              │                              │
┌──────────────┐               ┌──────────────┐               ┌──────────────┐
│ SITES        │               │ COLLECTOR    │               │  CONFIRMED   │
│ GENERATED    │───────────────│ CLAIMS SITE  │               │  (Locked)    │
└──────────────┘               └──────────────┘               └──────────────┘
                                                                     │
                                                                     ▼
 PHASE 4: COMPLETION              PHASE 5: REVIEW              PHASE 6: PAYMENT
 ───────────────────              ───────────────              ────────────────

┌──────────────┐               ┌──────────────┐               ┌──────────────┐
│ VISIT START  │               │  SUBMITTED   │               │   PAYMENT    │
│ (GPS Check)  │───────────────│ (For Review) │───────────────│  APPROVED    │
└──────────────┘               └──────────────┘               └──────────────┘
       │                              │                              │
       ▼                              ▼                              ▼
┌──────────────┐               ┌──────────────┐               ┌──────────────┐
│ DATA CAPTURE │               │   REVIEWED   │               │   PAYMENT    │
│ GPS + Photos │               │ (Validated)  │               │  PROCESSED   │
└──────────────┘               └──────────────┘               └──────────────┘
       │                              │                              │
       ▼                              ▼                              ▼
┌──────────────┐               ┌──────────────┐               ┌──────────────┐
│ VISIT END    │               │   APPROVED   │               │  COMPLETED   │
│ (Complete)   │               │   (Final)    │               │  (Archived)  │
└──────────────┘               └──────────────┘               └──────────────┘
```

### 5.2 First-Claim Dispatch System

**Implementation References:**
- Claim Button: `src/components/site-visit/ClaimSiteButton.tsx`
- Accept Button: `src/components/site-visit/AcceptSiteButton.tsx`
- Database RPC: `claim_site_visit` (Supabase stored procedure)
- Deadline Logic: `src/utils/confirmationDeadlines.ts`
- Confirmation UI: `src/components/site-visit/ConfirmationAcknowledgment.tsx`

The first-claim dispatch system ensures fair and efficient distribution of site visits to data collectors.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      FIRST-CLAIM DISPATCH SYSTEM                            │
└─────────────────────────────────────────────────────────────────────────────┘

                          ┌─────────────────────┐
                          │   SITE DISPATCHED   │
                          │  Status: Available  │
                          └──────────┬──────────┘
                                     │
                          ┌──────────▼──────────┐
                          │  VISIBLE TO ALL     │
                          │  ELIGIBLE COLLECTORS │
                          │  (Based on Location) │
                          └──────────┬──────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
              ▼                      ▼                      ▼
    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
    │  COLLECTOR A    │    │  COLLECTOR B    │    │  COLLECTOR C    │
    │  Sees Site      │    │  Sees Site      │    │  Sees Site      │
    │  Can Claim      │    │  Can Claim      │    │  Can Claim      │
    └────────┬────────┘    └────────┬────────┘    └────────┬────────┘
             │                      │                      │
             │    ╔═══════════════════════════════════╗    │
             │    ║     FIRST CLICK WINS!             ║    │
             └───►║  Atomic Database Transaction      ║◄───┘
                  ║  Only ONE collector succeeds      ║
                  ╚═══════════════╤═══════════════════╝
                                  │
                                  ▼
                      ┌─────────────────────┐
                      │   CLAIM SUCCESSFUL  │
                      │  Status: Assigned   │
                      │  AssignedTo: User A │
                      └─────────────────────┘
                                  │
                      ┌───────────┴───────────┐
                      │                       │
                      ▼                       ▼
            ┌─────────────────┐     ┌─────────────────┐
            │ COLLECTOR A     │     │ COLLECTORS B,C  │
            │ • Site Assigned │     │ • Site Hidden   │
            │ • Fee Calculated│     │ • Cannot Claim  │
            │ • Deadline Set  │     │ • Find Other    │
            └─────────────────┘     └─────────────────┘
```

### 5.3 Claim Eligibility Rules

**Implementation:** See `ClaimSiteButton.tsx` lines 64-121 for the complete eligibility logic.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CLAIM ELIGIBILITY CHECKS                             │
└─────────────────────────────────────────────────────────────────────────────┘

 CHECK 1: GEOGRAPHIC MATCH                    CHECK 2: CLASSIFICATION
 ────────────────────────                     ───────────────────────

 ┌─────────────────────────┐                  ┌─────────────────────────┐
 │   User Profile          │                  │   Classification Level  │
 │   ├── Hub: Khartoum     │                  │   ├── User: Level 3     │
 │   ├── State: Kassala    │                  │   │                     │
 │   └── Locality: Aroma   │                  │   Site Requirement:     │
 └────────────┬────────────┘                  │   └── Min Level: 2      │
              │                               └────────────┬────────────┘
              ▼                                            │
 ┌─────────────────────────┐                               ▼
 │   Site Location         │                  ┌─────────────────────────┐
 │   ├── State: Kassala    │ ──► MATCH? ◄──  │   Level 3 >= Level 2    │
 │   └── Locality: Aroma   │                  │   ✓ CLASSIFICATION OK   │
 └─────────────────────────┘                  └─────────────────────────┘
              │
              ▼
 ┌─────────────────────────┐
 │   State: Kassala = ✓    │
 │   Locality: Aroma = ✓   │
 │   ✓ LOCATION MATCH      │
 └─────────────────────────┘

 CHECK 3: SITE STATUS                         CHECK 4: NO PRIOR CLAIM
 ────────────────────                         ─────────────────────────

 ┌─────────────────────────┐                  ┌─────────────────────────┐
 │   Site Status           │                  │   assigned_to Field     │
 │   Must be: "dispatched" │                  │   Must be: NULL or      │
 │                         │                  │   empty                 │
 │   ✗ assigned            │                  │                         │
 │   ✗ accepted            │                  │   If assigned_to has    │
 │   ✗ ongoing             │                  │   value → CANNOT CLAIM  │
 │   ✗ completed           │                  │                         │
 └─────────────────────────┘                  └─────────────────────────┘

                    ALL 4 CHECKS MUST PASS
                    ═══════════════════════
                              │
                              ▼
                    ┌─────────────────┐
                    │  CLAIM ALLOWED  │
                    └─────────────────┘
```

### 5.4 Smart Collector Matching Priority

**Implementation:** See `src/components/site-visit/SmartCollectorSelector.tsx` lines 142-150 for the sorting algorithm.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SMART COLLECTOR MATCHING ALGORITHM                       │
└─────────────────────────────────────────────────────────────────────────────┘

When a Coordinator/Supervisor assigns a site, collectors are ranked by:

PRIORITY 1: ONLINE STATUS (Highest)
══════════════════════════════════════════════════════════════════════════════
│ RANK │ CRITERIA          │ WEIGHT │ DESCRIPTION                            │
├──────┼───────────────────┼────────┼────────────────────────────────────────│
│  1   │ Online Now        │  100%  │ Currently active in the app            │
│  2   │ Recently Active   │   80%  │ Active within last 30 minutes          │
│  3   │ Away              │   50%  │ Last active within 4 hours             │
│  4   │ Offline           │   20%  │ No recent activity                     │
══════════════════════════════════════════════════════════════════════════════

PRIORITY 2: GEOGRAPHIC PROXIMITY
══════════════════════════════════════════════════════════════════════════════
│ RANK │ CRITERIA          │ WEIGHT │ DESCRIPTION                            │
├──────┼───────────────────┼────────┼────────────────────────────────────────│
│  1   │ Same Hub          │  +50   │ Collector assigned to same hub         │
│  2   │ Same State        │  +30   │ Collector in same state                │
│  3   │ Same Locality     │  +20   │ Collector in same locality             │
│  4   │ GPS Distance      │ -1/km  │ Penalize by distance from site         │
══════════════════════════════════════════════════════════════════════════════

PRIORITY 3: WORKLOAD BALANCE
══════════════════════════════════════════════════════════════════════════════
│ RANK │ CRITERIA          │ WEIGHT │ DESCRIPTION                            │
├──────┼───────────────────┼────────┼────────────────────────────────────────│
│  1   │ Current Sites < 3 │  +20   │ Has capacity for more work             │
│  2   │ Current Sites 3-5 │    0   │ Normal workload                        │
│  3   │ Current Sites > 5 │  -20   │ Already heavily loaded                 │
══════════════════════════════════════════════════════════════════════════════

                    FINAL SCORE CALCULATION
                    ═══════════════════════
    
    Score = (Online Weight) + (Geo Proximity) + (Workload Balance)
    
    Collectors sorted by Score (highest first)
    Coordinator sees ranked list with visual indicators
```

### 5.5 Confirmation Timeline & Deadlines

**Implementation:** See `src/utils/confirmationDeadlines.ts` for the deadline calculation functions:
- `calculateConfirmationDeadlines()` - Sets confirmation_deadline (2 days pre) and autorelease_at (1 day pre)
- `getReminderTimes()` - Returns reminder timestamps
- `shouldAutoRelease()` - Checks if auto-release should trigger

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONFIRMATION TIMELINE & DEADLINES                        │
└─────────────────────────────────────────────────────────────────────────────┘

SCHEDULED VISIT DATE: January 15, 2025
═══════════════════════════════════════════════════════════════════════════════

     CLAIM         REMINDER 1      REMINDER 2      CONFIRMATION    AUTO-RELEASE    VISIT
     DATE          (4 days pre)    (3 days pre)    DEADLINE        TRIGGER         DATE
       │               │               │           (2 days pre)    (1 day pre)       │
       ▼               ▼               ▼               ▼               ▼              ▼
 ──────┼───────────────┼───────────────┼───────────────┼───────────────┼──────────────┼──────
       │               │               │               │               │              │
   Jan 10          Jan 11          Jan 12          Jan 13          Jan 14        Jan 15
                                                       │               │
                                                       │               │
                                              ┌────────┴────────┐     │
                                              │ CONFIRMATION    │     │
                                              │ REQUIRED HERE   │     │
                                              │                 │     │
                                              │ If NOT confirmed│     │
                                              │ by Jan 13:      │────►│
                                              └─────────────────┘     │
                                                                      ▼
                                                            ┌─────────────────┐
                                                            │  AUTO-RELEASE   │
                                                            │  Site returned  │
                                                            │  to pool for    │
                                                            │  re-claiming    │
                                                            └─────────────────┘

TIMELINE BREAKDOWN:
═══════════════════════════════════════════════════════════════════════════════

│ STAGE              │ TIMING              │ ACTION REQUIRED                    │
├────────────────────┼─────────────────────┼────────────────────────────────────│
│ Site Claimed       │ Any time before     │ Collector clicks "Claim"           │
│                    │ confirmation window │                                    │
├────────────────────┼─────────────────────┼────────────────────────────────────│
│ Confirmation       │ 2 days before visit │ Collector must click "Confirm"     │
│ Deadline           │                     │ to acknowledge assignment          │
├────────────────────┼─────────────────────┼────────────────────────────────────│
│ Auto-Release       │ 1 day before visit  │ If not confirmed, site is          │
│ Trigger            │                     │ automatically released             │
├────────────────────┼─────────────────────┼────────────────────────────────────│
│ Visit Execution    │ Scheduled date      │ Collector performs field visit     │
│                    │                     │                                    │
═══════════════════════════════════════════════════════════════════════════════

CONFIRMATION STATUS VALUES:
───────────────────────────
• pending     - Awaiting confirmation from collector
• confirmed   - Collector confirmed, site locked
• expired     - Deadline passed without confirmation
• released    - Site auto-released back to pool
```

### 5.6 Site Visit Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       SITE VISIT EXECUTION FLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

STEP 1: START VISIT
════════════════════════════════════════════════════════════════════════════

   ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
   │  COLLECTOR      │      │   GPS CHECK     │      │   STATUS        │
   │  Clicks "Start" │─────►│  Capture        │─────►│  → "ongoing"    │
   │                 │      │  Location       │      │                 │
   └─────────────────┘      └─────────────────┘      └─────────────────┘
                                    │
                                    ▼
                            ┌───────────────────────────────────────────┐
                            │  RECORDED DATA:                           │
                            │  • started_at: timestamp                  │
                            │  • start_latitude: GPS coordinates        │
                            │  • start_longitude: GPS coordinates       │
                            │  • start_accuracy: meters                 │
                            └───────────────────────────────────────────┘

STEP 2: DATA COLLECTION
════════════════════════════════════════════════════════════════════════════

   ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
   │  TAKE PHOTOS    │      │  FILL FORMS     │      │  CAPTURE OTP    │
   │  • Site Photos  │      │  • Survey Data  │      │  • Verification │
   │  • Before/After │      │  • Observations │      │  • Signature    │
   └────────┬────────┘      └────────┬────────┘      └────────┬────────┘
            │                        │                        │
            └────────────────────────┼────────────────────────┘
                                     │
                                     ▼
                            ┌───────────────────────────────────────────┐
                            │  STORED IN visit_data JSON:               │
                            │  • photos: [array of image URLs]          │
                            │  • formResponses: {key: value}            │
                            │  • otp_verified: boolean                  │
                            │  • otp_code: string (hashed)              │
                            └───────────────────────────────────────────┘

STEP 3: COMPLETE VISIT
════════════════════════════════════════════════════════════════════════════

   ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
   │  COLLECTOR      │      │   GPS CHECK     │      │   STATUS        │
   │  Clicks "End"   │─────►│  End Location   │─────►│  → "completed"  │
   │                 │      │  Capture        │      │                 │
   └─────────────────┘      └─────────────────┘      └─────────────────┘
                                    │
                                    ▼
                            ┌───────────────────────────────────────────┐
                            │  RECORDED DATA:                           │
                            │  • completed_at: timestamp                │
                            │  • end_latitude: GPS coordinates          │
                            │  • end_longitude: GPS coordinates         │
                            │  • end_accuracy: meters                   │
                            │  • duration_minutes: calculated           │
                            └───────────────────────────────────────────┘

STEP 4: COST SUBMISSION
════════════════════════════════════════════════════════════════════════════

   ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
   │  ENTER COSTS    │      │  ATTACH         │      │   SUBMIT FOR    │
   │  • Transport    │─────►│  RECEIPTS       │─────►│   APPROVAL      │
   │  • Meals        │      │  (Photos)       │      │                 │
   └─────────────────┘      └─────────────────┘      └─────────────────┘
                                                             │
                                                             ▼
                            ┌───────────────────────────────────────────┐
                            │  APPROVAL FLOW:                           │
                            │  1. Supervisor Review (2hr SLA)           │
                            │  2. Finance Review (12hr SLA)             │
                            │  3. FOM Final Approval (24hr SLA)         │
                            │  4. Payment Processed                     │
                            └───────────────────────────────────────────┘
```

### 5.7 Site Status Transitions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       SITE STATUS STATE MACHINE                             │
└─────────────────────────────────────────────────────────────────────────────┘

                                ┌──────────────┐
                                │    DRAFT     │
                                │  (Created)   │
                                └──────┬───────┘
                                       │ MMP Approved
                                       ▼
                                ┌──────────────┐
                        ┌───────│  DISPATCHED  │───────┐
                        │       │ (Available)  │       │
                        │       └──────┬───────┘       │
                        │              │               │
                        │         Claimed              │ Assigned by
                        │              │               │ Coordinator
                        │              ▼               │
                        │       ┌──────────────┐       │
                        │       │   ASSIGNED   │◄──────┘
                        │       │  (Claimed)   │
                        │       └──────┬───────┘
                        │              │
                        │         Accepted
                        │              │
                        │              ▼
                        │       ┌──────────────┐
                        │       │   ACCEPTED   │
                        │       │ (Confirmed)  │
                        │       └──────┬───────┘
                        │              │
                 Auto-  │         Visit Started
                Release │              │
                        │              ▼
                        │       ┌──────────────┐
                        │       │   ONGOING    │
                        │       │ (In Progress)│
                        │       └──────┬───────┘
                        │              │
                        │         Visit Ended
                        │              │
                        │              ▼
                        │       ┌──────────────┐
                        └──────►│  COMPLETED   │
                                │  (Finished)  │
                                └──────┬───────┘
                                       │
                                  Archived
                                       │
                                       ▼
                                ┌──────────────┐
                                │   ARCHIVED   │
                                │  (Closed)    │
                                └──────────────┘

SPECIAL TRANSITIONS:
───────────────────────────────────────────────────────────────────────────────
• dispatched → dispatched : Auto-release if not confirmed (returns to pool)
• assigned → dispatched   : Manual release by supervisor
• ongoing → assigned      : Visit cancelled (rare, requires approval)
• completed → rejected    : Failed quality review (requires re-visit)
───────────────────────────────────────────────────────────────────────────────
```

---

## 6. Sites Registry & Indexing System

### 6.1 Sites Registry Overview

**Implementation Files:**
- Registry Matcher: `src/utils/sitesRegistryMatcher.ts`
- MMP Upload Logic: `src/utils/mmpFileUpload.ts`
- Hub Operations Page: `src/pages/HubOperations.tsx`
- Database Table: `sites_registry`

The Sites Registry is the **master database of all sites** where field visits can occur. It serves as the single source of truth for site information, GPS coordinates, and historical visit data.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SITES REGISTRY ARCHITECTURE                         │
└─────────────────────────────────────────────────────────────────────────────┘

                           ┌───────────────────────────────────┐
                           │        SITES REGISTRY             │
                           │     (Master Site Database)        │
                           │                                   │
                           │  • site_code (unique identifier)  │
                           │  • site_name                      │
                           │  • state_name / state_id          │
                           │  • locality_name / locality_id    │
                           │  • gps_latitude / gps_longitude   │
                           │  • hub_name                       │
                           │  • activity_type                  │
                           │  • mmp_count (usage counter)      │
                           │  • status (registered/verified)   │
                           └───────────────┬───────────────────┘
                                           │
                ┌──────────────────────────┼──────────────────────────┐
                │                          │                          │
                ▼                          ▼                          ▼
    ┌───────────────────┐      ┌───────────────────┐      ┌───────────────────┐
    │  MMP Site Entry   │      │  MMP Site Entry   │      │  MMP Site Entry   │
    │  (January 2025)   │      │  (February 2025)  │      │  (March 2025)     │
    │                   │      │                   │      │                   │
    │ registry_site_id ─┼──────│ registry_site_id ─┼──────│ registry_site_id ─┤
    │  ↑ Links back to  │      │  ↑ Same site!     │      │  ↑ Same site!     │
    │    master record  │      │    Reused ID      │      │    Reused ID      │
    └───────────────────┘      └───────────────────┘      └───────────────────┘
```

### 6.2 Duplicate Site Detection & Prevention

When an MMP file is uploaded, the system checks for duplicates **within the same month** to prevent monitoring the same site twice.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DUPLICATE DETECTION WORKFLOW                            │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────┐
                    │     CSV FILE UPLOADED           │
                    │     Month: "December 2025"      │
                    │     Sites: 50 entries           │
                    └───────────────┬─────────────────┘
                                    │
                                    ▼
              ┌─────────────────────────────────────────────┐
              │         CHECK 1: SAME-MONTH DUPLICATES      │
              │                                             │
              │  Query existing MMPs for December 2025      │
              │  Get all mmp_site_entries from those MMPs   │
              └─────────────────────┬───────────────────────┘
                                    │
                  ┌─────────────────┴─────────────────┐
                  │                                   │
                  ▼                                   ▼
    ┌─────────────────────────┐         ┌─────────────────────────┐
    │   MATCH BY SITE_CODE    │         │  MATCH BY COMPOSITE KEY │
    │                         │         │                         │
    │  Exact site_code match  │   OR    │  site_name + state +    │
    │  (highest priority)     │         │  locality combination   │
    └───────────────┬─────────┘         └───────────────┬─────────┘
                    │                                   │
                    └─────────────┬─────────────────────┘
                                  │
                    ┌─────────────┴─────────────────┐
                    │                               │
                    ▼                               ▼
        ┌───────────────────┐           ┌───────────────────┐
        │   DUPLICATE       │           │   NO DUPLICATE    │
        │   FOUND           │           │                   │
        │                   │           │   Proceed with    │
        │   BLOCK UPLOAD    │           │   registry lookup │
        │   Show error:     │           │                   │
        │   "Site already   │           └───────────────────┘
        │    exists for     │
        │    December 2025" │
        └───────────────────┘

DUPLICATE DETECTION CRITERIA:
═══════════════════════════════════════════════════════════════════════════════
│ Priority │ Match Type           │ Condition                                  │
├──────────┼──────────────────────┼────────────────────────────────────────────│
│    1     │ Site Code Match      │ site_code matches (case-insensitive)       │
│    2     │ Composite Key Match  │ site_name + state + locality all match     │
═══════════════════════════════════════════════════════════════════════════════
```

### 6.3 Site Index Assignment Logic

When sites are uploaded, the system determines whether to **create new registry entries** or **link to existing ones**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SITE INDEX ASSIGNMENT DECISION TREE                      │
└─────────────────────────────────────────────────────────────────────────────┘

                         ┌────────────────────────┐
                         │  FOR EACH SITE IN CSV  │
                         │  Extract: site_code,   │
                         │  site_name, state,     │
                         │  locality              │
                         └───────────┬────────────┘
                                     │
                                     ▼
                    ┌────────────────────────────────────┐
                    │  STEP 1: EXACT CODE MATCH          │
                    │  Does site_code exist in registry? │
                    └────────────────┬───────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
                    ▼                                 ▼
           ┌───────────────┐                ┌───────────────┐
           │     YES       │                │      NO       │
           │               │                │               │
           │  REUSE ID     │                │   CONTINUE    │
           │  Link to      │                │   MATCHING    │
           │  existing     │                │               │
           │  registry     │                └───────┬───────┘
           │  entry        │                        │
           └───────────────┘                        ▼
                                   ┌────────────────────────────────────┐
                                   │  STEP 2: NAME + STATE + LOCALITY   │
                                   │  Does combination exist?           │
                                   └────────────────┬───────────────────┘
                                                    │
                                   ┌────────────────┴────────────────┐
                                   │                                 │
                                   ▼                                 ▼
                          ┌───────────────┐                ┌───────────────┐
                          │     YES       │                │      NO       │
                          │               │                │               │
                          │  REUSE ID     │                │   CONTINUE    │
                          │  Link to      │                │   MATCHING    │
                          │  existing     │                │               │
                          │  registry     │                └───────┬───────┘
                          └───────────────┘                        │
                                                                   ▼
                                                  ┌────────────────────────────┐
                                                  │  STEP 3: NAME + STATE ONLY │
                                                  │  Fallback partial match    │
                                                  └────────────────┬───────────┘
                                                                   │
                                                  ┌────────────────┴────────────┐
                                                  │                             │
                                                  ▼                             ▼
                                         ┌───────────────┐            ┌───────────────┐
                                         │     YES       │            │      NO       │
                                         │               │            │               │
                                         │  REUSE ID     │            │ CREATE NEW    │
                                         │  (may need    │            │ REGISTRY SITE │
                                         │   review)     │            │               │
                                         └───────────────┘            │ Generate code │
                                                                      │ as: ST-LO-    │
                                                                      │ NAM-123456    │
                                                                      └───────────────┘

SUMMARY - SITE INDEX BEHAVIOR:
═══════════════════════════════════════════════════════════════════════════════
│ Scenario                              │ Action                               │
├───────────────────────────────────────┼──────────────────────────────────────│
│ Site exists in registry               │ REUSE existing registry_site_id      │
│                                       │ Increment mmp_count on registry      │
├───────────────────────────────────────┼──────────────────────────────────────│
│ Site NOT in registry                  │ CREATE new registry entry            │
│                                       │ Generate unique site_code            │
│                                       │ Set mmp_count = 1                    │
├───────────────────────────────────────┼──────────────────────────────────────│
│ Same site in same month               │ BLOCK - Duplicate not allowed        │
├───────────────────────────────────────┼──────────────────────────────────────│
│ Same site in different month          │ ALLOWED - Reuse registry, new entry  │
═══════════════════════════════════════════════════════════════════════════════
```

### 6.4 GPS Coordinate Lifecycle

**Implementation Files:**
- GPS Save to Registry: `src/utils/sitesRegistryMatcher.ts` → `saveGPSToRegistry()`
- Location Capture: `src/utils/locationUtils.ts`, `src/utils/gpsMatchingUtils.ts`
- Mobile GPS: `src/components/mobile/MobileSiteVisitComm.tsx`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        GPS COORDINATE LIFECYCLE                              │
└─────────────────────────────────────────────────────────────────────────────┘

PHASE 1: INITIAL UPLOAD (No GPS)
════════════════════════════════════════════════════════════════════════════════

    ┌─────────────────┐          ┌─────────────────┐
    │  CSV UPLOAD     │          │  REGISTRY LOOKUP │
    │  Site: "Aroma   │─────────►│  No GPS coords   │
    │   Health Post"  │          │  gps_latitude:   │
    │  (no GPS data)  │          │    NULL          │
    └─────────────────┘          └─────────────────┘


PHASE 2: FIRST FIELD VISIT (GPS Captured)
════════════════════════════════════════════════════════════════════════════════

    ┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
    │  DATA COLLECTOR │          │  GPS CAPTURE    │          │  SITE VISIT     │
    │  Starts Visit   │─────────►│  at Site        │─────────►│  RECORD         │
    │  at Aroma       │          │  lat: 15.4321   │          │  start_latitude │
    │  Health Post    │          │  lng: 36.1234   │          │  start_longitude│
    └─────────────────┘          └─────────────────┘          └─────────────────┘
                                                                      │
                                                                      ▼
                                                              ┌─────────────────┐
                                                              │  VISIT COMPLETE │
                                                              │                 │
                                                              │  Trigger:       │
                                                              │  saveGPSTo      │
                                                              │  Registry()     │
                                                              └────────┬────────┘
                                                                       │
                                                                       ▼
                                 ┌──────────────────────────────────────────────┐
                                 │           SITES REGISTRY UPDATED             │
                                 │                                              │
                                 │  Site: Aroma Health Post                     │
                                 │  gps_latitude:  15.4321  ← NOW POPULATED!    │
                                 │  gps_longitude: 36.1234  ← NOW POPULATED!    │
                                 │  updated_at: 2025-12-01                      │
                                 └──────────────────────────────────────────────┘


PHASE 3: FUTURE VISITS (GPS Pre-populated)
════════════════════════════════════════════════════════════════════════════════

    ┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
    │  NEW MMP        │          │  REGISTRY MATCH │          │  MMP SITE ENTRY │
    │  January 2026   │─────────►│  registry_site_ │─────────►│  GPS AUTO-      │
    │  Same site:     │          │  id LINKED      │          │  POPULATED!     │
    │  Aroma Health   │          │                 │          │                 │
    └─────────────────┘          └─────────────────┘          └─────────────────┘
                                         │
                                         ▼
                           ┌───────────────────────────────┐
                           │  registry_linkage JSON:       │
                           │  {                            │
                           │    registry_site_id: "...",   │
                           │    gps: {                     │
                           │      latitude: 15.4321,       │
                           │      longitude: 36.1234       │
                           │    }                          │
                           │  }                            │
                           └───────────────────────────────┘

GPS ENRICHMENT RULES:
═══════════════════════════════════════════════════════════════════════════════
│ Match Type      │ Confidence │ Auto-Accept │ GPS Populated                  │
├─────────────────┼────────────┼─────────────┼────────────────────────────────│
│ exact_code      │   100%     │     YES     │ Automatically from registry    │
│ name_location   │    85%     │     NO      │ Requires manual review         │
│ partial_state   │    70%     │     NO      │ Requires manual review         │
│ fuzzy_name      │    50%     │     NO      │ Requires manual review         │
│ not_found       │     0%     │     N/A     │ GPS captured on first visit    │
═══════════════════════════════════════════════════════════════════════════════
```

### 6.5 Registry Linkage Data Structure

Each MMP site entry stores a `registry_linkage` JSON object that tracks the connection to the master registry:

```
REGISTRY_LINKAGE JSON STRUCTURE (stored in mmp_site_entries.additional_data):
═══════════════════════════════════════════════════════════════════════════════

{
  "registry_linkage": {
    // Master Registry Reference
    "registry_site_id": "uuid-of-master-site",
    "registry_site_code": "KS-AR-AHP-123456",
    
    // GPS Coordinates (from registry)
    "gps": {
      "latitude": 15.4321,
      "longitude": 36.1234,
      "accuracy_meters": 5.2
    },
    
    // Administrative Hierarchy
    "state_id": "state-uuid",
    "state_name": "Kassala",
    "locality_id": "locality-uuid",
    "locality_name": "Aroma",
    
    // Original Query (what was searched)
    "query": {
      "site_code": "AHP-001",
      "site_name": "Aroma Health Post",
      "state": "Kassala",
      "locality": "Aroma"
    },
    
    // Match Confidence Info
    "match": {
      "type": "exact_code",
      "confidence": 1.0,
      "confidence_level": "high",
      "rule_applied": "exact_site_code_match",
      "candidates_count": 1,
      "auto_accepted": true,
      "requires_review": false
    },
    
    // Audit Trail
    "audit": {
      "matched_at": "2025-12-01T10:30:00Z",
      "matched_by": "user-uuid",
      "source_workflow": "mmp_upload"
    }
  }
}
```

---

## 7. MMP Lifecycle

### 6.1 MMP Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MMP COMPLETE LIFECYCLE                            │
└─────────────────────────────────────────────────────────────────────────────┘

PHASE 1: CREATION                 PHASE 2: REVIEW                PHASE 3: APPROVAL
──────────────────                ───────────────                ──────────────────

┌──────────────┐              ┌──────────────┐              ┌──────────────┐
│  UPLOAD CSV  │              │   DRAFT      │              │  SUBMITTED   │
│  (Admin/PM)  │──────────────│  (Editable)  │──────────────│  (Pending)   │
└──────────────┘              └──────────────┘              └──────────────┘
       │                             │                             │
       ▼                             ▼                             ▼
┌──────────────┐              ┌──────────────┐              ┌──────────────┐
│  PARSE &     │              │  EDIT SITES  │              │  SUPERVISOR  │
│  VALIDATE    │              │  Add/Remove  │              │  REVIEW      │
└──────────────┘              │  Modify Info │              └──────────────┘
       │                      └──────────────┘                     │
       ▼                                                           ▼
┌──────────────┐                                            ┌──────────────┐
│  CREATE SITE │                                            │    FOM       │
│  ENTRIES     │                                            │  APPROVAL    │
└──────────────┘                                            └──────────────┘
                                                                   │
                                                                   ▼
PHASE 4: EXECUTION                                          ┌──────────────┐
──────────────────                                          │   APPROVED   │
                                                            │   (Active)   │
┌──────────────┐                                            └──────┬───────┘
│  DISPATCH    │◄──────────────────────────────────────────────────┘
│  SITES       │
└──────────────┘
       │
       ▼
┌──────────────┐
│  CLAIM &     │
│  EXECUTE     │
└──────────────┘
       │
       ▼
┌──────────────┐
│  COMPLETE    │
│  ALL VISITS  │
└──────────────┘
       │
       ▼
┌──────────────┐
│   CLOSED     │
│  (Archived)  │
└──────────────┘
```

### 6.2 MMP Stage Definitions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MMP STAGES EXPLAINED                              │
├─────────────────┬───────────────────────────────────────────────────────────┤
│ Stage           │ Description & Actions                                     │
├─────────────────┼───────────────────────────────────────────────────────────┤
│ DRAFT           │ • Initial stage after CSV upload                          │
│                 │ • Sites can be added, edited, or removed                  │
│                 │ • Owner can modify all fields                             │
│                 │ • Not visible to field team                               │
├─────────────────┼───────────────────────────────────────────────────────────┤
│ SUBMITTED       │ • Submitted for approval                                  │
│                 │ • Read-only for creator                                   │
│                 │ • Supervisor can review and comment                       │
│                 │ • Can be returned to DRAFT with notes                     │
├─────────────────┼───────────────────────────────────────────────────────────┤
│ APPROVED        │ • Approved by FOM/Admin                                   │
│                 │ • Sites can be dispatched                                 │
│                 │ • Visible to field team                                   │
│                 │ • Budget locked                                           │
├─────────────────┼───────────────────────────────────────────────────────────┤
│ ACTIVE          │ • Sites being executed                                    │
│                 │ • Real-time progress tracking                             │
│                 │ • Costs being recorded                                    │
├─────────────────┼───────────────────────────────────────────────────────────┤
│ COMPLETED       │ • All sites visited                                       │
│                 │ • Final report generated                                  │
│                 │ • Financial reconciliation pending                        │
├─────────────────┼───────────────────────────────────────────────────────────┤
│ CLOSED          │ • Fully complete and archived                             │
│                 │ • Read-only historical record                             │
│                 │ • Available for reporting                                 │
└─────────────────┴───────────────────────────────────────────────────────────┘
```

---

## 7. Financial Management System

### 7.1 Financial Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FINANCIAL FLOW DIAGRAM                               │
└─────────────────────────────────────────────────────────────────────────────┘

                              PROJECT BUDGET
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
           ┌───────────────┐             ┌───────────────┐
           │ ADMIN WALLET  │             │ TASK BUDGETS  │
           │ (Master Fund) │             │ (Allocated)   │
           └───────┬───────┘             └───────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
┌───────────────┐     ┌───────────────┐
│ DOWN-PAYMENT  │     │ COST          │
│ REQUESTS      │     │ SUBMISSIONS   │
└───────┬───────┘     └───────┬───────┘
        │                     │
        ▼                     ▼
┌───────────────┐     ┌───────────────┐
│ APPROVAL      │     │ APPROVAL      │
│ WORKFLOW      │     │ WORKFLOW      │
│               │     │               │
│ 1. Supervisor │     │ 1. Supervisor │
│ 2. Finance    │     │ 2. Finance    │
│ 3. FOM        │     │ 3. FOM        │
└───────┬───────┘     └───────┬───────┘
        │                     │
        ▼                     ▼
┌───────────────┐     ┌───────────────┐
│ USER WALLET   │     │ USER WALLET   │
│ (Credited)    │     │ (Credited)    │
└───────────────┘     └───────────────┘
        │                     │
        ▼                     ▼
┌───────────────────────────────────────┐
│           BANK OF KHARTOUM            │
│         (Manual Bank Transfer)        │
│                                       │
│  • Receipt entry (manual)             │
│  • Transaction verification           │
│  • Audit logging                      │
└───────────────────────────────────────┘
```

### 7.2 Approval Tiers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MULTI-TIER APPROVAL SYSTEM                           │
└─────────────────────────────────────────────────────────────────────────────┘

TIER 1: SUPERVISOR REVIEW (SLA: 2 hours)
════════════════════════════════════════════════════════════════════════════
│ Approver    │ Threshold   │ Actions                                       │
├─────────────┼─────────────┼───────────────────────────────────────────────│
│ Supervisor  │ Up to       │ • Verify visit completion                     │
│             │ 50,000 SDG  │ • Check receipts attached                     │
│             │             │ • Validate amounts                            │
│             │             │ • Approve / Reject / Request Changes          │
════════════════════════════════════════════════════════════════════════════

TIER 2: FINANCE REVIEW (SLA: 12 hours)
════════════════════════════════════════════════════════════════════════════
│ Approver    │ Threshold   │ Actions                                       │
├─────────────┼─────────────┼───────────────────────────────────────────────│
│ Finance     │ 50,001 -    │ • Budget availability check                   │
│ Officer     │ 200,000 SDG │ • Receipt verification                        │
│             │             │ • Policy compliance                           │
│             │             │ • Approve / Reject / Escalate                 │
════════════════════════════════════════════════════════════════════════════

TIER 3: FOM APPROVAL (SLA: 24 hours)
════════════════════════════════════════════════════════════════════════════
│ Approver    │ Threshold   │ Actions                                       │
├─────────────┼─────────────┼───────────────────────────────────────────────│
│ Field Ops   │ 200,001+    │ • Final approval authority                    │
│ Manager     │ SDG         │ • Override capability                         │
│             │             │ • Escalation handling                         │
│             │             │ • Approve / Reject                            │
════════════════════════════════════════════════════════════════════════════

TIER 4: SENIOR OPS LEAD (Budget Override)
════════════════════════════════════════════════════════════════════════════
│ Approver    │ Threshold   │ Actions                                       │
├─────────────┼─────────────┼───────────────────────────────────────────────│
│ Senior Ops  │ Over-budget │ • Override budget restrictions                │
│ Lead        │ requests    │ • Approve exceptional expenses                │
│             │             │ • Audit trail required                        │
════════════════════════════════════════════════════════════════════════════
```

### 7.3 Enumerator Fee Calculation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ENUMERATOR FEE CALCULATION                             │
└─────────────────────────────────────────────────────────────────────────────┘

COMPONENTS:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│  ENUMERATOR FEE     │  +  │  TRANSPORT BUDGET   │  =  │   TOTAL PAYOUT      │
│  (Based on Level)   │     │  (Site-specific)    │     │                     │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘

CLASSIFICATION LEVELS:
═══════════════════════════════════════════════════════════════════════════════
│ Level │ Name          │ Base Fee (SDG) │ Description                        │
├───────┼───────────────┼────────────────┼────────────────────────────────────│
│   1   │ Basic         │     15,000     │ Standard data collection           │
│   2   │ Intermediate  │     20,000     │ Complex surveys                    │
│   3   │ Advanced      │     25,000     │ Technical assessments              │
│   4   │ Expert        │     30,000     │ Specialized evaluations            │
│   5   │ Senior        │     40,000     │ High-complexity missions           │
═══════════════════════════════════════════════════════════════════════════════

FEE SOURCES (Priority Order):
═══════════════════════════════════════════════════════════════════════════════
1. Classification Fee → Uses classification_fees table
2. Site-Specific Fee  → Uses mmp_site_entries.enumerator_fee
3. MMP Default Fee    → Uses mmp_files.default_fee
4. System Default     → Fallback (15,000 SDG)
═══════════════════════════════════════════════════════════════════════════════
```

---

## 8. Communication System

### 8.1 Communication Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      COMMUNICATION SYSTEM ARCHITECTURE                      │
└─────────────────────────────────────────────────────────────────────────────┘

                         ┌───────────────────┐
                         │   USER DEVICE     │
                         │  (Web / Mobile)   │
                         └─────────┬─────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
         ▼                         ▼                         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   REAL-TIME     │     │   VOICE/VIDEO   │     │    EMAIL        │
│   CHAT          │     │   CALLS         │     │   NOTIFICATIONS │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ Supabase        │     │ WebRTC (P2P)    │     │ IONOS SMTP      │
│ Realtime        │     │ Jitsi Meet      │     │ noreply@        │
│                 │     │ (Server)        │     │ pactorg.com     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                         │                         │
         ▼                         ▼                         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   FEATURES:     │     │   FEATURES:     │     │   FEATURES:     │
│ • 1:1 Chat      │     │ • Voice Call    │     │ • OTP Delivery  │
│ • Group Chat    │     │ • Video Call    │     │ • Notifications │
│ • Typing Ind.   │     │ • Screen Share  │     │ • Alerts        │
│ • Read Receipts │     │ • Call History  │     │ • Reports       │
│ • File Sharing  │     │ • Missed Calls  │     │ • Reminders     │
└─────────────────┘     └─────────────────┘     └─────────────────┘

                    ┌───────────────────────────┐
                    │    PUSH NOTIFICATIONS     │
                    ├───────────────────────────┤
                    │ Firebase Cloud Messaging  │
                    │ (FCM)                     │
                    │                           │
                    │ • Incoming Calls          │
                    │ • New Messages            │
                    │ • Site Updates            │
                    │ • Approval Requests       │
                    │ • Deadline Reminders      │
                    └───────────────────────────┘
```

### 8.2 Notification Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NOTIFICATION TYPES                                  │
├────────────────────┬────────────────────────────────────────────────────────┤
│ Type               │ Description & Actions                                  │
├────────────────────┼────────────────────────────────────────────────────────┤
│ INCOMING_CALL      │ Voice/Video call incoming                              │
│                    │ Actions: [Accept] [Reject]                             │
├────────────────────┼────────────────────────────────────────────────────────┤
│ NEW_MESSAGE        │ New chat message received                              │
│                    │ Actions: [Open Chat] [OK]                              │
├────────────────────┼────────────────────────────────────────────────────────┤
│ SITE_DISPATCHED    │ New site available for claiming                        │
│                    │ Actions: [View Sites] [OK]                             │
├────────────────────┼────────────────────────────────────────────────────────┤
│ SITE_ASSIGNED      │ Site assigned to you                                   │
│                    │ Actions: [View Details] [OK]                           │
├────────────────────┼────────────────────────────────────────────────────────┤
│ APPROVAL_REQUIRED  │ Pending approval needs your action                     │
│                    │ Actions: [Review] [OK]                                 │
├────────────────────┼────────────────────────────────────────────────────────┤
│ PAYMENT_APPROVED   │ Your payment has been approved                         │
│                    │ Actions: [View Wallet] [OK]                            │
├────────────────────┼────────────────────────────────────────────────────────┤
│ DEADLINE_REMINDER  │ Confirmation deadline approaching                      │
│                    │ Actions: [Confirm Now] [OK]                            │
├────────────────────┼────────────────────────────────────────────────────────┤
│ MMP_APPROVED       │ MMP has been approved                                  │
│                    │ Actions: [View MMP] [OK]                               │
└────────────────────┴────────────────────────────────────────────────────────┘
```

### 8.3 Call Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          VOICE/VIDEO CALL FLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

CALLER (User A)                                             RECEIVER (User B)
───────────────                                             ─────────────────

┌─────────────────┐                                     ┌─────────────────┐
│  Click "Call"   │                                     │                 │
│  Button         │                                     │                 │
└────────┬────────┘                                     │                 │
         │                                              │                 │
         ▼                                              │                 │
┌─────────────────┐                                     │                 │
│  Select Call    │                                     │                 │
│  Type:          │                                     │                 │
│  • WebRTC (P2P) │                                     │                 │
│  • Jitsi (Room) │                                     │                 │
└────────┬────────┘                                     │                 │
         │                                              │                 │
         ▼                                              │                 │
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Create Signal  │────►│  Supabase       │────►│  INCOMING CALL  │
│  in Database    │     │  Realtime       │     │  Notification   │
└─────────────────┘     │  Broadcast      │     │  [Accept][Reject]│
                        └─────────────────┘     └────────┬────────┘
                                                         │
                                                         │ Accept
                                                         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Connection     │◄────│  WebRTC ICE     │◄────│  Join Call      │
│  Established    │     │  Negotiation    │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                                              │
         ▼                                              ▼
┌───────────────────────────────────────────────────────────────────┐
│                         ACTIVE CALL                               │
│   • Audio/Video Stream                                            │
│   • Mute/Unmute Controls                                          │
│   • Screen Share (Jitsi)                                          │
│   • End Call Button                                               │
└───────────────────────────────────────────────────────────────────┘
```

---

## 9. Complete Page Reference

### 9.1 Public Pages

#### Landing Page (`/`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Welcome page introducing PACT Command Center |
| **How It Works** | Displays platform branding, live clock, system status, and statistics |
| **Who Can Access** | Everyone (public) |
| **Key Features** | System status indicator, animated background, "Get Started" CTA |

#### Authentication (`/auth`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | User login and authentication |
| **How It Works** | Email/password or Google OAuth with optional 2FA |
| **Who Can Access** | Everyone (public) |
| **Key Features** | Multiple auth methods, 2FA support, mobile-optimized |

### 9.2 Core Dashboard Pages

#### Main Dashboard (`/dashboard`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Central command center with real-time operational overview |
| **How It Works** | Role-specific zones with live statistics and quick actions |
| **Who Can Access** | All authenticated users |
| **Database Tables** | `profiles`, `mmp_files`, `projects`, `site_visits`, `notifications` |
| **Key Features** | Overview Zone, Operations Zone, Financial Zone, Team Zone |

### 9.3 MMP Pages

#### MMP Management (`/mmp`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | View and manage Monthly Monitoring Plans |
| **Key Features** | Status filtering, search, pagination, bulk actions |

#### MMP Upload (`/mmp/upload`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Upload and parse CSV files for new MMPs |
| **Key Features** | CSV validation, preview, site entry creation |

### 9.4 Site Visit Pages

#### Site Visits List (`/site-visits`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | View all site visits with filtering and claiming |
| **Key Features** | Status filtering, claim button, geographic filters |

#### Site Visit Detail (`/site-visits/:id`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Detailed view of a single site visit |
| **Key Features** | GPS display, photos, costs, audit trail |

### 9.5 Financial Pages

#### Finance Dashboard (`/finance`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Overview of all financial operations |
| **Key Features** | Wallet balances, pending approvals, transaction history |

#### Wallet Management (`/wallet`)

| Attribute | Details |
|-----------|---------|
| **Purpose** | Manage user digital wallets |
| **Key Features** | Balance display, transaction history, withdrawal requests |

---

## 10. Complete Site Visit Cycle (End-to-End)

### 10.1 From MMP Upload to Payment - Complete Journey

```
┌─────────────────────────────────────────────────────────────────────────────┐
│               COMPLETE SITE VISIT CYCLE: UPLOAD TO PAYMENT                  │
└─────────────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════
STAGE 1: MMP CREATION & UPLOAD
═══════════════════════════════════════════════════════════════════════════════

[ADMIN/PM]                                [SYSTEM]
    │                                         │
    ▼                                         │
┌─────────────────┐                           │
│ 1. Prepare CSV  │                           │
│    file with    │                           │
│    site data    │                           │
└────────┬────────┘                           │
         │                                    │
         ▼                                    ▼
┌─────────────────┐   Upload    ┌─────────────────┐
│ 2. Upload CSV   │────────────►│ 3. Parse CSV    │
│    to system    │             │    Validate     │
└─────────────────┘             │    Format       │
                                └────────┬────────┘
                                         │
                                         ▼
                                ┌─────────────────┐
                                │ 4. Duplicate    │
                                │    Check        │
                                │    (Same month) │
                                └────────┬────────┘
                                         │
                      ┌──────────────────┴──────────────────┐
                      │                                     │
                      ▼                                     ▼
              ┌───────────────┐                     ┌───────────────┐
              │ DUPLICATES    │                     │ NO DUPLICATES │
              │ FOUND         │                     │               │
              │               │                     │ Continue      │
              │ UPLOAD        │                     │               │
              │ BLOCKED       │                     └───────┬───────┘
              └───────────────┘                             │
                                                            ▼
                                                   ┌─────────────────┐
                                                   │ 5. Registry     │
                                                   │    Lookup       │
                                                   │                 │
                                                   │ Match sites to  │
                                                   │ Sites Registry  │
                                                   └────────┬────────┘
                                                            │
                                          ┌─────────────────┴─────────────────┐
                                          │                                   │
                                          ▼                                   ▼
                                 ┌───────────────┐               ┌───────────────┐
                                 │ SITE FOUND    │               │ SITE NOT      │
                                 │               │               │ FOUND         │
                                 │ Link to       │               │               │
                                 │ registry_     │               │ CREATE new    │
                                 │ site_id       │               │ registry      │
                                 │               │               │ entry         │
                                 │ Inherit GPS   │               │ Generate      │
                                 │ if available  │               │ site_code     │
                                 └───────┬───────┘               └───────┬───────┘
                                         │                               │
                                         └───────────────┬───────────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │ 6. Create MMP   │
                                                │    Record       │
                                                │    Status:DRAFT │
                                                └────────┬────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │ 7. Create Site  │
                                                │    Entries      │
                                                │    (mmp_site_   │
                                                │    entries)     │
                                                └─────────────────┘

═══════════════════════════════════════════════════════════════════════════════
STAGE 2: APPROVAL WORKFLOW
═══════════════════════════════════════════════════════════════════════════════

[PM/ADMIN]              [SUPERVISOR]              [FOM]
    │                       │                       │
    ▼                       │                       │
┌─────────────────┐         │                       │
│ 8. Submit MMP   │         │                       │
│    for Review   │         │                       │
│    Status:      │         │                       │
│    SUBMITTED    │         │                       │
└────────┬────────┘         │                       │
         │                  │                       │
         │   Notification   │                       │
         └─────────────────►│                       │
                            ▼                       │
                   ┌─────────────────┐              │
                   │ 9. Supervisor   │              │
                   │    Review       │              │
                   │    • Verify     │              │
                   │      sites      │              │
                   │    • Check      │              │
                   │      permits    │              │
                   └────────┬────────┘              │
                            │                       │
                    ┌───────┴───────┐               │
                    │               │               │
                    ▼               ▼               │
           ┌──────────────┐ ┌──────────────┐        │
           │ REJECT       │ │ APPROVE      │        │
           │              │ │              │        │
           │ Return to    │ │ Forward to   │───────►│
           │ DRAFT with   │ │ FOM          │        │
           │ comments     │ │              │        ▼
           └──────────────┘ └──────────────┘ ┌─────────────────┐
                                             │ 10. FOM Final   │
                                             │     Approval    │
                                             │     • Budget    │
                                             │       check     │
                                             │     • Timeline  │
                                             │       verify    │
                                             └────────┬────────┘
                                                      │
                                              ┌───────┴───────┐
                                              │               │
                                              ▼               ▼
                                     ┌──────────────┐ ┌──────────────┐
                                     │ REJECT       │ │ APPROVE      │
                                     │              │ │              │
                                     │ Return for   │ │ Status:      │
                                     │ revision     │ │ APPROVED     │
                                     └──────────────┘ └──────┬───────┘
                                                             │
                                                             ▼
                                                    ┌─────────────────┐
                                                    │ 11. Sites       │
                                                    │     Generated   │
                                                    │     as Site     │
                                                    │     Visits      │
                                                    └─────────────────┘

═══════════════════════════════════════════════════════════════════════════════
STAGE 3: DISPATCH & CLAIMING
═══════════════════════════════════════════════════════════════════════════════

[COORDINATOR]                              [DATA COLLECTOR]
     │                                          │
     ▼                                          │
┌─────────────────┐                             │
│ 12. Dispatch    │                             │
│     Sites       │                             │
│                 │                             │
│     Status:     │                             │
│     DISPATCHED  │                             │
└────────┬────────┘                             │
         │                                      │
         │    Push Notification                 │
         └─────────────────────────────────────►│
                                                ▼
                                       ┌─────────────────┐
                                       │ 13. View        │
                                       │     Available   │
                                       │     Sites       │
                                       │     (Filtered   │
                                       │      by hub/    │
                                       │      state)     │
                                       └────────┬────────┘
                                                │
                                                ▼
                                       ┌─────────────────┐
                                       │ 14. CLAIM Site  │
                                       │                 │
                                       │     First-claim │
                                       │     wins!       │
                                       │                 │
                                       │     Status:     │
                                       │     ASSIGNED    │
                                       └────────┬────────┘
                                                │
                                                ▼
                                       ┌─────────────────┐
                                       │ 15. CONFIRM     │
                                       │     Assignment  │
                                       │                 │
                                       │     Deadline:   │
                                       │     2 days pre  │
                                       │                 │
                                       │     Status:     │
                                       │     ACCEPTED    │
                                       └─────────────────┘

═══════════════════════════════════════════════════════════════════════════════
STAGE 4: FIELD EXECUTION
═══════════════════════════════════════════════════════════════════════════════

[DATA COLLECTOR - MOBILE APP]
         │
         ▼
┌─────────────────┐
│ 16. START VISIT │
│                 │
│     • GPS       │
│       Capture   │
│     • Timestamp │
│                 │
│     Status:     │
│     ONGOING     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 17. DATA        │
│     COLLECTION  │
│                 │
│     • Photos    │
│     • Survey    │
│       Forms     │
│     • OTP       │
│       Verify    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 18. END VISIT   │
│                 │
│     • GPS       │
│       End       │
│       Location  │
│     • Duration  │
│       Calc      │
│                 │
│     Status:     │
│     COMPLETED   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 19. GPS SAVED   │
│     TO REGISTRY │
│                 │
│     saveGPSTo   │
│     Registry()  │
│                 │
│     Future      │
│     visits get  │
│     GPS auto!   │
└─────────────────┘

═══════════════════════════════════════════════════════════════════════════════
STAGE 5: COST SUBMISSION & APPROVAL
═══════════════════════════════════════════════════════════════════════════════

[DATA COLLECTOR]     [SUPERVISOR]      [FINANCE]         [FOM]
     │                    │               │                │
     ▼                    │               │                │
┌─────────────────┐       │               │                │
│ 20. Submit      │       │               │                │
│     Costs       │       │               │                │
│                 │       │               │                │
│     • Transport │       │               │                │
│     • Meals     │       │               │                │
│     • Receipts  │       │               │                │
│       (photos)  │       │               │                │
└────────┬────────┘       │               │                │
         │                │               │                │
         │ Notification   │               │                │
         └───────────────►│               │                │
                          ▼               │                │
                 ┌─────────────────┐      │                │
                 │ 21. Supervisor  │      │                │
                 │     Review      │      │                │
                 │     (2hr SLA)   │      │                │
                 │                 │      │                │
                 │     Verify      │      │                │
                 │     receipts    │      │                │
                 └────────┬────────┘      │                │
                          │               │                │
                   ┌──────┴──────┐        │                │
                   │             │        │                │
                   ▼             ▼        │                │
          ┌───────────┐  ┌───────────┐    │                │
          │  REJECT   │  │  APPROVE  │    │                │
          │           │  │           │───►│                │
          │  Request  │  │  Forward  │    │                │
          │  changes  │  │  to       │    ▼                │
          └───────────┘  │  Finance  │ ┌─────────────────┐ │
                         └───────────┘ │ 22. Finance     │ │
                                       │     Review      │ │
                                       │     (12hr SLA)  │ │
                                       │                 │ │
                                       │     Budget      │ │
                                       │     check       │ │
                                       └────────┬────────┘ │
                                                │          │
                                         ┌──────┴──────┐   │
                                         │             │   │
                                         ▼             ▼   │
                                ┌───────────┐  ┌───────────┐│
                                │  REJECT   │  │  APPROVE  ││
                                │           │  │           ││
                                │  Policy   │  │  Forward  │▼
                                │  issue    │  │  to FOM   │
                                └───────────┘  └─────┬─────┘
                                                     │
                                                     ▼
                                            ┌─────────────────┐
                                            │ 23. FOM Final   │
                                            │     Approval    │
                                            │     (24hr SLA)  │
                                            │                 │
                                            │     Final       │
                                            │     sign-off    │
                                            └────────┬────────┘
                                                     │
                                                     ▼
                                            ┌─────────────────┐
                                            │ 24. PAYMENT     │
                                            │     APPROVED    │
                                            │                 │
                                            │     Wallet      │
                                            │     credited    │
                                            └─────────────────┘

═══════════════════════════════════════════════════════════════════════════════
STAGE 6: PAYMENT PROCESSING
═══════════════════════════════════════════════════════════════════════════════

[FINANCE OFFICER]                         [DATA COLLECTOR]
       │                                        │
       ▼                                        │
┌─────────────────┐                             │
│ 25. Process     │                             │
│     Bank        │                             │
│     Transfer    │                             │
│                 │                             │
│     Bank of     │                             │
│     Khartoum    │                             │
│                 │                             │
│     MANUAL      │                             │
│     ENTRY       │                             │
│     (No AI!)    │                             │
└────────┬────────┘                             │
         │                                      │
         ▼                                      │
┌─────────────────┐                             │
│ 26. Enter       │                             │
│     Receipt     │                             │
│     Details     │                             │
│                 │                             │
│     • Trans ID  │                             │
│     • Amount    │                             │
│     • Date      │                             │
│     • Receipt # │                             │
└────────┬────────┘                             │
         │                                      │
         ▼                                      │
┌─────────────────┐                             │
│ 27. Mark as     │    Email Notification       │
│     Transferred │─────────────────────────────►│
│                 │                             │
│     Wallet      │                             ▼
│     updated     │                    ┌─────────────────┐
│                 │                    │ 28. Receive     │
│     Audit       │                    │     Payment     │
│     logged      │                    │     Confirm     │
└─────────────────┘                    │                 │
                                       │     VISIT       │
                                       │     COMPLETE!   │
                                       └─────────────────┘
```

### 10.2 Payment Methods

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PAYMENT METHODS & CHANNELS                           │
└─────────────────────────────────────────────────────────────────────────────┘

                          ┌───────────────────┐
                          │   APPROVED COST   │
                          │   SUBMISSION      │
                          └─────────┬─────────┘
                                    │
                                    ▼
                          ┌───────────────────┐
                          │   WALLET CREDIT   │
                          │                   │
                          │   User's digital  │
                          │   wallet balance  │
                          │   increased       │
                          └─────────┬─────────┘
                                    │
                                    ▼
                          ┌───────────────────┐
                          │   WITHDRAWAL      │
                          │   REQUEST         │
                          │                   │
                          │   User requests   │
                          │   bank transfer   │
                          └─────────┬─────────┘
                                    │
                                    ▼
                          ┌───────────────────┐
                          │   BANK OF         │
                          │   KHARTOUM        │
                          │                   │
                          │   Manual Transfer │
                          │   (No AI/auto!)   │
                          └─────────┬─────────┘
                                    │
                                    ▼
                          ┌───────────────────┐
                          │   RECEIPT ENTRY   │
                          │                   │
                          │   Finance Officer │
                          │   enters:         │
                          │   • Transaction # │
                          │   • Amount        │
                          │   • Date          │
                          │   • Bank receipt  │
                          └─────────┬─────────┘
                                    │
                                    ▼
                          ┌───────────────────┐
                          │   EMAIL NOTIF     │
                          │                   │
                          │   noreply@        │
                          │   pactorg.com     │
                          │   (IONOS SMTP)    │
                          └───────────────────┘

IMPORTANT: NO AI/AUTOMATED CHARGES
═══════════════════════════════════════════════════════════════════════════════
All bank transfers are MANUAL:
• Finance Officer initiates transfer via Bank of Khartoum
• Receipt details entered manually into system
• No automated payment processing
• No AI-based receipt validation
• Human verification required at every step
═══════════════════════════════════════════════════════════════════════════════
```

---

## 11. Project Features & Team Visibility

### 11.1 Project Structure

**Implementation Files:**
- Project Detail: `src/pages/projects/ProjectDetail.tsx`
- Team Management: `src/components/project/TeamMemberCard.tsx`
- Permission Guards: `src/components/PermissionGuard.tsx`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PROJECT STRUCTURE                                   │
└─────────────────────────────────────────────────────────────────────────────┘

                         ┌────────────────────────┐
                         │       PROJECT          │
                         │                        │
                         │  • name                │
                         │  • description         │
                         │  • start_date          │
                         │  • end_date            │
                         │  • status              │
                         │  • budget              │
                         │  • hub_id              │
                         └───────────┬────────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          │                          │                          │
          ▼                          ▼                          ▼
┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐
│   TEAM MEMBERS    │    │   PROJECT         │    │   MMPs            │
│                   │    │   ACTIVITIES      │    │                   │
│ • project_members │    │                   │    │ • mmp_files       │
│   table           │    │ • project_        │    │ • linked via      │
│                   │    │   activities      │    │   project_id      │
│ Users assigned    │    │   table           │    │                   │
│ to this project   │    │                   │    │ Monthly plans     │
│ with specific     │    │ Tasks/activities  │    │ for this project  │
│ roles             │    │ within project    │    │                   │
└───────────────────┘    └───────────────────┘    └───────────────────┘
          │                          │                          │
          ▼                          ▼                          ▼
┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐
│ SITE VISITS       │    │ BUDGETS           │    │ DOCUMENTS         │
│                   │    │                   │    │                   │
│ Generated from    │    │ Budget allocations│    │ Project documents │
│ MMPs for this     │    │ and tracking      │    │ and attachments   │
│ project           │    │                   │    │                   │
└───────────────────┘    └───────────────────┘    └───────────────────┘
```

### 11.2 Team Member vs Non-Member Visibility

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PROJECT VISIBILITY MATRIX                                 │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────────────────────────────┐
                    │                     TEAM MEMBER                          │
                    │              (Assigned to Project)                       │
                    ├─────────────────────────────────────────────────────────┤
                    │                                                         │
                    │  CAN VIEW:                                              │
                    │  ✓ Full project details                                 │
                    │  ✓ All team members & contacts                          │
                    │  ✓ Project activities & tasks                           │
                    │  ✓ Site visits (assigned to them or viewable by role)   │
                    │  ✓ MMP list and details                                 │
                    │  ✓ Budget information (if role permits)                 │
                    │  ✓ Documents & attachments                              │
                    │  ✓ Real-time notifications for project updates          │
                    │                                                         │
                    │  CAN DO (based on role):                                │
                    │  ✓ Claim site visits (Data Collector)                   │
                    │  ✓ Approve submissions (Supervisor/Finance)             │
                    │  ✓ Upload MMPs (PM/Admin)                               │
                    │  ✓ Edit project details (PM/Admin)                      │
                    │                                                         │
                    └─────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────────────────────────────┐
                    │                   NON-TEAM MEMBER                        │
                    │             (Not Assigned to Project)                    │
                    ├─────────────────────────────────────────────────────────┤
                    │                                                         │
                    │  CAN VIEW (if role permits general access):             │
                    │  ○ Project name & basic info (list view only)           │
                    │  ○ Public project status                                │
                    │  ✗ Cannot view team members                             │
                    │  ✗ Cannot view project activities                       │
                    │  ✗ Cannot view site visits                              │
                    │  ✗ Cannot view MMPs                                     │
                    │  ✗ Cannot view budget details                           │
                    │  ✗ Cannot view documents                                │
                    │                                                         │
                    │  CANNOT DO:                                             │
                    │  ✗ Claim any site visits                                │
                    │  ✗ Make any approvals                                   │
                    │  ✗ Upload MMPs                                          │
                    │  ✗ Edit anything                                        │
                    │                                                         │
                    │  EXCEPTION: Admins & Super Admins have global access    │
                    │                                                         │
                    └─────────────────────────────────────────────────────────┘

ROLE-BASED ACCESS WITHIN PROJECTS:
═══════════════════════════════════════════════════════════════════════════════
│ Role               │ Project Details │ Team │ Tasks │ Visits │ Budget │ MMP │
├────────────────────┼─────────────────┼──────┼───────┼────────┼────────┼─────│
│ Admin/Super Admin  │      FULL       │ FULL │ FULL  │  FULL  │  FULL  │FULL │
│ FOM                │      FULL       │ FULL │ FULL  │  FULL  │  FULL  │FULL │
│ Project Manager    │      FULL       │ FULL │ FULL  │  FULL  │  READ  │FULL │
│ State Coordinator  │      READ       │ READ │ READ  │ ASSIGN │  READ  │READ │
│ Supervisor         │      READ       │ READ │ READ  │ MANAGE │  NONE  │READ │
│ Data Collector     │      READ       │ READ │ READ  │ CLAIM  │  NONE  │READ │
│ Finance Officer    │      READ       │ READ │ NONE  │  READ  │  FULL  │READ │
│ Reviewer           │      READ       │ READ │ READ  │  READ  │  READ  │READ │
│ Non-member         │      NONE       │ NONE │ NONE  │  NONE  │  NONE  │NONE │
═══════════════════════════════════════════════════════════════════════════════
```

### 11.3 Task Visibility Within Projects

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       TASK VISIBILITY RULES                                  │
└─────────────────────────────────────────────────────────────────────────────┘

PROJECT ACTIVITIES/TASKS:
─────────────────────────

┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ TASK CREATED      │     │ TASK ASSIGNED     │     │ TASK VISIBLE      │
│                   │     │                   │     │                   │
│ By: PM/Admin      │────►│ To: Team Member   │────►│ To: Assignee +    │
│                   │     │                   │     │    Supervisors +  │
│                   │     │                   │     │    Project Leads  │
└───────────────────┘     └───────────────────┘     └───────────────────┘

VISIBILITY RULES:
═══════════════════════════════════════════════════════════════════════════════
│ User Type                │ Can See                                          │
├──────────────────────────┼──────────────────────────────────────────────────│
│ Task Assignee            │ • Their assigned tasks                           │
│                          │ • Task details, deadlines, requirements          │
│                          │ • Can update progress                            │
├──────────────────────────┼──────────────────────────────────────────────────│
│ Supervisor (same hub)    │ • All tasks for team members they supervise      │
│                          │ • Can reassign tasks                             │
│                          │ • Can approve task completion                    │
├──────────────────────────┼──────────────────────────────────────────────────│
│ PM/FOM                   │ • All tasks in the project                       │
│                          │ • Full create/edit/delete access                 │
│                          │ • Can assign to any team member                  │
├──────────────────────────┼──────────────────────────────────────────────────│
│ Admin/Super Admin        │ • All tasks across all projects                  │
│                          │ • Global oversight                               │
├──────────────────────────┼──────────────────────────────────────────────────│
│ Non-team member          │ • Cannot see any tasks                           │
═══════════════════════════════════════════════════════════════════════════════

SITE VISIT VISIBILITY (Special Rules):
───────────────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  DATA COLLECTOR VIEW:                                                       │
│  • See DISPATCHED sites in their hub/state/locality (for claiming)         │
│  • See ASSIGNED/ACCEPTED sites assigned to them                            │
│  • See ONGOING/COMPLETED sites they executed                                │
│  • CANNOT see sites assigned to other collectors                            │
│                                                                             │
│  SUPERVISOR VIEW:                                                           │
│  • See ALL sites for their team (regardless of status)                      │
│  • Can reassign sites between team members                                  │
│  • Can dispatch sites to specific collectors                                │
│                                                                             │
│  COORDINATOR VIEW:                                                          │
│  • See ALL sites in their state                                             │
│  • Can dispatch and assign                                                  │
│  • Can view collector assignments                                           │
│                                                                             │
│  FOM/ADMIN VIEW:                                                            │
│  • Global view of all sites                                                 │
│  • Full management capabilities                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Database Architecture

### 10.1 Core Tables

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DATABASE TABLE INVENTORY                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  IDENTITY & ACCESS (5 tables)                                               │
│  ├── profiles              User profiles and settings                       │
│  ├── user_roles            Role assignments                                 │
│  ├── roles                 Role definitions                                 │
│  ├── permissions           Permission definitions                           │
│  └── sessions              Active sessions                                  │
│                                                                             │
│  OPERATIONS (8 tables)                                                      │
│  ├── projects              Project records                                  │
│  ├── project_activities    Project activities                               │
│  ├── mmp_files             MMP header records                               │
│  ├── mmp_site_entries      Individual site entries                          │
│  ├── site_visits           Dispatched site visits                           │
│  ├── site_visit_photos     Visit photo attachments                          │
│  ├── sites_master          Master site registry                             │
│  └── localities            Geographic localities                            │
│                                                                             │
│  FINANCIAL (7 tables)                                                       │
│  ├── wallets               User wallet balances                             │
│  ├── wallet_transactions   Transaction history                              │
│  ├── cost_submissions      Submitted expenses                               │
│  ├── down_payment_requests Down payment requests                            │
│  ├── budgets               Budget allocations                               │
│  ├── classification_fees   Fee schedules                                    │
│  └── bank_receipts         Manual bank receipt records                      │
│                                                                             │
│  COMMUNICATION (5 tables)                                                   │
│  ├── messages              Chat messages                                    │
│  ├── conversations         Chat threads                                     │
│  ├── notifications         System notifications                             │
│  ├── call_logs             Voice/video call history                         │
│  └── email_logs            Email send history                               │
│                                                                             │
│  AUDIT & LOGGING (3 tables)                                                 │
│  ├── audit_logs            Complete audit trail                             │
│  ├── deletion_logs         Deletion records                                 │
│  └── login_attempts        Authentication attempts                          │
│                                                                             │
│  DOCUMENTS (3 tables)                                                       │
│  ├── documents             Document metadata                                │
│  ├── signatures            Digital signatures                               │
│  └── otp_verifications     OTP records                                      │
│                                                                             │
│  TOTAL: 31 TABLES                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Key Relationships

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       DATABASE RELATIONSHIPS                                │
└─────────────────────────────────────────────────────────────────────────────┘

profiles ─────┬────► user_roles ────► roles
              │
              ├────► wallets
              │
              ├────► messages (sender)
              │
              └────► site_visits (assigned_to)

projects ─────┬────► project_activities
              │
              ├────► mmp_files
              │
              └────► budgets

mmp_files ────┬────► mmp_site_entries ────► site_visits
              │
              └────► sites_master (reference)

site_visits ──┬────► site_visit_photos
              │
              ├────► cost_submissions
              │
              └────► audit_logs

wallets ──────┬────► wallet_transactions
              │
              └────► down_payment_requests
```

---

## 11. Mobile App Features

### 11.1 Mobile Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MOBILE APP ARCHITECTURE                              │
└─────────────────────────────────────────────────────────────────────────────┘

                         ┌───────────────────┐
                         │    REACT APP      │
                         │   (Same Codebase) │
                         └─────────┬─────────┘
                                   │
                         ┌─────────▼─────────┐
                         │    CAPACITOR      │
                         │   (Bridge Layer)  │
                         └─────────┬─────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │   ANDROID APK   │  │   iOS APP       │  │   WEB APP       │
    │                 │  │   (Future)      │  │                 │
    └─────────────────┘  └─────────────────┘  └─────────────────┘

NATIVE PLUGINS:
═══════════════════════════════════════════════════════════════════════════════
│ Plugin              │ Purpose                                               │
├─────────────────────┼───────────────────────────────────────────────────────│
│ @capacitor/camera   │ Photo capture for site visits                         │
│ @capacitor/geoloc   │ GPS location tracking                                 │
│ @capacitor/push     │ Push notification handling                            │
│ @capacitor/network  │ Offline detection                                     │
│ @capacitor/filesys  │ Local file storage                                    │
│ native-biometric    │ Fingerprint/Face authentication                       │
═══════════════════════════════════════════════════════════════════════════════
```

### 11.2 Offline Capabilities

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        OFFLINE CAPABILITIES                                 │
└─────────────────────────────────────────────────────────────────────────────┘

OFFLINE-CAPABLE FEATURES:
═══════════════════════════════════════════════════════════════════════════════
│ Feature              │ Offline Behavior                                     │
├──────────────────────┼──────────────────────────────────────────────────────│
│ Site Visit Workflow  │ Full offline execution with local queue             │
│ GPS Capture          │ Native GPS, stored locally                          │
│ Photo Capture        │ Stored in IndexedDB, synced later                   │
│ Cost Submission      │ Saved to queue, submitted when online               │
│ MMP List View        │ Cached for offline browsing                         │
│ Form Completion      │ Full offline form submission                        │
═══════════════════════════════════════════════════════════════════════════════

ONLINE-ONLY FEATURES:
═══════════════════════════════════════════════════════════════════════════════
│ Feature              │ Reason                                               │
├──────────────────────┼──────────────────────────────────────────────────────│
│ Real-time Dashboard  │ Requires live data                                   │
│ Chat/Messaging       │ Real-time communication                              │
│ Video Calls          │ Streaming requirement                                │
│ Live Location Map    │ Real-time tracking                                   │
│ Wallet Operations    │ Financial security                                   │
│ Push Notifications   │ Server-dependent                                     │
═══════════════════════════════════════════════════════════════════════════════

SYNC MECHANISM:
───────────────────────────────────────────────────────────────────────────────
1. Actions saved to IndexedDB queue when offline
2. Network status monitored via Capacitor
3. When online detected:
   - Sync Manager processes queue
   - Conflict resolution (last-write-wins default)
   - Failed items retry with exponential backoff
4. User sees SyncStatusBar with manual "Sync Now" button
───────────────────────────────────────────────────────────────────────────────
```

---

## 12. Audit & Compliance

### 12.1 Audit Log Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AUDIT LOG STRUCTURE                                 │
└─────────────────────────────────────────────────────────────────────────────┘

LOGGED EVENTS:
═══════════════════════════════════════════════════════════════════════════════
│ Category        │ Events Logged                                            │
├─────────────────┼────────────────────────────────────────────────────────────│
│ Authentication  │ login, logout, failed_login, password_reset               │
│ User Management │ user_created, user_updated, role_assigned                 │
│ MMP Operations  │ mmp_created, mmp_approved, mmp_dispatched                 │
│ Site Visits     │ claim, start, complete, reject, release                   │
│ Financial       │ payment_approved, payment_rejected, wallet_credited       │
│ Documents       │ document_uploaded, signature_added, otp_verified          │
│ System          │ settings_changed, bulk_operation, data_export             │
═══════════════════════════════════════════════════════════════════════════════

LOG ENTRY FIELDS:
───────────────────────────────────────────────────────────────────────────────
{
  id: UUID,
  event_type: string,
  actor_id: UUID (user who performed action),
  target_type: string (resource type),
  target_id: UUID (resource ID),
  action: string (create/read/update/delete),
  details: JSONB (event-specific data),
  ip_address: string,
  user_agent: string,
  created_at: timestamp
}
───────────────────────────────────────────────────────────────────────────────
```

---

## 13. Troubleshooting

### 13.1 Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Cannot claim site | Geographic mismatch | Check your state/locality assignment |
| Site not visible | Status filter | Clear filters, check "Dispatched" tab |
| Confirmation expired | Deadline passed | Contact supervisor for re-assignment |
| Payment pending | Approval queue | Wait for approval workflow completion |
| Offline data not syncing | Network issue | Use manual "Sync Now" button |
| Call not connecting | WebRTC blocked | Try Jitsi Meet option instead |

### 13.2 Support Contact

For technical support, contact the ICT team via the in-app chat or email.

---

**PACT Command Center**
*Centralized Field Operations Command Center*

Copyright 2025 PACT Consultancy. All rights reserved.
