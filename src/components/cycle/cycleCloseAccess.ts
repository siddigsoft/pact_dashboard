import { getCycleCloseRoleFlags } from './CycleCloseWizard';

export function getMmpCycleCloseAccess(currentUser: any) {
  const roleFlags = getCycleCloseRoleFlags({
    role: currentUser?.role,
    roles: currentUser?.roles,
    additionalRoles: currentUser?.additionalRoles ?? currentUser?.additional_roles,
  });

  const isSuperAdmin = roleFlags.isSuperAdmin;
  const isAdmin = roleFlags.isAdmin || isSuperAdmin;
  const isFOM = roleFlags.isFOM;
  const isFinance = roleFlags.isFinance;
  const isSupervisor = roleFlags.isSupervisor;
  const isCoordinator = roleFlags.isCoordinator;

  return {
    isSuperAdmin,
    isAdmin,
    isFOM,
    isFinance,
    isSupervisor,
    isCoordinator,
    canAccessCycleWizard: isFOM || isFinance || isAdmin || isSuperAdmin || isSupervisor || isCoordinator,
  };
}