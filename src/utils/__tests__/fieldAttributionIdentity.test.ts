import { describe, expect, it } from 'vitest';
import {
  resolveOfficialCollectionProfileId,
  resolveOfficialCollectionProfileName,
} from '../fieldAttributionIdentity';

describe('official WFP collection identity', () => {
  const claimant = '00000000-0000-0000-0000-000000000002';
  const deviceOwner = '00000000-0000-0000-0000-000000000003';
  const profiles = {
    [claimant]: 'Raw Claimant Profile',
    [deviceOwner]: 'Official Command Center Device Owner',
  };

  it('makes device attribution authoritative for Finance and Cycle Close', () => {
    const row = {
      status: 'wfp_confirmed',
      accepted_by: claimant,
      claimed_by: claimant,
      attribution_collector_id: deviceOwner,
    };
    const officialId = resolveOfficialCollectionProfileId(row);

    expect(officialId).toBe(deviceOwner);
    expect(resolveOfficialCollectionProfileName(officialId, profiles))
      .toBe('Official Command Center Device Owner');
  });

  it('never falls back to a claimant when confirmed attribution is missing', () => {
    expect(resolveOfficialCollectionProfileId({
      status: 'wfp_confirmed',
      accepted_by: claimant,
      attribution_collector_id: null,
    })).toBeNull();
  });

  it('preserves legacy claimant identity only for non-confirmed history', () => {
    expect(resolveOfficialCollectionProfileId({
      status: 'not_covered',
      accepted_by: claimant,
      attribution_collector_id: deviceOwner,
    })).toBe(claimant);
  });
});