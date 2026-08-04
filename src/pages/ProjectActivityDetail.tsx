import { useEffect, useMemo, useState, type FC } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Calendar, Users, ChevronLeft, Flag, TrendingUp, CheckCircle2, Clock, XCircle, Loader2 } from 'lucide-react';
import { format, isValid, parseISO } from 'date-fns';

import { useProjectContext } from '@/context/project/ProjectContext';
import { useUser } from '@/context/user/UserContext';
import { supabase } from '@/integrations/supabase/client';
import {
  useInvalidateProjectsQueries,
  useProjectActivitiesQuery,
  useUpdateProjectInCache,
} from '@/context/project/projectQueries';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { ProjectActivity } from '@/types/project';

const PRIORITY_META = {
  high:   { label: 'High',   cls: 'bg-red-100 text-red-700 border-red-200' },
  medium: { label: 'Medium', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  low:    { label: 'Low',    cls: 'bg-green-100 text-green-700 border-green-200' },
} as const;

const STATUS_META = {
  completed:  { label: 'Completed',   cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  inProgress: { label: 'In Progress', cls: 'bg-blue-100 text-blue-700 border-blue-200',           icon: TrendingUp },
  pending:    { label: 'Pending',     cls: 'bg-gray-100 text-gray-600 border-gray-200',            icon: Clock },
  cancelled:  { label: 'Cancelled',  cls: 'bg-orange-100 text-orange-600 border-orange-200',      icon: XCircle },
} as const;

const ProjectActivityDetail: FC = () => {
  const { id, activityId } = useParams<{ id: string; activityId: string }>();
  const navigate = useNavigate();
  const { projects, loading, fetchProjects, getProjectById } = useProjectContext();
  const { authReady } = useUser();
  const invalidate = useInvalidateProjectsQueries();
  const updateProjectCache = useUpdateProjectInCache();
  const { data: activities } = useProjectActivitiesQuery(id);
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [localStatus, setLocalStatus] = useState<string>('');
  const [localProgress, setLocalProgress] = useState<number>(0);

  useEffect(() => {
    if (authReady && projects.length === 0 && !loading) fetchProjects();
  }, [authReady, loading, projects.length]);

  useEffect(() => {
    if (!id || !activities) return;
    const found = getProjectById(id);
    if (found) updateProjectCache({ ...found, activities });
  }, [id, activities, projects]);

  const project = useMemo(() => (id ? getProjectById(id) : undefined), [id, projects, activities]);
  const activity: ProjectActivity | undefined = useMemo(
    () => (activities ?? project?.activities)?.find((a) => a.id === activityId),
    [project, activityId, activities]
  );

  useEffect(() => {
    if (activity) {
      setLocalStatus(activity.status);
      setLocalProgress(activity.progress ?? 0);
    }
  }, [activity]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    try {
      const date = parseISO(dateString);
      return isValid(date) ? format(date, 'd MMM yyyy') : '—';
    } catch { return '—'; }
  };

  const handleSave = async () => {
    if (!activityId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('project_activities')
        .update({ status: localStatus, progress: localProgress, updated_at: new Date().toISOString() })
        .eq('id', activityId);
      if (error) throw error;
      toast({ title: 'Activity updated' });
      invalidate();
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const isDirty = activity && (localStatus !== activity.status || localProgress !== (activity.progress ?? 0));

  if ((!authReady || loading) && !project) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project && authReady && !loading) {
    return (
      <div className="max-w-2xl mx-auto my-12">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Project Not Found</AlertTitle>
          <AlertDescription>
            <Button variant="outline" className="mt-3" onClick={() => navigate('/projects')}>Back to Projects</Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="max-w-2xl mx-auto my-12">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Activity Not Found</AlertTitle>
          <AlertDescription>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" onClick={() => navigate(`/projects/${project.id}`)}>Back to Project</Button>
              <Button onClick={() => navigate(`/projects/${project.id}/activities/create`)}>Create Activity</Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const priorityMeta = PRIORITY_META[activity.priority ?? 'medium'];
  const statusMeta = STATUS_META[localStatus as keyof typeof STATUS_META] ?? STATUS_META.pending;
  const isOverdue = activity.dueDate && activity.status !== 'completed' && new Date(activity.dueDate) < new Date();
  const assignees = activity.assignees ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-5 p-4 sm:p-6">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate(`/projects/${project.id}?tab=activities`)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold truncate">{activity.name}</h1>
          <p className="text-xs text-muted-foreground truncate">Project: {project.name}</p>
        </div>
      </div>

      {/* Status + priority badges */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={`text-xs px-2 py-0.5 border ${statusMeta.cls}`}>
          <statusMeta.icon className="h-3 w-3 mr-1 inline" />{statusMeta.label}
        </Badge>
        <Badge variant="outline" className={`text-xs px-2 py-0.5 border ${priorityMeta.cls}`}>
          <Flag className="h-3 w-3 mr-1 inline" />{priorityMeta.label} Priority
        </Badge>
        {isOverdue && (
          <Badge variant="outline" className="text-xs px-2 py-0.5 border bg-red-50 text-red-600 border-red-200">
            <AlertTriangle className="h-3 w-3 mr-1 inline" />Overdue
          </Badge>
        )}
      </div>

      {/* Overview */}
      <Card className="shadow-none border-border/60">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">Overview</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {activity.description && <p className="text-sm text-muted-foreground">{activity.description}</p>}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground mb-0.5">Start Date</p>
              <p className="font-medium">{formatDate(activity.startDate)}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-0.5">End Date</p>
              <p className="font-medium">{formatDate(activity.endDate)}</p>
            </div>
            {activity.dueDate && (
              <div>
                <p className="text-muted-foreground mb-0.5">Due Date</p>
                <p className={`font-medium ${isOverdue ? 'text-red-600' : ''}`}>{formatDate(activity.dueDate)}</p>
              </div>
            )}
            {assignees.length > 0 && (
              <div className="col-span-2">
                <p className="text-muted-foreground mb-0.5">Assigned To</p>
                <div className="flex flex-wrap gap-1.5">
                  {assignees.map(name => (
                    <span key={name} className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded-full text-xs">
                      <Users className="h-2.5 w-2.5" />{name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {assignees.length === 0 && activity.assignedTo && (
              <div>
                <p className="text-muted-foreground mb-0.5">Assigned To</p>
                <p className="font-medium">{activity.assignedTo}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Update status + progress */}
      <Card className="shadow-none border-border/60">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">Update Progress</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={localStatus} onValueChange={setLocalStatus}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="inProgress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Progress</label>
              <span className="text-xs font-semibold tabular-nums">{localProgress}%</span>
            </div>
            <Slider
              min={0} max={100} step={5}
              value={[localProgress]}
              onValueChange={([v]) => setLocalProgress(v)}
              className="w-full"
            />
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${localProgress === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                style={{ width: `${localProgress}%` }}
              />
            </div>
          </div>
          {isDirty && (
            <Button className="w-full bg-[#0F2041] hover:bg-[#1D3461] text-white" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Sub-activities */}
      {activity.subActivities.length > 0 && (
        <Card className="shadow-none border-border/60">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">
              Sub-activities ({activity.subActivities.filter(s => s.status === 'completed').length}/{activity.subActivities.length} done)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <Progress
              value={(activity.subActivities.filter(s => s.status === 'completed').length / activity.subActivities.length) * 100}
              className="h-1.5 mb-3"
            />
            <div className="space-y-1.5">
              {activity.subActivities.map(sub => {
                const sm = STATUS_META[sub.status as keyof typeof STATUS_META] ?? STATUS_META.pending;
                return (
                  <div key={sub.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-muted/40">
                    <span className="text-sm">{sub.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {sub.dueDate && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Calendar className="h-2.5 w-2.5" />{formatDate(sub.dueDate)}</span>}
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${sm.cls}`}>{sm.label}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ProjectActivityDetail;
