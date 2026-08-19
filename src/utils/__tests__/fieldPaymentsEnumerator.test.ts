import { describe, expect, it } from 'vitest';
import {
  getFieldPaymentEnumeratorReference,
  isProfileUuid,
  resolveFieldPaymentEnumeratorName,
} from '../fieldPaymentsEnumerator';

const acceptedBy = '11111111-1111-4111-8111-111111111111';
const requestedBy = '22222222-2222-4222-8222-222222222222';

describe('Field Payments enumerator resolution', () => {
  it('uses the advance recipient when the site has not yet been accepted', () => {
    expect(getFieldPaymentEnumeratorReference({}, requestedBy)).toBe(requestedBy);
    expect(resolveFieldPaymentEnumeratorName({}, requestedBy, {
      [requestedBy]: 'Amina Ahmed',
    })).toBe('Amina Ahmed');
  });

  it('keeps the accepted site owner ahead of the advance recipient', () => {
    expect(resolveFieldPaymentEnumeratorName({ accepted_by: acceptedBy }, requestedBy, {
      [acceptedBy]: 'Hala Mahmoud',
      [requestedBy]: 'Amina Ahmed',
    })).toBe('Hala Mahmoud');
  });

  it('uses stored legacy names and avoids querying profiles with non-UUID identifiers', () => {
    expect(isProfileUuid('legacy-collector')).toBe(false);
    expect(resolveFieldPaymentEnumeratorName({
      additional_data: { enumerator_name: 'Legacy Collector' },
    }, null, {})).toBe('Legacy Collector');
  });
});