import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Loader2, AlertTriangle, Layers, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import ActivityForm from '@/components/project/activity/ActivityForm';
import { useProjectContext } from '@/context/project/ProjectContext';
import { useInvalidateProjectsQueries } from '@/context/project/projectQueries';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { ProjectActivity, Project } from '@/types/project';
import { useToast } from '@/hooks/use-toast';

const CreateProjectActivity = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getProjectById, fetchProjects, projects, loading } = useProjectContext();
  const invalidate = useInvalidateProjectsQueries();
  const { currentUser, authReady } = useUser();
  const { toast } = useToast();
  const [project, setProject] = useState<Project | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authReady && projects.length === 0 && !loading) fetchProjects();
  }, [authReady, loading, projects.length]);

  useEffect(() => {
    if (!id) { setProject(undefined); return; }
    const found = getProjectById(id);
    setProject(found);
  }, [id, projects, loading]);

  if ((!authReady || loading) && !project) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project && authReady && !loading) {
    return (
      <div className="max-w-xl mx-auto mt-10 px-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Project Not Found</AlertTitle>
          <AlertDescription>
            This project does not exist or has been removed.
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={() => navigate('/projects')}>Back to Projects</Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const handleSubmit = async (activity: ProjectActivity) => {
    if (!project || !id) return;
    setSubmitting(true);
    try {
      const { data: inserted, error } = await supabase
        .from('project_activities')
        .insert({
          project_id:  id,
          name:        activity.name,
          description: activity.description ?? null,
          start_date:  activity.startDate,
          end_date:    activity.endDate,
          due_date:    activity.dueDate ?? null,
          status:      activity.status,
          priority:    activity.priority ?? 'medium',
          progress:    activity.progress ?? 0,
          is_active:   activity.isActive,
          created_by:  currentUser?.id ?? null,
        })
        .select('id')
        .single();

      if (error) throw error;

      if (activity.subActivities.length > 0 && inserted?.id) {
        await supabase.from('sub_activities').insert(
          activity.subActivities.map(sub => ({
            activity_id: inserted.id,
            name:        sub.name,
            description: sub.description ?? null,
            status:      sub.status,
            is_active:   sub.isActive,
            due_date:    sub.dueDate ?? null,
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
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4">

      {/* ── Page Header ── */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => navigate(`/projects/${id}`)}
          data-testid="button-back"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold leading-none">
              {project ? 'Add Activity' : 'Create Activity'}
            </h1>
            {project && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 font-normal gap-1 text-muted-foreground border-border/70">
                <Layers className="h-2.5 w-2.5" />
                {project.name}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Activities break the project into trackable phases. Add sub-tasks to each as needed.
          </p>
        </div>
      </div>

      {/* ── Quick-guide tip ── */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-200/60 bg-blue-50/50 dark:bg-blue-900/10 dark:border-blue-800/40 px-3 py-2">
        <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
          <span className="font-semibold">How to use:</span> Fill in the activity name, set its status &amp; priority, then define the timeline window. Optionally add sub-activities to track smaller steps. Click <span className="font-semibold">Create Activity</span> when ready — you can edit any field later.
        </p>
      </div>

      {/* ── Form ── */}
      {submitting ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Creating activity…</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/70 bg-card shadow-sm p-4 sm:p-5">
          <ActivityForm
            projectId={id}
            onSubmit={handleSubmit}
            onCancel={() => navigate(`/projects/${id}`)}
          />
        </div>
      )}
    </div>
  );
};

export default CreateProjectActivity;
