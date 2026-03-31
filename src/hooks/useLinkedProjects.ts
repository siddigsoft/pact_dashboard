import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getFirstStageId } from '@/config/projectFlows';
import { normaliseProjectType } from '@/types/project';

export interface LinkedProject {
  id: string;
  name: string;
  projectCode?: string;
  projectType: string;
  currentFlowStage: string;
}

async function fetchLinkedProjects(
  entityId: string,
  type: 'mmp' | 'site_visit',
): Promise<LinkedProject[]> {
  const fn = type === 'mmp' ? 'get_projects_linked_to_mmp' : 'get_projects_linked_to_site_visit';

  const { data, error } = await supabase
    .rpc(fn, { entity_id: entityId });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => {
    const pt = normaliseProjectType(row.project_type);
    return {
      id: row.id,
      name: row.name,
      projectCode: row.project_code,
      projectType: pt,
      currentFlowStage: row.current_flow_stage ?? getFirstStageId(pt),
    };
  });
}

export function useLinkedProjects(entityId: string | undefined | null, type: 'mmp' | 'site_visit') {
  return useQuery({
    queryKey: ['linked_projects', type, entityId],
    queryFn: () => fetchLinkedProjects(entityId!, type),
    enabled: !!entityId,
    staleTime: 60 * 1000,
  });
}
