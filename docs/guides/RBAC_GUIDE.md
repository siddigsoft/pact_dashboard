# 🔐 PACT Role-Based Access Control (RBAC) Guide

**Complete Guide to Permissions and Access Control**

**Version:** 1.0  
**Last Updated:** November 23, 2025  
**Platform:** PACT Workflow Platform  
**Status:** Production Ready

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [User Roles](#user-roles)
3. [Permission System](#permission-system)
4. [Permission Matrix](#permission-matrix)
5. [How RBAC Works](#how-rbac-works)
6. [Assigning Roles](#assigning-roles)
7. [Custom Roles](#custom-roles)
8. [Security Policies](#security-policies)
9. [Implementation Guide](#implementation-guide)
10. [Troubleshooting](#troubleshooting)

---

## Overview

PACT uses a **granular, resource-action based permission system** with role-based access control. This allows precise control over who can do what in the system.

### **Key Features**

✅ **8 System Roles** - Predefined roles for common use cases  
✅ **Custom Roles** - Create roles for special scenarios  
✅ **Granular Permissions** - Control access at resource-action level  
✅ **Admin Bypass** - Admins always have full access  
✅ **Multi-Role Support** - Users can have multiple roles  
✅ **RLS Enforcement** - Database-level security policies  
✅ **Client-Side Guards** - UI elements hidden/shown based on permissions  

---

## User Roles

### **System Roles**

The platform defines 8 built-in roles with predefined permissions:

| Role | Code | Display Name | Purpose | Typical Users |
|------|------|--------------|---------|---------------|
| **Admin** | `admin` | Administrator | Full system access | System administrators |
| **ICT** | `ict` | ICT Admin | Technical administration | IT team members |
| **FOM** | `fom` | Field Operation Manager | Field operations oversight | Operation managers |
| **Financial Admin** | `financialAdmin` | Financial Administrator | Financial operations | Finance team |
| **Supervisor** | `supervisor` | Supervisor | Team supervision | Field supervisors |
| **Coordinator** | `coordinator` | Coordinator | Site coordination | Site coordinators |
| **Data Collector** | `dataCollector` | Data Collector | Data entry and collection | Field enumerators |
| **Reviewer** | `reviewer` | Reviewer | Review submissions | Quality control staff |

---

### **Role Hierarchy**

```
┌─────────────────────────────────────────┐
│         ADMIN (Full Access)             │
│                  ↓                      │
│         ICT (Technical Admin)           │
│         FOM (Field Operations)          │
│    FINANCIAL ADMIN (Finance Ops)        │
│                  ↓                      │
│         SUPERVISOR (Team Lead)          │
│                  ↓                      │
│        COORDINATOR (Site Coord)         │
│                  ↓                      │
│  DATA COLLECTOR (Field Staff)           │
│        REVIEWER (QC Staff)              │
└─────────────────────────────────────────┘
```

**Notes:**
- Higher roles generally have more permissions
- Some roles are lateral (FOM, Financial Admin)
- Hierarchy affects approval workflows

---

### **Role Details**

#### **1. Admin**

**Purpose:** Complete system control  
**Access Level:** Full (bypasses all checks)  
**Typical Count:** 1-3 users

**Capabilities:**
- ✅ Manage all users and roles
- ✅ Approve/reject any submission
- ✅ Access all financial operations
- ✅ Modify system settings
- ✅ View all data across projects
- ✅ Override any restriction

**Use Cases:**
- System configuration
- Emergency access
- Audit and compliance
- Critical troubleshooting

---

#### **2. ICT (Technical Admin)**

**Purpose:** Technical system management  
**Access Level:** High (similar to Admin for technical features)  
**Typical Count:** 2-5 users

**Capabilities:**
- ✅ Manage users (create, update, deactivate)
- ✅ Configure system settings
- ✅ Upload and verify MMPs
- ✅ Assign site visits
- ✅ View system logs
- ❌ Limited financial approvals

**Use Cases:**
- User account management
- System troubleshooting
- Data imports/exports
- Technical support

---

#### **3. FOM (Field Operation Manager)**

**Purpose:** Oversee field operations  
**Access Level:** Medium-High  
**Typical Count:** 3-8 users

**Capabilities:**
- ✅ Approve MMPs
- ✅ Assign site visits
- ✅ Review cost submissions
- ✅ Manage field teams
- ✅ Generate field reports
- ❌ Cannot modify system settings
- ❌ Limited user management

**Use Cases:**
- MMP approval workflow
- Site visit coordination
- Team performance monitoring
- Field operation reporting

---

#### **4. Financial Admin**

**Purpose:** Manage financial operations  
**Access Level:** Medium-High (finance-focused)  
**Typical Count:** 2-4 users

**Capabilities:**
- ✅ Approve cost submissions
- ✅ Process withdrawal requests
- ✅ Manage budgets
- ✅ View all transactions
- ✅ Generate financial reports
- ❌ Cannot approve MMPs
- ❌ Limited user management

**Use Cases:**
- Payment approvals
- Budget allocation
- Financial reporting
- Audit compliance

---

#### **5. Supervisor**

**Purpose:** Lead field teams  
**Access Level:** Medium  
**Typical Count:** 10-20 users

**Capabilities:**
- ✅ Manage assigned team members
- ✅ Review team submissions
- ✅ Approve subordinate withdrawals
- ✅ View team performance
- ✅ Assign tasks to team
- ❌ Cannot approve MMPs
- ❌ Limited budget access

**Use Cases:**
- Team leadership
- Quality control
- First-level approvals
- Performance reviews

---

#### **6. Coordinator**

**Purpose:** Coordinate site activities  
**Access Level:** Medium-Low  
**Typical Count:** 20-30 users

**Capabilities:**
- ✅ Manage site assignments
- ✅ Update site visit data
- ✅ Verify permits
- ✅ View assigned sites
- ❌ Cannot approve costs
- ❌ Limited financial access

**Use Cases:**
- Site assignment management
- Permit verification
- Data entry coordination
- Site-level reporting

---

#### **7. Data Collector**

**Purpose:** Collect field data  
**Access Level:** Low  
**Typical Count:** 50-100+ users

**Capabilities:**
- ✅ View assigned site visits
- ✅ Submit site visit data
- ✅ Upload photos/documents
- ✅ Submit cost claims
- ✅ View own wallet
- ✅ Request withdrawals
- ❌ Cannot approve anything
- ❌ See only own data

**Use Cases:**
- Field data collection
- Site visits
- Cost submission
- Document uploads

---

#### **8. Reviewer**

**Purpose:** Review and quality check  
**Access Level:** Medium-Low  
**Typical Count:** 5-10 users

**Capabilities:**
- ✅ Review cost submissions
- ✅ Flag issues
- ✅ Add review notes
- ✅ View submissions
- ❌ Cannot approve costs
- ❌ Limited modification rights

**Use Cases:**
- Quality assurance
- Data validation
- Review notes
- Issue flagging

---

## Permission System

### **How Permissions Work**

Permissions follow a **resource:action** format:

```
[resource]:[action]
```

**Examples:**
- `mmp:create` - Can create MMPs
- `site_visits:read` - Can view site visits
- `finances:approve` - Can approve financial transactions
- `users:delete` - Can delete users

---

### **Resources**

| Resource | Description | Examples |
|----------|-------------|----------|
| `users` | User accounts | Create, read, update user profiles |
| `roles` | Role management | Create custom roles, assign roles |
| `permissions` | Permission management | Modify role permissions |
| `projects` | Project data | Create, edit projects |
| `mmp` | Monthly Monitoring Plans | Upload, verify, approve MMPs |
| `site_visits` | Site visit records | Assign, complete visits |
| `finances` | Financial operations | Approve payments, manage budgets |
| `reports` | Reporting | Generate, view reports |
| `settings` | System settings | Configure system |

---

### **Actions**

| Action | Description | Applies To |
|--------|-------------|------------|
| `create` | Create new records | Most resources |
| `read` | View/access data | All resources |
| `update` | Modify existing data | Most resources |
| `delete` | Remove records | Most resources |
| `approve` | Approve submissions | MMPs, costs, withdrawals |
| `assign` | Assign tasks/users | Site visits, teams |
| `archive` | Archive old data | MMPs, projects |

---

## Permission Matrix

### **Complete Permission Mapping**

| Resource | Action | Admin | ICT | FOM | Financial | Supervisor | Coordinator | Collector | Reviewer |
|----------|--------|-------|-----|-----|-----------|------------|-------------|-----------|----------|
| **users** | create | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **users** | read | ✅ | ✅ | ✅ | ✅ | Own team | ❌ | Own only | ❌ |
| **users** | update | ✅ | ✅ | ❌ | ❌ | Own team | ❌ | Own only | ❌ |
| **users** | delete | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **roles** | create | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **roles** | update | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **roles** | delete | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **permissions** | create | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **permissions** | update | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **projects** | create | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **projects** | read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Assigned | ✅ |
| **projects** | update | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **mmp** | create | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **mmp** | read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Assigned | ✅ |
| **mmp** | update | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **mmp** | approve | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **mmp** | archive | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **site_visits** | create | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| **site_visits** | read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Own only | ✅ |
| **site_visits** | update | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | Own only | ❌ |
| **site_visits** | assign | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| **finances** | read | ✅ | ✅ | ✅ | ✅ | Own team | ❌ | Own only | ✅ |
| **finances** | update | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **finances** | approve | ✅ | ❌ | ✅ | ✅ | Limited | ❌ | ❌ | ❌ |
| **reports** | read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Own only | ✅ |
| **reports** | create | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **settings** | read | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **settings** | update | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Legend:**
- ✅ = Full access
- ❌ = No access
- "Own only" = Access to own data only
- "Own team" = Access to team members' data
- "Assigned" = Access to assigned items only
- "Limited" = Restricted access (e.g., small amounts)

---

## How RBAC Works

### **Multi-Layer Security**

PACT enforces permissions at three levels:

```
┌─────────────────────────────────────────┐
│  1. CLIENT-SIDE (UI Guards)             │
│     - Hide/show buttons                 │
│     - Route protection                  │
│     - Menu visibility                   │
├─────────────────────────────────────────┤
│  2. API LAYER (Future)                  │
│     - Endpoint authorization            │
│     - Request validation                │
├─────────────────────────────────────────┤
│  3. DATABASE (RLS Policies)             │
│     - Row-level security                │
│     - Query filtering                   │
│     - Data isolation                    │
└─────────────────────────────────────────┘
```

---

### **Permission Check Flow**

```
User Action Request
        │
        ▼
┌──────────────────┐
│ Client checks    │ ← useAuthorization hook
│ checkPermission()│
└──────────────────┘
        │
        ├─── ❌ No Permission → UI disabled
        │
        ✅ Has Permission
        │
        ▼
┌──────────────────┐
│ API Call (Future)│
└──────────────────┘
        │
        ▼
┌──────────────────┐
│ Database RLS     │ ← Supabase policies
│ Policy Check     │
└──────────────────┘
        │
        ├─── ❌ Policy Denies → Error
        │
        ✅ Policy Allows
        │
        ▼
    Action Succeeds
```

---

## Assigning Roles

### **Method 1: During User Creation**

When creating a new user:

1. **Admin/ICT creates user account**
2. **Selects primary role** from dropdown
3. **User receives credentials**
4. **Automatic role assignment** to `user_roles` table

---

### **Method 2: Via User Management Page**

For existing users:

1. Navigate to **Users** page
2. Find user in list
3. Click **Edit** button
4. Update **Role** field
5. Click **Save**

---

### **Method 3: Multiple Role Assignment**

Users can have multiple roles:

```typescript
// Assign additional role
await assignRoleToUser({
  user_id: 'user-uuid',
  role: 'reviewer' // Additional role
});

// User now has both DataCollector AND Reviewer permissions
```

---

### **Method 4: Database Direct**

For admins with database access:

```sql
-- Assign system role
INSERT INTO user_roles (user_id, role)
VALUES ('user-uuid', 'supervisor');

-- Assign custom role
INSERT INTO user_roles (user_id, role_id)
VALUES ('user-uuid', 'custom-role-uuid');
```

---

## Custom Roles

### **When to Use Custom Roles**

Create custom roles when:

✅ **Unique permission needs** - No system role fits  
✅ **Temporary access** - Project-specific roles  
✅ **External users** - Partners, auditors  
✅ **Specialized workflows** - Custom approval chains  

---

### **Creating Custom Roles**

**Step 1: Define Role**

```typescript
const newRole = {
  name: 'external_auditor',
  display_name: 'External Auditor',
  description: 'Read-only access for external audits',
  is_system_role: false
};
```

**Step 2: Add Permissions**

```typescript
const permissions = [
  { resource: 'mmp', action: 'read' },
  { resource: 'finances', action: 'read' },
  { resource: 'reports', action: 'read' },
  { resource: 'site_visits', action: 'read' }
];
```

**Step 3: Create Role**

```typescript
const role = await createRole({
  ...newRole,
  permissions
});
```

**Step 4: Assign to Users**

```typescript
await assignRoleToUser({
  user_id: 'auditor-user-id',
  role_id: role.id
});
```

---

### **Custom Role Examples**

#### **Example 1: Project Manager**

```typescript
{
  name: 'project_manager',
  display_name: 'Project Manager',
  permissions: [
    { resource: 'projects', action: 'create' },
    { resource: 'projects', action: 'read' },
    { resource: 'projects', action: 'update' },
    { resource: 'mmp', action: 'read' },
    { resource: 'site_visits', action: 'read' },
    { resource: 'reports', action: 'create' }
  ]
}
```

#### **Example 2: Budget Analyst**

```typescript
{
  name: 'budget_analyst',
  display_name: 'Budget Analyst',
  permissions: [
    { resource: 'finances', action: 'read' },
    { resource: 'projects', action: 'read' },
    { resource: 'reports', action: 'create' }
  ]
}
```

---

## Security Policies

### **Row Level Security (RLS)**

All tables enforce RLS policies:

**General Pattern:**
```sql
-- Admins see everything
CREATE POLICY admin_full_access ON table_name
  FOR ALL USING (is_admin(auth.uid()));

-- Users see own data
CREATE POLICY users_own_data ON table_name
  FOR SELECT USING (user_id = auth.uid());

-- Role-based access
CREATE POLICY role_based_access ON table_name
  FOR SELECT USING (has_permission('resource', 'read'));
```

---

### **Data Isolation Rules**

1. **Data Collectors** see only:
   - Own profile
   - Assigned site visits
   - Own wallet transactions
   - Own cost submissions

2. **Supervisors** see:
   - Own data
   - Direct team members' data
   - Assigned project data

3. **Admins** see:
   - Everything (no restrictions)

---

## Implementation Guide

### **Frontend: Permission Checks**

#### **Using `useAuthorization` Hook**

```typescript
import { useAuthorization } from '@/hooks/use-authorization';

function MyComponent() {
  const { checkPermission, hasAnyRole } = useAuthorization();
  
  const canCreateMMP = checkPermission('mmp', 'create');
  const isAdmin = hasAnyRole(['admin']);
  
  return (
    <div>
      {canCreateMMP && (
        <Button onClick={createMMP}>Upload MMP</Button>
      )}
      {isAdmin && (
        <Button onClick={adminAction}>Admin Only</Button>
      )}
    </div>
  );
}
```

---

#### **Route Protection**

```typescript
import { Navigate } from 'react-router-dom';
import { useAuthorization } from '@/hooks/use-authorization';

function ProtectedRoute({ children, resource, action }) {
  const { checkPermission } = useAuthorization();
  
  if (!checkPermission(resource, action)) {
    return <Navigate to="/unauthorized" />;
  }
  
  return children;
}

// Usage
<Route path="/mmp/upload" element={
  <ProtectedRoute resource="mmp" action="create">
    <MMPUploadPage />
  </ProtectedRoute>
} />
```

---

#### **Conditional Rendering**

```typescript
const { checkPermission, hasAnyRole } = useAuthorization();

// Hide entire sections
{checkPermission('finances', 'read') && (
  <FinancialDashboard />
)}

// Disable buttons
<Button 
  disabled={!checkPermission('mmp', 'approve')}
  onClick={handleApprove}
>
  Approve MMP
</Button>

// Show different UI for roles
{hasAnyRole(['admin', 'ict']) ? (
  <AdminPanel />
) : (
  <UserPanel />
)}
```

---

### **Backend: Database Policies**

#### **Creating RLS Policies**

```sql
-- Enable RLS
ALTER TABLE site_visit_cost_submissions 
ENABLE ROW LEVEL SECURITY;

-- Policy 1: Admins see all
CREATE POLICY admin_all_access 
ON site_visit_cost_submissions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'ict')
    )
  );

-- Policy 2: Users see own submissions
CREATE POLICY users_own_submissions
ON site_visit_cost_submissions
  FOR SELECT
  TO authenticated
  USING (submitted_by = auth.uid());

-- Policy 3: Finance can approve
CREATE POLICY finance_approve
ON site_visit_cost_submissions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'financialAdmin', 'fom')
    )
  );
```

---

## Troubleshooting

### **Issue: "Permission Denied"**

**Symptoms:**
- User cannot access page
- Button is disabled
- API returns 403 error

**Solutions:**

1. **Check user's roles:**
   ```sql
   SELECT * FROM user_roles WHERE user_id = 'user-uuid';
   ```

2. **Verify permission exists:**
   ```sql
   SELECT p.* FROM permissions p
   JOIN user_roles ur ON ur.role_id = p.role_id
   WHERE ur.user_id = 'user-uuid'
   AND p.resource = 'mmp'
   AND p.action = 'create';
   ```

3. **Check RLS policies:**
   - Go to Supabase Dashboard → Authentication → Policies
   - Review policies for the table
   - Temporarily disable RLS (dev only) to test

---

### **Issue: "User Has Wrong Permissions"**

**Solutions:**

1. **Update user role:**
   ```sql
   UPDATE user_roles 
   SET role = 'supervisor'
   WHERE user_id = 'user-uuid' AND role = 'dataCollector';
   ```

2. **Add additional role:**
   ```sql
   INSERT INTO user_roles (user_id, role)
   VALUES ('user-uuid', 'reviewer');
   ```

---

### **Issue: "Custom Role Not Working"**

**Checklist:**

□ Role created in `roles` table  
□ Permissions added to `permissions` table  
□ Role assigned in `user_roles` table  
□ RLS policies updated to include custom roles  
□ Client app refreshed (clear cache)  

---

## Quick Reference

### **Common Permission Checks**

```typescript
// Can user create MMPs?
checkPermission('mmp', 'create')

// Can user approve costs?
checkPermission('finances', 'approve')

// Can user manage users?
checkPermission('users', 'update')

// Is user admin?
hasAnyRole(['admin', 'ict'])

// Is user finance team?
hasAnyRole(['admin', 'financialAdmin', 'fom'])
```

---

### **Common Role Queries**

```sql
-- Get all user's roles
SELECT r.display_name, ur.assigned_at
FROM user_roles ur
LEFT JOIN roles r ON r.id = ur.role_id
WHERE ur.user_id = 'user-uuid';

-- Get all permissions for a role
SELECT resource, action 
FROM permissions 
WHERE role_id = 'role-uuid';

-- Find who has specific permission
SELECT DISTINCT p.full_name, p.email
FROM profiles p
JOIN user_roles ur ON ur.user_id = p.id
JOIN permissions perm ON perm.role_id = ur.role_id
WHERE perm.resource = 'mmp' 
AND perm.action = 'approve';
```

---

**Last Updated:** November 23, 2025  
**Maintained By:** PACT Development Team  
**Questions?** Contact your system administrator

---

*This guide covers the complete RBAC system. For database-level details, see the Database Schema Guide.*
