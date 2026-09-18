import { describe, expect, it } from 'vitest';
import { resolveOfficialCollectionProfileId } from './fieldAttributionIdentity';
import { getFieldPaymentEnumeratorReference } from './fieldPaymentsEnumerator';

describe('effective claimant overlay', () => {
  it('uses the overlay without changing raw evidence', () => {
    expect(resolveOfficialCollectionProfileId({
      status: 'completed',
      accepted_by: 'raw-collector',
      effective_claimant_id: 'new-collector',
    })).toBe('new-collector');
  });

  it('uses the overlay even for WFP-confirmed wallet-only reassignment', () => {
    expect(resolveOfficialCollectionProfileId({
      status: 'wfp_confirmed',
      attribution_collector_id: 'device-collector',
      effective_claimant_id: 'new-collector',
    })).toBe('new-collector');
  });

  it('prefers the effective claimant for field payment identity', () => {
    expect(getFieldPaymentEnumeratorReference({
      accepted_by: 'raw-collector',
      effective_claimant_id: 'new-collector',
    })).toBe('new-collector');
  });
});