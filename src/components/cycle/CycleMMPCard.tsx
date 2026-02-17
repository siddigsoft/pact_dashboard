import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import {
  AlertTriangle, CheckCircle2, Clock, XCircle, ArrowRight, MapPin
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

  return (
    <Card className={cycleStatus === 'closing' ? 'border-amber-400 dark:border-amber-600' : cycleStatus === 'pending_approval' ? 'border-purple-400 dark:border-purple-600' : ''} data-testid={`card-cycle-${mmp.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{mmp.name}</CardTitle>
            {projectName && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{projectName}</div>
            )}
            <CardDescription className="text-xs mt-1">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {mmp.hub || mmp.region || 'No hub'}
              </span>
              {' '}&middot; {mmp.month ? `Month ${mmp.month}` : ''} {mmp.year || ''}
            </CardDescription>
          </div>
          <Badge variant={cycleStatus === 'closing' ? 'default' : cycleStatus === 'pending_approval' ? 'default' : 'secondary'} className={cycleStatus === 'closing' ? 'bg-amber-500' : cycleStatus === 'pending_approval' ? 'bg-purple-500' : ''} data-testid={`badge-status-${mmp.id}`}>
            {cycleStatus === 'closing' ? 'Closing' : cycleStatus === 'pending_approval' ? 'Pending Approval' : 'Active'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {totalSiteCount > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Site Coverage</span>
              <span className="font-medium">{coveragePercent}% ({completedCount}/{totalSiteCount})</span>
            </div>
            <Progress value={coveragePercent} className="h-1.5" />
            <div className="grid grid-cols-4 gap-1 text-center text-xs">
              <div className="bg-green-50 dark:bg-green-950 rounded p-1.5">
                <div className="text-green-600 dark:text-green-400 font-bold">{completedCount}</div>
                <div className="text-gray-500 text-[10px]">Completed</div>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-950 rounded p-1.5">
                <div className="text-yellow-600 dark:text-yellow-400 font-bold">{pendingCount}</div>
                <div className="text-gray-500 text-[10px]">Pending</div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950 rounded p-1.5">
                <div className="text-blue-600 dark:text-blue-400 font-bold">{assignedCount}</div>
                <div className="text-gray-500 text-[10px]">Assigned</div>
              </div>
              <div className="bg-purple-50 dark:bg-purple-950 rounded p-1.5">
                <div className="text-purple-600 dark:text-purple-400 font-bold">{dispatchedCount}</div>
                <div className="text-gray-500 text-[10px]">Dispatched</div>
              </div>
            </div>
          </div>
        )}

        {cycleStatus === 'closing' && (
          <>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Reason Assignment Progress</span>
                <span>{mmpReasoned}/{mmpUncovered.length}</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-red-50 dark:bg-red-950 rounded p-2">
                <div className="text-red-600 dark:text-red-400 font-bold text-lg">{mmpUncovered.length}</div>
                <div className="text-gray-500">Uncovered</div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950 rounded p-2">
                <div className="text-amber-600 dark:text-amber-400 font-bold text-lg">{mmpUncovered.length - mmpReasoned}</div>
                <div className="text-gray-500">Pending</div>
              </div>
              <div className="bg-green-50 dark:bg-green-950 rounded p-2">
                <div className="text-green-600 dark:text-green-400 font-bold text-lg">{mmpReasoned}</div>
                <div className="text-gray-500">Reasoned</div>
              </div>
            </div>
          </>
        )}

        {cycleStatus === 'closing' && (mmp as any).cycle_close_deadline && (
          <div className={`flex items-center gap-2 text-xs mt-2 ${
            new Date((mmp as any).cycle_close_deadline) < new Date() 
              ? 'text-red-600 dark:text-red-400 font-semibold' 
              : 'text-gray-500'
          }`}>
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
                <Button size="sm" disabled={finalizingCycle || progress < 100} className="bg-green-600" data-testid={`button-finalize-${mmp.id}`}>
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Finalize Close
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Finalize Cycle Close</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-3">
                      <p>You are about to close this MMP cycle. Here is a summary:</p>
                      <div className="grid grid-cols-2 gap-2 text-sm bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                        <div>Total Uncovered Sites:</div>
                        <div className="font-semibold">{mmpUncovered.length}</div>
                        <div>Reasons Assigned:</div>
                        <div className="font-semibold text-green-600">{mmpReasoned}</div>
                        <div>Top Reason:</div>
                        <div className="font-semibold">{(() => { const counts: Record<string, number> = {}; mmpUncovered.forEach(s => { if (s.not_covered_reason) counts[s.not_covered_reason] = (counts[s.not_covered_reason] || 0) + 1; }); const top = Object.entries(counts).sort((a,b) => b[1]-a[1])[0]; return top ? `${getReasonLabel(top[0])} (${top[1]})` : 'N/A'; })()}</div>
                        <div>Completion Rate:</div>
                        <div className="font-semibold text-blue-600">{progress}%</div>
                      </div>
                      <p className="text-xs text-gray-500">All uncovered site visits will be cancelled and archived. This action cannot be undone.</p>
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
            <Button size="sm" variant="outline" className="text-red-600 border-red-300" onClick={() => handleSendReminders(mmp.id)} data-testid={`button-send-reminder-${mmp.id}`}>
              <AlertTriangle className="h-3 w-3 mr-1" /> Send Reminders
            </Button>
          )}

          {cycleStatus === 'pending_approval' && (isFOM || isAdmin) && (
            <>
              <Button size="sm" className="bg-green-600" onClick={() => handleApproveCycle(mmp.id)} data-testid={`button-approve-${mmp.id}`}>
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
          <div className="mt-2 p-2 bg-red-50 dark:bg-red-950 rounded text-xs text-red-700 dark:text-red-300">
            <span className="font-medium">Rejection Note:</span> {(mmp as any).cycle_approval_note}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
