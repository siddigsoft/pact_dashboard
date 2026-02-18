import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import {
  AlertTriangle, CheckCircle2, Clock, XCircle, ArrowRight, MapPin,
  ChevronDown, ChevronUp, FileText, Calendar, User, Users, Eye,
  ShieldCheck, FolderOpen, Info, BarChart3, CircleDot, Wallet
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

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'closing') return 'destructive';
  if (status === 'pending_approval') return 'default';
  return 'secondary';
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: 'Active',
    closing: 'Closing',
    pending_approval: 'Pending Approval',
    closed: 'Closed',
  };
  return labels[status] || 'Active';
}

function CoverageRing({ percent, size = 48, strokeWidth = 4 }: { percent: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const color = percent >= 80 ? 'text-emerald-500' : percent >= 50 ? 'text-amber-500' : 'text-red-500';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-muted" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className={`stroke-current ${color} transition-all duration-500`} />
      </svg>
      <span className="absolute text-xs font-bold">{percent}%</span>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value, testId }: { icon: any; label: string; value: string | number | undefined | null; testId?: string }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-center gap-2 py-1.5" data-testid={testId}>
      <div className="flex items-center justify-center h-6 w-6 rounded bg-muted shrink-0">
        <Icon className="h-3 w-3 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground leading-tight">{label}</div>
        <div className="text-xs font-medium leading-tight truncate">{value}</div>
      </div>
    </div>
  );
}

function StatBox({ count, label, colorClass, testId }: { count: number; label: string; colorClass: string; testId?: string }) {
  return (
    <div className={`rounded-md p-2 text-center ${colorClass}`}>
      <div className="text-sm font-bold leading-tight" data-testid={testId}>{count}</div>
      <div className="text-xs text-muted-foreground leading-tight mt-0.5">{label}</div>
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
    forwarded_to_coordinator: 'Forwarded',
  };

  const topBarColor = cycleStatus === 'closing'
    ? 'bg-amber-500'
    : cycleStatus === 'pending_approval'
    ? 'bg-purple-500'
    : 'bg-emerald-500';

  return (
    <Card className="overflow-hidden transition-all" data-testid={`card-cycle-${mmp.id}`}>
      <CardContent className="p-0">
        <div className={`h-1 w-full ${topBarColor}`} />
        <div className="p-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold leading-tight truncate" data-testid={`text-mmp-name-${mmp.id}`}>
                  {mmp.name}
                </h3>
                <Badge variant="outline" className="shrink-0" data-testid={`badge-mmp-status-${mmp.id}`}>
                  {statusLabel[mmpStatus] || mmpStatus}
                </Badge>
              </div>
              {projectName && (
                <div className="text-xs text-muted-foreground mt-0.5" data-testid={`text-project-${mmp.id}`}>
                  {projectName}
                </div>
              )}
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {mmp.hub || mmp.region || 'No hub'}
                </span>
                {(mmp.month || mmp.year) && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {mmp.month ? `Month ${mmp.month}` : ''} {mmp.year || ''}
                  </span>
                )}
                {mmp.entries > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    {mmp.entries} entries
                  </span>
                )}
              </div>
            </div>
            <Badge variant={getStatusBadgeVariant(cycleStatus)} data-testid={`badge-cycle-status-${mmp.id}`}>
              {getStatusLabel(cycleStatus)}
            </Badge>
          </div>
        </div>

        {totalSiteCount > 0 && (
          <div className="px-4 pb-3" data-testid={`coverage-summary-${mmp.id}`}>
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="flex items-center gap-3">
                <CoverageRing percent={coveragePercent} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-medium">Site Coverage</span>
                    <span className="text-xs text-muted-foreground" data-testid={`text-coverage-percent-${mmp.id}`}>
                      {completedCount}/{totalSiteCount} sites
                    </span>
                  </div>
                  <Progress value={coveragePercent} className="h-1.5 mb-2" />
                  <div className="grid grid-cols-4 gap-1">
                    <StatBox count={completedCount} label="Done" colorClass="bg-emerald-500/10" testId={`text-completed-count-${mmp.id}`} />
                    <StatBox count={pendingCount} label="Pending" colorClass="bg-yellow-500/10" testId={`text-pending-count-${mmp.id}`} />
                    <StatBox count={assignedCount} label="Assigned" colorClass="bg-blue-500/10" testId={`text-assigned-count-${mmp.id}`} />
                    <StatBox count={dispatchedCount} label="Sent" colorClass="bg-purple-500/10" testId={`text-dispatched-count-${mmp.id}`} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {cycleStatus === 'closing' && (
          <div className="px-4 pb-3">
            <div className="bg-amber-500/5 border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Reason Assignment
                </span>
                <span className="font-semibold" data-testid={`text-reason-progress-${mmp.id}`}>{mmpReasoned}/{mmpUncovered.length}</span>
              </div>
              <Progress value={progress} className="h-1.5" />
              <div className="grid grid-cols-3 gap-1.5">
                <StatBox count={mmpUncovered.length} label="Uncovered" colorClass="bg-red-500/10" testId={`text-uncovered-count-${mmp.id}`} />
                <StatBox count={mmpUncovered.length - mmpReasoned} label="Pending" colorClass="bg-amber-500/10" testId={`text-pending-reason-count-${mmp.id}`} />
                <StatBox count={mmpReasoned} label="Reasoned" colorClass="bg-emerald-500/10" testId={`text-reasoned-count-${mmp.id}`} />
              </div>
            </div>

            {(mmp as any).cycle_close_deadline && (
              <div className={`flex items-center gap-2 text-xs mt-2 rounded-md px-2 py-1.5 ${
                new Date((mmp as any).cycle_close_deadline) < new Date()
                  ? 'bg-destructive/10 text-destructive font-semibold'
                  : 'bg-muted text-muted-foreground'
              }`} data-testid={`text-deadline-${mmp.id}`}>
                <Clock className="h-3.5 w-3.5 shrink-0" />
                {new Date((mmp as any).cycle_close_deadline) < new Date() ? (
                  <span>OVERDUE - Deadline was {new Date((mmp as any).cycle_close_deadline).toLocaleDateString()}</span>
                ) : (
                  <span>Deadline: {new Date((mmp as any).cycle_close_deadline).toLocaleDateString()} ({Math.ceil((new Date((mmp as any).cycle_close_deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days left)</span>
                )}
              </div>
            )}
          </div>
        )}

        <div className="px-4">
          <Separator />
        </div>

        <div className="px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between text-xs"
            onClick={() => setExpanded(!expanded)}
            data-testid={`button-toggle-details-${mmp.id}`}
          >
            <span className="flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" />
              {expanded ? 'Hide Details' : 'View MMP Details'}
            </span>
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {expanded && (
          <div className="px-4 pb-3 space-y-3" data-testid={`details-panel-${mmp.id}`}>
            <div className="bg-muted/30 rounded-lg p-3 space-y-1">
              <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2" data-testid={`section-general-${mmp.id}`}>
                <FileText className="h-3.5 w-3.5" /> General Information
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0">
                <InfoItem label="MMP Status" value={statusLabel[mmpStatus] || mmpStatus} icon={ShieldCheck} testId={`detail-mmp-status-${mmp.id}`} />
                <InfoItem label="Planned Entries" value={mmp.entries || 0} icon={FolderOpen} testId={`detail-entries-${mmp.id}`} />
                <InfoItem label="Region" value={mmp.region} icon={MapPin} testId={`detail-region-${mmp.id}`} />
                <InfoItem label="Type" value={mmp.type} icon={FileText} testId={`detail-type-${mmp.id}`} />
              </div>
              {mmp.description && (
                <div className="text-xs mt-1 p-2 bg-muted rounded" data-testid={`detail-description-${mmp.id}`}>
                  <span className="text-muted-foreground">Description: </span>
                  <span>{mmp.description}</span>
                </div>
              )}
            </div>

            <div className="bg-muted/30 rounded-lg p-3 space-y-1">
              <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2" data-testid={`section-timeline-${mmp.id}`}>
                <Calendar className="h-3.5 w-3.5" /> Timeline
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0">
                <InfoItem label="Uploaded" value={formatDate(mmp.uploadedAt)} icon={Calendar} testId={`detail-uploaded-${mmp.id}`} />
                <InfoItem label="Uploaded By" value={mmp.uploadedBy} icon={User} testId={`detail-uploaded-by-${mmp.id}`} />
                <InfoItem label="Verified" value={formatDate(mmp.verifiedAt)} icon={CheckCircle2} testId={`detail-verified-${mmp.id}`} />
                <InfoItem label="Approved" value={formatDate(mmp.approvedAt)} icon={CheckCircle2} testId={`detail-approved-${mmp.id}`} />
              </div>
            </div>

            {(mmp.team?.coordinator || mmp.team?.supervisors?.length > 0 || mmp.team?.dataCollector) && (
              <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2" data-testid={`section-team-${mmp.id}`}>
                  <Users className="h-3.5 w-3.5" /> Team
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0">
                  <InfoItem label="Coordinator" value={mmp.team?.coordinator} icon={User} testId={`detail-coordinator-${mmp.id}`} />
                  <InfoItem label="Data Collector" value={mmp.team?.dataCollector} icon={User} testId={`detail-collector-${mmp.id}`} />
                </div>
                {mmp.team?.supervisors?.length > 0 && (
                  <div className="text-xs flex items-start gap-2 pt-1" data-testid={`detail-supervisors-${mmp.id}`}>
                    <div className="flex items-center justify-center h-6 w-6 rounded bg-muted shrink-0">
                      <Users className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground leading-tight">Supervisors</div>
                      <div className="text-xs font-medium leading-tight">{mmp.team.supervisors.join(', ')}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {mmp.financial && (mmp.financial.budgetAllocation || mmp.financial.currency || mmp.financial.paymentMethod) && (
              <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2" data-testid={`section-financial-${mmp.id}`}>
                  <Wallet className="h-3.5 w-3.5" /> Financial
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0">
                  {mmp.financial.budgetAllocation && (
                    <InfoItem
                      label="Budget"
                      value={`${mmp.financial.currency || 'USD'} ${Number(mmp.financial.budgetAllocation).toLocaleString()}`}
                      icon={Wallet}
                      testId={`detail-budget-${mmp.id}`}
                    />
                  )}
                  <InfoItem label="Payment Method" value={mmp.financial.paymentMethod} icon={FileText} testId={`detail-payment-${mmp.id}`} />
                  <InfoItem label="Approval Status" value={mmp.financial.approvalStatus} icon={ShieldCheck} testId={`detail-fin-approval-${mmp.id}`} />
                </div>
              </div>
            )}

            {mmp.rejectionReason && (
              <div className="p-2.5 bg-destructive/10 rounded-lg text-xs text-destructive" data-testid={`detail-rejection-${mmp.id}`}>
                <span className="font-medium">Rejection Reason:</span> {mmp.rejectionReason}
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => navigate(`/mmp/${mmp.id}`)}
              data-testid={`button-view-full-mmp-${mmp.id}`}
            >
              <Eye className="h-3.5 w-3.5 mr-1.5" /> Open Full MMP View
            </Button>
          </div>
        )}

        {(canManageCycle || cycleStatus === 'closing' || cycleStatus === 'pending_approval') && (
          <>
            <div className="px-4"><Separator /></div>
            <div className="px-4 py-3 flex flex-wrap gap-2">
              {cycleStatus === 'active' && canManageCycle && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive" disabled={closingCycle} data-testid={`button-start-close-${mmp.id}`}>
                      <AlertTriangle className="h-3.5 w-3.5 mr-1.5" /> Start Cycle Close
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
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Finalize Close
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
                  View Sites <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              )}

              {cycleStatus === 'closing' && canManageCycle && (mmp as any).cycle_close_deadline && new Date((mmp as any).cycle_close_deadline) < new Date() && (
                <Button size="sm" variant="outline" onClick={() => handleSendReminders(mmp.id)} data-testid={`button-send-reminder-${mmp.id}`}>
                  <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Send Reminders
                </Button>
              )}

              {cycleStatus === 'pending_approval' && (isFOM || isAdmin) && (
                <>
                  <Button size="sm" onClick={() => handleApproveCycle(mmp.id)} data-testid={`button-approve-${mmp.id}`}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Approve & Close
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive" data-testid={`button-reject-${mmp.id}`}>
                        <XCircle className="h-3.5 w-3.5 mr-1.5" /> Reject
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
          </>
        )}

        {(mmp as any).cycle_approval_note && (
          <div className="mx-4 mb-3 p-2.5 bg-destructive/10 rounded-lg text-xs text-destructive" data-testid={`text-rejection-note-${mmp.id}`}>
            <span className="font-medium">Rejection Note:</span> {(mmp as any).cycle_approval_note}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
