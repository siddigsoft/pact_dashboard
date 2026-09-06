export type RegistryDevice = {
  id: string;
  odk_source_key: string;
  odk_source_key_normalized: string;
  display_name?: string | null;
  active?: boolean;
};

export type RegistryAssignment = {
  field_device_id: string;
  profile_id: string;
  valid_from: string;
  valid_to?: string | null;
};

export type DeviceResolution = {
  status: 'matched' | 'unknown device' | 'no active assignment for date' | 'claimant/assigned-collector mismatch';
  device: RegistryDevice | null;
  assignment: RegistryAssignment | null;
  collectorName: string | null;
};

/** Mirrors public.normalize_odk_source_key without sending raw identifiers to storage. */
export function normalizeOdkSourceKey(value: unknown): string | null {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  return normalized || null;
}

export function resolveRegistryDevice(
  rawDevice: unknown,
  submissionDate: string | null,
  devices: RegistryDevice[],
  assignments: RegistryAssignment[],
  profileNames: Record<string, string>,
  acceptedBy?: string | null,
): DeviceResolution {
  const key = normalizeOdkSourceKey(rawDevice);
  const device = key ? devices.find(item => item.odk_source_key_normalized === key) ?? null : null;
  if (!device) return { status: 'unknown device', device: null, assignment: null, collectorName: null };
  const assignment = submissionDate
    ? assignments.find(item =>
      item.field_device_id === device.id &&
      item.valid_from <= submissionDate &&
      (!item.valid_to || item.valid_to > submissionDate)
    ) ?? null
    : null;
  if (!assignment) return { status: 'no active assignment for date', device, assignment: null, collectorName: null };
  const collectorName = profileNames[assignment.profile_id] ?? null;
  if (acceptedBy && acceptedBy === assignment.profile_id) {
    return { status: 'matched', device, assignment, collectorName };
  }
  if (acceptedBy && /^[0-9a-f-]{36}$/i.test(acceptedBy)) {
    return { status: 'claimant/assigned-collector mismatch', device, assignment, collectorName };
  }
  return { status: 'matched', device, assignment, collectorName };
}
