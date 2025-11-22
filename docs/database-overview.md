# Database Interaction Guide (Supabase)

This project uses Supabase for database, authentication, storage and realtime. This guide gives a practical overview for junior devs: where to find DB code, the key functions, and the patterns to follow when adding new features.

## TL;DR
- Import the Supabase client from `@/integrations/supabase/client` in new code.
- Put raw DB calls in domain helpers/services (not in React components).
- Map DB snake_case fields to frontend camelCase in one place.
- Use `.single()` when you expect exactly one row; always check `error`.
- For realtime, use `supabase.channel(...).on('postgres_changes', ...)` and `removeChannel` on cleanup.
- For storage, use `supabase.storage.from(<bucket>)` to `upload`, `list`, `getPublicUrl`.

---

## Supabase Client(s)

- **Primary client**
  - Path: `src/integrations/supabase/client.ts`
  - Exports: `supabase`
  - Reads env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
  - Auth config: `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: true`

- **Secondary (legacy/utility) client**
  - Path: `src/lib/supabase.ts`
  - Used by: `src/hooks/useSessionTimeout.ts` for sign-out
  - Recommendation: new code should prefer `@/integrations/supabase/client`

---

## Where DB Interaction Lives (by domain)

- **Site Visits**
  - Path: `src/context/siteVisit/supabase.ts`
  - Functions:
    - `fetchSiteVisits()` – `select *` from `mmp_site_entries`, transforms snake_case→camelCase
    - `createSiteVisitInDb(partial)` – insert into `mmp_site_entries`, returns transformed row
    - `updateSiteVisitInDb(id, updates)` – partial update with nested `additional_data`
    - `deleteSiteVisitInDb(id)` – delete
  - Path: `src/context/siteVisit/SiteVisitContext.tsx`
    - Orchestrates create/update flows, auto-assignment logic (extra queries to `profiles`, `user_roles`, active work from `mmp_site_entries`) and notifications

- **Monthly Monitoring Plan (MMP)**
  - Path: `src/context/mmp/MMPContext.tsx`
    - Loads `mmp_files` with nested `projects`
    - Helpers to update/soft-delete/restore/reset records, transform fields
  - Path: `src/utils/mmpFileUpload.ts`
    - Storage upload to bucket `mmp-files`
    - Gets public URL, parses CSV, inserts into `mmp_files` with site entries
    - Uses timeouts for storage upload and DB insert; cleans up storage on insert failure
  - Path: `src/components/FileUpload.tsx`
    - Generic storage uploader component (bucket param, `upload`, `getPublicUrl`)
  - Path: `src/components/MMPPermitVerification.tsx`
    - Lists permit files from storage (`list`), builds public URLs, persists permit metadata back to `mmp_files`

- **Wallets / Earnings / Payouts**
  - Path: `src/context/wallet/supabase.ts`
    - `getMyWalletSummary`, `listMyTransactions`, `listMyEarnings`
    - Admin ops: `adminListWallets`, `adminGetWalletDetail`, `adminListPayoutRequests`, `adminAdjustBalance`, `adminApprovePayout`, `adminDeclinePayout`, `adminMarkPayoutPaid`
  - Path: `src/context/wallet/WalletContext.tsx`
    - Wraps those helpers; realtime subscriptions to `wallets`, `wallet_transactions`, `payout_requests`

- **Projects**
  - Path: `src/context/project/ProjectContext.tsx`
    - CRUD for `projects`, nested `project_activities` and `sub_activities`
    - Maps DB types to `Project` domain model

- **Users / Auth**
  - Path: `src/context/user/UserContext.tsx`
    - Supabase `auth` flows (sign-in, resend verification, session bootstrap)
    - Reads `profiles`, `user_roles`, maps to app `User`
  - Path: `src/pages/Users.tsx`
    - Admin actions to clear/assign roles via `user_roles` and update `profiles.role`
  - Path: `src/hooks/useSessionTimeout.ts`
    - Uses `supabase.auth.signOut()` on inactivity

- **Roles & Permissions**
  - Path: `src/context/role-management/RoleManagementContext.tsx`
    - RPC calls: `get_roles_with_permissions`, `get_user_permissions`
    - `permissions` upsert self-heal for admin role

- **Chat / Messaging**
  - Path: `src/services/ChatService.ts`
    - Tables: `chats`, `chat_messages`, `chat_participants`, `chat_message_reads`
    - CRUD methods and utilities; realtime subscription helpers
  - Path: `src/context/chat/ChatContextSupabase.tsx`
    - Uses `ChatService`, manages realtime channels and client state

- **Notifications**
  - Path: `src/context/notifications/NotificationContext.tsx`
    - Persists app notifications to `notifications` table (fire-and-forget)

- **Reports**
  - Path: `src/pages/Reports.tsx`
    - Reads `mmp_site_entries`, `mmp_files`, `projects`, `profiles` with date filters and ordering

- **Debug Utilities**
  - Path: `src/utils/debug-db.ts`
    - `debugDatabase()` probes connection, key tables, and RPC function

---

## Common Patterns & Conventions

- **Field mapping (snake_case ↔ camelCase)**
  - Keep mapping logic centralized per domain (e.g., Site Visits, MMP)
  - Example: `site_name` ↔ `siteName`, `uploaded_at` ↔ `uploadedAt`, `file_url` ↔ `fileUrl`

- **Queries**
  - `.from('<table>').select('*')` and filter with `.eq`, `.in`, `.gte`, `.lte`, `.order`, `.range`
  - Call `.single()` when expecting one row to get a single object and to surface errors if 0/>1 rows
  - Always check `{ error }` and handle it (toast/log/throw)

- **Auth & RLS Guarding**
  - Many queries rely on RLS policies tied to the signed-in user
  - Pattern: get session first; if no session, skip fetching to avoid RLS errors
    - See `refreshUsers()` in `UserContext` for an example guard

- **Realtime**
  - Subscribe: `supabase.channel('name').on('postgres_changes', { event, schema, table, filter }, handler).subscribe()`
  - Unsubscribe: keep a reference to the channel and `supabase.removeChannel(channel)` on cleanup
  - Used in: Wallet updates, Chat messages, Message read receipts

- **Storage**
  - Upload: `supabase.storage.from(bucket).upload(path, file)`
  - Public URL: `supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl`
  - List: `supabase.storage.from(bucket).list(path, { ... })`
  - Remove: `supabase.storage.from(bucket).remove([path])`
  - Buckets used: `mmp-files` (MMP documents and permit files)
  - Path conventions (permits): `permits/{mmpId}/federal|state|local/...`

- **Timeouts & Cleanup**
  - For long operations, we use `Promise.race` timeouts (e.g., storage upload/DB insert in `mmpFileUpload.ts`)
  - If DB insert fails after upload, we remove the storage file to avoid orphaned objects

---

## Tables & RPC Used (quick reference)

- **Tables**
  - `mmp_site_entries`, `mmp_files`, `notifications`
  - `projects`, `project_activities`, `sub_activities`
  - `profiles`, `user_roles`, `roles`, `permissions`
  - `wallets`, `wallet_transactions`, `payout_requests`
  - `chats`, `chat_messages`, `chat_participants`, `chat_message_reads`

- **RPC Functions**
  - `get_roles_with_permissions`
  - `get_user_permissions`

---

## Adding a New DB Feature (recommended approach)

- **1) Decide the layer**
  - Prefer a domain helper/service file: `src/context/<domain>/supabase.ts` or `src/services/<Domain>Service.ts`
  - Keep components thin; contexts manage state and call helpers

- **2) Implement with mappings**
  - Translate camelCase ↔ snake_case at the boundary. Return domain types to the rest of the app

- **3) Handle auth & errors**
  - Guard RLS-protected reads with session checks when appropriate
  - Always check `error`; propagate or surface via toasts

- **4) Consider realtime**
  - If the UI should auto-update, add a channel subscription for the relevant table

- **5) Storage, if needed**
  - Use a clear folder structure and ensure you clean up on failure

- **6) Test & debug**
  - Use `debugDatabase()` from `src/utils/debug-db.ts` (available as `window.debugDatabase` in the browser)

---

## Example Snippets

- **Simple select with guard**
```ts
const { data: { session } } = await supabase.auth.getSession();
if (!session) return [];
const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
if (error) throw error;
return data;
```

- **Realtime subscription and cleanup**
```ts
const ch = supabase
  .channel('wallet_tx')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${userId}` }, refresh)
  .subscribe();

return () => { try { supabase.removeChannel(ch); } catch {} };
```

- **Storage upload and public URL**
```ts
const { error } = await supabase.storage.from('mmp-files').upload(filePath, file);
if (error) throw error;
const publicUrl = supabase.storage.from('mmp-files').getPublicUrl(filePath).data.publicUrl;
```

---

## Schema Source of Truth

For DB schema, functions, and policies, check the `supabase/` folder:
- Migrations: `supabase/migrations/`
- Full schema snapshot: `supabase/schema.sql`
- Storage policies: `supabase/storage_policies.sql`

Keeping frontend mappings in sync with these files helps avoid runtime issues.

---

## When in Doubt
- Search for `import { supabase }` or `.from('...')` to locate existing patterns to copy.
- Follow the closest domain’s helper/service structure.
- Prefer `@/integrations/supabase/client` for the client import in new code.
