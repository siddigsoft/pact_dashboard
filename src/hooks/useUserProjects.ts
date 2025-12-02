import { useMemo } from 'react';
import { useAppContext } from '@/context/AppContext';
import { useProjectContext } from '@/context/project/ProjectContext';
import { Project, ProjectTeamMember } from '@/types/project';

interface UserProjectInfo {
  projectId: string;
  projectName: string;
  projectCode: string;
  role?: string;
}

interface UseUserProjectsResult {
  userProjects: Project[];
  userProjectIds: string[];
  userProjectInfo: UserProjectInfo[];
  userProjectTeamUserIds: string[];
  isProjectMember: (projectId: string) => boolean;
  hasProjectAccess: boolean;
  isAdminOrSuperUser: boolean;
  getUserProjectsForUser: (userId: string) => UserProjectInfo[];
  allProjects: Project[];
}

export const useUserProjects = (): UseUserProjectsResult => {
  const { currentUser, roles } = useAppContext();
  const { projects } = useProjectContext();

  const normalizedRoles = useMemo(() => {
    return (roles || []).map(r => String(r).toLowerCase());
  }, [roles]);

  const isAdminOrSuperUser = useMemo(() => {
    return normalizedRoles.includes('admin') || 
           normalizedRoles.includes('superadmin') || 
           normalizedRoles.includes('super_admin') ||
           normalizedRoles.includes('ict');
  }, [normalizedRoles]);

  const isUserInProject = (project: Project, userId: string): boolean => {
    if (!userId) return false;

    if (project.team?.projectManager === userId) {
      return true;
    }

    if (project.team?.members?.includes(userId)) {
      return true;
    }

    if (project.team?.teamComposition?.some((member: ProjectTeamMember) => member.userId === userId)) {
      return true;
    }

    return false;
  };

  const getUserRoleInProject = (project: Project, userId: string): string | undefined => {
    if (!userId) return undefined;

    if (project.team?.projectManager === userId) {
      return 'Project Manager';
    }

    const teamMember = project.team?.teamComposition?.find(
      (member: ProjectTeamMember) => member.userId === userId
    );
    if (teamMember) {
      return teamMember.role;
    }

    if (project.team?.members?.includes(userId)) {
      return 'Team Member';
    }

    return undefined;
  };

  const userProjects = useMemo(() => {
    if (!currentUser?.id) return [];

    if (isAdminOrSuperUser) {
      return projects;
    }

    return projects.filter(project => isUserInProject(project, currentUser.id));
  }, [currentUser?.id, projects, isAdminOrSuperUser]);

  const userProjectIds = useMemo(() => {
    return userProjects.map(p => p.id);
  }, [userProjects]);

  const userProjectInfo = useMemo((): UserProjectInfo[] => {
    if (!currentUser?.id) return [];

    return userProjects.map(project => ({
      projectId: project.id,
      projectName: project.name,
      projectCode: project.projectCode,
      role: getUserRoleInProject(project, currentUser.id),
    }));
  }, [userProjects, currentUser?.id]);

  const isProjectMember = (projectId: string): boolean => {
    if (isAdminOrSuperUser) return true;
    return userProjectIds.includes(projectId);
  };

  const hasProjectAccess = useMemo(() => {
    return userProjects.length > 0 || isAdminOrSuperUser;
  }, [userProjects.length, isAdminOrSuperUser]);

  const userProjectTeamUserIds = useMemo(() => {
    const userIds = new Set<string>();
    
    userProjects.forEach(project => {
      if (project.team?.projectManager) {
        userIds.add(project.team.projectManager);
      }
      
      project.team?.members?.forEach(memberId => {
        if (memberId) userIds.add(memberId);
      });
      
      project.team?.teamComposition?.forEach((member: ProjectTeamMember) => {
        if (member.userId) userIds.add(member.userId);
      });
    });
    
    return Array.from(userIds);
  }, [userProjects]);

  const getUserProjectsForUser = (userId: string): UserProjectInfo[] => {
    if (!userId) return [];

    const userInProjects = projects.filter(project => isUserInProject(project, userId));

    return userInProjects.map(project => ({
      projectId: project.id,
      projectName: project.name,
      projectCode: project.projectCode,
      role: getUserRoleInProject(project, userId),
    }));
  };

  return {
    userProjects,
    userProjectIds,
    userProjectInfo,
    userProjectTeamUserIds,
    isProjectMember,
    hasProjectAccess,
    isAdminOrSuperUser,
    getUserProjectsForUser,
    allProjects: projects,
  };
};

export default useUserProjects;
