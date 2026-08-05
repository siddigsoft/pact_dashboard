import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Project, ProjectActivity, SubActivity } from '@/types/project';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ensureValidSession } from '@/lib/session-health';
import { validateProject } from '@/utils/projectValidation';
import { useRealtimeTables } from '@/hooks/useRealtimeResource';
import { useProjectsQuery, useInvalidateProjectsQueries, useUpdateProjectInCache, useRemoveProjectFromCache, mapDbProjectToProject, mapProjectToDbProject } from './projectQueries';
import { getFirstStageId } from '@/config/projectFlows';
import { useUser } from '@/context/user/UserContext';
import { normalizeRole } from '@/utils/roleMapping';
import { dispatchNotification } from '@/lib/notify';
import { logAuditEvent } from '@/utils/audit-logger';
import { provisionProjectChat } from '@/hooks/use-project-chat';

interface ProjectContextProps {
  projects: Project[];
  loading: boolean;
  error: string | null;
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;
  addProject: (project: Project) => Promise<Project | null>;
  updateProject: (project: Project) => Promise<void>;
  updateProjectTeam: (projectId: string, team: Project['team']) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  getProjectById: (id: string) => Project | undefined;
  fetchProjects: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextProps>({
  projects: [],
  loading: false,
  error: null,
  currentProject: null,
  setCurrentProject: () => {},
  addProject: async () => null,
  updateProject: async () => {},
  updateProjectTeam: async () => {},
  deleteProject: async () => {},
  getProjectById: () => undefined,
  fetchProjects: async () => {},
});

export const useProjectContext = () => useContext(ProjectContext);

/** Collect the unique set of user IDs referenced by a project's team object. */
function looksLikeUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function extractTeamMemberIds(team: Project['team'] | undefined | null): Set<string> {
  const ids = new Set<string>();
  const t = team ?? {};
  // `projects.team.projectManager` may be stored as a display name in DB.
  // Notifications expect UUID recipient IDs, so we only include valid UUID-like values.
  if (looksLikeUuid(t.projectManager)) ids.add(t.projectManager);
  (Array.isArray(t.members) ? t.members : []).forEach((m: any) => m && ids.add(m));
  (Array.isArray((t as any).teamComposition) ? (t as any).teamComposition : []).forEach(
    (m: any) => m?.userId && ids.add(m.userId)
  );
  return ids;
}

const PROJECT_ROLE_LABELS: Record<string, string> = {
  projectManager: 'Project Manager',
  fieldAssistant: 'Field Assistant',
  dataCollector: 'Data Collector',
  supervisor: 'Supervisor',
  coordinator: 'Coordinator',
  analyst: 'Analyst',
  reviewer: 'Reviewer',
  other: 'Team Member',
};

/** Resolve a human-readable role label for a user within a project's team object. */
function resolveTeamMemberRoleLabel(team: Project['team'] | undefined | null, userId: string): string {
  const t = team ?? {};
  if (t.projectManager === userId) return PROJECT_ROLE_LABELS.projectManager;
  const composition = Array.isArray((t as any).teamComposition) ? (t as any).teamComposition : [];
  const match = composition.find((m: any) => m?.userId === userId);
  if (match?.role) return PROJECT_ROLE_LABELS[match.role] ?? match.role;
  return 'Team Member';
}

/** Resolve a display name for a user within a project's team object. */
function resolveTeamMemberName(team: Project['team'] | undefined | null, userId: string): string {
  const composition = Array.isArray((team as any)?.teamComposition) ? (team as any).teamComposition : [];
  const match = composition.find((m: any) => m?.userId === userId);
  return match?.name ?? userId;
}

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [error, setError] = useState<string | null>(null);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const { toast } = useToast();
  const invalidateProjects = useInvalidateProjectsQueries();
  const updateProjectCache = useUpdateProjectInCache();
  const removeProjectFromCache = useRemoveProjectFromCache();
  const invalidateRef = useRef(invalidateProjects);
  invalidateRef.current = invalidateProjects;

  const { currentUser, roles: userRoles } = useUser();

  const projectsQuery = useProjectsQuery(!!currentUser);
  const allProjects = projectsQuery.data ?? [];
  const loading = projectsQuery.isLoading;

  /** Admins and super admins see every project; everyone else only sees projects they are part of. */
  const projects = useMemo(() => {
    if (!currentUser) return allProjects;

    // Collect all role strings for this user
    const allRoleStrings: string[] = [
      currentUser.role ?? '',
      ...(Array.isArray((currentUser as any).roles) ? (currentUser as any).roles : []),
      ...(Array.isArray(userRoles) ? userRoles : []),
    ].filter(Boolean);

    const normalised = allRoleStrings.map(r => normalizeRole(r)).filter(Boolean);
    const canSeeAll =
      normalised.includes('superAdmin') ||
      normalised.includes('admin') ||
      allRoleStrings.some(r =>
        ['super_admin', 'superAdmin', 'SuperAdmin', 'admin', 'Admin'].includes(r)
      );

    if (canSeeAll) return allProjects;

    const uid = currentUser.id;
    return allProjects.filter((p: any) =>
      p?.team?.projectManager === uid ||
      p?.team?.projectManagerId === uid ||
      (Array.isArray(p?.team?.members) && p.team.members.includes(uid)) ||
      (Array.isArray(p?.team?.teamComposition) &&
        p.team.teamComposition.some((m: any) => m?.userId === uid))
    );
  }, [allProjects, currentUser, userRoles]);

  useEffect(() => {
    if (projectsQuery.isError && projectsQuery.error) {
      const errMsg = projectsQuery.error instanceof Error ? projectsQuery.error.message : 'Failed to fetch projects';
      setError(errMsg);
      console.error('[ProjectContext] Failed to fetch projects:', projectsQuery.error);
      toast({ title: 'Error', description: errMsg, variant: 'destructive' });
    } else if (projectsQuery.data !== undefined && !projectsQuery.isError) {
      setError(null);
    }
  }, [projectsQuery.isError, projectsQuery.error, projectsQuery.data]);

  const fetchProjects = useCallback(async () => {
    await invalidateProjects();
  }, [invalidateProjects]);

  useRealtimeTables(['projects', 'project_activities', 'sub_activities'], () => {
    invalidateRef.current();
  });

  const addProject = async (project: Project): Promise<Project | null> => {
    const session = await ensureValidSession();
    if (!session.success) return null;
    try {
      setError(null);

      const validationResult = validateProject(project);
      if (!validationResult.success) {
        throw new Error(validationResult.errors?.join('\n'));
      }

      const firstStage = getFirstStageId(project.projectType);
      const dbProject = mapProjectToDbProject(project) as Record<string, unknown>;
      const { data, error } = await supabase
        .from('projects')
        .insert(dbProject)
        .select()
        .single();
        
      if (error) {
        throw new Error(error.message);
      }
      
      if (!data) {
        throw new Error('No data returned from insert');
      }

      // Set the initial flow stage via RPC (bypasses PostgREST schema cache)
      const initialStage = project.currentFlowStage ?? firstStage;
      await supabase.rpc('update_project_flow_stage', {
        p_id: data.id,
        p_stage: initialStage,
        p_custom_stages: null,
      });
      
      const createdProject = {
        ...mapDbProjectToProject(data),
        currentFlowStage: initialStage,
        activities: [],
      } as Project;

      // If converting from a CRM opportunity, update the opportunity stage (don't block UI)
      if (project.crmOpportunityId) {
        const newStage = project.projectType === 'proposal' ? 'proposal' : 'negotiating';
        void supabase
          .from('crm_opportunities')
          .update({ stage: newStage, updated_at: new Date().toISOString() })
          .eq('id', project.crmOpportunityId);
      }

      // Optimistic list update — do not await full get_all_projects refetch
      updateProjectCache(createdProject);
      void invalidateProjects();

      // ── Provision project group chat (fire-and-forget) ───────────────────
      if (currentUser?.id) {
        provisionProjectChat(createdProject, currentUser.id).catch(err => {
          console.warn('[ProjectContext] Failed to provision project chat:', err?.message);
        });
      }

      // ── Audit + notify team (fire-and-forget) ────────────────────────────
      const teamRecipients = (() => {
        const ids = new Set<string>();
        const t = project.team ?? {};
        if (looksLikeUuid(t.projectManager)) ids.add(t.projectManager);
        (Array.isArray(t.members) ? t.members : []).forEach((m: any) => m && ids.add(m));
        (Array.isArray((t as any).teamComposition) ? (t as any).teamComposition : []).forEach(
          (m: any) => m?.userId && ids.add(m.userId)
        );
        if (currentUser?.id) ids.delete(currentUser.id);
        return Array.from(ids);
      })();
      logAuditEvent({
        module: 'projects' as any,
        action: 'create' as any,
        entityType: 'project',
        entityId: createdProject.id,
        entityName: createdProject.name,
        description: `Project "${createdProject.name}" created`,
        severity: 'info',
      }).catch(() => {});
      if (teamRecipients.length > 0) {
        const t = project.team ?? {};
        const pmRecipientIds = (Array.isArray((t as any).teamComposition) ? (t as any).teamComposition : [])
          .filter((m: any) => m?.role === 'projectManager' && m?.userId)
          .map((m: any) => String(m.userId))
          .filter(looksLikeUuid);

        const pmRecipients = teamRecipients.filter((id) => pmRecipientIds.includes(id));
        const otherRecipients = teamRecipients.filter((id) => !pmRecipientIds.includes(id));

        if (pmRecipients.length > 0) {
          dispatchNotification({
            event: 'project_created',
            recipientIds: pmRecipients,
            titleEn: `New project: ${createdProject.name}`,
            titleAr: `مشروع جديد: ${createdProject.name}`,
            messageEn: `${currentUser?.fullName ?? 'A team member'} assigned you as the Project Manager for project "${createdProject.name}".`,
            messageAr: `قام ${currentUser?.fullName ?? 'أحد أعضاء الفريق'} بتعيينك كمسؤول المشروع عن مشروع "${createdProject.name}".`,
            entityType: 'project',
            entityId: createdProject.id,
            actionUrl: `/projects/${createdProject.id}`,
            priority: 'normal',
            triggeredBy: currentUser?.id,
            triggeredByName: currentUser?.fullName ?? undefined,
          }).catch(() => {});
        }

        if (otherRecipients.length > 0) {
          dispatchNotification({
            event: 'project_created',
            recipientIds: otherRecipients,
            titleEn: `New project: ${createdProject.name}`,
            titleAr: `مشروع جديد: ${createdProject.name}`,
            messageEn: `${currentUser?.fullName ?? 'A team member'} created the project "${createdProject.name}". You're listed on the team.`,
            messageAr: `أنشأ ${currentUser?.fullName ?? 'أحد أعضاء الفريق'} مشروع "${createdProject.name}". أنت مدرج ضمن الفريق.`,
            entityType: 'project',
            entityId: createdProject.id,
            actionUrl: `/projects/${createdProject.id}`,
            priority: 'normal',
            triggeredBy: currentUser?.id,
            triggeredByName: currentUser?.fullName ?? undefined,
          }).catch(() => {});
        }
      }

      toast({
        title: "Success",
        description: "Project created successfully!",
        variant: "success",
      });

      return createdProject;
    } catch (err) {
      console.error("Error adding project:", err);
      setError(err instanceof Error ? err.message : 'Failed to add project');
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to create project",
        variant: "destructive",
      });
      return null;
    }
  };

  const notifyActorTeamChange = (
    action: 'added' | 'removed',
    projectId: string,
    projectName: string,
    affectedCount: number,
    memberNames: string[],
  ) => {
    if (!currentUser?.id || affectedCount <= 0) return;
    const uniqueNames = Array.from(new Set(memberNames.filter(Boolean)));
    const memberList = uniqueNames.length > 0 ? uniqueNames.slice(0, 3).join(', ') : 'team member(s)';
    const hasMore = uniqueNames.length > 3 ? ` (+${uniqueNames.length - 3} more)` : '';
    const titleEn = action === 'added'
      ? `Team update saved: ${projectName}`
      : `Team removal saved: ${projectName}`;
    const titleAr = action === 'added'
      ? `تم حفظ تحديث الفريق: ${projectName}`
      : `تم حفظ إزالة من الفريق: ${projectName}`;
    const messageEn = action === 'added'
      ? `You added ${affectedCount} team member${affectedCount !== 1 ? 's' : ''} (${memberList}${hasMore}) to project "${projectName}".`
      : `You removed ${affectedCount} team member${affectedCount !== 1 ? 's' : ''} (${memberList}${hasMore}) from project "${projectName}".`;
    const messageAr = action === 'added'
      ? `قمت بإضافة ${affectedCount} ${affectedCount !== 1 ? 'أعضاء' : 'عضو'} إلى فريق مشروع "${projectName}".`
      : `قمت بإزالة ${affectedCount} ${affectedCount !== 1 ? 'أعضاء' : 'عضو'} من فريق مشروع "${projectName}".`;

    dispatchNotification({
      event: action === 'added' ? 'project_member_added' : 'project_member_removed',
      recipientIds: [currentUser.id],
      titleEn,
      titleAr,
      messageEn,
      messageAr,
      entityType: 'project',
      entityId: projectId,
      actionUrl: `/projects/${projectId}`,
      priority: 'normal',
      triggeredBy: currentUser.id,
      triggeredByName: currentUser.fullName ?? undefined,
      metadata: {
        project_name: projectName,
        actor_confirmation: true,
        affected_count: affectedCount,
      },
    }).catch(() => {});
  };

  const updateProject = async (updatedProject: Project) => {
    const session = await ensureValidSession();
    if (!session.success) return;
    try {
      setError(null);
      const existingProject = projects.find(p => p.id === updatedProject.id) ?? currentProject ?? undefined;
      const previousMemberIds = extractTeamMemberIds(existingProject?.team);

      const validationResult = validateProject(updatedProject);
      if (!validationResult.success) {
        throw new Error(validationResult.errors?.join('\n'));
      }

      const dbProject = {
        ...mapProjectToDbProject(updatedProject),
        updated_at: new Date().toISOString()
      };
      const { error } = await supabase
        .from('projects')
        .update(dbProject)
        .eq('id', updatedProject.id);
        
      if (error) {
        throw new Error(error.message);
      }

      if (updatedProject.activities && updatedProject.activities.length > 0) {
        // Map app status values to DB enum (open/assigned/in_progress/completed/cancelled)
        const toDbStatus = (s?: string) => {
          if (!s) return 'open';
          const map: Record<string, string> = {
            'not-started': 'open', 'pending': 'open', 'open': 'open',
            'in-progress': 'in_progress', 'in_progress': 'in_progress', 'assigned': 'assigned',
            'completed': 'completed', 'done': 'completed',
            'cancelled': 'cancelled', 'canceled': 'cancelled', 'on-hold': 'cancelled',
          };
          return map[s] ?? 'open';
        };

        for (const activity of updatedProject.activities) {
          const dbActivity = {
            title: activity.name,
            description: activity.description ?? null,
            start_date: activity.startDate,
            end_date: activity.endDate,
            status: toDbStatus(activity.status),
            project_id: updatedProject.id,
          };

          // If it's a newly created activity, insert and get its real UUID
          if (activity.id.startsWith('new-')) {
            const { data: insertedActivity, error: insertActivityError } = await supabase
              .from('project_activities')
              .insert(dbActivity)
              .select()
              .single();

            if (insertActivityError) {
              throw new Error(insertActivityError.message);
            }

            const newActivityId = insertedActivity?.id;

            // Insert sub-activities if provided (table may not exist yet — apply migration)
            if (activity.subActivities && activity.subActivities.length > 0 && newActivityId) {
              try {
                for (const subActivity of activity.subActivities) {
                  await supabase.from('sub_activities').insert({
                    name: subActivity.name,
                    description: subActivity.description ?? null,
                    status: subActivity.status,
                    due_date: subActivity.dueDate ?? null,
                    activity_id: newActivityId,
                  });
                }
              } catch (_) { /* sub_activities table not yet created */ }
            }
          } else {
            // Existing activity: update record
            const { error: updateActivityError } = await supabase
              .from('project_activities')
              .update(dbActivity)
              .eq('id', activity.id);

            if (updateActivityError) {
              throw new Error(updateActivityError.message);
            }

            // Upsert sub-activities for existing activity (table may not exist yet)
            try {
              const incomingSubs = activity.subActivities ?? [];
              const { data: existingSubs } = await supabase
                .from('sub_activities')
                .select('id')
                .eq('activity_id', activity.id);
              const incomingIds = new Set(
                incomingSubs.filter(s => !s.id.startsWith('new-')).map(s => s.id)
              );
              const toDelete = (existingSubs ?? [])
                .map((s: { id: string }) => s.id)
                .filter((sid: string) => !incomingIds.has(sid));
              if (toDelete.length > 0) {
                await supabase.from('sub_activities').delete().in('id', toDelete);
              }
              for (const subActivity of incomingSubs) {
                const dbSub = {
                  name: subActivity.name,
                  description: subActivity.description ?? null,
                  status: subActivity.status,
                  due_date: subActivity.dueDate ?? null,
                  activity_id: activity.id,
                };
                if (subActivity.id.startsWith('new-')) {
                  await supabase.from('sub_activities').insert(dbSub);
                } else {
                  const { error: updateSubError } = await supabase
                    .from('sub_activities')
                    .update(dbSub)
                    .eq('id', subActivity.id);
                  if (updateSubError) {
                    throw new Error(updateSubError.message);
                  }
                }
              }
            } catch (_) { /* sub_activities table not yet created — apply migration */ }
          }
        }
      }
      
      // Immediately patch cache so ProjectDetail reads fresh data without waiting for background refetch
      updateProjectCache(updatedProject);
      if (currentProject?.id === updatedProject.id) {
        setCurrentProject(updatedProject);
      }
      // Background refetch to sync any server-side computed fields
      invalidateProjects();

      // ── Notify team changes when edit flow updates project.team ─────────────
      const projectName = existingProject?.name ?? updatedProject.name ?? 'a project';
      const updatedTeamMemberIds = extractTeamMemberIds(updatedProject.team);
      const newMemberIds = Array.from(updatedTeamMemberIds).filter(
        id => !previousMemberIds.has(id) && id !== currentUser?.id
      );
      if (newMemberIds.length > 0) {
        newMemberIds.forEach(memberId => {
          const roleLabel = resolveTeamMemberRoleLabel(updatedProject.team, memberId);
          const isProjectManager = roleLabel === PROJECT_ROLE_LABELS.projectManager;
          dispatchNotification({
            event: 'project_member_added',
            recipientIds: [memberId],
            titleEn: `Added to project: ${projectName}`,
            titleAr: `تمت إضافتك إلى مشروع: ${projectName}`,
            messageEn: isProjectManager
              ? `You have been added as the Project Manager for this project "${projectName}".`
              : `You have been added to this project as ${roleLabel} by ${currentUser?.fullName ?? 'a team member'} — project "${projectName}".`,
            messageAr: isProjectManager
              ? `تمت إضافتك كمسؤول المشروع لهذا المشروع "${projectName}".`
              : `تمت إضافتك إلى هذا المشروع بصفة ${roleLabel} بواسطة ${currentUser?.fullName ?? 'أحد أعضاء الفريق'} — مشروع "${projectName}".`,
            entityType: 'project',
            entityId: updatedProject.id,
            actionUrl: `/projects/${updatedProject.id}`,
            priority: 'normal',
            triggeredBy: currentUser?.id,
            triggeredByName: currentUser?.fullName ?? undefined,
            metadata: { project_name: projectName, role: roleLabel },
          }).catch(() => {});
        });
        notifyActorTeamChange(
          'added',
          updatedProject.id,
          projectName,
          newMemberIds.length,
          newMemberIds.map(id => resolveTeamMemberName(updatedProject.team, id)),
        );
      }

      const removedMemberIds = Array.from(previousMemberIds).filter(
        id => !updatedTeamMemberIds.has(id) && id !== currentUser?.id
      );
      if (removedMemberIds.length > 0) {
        dispatchNotification({
          event: 'project_member_removed',
          recipientIds: removedMemberIds,
          titleEn: `Removed from project: ${projectName}`,
          titleAr: `تمت إزالتك من مشروع: ${projectName}`,
          messageEn: `${currentUser?.fullName ?? 'A team member'} removed you from the team for project "${projectName}".`,
          messageAr: `أزالك ${currentUser?.fullName ?? 'أحد أعضاء الفريق'} من فريق مشروع "${projectName}".`,
          entityType: 'project',
          entityId: updatedProject.id,
          actionUrl: `/projects/${updatedProject.id}`,
          priority: 'normal',
          triggeredBy: currentUser?.id,
          triggeredByName: currentUser?.fullName ?? undefined,
          metadata: { project_name: projectName },
        }).catch(() => {});
        notifyActorTeamChange(
          'removed',
          updatedProject.id,
          projectName,
          removedMemberIds.length,
          removedMemberIds.map(id => resolveTeamMemberName(existingProject?.team, id)),
        );
      }
    } catch (err) {
      console.error("Error updating project:", err);
      setError(err instanceof Error ? err.message : 'Failed to update project');
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to update project",
        variant: "destructive",
      });
    }
  };

  const updateProjectTeam = async (projectId: string, team: Project['team']) => {
    const session = await ensureValidSession();
    if (!session.success) return;
    try {
      const existingProject = projects.find(p => p.id === projectId) ?? currentProject ?? undefined;
      const previousMemberIds = extractTeamMemberIds(existingProject?.team);

      const { error } = await supabase
        .from('projects')
        .update({ 
          team,
          updated_at: new Date().toISOString() 
        })
        .eq('id', projectId);
        
      if (error) {
        throw new Error(error.message);
      }

      if (existingProject) {
        updateProjectCache({ ...existingProject, team });
      }
      if (currentProject?.id === projectId) {
        setCurrentProject({ ...currentProject, team });
      }
      void invalidateProjects();

      // ── Notify newly added team members (in-app + email) ──────────────────
      const newMemberIds = Array.from(extractTeamMemberIds(team)).filter(
        id => !previousMemberIds.has(id) && id !== currentUser?.id
      );
      if (newMemberIds.length > 0) {
        const projectName = existingProject?.name ?? 'a project';
        newMemberIds.forEach(memberId => {
          const roleLabel = resolveTeamMemberRoleLabel(team, memberId);
          const isProjectManager = roleLabel === PROJECT_ROLE_LABELS.projectManager;
          dispatchNotification({
            event: 'project_member_added',
            recipientIds: [memberId],
            titleEn: `Added to project: ${projectName}`,
            titleAr: `تمت إضافتك إلى مشروع: ${projectName}`,
            messageEn: isProjectManager
              ? `You have been added as the Project Manager for this project "${projectName}".`
              : `You have been added to this project as ${roleLabel} by ${currentUser?.fullName ?? 'a team member'} — project "${projectName}".`,
            messageAr: isProjectManager
              ? `تمت إضافتك كمسؤول المشروع لهذا المشروع "${projectName}".`
              : `تمت إضافتك إلى هذا المشروع بصفة ${roleLabel} بواسطة ${currentUser?.fullName ?? 'أحد أعضاء الفريق'} — مشروع "${projectName}".`,
            entityType: 'project',
            entityId: projectId,
            actionUrl: `/projects/${projectId}`,
            priority: 'normal',
            triggeredBy: currentUser?.id,
            triggeredByName: currentUser?.fullName ?? undefined,
            metadata: { project_name: projectName, role: roleLabel },
          }).catch(() => {});
        });
        notifyActorTeamChange(
          'added',
          projectId,
          projectName,
          newMemberIds.length,
          newMemberIds.map(id => resolveTeamMemberName(team, id)),
        );
      }

      // ── Notify removed team members (in-app + email) ───────────────────────
      const removedMemberIds = Array.from(previousMemberIds).filter(
        id => !extractTeamMemberIds(team).has(id) && id !== currentUser?.id
      );
      if (removedMemberIds.length > 0) {
        const projectName = existingProject?.name ?? 'a project';
        dispatchNotification({
          event: 'project_member_removed',
          recipientIds: removedMemberIds,
          titleEn: `Removed from project: ${projectName}`,
          titleAr: `تمت إزالتك من مشروع: ${projectName}`,
          messageEn: `${currentUser?.fullName ?? 'A team member'} removed you from the team for project "${projectName}".`,
          messageAr: `أزالك ${currentUser?.fullName ?? 'أحد أعضاء الفريق'} من فريق مشروع "${projectName}".`,
          entityType: 'project',
          entityId: projectId,
          actionUrl: `/projects/${projectId}`,
          priority: 'normal',
          triggeredBy: currentUser?.id,
          triggeredByName: currentUser?.fullName ?? undefined,
          metadata: { project_name: projectName },
        }).catch(() => {});
        notifyActorTeamChange(
          'removed',
          projectId,
          projectName,
          removedMemberIds.length,
          removedMemberIds.map(id => resolveTeamMemberName(existingProject?.team, id)),
        );
      }

      // ── Notify members whose role changed (in-app + email) ─────────────────
      const prevComposition: Array<{ userId: string; role: string }> =
        Array.isArray((existingProject?.team as any)?.teamComposition)
          ? (existingProject?.team as any).teamComposition
          : [];
      const newComposition: Array<{ userId: string; role: string }> =
        Array.isArray((team as any)?.teamComposition) ? (team as any).teamComposition : [];
      const roleChangedIds: string[] = [];
      for (const nm of newComposition) {
        if (!nm?.userId) continue;
        if (newMemberIds.includes(nm.userId)) continue; // already notified as new add
        if (nm.userId === currentUser?.id) continue;
        const prev = prevComposition.find(m => m?.userId === nm.userId);
        if (prev && prev.role !== nm.role) roleChangedIds.push(nm.userId);
      }
      if (roleChangedIds.length > 0) {
        const projectName = existingProject?.name ?? 'a project';
        roleChangedIds.forEach(memberId => {
          const newRoleLabel = resolveTeamMemberRoleLabel(team, memberId);
          dispatchNotification({
            event: 'project_member_added',
            recipientIds: [memberId],
            titleEn: `Your role in "${projectName}" was updated`,
            titleAr: `تم تحديث دورك في "${projectName}"`,
            messageEn: `${currentUser?.fullName ?? 'A team member'} updated your role in project "${projectName}" to ${newRoleLabel}.`,
            messageAr: `قام ${currentUser?.fullName ?? 'أحد أعضاء الفريق'} بتحديث دورك في مشروع "${projectName}" إلى ${newRoleLabel}.`,
            entityType: 'project',
            entityId: projectId,
            actionUrl: `/projects/${projectId}`,
            priority: 'normal',
            triggeredBy: currentUser?.id,
            triggeredByName: currentUser?.fullName ?? undefined,
            metadata: { project_name: projectName, role: newRoleLabel },
          }).catch(() => {});
        });
      }
    } catch (err) {
      console.error("Error updating project team:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to update team",
        variant: "destructive",
      });
      throw err;
    }
  };

  const deleteProject = async (id: string) => {
    const session = await ensureValidSession();
    if (!session.success) return;
    try {
      // Snapshot project info for audit before delete
      const snapshot = projects.find(p => p.id === id);

      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id);
        
      if (error) {
        throw new Error(error.message);
      }
      
      removeProjectFromCache(id);
      if (currentProject?.id === id) {
        setCurrentProject(null);
      }
      void invalidateProjects();

      // Audit + notify team (fire-and-forget)
      logAuditEvent({
        module: 'projects' as any,
        action: 'delete' as any,
        entityType: 'project',
        entityId: id,
        entityName: snapshot?.name,
        description: `Project "${snapshot?.name ?? id}" deleted`,
        severity: 'warning',
        previousState: snapshot ? { name: snapshot.name, status: snapshot.status } : undefined,
      }).catch(() => {});
      const recipients = (() => {
        const ids = new Set<string>();
        const t: any = snapshot?.team ?? {};
        if (t.projectManager) ids.add(t.projectManager);
        (Array.isArray(t.members) ? t.members : []).forEach((m: any) => m && ids.add(m));
        (Array.isArray(t.teamComposition) ? t.teamComposition : []).forEach(
          (m: any) => m?.userId && ids.add(m.userId)
        );
        if (currentUser?.id) ids.delete(currentUser.id);
        return Array.from(ids);
      })();
      if (recipients.length > 0 && snapshot?.name) {
        dispatchNotification({
          event: 'project_deleted',
          recipientIds: recipients,
          titleEn: `Project deleted: ${snapshot.name}`,
          titleAr: `تم حذف مشروع: ${snapshot.name}`,
          messageEn: `${currentUser?.fullName ?? 'An admin'} deleted the project "${snapshot.name}".`,
          messageAr: `قام ${currentUser?.fullName ?? 'أحد المسؤولين'} بحذف مشروع "${snapshot.name}".`,
          entityType: 'project',
          entityId: id,
          priority: 'high',
          triggeredBy: currentUser?.id,
          triggeredByName: currentUser?.fullName ?? undefined,
        }).catch(() => {});
      }

      toast({
        title: "Success",
        description: "Project deleted successfully!",
        variant: "success",
      });
    } catch (err) {
      console.error("Error deleting project:", err);
      setError(err instanceof Error ? err.message : 'Failed to delete project');
      toast({
        title: "Error",
        description: "Failed to delete project. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getProjectById = (id: string): Project | undefined => {
    const projectInState = projects.find(p => p.id === id);
    if (projectInState) {
      return projectInState;
    }
    
    return undefined;
  };

  return (
    <ProjectContext.Provider 
      value={{
        projects,
        loading,
        error,
        currentProject,
        setCurrentProject,
        addProject,
        updateProject,
        updateProjectTeam,
        deleteProject,
        getProjectById,
        fetchProjects,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};
