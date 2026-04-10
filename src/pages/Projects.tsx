import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStalledAlert } from '@/hooks/useProjectStalledAlert';
import {
  Plus,
  FolderKanban,
  CheckCircle2,
  Clock,
  BarChart3,
  ClipboardList,
  LayoutTemplate,
  LayoutList,
  Kanban,
  GanttChartSquare,
  Search,
  X,
  GitBranch,
  ChevronRight,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GradientStatCard } from '@/components/ui/gradient-stat-card';
import ProjectList from '@/components/project/ProjectList';
import ProjectBoardView from '@/components/project/ProjectBoardView';
import ProjectTimelineView from '@/components/project/ProjectTimelineView';
import { useProjectContext } from '@/context/project/ProjectContext';
import { ConnectedPagesBar } from '@/components/ui/connected-pages-bar';
import { useAuthorization } from '@/hooks/use-authorization';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { PROJECT_TEMPLATES } from '@/config/projectTypeConfig';
import { getProjectFlow, PROJECT_TYPE_OPTIONS } from '@/config/projectFlows';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type ViewMode = 'list' | 'board' | 'timeline';

const VIEW_KEY = 'projects_view_mode';

function getInitialView(): ViewMode {
  const stored = localStorage.getItem(VIEW_KEY);
  if (stored === 'board' || stored === 'timeline') return stored;
  return 'list';
}

const ProjectsPage = () => {
  const navigate = useNavigate();
  useProjectStalledAlert();
  const { hasAnyRole, isSuperAdmin } = useAuthorization();

  const projectContext = useProjectContext();
  const { projects, loading } = projectContext;

  const [showTemplates, setShowTemplates] = useState(false);
  const [previewType, setPreviewType] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>(getInitialView);

  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPM, setFilterPM] = useState('all');
  const [filterSearch, setFilterSearch] = useState('');

  const handleViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_KEY, mode);
  };

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

  const pmOptions = useMemo(() => {
    const pms = new Set<string>();
    for (const p of projects) {
      if (p.team?.projectManager) pms.add(p.team.projectManager);
    }
    return Array.from(pms).sort();
  }, [projects]);

  const boardFilters = {
    type: filterType,
    status: filterStatus,
    pm: filterPM,
    search: filterSearch,
  };

  const hasActiveFilters = filterType !== 'all' || filterStatus !== 'all' || filterPM !== 'all' || filterSearch !== '';

  const clearFilters = () => {
    setFilterType('all');
    setFilterStatus('all');
    setFilterPM('all');
    setFilterSearch('');
  };

  // Super Admin only
  if (!isSuperAdmin()) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-3 max-w-sm">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
            <FolderKanban className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold">Access Restricted</h2>
          <p className="text-muted-foreground text-sm">Projects is only accessible to Super Admins.</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-sm text-primary underline hover:no-underline"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

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
      <ConnectedPagesBar exclude="projects" include={['analytics', 'portfolio']} />

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

      {/* View toggle + filter bar */}
      <div className="bg-card rounded-md border">
        {/* View toggle row */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60">
          <div className="flex items-center gap-1 rounded-md bg-muted p-0.5">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2.5 text-xs gap-1.5"
              onClick={() => handleViewMode('list')}
              data-testid="button-view-list"
            >
              <LayoutList className="h-3.5 w-3.5" />
              List
            </Button>
            <Button
              variant={viewMode === 'board' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2.5 text-xs gap-1.5"
              onClick={() => handleViewMode('board')}
              data-testid="button-view-board"
            >
              <Kanban className="h-3.5 w-3.5" />
              Board
            </Button>
            <Button
              variant={viewMode === 'timeline' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2.5 text-xs gap-1.5"
              onClick={() => handleViewMode('timeline')}
              data-testid="button-view-timeline"
            >
              <GanttChartSquare className="h-3.5 w-3.5" />
              Timeline
            </Button>
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={clearFilters} data-testid="button-clear-filters">
              <X className="h-3 w-3 mr-1" />
              Clear filters
            </Button>
          )}
        </div>

        {/* Shared filter bar for board and timeline */}
        {viewMode !== 'list' && (
          <div className="flex flex-wrap gap-2 px-3 py-2 border-b border-border/60">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search projects…"
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
                data-testid="input-board-search"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-8 w-[160px] text-xs" data-testid="select-board-type">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {PROJECT_TYPE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 w-[140px] text-xs" data-testid="select-board-status">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="onHold">On Hold</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            {pmOptions.length > 0 && (
              <Select value={filterPM} onValueChange={setFilterPM}>
                <SelectTrigger className="h-8 w-[160px] text-xs" data-testid="select-board-pm">
                  <SelectValue placeholder="All PMs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All PMs</SelectItem>
                  {pmOptions.map(pm => (
                    <SelectItem key={pm} value={pm}>{pm}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* View content */}
        <div className="p-3">
          {viewMode === 'list' && (
            <ProjectList
              projects={projects}
              onViewProject={handleViewProject}
              loading={loading}
            />
          )}
          {viewMode === 'board' && (
            <ProjectBoardView
              projects={projects.filter(p => !p.archived)}
              filters={boardFilters}
            />
          )}
          {viewMode === 'timeline' && (
            <ProjectTimelineView
              projects={projects.filter(p => !p.archived)}
              filters={boardFilters}
            />
          )}
        </div>
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
