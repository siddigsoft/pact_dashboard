export function canShowFullMmpReport(
  _isSupervisor: boolean,
  hasFullReportPermission: boolean,
): boolean {
  return hasFullReportPermission;
}