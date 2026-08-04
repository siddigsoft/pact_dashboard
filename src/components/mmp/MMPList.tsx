import { useEffect, useState } from 'react';
import { MMPFile } from '@/types';
import { exportMMPPaymentReport } from '@/utils/mmpPaymentReportExport';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { MoreVertical } from 'lucide-react';
import { MMPStatusBadge } from './MMPStatusBadge';
import { useNavigate } from 'react-router-dom';
import { useMMP } from '@/context/mmp/MMPContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { canSeePage } from '@/lib/page-roles';
import { useBudget } from '@/context/budget/BudgetContext';
import { BudgetStatusBadge } from '@/components/budget/BudgetStatusBadge';
import ForwardToFOMDialog from './ForwardToFOMDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { checkRecallAllowed, performRecall, canForceRecall, getRecallTierForRole } from '@/utils/recallUtils';
import { RotateCcw, AlertTriangle, CheckCircle, Pencil, BarChart3, Archive, ArchiveRestore, Search, X } from 'lucide-react';
import { RecallDialog } from './RecallDialog';
import MmpFullReportDialog from './MmpFullReportDialog';
import MMPProgressDialog from './MMPProgressDialog';
import { Label } from '@/components/ui/label';

interface MMPListProps {
  mmpFiles: MMPFile[];
  showActions?: boolean;
}

export const MMPList = ({ mmpFiles, showActions = true }: MMPListProps) => {
  const navigate = useNavigate();
  const { deleteMMPFile, unlinkAndDeleteMMPFile, getMMPLinkedCounts, getMMPPaymentDetails, verifyMMP, refreshMMPFiles, archiveMMP, restoreMMP, mmpFiles: allMMPFiles } = useMMP();
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const { currentUser, effectiveCurrentUser } = useAppContext();
  const { checkPermission, hasAnyRole, currentUser: authUser } = useAuthorization();
  const { mmpBudgets } = useBudget();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);
  const [selectedMMPForForward, setSelectedMMPForForward] = useState<MMPFile | null>(null);
  const [forwardedMMPs, setForwardedMMPs] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const [recallingId, setRecallingId] = useState<string | null>(null);
  const [recallDialogOpen, setRecallDialogOpen] = useState(false);
  const [selectedMMPForRecall, setSelectedMMPForRecall] = useState<MMPFile | null>(null);
  const [showProgressDialog, setShowProgressDialog] = useState(false);
  const [selectedMMPForProgress, setSelectedMMPForProgress] = useState<MMPFile | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [renameMMPTarget, setRenameMMPTarget] = useState<MMPFile | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isSavingRename, setIsSavingRename] = useState(false);
  const [fullReportOpen, setFullReportOpen] = useState(false);
  const [selectedMmpForReport, setSelectedMmpForReport] = useState<{ id: string; name: string } | null>(null);
  // Staged delete dialog: stage 0=closed, 1=choose action, 2=hard-delete confirm, 3=unlink confirm
  const [deleteStage, setDeleteStage] = useState<0 | 1 | 2 | 3>(0);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [linkedCounts, setLinkedCounts] = useState<{ downPayments: number; costSubmissions: number } | null>(null);
  const [paymentDetails, setPaymentDetails] = useState<any[]>([]);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  // Archived view state
  const [showArchived, setShowArchived] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveHubFilter, setArchiveHubFilter] = useState('__none__');
  const [archiveMonthFilter, setArchiveMonthFilter] = useState('__none__');

  // Check permissions (case-insensitive fallback for possible lowercase stored roles)
  const isAdmin = hasAnyRole(['Admin', 'admin']);
  const isICT = hasAnyRole(['ICT', 'ict']);
  const isSuperAdmin = hasAnyRole(['Super Admin', 'super_admin']);
  const isFOM = hasAnyRole([
    'Field Operation Manager (FOM)',
    'FOM',
    'fom',
    'field operation manager',
    'Field Ops Manager',
    'field ops manager'
  ]);
  const isSupervisor = hasAnyRole(['Supervisor', 'supervisor', 'hubsupervisor', 'hub_supervisor']);
  const userRole = isSuperAdmin ? 'super_admin' : isAdmin ? 'admin' : isICT ? 'ict' : isFOM ? 'fom' : 'user';
  const userCanForceRecall = canForceRecall(userRole);
  // Supervisors are VIEW-ONLY on the MMP management page — they cannot create, edit, delete or forward MMPs.
  // Delete is restricted to Super Admins only — it is a destructive, irreversible operation.
  const canDeleteMMP = isSuperAdmin;
  const canEditMMP = !isSupervisor && (checkPermission('mmp', 'update') || isAdmin || isICT);

  // Fetch linked submission counts + payment details whenever Stage 1 dialog opens
  useEffect(() => {
    if (confirmId && deleteStage === 1) {
      setLinkedCounts(null);
      setPaymentDetails([]);
      getMMPLinkedCounts(confirmId).then(setLinkedCounts);
      getMMPPaymentDetails(confirmId).then(setPaymentDetails);
    }
  }, [confirmId, deleteStage]);
  const canForwardMMP = !isSupervisor && (checkPermission('mmp', 'update') || isAdmin || isICT);
  // Full Report is visible to management/oversight roles only
  const canViewFullReport = canSeePage('mmp-full-report', effectiveCurrentUser?.role);
  // State Report is visible to FOM — same dialog, scoped label, red styling
  const canViewStateReport = isFOM && !canViewFullReport;

  // Initialize forwarded status from MMP workflow
  useEffect(() => {
    const forwarded = new Set<string>();
    mmpFiles.forEach(mmp => {
      const workflow = mmp.workflow as any;
      if (workflow?.forwardedToFomIds && workflow.forwardedToFomIds.length > 0) {
        forwarded.add(mmp.id);
      }
    });
    setForwardedMMPs(forwarded);
  }, [mmpFiles]);

  const handleForward = (mmp: MMPFile) => {
    setSelectedMMPForForward(mmp);
    setForwardDialogOpen(true);
  };

  const handleForwardComplete = (userIds: string[]) => {
    if (selectedMMPForForward) {
      setForwardedMMPs(prev => new Set(prev).add(selectedMMPForForward.id));
    }
  };

  // Open recall dialog
  const handleRecall = (mmp: MMPFile) => {
    setSelectedMMPForRecall(mmp);
    setRecallDialogOpen(true);
  };
  
  // Handle recall completion
  const handleRecallComplete = async () => {
    await refreshMMPFiles();
    if (selectedMMPForRecall) {
      setForwardedMMPs(prev => {
        const newSet = new Set(prev);
        newSet.delete(selectedMMPForRecall.id);
        return newSet;
      });
    }
    setRecallDialogOpen(false);
    setSelectedMMPForRecall(null);
  };

  // Check if MMP can be recalled (or if user can force recall)
  const canRecallMMP = (mmp: MMPFile) => {
    const recallCheck = checkRecallAllowed(mmp);
    return recallCheck.canRecall || userCanForceRecall;
  };
  
  // Check if recall is blocked (for showing indicator)
  const isRecallBlocked = (mmp: MMPFile) => {
    return !checkRecallAllowed(mmp).canRecall;
  };

  const handleViewProgress = (mmp: MMPFile) => {
    setSelectedMMPForProgress(mmp);
    setShowProgressDialog(true);
  };

  // Handle verify MMP action
  const handleVerifyMMP = async (mmp: MMPFile) => {
    if (verifyingId) return;
    setVerifyingId(mmp.id);
    try {
      const userId = currentUser?.id || authUser?.id || '';
      const userName = currentUser?.fullName || currentUser?.email || 'Unknown';
      await verifyMMP(mmp.id, userId, userName);
      await refreshMMPFiles();
    } catch (error) {
      console.error('Failed to verify MMP:', error);
      toast({
        title: 'Error',
        description: 'Failed to verify MMP. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setVerifyingId(null);
    }
  };

  const handleRenameOpen = (mmp: MMPFile) => {
    setRenameMMPTarget(mmp);
    setRenameValue(mmp.name);
  };

  const handleRenameSubmit = async () => {
    if (!renameMMPTarget || !renameValue.trim()) return;
    setIsSavingRename(true);
    try {
      const { error } = await supabase
        .from('mmp_files')
        .update({ name: renameValue.trim() })
        .eq('id', renameMMPTarget.id);
      if (error) throw error;
      await refreshMMPFiles();
      toast({ title: 'MMP renamed successfully' });
      setRenameMMPTarget(null);
      setRenameValue('');
    } catch (err) {
      console.error('Rename MMP error:', err);
      toast({ title: 'Error', description: 'Failed to rename MMP. Please try again.', variant: 'destructive' });
    } finally {
      setIsSavingRename(false);
    }
  };

  // Check if MMP can be verified (forwarded to FOMs/coordinators and not yet verified)
  // FOMs can verify MMPs they are assigned to, admins can verify any forwarded MMP
  const canVerifyMMP = (mmp: MMPFile) => {
    const workflow = mmp.workflow as any;
    const hasForwardedToFomIds = workflow?.forwardedToFomIds?.length > 0;
    const hasForwardedToCoordinators = workflow?.forwardedToCoordinators === true || 
                                       workflow?.forwardedToCoordinatorAt ||
                                       workflow?.currentStage === 'forwarded_to_coordinator';
    const isForwarded = hasForwardedToFomIds || hasForwardedToCoordinators;
    
    // Normalize status to lowercase for case-insensitive comparison
    // Production data may have mixed casing like "Pending", "pending", "PENDING"
    const normalizedStatus = (mmp.status || '').toLowerCase();
    
    // MMP is verifiable if it's in a pre-verified state
    // Accept pending, forwarded_to_fom, forwarded_to_coordinator, cp_verified statuses
    const verifiableStatuses = ['pending', 'forwarded_to_fom', 'forwarded_to_coordinator', 'cp_verified'];
    const isVerifiable = verifiableStatuses.includes(normalizedStatus);
    
    // Already verified or approved - can't verify again
    const alreadyVerified = normalizedStatus === 'verified' || normalizedStatus === 'approved';
    
    // FOMs can verify if they are in the forwarded list
    const isFomAssigned = isFOM && workflow?.forwardedToFomIds?.includes(currentUser?.id);
    
    // Admins/Super Admins/ICT can verify any forwarded MMP
    const isAdminRole = isSuperAdmin || isAdmin || isICT;
    
    return isVerifiable && !alreadyVerified && isForwarded && (isAdminRole || isFomAssigned);
  };

  // Archived MMPs are filtered from the parent's mmpFiles prop; read from full context list
  const archivedMMPs = (allMMPFiles || []).filter((m) => m.status === 'archived');

  // Unique hubs and months for filter dropdowns
  const archivedHubs = Array.from(new Set(archivedMMPs.map((m) => m.hub).filter(Boolean))) as string[];
  const archivedMonths = Array.from(new Set(archivedMMPs.map((m) => m.month).filter(Boolean))) as string[];

  // Filtered archived MMPs (search + hub + month)
  const filteredArchivedMMPs = archivedMMPs.filter((m) => {
    const q = archiveSearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      m.name.toLowerCase().includes(q) ||
      (m.mmpId || '').toLowerCase().includes(q);
    const matchesHub = archiveHubFilter === '__none__' || m.hub === archiveHubFilter;
    const matchesMonth = archiveMonthFilter === '__none__' || m.month === archiveMonthFilter;
    return matchesSearch && matchesHub && matchesMonth;
  });

  const showArchiveFilters = archivedMMPs.length > 5;

  const handleRestore = async (mmp: MMPFile) => {
    if (restoringId) return;
    setRestoringId(mmp.id);
    try {
      await restoreMMP(mmp.id);
      await refreshMMPFiles();
    } catch {
      toast({ title: 'Error', description: 'Failed to restore MMP. Please try again.', variant: 'destructive' });
    } finally {
      setRestoringId(null);
    }
  };

  if (!mmpFiles.length && !archivedMMPs.length) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          No MMP files uploaded yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Archived toggle — Super Admin only, only shown when there are archived MMPs */}
      {isSuperAdmin && archivedMMPs.length > 0 && (
        <div className="flex items-center justify-end mb-2">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${
              showArchived
                ? 'border-slate-500 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                : 'border-slate-300 dark:border-slate-600 bg-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
            data-testid="button-toggle-archived-mmps"
          >
            <Archive className="h-3.5 w-3.5" />
            {showArchived ? 'Hide Archived' : `Show Archived (${archivedMMPs.length})`}
          </button>
        </div>
      )}

      {/* Archived MMPs list */}
      {showArchived && isSuperAdmin && (
        <div className="grid gap-3 mb-4">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Archived MMPs — {archivedMMPs.length} total
              {(archiveSearch.trim() || archiveHubFilter !== '__none__' || archiveMonthFilter !== '__none__') && filteredArchivedMMPs.length !== archivedMMPs.length && (
                <span className="ml-1 normal-case">({filteredArchivedMMPs.length} shown)</span>
              )}
            </p>
          </div>

          {/* Search & filter bar — only shown when there are more than 5 archived MMPs */}
          {showArchiveFilters && (
            <div className="flex flex-wrap gap-2 px-1">
              {/* Search input */}
              <div className="relative flex-1 min-w-[160px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={archiveSearch}
                  onChange={(e) => setArchiveSearch(e.target.value)}
                  placeholder="Search by name or ID…"
                  className="pl-8 pr-8 h-8 text-xs"
                  data-testid="input-archive-search"
                />
                {archiveSearch && (
                  <button
                    type="button"
                    onClick={() => setArchiveSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Hub filter */}
              {archivedHubs.length > 0 && (
                <select
                  value={archiveHubFilter}
                  onChange={(e) => setArchiveHubFilter(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring min-w-[120px]"
                  data-testid="select-archive-hub"
                >
                  <option value="__none__">All Hubs</option>
                  {archivedHubs.map((hub) => (
                    <option key={hub} value={hub}>{hub}</option>
                  ))}
                </select>
              )}

              {/* Month filter */}
              {archivedMonths.length > 0 && (
                <select
                  value={archiveMonthFilter}
                  onChange={(e) => setArchiveMonthFilter(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring min-w-[130px]"
                  data-testid="select-archive-month"
                >
                  <option value="__none__">All Months</option>
                  {archivedMonths.map((month) => {
                    const label = month.includes('-')
                      ? format(new Date(month + '-01'), 'MMMM yyyy')
                      : new Date(2024, parseInt(month, 10) - 1).toLocaleDateString('en-US', { month: 'long' });
                    return <option key={month} value={month}>{label}</option>;
                  })}
                </select>
              )}

              {/* Clear all filters */}
              {(archiveSearch.trim() || archiveHubFilter !== '__none__' || archiveMonthFilter !== '__none__') && (
                <button
                  type="button"
                  onClick={() => { setArchiveSearch(''); setArchiveHubFilter('__none__'); setArchiveMonthFilter('__none__'); }}
                  className="h-8 px-2.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 text-slate-500 hover:text-foreground hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  data-testid="button-archive-clear-filters"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {filteredArchivedMMPs.length === 0 && (
            <p className="text-xs text-muted-foreground px-1 py-2">
              No archived MMPs match your search.
            </p>
          )}

          {filteredArchivedMMPs.map((mmp) => (
            <Card key={mmp.id} className="border-dashed border-slate-300 dark:border-slate-600 opacity-80">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{mmp.name}</h3>
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        <Archive className="h-3 w-3" />
                        Archived
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="font-mono text-blue-700">{mmp.mmpId}</span>
                      {mmp.hub && <span> • Hub: {mmp.hub}</span>}
                      {mmp.month && <span> • {mmp.month.includes('-') ? format(new Date(mmp.month + '-01'), 'MMMM yyyy') : new Date(2024, parseInt(mmp.month, 10) - 1).toLocaleDateString('en-US', { month: 'long' })}</span>}
                    </p>
                    {(mmp as any).archivedAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Archived {format(new Date((mmp as any).archivedAt), 'MMM d, yyyy \'at\' h:mm a')}
                        {(mmp as any).archivedBy && <span> by {(mmp as any).archivedBy}</span>}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={restoringId === mmp.id}
                    onClick={() => handleRestore(mmp)}
                    className="flex items-center gap-1.5 text-xs border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 flex-shrink-0"
                    data-testid={`button-restore-mmp-${mmp.id}`}
                  >
                    <ArchiveRestore className="h-3.5 w-3.5" />
                    {restoringId === mmp.id ? 'Restoring…' : 'Restore'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!mmpFiles.length && !showArchived && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No active MMP files.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {mmpFiles.map((mmp) => {
          const isForwarded = forwardedMMPs.has(mmp.id);
          const workflow = mmp.workflow as any;
          const forwardedCount = workflow?.forwardedToFomIds?.length || 0;
          const wasRecalled = Boolean(workflow?.recalledAt);
          const recallHistory = (workflow?.recallHistory as any[]) || [];
          const recallCount = recallHistory.filter((log: any) => log.action === 'recall' || log.action?.startsWith('recall_')).length;
          
          const isRejectedMmp = mmp.status?.toLowerCase() === 'rejected' || mmp.status?.toLowerCase() === 'declined';
          return (
            <Card
              key={mmp.id}
              className="hover:shadow-md transition-all"
            >
              {isRejectedMmp && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border-b border-red-200 dark:border-red-800 px-4 py-2" data-testid={`alert-mmp-needs-attention-${mmp.id}`}>
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>Needs Attention — MMP {mmp.status?.charAt(0).toUpperCase() + mmp.status?.slice(1)}</span>
                </div>
              )}
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div 
                    className="flex items-start gap-3 flex-1 cursor-pointer"
                    onClick={() => {
                      // If FOM and federal permit not attached, go to permit verification
                      if (isFOM && !(mmp.permits && (mmp.permits as any).federal)) {
                        navigate(`/mmp/${mmp.id}/verification`);
                      } else {
                        navigate(`/mmp/${mmp.id}/view`);
                      }
                    }}
                  >
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <h3 className="font-semibold text-lg">{mmp.name}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        <span className="font-mono text-blue-700">{mmp.mmpId}</span>
                        {mmp.projectName && <span> • Project: {mmp.projectName}</span>}
                        {mmp.hub && <span> • Hub: {mmp.hub}</span>}
                        {mmp.month && <span> • {mmp.month.includes('-') ? format(new Date(mmp.month + '-01'), 'MMMM yyyy') : new Date(2024, parseInt(mmp.month, 10) - 1).toLocaleDateString('en-US', { month: 'long' })}</span>}
                      </p>
                      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                        <span>
                          Uploaded {format(new Date(mmp.uploadedAt), 'MMM d, yyyy \'at\' h:mm a')}
                        </span>
                        <span>•</span>
                        <span>by {(mmp.uploadedBy || 'Unknown').replace(/\s*\([^)]*\)\s*$/, '')}</span>
                        <span>•</span>
                        <span className="font-semibold">{mmp.entries} sites</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <MMPStatusBadge status={mmp.status} />
                        <BudgetStatusBadge 
                          budget={mmpBudgets.find(b => b.mmpFileId === mmp.id) || null}
                          variant="compact"
                        />
                        {isForwarded && (
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            Forwarded to {forwardedCount} FOM(s)
                          </Badge>
                        )}
                        {wasRecalled && (
                          <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Recalled{recallCount > 1 ? ` (${recallCount}x)` : ''}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Full Status Report — admin/ICT/superAdmin only */}
                  {canViewFullReport && (
                    <button
                      className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex-shrink-0"
                      onClick={e => { e.stopPropagation(); setSelectedMmpForReport({ id: mmp.id, name: mmp.name }); setFullReportOpen(true); }}
                      data-testid={`button-full-report-mmp-${mmp.id}`}
                      title="Full Status Report"
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Full Report</span>
                    </button>
                  )}
                  {/* State Report — FOM only */}
                  {canViewStateReport && (
                    <button
                      className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors flex-shrink-0"
                      onClick={e => { e.stopPropagation(); setSelectedMmpForReport({ id: mmp.id, name: mmp.name }); setFullReportOpen(true); }}
                      data-testid={`button-state-report-mmp-${mmp.id}`}
                      title="State Report"
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">State Report</span>
                    </button>
                  )}

                  {/* Quick Links Dropdown Menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="p-2 rounded-full hover:bg-accent/30 focus:outline-none"
                        onClick={e => e.stopPropagation()}
                        aria-label="More options"
                      >
                        <MoreVertical className="h-5 w-5 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => navigate(`/mmp/${mmp.id}/view`)}>
                        View Details
                      </DropdownMenuItem>
                      {canViewFullReport && (
                        <DropdownMenuItem
                          onClick={() => { setSelectedMmpForReport({ id: mmp.id, name: mmp.name }); setFullReportOpen(true); }}
                          data-testid={`button-full-report-dropdown-${mmp.id}`}
                        >
                          <BarChart3 className="h-4 w-4 mr-2 text-indigo-600" />
                          Full Status Report
                        </DropdownMenuItem>
                      )}
                      {canViewStateReport && (
                        <DropdownMenuItem
                          onClick={() => { setSelectedMmpForReport({ id: mmp.id, name: mmp.name }); setFullReportOpen(true); }}
                          data-testid={`button-state-report-dropdown-${mmp.id}`}
                        >
                          <BarChart3 className="h-4 w-4 mr-2 text-red-600" />
                          State Report
                        </DropdownMenuItem>
                      )}

                      {(isSuperAdmin || isAdmin || isICT) && (
                        <DropdownMenuItem
                          onClick={() => handleRenameOpen(mmp)}
                          data-testid={`button-rename-mmp-${mmp.id}`}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Rename MMP
                        </DropdownMenuItem>
                      )}
                      
                      <DropdownMenuItem onClick={() => handleViewProgress(mmp)}>
                        MMP Progress
                      </DropdownMenuItem>
                      
                      {((canEditMMP && !isForwarded) || (isFOM && isForwarded)) && (
                        <DropdownMenuItem onClick={() => navigate(`/mmp/${mmp.id}/edit?tab=sites`)}>
                          Edit Site Entries
                        </DropdownMenuItem>
                      )}

                      {!isSupervisor && (
                        <DropdownMenuItem onClick={() => navigate(`/mmp/${mmp.id}/edit?tab=partial-update`)}>
                          MMP Update (Upload File)
                        </DropdownMenuItem>
                      )}
                      
                      {canForwardMMP && !isForwarded && (
                        <DropdownMenuItem onClick={() => handleForward(mmp)}>
                          Forward to FOM
                        </DropdownMenuItem>
                      )}
                      
                      {isFOM && !isAdmin && !isICT && !(mmp.permits && (mmp.permits as any).federal) && (
                        <DropdownMenuItem onClick={() => navigate(`/mmp/${mmp.id}/verification`)}>
                          Upload Permits
                        </DropdownMenuItem>
                      )}
                      
                      {/* Admin/ICT Pending Forwarded: Permit upload & forward to coordinators (show before delete) */}
                      {(isAdmin || isICT) && isForwarded && !(mmp.permits && (mmp.permits as any).federal) && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => navigate(`/mmp/${mmp.id}/verification`)}
                          >
                            Upload Permits & Forward to Coordinators
                          </DropdownMenuItem>
                        </>
                      )}

                      {/* Verify MMP option - marks MMP as verified and ready for approval/costing */}
                      {canVerifyMMP(mmp) && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleVerifyMMP(mmp)}
                            disabled={verifyingId === mmp.id}
                            className="text-green-600"
                            data-testid={`button-verify-mmp-${mmp.id}`}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            {verifyingId === mmp.id ? 'Verifying...' : 'Verify MMP'}
                          </DropdownMenuItem>
                        </>
                      )}

                      {/* Recall MMP option - restricted to Super Admin/Admin/ICT only */}
                      {(isSuperAdmin || isAdmin || isICT) && isForwarded && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleRecall(mmp)}
                            disabled={recallingId === mmp.id || !canRecallMMP(mmp)}
                            className="text-destructive"
                            data-testid={`button-recall-mmp-${mmp.id}`}
                          >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            {recallingId === mmp.id ? 'Recalling...' : 'Recall MMP'}
                            {isRecallBlocked(mmp) && userCanForceRecall && (
                              <span className="ml-1 text-xs">(force available)</span>
                            )}
                            {isRecallBlocked(mmp) && !userCanForceRecall && (
                              <span className="ml-1 text-xs">(blocked)</span>
                            )}
                          </DropdownMenuItem>
                        </>
                      )}

                      {canDeleteMMP && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={deletingId === mmp.id}
                            onClick={e => {
                              e.stopPropagation();
                              setConfirmId(mmp.id);
                              setDeleteStage(1);
                              setDeleteConfirmText('');
                            }}
                            className="text-destructive"
                          >
                            Delete MMP
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Forward Dialog */}
      {selectedMMPForForward && (
        <ForwardToFOMDialog
          open={forwardDialogOpen}
          onOpenChange={setForwardDialogOpen}
          mmpId={selectedMMPForForward.id}
          mmpName={selectedMMPForForward.name}
          onForwarded={handleForwardComplete}
        />
      )}

      {/* Recall Dialog */}
      {selectedMMPForRecall && (
        <RecallDialog
          open={recallDialogOpen}
          onOpenChange={(open) => {
            setRecallDialogOpen(open);
            if (!open) setSelectedMMPForRecall(null);
          }}
          mmpFile={selectedMMPForRecall}
          onRecallComplete={handleRecallComplete}
        />
      )}

      {/* MMP Progress Dialog */}
      <MMPProgressDialog
        open={showProgressDialog}
        onOpenChange={setShowProgressDialog}
        mmpFile={selectedMMPForProgress}
      />

      {/* Rename MMP Dialog */}
      <Dialog open={!!renameMMPTarget} onOpenChange={(open) => { if (!open) { setRenameMMPTarget(null); setRenameValue(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Rename MMP
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="mmp-rename-input">MMP Name</Label>
            <Input
              id="mmp-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(); }}
              placeholder="Enter new MMP name"
              data-testid="input-rename-mmp"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRenameMMPTarget(null); setRenameValue(''); }} disabled={isSavingRename}>
              Cancel
            </Button>
            <Button
              onClick={handleRenameSubmit}
              disabled={isSavingRename || !renameValue.trim() || renameValue.trim() === renameMMPTarget?.name}
              className="bg-[#0F2041] hover:bg-[#1D3461] text-white"
              data-testid="button-rename-mmp-save"
            >
              {isSavingRename ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Staged Delete Confirmation Dialog — Super Admin only */}
      {/* Stage 1: Archive-first warning */}
      <Dialog
        open={confirmId !== null && deleteStage === 1}
        onOpenChange={open => {
          if (!open) { setConfirmId(null); setDeleteStage(0); setDeleteConfirmText(''); }
        }}
      >
        <DialogContent className="max-w-lg w-full">
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Remove MMP
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Choose how you want to remove this MMP.
            </DialogDescription>
          </DialogHeader>

          {/* Option cards */}
          <div className="space-y-3 py-2">
            {/* Archive option */}
            <div className="rounded-lg border-2 border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                  <svg className="h-4 w-4 text-green-700 dark:text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-green-800 dark:text-green-200">Recommended: Archive</p>
                  <p className="mt-1 text-sm text-green-700 dark:text-green-400 leading-relaxed">
                    Hides the MMP from active lists while keeping all site entries, submissions, payments, and audit history fully intact. Recoverable at any time.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  className="bg-green-600 hover:bg-green-700 text-white min-w-[140px]"
                  disabled={archivingId === confirmId}
                  onClick={async () => {
                    if (confirmId && authUser?.id) {
                      setArchivingId(confirmId);
                      try {
                        await archiveMMP(confirmId, authUser.id);
                        toast({ title: 'MMP archived', description: 'The MMP is hidden from active lists. All data is preserved.' });
                      } catch {
                        toast({ title: 'Archive failed', description: 'Could not archive the MMP. Try again.', variant: 'destructive' });
                      } finally {
                        setArchivingId(null);
                        setConfirmId(null);
                        setDeleteStage(0);
                      }
                    }
                  }}
                >
                  {archivingId === confirmId ? 'Archiving…' : '✓ Archive MMP'}
                </Button>
              </div>
            </div>

            {/* Delete option */}
            <div className="rounded-lg border-2 border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
                  <svg className="h-4 w-4 text-red-700 dark:text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-red-700 dark:text-red-300">Permanent Delete</p>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                    Permanently removes the MMP and all site entries. Automatically blocked if any field submissions are linked. <span className="font-medium text-red-600 dark:text-red-400">Cannot be undone.</span>
                  </p>
                </div>
              </div>

              {/* Blocked notice when linked payments exist */}
              {paymentDetails.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 px-3 py-2.5">
                  <svg className="mt-0.5 h-4 w-4 text-red-600 dark:text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008v.008H12v-.008zm0-10.5A9.75 9.75 0 1 1 2.25 12 9.75 9.75 0 0 1 12 2.25z"/></svg>
                  <p className="text-xs text-red-800 dark:text-red-200 leading-relaxed">
                    <span className="font-semibold">Blocked — {paymentDetails.length} linked payment{paymentDetails.length !== 1 ? 's' : ''}</span> must be cleared by Finance.
                    Export the report, share it with Finance, and return once all payments are handled.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                {paymentDetails.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/40"
                    onClick={() => {
                      const mmp = allMMPFiles.find(m => m.id === confirmId);
                      exportMMPPaymentReport(mmp?.name ?? mmp?.id ?? 'MMP', paymentDetails);
                    }}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
                    Export Report
                  </Button>
                )}
                <Button
                  type="button"
                  variant="destructive"
                  className="min-w-[140px]"
                  disabled={paymentDetails.length > 0 || !linkedCounts}
                  onClick={() => setDeleteStage(2)}
                >
                  Delete permanently →
                </Button>
              </div>
            </div>

            {/* Unlink & Delete option — shown only when linked submissions exist */}
            {linkedCounts && (linkedCounts.downPayments > 0 || linkedCounts.costSubmissions > 0) && (
              <div className="rounded-lg border-2 border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900">
                    <svg className="h-4 w-4 text-orange-700 dark:text-orange-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-orange-800 dark:text-orange-200">Unlink Submissions & Delete</p>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                      Detaches{' '}
                      {linkedCounts.downPayments > 0 && <span className="font-medium text-orange-700 dark:text-orange-300">{linkedCounts.downPayments} advance request{linkedCounts.downPayments !== 1 ? 's' : ''}</span>}
                      {linkedCounts.downPayments > 0 && linkedCounts.costSubmissions > 0 && ' and '}
                      {linkedCounts.costSubmissions > 0 && <span className="font-medium text-orange-700 dark:text-orange-300">{linkedCounts.costSubmissions} cost submission{linkedCounts.costSubmissions !== 1 ? 's' : ''}</span>}
                      {' '}from this MMP, then permanently deletes it. Submissions are <span className="font-medium">preserved</span> — they lose their MMP link only.
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    className="bg-orange-600 hover:bg-orange-700 text-white min-w-[140px]"
                    onClick={() => setDeleteStage(3)}
                  >
                    Unlink &amp; Delete →
                  </Button>
                </div>
              </div>
            )}

            {/* Loading state for counts */}
            {!linkedCounts && (
              <div className="text-xs text-muted-foreground text-center py-1 animate-pulse">Checking linked submissions…</div>
            )}
          </div>

          <DialogFooter className="pt-1">
            <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={() => { setConfirmId(null); setDeleteStage(0); setDeleteConfirmText(''); }}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stage 2: Typed confirmation */}
      <Dialog
        open={confirmId !== null && deleteStage === 2}
        onOpenChange={open => {
          if (!open) { setConfirmId(null); setDeleteStage(0); setDeleteConfirmText(''); }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Confirm Deletion</DialogTitle>
            <DialogDescription>
              Type <strong>DELETE</strong> in the box below to confirm you want to permanently destroy this MMP and all its data.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              autoFocus
              placeholder="Type DELETE to confirm"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              className="font-mono"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => { setConfirmId(null); setDeleteStage(0); setDeleteConfirmText(''); }}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteConfirmText !== 'DELETE' || deletingId === confirmId}
              onClick={async () => {
                if (confirmId) {
                  setDeletingId(confirmId);
                  await deleteMMPFile(confirmId);
                  setDeletingId(null);
                  setConfirmId(null);
                  setDeleteStage(0);
                  setDeleteConfirmText('');
                }
              }}
            >
              {deletingId === confirmId ? 'Deleting…' : 'Delete permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stage 3: Unlink & Delete confirmation */}
      <Dialog
        open={confirmId !== null && deleteStage === 3}
        onOpenChange={open => {
          if (!open) { setConfirmId(null); setDeleteStage(0); setDeleteConfirmText(''); setLinkedCounts(null); }
        }}
      >
        <DialogContent className="max-w-lg w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"/></svg>
              Unlink Submissions &amp; Delete MMP
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              This will detach all linked field submissions from this MMP, then permanently delete the MMP and its site entries.
            </DialogDescription>
          </DialogHeader>

          {linkedCounts && (
            <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
              <p className="font-medium">What will happen:</p>
              <ul className="space-y-1.5 text-muted-foreground">
                {linkedCounts.downPayments > 0 && (
                  <li className="flex items-start gap-2">
                    <span className="text-orange-500 mt-0.5">•</span>
                    <span><strong>{linkedCounts.downPayments}</strong> advance request{linkedCounts.downPayments !== 1 ? 's' : ''} will lose their MMP link (submissions remain in the system)</span>
                  </li>
                )}
                {linkedCounts.costSubmissions > 0 && (
                  <li className="flex items-start gap-2">
                    <span className="text-orange-500 mt-0.5">•</span>
                    <span><strong>{linkedCounts.costSubmissions}</strong> cost submission{linkedCounts.costSubmissions !== 1 ? 's' : ''} will lose their MMP reference</span>
                  </li>
                )}
                <li className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5">•</span>
                  <span>The MMP file and all its site entries will be <strong>permanently deleted</strong></span>
                </li>
              </ul>
            </div>
          )}

          <div className="py-1">
            <p className="text-sm text-muted-foreground mb-2">Type <strong>UNLINK</strong> to confirm:</p>
            <Input
              autoFocus
              placeholder="Type UNLINK to confirm"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              className="font-mono"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => { setDeleteStage(1); setDeleteConfirmText(''); }}>
              ← Back
            </Button>
            <Button
              type="button"
              className="bg-orange-600 hover:bg-orange-700 text-white"
              disabled={deleteConfirmText !== 'UNLINK' || unlinkingId === confirmId}
              onClick={async () => {
                if (confirmId) {
                  setUnlinkingId(confirmId);
                  const result = await unlinkAndDeleteMMPFile(confirmId);
                  setUnlinkingId(null);
                  if (result.deleted) {
                    const parts: string[] = [];
                    if (result.unlinked.downPayments > 0) parts.push(`${result.unlinked.downPayments} advance request${result.unlinked.downPayments !== 1 ? 's' : ''} unlinked`);
                    if (result.unlinked.costSubmissions > 0) parts.push(`${result.unlinked.costSubmissions} cost submission${result.unlinked.costSubmissions !== 1 ? 's' : ''} unlinked`);
                    toast({ title: 'MMP deleted', description: parts.length ? parts.join(', ') + '. MMP removed.' : 'MMP permanently deleted.' });
                  }
                  setConfirmId(null);
                  setDeleteStage(0);
                  setDeleteConfirmText('');
                  setLinkedCounts(null);
                }
              }}
            >
              {unlinkingId === confirmId ? 'Unlinking & deleting…' : 'Confirm unlink & delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full MMP Status Report Dialog */}
      {selectedMmpForReport && (
        <MmpFullReportDialog
          open={fullReportOpen}
          onClose={() => { setFullReportOpen(false); setSelectedMmpForReport(null); }}
          mmpId={selectedMmpForReport.id}
          mmpName={selectedMmpForReport.name}
        />
      )}
    </>
  );
};
