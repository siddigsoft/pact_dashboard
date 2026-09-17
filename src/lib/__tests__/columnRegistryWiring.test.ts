import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLUMN_REGISTRY, columnStorageSlug } from '@/lib/column-registry';

const COLUMN_CONSUMER_BY_STORAGE_SLUG: Record<string, string> = {
  'site-visits': 'src/pages/SiteVisits.tsx',
  'payroll-admin': 'src/pages/PayrollAdmin.tsx',
  employees: 'src/pages/Employees.tsx',
  users: 'src/pages/Users.tsx',
  'admin-wallets': 'src/pages/AdminWallets.tsx',
  'cost-submission': 'src/pages/CostSubmission.tsx',
  'transaction-scanner': 'src/pages/TransactionScanner.tsx',
  'finance-hub': 'src/pages/Finance.tsx',
  'accounting-general-ledger': 'src/pages/AccountingGeneralLedger.tsx',
  'accounting-journals': 'src/pages/AccountingJournals.tsx',
  'down-payment-approval': 'src/pages/DownPaymentApproval.tsx',
  wallet: 'src/pages/Wallet.tsx',
  hr: 'src/pages/HRHub.tsx',
};

describe('column registry wiring', () => {
  it('keeps each canonical owner wired to its persisted runtime slug', () => {
    for (const page of COLUMN_REGISTRY) {
      const storageSlug = columnStorageSlug(page);
      const consumer = COLUMN_CONSUMER_BY_STORAGE_SLUG[storageSlug];
      expect(consumer, page.pageSlug).toBeTruthy();
      const source = fs.readFileSync(path.resolve(process.cwd(), consumer), 'utf8');
      expect(source, `${page.pageSlug} -> ${storageSlug}`).toContain(
        `useColumnVisibility('${storageSlug}')`,
      );
    }
  });

  it('keeps canonical and persisted identities unique', () => {
    const owners = COLUMN_REGISTRY.map(page => page.pageSlug);
    const storageSlugs = COLUMN_REGISTRY.map(columnStorageSlug);
    expect(new Set(owners).size).toBe(owners.length);
    expect(new Set(storageSlugs).size).toBe(storageSlugs.length);
    expect(columnStorageSlug(COLUMN_REGISTRY.find(page => page.pageSlug === 'hr-hub')!)).toBe('hr');
  });

  it('uses persisted identities for column writes in every access editor', () => {
    for (const file of [
      'src/components/role-management/RoleBaselineAccessEditor.tsx',
      'src/components/role-management/unified/PermissionsTab.tsx',
      'src/components/role-management/unified/PageAccessTab.tsx',
    ]) {
      const source = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
      expect(source, file).toContain('columnStorageSlug');
    }

    const pageAccessSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/role-management/unified/PageAccessTab.tsx'),
      'utf8',
    );
    expect(pageAccessSource).not.toContain('upsertColumnVisibility(page.slug');
    expect(pageAccessSource).toContain('upsertColumnVisibility(colStorageSlug');
  });
});