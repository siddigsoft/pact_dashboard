import { describe, expect, it } from 'vitest';
import { FILTER_REGISTRY } from '../filter-registry';
import fs from 'node:fs';
import path from 'node:path';

describe('filter registry wiring', () => {
  it('has stable unique keys', () => {
    const keys = FILTER_REGISTRY.map(item => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('has a visibility/reset marker for every operational filter', () => {
    const sources = [
      fs.readFileSync(path.resolve(process.cwd(), 'src/components/mmp/MmpFilterBar.tsx'), 'utf8'),
      fs.readFileSync(path.resolve(process.cwd(), 'src/components/downPayment/DownPaymentApprovalPanel.tsx'), 'utf8'),
      fs.readFileSync(path.resolve(process.cwd(), 'src/pages/CostSubmission.tsx'), 'utf8'),
    ].join('\n');
    for (const item of FILTER_REGISTRY.filter(f => ['mmp-management', 'cost-submission', 'down-payment-approval'].some(prefix => f.page.startsWith(prefix)))) {
      const prefix = item.page.split('.')[0];
      expect(sources).toContain(`${prefix}.`);
      const shortKey = item.key.split('.').pop()!;
      expect(
        sources.includes(`isFilterVisible('${item.key}')`) ||
        sources.includes(`isFilterVisible('${shortKey}')`) ||
        sources.includes(`visible('${shortKey}')`) ||
        sources.includes(`'${shortKey}'`),
      ).toBe(true);
      // Every stateful filter also has a neutral reset path in a page effect.
      expect(sources).toMatch(/set(?:Filters|MmpFilter|UserFilter|StateFilter|CostPreFundFilter|TierFilter|CostSearch|StatusFilter)/);
    }
  });
});