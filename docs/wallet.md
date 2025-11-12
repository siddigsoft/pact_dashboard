# Wallet Logic and Transaction Lifecycle

Last updated: 2025-11-12

This document explains how the wallet works in this codebase: how funds are received, how withdrawals are requested and processed, how balances are calculated, what gets stored where, and the current gaps (notably “send/transfer” is not implemented).


## Overview

- **State/logic provider**
  - `src/context/wallet/WalletContext.tsx`
  - Exposes `transactions`, `withdrawFunds()`, `addTransaction()`, `getTransactionsByUserId()`, `getPendingWithdrawals()`.
- **UI entry point**
  - `src/pages/Wallet.tsx` shows balance, stats, history, and payment methods.
  - `src/components/WithdrawDialog.tsx` collects withdrawal inputs and invokes `withdrawFunds()`.
  - `src/components/PaymentMethodForm.tsx` captures bank details.
  - `src/components/TransactionHistory.tsx` and `src/components/TransactionCard.tsx` render transactions.
  - `src/components/WalletBalance.tsx` displays the balance and simple budget tracking.
- **Credits source (Receive money)**
  - `src/context/siteVisit/SiteVisitContext.tsx` calls `addTransaction()` with a credit when a site visit is completed.
- **Settings and bank details persistence**
  - `src/context/settings/SettingsContext.tsx` reads/writes `wallet_settings` (Supabase).
  - User profile bank account is stored in `profiles.bank_account` (JSON) via `src/context/user/UserContext.tsx` `updateUser()`.


## Data model

- Type: `src/types/financial.ts` `Transaction`
  - `id: string`
  - `userId: string`
  - `amount: number`
  - `currency: string`
  - `type: 'credit' | 'debit'`
  - `status: 'pending' | 'completed' | 'failed' | 'disputed' | 'approved' | 'paid'`
  - `description: string`
  - `createdAt: string`
  - Optional: `method`, `reference`, `siteVisitId`, `operationalCosts`, `taskDetails`, `bankDetails`


## Persistence and fallbacks

- The app attempts to persist transactions to Supabase table `wallet_transactions`.
  - Reads/writes happen in `WalletContext` via `supabase.from('wallet_transactions')`.
  - If the DB call fails or the table is missing, it falls back to in-memory state initialized from `src/data/mockTransactions.ts`.
- Wallet settings are stored in table `wallet_settings`.
  - `notification_prefs` can include `bank_account` (used by the UI as a convenient place to persist bank details alongside the profile record).
- User bank account is also stored in `profiles.bank_account`.

Note: As of this code snapshot, `wallet_transactions` is referenced in code but not defined in the provided Supabase schema/types. In that case, DB operations will fail and the context will fall back to mock/local state.


## Balance calculation

- Displayed balance on the Wallet page is computed, not read from a single DB column.
  - `src/pages/Wallet.tsx` computes: sum of all current user transactions with `status === 'completed'` where credits add and debits subtract.
  - `WalletBalance` also computes simple “budget” metrics from the same transaction list.
- `UserContext.updateUserBalance()` adjusts `currentUser.wallet.balance` after successful credits, but the UI relies on the transactions-derived balance for display.


## Receiving money (Credits)

Trigger: Completing a site visit

- Flow (in `SiteVisitContext.completeSiteVisit`):
  1. Validate permissions and visit status, mark the visit `completed`.
  2. Build a credit transaction:
     - `type: 'credit'`
     - `amount: siteVisit.fees.total`
     - `currency: siteVisit.fees.currency`
     - `status: 'completed'`
     - `description: Payment for completing Site Visit: {siteName}`
     - `siteVisitId: {visitId}`
     - `method: 'Wallet'`
     - `reference: PAY-{siteVisitId}-{random}`
  3. Call `WalletContext.addTransaction()` to persist the credit:
     - First tries Supabase insert into `wallet_transactions`.
     - On failure, falls back to local state.
  4. If credit is for the currently logged in user and `status === 'completed'`, the code increments `currentUser.wallet.balance` locally.
  5. Send notifications:
     - To the assignee: “Payment Received …”.
  6. UI updates:
     - The credit appears in history; computed balance increases accordingly.


## Withdrawing money (Debits)

Initiation: Wallet page → Withdraw button → `WithdrawDialog`

- Input collection (`WithdrawDialog`):
  - Validates a positive `amount`.
  - Supports methods: Bank Transfer, Bank of Khartoum (Bankak), PayPal, Mobile Money.
  - For Bank of Khartoum, if no bank details exist on the user, the dialog prompts for details using `PaymentMethodForm`.
  - On submit, calls `WalletContext.withdrawFunds(amount, method, bankDetails?)`.

- Business rules (`WalletContext.withdrawFunds`):
  1. User must be authenticated.
  2. Compute `availableBalance` from completed transactions (credits − debits).
     - If `availableBalance < amount`, show “Insufficient funds” and abort.
  3. Role-based status:
     - If user role is `coordinator` or `dataCollector` ⇒ create a `debit` transaction with `status: 'pending'` (requires admin approval).
     - Else (e.g., finance/admin/ICT) ⇒ create a `debit` transaction with `status: 'completed'`.
  4. Persist the debit:
     - Attempt Supabase insert into `wallet_transactions` with fields: `user_id`, `amount`, `currency`, `type: 'debit'`, `status`, `description`, `created_at`, `method`, `reference`, and optional `bank_details`.
     - On failure, fall back to local state with a generated ID.
  5. Notifications:
     - If `pending`, notify admins: “Withdrawal Approval Required …” with link `/admin/transactions/{id}`.
     - Notify requester: “Withdrawal request submitted …” or “Withdrawal successful”.
  6. UI updates:
     - The withdrawal appears in history with `pending` or `completed` status.
     - Balance is based on completed transactions, so it decreases immediately only for completed debits.

- Storing payment methods:
  - `Wallet` page’s “Payment Methods” section can add/edit details.
  - `handleAddPaymentMethod` updates both:
    - User profile: `profiles.bank_account` (via `UserContext.updateUser`).
    - Wallet settings: `wallet_settings.notification_prefs.bank_account` (via `SettingsContext.updateWalletSettings`).

- Approval flow:
  - The code sends notifications to admins for pending withdrawals, but no admin UI/route is implemented in this snapshot to transition `pending → approved/paid`.
  - The notification link points to `/admin/transactions/{id}`, which appears not to exist yet.


## Sending/Transferring money (P2P)

- Current status: There is no “send” or “transfer to another user” functionality implemented in the wallet code.
- What exists instead: Earnings are credited via site visits; debits occur via withdrawals.
- If you want to add “send/transfer”:
  - Add a `transferFunds(fromUserId, toUserId, amount, memo)` to `WalletContext` which would:
    - Validate `fromUserId` balance (completed credits − debits ≥ amount).
    - Create two transactions atomically (in a single DB transaction/RPC):
      - `debit` for the sender.
      - `credit` for the recipient.
    - Prefer a Supabase function/RPC for atomicity to avoid partial writes.
  - Add a simple UI dialog similar to `WithdrawDialog` to collect recipient and amount.


## Roles and permissions

- Withdrawal status is role-sensitive:
  - `coordinator`, `dataCollector` ⇒ `pending` (needs admin approval).
  - Admin/finance/ICT ⇒ immediately `completed`.
- Note: In `WithdrawDialog` a role comparison includes both `dataCollector` and `datacollector`, while `WalletContext` checks only `dataCollector`. If any users have the lowercased role `datacollector`, their withdrawal may be treated as “non-pending”. Consider normalizing role values.


## Error handling and UX

- DB failures: The context logs a warning and continues with local state so the UI remains responsive.
- Validation: Amount must be a positive number; insufficient funds blocks withdrawal.
- Toasts and notifications are used throughout to give feedback.


## Known gaps and recommendations

- `wallet_transactions` schema: Not found in provided schema/types; add a migration so DB persistence works end-to-end.
- Admin approval UI: Missing screens/actions to list and approve pending withdrawals.
- Role normalization: Ensure consistent role casing/values across contexts.
- Currency consistency: Wallet page sometimes falls back to `SDG`; user profile defaults to `USD`. Decide on a canonical currency or per-user setting.
- P2P Send/Transfer: Not implemented; see the recommendation above.


## Expected Supabase table (reference)

If not already present, the app expects a `public.wallet_transactions` table with fields similar to:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid references public.profiles(id)`
- `amount numeric not null`
- `currency text not null`
- `type text check (type in ('credit','debit')) not null`
- `status text check (status in ('pending','completed','failed','disputed','approved','paid')) not null`
- `description text`
- `created_at timestamptz default now()`
- `method text`
- `reference text`
- `site_visit_id uuid references public.site_visits(id)`
- `operational_costs jsonb`
- `task_details jsonb`
- `bank_details jsonb`

Apply RLS policies so non-finance users can only see their own transactions, while finance/admins can see all.


## File map

- `src/context/wallet/WalletContext.tsx` — core wallet logic (load, add, withdraw, notify)
- `src/pages/Wallet.tsx` — wallet UI and balance computation
- `src/components/WithdrawDialog.tsx` — collects withdrawal inputs and triggers `withdrawFunds`
- `src/components/PaymentMethodForm.tsx` — bank details capture
- `src/components/TransactionHistory.tsx` — list + filters
- `src/components/TransactionCard.tsx` — transaction item view
- `src/components/WalletBalance.tsx` — balance and budget panel
- `src/context/siteVisit/SiteVisitContext.tsx` — emits credit on completion
- `src/context/settings/SettingsContext.tsx` — reads/writes `wallet_settings`
- `src/context/user/UserContext.tsx` — persists profile bank account and adjusts local wallet balance
