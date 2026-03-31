import { useState, useEffect, useCallback } from 'react';
import { format, isValid, parseISO, differenceInDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
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
  TrendingUp,
  Wallet,
  GitBranch,
  Link2,
  FileSpreadsheet,
  MessageCircle,
  Paperclip,
  Archive,
  ArchiveRestore,
  Download,
  Activity,
  AlertTriangle,
  CheckSquare,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useBudget } from '@/context/budget/BudgetContext';
import { ProjectBudgetCard } from '@/components/budget/BudgetCard';
import { EditProjectBudgetDialog } from '@/components/budget/EditProjectBudgetDialog';
import { CurrencySwitcher } from '@/components/currency/CurrencySwitcher';
import { useUser } from '@/context/user/UserContext';
import { useAuthorization } from '@/hooks/use-authorization';
import ProjectCommentsPanel from './ProjectCommentsPanel';
import ProjectDocumentsPanel from './ProjectDocumentsPanel';
import { ProjectFieldTasksPanel } from './ProjectFieldTasksPanel';
import { OutlookCalendarPanel } from './OutlookCalendarPanel';

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
import ProjectCostTab from './ProjectCostTab';
import { useProjectFlow } from '@/hooks/useProjectFlow';
import { FlowStrip } from './flow/FlowStrip';
import { FlowTab } from './flow/FlowTab';

interface ProjectDetailProps {
  project: Project;
  onEdit?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
}

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

  const allocatedCents = parseNumber(
    budget.allocatedBudgetCents !== undefined
      ? budget.allocatedBudgetCents
      : budget.allocated_budget_cents,
  );

  const allocated = (() => {
    if (allocatedCents !== null) return allocatedCents / 100;
    const rawAllocated = parseNumber(budget.allocated);
    return rawAllocated;
  })();

  const remainingCents = parseNumber(
    budget.remainingBudgetCents !== undefined
      ? budget.remainingBudgetCents
      : budget.remaining_budget_cents,
  );

  const remaining = (() => {
    if (remainingCents !== null) return remainingCents / 100;
    const rawRemaining = parseNumber(budget.remaining);
    if (rawRemaining !== null) return rawRemaining;
    if (total !== null && allocated !== null) return total - allocated;
    return null;
  })();

  const currency = budget.currency || 'SDG';
  const expenseCurrency = budget.expenseCurrency || budget.currency || 'SDG';

  return { total, allocated, remaining, currency, expenseCurrency };
};

interface EntityChip {
  id: string;
  label: string;
  path: string;
}

interface MmpFileRow { id: string; name: string }
interface SiteVisitRow { id: string; site_name?: string }

function LinkedEntitiesDisplay({
  relatedMMPs,
  relatedSiteVisits,
}: {
  relatedMMPs: string[];
  relatedSiteVisits: string[];
}) {
  const navigate = useNavigate();
  const [mmpChips, setMmpChips] = useState<EntityChip[]>([]);
  const [svChips, setSvChips] = useState<EntityChip[]>([]);

  useEffect(() => {
    if (relatedMMPs.length > 0) {
      supabase
        .from('mmp_files')
        .select('id, name')
        .in('id', relatedMMPs)
        .then(({ data }) => {
          setMmpChips(
            (data as MmpFileRow[] ?? []).map((r) => ({ id: r.id, label: r.name, path: `/mmp/${r.id}` })),
          );
        });
    } else {
      setMmpChips([]);
    }
  }, [relatedMMPs.join(',')]);

  useEffect(() => {
    if (relatedSiteVisits.length > 0) {
      supabase
        .from('site_visits')
        .select('id, site_name')
        .in('id', relatedSiteVisits)
        .then(({ data }) => {
          setSvChips(
            (data as SiteVisitRow[] ?? []).map((r) => ({ id: r.id, label: r.site_name || r.id, path: `/site-visits/${r.id}` })),
          );
        });
    } else {
      setSvChips([]);
    }
  }, [relatedSiteVisits.join(',')]);

  if (mmpChips.length === 0 && svChips.length === 0) return null;

  return (
    <div className="space-y-2 pt-2 border-t border-border/50">
      <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <Link2 className="h-3 w-3" />
        Linked MMPs &amp; Site Visits
      </p>
      <div className="flex flex-wrap gap-1.5">
        {mmpChips.map((chip) => (
          <button
            key={chip.id}
            onClick={() => navigate(chip.path)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#1D3461]/30 bg-[#0F2041]/5 dark:bg-[#1D3461]/20 px-2.5 py-0.5 text-xs text-[#1D3461] dark:text-blue-300 hover:bg-[#1D3461]/10 transition-colors"
            data-testid={`chip-linked-mmp-${chip.id}`}
          >
            <FileSpreadsheet className="h-2.5 w-2.5 flex-shrink-0" />
            <span className="max-w-[160px] truncate">{chip.label}</span>
          </button>
        ))}
        {svChips.map((chip) => (
          <button
            key={chip.id}
            onClick={() => navigate(chip.path)}
            className="inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/5 dark:bg-green-500/10 px-2.5 py-0.5 text-xs text-green-700 dark:text-green-300 hover:bg-green-500/10 transition-colors"
            data-testid={`chip-linked-sv-${chip.id}`}
          >
            <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
            <span className="max-w-[160px] truncate">{chip.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const ProjectDetail: React.FC<ProjectDetailProps> = ({
  project,
  onEdit,
  onDelete,
  deleting,
}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'overview');
  const [editBudgetOpen, setEditBudgetOpen] = useState(false);
  const flow = useProjectFlow(project);
  const { getProjectBudget, loading: budgetLoading, refreshProjectBudgets } = useBudget();
  const { currentUser } = useUser();
  const { isSuperAdmin, hasAnyRole } = useAuthorization();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isAdminUser = isSuperAdmin() || hasAnyRole(['admin', 'fom']);
  const isProjectManagerUser =
    !!currentUser?.fullName && project.team?.projectManager === currentUser.fullName;
  const canArchive = isAdminUser || isProjectManagerUser;
  const projectBudget = getProjectBudget(project.id);
  const [userWorkloads, setUserWorkloads] = useState<Record<string, number>>({});
  const [isArchiving, setIsArchiving] = useState(false);

  // Stalled detection: find days since last stage advance
  const stalledDays = (() => {
    if (!flow.stageHistory.length) return null;
    const lastAdvanced = flow.stageHistory[flow.stageHistory.length - 1]?.advancedAt;
    if (!lastAdvanced) return null;
    try {
      const d = parseISO(lastAdvanced);
      return isValid(d) ? differenceInDays(new Date(), d) : null;
    } catch {
      return null;
    }
  })();
  const isStalled = stalledDays !== null && stalledDays >= 14 && project.status === 'active';

  // Archive / unarchive handler
  const handleArchiveToggle = useCallback(async () => {
    setIsArchiving(true);
    try {
      const { error } = await supabase
        .rpc('set_project_archived', { p_id: project.id, p_archived: !project.archived });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast({
        title: project.archived ? 'Project unarchived' : 'Project archived',
        description: project.archived
          ? `"${project.name}" has been restored.`
          : `"${project.name}" has been archived.`,
      });
    } catch {
      toast({ title: 'Error', description: 'Failed to update archive status.', variant: 'destructive' });
    } finally {
      setIsArchiving(false);
    }
  }, [project.id, project.archived, project.name, queryClient, toast]);

  // PDF export
  const handleExportPdf = useCallback(() => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const PAGE_W = 210;
    let y = 15;

    // Header
    doc.setFillColor(15, 32, 65);
    doc.rect(0, 0, PAGE_W, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('PACT Command Center', 14, 11);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Project Report', 14, 19);
    doc.text(`Exported: ${format(new Date(), 'PPP')}`, PAGE_W - 14, 19, { align: 'right' });
    y = 36;

    // Project title
    doc.setTextColor(15, 32, 65);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(project.name, 14, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Code: ${project.projectCode}  |  Type: ${project.projectType}  |  Status: ${project.status}`, 14, y);
    y += 10;

    // Details table
    const details: string[][] = [
      ['Project Manager', project.team?.projectManager || '—'],
      ['Start Date', project.startDate ? format(parseISO(project.startDate), 'PPP') : '—'],
      ['End Date', project.endDate ? format(parseISO(project.endDate), 'PPP') : '—'],
      ['Location', [project.location?.region, project.location?.state].filter(Boolean).join(', ') || '—'],
    ];
    if (project.budget) {
      const b = project.budget as any;
      const total = b.totalBudgetCents != null ? b.totalBudgetCents / 100 : b.total;
      details.push(['Budget', `${b.currency || 'SDG'} ${Number(total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]);
    }
    autoTable(doc, {
      startY: y,
      head: [['Field', 'Value']],
      body: details,
      theme: 'striped',
      headStyles: { fillColor: [29, 52, 97], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // Flow stages
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 32, 65);
    doc.text('Flow Stage Progress', 14, y);
    y += 4;
    const stageRows = flow.activeStages.map((s, idx) => {
      const status = flow.getStageStatus(s.id);
      const histEntry = flow.stageHistory.find(h => h.stageId === s.id);
      return [
        `${idx + 1}. ${s.label}`,
        status.charAt(0).toUpperCase() + status.slice(1),
        histEntry ? format(parseISO(histEntry.advancedAt), 'PP') : '—',
        histEntry?.notes || '—',
      ];
    });
    autoTable(doc, {
      startY: y,
      head: [['Stage', 'Status', 'Completed', 'Notes']],
      body: stageRows,
      theme: 'striped',
      headStyles: { fillColor: [29, 52, 97], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2.5 },
      columnStyles: { 0: { cellWidth: 65 }, 1: { cellWidth: 22 }, 2: { cellWidth: 30 } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // Activities
    if (project.activities.length) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 32, 65);
      doc.text('Activities', 14, y);
      y += 4;
      const actRows = project.activities.map(a => [
        a.name,
        a.status || '—',
        a.startDate ? format(parseISO(a.startDate), 'PP') : '—',
        a.endDate ? format(parseISO(a.endDate), 'PP') : '—',
        a.assignedTo || '—',
      ]);
      autoTable(doc, {
        startY: y,
        head: [['Activity', 'Status', 'Start', 'End', 'Assigned To']],
        body: actRows,
        theme: 'striped',
        headStyles: { fillColor: [29, 52, 97], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2.5 },
        margin: { left: 14, right: 14 },
      });
    }

    doc.save(`project-${project.projectCode}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  }, [project, flow]);

  // Active statuses for workload calculation (non-terminal statuses)
  const ACTIVE_SITE_VISIT_STATUSES = ['pending', 'scheduled', 'in_progress', 'assigned', 'dispatched', 'verification_pending'];
  const ACTIVE_MMP_ENTRY_STATUSES = ['Pending', 'pending', 'in_progress', 'In Progress', 'dispatched', 'Dispatched', 'accepted', 'Accepted'];

  // Derive stable user ID list for dependency tracking
  const teamUserIds = (project.team?.teamComposition || []).map(m => m.userId).sort().join(',');

  // Fetch workloads for team members
  const fetchTeamWorkloads = useCallback(async () => {
    const teamMembers = project.team?.teamComposition || [];
    if (teamMembers.length === 0) return;

    const userIds = teamMembers.map(m => m.userId);

    try {
      const [{ data: siteVisits }, { data: mmpEntries }] = await Promise.all([
        supabase
          .from('site_visits')
          .select('assigned_to, status')
          .in('assigned_to', userIds)
          .in('status', ACTIVE_SITE_VISIT_STATUSES),
        supabase
          .from('mmp_site_entries')
          .select('forwarded_to_user_id, status')
          .in('forwarded_to_user_id', userIds)
          .in('status', ACTIVE_MMP_ENTRY_STATUSES)
      ]);

      const MAX_CAPACITY = 10;
      const workloads: Record<string, number> = {};

      userIds.forEach(userId => {
        const svCount = (siteVisits || []).filter(sv => sv.assigned_to === userId).length;
        const mmpCount = (mmpEntries || []).filter(e => e.forwarded_to_user_id === userId).length;
        const totalTasks = svCount + mmpCount;
        workloads[userId] = Math.min(100, Math.round((totalTasks / MAX_CAPACITY) * 100));
      });

      setUserWorkloads(workloads);
    } catch (error) {
      console.error('Error fetching team workloads:', error);
    }
  }, [teamUserIds]); // Re-run when team composition changes

  useEffect(() => {
    if (activeTab === 'team') {
      fetchTeamWorkloads();
    }
  }, [activeTab, fetchTeamWorkloads]);

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

  const budgetSummary = project.budget ? getBudgetSummary(project.budget) : null;

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

      {/* Archived Banner */}
      {project.archived && (
        <div className="flex items-center gap-2 rounded-md bg-muted border border-border px-4 py-2.5 text-sm text-muted-foreground">
          <Archive className="h-4 w-4 flex-shrink-0" />
          <span>This project is <strong>archived</strong> and read-only. Unarchive to make changes.</span>
        </div>
      )}

      {/* Stalled Banner */}
      {isStalled && (
        <div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>
            <strong>Stalled:</strong> No stage advancement in {stalledDays} days. Review the flow and take action.
          </span>
        </div>
      )}

      {/* Hero Summary Card */}
      <Card className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border-blue-200 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            {/* Left: Project info */}
            <div className="space-y-2 flex-1 min-w-0">
              <div className="flex items-start gap-2 flex-wrap">
                <h1 className="text-xl font-semibold">{project.name}</h1>
                {getStatusBadge(project.status)}
                {budgetSummary && budgetSummary.total != null && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 text-green-700 dark:text-green-300 px-2 py-0.5 text-xs font-medium">
                    <DollarSign className="h-3 w-3" />
                    {`${budgetSummary.currency} ${budgetSummary.total.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`}
                  </span>
                )}
                {budgetSummary && budgetSummary.expenseCurrency && budgetSummary.expenseCurrency !== budgetSummary.currency && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300 px-2 py-0.5 text-xs font-medium">
                    <TrendingUp className="h-3 w-3" />
                    Expenses: {budgetSummary.expenseCurrency}
                  </span>
                )}
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

                {budgetSummary && budgetSummary.total != null && (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-8 h-8 rounded-md bg-green-500/20 flex items-center justify-center">
                      <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Budget</p>
                      <p className="font-semibold">
                        {`${budgetSummary.currency} ${budgetSummary.total.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`}
                      </p>
                    </div>
                  </div>
                )}

                {/* Health Score */}
                {(() => {
                  const acts = getCompletedActivities();
                  const actPct = acts.total > 0 ? acts.completed / acts.total : 0;
                  const stagePct = flow.activeStages.length > 0
                    ? flow.currentStageIndex / flow.activeStages.length
                    : 0;
                  const health = Math.round((actPct * 0.5 + stagePct * 0.5) * 100);
                  const color = isStalled ? 'text-amber-600 dark:text-amber-400'
                    : health >= 70 ? 'text-green-600 dark:text-green-400'
                    : health >= 40 ? 'text-blue-600 dark:text-blue-400'
                    : 'text-orange-600 dark:text-orange-400';
                  const bg = isStalled ? 'bg-amber-500/20'
                    : health >= 70 ? 'bg-green-500/20'
                    : health >= 40 ? 'bg-blue-500/20'
                    : 'bg-orange-500/20';
                  return (
                    <div className="flex items-center gap-2 text-sm">
                      <div className={`w-8 h-8 rounded-md flex items-center justify-center ${bg}`}>
                        <Activity className={`h-4 w-4 ${color}`} />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Health</p>
                        <p className={`font-semibold ${color}`}>
                          {isStalled ? 'Stalled' : `${health}%`}
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex flex-wrap gap-2">
              {/* Currency display preference */}
              <CurrencySwitcher mode="split" />

              {/* PDF Export */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPdf}
                data-testid="button-export-pdf"
              >
                <Download className="h-4 w-4 mr-1.5" />
                Export PDF
              </Button>

              {/* Archive / Unarchive */}
              {canArchive && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleArchiveToggle}
                  disabled={isArchiving}
                  data-testid="button-archive-project"
                >
                  {isArchiving ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : project.archived ? (
                    <ArchiveRestore className="h-4 w-4 mr-1.5" />
                  ) : (
                    <Archive className="h-4 w-4 mr-1.5" />
                  )}
                  {project.archived ? 'Unarchive' : 'Archive'}
                </Button>
              )}

              {onEdit && !project.archived && (
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
      
      {/* Flow Strip */}
      {flow.activeStages.length > 0 && (
        <Card className="border-[#1D3461]/20 bg-[#0F2041]/5 dark:bg-[#1D3461]/10">
          <CardContent className="px-4 py-2">
            <div className="flex items-center gap-2 mb-1">
              <GitBranch className="h-3.5 w-3.5 text-[#1D3461] dark:text-blue-400" />
              <span className="text-xs font-medium text-[#1D3461] dark:text-blue-300">
                {flow.currentStage?.label ?? 'Initialising'} · Stage {flow.currentStageIndex + 1}/{flow.activeStages.length}
              </span>
            </div>
            <FlowStrip
              stages={flow.flowDef}
              currentStageIndex={flow.currentStageIndex}
              getStageStatus={flow.getStageStatus}
              stageHistory={flow.stageHistory}
              compact={false}
            />
          </CardContent>
        </Card>
      )}

      {/* Project content */}
      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto pb-1 -mx-1 px-1">
        <TabsList className="grid grid-cols-10 w-[1000px] sm:w-[1080px] md:w-[1160px]">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="costs" data-testid="tab-costs">Costs</TabsTrigger>
          <TabsTrigger value="budget">Budget</TabsTrigger>
          <TabsTrigger value="flow" data-testid="tab-flow">
            <GitBranch className="h-3.5 w-3.5 mr-1" />Flow
          </TabsTrigger>
          <TabsTrigger value="field_tasks" data-testid="tab-field-tasks">
            <CheckSquare className="h-3.5 w-3.5 mr-1" />Tasks
          </TabsTrigger>
          <TabsTrigger value="comments" data-testid="tab-comments">
            <MessageCircle className="h-3.5 w-3.5 mr-1" />Comments
          </TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents">
            <Paperclip className="h-3.5 w-3.5 mr-1" />Documents
          </TabsTrigger>
          <TabsTrigger value="calendar" data-testid="tab-calendar">
            <Calendar className="h-3.5 w-3.5 mr-1" />Calendar
          </TabsTrigger>
        </TabsList>
        </div>

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
                    
                    {budgetSummary && budgetSummary.total != null && (
                      <div className="space-y-0.5">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Budget</p>
                        <div className="flex items-center gap-1.5">
                          <BarChart className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">{`${budgetSummary.currency} ${budgetSummary.total.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`}</span>
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

                  <LinkedEntitiesDisplay
                    relatedMMPs={project.relatedMMPs ?? []}
                    relatedSiteVisits={project.relatedSiteVisits ?? []}
                  />
                </CardContent>
              </Card>
              
              {/* Activity Timeline */}
              <ActivityTimeline activities={project.activities} />
            </div>

            {/* Right column: Progress + Documents */}
            <div className="space-y-4">
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
                  
                  {budgetSummary && budgetSummary.total != null && budgetSummary.allocated != null && budgetSummary.total > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Budget Used</span>
                        <span className="font-medium">
                          {(() => {
                            const total = budgetSummary.total || 0;
                            const allocated = budgetSummary.allocated || 0;
                            return total > 0
                              ? Math.round((allocated / total) * 100)
                              : 0;
                          })()}%
                        </span>
                      </div>
                      <Progress 
                        value={(() => {
                          const total = budgetSummary.total || 0;
                          const allocated = budgetSummary.allocated || 0;
                          return total > 0
                            ? Math.round((allocated / total) * 100)
                            : 0;
                        })()} 
                        className="h-2" 
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Documents panel */}
              {currentUser && (
                <Card>
                  <CardHeader className="p-3 pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Paperclip className="h-4 w-4" />
                      Documents
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <ProjectDocumentsPanel
                      projectId={project.id}
                      currentUserId={currentUser.id}
                      isAdmin={isAdminUser}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
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

          {/* Comments section */}
          {currentUser && (
            <Card className="mt-4">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" />
                  Comments
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <ProjectCommentsPanel
                  projectId={project.id}
                  currentUserId={currentUser.id}
                  currentUserName={currentUser.fullName}
                  isAdmin={isAdminUser}
                />
              </CardContent>
            </Card>
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
                <TeamMemberCard 
                  key={member.userId} 
                  member={member} 
                  calculatedWorkload={userWorkloads[member.userId]}
                />
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

        <TabsContent value="costs" className="space-y-4 mt-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Costs & Expenses</h2>
          </div>
          <ProjectCostTab
            projectId={project.id}
            projectName={project.name}
            budgetTotalCents={(() => {
              const bs = getBudgetSummary(projectBudget);
              return bs?.total ? bs.total * 100 : null;
            })()}
            currency={getBudgetSummary(projectBudget)?.currency || 'SDG'}
          />
        </TabsContent>

        <TabsContent value="budget" className="space-y-4 mt-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Project Budget</h2>
            {projectBudget && (
              <Button size="sm" variant="outline" onClick={() => setEditBudgetOpen(true)} data-testid="button-edit-budget">
                <Edit className="h-4 w-4 mr-1.5" /> Edit Budget
              </Button>
            )}
            {!projectBudget && (
              <Button size="sm" onClick={() => navigate('/budget')}>
                <Plus className="h-4 w-4 mr-1.5" /> Create Budget
              </Button>
            )}
          </div>
          
          {budgetLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : projectBudget ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ProjectBudgetCard budget={projectBudget} projectName={project.name} />
              </div>
              <EditProjectBudgetDialog
                budget={projectBudget}
                projectName={project.name}
                open={editBudgetOpen}
                onOpenChange={setEditBudgetOpen}
                onSuccess={() => refreshProjectBudgets()}
              />
            </>
          ) : (
            <div className="text-center py-12 border border-dashed rounded-lg border-border">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-muted mb-4">
                <Wallet className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">No budget assigned</h3>
              <p className="text-muted-foreground mt-1 max-w-md mx-auto">
                Create a budget for this project to track spending and allocations
              </p>
              <Button className="mt-4" onClick={() => navigate('/budget')}>
                <Plus className="h-4 w-4 mr-2" /> Create Project Budget
              </Button>
            </div>
          )}
        </TabsContent>
        <TabsContent value="flow" className="mt-4">
          <FlowTab
            flow={flow}
            projectName={project.name}
            projectType={project.projectType}
            projectCode={project.projectCode}
            projectId={project.id}
            currentUserId={currentUser?.id}
            projectStart={project.startDate}
            projectEnd={project.endDate}
            allDefaultStages={flow.flowDef}
            customFlowStages={(project.customFlowStages ?? []) as any}
          />
        </TabsContent>
        <TabsContent value="field_tasks" className="mt-4">
          <ProjectFieldTasksPanel
            projectId={project.id}
            projectName={project.name}
            currentUserId={currentUser?.id}
            currentUserName={currentUser?.fullName ?? 'A manager'}
            canEdit={!project.archived && canArchive}
            allStages={flow.flowDef}
            customEntries={(project.customFlowStages ?? []) as any}
          />
        </TabsContent>

        <TabsContent value="comments" className="mt-4">
          <ProjectCommentsPanel
            projectId={project.id}
            currentUserId={currentUser?.id ?? ''}
            currentUserName={currentUser?.fullName}
            isAdmin={canArchive}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <ProjectDocumentsPanel
            projectId={project.id}
            currentUserId={currentUser?.id ?? ''}
            isAdmin={canArchive}
          />
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <OutlookCalendarPanel projectId={project.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ProjectDetail;
