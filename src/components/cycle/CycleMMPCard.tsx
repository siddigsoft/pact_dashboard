import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import {
  AlertTriangle, CheckCircle2, Clock, XCircle, ArrowRight, MapPin,
  ChevronDown, ChevronUp, FileText, Calendar, User, Users, Eye,
  ShieldCheck, FolderOpen, Info
} from 'lucide-react';

interface UncoveredSite {
  id: string;
  site_name: string;
  site_code: string;
  state: string;
  locality: string;
  status: string;
  mmp_id: string;
  mmp_name?: string;
  hub?: string;
  not_covered_reason: string | null;
  not_covered_reason_other: string | null;
  not_covered_at: string | null;
  not_covered_by: string | null;
}

interface SiteVisitCounts {
  total: number;
  completed: number;
  pending: number;
  assigned: number;
  dispatched: number;
}

interface CycleMMPCardProps {
  mmp: any;
  uncoveredSites: UncoveredSite[];
  cycleStatus: string;
  canManageCycle: boolean;
  isFOM: boolean;
  isAdmin: boolean;
  closingCycle: boolean;
  finalizingCycle: boolean;
  siteVisitCounts?: SiteVisitCounts;
  handleStartClosingCycle: (mmpId: string) => void;
  handleFinalizeCycleClose: (mmpId: string) => void;
  handleApproveCycle: (mmpId: string) => void;
  handleRejectCycle: (mmpId: string, note: string) => void;
  handleSendReminders: (mmpId: string) => void;
  setSelectedMmpId: (id: string) => void;
  setActiveTab: (tab: string) => void;
  getReasonLabel: (reason: string | null) => string;
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return 'N/A';
  }
}

function DetailRow({ label, value, icon: Icon, testId }: { label: string; value: string | number | undefined | null; icon?: any; testId?: string }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start gap-2 text-xs" data-testid={testId || `detail-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      {Icon && <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />}
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export function CycleMMPCard({
  mmp,
  uncoveredSites,
  cycleStatus,
  canManageCycle,
  isFOM,
  isAdmin,
  closingCycle,
  finalizingCycle,
  siteVisitCounts,
  handleStartClosingCycle,
  handleFinalizeCycleClose,
  handleApproveCycle,
  handleRejectCycle,
  handleSendReminders,
  setSelectedMmpId,
  setActiveTab,
  getReasonLabel,
}: CycleMMPCardProps) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const mmpUncovered = uncoveredSites;
  const mmpReasoned = mmpUncovered.filter(s => s.not_covered_reason).length;
  const progress = mmpUncovered.length > 0 ? Math.round((mmpReasoned / mmpUncovered.length) * 100) : 100;

  const projectName = mmp.projectName || (mmp as any).project?.name || '';

  const totalSiteCount = siteVisitCounts?.total || 0;
  const completedCount = siteVisitCounts?.completed || 0;
  const pendingCount = siteVisitCounts?.pending || 0;
  const assignedCount = siteVisitCounts?.assigned || 0;
  const dispatchedCount = siteVisitCounts?.dispatched || 0;
  const coveragePercent = totalSiteCount > 0 ? Math.round((completedCount / totalSiteCount) * 100) : 0;

  const mmpStatus = mmp.status || 'pending';
  const statusLabel: Record<string, string> = {
    pending: 'Pending',
    verified: 'Verified',
    approved: 'Approved',
    rejected: 'Rejected',
    archived: 'Archived',
  };

  return (
    <Card className={cycleStatus === 'closing' ? 'border-amber-400 dark:border-amber-600' : cycleStatus === 'pending_approval' ? 'border-purple-400 dark:border-purple-600' : ''} data-testid={`card-cycle-${mmp.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base" data-testid={`text-mmp-name-${mmp.id}`}>{mmp.name}</CardTitle>
            {projectName && (
              <div className="text-xs text-muted-foreground mt-0.5" data-testid={`text-project-${mmp.id}`}>{projectName}</div>
            )}
            <CardDescription className="text-xs mt-1" data-testid={`text-location-${mmp.id}`}>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {mmp.hub || mmp.region || 'No hub'}
              </span>
              {' '}&middot; {mmp.month ? `Month ${mmp.month}` : ''} {mmp.year || ''}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={cycleStatus === 'closing' ? 'default' : cycleStatus === 'pending_approval' ? 'default' : 'secondary'} className={cycleStatus === 'closing' ? 'bg-amber-500' : cycleStatus === 'pending_approval' ? 'bg-purple-500' : ''} data-testid={`badge-cycle-status-${mmp.id}`}>
              {cycleStatus === 'closing' ? 'Closing' : cycleStatus === 'pending_approval' ? 'Pending Approval' : 'Active'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {totalSiteCount > 0 && (
          <div className="space-y-2" data-testid={`coverage-summary-${mmp.id}`}>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Site Coverage</span>
              <span className="font-medium" data-testid={`text-coverage-percent-${mmp.id}`}>{coveragePercent}% ({completedCount}/{totalSiteCount})</span>
            </div>
            <Progress value={coveragePercent} className="h-1.5" />
            <div className="grid grid-cols-4 gap-1 text-center text-xs">
              <div className="bg-green-50 dark:bg-green-950 rounded p-1.5">
                <div className="text-green-600 dark:text-green-400 font-bold" data-testid={`text-completed-count-${mmp.id}`}>{completedCount}</div>
                <div className="text-muted-foreground text-xs">Completed</div>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-950 rounded p-1.5">
                <div className="text-yellow-600 dark:text-yellow-400 font-bold" data-testid={`text-pending-count-${mmp.id}`}>{pendingCount}</div>
                <div className="text-muted-foreground text-xs">Pending</div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950 rounded p-1.5">
                <div className="text-blue-600 dark:text-blue-400 font-bold" data-testid={`text-assigned-count-${mmp.id}`}>{assignedCount}</div>
                <div className="text-muted-foreground text-xs">Assigned</div>
              </div>
              <div className="bg-purple-50 dark:bg-purple-950 rounded p-1.5">
                <div className="text-purple-600 dark:text-purple-400 font-bold" data-testid={`text-dispatched-count-${mmp.id}`}>{dispatchedCount}</div>
                <div className="text-muted-foreground text-xs">Dispatched</div>
              </div>
            </div>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between text-xs"
          onClick={() => setExpanded(!expanded)}
          data-testid={`button-toggle-details-${mmp.id}`}
        >
          <span className="flex items-center gap-1">
            <Info className="h-3.5 w-3.5" />
            {expanded ? 'Hide Details' : 'View MMP Details'}
          </span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </Button>

        {expanded && (
          <div className="space-y-3 pt-1" data-testid={`details-panel-${mmp.id}`}>
            <Separator />

            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1" data-testid={`section-general-${mmp.id}`}>
                <FileText className="h-3.5 w-3.5" /> General Information
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 pl-1">
                <DetailRow label="MMP Status" value={statusLabel[mmpStatus] || mmpStatus} icon={ShieldCheck} testId={`detail-mmp-status-${mmp.id}`} />
                <DetailRow label="Planned Entries" value={mmp.entries || 0} icon={FolderOpen} testId={`detail-entries-${mmp.id}`} />
                <DetailRow label="Region" value={mmp.region} icon={MapPin} testId={`detail-region-${mmp.id}`} />
                <DetailRow label="Type" value={mmp.type} icon={FileText} testId={`detail-type-${mmp.id}`} />
                {mmp.description && (
                  <div className="col-span-full text-xs mt-1" data-testid={`detail-description-${mmp.id}`}>
                    <span className="text-muted-foreground">Description: </span>
                    <span>{mmp.description}</span>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1" data-testid={`section-timeline-${mmp.id}`}>
                <Calendar className="h-3.5 w-3.5" /> Timeline
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 pl-1">
                <DetailRow label="Uploaded" value={formatDate(mmp.uploadedAt)} icon={Calendar} testId={`detail-uploaded-${mmp.id}`} />
                <DetailRow label="Uploaded By" value={mmp.uploadedBy} icon={User} testId={`detail-uploaded-by-${mmp.id}`} />
                <DetailRow label="Verified" value={formatDate(mmp.verifiedAt)} icon={CheckCircle2} testId={`detail-verified-${mmp.id}`} />
                <DetailRow label="Verified By" value={mmp.verifiedBy} icon={User} testId={`detail-verified-by-${mmp.id}`} />
                <DetailRow label="Approved" value={formatDate(mmp.approvedAt)} icon={CheckCircle2} testId={`detail-approved-${mmp.id}`} />
                <DetailRow label="Approved By" value={mmp.approvedBy} icon={User} testId={`detail-approved-by-${mmp.id}`} />
              </div>
            </div>

            {(mmp.team?.coordinator || mmp.team?.supervisors?.length > 0 || mmp.team?.dataCollector) && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1" data-testid={`section-team-${mmp.id}`}>
                    <Users className="h-3.5 w-3.5" /> Team
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 pl-1">
                    <DetailRow label="Coordinator" value={mmp.team?.coordinator} icon={User} testId={`detail-coordinator-${mmp.id}`} />
                    <DetailRow label="Data Collector" value={mmp.team?.dataCollector} icon={User} testId={`detail-collector-${mmp.id}`} />
                    {mmp.team?.supervisors?.length > 0 && (
                      <div className="col-span-full text-xs flex items-start gap-2" data-testid={`detail-supervisors-${mmp.id}`}>
                        <Users className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                        <span className="text-muted-foreground shrink-0">Supervisors:</span>
                        <span className="font-medium">{mmp.team.supervisors.join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {mmp.financial && (mmp.financial.budgetAllocation || mmp.financial.currency || mmp.financial.paymentMethod) && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1" data-testid={`section-financial-${mmp.id}`}>
                    <FolderOpen className="h-3.5 w-3.5" /> Financial
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 pl-1">
                    {mmp.financial.budgetAllocation && (
                      <DetailRow
                        label="Budget"
                        value={`${mmp.financial.currency || 'USD'} ${Number(mmp.financial.budgetAllocation).toLocaleString()}`}
                        icon={FolderOpen}
                        testId={`detail-budget-${mmp.id}`}
                      />
                    )}
                    <DetailRow label="Payment Method" value={mmp.financial.paymentMethod} icon={FileText} testId={`detail-payment-${mmp.id}`} />
                    <DetailRow label="Approval Status" value={mmp.financial.approvalStatus} icon={ShieldCheck} testId={`detail-fin-approval-${mmp.id}`} />
                  </div>
                </div>
              </>
            )}

            {mmp.rejectionReason && (
              <>
                <Separator />
                <div className="p-2 bg-destructive/10 rounded text-xs text-destructive" data-testid={`detail-rejection-${mmp.id}`}>
                  <span className="font-medium">Rejection Reason:</span> {mmp.rejectionReason}
                </div>
              </>
            )}

            <div className="pt-1">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => navigate(`/mmp/${mmp.id}`)}
                data-testid={`button-view-full-mmp-${mmp.id}`}
              >
                <Eye className="h-3.5 w-3.5 mr-1" /> Open Full MMP View
              </Button>
            </div>
          </div>
        )}

        {cycleStatus === 'closing' && (
          <>
            <div className="space-y-1">
              <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                <span>Reason Assignment Progress</span>
                <span data-testid={`text-reason-progress-${mmp.id}`}>{mmpReasoned}/{mmpUncovered.length}</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-red-50 dark:bg-red-950 rounded p-2">
                <div className="text-red-600 dark:text-red-400 font-bold text-lg" data-testid={`text-uncovered-count-${mmp.id}`}>{mmpUncovered.length}</div>
                <div className="text-muted-foreground">Uncovered</div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950 rounded p-2">
                <div className="text-amber-600 dark:text-amber-400 font-bold text-lg" data-testid={`text-pending-reason-count-${mmp.id}`}>{mmpUncovered.length - mmpReasoned}</div>
                <div className="text-muted-foreground">Pending</div>
              </div>
              <div className="bg-green-50 dark:bg-green-950 rounded p-2">
                <div className="text-green-600 dark:text-green-400 font-bold text-lg" data-testid={`text-reasoned-count-${mmp.id}`}>{mmpReasoned}</div>
                <div className="text-muted-foreground">Reasoned</div>
              </div>
            </div>
          </>
        )}

        {cycleStatus === 'closing' && (mmp as any).cycle_close_deadline && (
          <div className={`flex items-center gap-2 text-xs mt-2 ${
            new Date((mmp as any).cycle_close_deadline) < new Date() 
              ? 'text-destructive font-semibold' 
              : 'text-muted-foreground'
          }`} data-testid={`text-deadline-${mmp.id}`}>
            <Clock className="h-3.5 w-3.5" />
            {new Date((mmp as any).cycle_close_deadline) < new Date() ? (
              <span>OVERDUE - Deadline was {new Date((mmp as any).cycle_close_deadline).toLocaleDateString()}</span>
            ) : (
              <span>Deadline: {new Date((mmp as any).cycle_close_deadline).toLocaleDateString()} ({Math.ceil((new Date((mmp as any).cycle_close_deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days remaining)</span>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {cycleStatus === 'active' && canManageCycle && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" disabled={closingCycle} data-testid={`button-start-close-${mmp.id}`}>
                  <AlertTriangle className="h-3 w-3 mr-1" /> Start Cycle Close
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Start Cycle Close</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will flag all incomplete site visits (pending, assigned, dispatched) as &quot;Not Covered&quot;.
                    Supervisors will need to provide a reason for each uncovered site before the cycle can be fully closed.
                    <br /><br />
                    <strong>This action cannot be undone.</strong>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleStartClosingCycle(mmp.id)} data-testid="button-confirm-start-close">
                    Start Closing
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {cycleStatus === 'closing' && canManageCycle && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={finalizingCycle || progress < 100} data-testid={`button-finalize-${mmp.id}`}>
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Finalize Close
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Finalize Cycle Close</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-3">
                      <p>You are about to close this MMP cycle. Here is a summary:</p>
                      <div className="grid grid-cols-2 gap-2 text-sm bg-muted rounded-lg p-3">
                        <div>Total Uncovered Sites:</div>
                        <div className="font-semibold" data-testid="text-summary-uncovered">{mmpUncovered.length}</div>
                        <div>Reasons Assigned:</div>
                        <div className="font-semibold text-green-600 dark:text-green-400" data-testid="text-summary-reasoned">{mmpReasoned}</div>
                        <div>Top Reason:</div>
                        <div className="font-semibold" data-testid="text-summary-top-reason">{(() => { const counts: Record<string, number> = {}; mmpUncovered.forEach(s => { if (s.not_covered_reason) counts[s.not_covered_reason] = (counts[s.not_covered_reason] || 0) + 1; }); const top = Object.entries(counts).sort((a,b) => b[1]-a[1])[0]; return top ? `${getReasonLabel(top[0])} (${top[1]})` : 'N/A'; })()}</div>
                        <div>Completion Rate:</div>
                        <div className="font-semibold text-blue-600 dark:text-blue-400" data-testid="text-summary-completion">{progress}%</div>
                      </div>
                      <p className="text-xs text-muted-foreground">All uncovered site visits will be cancelled and archived. This action cannot be undone.</p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleFinalizeCycleClose(mmp.id)} data-testid="button-confirm-finalize">
                    Close Cycle
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {cycleStatus === 'closing' && (
            <Button size="sm" variant="outline" onClick={() => { setSelectedMmpId(mmp.id); setActiveTab('uncovered'); }} data-testid={`button-view-uncovered-${mmp.id}`}>
              View Sites <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          )}

          {cycleStatus === 'closing' && canManageCycle && (mmp as any).cycle_close_deadline && new Date((mmp as any).cycle_close_deadline) < new Date() && (
            <Button size="sm" variant="outline" onClick={() => handleSendReminders(mmp.id)} data-testid={`button-send-reminder-${mmp.id}`}>
              <AlertTriangle className="h-3 w-3 mr-1" /> Send Reminders
            </Button>
          )}

          {cycleStatus === 'pending_approval' && (isFOM || isAdmin) && (
            <>
              <Button size="sm" onClick={() => handleApproveCycle(mmp.id)} data-testid={`button-approve-${mmp.id}`}>
                <CheckCircle2 className="h-3 w-3 mr-1" /> Approve & Close
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" data-testid={`button-reject-${mmp.id}`}>
                    <XCircle className="h-3 w-3 mr-1" /> Reject
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reject Cycle Close</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will return the cycle to &quot;Closing&quot; status. The team will need to address issues before resubmitting.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleRejectCycle(mmp.id, 'Cycle close rejected - additional review needed')} data-testid="button-confirm-reject">
                      Reject
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>

        {(mmp as any).cycle_approval_note && (
          <div className="mt-2 p-2 bg-destructive/10 rounded text-xs text-destructive" data-testid={`text-rejection-note-${mmp.id}`}>
            <span className="font-medium">Rejection Note:</span> {(mmp as any).cycle_approval_note}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
