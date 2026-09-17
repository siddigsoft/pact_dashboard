export function canShowFullMmpReport(
  isSupervisor: boolean,
  hasFullReportPermission: boolean,
): boolean {
  return !isSupervisor && hasFullReportPermission;
}