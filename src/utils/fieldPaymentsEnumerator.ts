const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EntryWithEnumeratorData = {
  accepted_by?: string | null;
  claimed_by?: string | null;
  visit_started_by?: string | null;
  additional_data?: Record<string, unknown> | null;
} | null | undefined;

function nonEmptyText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function isProfileUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}

export function getFieldPaymentEnumeratorReference(
  entry: EntryWithEnumeratorData,
  requestedBy?: string | null,
): string | null {
  return (
    nonEmptyText(entry?.accepted_by) ??
    nonEmptyText(entry?.claimed_by) ??
    nonEmptyText(entry?.visit_started_by) ??
    nonEmptyText(requestedBy)
  );
}

export function resolveFieldPaymentEnumeratorName(
  entry: EntryWithEnumeratorData,
  requestedBy: string | null | undefined,
  profileNames: Record<string, string>,
): string {
  const reference = getFieldPaymentEnumeratorReference(entry, requestedBy);
  const additionalData = entry?.additional_data ?? {};
  const storedName = [
    additionalData.collector_name,
    additionalData.accepted_by_name,
    additionalData.enumerator_name,
    additionalData.data_collector_name,
    additionalData.collectorName,
    additionalData.user_name,
  ].map(nonEmptyText).find(Boolean);

  if (reference && !isProfileUuid(reference)) return reference;
  if (reference && profileNames[reference]) return profileNames[reference];
  if (storedName) return storedName;
  return reference ? `ID:${reference.slice(0, 8)}` : '—';
}