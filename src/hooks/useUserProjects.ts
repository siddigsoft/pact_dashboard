import { useMemo } from 'react';
import { useAppContext } from '@/context/AppContext';
import { useProjectContext } from '@/context/project/ProjectContext';
import { useAuthorization } from '@/hooks/use-authorization';

export const useUserProjects = () => {
  const { currentUser } = useAppContext();
  const { projects } = useProjectContext();
  const { isSuperAdmin, hasAnyRole } = useAuthorization();

  const isAdminOrSuperUser = useMemo(() => {
    if (!currentUser) return false;
    if (isSuperAdmin()) return true;
    return hasAnyRole(['admin', 'Admin', 'super_admin', 'SuperAdmin']);
  }, [currentUser, isSuperAdmin, hasAnyRole]);

  const userProjects = useMemo(() => {
    if (!currentUser) return [] as typeof projects;
    const uid = currentUser.id;
    return projects.filter((p: any) =>
      p?.team?.projectManager === uid ||
      (Array.isArray(p?.team?.members) && p.team.members.includes(uid)) ||
      (Array.isArray(p?.team?.teamComposition) && p.team.teamComposition.some((m: any) => m?.userId === uid))
    );
  }, [projects, currentUser?.id]);

  const userProjectIds = useMemo(() => userProjects.map(p => p.id), [userProjects]);

  return { userProjects, userProjectIds, isAdminOrSuperUser };
};
