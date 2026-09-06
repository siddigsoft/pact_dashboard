import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WizardState } from '@/components/cycle/CycleCloseWizard';

const { fromMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock,
  },
}));

import { buildCycleCloseWorkbook } from '../cycleCloseExport';

describe('Cycle Close workbook collection identity', () => {
  const claimantId = '00000000-0000-0000-0000-000000000002';
  const deviceOwnerId = '00000000-0000-0000-0000-000000000003';
  const rawWfpName = 'Raw WFP Claimant Name';
  const officialName = 'Official Command Center Device Owner';

  beforeEach(() => {
    vi.clearAllMocks();

    fromMock.mockImplementation((table: string) => {
      if (table === 'mmp_site_entries') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: [{
                id: 'site-1',
                site_name: 'Fixture Site',
                state: 'Khartoum',
                locality: 'Bahri',
                accepted_by: claimantId,
                claimed_by: claimantId,
                visit_started_by: claimantId,
                attribution_collector_id: deviceOwnerId,
                attribution_status: 'corrected',
                status: 'wfp_confirmed',
                transport_fee: 100,
                enumerator_fee: 50,
                additional_data: {
                  collector_name: rawWfpName,
                  accepted_by_name: rawWfpName,
                },
              }],
            }),
          })),
        };
      }

      if (table === 'down_payment_requests') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              in: vi.fn().mockResolvedValue({
                data: [{
                  id: 'advance-1',
                  mmp_site_entry_id: 'site-1',
                  total_paid_amount: 50,
                  requested_amount: 50,
                  status: 'paid',
                  created_at: '2026-09-05T10:00:00.000Z',
                }],
              }),
            })),
          })),
        };
      }

      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({
              data: [{ id: deviceOwnerId, full_name: officialName }],
            }),
          })),
        };
      }

      throw new Error(`Unexpected table in Cycle Close export test: ${table}`);
    });

    rpcMock.mockResolvedValue({
      data: {
        rows: [{
          state: 'Khartoum',
          site_name: 'Fixture Site',
          issue_type: 'claimant_device_owner_mismatch',
          exception_code: 'IDENTITY_MISMATCH',
          requires_attribution: true,
          wfp_raw_device_id: 'device-1',
          wfp_raw_interviewer_name: rawWfpName,
          submission_uuid: 'submission-1',
          submission_date: '2026-09-06',
          claimed_collector_name: rawWfpName,
          resolved_collector_id: deviceOwnerId,
          resolved_collector_name: officialName,
          status: 'corrected',
          method: 'device_owner',
          correction_reason: 'Official device attribution',
        }],
      },
    });
  });

  it('keeps raw claimant identity in audit evidence while exporting the official device owner across financial sheets', async () => {
    const wizardState = {
      selectedMmpId: 'mmp-1',
      selectedMmp: { id: 'mmp-1', name: 'Identity Fixture Cycle' },
      matchingPairs: [],
      matchResults: [{
        matchedSiteId: 'site-1',
        matchedSiteName: 'Fixture Site',
        wfpRow: { site_name: 'Fixture Site', interviewer_name: rawWfpName },
        matchScore: 100,
        matchLevel: 'high',
        status: 'auto',
      }],
      resolvedSites: {},
      uncoveredReasons: {},
      exceptionDecisions: {},
      paymentActions: {},
      overrides: {},
    } as unknown as WizardState;

    const workbook = await buildCycleCloseWorkbook(
      wizardState,
      { full_name: 'Finance Admin' },
      [],
    );

    const reconciliation = workbook.getWorksheet('Enumerator Reconciliation');
    expect(reconciliation?.getCell('A5').value).toBe(officialName);
    expect(reconciliation?.getCell('A5').value).not.toBe(rawWfpName);

    const paymentRun = workbook.getWorksheet('Payment Run');
    expect(paymentRun?.getCell('A5').value).toBe(officialName);
    expect(JSON.stringify(paymentRun?.getSheetValues())).not.toContain(rawWfpName);

    const advanceDetails = workbook.getWorksheet('Advance Details');
    expect(advanceDetails?.getCell('D5').value).toBe(officialName);
    expect(JSON.stringify(advanceDetails?.getSheetValues())).not.toContain(rawWfpName);

    const attribution = workbook.getWorksheet('Attribution Audit');
    expect(attribution?.getCell('G5').value).toBe(rawWfpName);
    expect(attribution?.getCell('J5').value).toBe(rawWfpName);
    expect(attribution?.getCell('K5').value).toBe(officialName);
  });
});