
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isValid, parseISO } from 'date-fns';
import { 
  Calendar, 
  BarChart, 
  Tag,
  FileText, 
  ArrowRight,
  Search,
  CheckCircle,
  AlertCircle,
  Clock3,
  MapPin,
  UserCircle,
  DollarSign,
  Eye,
  GitBranch,
  Archive,
  X,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useProjectContext } from '@/context/project/ProjectContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useToast } from '@/hooks/use-toast';

import { Project } from '@/types/project';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getFirstStageId, getProjectStageProgress, PROJECT_TYPE_OPTIONS } from '@/config/projectFlows';

interface ProjectListProps {
  projects: Project[];
  onViewProject: (projectId: string) => void;
  loading?: boolean;
}

const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  onViewProject,
  loading = false
}) => {
  const navigate = useNavigate();
  const { updateProject } = useProjectContext();
  const { hasAnyRole, isSuperAdmin } = useAuthorization();
  const { toast } = useToast();
  const canArchive = isSuperAdmin || hasAnyRole(['admin', 'fom', 'pm']);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  // T24 — bulk select / archive
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const toggleSelected = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const bulkArchive = async (archive: boolean) => {
    if (!selectedIds.size) return;
    setBulkBusy(true);
    let ok = 0, fail = 0;
    for (const id of selectedIds) {
      const project = projects.find(p => p.id === id);
      if (!project) { fail++; continue; }
      try {
        await updateProject({ ...project, archived: archive });
        ok++;
      } catch {
        fail++;
      }
    }
    setBulkBusy(false);
    clearSelection();
    toast({
      title: archive ? 'Projects archived' : 'Projects restored',
      description: `${ok} succeeded${fail ? `, ${fail} failed` : ''}.`,
      variant: fail ? 'destructive' : 'success',
    });
  };
  
  // Format date safely - handles invalid dates
  const formatDate = (dateString: string): string => {
    if (!dateString) return 'N/A';
    
    try {
      const date = parseISO(dateString);
      if (!isValid(date)) return 'Invalid date';
      return format(date, 'MMM d, yyyy');
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return 'Invalid date';
    }
  };
  
  // Filter projects based on search and filters
  const filteredProjects = projects.filter(project => {
    const matchesSearch = search === '' || 
      project.name.toLowerCase().includes(search.toLowerCase()) ||
      project.projectCode.toLowerCase().includes(search.toLowerCase()) ||
      (project.description && project.description.toLowerCase().includes(search.toLowerCase()));
      
    const matchesType = typeFilter === 'all' || project.projectType === typeFilter;
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
    const matchesArchive = showArchived ? true : !project.archived;
    
    return matchesSearch && matchesType && matchesStatus && matchesArchive;
  });

  const archivedCount = projects.filter(p => p.archived).length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="outline" className="flex items-center gap-0.5 text-[10px] px-1.5 h-5"><FileText className="h-2.5 w-2.5" /> Draft</Badge>;
      case 'active':
        return <Badge variant="default" className="bg-green-600 flex items-center gap-0.5 text-[10px] px-1.5 h-5"><CheckCircle className="h-2.5 w-2.5" /> Active</Badge>;
      case 'onHold':
        return <Badge variant="secondary" className="flex items-center gap-0.5 text-[10px] px-1.5 h-5"><Clock3 className="h-2.5 w-2.5" /> On Hold</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-blue-600 flex items-center gap-0.5 text-[10px] px-1.5 h-5"><CheckCircle className="h-2.5 w-2.5" /> Completed</Badge>;
      case 'cancelled':
        return <Badge variant="destructive" className="flex items-center gap-0.5 text-[10px] px-1.5 h-5"><AlertCircle className="h-2.5 w-2.5" /> Cancelled</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px] px-1.5 h-5">{status}</Badge>;
    }
  };

  // Safe budget parsing helper
  const getBudgetSummary = (budget: any) => {
    if (!budget) return null;

    const parseNumber = (value: any): number | null => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'number' && !Number.isNaN(value)) return value;
      if (typeof value === 'string') {
        const n = Number(value);
        return Number.isNaN(n) ? null : n;
      }
      return null;
    };

    const totalCents = parseNumber(
      budget.totalBudgetCents !== undefined
        ? budget.totalBudgetCents
        : budget.total_budget_cents,
    );

    const total = (() => {
      if (totalCents !== null) return totalCents / 100;
      const rawTotal = parseNumber(budget.total);
      return rawTotal;
    })();

    const currency = budget.currency || 'SDG';

    return total !== null ? { total, currency } : null;
  };

  const getTypeBadge = (type: string) => {
    const base = 'text-[10px] px-1.5 py-0 h-5';
    switch (type) {
      case 'infrastructure':
        return <Badge variant="outline" className={`${base} bg-blue-100 text-blue-800 border-blue-200`}>{type}</Badge>;
      case 'survey':
        return <Badge variant="outline" className={`${base} bg-green-100 text-green-800 border-green-200`}>{type}</Badge>;
      case 'compliance':
        return <Badge variant="outline" className={`${base} bg-amber-100 text-amber-800 border-amber-200`}>{type}</Badge>;
      case 'monitoring':
        return <Badge variant="outline" className={`${base} bg-indigo-100 text-indigo-800 border-indigo-200`}>{type}</Badge>;
      case 'training':
        return <Badge variant="outline" className={`${base} bg-purple-100 text-purple-800 border-purple-200`}>{type}</Badge>;
      default:
        return <Badge variant="outline" className={`${base} bg-gray-100 text-gray-800 border-gray-200`}>{type}</Badge>;
    }
  };
  
  if (loading) {
    return (
      <div className="w-full">
        <div className="flex flex-col md:flex-row gap-4 mb-4 items-start md:items-center justify-between">
          <div className="w-full md:w-96 h-9 bg-muted animate-pulse rounded-md"></div>
          <div className="flex gap-3">
            <div className="w-40 h-9 bg-muted animate-pulse rounded-md"></div>
            <div className="w-40 h-9 bg-muted animate-pulse rounded-md"></div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <Card key={item} className="overflow-hidden">
              <CardHeader className="p-2.5 pb-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 space-y-1.5">
                    <div className="w-3/4 h-4 bg-muted animate-pulse rounded-md"></div>
                    <div className="flex gap-1.5">
                      <div className="w-14 h-4 bg-muted animate-pulse rounded-md"></div>
                      <div className="w-16 h-4 bg-muted animate-pulse rounded-md"></div>
                    </div>
                  </div>
                  <div className="w-14 h-4 bg-muted animate-pulse rounded-md"></div>
                </div>
              </CardHeader>
              <CardContent className="p-2.5 pt-1 space-y-1.5">
                <div className="w-full h-3 bg-muted animate-pulse rounded-md"></div>
                <div className="w-2/3 h-3 bg-muted animate-pulse rounded-md"></div>
                <div className="w-3/4 h-3 bg-muted animate-pulse rounded-md"></div>
              </CardContent>
              <CardFooter className="p-2.5 pt-0">
                <div className="w-full h-7 bg-muted animate-pulse rounded-md"></div>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex flex-col sm:flex-row gap-1.5 mb-3 items-start sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by name, code or description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
            data-testid="input-search-projects"
          />
        </div>
        
        <div className="flex flex-wrap gap-1.5 shrink-0">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {PROJECT_TYPE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[135px] text-xs">
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

          {archivedCount > 0 && (
            <Button
              variant={showArchived ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setShowArchived(v => !v)}
              className="h-8 whitespace-nowrap text-xs"
              data-testid="button-toggle-archived"
            >
              <Archive className="h-3.5 w-3.5 mr-1" />
              {showArchived ? 'Hide Archived' : `Archived (${archivedCount})`}
            </Button>
          )}
        </div>
      </div>
      {filteredProjects.length !== projects.length && (
        <p className="text-xs text-muted-foreground mb-3">
          Showing {filteredProjects.length} of {projects.filter(p => showArchived || !p.archived).length} projects
        </p>
      )}

      {/* T24 — Bulk action bar (appears when at least one project is selected) */}
      {canArchive && selectedIds.size > 0 && (
        <div className="sticky top-0 z-10 mb-3 flex items-center justify-between gap-3 px-4 py-2 rounded-lg border border-[#1D3461]/20 bg-[#1D3461]/5">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-[#1D3461]">{selectedIds.size}</span>
            <span className="text-muted-foreground">selected</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={bulkBusy}
              onClick={() => bulkArchive(true)}
              data-testid="button-bulk-archive"
            >
              <Archive className="h-3.5 w-3.5 mr-1.5" />
              Archive selected
            </Button>
            {showArchived && (
              <Button
                variant="outline"
                size="sm"
                disabled={bulkBusy}
                onClick={() => bulkArchive(false)}
                data-testid="button-bulk-restore"
              >
                Restore
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={clearSelection} data-testid="button-bulk-clear">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {filteredProjects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredProjects.map((project) => (
            <Card 
              key={project.id} 
              className="overflow-hidden hover-elevate flex flex-col border border-border/60 shadow-sm hover:shadow-md transition-shadow"
              data-testid={`card-project-${project.id}`}
            >
              {/* Zone 1: Header — checkbox in flow so it never overlays the title */}
              <CardHeader className="p-2.5 pb-1.5 space-y-0">
                <div className="flex items-start gap-2">
                  {canArchive && (
                    <div
                      className="pt-0.5 shrink-0"
                      onClick={e => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selectedIds.has(project.id)}
                        onCheckedChange={() => toggleSelected(project.id)}
                        data-testid={`checkbox-project-${project.id}`}
                        aria-label="Select project"
                      />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-sm leading-snug line-clamp-2" title={project.name}>
                        {project.name}
                      </h3>
                      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                        {getStatusBadge(project.status)}
                        {project.archived && (
                          <Badge variant="outline" className="flex items-center gap-0.5 text-[10px] text-muted-foreground border-dashed">
                            <Archive className="h-2.5 w-2.5" /> Archived
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center flex-wrap gap-1 mt-1">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-mono whitespace-nowrap">
                        <Tag className="h-2.5 w-2.5 mr-0.5" />
                        {project.projectCode}
                      </Badge>
                      {getTypeBadge(project.projectType)}
                    </div>
                  </div>
                </div>
              </CardHeader>

              {/* Zone 2: Body - Key meta rows with icons */}
              <CardContent className="p-2.5 pt-1 flex-grow space-y-1.5">
                {/* Dates */}
                <div className="flex items-center gap-1.5 text-xs">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-muted-foreground truncate">
                    {formatDate(project.startDate)} - {formatDate(project.endDate)}
                  </span>
                </div>

                {/* Project Manager */}
                {project.team?.projectManager && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <UserCircle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">
                      <span className="text-muted-foreground">PM:</span>{' '}
                      <span className="font-medium text-foreground">{project.team.projectManager}</span>
                    </span>
                  </div>
                )}

                {/* Location */}
                {project.location?.region && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground truncate">
                      {project.location.region}
                      {project.location.state && `, ${project.location.state}`}
                    </span>
                  </div>
                )}

                {/* Budget */}
                {(() => {
                  const budgetSummary = getBudgetSummary(project.budget);
                  return budgetSummary ? (
                    <div className="flex items-center gap-1.5 text-xs">
                      <DollarSign className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-muted-foreground truncate">
                        {budgetSummary.currency} {budgetSummary.total.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  ) : null;
                })()}

                {/* Description preview */}
                {project.description && (
                  <p className="text-[11px] text-muted-foreground/90 line-clamp-2 leading-snug bg-muted/40 rounded px-1.5 py-1 border border-border/40">
                    {project.description}
                  </p>
                )}

                {/* Flow stage indicator */}
                {(() => {
                  const progress = getProjectStageProgress(project.projectType, project.currentFlowStage, project.customFlowStages);
                  if (!progress) return null;
                  const { stageName, stageIdx, totalStages: total, pct } = progress;
                  return (
                    <div className="space-y-0.5 pt-0.5">
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <GitBranch className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">
                          Stage {stageIdx + 1} of {total} — {stageName}
                        </span>
                      </div>
                      <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#1D3461] transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </CardContent>

              {/* Zone 3: Footer - Quick actions */}
              <CardFooter className="p-2.5 pt-0 mt-auto">
                <Button 
                  className="w-full h-8 sm:h-7 text-xs"
                  variant="default"
                  size="sm"
                  onClick={() => onViewProject(project.id)}
                  data-testid={`button-view-project-${project.id}`}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  View Details
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium">No projects found</h3>
          <p className="text-muted-foreground mt-2">
            {search || typeFilter !== 'all' || statusFilter !== 'all' || (!showArchived && archivedCount > 0)
              ? "Try adjusting your search filters"
              : "Create a new project to get started"}
          </p>
          <Button className="mt-4" onClick={() => navigate("/projects/create")}>
            Create Project
          </Button>
        </div>
      )}
    </div>
  );
};

export default ProjectList;
