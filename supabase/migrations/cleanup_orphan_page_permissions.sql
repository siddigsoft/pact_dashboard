-- ─────────────────────────────────────────────────────────────────────────────
-- cleanup_orphan_page_permissions.sql
--
-- Purpose: Remove page_access_overrides rows and user_screen_permissions.screens
--          entries whose page_slug / screenId no longer exists in PAGE_DEFS
--          (src/pages/PageAccessControl.tsx).
--
-- Safe to run multiple times (idempotent).
-- Run this whenever a page slug is removed from PAGE_DEFS and a deploy is pushed.
-- See supabase/RUNBOOK_orphan_page_permissions_cleanup.md for full procedure.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Step 1 : Build the authoritative slug list ────────────────────────────────
-- This array must be kept in sync with PAGE_DEFS in
-- src/pages/PageAccessControl.tsx (grep for "slug:'").
-- Last synced: 2026-07-12

DO $$
DECLARE
  valid_slugs TEXT[] := ARRAY[
    'accounting-aml',
    'accounting-ap-aging',
    'accounting-ap-invoices',
    'accounting-bank-recon',
    'accounting-budget',
    'accounting-budget-encumbrance',
    'accounting-budget-variance',
    'accounting-cash-flow',
    'accounting-cash-flow-forecast',
    'accounting-cheque-register',
    'accounting-coa',
    'accounting-consolidation',
    'accounting-cost-allocation',
    'accounting-depreciation',
    'accounting-donor-reports',
    'accounting-finance-dashboard',
    'accounting-fiscal-years',
    'accounting-fixed-assets',
    'accounting-funds',
    'accounting-gl-audit',
    'accounting-gl-bridge',
    'accounting-grants',
    'accounting-grn',
    'accounting-hub',
    'accounting-intercompany',
    'accounting-journals',
    'accounting-ledger',
    'accounting-multi-currency',
    'accounting-period-close',
    'accounting-purchase-orders',
    'accounting-purchase-req',
    'accounting-sod',
    'accounting-tax',
    'accounting-trial-balance',
    'accounting-vendors',
    'admin-hub',
    'admin-monitoring',
    'advance-requests-report',
    'analytics-hub',
    'approval-dashboard',
    'approvals',
    'archive',
    'attendance',
    'audit-compliance',
    'audit-logs',
    'broadcast',
    'calendar',
    'changelog',
    'chat',
    'classification-fees',
    'classifications',
    'communication-hub',
    'coordinator-dashboard',
    'coordinator-sites',
    'cost-predictions',
    'cost-submission',
    'cost-submission-reports',
    'coverage-map',
    'crm',
    'cycle-health',
    'cycle-management',
    'daily-work',
    'dashboard',
    'data-export-center',
    'data-visibility',
    'dct-pdm',
    'departments',
    'documents',
    'down-payment-advance-report',
    'down-payment-approval',
    'employees',
    'enumerator-fees-report',
    'equipment',
    'exchange-rates',
    'executive',
    'field-data',
    'field-operation-manager',
    'field-ops',
    'finance-hub',
    'finance-processing',
    'helpline',
    'hierarchy-audit',
    'hr-hub',
    'hr-payslip',
    'hr-timesheet',
    'hub-management',
    'hub-operations',
    'incident-reports',
    'integrations',
    'leave',
    'login-analytics',
    'mmp',
    'mmp-management',
    'mobile-support-tickets',
    'monitoring-form',
    'monitoring-plan',
    'month-end-summary',
    'my-advances',
    'my-expenses',
    'my-tasks',
    'my-team',
    'notifications',
    'offboarding',
    'page-access',
    'payroll',
    'performance-reviews',
    'permissions-management',
    'portfolio',
    'positions',
    'pre-funding',
    'programme-hub',
    'project-flow-stages',
    'projects',
    'questionnaire-analytics',
    'reconciliation-dashboard',
    'reports',
    'retainer-management',
    'role-management',
    'role-perspective',
    'safety-hub',
    'salary-increments',
    'salary-retainer-report',
    'search',
    'settings',
    'signatures',
    'sites-for-verification',
    'site-visits',
    'staff-directory',
    'staff-onboarding',
    'super-admin-hub',
    'supervisor-sites',
    'support-contacts',
    'surveys',
    'system-diagrams',
    'task-admin',
    'team-tasks',
    'tier1-approvals',
    'tier2-approvals',
    'tracker-preparation',
    'training-certifications',
    'transaction-scanner',
    'users',
    'wallet',
    'wallet-reports',
    'whatsapp-admin',
    'workspace'
  ];

  deleted_overrides INT;
  updated_screen_perms INT;
BEGIN

  -- ── Step 2 : Delete orphan page_access_overrides rows ──────────────────────
  DELETE FROM public.page_access_overrides
  WHERE page_slug IS NOT NULL
    AND page_slug <> ''
    AND NOT (page_slug = ANY(valid_slugs));

  GET DIAGNOSTICS deleted_overrides = ROW_COUNT;
  RAISE NOTICE 'page_access_overrides: deleted % orphan row(s)', deleted_overrides;

  -- ── Step 3 : Strip orphan entries from user_screen_permissions.screens ──────
  -- The screens column is jsonb: [{screenId, ...}, ...].
  -- We keep only elements whose screenId is in valid_slugs.
  UPDATE public.user_screen_permissions
  SET
    screens = (
      SELECT COALESCE(jsonb_agg(elem ORDER BY (elem->>'screenId')), '[]'::jsonb)
      FROM   jsonb_array_elements(screens) AS elem
      WHERE  (elem->>'screenId') = ANY(valid_slugs)
    ),
    updated_at = now()
  WHERE
    -- Only touch rows that actually contain at least one stale entry
    EXISTS (
      SELECT 1
      FROM   jsonb_array_elements(screens) AS elem
      WHERE  (elem->>'screenId') IS NOT NULL
        AND  NOT ((elem->>'screenId') = ANY(valid_slugs))
    );

  GET DIAGNOSTICS updated_screen_perms = ROW_COUNT;
  RAISE NOTICE 'user_screen_permissions: cleaned orphan screen entries from % row(s)', updated_screen_perms;

END $$;
