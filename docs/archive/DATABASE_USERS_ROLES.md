# PACT Database - Users and Roles Tables

**Date:** November 21, 2025  
**Database:** PostgreSQL (Supabase)

---

## 📊 **Database Tables Overview**

Your system has **2 main tables** for user management:

1. **`profiles`** - Main users table
2. **`user_roles`** - User role assignments

**Current tables in database:**
```
✅ dashboard_settings
✅ data_visibility_settings
✅ mmp_files
✅ profiles (USERS TABLE)
✅ projects
✅ site_visits
✅ user_roles (ROLES TABLE)
✅ user_settings
```

---

## 👥 **1. PROFILES TABLE (Users)**

### **Table Structure:**

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key (references auth.users) |
| `email` | text | User email address |
| `username` | text | Username |
| `full_name` | text | Full name |
| `role` | text | Primary role |
| `avatar_url` | text | Profile picture URL |
| `hub_id` | text | Hub identifier |
| `state_id` | text | State identifier |
| `locality_id` | text | Locality identifier |
| `employee_id` | text | Employee ID |
| `phone` | text | Phone number |
| `status` | text | User status (pending/approved) |
| `availability` | text | User availability |
| `location` | jsonb | Location data |
| `location_sharing` | boolean | Location sharing enabled |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update timestamp |

### **Current Users (2 users):**

```sql
┌──────────────────────────────────────┬──────────────────┬──────────────┬──────────┬──────────┐
│ Email                                │ Full Name        │ Role         │ Status   │ Created  │
├──────────────────────────────────────┼──────────────────┼──────────────┼──────────┼──────────┤
│ admin@pact.com                       │ Admin User       │ admin        │ approved │ Nov 21   │
│ field@pact.com                       │ Field Manager    │ fom          │ approved │ Nov 21   │
└──────────────────────────────────────┴──────────────────┴──────────────┴──────────┴──────────┘
```

**User Details:**

**User 1: Admin**
- **ID:** 78823453-e551-4df9-ab2d-eceacc7fa3e8
- **Email:** admin@pact.com
- **Name:** Admin User
- **Role:** admin
- **Status:** approved
- **Created:** 2025-11-21 06:58:39

**User 2: Field Manager**
- **ID:** 98e66016-a862-4268-b3eb-c112401ab070
- **Email:** field@pact.com
- **Name:** Field Manager
- **Role:** fom (Field Operation Manager)
- **Status:** approved
- **Created:** 2025-11-21 06:58:39

---

## 🎭 **2. USER_ROLES TABLE**

### **Table Structure:**

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `user_id` | uuid | References profiles(id) |
| `role` | text | Role name |
| `created_at` | timestamptz | When role was assigned |

### **Current Data:**

```sql
┌──────────────────────┐
│ No role assignments  │
│ Table is empty       │
└──────────────────────┘
```

**Note:** The `user_roles` table is currently **empty**. Users are assigned roles via the `role` field in the `profiles` table instead.

---

## 🔐 **Available Roles in System**

Based on your codebase, here are **all available roles**:

### **System Roles (8 roles):**

| Role | Code | Description | Permissions Level |
|------|------|-------------|------------------|
| **Admin** | `admin` | System Administrator | 🔴 Full access to everything |
| **ICT** | `ict` | IT/Technical Admin | 🟠 User management, tech config |
| **Field Operation Manager** | `fom` | Field Operations Manager | 🟡 Field operations, MMP approval |
| **Financial Admin** | `financialAdmin` | Finance Administrator | 🟡 Finance approval, budget |
| **Supervisor** | `supervisor` | Field Supervisor | 🟢 Site oversight, MMP review |
| **Coordinator** | `coordinator` | Site Coordinator | 🟢 Site verification, coordination |
| **Data Collector** | `dataCollector` | Data Collector | 🔵 Data entry, basic access |
| **Reviewer** | `reviewer` | Content Reviewer | 🔵 Review submissions |

---

## 📋 **Role Permissions Breakdown**

### **Admin (Full Access):**
✅ All permissions on all resources
- Users: create, read, update, delete
- Roles: create, read, update, delete
- Permissions: create, read, update, delete
- Projects: create, read, update, delete
- MMP: create, read, update, delete, approve, archive
- Site Visits: create, read, update, delete
- Finances: read, update, approve
- Reports: read, create
- Settings: read, update

### **ICT:**
✅ Technical and user management
- Users: create, read, update
- Roles: create, read, update
- Permissions: read, update
- Projects: create, read, update
- MMP: create, read, update, approve, archive
- Site Visits: create, read, update

### **Field Operation Manager (FOM):**
✅ Field operations and approvals
- MMP: create, read, update, approve
- Site Visits: create, read, update, delete
- Projects: read
- Reports: read, create

### **Financial Admin:**
✅ Financial operations
- Finances: read, update, approve
- MMP: read, approve
- Projects: read
- Reports: read

### **Supervisor:**
✅ Supervision and oversight
- MMP: read, update
- Site Visits: create, read, update
- Projects: read
- Reports: read

### **Coordinator:**
✅ Site coordination
- Site Visits: create, read, update
- MMP: read
- Projects: read

### **Data Collector:**
✅ Basic data entry
- Site Visits: read
- MMP: read

### **Reviewer:**
✅ Review content
- Site Visits: read
- MMP: read

---

## 🔒 **Row Level Security (RLS)**

### **Profiles Table:**
- **Select:** Authenticated users can view all profiles
- **Update:** Users can only update their own profile

### **User_Roles Table:**
- **Select:** Anyone can view roles
- **Modify:** Only authenticated users can modify

---

## 📊 **Database Schema Code**

### **Profiles Table Creation:**

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text,
  full_name text,
  role text,
  avatar_url text,
  hub_id text,
  state_id text,
  locality_id text,
  employee_id text,
  phone text,
  status text default 'pending',
  availability text,
  location jsonb,
  location_sharing boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### **User_Roles Table Creation:**

```sql
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  role text not null,
  created_at timestamptz default now()
);
```

---

## 🎯 **Key Features**

### **1. Automatic Profile Creation:**
When a new user signs up via Supabase Auth, a trigger automatically creates their profile:

```sql
create or replace function public.handle_new_user()
returns trigger
-- Automatically creates profile with default role 'dataCollector'
```

### **2. Default Role:**
New users automatically get:
- **Role:** `dataCollector`
- **Status:** `pending` (needs approval)

### **3. Multiple Role Support:**
The system supports:
- **Primary role** in `profiles.role` column
- **Additional roles** in `user_roles` table (currently unused)

---

## 📈 **Usage Statistics**

**Current State:**
- **Total Users:** 2
- **Approved Users:** 2
- **Pending Users:** 0
- **Admin Users:** 1
- **Field Managers:** 1
- **Role Assignments:** 0 (user_roles table empty)

---

## 🔧 **How to Add New Users**

### **Option 1: Via Supabase Auth (Recommended)**
1. User signs up at `/auth` page
2. Profile auto-created with role `dataCollector`
3. Status set to `pending`
4. Admin approves user
5. Admin can change role

### **Option 2: Direct SQL Insert**
```sql
-- Insert into auth.users first (Supabase handles this)
-- Then profile is auto-created via trigger

-- Or manually insert:
INSERT INTO profiles (id, email, full_name, role, status)
VALUES (
  gen_random_uuid(),
  'newuser@pact.com',
  'New User',
  'dataCollector',
  'pending'
);
```

---

## 🔍 **Useful Queries**

### **Get all users with their roles:**
```sql
SELECT id, email, full_name, role, status, created_at
FROM profiles
ORDER BY created_at DESC;
```

### **Get users by role:**
```sql
SELECT * FROM profiles WHERE role = 'admin';
```

### **Get pending approvals:**
```sql
SELECT * FROM profiles WHERE status = 'pending';
```

### **Count users by role:**
```sql
SELECT role, COUNT(*) as count
FROM profiles
GROUP BY role;
```

---

## 💡 **Recommendations**

1. **Use user_roles table** for multiple role assignments
2. **Keep profiles.role** as primary/default role
3. **Implement approval workflow** for pending users
4. **Add role hierarchy** for better permission management
5. **Consider custom roles** for organization-specific needs

---

**Database Status:** ✅ Healthy  
**Total Tables:** 8  
**Users:** 2 (both approved)  
**Roles System:** Active and functional
