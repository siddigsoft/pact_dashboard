import { useState } from 'react';
import { format, isValid, parseISO, differenceInDays } from 'date-fns';
import {
  Calendar,
  Tag,
  Users,
  BarChart,
  MapPin,
  Edit,
  Trash2,
  Layers,
  CheckCircle,
  AlertCircle,
  Clock3,
  FileText,
  Plus,
  Loader2,
  ArrowLeft,
  UserCircle,
  DollarSign,
  Target,
  TrendingUp
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Project } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import ActivityTimeline from './ActivityTimeline';
import TeamMemberCard from './TeamMemberCard';

interface ProjectDetailProps {
  project: Project;
  onEdit?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
}

const ProjectDetail: React.FC<ProjectDetailProps> = ({
  project,
  onEdit,
  onDelete,
  deleting,
}) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');

  // Helper function to safely format dates
  const formatDate = (dateString: string) => {
    try {
      const date = parseISO(dateString);
      return isValid(date) ? format(date, 'PPP') : 'Invalid date';
    } catch (error) {
      console.error('Date formatting error:', error);
      return 'Invalid date';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="outline" className="flex items-center gap-1"><FileText className="h-3 w-3" /> Draft</Badge>;
      case 'active':
        return <Badge variant="default" className="bg-green-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Active</Badge>;
      case 'onHold':
        return <Badge variant="secondary" className="flex items-center gap-1"><Clock3 className="h-3 w-3" /> On Hold</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-blue-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Completed</Badge>;
      case 'cancelled':
        return <Badge variant="destructive" className="flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getCompletedActivities = () => {
    const completed = project.activities.filter(activity => activity.status === 'completed').length;
    const total = project.activities.length;
    return { completed, total, percentage: total > 0 ? (completed / total) * 100 : 0 };
  };

  // Helper function to safely calculate timeline percentage
  const calculateTimelinePercentage = () => {
    try {
      const startDate = parseISO(project.startDate);
      const endDate = parseISO(project.endDate);
      const currentDate = new Date();
      
      if (!isValid(startDate) || !isValid(endDate)) {
        return 0;
      }
      
      const totalDuration = endDate.getTime() - startDate.getTime();
      if (totalDuration <= 0) return 0;
      
      const elapsedDuration = Math.min(
        currentDate.getTime() - startDate.getTime(),
        totalDuration
      );
      
      return Math.max(0, Math.min(100, Math.round((elapsedDuration / totalDuration) * 100)));
    } catch (error) {
      console.error('Timeline percentage calculation error:', error);
      return 0;
    }
  };

  const getDaysRemaining = () => {
    try {
      const endDate = parseISO(project.endDate);
      if (!isValid(endDate)) return null;
      const days = differenceInDays(endDate, new Date());
      return days;
    } catch {
      return null;
    }
  };

  const daysRemaining = getDaysRemaining();

  return (
    <div className="space-y-4 p-3 md:p-4">
      {/* Back Navigation */}
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={() => navigate('/projects')}
        className="gap-1.5 -ml-2"
        data-testid="button-back-projects"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Projects
      </Button>

      {/* Hero Summary Card */}
      <Card className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border-blue-200 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            {/* Left: Project info */}
            <div className="space-y-2 flex-1 min-w-0">
              <div className="flex items-start gap-2 flex-wrap">
                <h1 className="text-xl font-semibold">{project.name}</h1>
                {getStatusBadge(project.status)}
              </div>
              <div className="flex items-center flex-wrap gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5" />
                  <span className="font-mono">{project.projectCode}</span>
                </span>
                {project.team?.projectManager && (
                  <span className="flex items-center gap-1">
                    <UserCircle className="h-3.5 w-3.5" />
                    {project.team.projectManager}
                  </span>
                )}
                {project.location?.region && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {project.location.region}
                    {project.location.state && `, ${project.location.state}`}
                  </span>
                )}
              </div>

              {/* Quick stats row */}
              <div className="flex flex-wrap gap-4 pt-2">
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-8 h-8 rounded-md bg-blue-500/20 flex items-center justify-center">
                    <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Activities</p>
                    <p className="font-semibold">{getCompletedActivities().completed}/{getCompletedActivities().total}</p>
                  </div>
                </div>
                
                {daysRemaining !== null && (
                  <div className="flex items-center gap-2 text-sm">
                    <div className={`w-8 h-8 rounded-md flex items-center justify-center ${daysRemaining > 30 ? 'bg-green-500/20' : daysRemaining > 7 ? 'bg-orange-500/20' : 'bg-red-500/20'}`}>
                      <TrendingUp className={`h-4 w-4 ${daysRemaining > 30 ? 'text-green-600 dark:text-green-400' : daysRemaining > 7 ? 'text-orange-600 dark:text-orange-400' : 'text-red-600 dark:text-red-400'}`} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Days Left</p>
                      <p className="font-semibold">{daysRemaining > 0 ? daysRemaining : 'Overdue'}</p>
                    </div>
                  </div>
                )}

                {project.budget && (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-8 h-8 rounded-md bg-green-500/20 flex items-center justify-center">
                      <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Budget</p>
                      <p className="font-semibold">{project.budget.total.toLocaleString()}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex flex-wrap gap-2">
              {onEdit && (
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <Edit className="h-4 w-4 mr-1.5" /> Edit
                </Button>
              )}
              {onDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      disabled={!!deleting}
                    >
                      <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure you want to delete this project?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the project "{project.name}" and all associated data including activities, team members, and progress tracking.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={onDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={!!deleting}
                      >
                        {deleting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting...
                          </>
                        ) : (
                          "Delete Project"
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Project content */}
      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 w-full md:w-[360px]">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left column: Details + Timeline */}
            <div className="lg:col-span-2 space-y-4">
              {/* Project details */}
              <Card>
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-base font-semibold">Project Details</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Project ID</p>
                      <div className="flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-mono">{project.projectCode}</span>
                      </div>
                    </div>

                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Project Manager</p>
                      <div className="flex items-center gap-1.5">
                        <UserCircle className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">{project.team?.projectManager || 'Not assigned'}</span>
                      </div>
                    </div>

                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Type</p>
                      <div className="flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm capitalize">{project.projectType}</span>
                      </div>
                    </div>
                    
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Start</p>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">{formatDate(project.startDate)}</span>
                      </div>
                    </div>
                    
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">End</p>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">{formatDate(project.endDate)}</span>
                      </div>
                    </div>
                    
                    {project.budget && (
                      <div className="space-y-0.5">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Budget</p>
                        <div className="flex items-center gap-1.5">
                          <BarChart className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">{project.budget.total.toLocaleString()} {project.budget.currency}</span>
                        </div>
                      </div>
                    )}
                    
                    {project.location && (project.location.region || project.location.state) && (
                      <div className="space-y-0.5 col-span-2">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Location</p>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">
                            {project.location.region}
                            {project.location.state && `, ${project.location.state}`}
                            {project.location.locality && `, ${project.location.locality}`}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {project.description && (
                    <div className="space-y-1 pt-2 border-t border-border/50">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Description</p>
                      <p className="text-sm">{project.description}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              {/* Activity Timeline */}
              <ActivityTimeline activities={project.activities} />
            </div>

            {/* Right column: Progress */}
            <Card className="h-fit">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-base font-semibold">Progress</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Activities</span>
                    <span className="font-medium">{getCompletedActivities().completed}/{getCompletedActivities().total}</span>
                  </div>
                  <Progress value={getCompletedActivities().percentage} className="h-2" />
                </div>
                
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Timeline</span>
                    <span className="font-medium">{calculateTimelinePercentage()}%</span>
                  </div>
                  <Progress 
                    value={calculateTimelinePercentage()} 
                    className="h-2" 
                  />
                </div>
                
                {project.budget && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Budget Used</span>
                      <span className="font-medium">
                        {Math.round((project.budget.allocated / project.budget.total) * 100) || 0}%
                      </span>
                    </div>
                    <Progress 
                      value={Math.round((project.budget.allocated / project.budget.total) * 100) || 0} 
                      className="h-2" 
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="activities" className="space-y-4 mt-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Activities</h2>
            <Button size="sm" onClick={() => navigate(`/projects/${project.id}/activities/create`)}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Activity
            </Button>
          </div>
          
          {project.activities.length > 0 ? (
            <div className="space-y-4">
              {project.activities.map(activity => (
                <Card key={activity.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-md">{activity.name}</CardTitle>
                      <Badge variant={activity.status === 'completed' ? 'default' : activity.status === 'inProgress' ? 'secondary' : 'outline'}>
                        {activity.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="py-2">
                    {activity.description && <p className="text-sm text-muted-foreground mb-2">{activity.description}</p>}
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-1 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {formatDate(activity.startDate)} - {formatDate(activity.endDate)}
                        </span>
                      </div>
                      
                      {activity.assignedTo && (
                        <div className="flex items-center">
                          <Users className="h-4 w-4 mr-1 text-muted-foreground" />
                          <span className="text-muted-foreground">{activity.assignedTo}</span>
                        </div>
                      )}
                    </div>
                    
                    {activity.subActivities.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <p className="text-xs text-muted-foreground font-medium">SUB-ACTIVITIES</p>
                        <div className="grid gap-2">
                          {activity.subActivities.map(sub => (
                            <div key={sub.id} className="flex items-center justify-between py-1 px-3 rounded-md bg-muted/50">
                              <span className="text-sm">{sub.name}</span>
                              <Badge variant={sub.status === 'completed' ? 'default' : sub.status === 'inProgress' ? 'secondary' : 'outline'} className="text-xs">
                                {sub.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="border-t pt-2 flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/projects/${project.id}/activities/${activity.id}`)}>
                      View Details
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border border-dashed rounded-lg border-border">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-muted mb-4">
                <Layers className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">No activities yet</h3>
              <p className="text-muted-foreground mt-1 max-w-md mx-auto">
                Activities help you break down your project into manageable tasks
              </p>
              <Button className="mt-4" onClick={() => navigate(`/projects/${project.id}/activities/create`)}>
                <Plus className="h-4 w-4 mr-2" /> Add First Activity
              </Button>
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="team" className="space-y-4 mt-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Team Members</h2>
            <Button size="sm" onClick={() => navigate(`/projects/${project.id}/team`)}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Members
            </Button>
          </div>
          
          {project.team?.teamComposition && project.team.teamComposition.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {project.team.teamComposition.map((member) => (
                <TeamMemberCard key={member.userId} member={member} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border border-dashed rounded-lg border-border">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-muted mb-4">
                <Users className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">No team members yet</h3>
              <p className="text-muted-foreground mt-1 max-w-md mx-auto">
                Assign team members to this project
              </p>
              <Button className="mt-4" onClick={() => navigate(`/projects/${project.id}/team`)}>
                <Plus className="h-4 w-4 mr-2" /> Add Team Members
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ProjectDetail;
