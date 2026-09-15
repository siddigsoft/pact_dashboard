# Report/export boundary inventory

The `public.assert_report_export_permission(resource, action)` assertion is
server-side and fail-closed. It first honors the UI's active Super Admin bypass,
then evaluates an unexpired `user_permission_overrides` row (grant or deny),
then an active `user_roles` → active `roles` → `permissions` grant. All
mappings below use the `moduleRegistry` `:export` action.

| Boundary | Resource/action | Notes |
| --- | --- | --- |
| `dashboard-actions-export` Edge Function | `analytics:export` (plus existing Super Admin check) | JWT identity is available; permission assertion should be called before service-role data queries |
| `create-pact-archive` Edge Function | `analytics:export` | Generates ZIP archives and signs existing archive downloads; caller JWT is checked before any service-role data query |
| `fd-api /forms/:id/submissions.csv` | excluded from unified assertion | X-API-Key identifies an `fd_api_keys` credential, not a user. Existing key active/access/form-scope checks remain; no user identity is invented. |

All `acct_*` RPCs reviewed—including `get_acct_gl_ledger`,
`get_acct_fund_activity`, `get_acct_account_actuals`,
`get_acct_grants_with_spend`, `get_acct_ap_vendor_lines`,
`acct_trial_balance`, and `acct_balance_sheet_as_of`—are shared normal
page-data loaders. They are intentionally excluded so export policy cannot
break accounting pages. `get_accounting_finance_kpis`,
`get_cycle_attribution_state(uuid)`, `get_cycle_attribution_report(uuid)`,
`get_pre_fund_finance_exception_queue_rpc(uuid)`, `public_landing_kpis()`,
`get_account_balances()`, and `acct_recon_subledger_check(...)` are likewise
operational reads or validation checks, not dedicated export payloads.

`get_legacy_incentive_evidence_report()` is also excluded: the available
call-sites represent operational remediation/evidence review rather than a
confirmed download-only action. No export policy is imposed on it.

The existing MMP report RPCs (`full_report`, `state_report`, `hub_report`) are
intentionally not converted to generic `export`: their specialized
`mmp_report_permission` checks and canonical state/hub scope predicates must
remain authoritative.

There is no HR-specific callable backend export RPC in the current inventory.
HR coverage is therefore limited to generic assertion tests; no probe RPC is
introduced solely for testing.

Service-role execution is an explicit machine-to-machine exception retained
for existing scheduled/server callers. It is not a browser grant and is not
mapped to a user permission.

Direct authenticated SELECT/signing access to the private
`field-data-archives` storage bucket is blocked by a restrictive policy.
`FieldDataBackup` re-downloads existing archives through the guarded Edge
Function's `sign-download` action instead.