---
name: Senior Management Role
description: How the Senior Management role is wired into the app — covers type, permissions, role mapping, and sidebar visibility.
---

## Rule
`SeniorManagement` is a fully-wired AppRole: executive read + high-level approval, no system/dev/settings access.

**Why:** Users created via Role Management UI with "Senior Management" DB name now map through `normalizeRole()` → `'seniorManagement'` and get correct sidebar, permissions, and guards.

## How to apply
- Type: `AppRole` in `src/types/roles.ts` — `'SeniorManagement'` added between `'CountryDirector'` and `'ICT'`.
- Permissions: `DEFAULT_ROLE_PERMISSIONS.SeniorManagement` in same file — portfolio/analytics/projects (read+approve), all finance modules (read+approve), HR (read), operations (read), reports/CRM/tasks (read+limited create). No roles/settings/permissions resources.
- Role mapping: `src/utils/roleMapping.ts` — code `'seniorManagement'`, label `'Senior Management'`, legacy aliases include `'Senior Management'`, `'SeniorManagement'`, `'senior_management'`.
- Sidebar (`src/components/AppSidebar.tsx`) & nav (`src/navigation/menu.ts`): `isSeniorManagement = hasRole('seniorManagement')` used in: dashboard, canSeeProgrammeHub, MMP, finHubAccess/approvals/down-payment-approval, canSeeAnalytics, hrAdminAccess, hasCrmAccess, canSeeFieldDataHub. Deliberately NOT added to `canSeeAdmin` (no admin hub).
