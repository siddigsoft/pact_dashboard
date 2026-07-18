import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ActivityForm from '@/components/project/activity/ActivityForm';
import { useProjectContext } from '@/context/project/ProjectContext';
import { useInvalidateProjectsQueries } from '@/context/project/projectQueries';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { ProjectActivity, Project } from '@/types/project';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

const CreateProjectActivity = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getProjectById, fetchProjects, projects, loading } = useProjectContext();
  const invalidate = useInvalidateProjectsQueries();
  const { user } = useAuth();
  const { toast } = useToast();
  const [project, setProject] = useState<Project | undefined>(undefined);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (projects.length === 0 && !loading) fetchProjects();
  }, []);

  useEffect(() => {
    if (!id) { setProject(undefined); setIsLoadingProject(false); return; }
    const found = getProjectById(id);
    setProject(found);
    if (projects.length > 0 || !loading) setIsLoadingProject(false);
  }, [id, projects, loading]);

  if (isLoadingProject || (loading && !project)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project && !isLoadingProject) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Project Not Found</AlertTitle>
        <AlertDescription>
          The project you are trying to add an activity to does not exist or has been removed.
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/projects')}>Back to Projects</Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  const handleSubmit = async (activity: ProjectActivity) => {
    if (!project || !id) return;
    setSubmitting(true);
    try {
      const { data: inserted, error } = await supabase
        .from('project_activities')
        .insert({
          project_id:       id,
          name:             activity.name,
          description:      activity.description ?? null,
          start_date:       activity.startDate,
          end_date:         activity.endDate,
          due_date:         activity.dueDate ?? null,
          status:           activity.status,
          priority:         activity.priority ?? 'medium',
          progress:         activity.progress ?? 0,
          is_active:        activity.isActive,
          created_by:       user?.id ?? null,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Insert sub-activities if any
      if (activity.subActivities.length > 0 && inserted?.id) {
        await supabase.from('sub_activities').insert(
          activity.subActivities.map(sub => ({
            activity_id:  inserted.id,
            name:         sub.name,
            description:  sub.description ?? null,
            status:       sub.status,
            is_active:    sub.isActive,
            due_date:     sub.dueDate ?? null,
          }))
        );
      }

      invalidate();
      toast({ title: 'Activity created', description: `"${activity.name}" added to ${project.name}.` });
      navigate(`/projects/${id}?tab=activities`);
    } catch (e: any) {
      toast({ title: 'Failed to create activity', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate(`/projects/${id}`)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Create Activity</h1>
          <p className="text-sm text-muted-foreground">{project?.name}</p>
        </div>
      </div>

      {submitting ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ActivityForm
          projectId={id}
          onSubmit={handleSubmit}
          onCancel={() => navigate(`/projects/${id}`)}
        />
      )}
    </div>
  );
};

export default CreateProjectActivity;
