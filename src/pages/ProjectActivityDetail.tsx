import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Calendar, Users, ChevronLeft, Layers } from 'lucide-react';
import { format, isValid, parseISO } from 'date-fns';

import { useProjectContext } from '@/context/project/ProjectContext';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProjectActivity } from '@/types/project';

const ProjectActivityDetail: React.FC = () => {
  const { id, activityId } = useParams<{ id: string; activityId: string }>();
  const navigate = useNavigate();
  const { projects, loading, fetchProjects, getProjectById } = useProjectContext();
  const [projectLoaded, setProjectLoaded] = useState(false);

  // Ensure projects are loaded
  useEffect(() => {
    const ensureProjects = async () => {
      if (projects.length === 0 && !loading) {
        await fetchProjects();
      }
      setProjectLoaded(true);
    };
    ensureProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const project = useMemo(() => (id ? getProjectById(id) : undefined), [id, projects]);
  const activity: ProjectActivity | undefined = useMemo(
    () => project?.activities.find((a) => a.id === activityId),
    [project, activityId]
  );

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    try {
      const date = parseISO(dateString);
      return isValid(date) ? format(date, 'PPP') : 'Invalid date';
    } catch {
      return 'Invalid date';
    }
  };

  const statusBadge = (status?: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-blue-600">Completed</Badge>;
      case 'inProgress':
        return <Badge variant="secondary">In Progress</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      case 'pending':
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  if ((loading || !projectLoaded) && !project) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-[spin_3s_linear_infinite]"></div>
            <div className="absolute inset-[6px] rounded-full border-4 border-t-primary animate-[spin_2s_linear_infinite]"></div>
          </div>
          <p className="text-muted-foreground animate-pulse">Loading activity…</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-2xl mx-auto my-12">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Project Not Found</AlertTitle>
          <AlertDescription>
            The project you are looking for does not exist or has been removed.
            <div className="mt-4">
              <Button variant="outline" onClick={() => navigate('/projects')}>
                Back to Projects
              </Button>
            </div>
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
            We couldn't find the requested activity in this project.
            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={() => navigate(`/projects/${project.id}`)}>
                Back to Project
              </Button>
              <Button onClick={() => navigate(`/projects/${project.id}/activities/create`)}>
                Create Activity
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/projects/${project.id}`)}
          className="hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{activity.name}</h1>
          <p className="text-muted-foreground text-sm">Project: {project.name}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {activity.description && (
            <p className="text-muted-foreground">{activity.description}</p>
          )}

          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center">
              <Calendar className="h-4 w-4 mr-1 text-muted-foreground" />
              <span className="text-muted-foreground">
                {formatDate(activity.startDate)} – {formatDate(activity.endDate)}
              </span>
            </div>
            <div className="flex items-center">
              <Layers className="h-4 w-4 mr-1 text-muted-foreground" />
              {statusBadge(activity.status)}
            </div>
            {activity.assignedTo && (
              <div className="flex items-center">
                <Users className="h-4 w-4 mr-1 text-muted-foreground" />
                <span className="text-muted-foreground">{activity.assignedTo}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Sub-activities</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.subActivities && activity.subActivities.length > 0 ? (
            <div className="grid gap-2">
              {activity.subActivities.map((sub) => (
                <div key={sub.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
                  <div className="flex items-center gap-3">
                    <span>{sub.name}</span>
                    {statusBadge(sub.status)}
                  </div>
                  {sub.dueDate && (
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4 mr-1" />
                      {formatDate(sub.dueDate)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No sub-activities</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProjectActivityDetail;
