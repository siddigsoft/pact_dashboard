import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStalledAlert } from '@/hooks/useProjectStalledAlert';
import { Plus, FolderKanban, CheckCircle2, Clock, BarChart3, ClipboardList, LayoutTemplate, X, GitBranch, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { GradientStatCard } from '@/components/ui/gradient-stat-card';
import ProjectList from '@/components/project/ProjectList';
import { useProjectContext } from '@/context/project/ProjectContext';
import { ConnectedPagesBar } from '@/components/ui/connected-pages-bar';
import { useAuthorization } from '@/hooks/use-authorization';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { PROJECT_TEMPLATES } from '@/config/projectTypeConfig';
import { getProjectFlow } from '@/config/projectFlows';

const ProjectsPage = () => {
  const navigate = useNavigate();
  useProjectStalledAlert();
  const { hasAnyRole, isSuperAdmin } = useAuthorization();
  
  const projectContext = useProjectContext();
  const { projects, loading } = projectContext;

  const [showTemplates, setShowTemplates] = useState(false);
  const [previewType, setPreviewType] = useState<string | null>(null);

  const handleViewProject = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  const projectStats = useMemo(() => {
    const total = projects.length;
    const completed = projects.filter(p => p.status === 'completed').length;
    const active = projects.filter(p => p.status === 'active' || p.status === 'onHold').length;
    const pending = projects.filter(p => p.status === 'draft').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, active, pending, completionRate };
  }, [projects]);

  const previewFlow = previewType ? getProjectFlow(previewType) : null;
  const previewTemplate = previewType ? PROJECT_TEMPLATES.find(t => t.type === previewType) : null;

  const handleUseTemplate = (type: string) => {
    setShowTemplates(false);
    navigate(`/projects/create?template=${type}`);
  };

  return (
    <div className="min-h-screen bg-background p-3 md:p-4 space-y-3">
      {/* Compact Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-md bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0">
            <FolderKanban className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Projects</h1>
            <p className="text-xs text-muted-foreground">
              Manage project planning and activities
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(isSuperAdmin() || hasAnyRole(['admin', 'Admin', 'ict', 'ICT', 'fom', 'projectManager'])) && (
            <Button variant="outline" size="sm" onClick={() => navigate('/tracker-preparation-plan')} data-testid="button-tracker-prep">
              <ClipboardList className="h-4 w-4 mr-1.5" />
              Tracker Prep
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowTemplates(true)}
            data-testid="button-start-from-template"
          >
            <LayoutTemplate className="h-4 w-4 mr-1.5" />
            Start from Template
          </Button>
          <Button size="sm" onClick={() => navigate('/projects/create')} data-testid="button-create-project">
            <Plus className="h-4 w-4 mr-1.5" />
            Create Project
          </Button>
        </div>
      </div>

      {/* Quick Navigation */}
      <ConnectedPagesBar exclude="projects" />

      {/* Condensed Statistics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <GradientStatCard
          title="Total"
          value={projectStats.total}
          subtitle="All projects"
          icon={FolderKanban}
          color="blue"
          size="sm"
          data-testid="card-stat-total-projects"
        />

        <GradientStatCard
          title="Completed"
          value={projectStats.completed}
          subtitle={`${projectStats.completionRate}% rate`}
          icon={CheckCircle2}
          color="green"
          size="sm"
          data-testid="card-stat-completed-projects"
        />

        <GradientStatCard
          title="Active"
          value={projectStats.active}
          subtitle="In progress"
          icon={BarChart3}
          color="cyan"
          size="sm"
          data-testid="card-stat-active-projects"
        />

        <GradientStatCard
          title="Pending"
          value={projectStats.pending}
          subtitle="Awaiting start"
          icon={Clock}
          color="orange"
          size="sm"
          data-testid="card-stat-pending-projects"
        />
      </div>
      
      {/* Project List */}
      <div className="bg-card rounded-md border p-3">
        <ProjectList 
          projects={projects} 
          onViewProject={handleViewProject}
          loading={loading}
        />
      </div>

      {/* Project Templates Dialog */}
      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="h-5 w-5 text-blue-600" />
              Start from a Project Template
            </DialogTitle>
            <DialogDescription>
              Choose a project type to get a pre-filled form with the right lifecycle stages, typical team structure, and budget categories.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-1 overflow-hidden">
            {/* Template list */}
            <div className="w-64 border-r flex-shrink-0 overflow-y-auto">
              <div className="p-2 space-y-0.5">
                {PROJECT_TEMPLATES.map(tpl => (
                  <button
                    key={tpl.type}
                    type="button"
                    onClick={() => setPreviewType(tpl.type)}
                    className={`w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors ${
                      previewType === tpl.type
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted text-foreground'
                    }`}
                    data-testid={`template-${tpl.type}`}
                  >
                    <div className="font-medium leading-tight">{tpl.shortLabel}</div>
                    <div className={`text-xs mt-0.5 ${previewType === tpl.type ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                      {tpl.durationDays}d typical
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Preview pane */}
            <div className="flex-1 overflow-y-auto p-6">
              {!previewType || !previewTemplate || !previewFlow ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                  <LayoutTemplate className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">Select a template on the left to preview it</p>
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold">{previewTemplate.label}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{previewTemplate.description}</p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">{previewTemplate.durationDays}d typical</Badge>
                    </div>
                  </div>

                  {/* Lifecycle stages */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <GitBranch className="h-3.5 w-3.5" />
                      {previewFlow.stages.length}-Stage Lifecycle
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {previewFlow.stages.map((stage, idx) => (
                        <div key={stage.id} className="flex items-center gap-1 text-xs">
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 px-2 py-0.5 font-medium">
                            {idx + 1}. {stage.label}
                          </span>
                          {idx < previewFlow.stages.length - 1 && (
                            <ChevronRight className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Typical team */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Typical Team Roles</p>
                    <div className="flex flex-wrap gap-2">
                      {previewTemplate.teamRoles.map(r => (
                        <Badge key={r.role} variant="outline" className="text-xs">
                          {r.count}× {r.role.replace(/([A-Z])/g, ' $1').trim()}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Budget categories */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Budget Categories</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {previewTemplate.budgetCategories.map(cat => (
                        <div key={cat.key} className="text-xs text-muted-foreground flex items-center gap-1.5 px-2 py-1.5 bg-muted/50 rounded-md">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                          {cat.label}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Stage details */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Stage Details</p>
                    <div className="space-y-2">
                      {previewFlow.stages.slice(0, 4).map((stage, idx) => (
                        <div key={stage.id} className="flex gap-3 text-sm">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 flex items-center justify-center text-[10px] font-bold mt-0.5">
                            {idx + 1}
                          </span>
                          <div>
                            <span className="font-medium">{stage.label}</span>
                            <p className="text-xs text-muted-foreground">{stage.description}</p>
                          </div>
                        </div>
                      ))}
                      {previewFlow.stages.length > 4 && (
                        <p className="text-xs text-muted-foreground pl-8">
                          +{previewFlow.stages.length - 4} more stages…
                        </p>
                      )}
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => handleUseTemplate(previewType)}
                    data-testid={`button-use-template-${previewType}`}
                  >
                    Use this Template
                    <ChevronRight className="h-4 w-4 ml-1.5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectsPage;
