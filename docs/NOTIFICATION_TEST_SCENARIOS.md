# Notification Test Scenarios

Use these scenarios to verify that each activity creates the expected persistent notification(s). After each action, check the `notifications` table (Supabase dashboard or API) for a new row with the expected recipient, category/link, and no duplicate for the same user/action.

## Wallet

| # | Action | Steps | Expected notification(s) |
|---|--------|--------|---------------------------|
| W1 | Site completion payment | Complete a site visit (MMP flow: complete visit + submit report) so that `createSiteVisitWalletTransaction` runs. | One row: `recipient_id` = user paid, `event_type`/category wallet, title "Wallet Credited", `action_url`/link `/wallet`, `related_entity_type` wallet. |
| W2 | Admin credit adjustment | As admin, open a user wallet and apply a manual credit adjustment. | One row: recipient = that user, "Wallet Credited", link `/wallet`. |
| W3 | Admin debit adjustment | As admin, apply a manual debit adjustment. | One row: recipient = that user, "Wallet Debited", link `/wallet`. |
| W4 | Withdrawal status change | Submit withdrawal → supervisor approve → admin process (or reject at any step). | One row per status change to the requester: "Withdrawal Approved", "Withdrawal Rejected", or "Withdrawal Pending Final Approval", link `/wallet`. |

## MMP

| # | Action | Steps | Expected notification(s) |
|---|--------|--------|---------------------------|
| M1 | MMP upload | Upload an MMP (CSV) successfully. | Uploader: "MMP Upload Complete"; FOM/supervisor/admin: "New MMP uploaded" (from notifyStakeholdersOnUpload). |
| M2 | Forward MMP to FOM | From MMP detail, forward the MMP to one or more FOMs. | Each FOM: "MMP Forwarded to You", link `/mmp/:id`. |
| M3 | Forward sites to coordinators (grouped) | Forward sites by locality to selected coordinators. | Each coordinator: "Sites forwarded to you" (or "MMP forwarded to you" in MMP-level path); forwarder: "Sites forwarded" / "MMP forwarded"; hub supervisor via notifyHubSupervisor. |
| M4 | Bulk clear forwarded | Use Bulk Clear Forwarded to reset MMP(s). | Admin who performed: "Forwarded sites cleared", link `/mmp`. |

## Site

| # | Action | Steps | Expected notification(s) |
|---|--------|--------|---------------------------|
| S1 | Site assigned | Assign a site to a data collector (AssignCollectorButton or equivalent). | Assignee: "New Site Assignment", link `/mmp`, `related_entity_type` siteVisit. |
| S2 | Site claimed | As data collector, claim a site (ClaimSiteButton). | Claimer: "New Site Assignment"; coordinator/supervisor/admins: "Site Claimed" (siteClaimNotification). |
| S3 | Site visit completed | Complete a site visit and submit the report (MMP flow). | Coordinator (or forwarded_to_user_id): "Site Visit Completed", message includes collector name and site name, link `/mmp`. |
| S4 | Site verified by coordinator | As coordinator, verify a site. | FOM: "Site Verified - Ready for Review", link `/mmp?site=:id`. |
| S5 | Site rejected by coordinator | As coordinator, reject a site. | Hub supervisor: siteOperationNotification (rejected). |
| S6 | Site returned to FOM | As coordinator, return a site (single or state-level). | FOM (uploaded_by): "Sites Returned by Coordinator", link `/mmp`; hub supervisor: siteReturnedToFOM. |
| S7 | Auto-release | Let a claimed site pass the confirmation deadline without confirmation so auto-release runs. | Former assignee: "Site Released", link `/mmp`. |

## Consistency checks

- For each scenario, run the action once and confirm exactly one new notification per intended recipient (no duplicates).
- Confirm `notifications` columns: `recipient_id`, `title_en`/`title_ar`, `message_en`/`message_ar`, `event_type`, `entity_type`, `action_url`/link, `priority` are set and match the matrix.
- If using the Notification Center UI, confirm the new notification appears and the link opens the correct page.

## Audit-trigger notifications

- Trigger an audit event that fires `notify_admins_on_audit_log` (e.g. entity_type `mmp_file`, `site_visit`, or `wallet`). Confirm admins receive a notification with `action_url` matching: `/mmp/:id`, `/mmp?site=:id`, or `/wallet` respectively.
