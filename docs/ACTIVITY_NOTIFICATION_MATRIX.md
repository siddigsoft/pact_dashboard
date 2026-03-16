# Activity → Notification Matrix

This document maps wallet, MMP, and site activities to notification creation. Used to ensure all activities create persistent notifications consistently.

## Wallet activities

| Activity | Trigger point | Current notification | Recipients | Category | Link | Gap |
|----------|---------------|----------------------|------------|----------|------|-----|
| Withdrawal submitted | WalletContext (submit) | None (toast only) | Admins/supervisors | financial | /finance-approval | Optional: notify approvers |
| Withdrawal supervisor approved | WalletContext (supervisorApprove) | withdrawalStatusChanged | Requester | financial | /wallet | OK |
| Withdrawal admin approved | WalletContext (adminProcess) | withdrawalStatusChanged | Requester | financial | /wallet | OK |
| Withdrawal rejected | WalletContext (reject/adminReject) | withdrawalStatusChanged | Requester | financial | /wallet | OK |
| Fund receipt confirmed | WalletContext (confirmFundReceipt) | withdrawalStatusChanged | Requester | financial | /wallet | OK |
| Wallet credited (site payment) | createSiteVisitWalletTransaction, DB trigger | None (toast only) | User paid | wallet | /wallet | **MISSING** – add walletCredited |
| Wallet debited | Manual admin adjustments | walletDebited exists but unused | User | wallet | /wallet | **MISSING** – wire if used |
| Low balance | (scheduled/check) | walletBalanceLow exists | User | wallet | /wallet | Optional |

## MMP activities

| Activity | Trigger point | Current notification | Recipients | Category | Link | Gap |
|----------|---------------|----------------------|------------|----------|------|-----|
| MMP upload complete | useMMPUpload, mmpFileUpload | mmpUploadComplete + notifyStakeholdersOnUpload | Uploader + FOM/supervisor/admin | system / assignments | /mmp/:id | OK |
| MMP upload failed | useMMPUpload | mmpUploadFailed | Uploader | system | - | OK |
| MMP forwarded to FOM | ForwardToFOMDialog | mmpForwardedToFOM | FOMs + admins | assignments | /mmp/:id | OK |
| MMP forwarded to coordinators (grouped) | ForwardToCoordinatorsDialog | mmpForwardedToCoordinators + notifyHubSupervisor | Coordinators + hub supervisor | assignments | /mmp/:id | OK |
| MMP forwarded to coordinators (non-grouped) | ForwardToCoordinatorsDialog | Raw insert + EmailNotificationService | Coordinators + forwarder | assignments | /mmp/:id | Prefer NotificationTriggerService |
| Reclaim from coordinator | ReclaimFromCoordinatorDialog | insertNotifications | Coordinators reclaimed from | assignments | /mmp | OK (could use trigger service) |
| Sites returned by coordinator | CoordinatorSites (return flows) | siteReturnedToFOM + raw insert to uploaded_by | FOM/supervisor + mmp uploaded_by | assignments | /mmp | Duplicate patterns – standardize |
| Permit verification / share | MMPPermitVerification, mmpFileUpload | insertNotifications | Admins, coordinators | approvals | /mmp | OK |

## Site activities

| Activity | Trigger point | Current notification | Recipients | Category | Link | Gap |
|----------|---------------|----------------------|------------|----------|------|-----|
| Site assigned (manual) | AssignCollectorButton | siteAssigned | Assignee | assignments | /mmp | OK |
| Site claimed | ClaimSiteButton | siteAssigned + siteClaimNotification | Claimer + coordinator/supervisor/admins | assignments | /mmp | OK |
| Site accepted | AcceptSiteButton | siteAssigned | Acceptor | assignments | /mmp | OK |
| Site auto-released | auto-release.service | siteAutoReleased | Former assignee | assignments | /mmp | OK |
| Site verified by coordinator | CoordinatorSites (handleVerifySite) | siteVerifiedByCoordinator | FOM | assignments | /mmp?site=:id | OK |
| Site rejected by coordinator | CoordinatorSites (handleRejectSite) | siteOperationNotification | Hub supervisor | approvals | /mmp | OK |
| Site returned to FOM (single/batch) | CoordinatorSites (handleReturnSingleSite, etc.) | siteReturnedToFOM | FOM/supervisor | assignments | /mmp | OK |
| Site visit completed | MMP.tsx handleCompleteVisit, handleSubmitVisitReport; SiteVisitContext | None (toast only) | Coordinator/supervisor/FOM | assignments | /mmp | **MISSING** – add siteVisitCompleted |
| Activity coverage update | SiteVisitContext (completeSiteVisit) | activityCoverageUpdate | Hub supervisor | assignments | /mmp | OK |
| Site sent back for editing | MMP.tsx | insertNotifications | Coordinator | assignments | /mmp | OK |
| Site returned without permit | MMP.tsx | insertNotifications | Coordinator | assignments | /mmp | OK |
| Returned site issue reported | MMP.tsx | insertNotifications | Admins | assignments | /mmp | OK |

## Notification creation patterns (preferred)

- **App-side**: Use `NotificationTriggerService.<method>(...)` for all wallet/MMP/site events so schema (recipient_id, event_type, entity_type, action_url) is consistent.
- **Bulk / legacy**: Use `insertNotifications(rows)` from `mmpActions.ts` when batching or migrating; prefer adding a NotificationTriggerService method and calling it in a loop instead of raw inserts.
- **DB/audit**: `notify_admins_on_audit_log` (see `supabase/migrations/20260308000000_fix_notify_audit_trigger.sql`) creates notifications for admin-facing audit events. It uses the full notifications schema (recipient_id, title_en, title_ar, message_en, message_ar, event_type, entity_type, entity_id, action_url, link, priority, type) and maps entity_type to action_url: `mmp_file`/`mmp%` → `/mmp/:id`, `site_visit`/`site%` → `/mmp?site=:id`, `transaction`/`wallet` → `/wallet`, `user` → `/users`, `project` → `/projects/:id`. Severity is mapped to priority and type. No code change needed for alignment.

## Single source of truth for wallet credit on completion

- **Notifications**: Application layer only. After `createSiteVisitWalletTransaction` succeeds, call `NotificationTriggerService.walletCredited(...)`. Do not add notification creation inside the DB trigger (avoids duplicate notifications when both app and trigger run).
- **Transaction creation**: Both app (`createSiteVisitWalletTransaction`) and DB trigger (`create_wallet_transaction_on_completion`) remain; duplicate check prevents double transactions.
