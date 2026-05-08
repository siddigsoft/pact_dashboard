# PACT Command Center — Technical Brief
**Prepared for:** IT Discussion / Internal Meeting
**Date:** May 2026
**Classification:** Internal

---

## 1. What Is the Platform?

PACT Command Center is a **web-based humanitarian field operations platform** built to manage Monthly Monitoring Plans (MMPs), site visits, HR, finance, surveys, and cross-cutting project workflows across multiple hubs in Sudan and the region.

It runs as a **Progressive Web Application (PWA)** — meaning it works in any browser, can be installed on phones and laptops like a native app, and continues working in areas with no internet connectivity (offline-first design).

---

## 2. Platform Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    USER DEVICES                         │
│  Browser (Chrome/Edge/Firefox)  │  Android App (APK)    │
│        PWA / Installed           │  Capacitor wrapper    │
└──────────────┬──────────────────────────────────────────┘
               │ HTTPS
┌──────────────▼──────────────────────────────────────────┐
│              FRONTEND (React Web App)                    │
│         Hosted on Vercel (Production CDN)                │
│         Hosted on Replit (Development / Staging)         │
└──────────────┬──────────────────────────────────────────┘
               │ Supabase JS Client (REST + WebSocket)
┌──────────────▼──────────────────────────────────────────┐
│              BACKEND — Supabase (managed cloud)          │
│  ┌──────────────┐  ┌────────────┐  ┌─────────────────┐  │
│  │  PostgreSQL  │  │  Auth      │  │  Edge Functions  │  │
│  │  Database    │  │  (JWT+RLS) │  │  (Deno/TS)       │  │
│  └──────────────┘  └────────────┘  └─────────────────┘  │
│  ┌──────────────┐  ┌────────────┐                        │
│  │  Realtime    │  │  Storage   │                        │
│  │  (WebSocket) │  │  (S3-like) │                        │
│  └──────────────┘  └────────────┘                        │
└─────────────────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────┐
│              THIRD-PARTY INTEGRATIONS                    │
│  Firebase (Push)  │  IONOS SMTP (Email)  │  WhatsApp     │
│  Gemini AI (OCR)  │  MS Graph (Outlook)  │  Groq AI      │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Languages & Technologies by Layer

### 3.1 Frontend (Web Application)

| Component | Technology | Version |
|---|---|---|
| **Language** | TypeScript | 5.5 |
| **UI Framework** | React | 18.3 |
| **Build Tool** | Vite | 5.4 |
| **Styling** | Tailwind CSS | 3.4 |
| **Component Library** | Shadcn UI (built on Radix UI) | Latest |
| **Routing** | React Router DOM | 6.30 |
| **Server-State / Caching** | TanStack Query (React Query) | 5 |
| **Forms** | React Hook Form + Zod | 7.5 / 3.25 |
| **Charts / Visualisation** | Recharts, Chart.js | 2.12 / 4.5 |
| **Maps** | Leaflet + React Leaflet | 1.9 |
| **Icons** | Lucide React | 0.462 |
| **Animations** | Framer Motion | 12 |
| **Rich Text Editor** | Tiptap | 3.22 |
| **Offline Storage** | IndexedDB via `idb` | 8 |
| **PWA / Service Worker** | Native browser API | — |
| **Internationalisation** | i18next (EN / AR) | 25 |
| **PDF Export** | jsPDF + jspdf-autotable | 3 / 5 |
| **Excel Export** | ExcelJS + SheetJS (xlsx) | 4.4 / 0.18 |
| **Word Export** | docx | 9.5 |
| **QR Codes** | qrcode, qrcode.react | 1.5 |
| **AI Integration** | @google/genai (Gemini) | 1.44 |

### 3.2 Mobile Application (Android)

| Component | Technology |
|---|---|
| **Wrapper** | Capacitor 7 (converts web app → native APK) |
| **Language** | TypeScript / JavaScript (same codebase as web) |
| **Native APIs** | Camera, GPS, Push Notifications, Filesystem, Biometric |
| **Crash Reporting** | Firebase Crashlytics |
| **OTA Updates** | Shorebird (Flutter-based OTA layer) |
| **Local Cache** | Capacitor Filesystem + IndexedDB |

> The Android APK is essentially the same React web app wrapped in a native shell using Capacitor, giving access to device hardware (camera, GPS, fingerprint).

### 3.3 Backend — Supabase

| Component | Technology |
|---|---|
| **Database** | PostgreSQL 15 (managed by Supabase) |
| **Authentication** | Supabase Auth (JWT tokens, TOTP 2FA, RLS) |
| **API** | Auto-generated REST API + GraphQL (via PostgREST) |
| **Real-time** | WebSocket subscriptions (Supabase Realtime) |
| **File Storage** | Supabase Storage (S3-compatible object store) |
| **Server Functions** | Edge Functions written in **Deno / TypeScript** |
| **Security** | Row Level Security (RLS) policies on every table |
| **Schema Management** | SQL migration files (applied manually) |

### 3.4 Edge Functions (Serverless)

Written in **Deno (TypeScript)**, deployed on Supabase Edge Functions infrastructure. Used for:
- Notification escalation checks
- WhatsApp webhook handling
- Email dispatch via IONOS SMTP
- Scheduled background jobs

### 3.5 Development & Tooling

| Tool | Purpose |
|---|---|
| **Replit** | Development environment & staging hosting |
| **Vercel** | Production hosting (CDN, auto-deploy) |
| **ESLint + TypeScript** | Code quality & type safety |
| **Vitest** | Unit testing framework |
| **Git** | Version control (managed via Replit) |

---

## 4. Database

### 4.1 Provider
**Supabase** — a managed cloud database platform built on top of PostgreSQL. Hosted on **AWS infrastructure** (region: typically `ap-southeast-1` or `eu-west-1` depending on the project's Supabase region).

### 4.2 Database Type
**PostgreSQL 15** — fully relational, ACID-compliant, with:
- Stored procedures and functions (PL/pgSQL)
- Row Level Security (RLS) — every user only sees their own data
- Triggers for audit logging
- Foreign keys and referential integrity across all modules

### 4.3 Key Data Domains

| Domain | What's Stored |
|---|---|
| Users & Auth | Profiles, roles, permissions, sessions, 2FA |
| Sites & Geography | Sudan states, localities, site registry, hub assignments |
| MMP & Site Visits | Monitoring plans, visit records, GPS data, collectors |
| HR | Staff, payroll, leave, performance, contracts, advances |
| Finance / Accounting | Chart of accounts, journal entries, GL, budgets, assets, PO/PR/GRN/AP |
| Projects | Project lifecycle, tasks, milestones, Gantt, dependencies |
| Surveys | Forms, questions, responses, analytics |
| CRM | Partners, engagements, contacts, opportunities |
| Notifications | Events, delivery logs, user preferences |
| Audit | System logs, hierarchy changes, login analytics |

### 4.4 Backup Strategy

| Layer | Details |
|---|---|
| **Automatic daily backups** | Supabase performs automated daily point-in-time backups. Retention is **7 days** on the free/pro tier, **30 days** on the Team/Enterprise tier. |
| **Point-in-Time Recovery (PITR)** | Available on paid Supabase plans — can restore the database to any specific second within the retention window. |
| **Manual SQL dumps** | The team can export a full `.sql` dump at any time via the Supabase dashboard or CLI (`supabase db dump`). Recommended before any major schema change. |
| **Supabase Storage backups** | File uploads (documents, photos) are stored in Supabase Storage (S3-compatible). These follow S3 durability standards (99.999999999% — eleven 9s). |
| **No on-premise backup** | There is currently no local/on-premise backup copy. This is a risk to document if offline backup is required by policy. |

### 4.5 Data Access & Security

- All database connections use **TLS encryption in transit**
- Data at rest is **AES-256 encrypted** (managed by Supabase/AWS)
- No direct database connection string is exposed to end users — all access goes through Supabase Auth + RLS
- Service Role Key (admin-level key) is stored as a secret environment variable, never in code

---

## 5. Hosting & Deployment

| Environment | Platform | URL |
|---|---|---|
| **Development** | Replit | `*.replit.dev` domain |
| **Production** | Vercel | Custom domain (`.replit.app` or configured domain) |
| **Database** | Supabase Cloud | `*.supabase.co` |
| **Edge Functions** | Supabase Edge | Deployed alongside the database |
| **File Storage** | Supabase Storage | Served via Supabase CDN |

### Deployment Flow
```
Developer writes code on Replit
        ↓
Git commit pushed
        ↓
Vercel auto-detects commit → builds React app
        ↓
Built static files deployed to Vercel CDN (global)
        ↓
Users access via browser or Android APK
```

---

## 6. Authentication & Access Control

| Feature | Implementation |
|---|---|
| **Login method** | Email + Password |
| **Multi-Factor Auth** | TOTP (Google Authenticator compatible) |
| **Session management** | JWT tokens (Supabase Auth), auto-refresh |
| **Role-based access** | Custom roles: Super Admin, Admin, Manager, Staff, Field Officer, Viewer, etc. |
| **Data isolation** | PostgreSQL Row Level Security — users cannot query data outside their scope |
| **Multiple sessions** | Supported (same user on multiple devices simultaneously) |
| **Password reset** | Email-based reset link via Supabase Auth |

---

## 7. Offline Capability

The platform is designed for field operations in low-connectivity environments:

| Feature | Technology Used |
|---|---|
| **Service Worker** | Caches app shell and static assets — app loads without internet |
| **IndexedDB** | Stores submitted forms, site visit data, and pending sync queue locally on the device |
| **Background Sync** | Queued submissions sync automatically when connectivity returns |
| **PWA Install** | Can be installed to phone home screen — works like a native app |
| **Android APK** | Full native offline support via Capacitor + device filesystem |

---

## 8. Integrations & Third-Party Services

| Service | Purpose | Protocol |
|---|---|---|
| **Supabase** | Database, Auth, Storage, Realtime | REST / WebSocket |
| **Vercel** | Frontend production hosting | CDN / HTTPS |
| **Firebase** | Push notifications to Android devices (FCM) | FCM / HTTPS |
| **IONOS SMTP** | Sending email notifications | SMTP / TLS |
| **WhatsApp (WaSender)** | WhatsApp message delivery | REST API |
| **Google Gemini AI** | AI-powered OCR, survey generation | REST API |
| **Groq AI** | Alternative AI for survey generation | REST API |
| **Microsoft Graph API** | Outlook Calendar integration | OAuth2 / REST |
| **Leaflet / OpenStreetMap** | Interactive maps, GPS tracking | Tile server |
| **QR Server API** | QR code generation for surveys | REST API |
| **Shorebird** | Over-the-air Android app updates | Binary patch |

---

## 9. Key Modules Summary

| Module | Description |
|---|---|
| **MMP & Site Visits** | Planning, assignment, GPS tracking, collector management, cycle close |
| **Finance / Accounting** | Full double-entry GL, budgeting, P2P cycle, fixed assets, multi-currency, donor reports |
| **HR & People** | Payroll, leave, performance, positions, contracts, EOSB, salary advances |
| **Projects** | 10 project types, Gantt chart, milestones, health scores, portfolio view |
| **Surveys** | 19 question types, skip logic, GPS, offline fill, AI generation, analytics |
| **CRM** | Partners, contacts, engagements, opportunities |
| **Notifications** | 60+ event types, in-app, email, WhatsApp, push, broadcast centre |
| **Audit & Compliance** | System audit logs, login analytics, hierarchy change tracking |
| **Reports** | PDF, Excel, CSV exports across all modules |
| **Admin** | User management, hub configuration, role assignment, system settings |

---

## 10. Estimated Scale & Performance Characteristics

| Metric | Detail |
|---|---|
| **Concurrent users** | Designed for 50–200 concurrent users |
| **Database tables** | ~150+ tables across all modules |
| **Supabase Realtime** | Live updates for notifications, MMP status, collaboration |
| **File uploads** | Documents, photos, PDFs — stored in Supabase Storage |
| **Mobile support** | Android 8+ (via APK), iOS via browser PWA |
| **Browser support** | Chrome 90+, Edge 90+, Firefox 88+, Safari 14+ |
| **Languages** | English + Arabic (RTL supported) |

---

## 11. Known Risks & Considerations for IT

| Risk | Status | Mitigation |
|---|---|---|
| No on-premise backup | Open | Set up scheduled `supabase db dump` to a secure server |
| Single cloud provider (Supabase) | Accepted | Supabase is AWS-backed with SLA; monitor uptime dashboard |
| Service Role Key management | Managed | Stored as encrypted environment secret, not in code |
| Edge Function cold starts | Low impact | ~200–500ms delay on first call after idle period |
| Mobile APK distribution | Manual | Currently side-loaded or internal distribution; not on Play Store |
| SMTP relay (IONOS) | Active | Monitor for bounce rates and spam scoring |

---

## 12. Technology Stack — One-Page Summary

```
FRONTEND          TypeScript + React 18 + Vite + Tailwind CSS + Shadcn UI
MOBILE            Capacitor 7 (Android APK wrapping the React web app)
BACKEND / DB      PostgreSQL 15 via Supabase (Auth + Realtime + Storage + Edge)
SERVER FUNCTIONS  Deno / TypeScript (Supabase Edge Functions)
HOSTING (PROD)    Vercel (Frontend CDN) + Supabase Cloud (Database/API)
HOSTING (DEV)     Replit
PUSH NOTIFY       Firebase Cloud Messaging (FCM)
EMAIL             IONOS SMTP relay
WHATSAPP          WaSender REST API
AI / OCR          Google Gemini 2.0 Flash + Groq
MAPS              Leaflet + OpenStreetMap tiles
OFFLINE           Service Worker + IndexedDB + Background Sync
AUTH              Supabase Auth (JWT + RLS + TOTP 2FA)
VERSION CONTROL   Git (managed via Replit)
CI/CD             Vercel auto-deploy on commit
```

---

*Document prepared from live codebase — May 2026. For questions contact the platform development team.*
