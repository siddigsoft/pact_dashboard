import { describe, expect, it } from 'vitest';
import { FILTER_REGISTRY } from '../filter-registry';
import fs from 'node:fs';
import path from 'node:path';

const PAGE_SOURCE: Record<string, string> = {
  'mmp-management': 'src/components/mmp/MmpFilterBar.tsx',
  'cost-submission': 'src/pages/CostSubmission.tsx',
  'down-payment-approval': 'src/components/downPayment/DownPaymentApprovalPanel.tsx',
  'advance-requests-report': 'src/pages/AdvanceRequestsReport.tsx',
  'wallet-reports': 'src/pages/WalletReports.tsx',
  'duplicate-payments-report': 'src/pages/DuplicatePaymentsReport.tsx',
  'salary-retainer-report': 'src/pages/SalaryRetainerReport.tsx',
  'hr-hub.org-chart': 'src/pages/HRHub.tsx',
  'hr-assets': 'src/pages/HRAssets.tsx',
  'hr-policy-library': 'src/pages/HRPolicyLibrary.tsx',
  'leave-requests': 'src/pages/LeaveRequests.tsx',
  'payroll-admin': 'src/pages/PayrollAdmin.tsx',
  'crm-partners': 'src/pages/CRMPartners.tsx',
  'crm-contacts': 'src/pages/CRMContacts.tsx',
  'crm-opportunities': 'src/pages/CRMOpportunities.tsx',
  'crm-engagements': 'src/pages/CRMEngagements.tsx',
  'hub-operations': 'src/pages/HubOperations.tsx',
  'field-operation-manager': 'src/pages/FieldOperationManager.tsx',
  'field-team': 'src/pages/FieldTeam.tsx',
  'field-payments-centre': 'src/pages/FieldPaymentsCentre.tsx',
  'field-data-exports': 'src/pages/FieldDataExports.tsx',
  projects: 'src/pages/Projects.tsx',
  'task-admin': 'src/pages/TaskAdmin.tsx',
  users: 'src/pages/Users.tsx',
  departments: 'src/pages/Departments.tsx',
  'admin-cycle-health': 'src/pages/AdminCycleHealth.tsx',
  'admin-wallets': 'src/pages/AdminWallets.tsx',
  'admin-whatsapp': 'src/pages/AdminWhatsApp.tsx',
};

describe('filter registry wiring', () => {
  it('has stable unique keys', () => {
    const keys = FILTER_REGISTRY.map(item => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('maps every registered page to an exact source file', () => {
    for (const item of FILTER_REGISTRY) expect(PAGE_SOURCE[item.page], item.key).toBeTruthy();
  });

  it('has exact visibility and neutral-reset wiring for every filter', () => {
    const cache = new Map<string, string>();
    for (const item of FILTER_REGISTRY) {
      const file = PAGE_SOURCE[item.page];
      const extraFile = item.page === 'down-payment-approval' ? 'src/pages/DownPaymentApproval.tsx' : null;
      const source = cache.get(file) ?? [
        fs.readFileSync(path.resolve(process.cwd(), file), 'utf8'),
        ...(extraFile ? [fs.readFileSync(path.resolve(process.cwd(), extraFile), 'utf8')] : []),
      ].join('\n');
      cache.set(file, source);

      if (item.page === 'mmp-management') {
        const shortKey = item.key.slice('mmp-management.'.length);
        expect(source, `${item.key} visibility`).toContain(`visible('${shortKey}')`);
        expect(source, `${item.key} reset`).toContain(`!visible('${shortKey}')`);
      } else if (item.page === 'down-payment-approval') {
        const shortKey = item.key.slice('down-payment-approval.'.length);
        expect(source, `${item.key} render guard`).toContain(`isFilterVisible('${item.key}')`);
        expect(source, `${item.key} reset registration`).toContain(`['${shortKey}',`);
        expect(source, `${item.key} dynamic neutral reset`).toContain(
          '!isFilterVisible(`down-payment-approval.${key}`)',
        );
      } else {
        const marker = `isFilterVisible('${item.key}')`;
        expect(source, `${item.key} visibility/reset marker`).toContain(marker);
        expect(
          source.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length ?? 0,
          `${item.key} must have separate reset and render checks`,
        ).toBeGreaterThanOrEqual(2);
        expect(source, `${item.key} neutral reset`).toContain(`!${marker}`);
      }
    }
  });

  it('keeps Cost Submission refresh and exports outside the optional status guard', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), PAGE_SOURCE['cost-submission']), 'utf8');
    const guard = source.indexOf("{isFilterVisible('cost-submission.status') && ([");
    const statusMapEnd = source.indexOf('))}', guard);
    expect(guard).toBeGreaterThan(-1);
    expect(statusMapEnd).toBeGreaterThan(guard);
    for (const action of [
      'data-testid="button-refresh-operational"',
      'data-testid="button-export-history"',
      'data-testid="button-op-statement-pdf"',
      'data-testid="button-op-statement-excel"',
    ]) {
      expect(source.indexOf(action), action).toBeGreaterThan(statusMapEnd);
    }
  });
});