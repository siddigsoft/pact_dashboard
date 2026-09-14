export type MmpPageFlags = {
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  isICT?: boolean;
  isFOM?: boolean;
  isSupervisor?: boolean;
  isCoordinator?: boolean;
  isDataTeam?: boolean;
  isCountryDirector?: boolean;
};

export function canViewMmpOperationalData(flags: MmpPageFlags): boolean {
  return !!(
    flags.isAdmin ||
    flags.isICT ||
    flags.isFOM ||
    flags.isSupervisor ||
    flags.isCoordinator ||
    flags.isDataTeam ||
    flags.isCountryDirector
  );
}

export function usesOversightMmpCategorization(flags: MmpPageFlags): boolean {
  return !!(
    flags.isAdmin ||
    flags.isICT ||
    flags.isDataTeam ||
    flags.isSupervisor ||
    flags.isCountryDirector
  );
}

export function canDeleteMmpItems(flags: MmpPageFlags): boolean {
  if (flags.isCountryDirector) return false;
  return !!(flags.isAdmin || flags.isSuperAdmin);
}
