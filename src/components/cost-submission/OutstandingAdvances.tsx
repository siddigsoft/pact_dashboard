import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  AlertTriangle, 
  Clock, 
  Wallet, 
  Building2, 
  Users, 
  ChevronRight,
  Receipt,
  Calendar
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { 
  EnhancedCostRequest, 
  BUDGET_LINE_LABELS,
  OutstandingAdvancesSummary
} from "@/types/cost-submission";

interface OutstandingAdvancesProps {
  requests: EnhancedCostRequest[];
  onReconcile?: (request: EnhancedCostRequest) => void;
  onViewDetails?: (request: EnhancedCostRequest) => void;
}

export default function OutstandingAdvances({ 
  requests, 
  onReconcile,
  onViewDetails 
}: OutstandingAdvancesProps) {
  const openAdvances = useMemo(() => {
    return requests.filter(r => 
      r.requestType === 'advance' && 
      r.balanceStatus === 'open' &&
      r.status === 'disbursed'
    );
  }, [requests]);

  const summary: OutstandingAdvancesSummary = useMemo(() => {
    const totalDisbursed = openAdvances.reduce((sum, r) => sum + (r.disbursedAmountCents || 0), 0);
    const totalReconciled = openAdvances.reduce((sum, r) => sum + (r.actualSpentCents || 0), 0);
    const totalOpenBalance = openAdvances.reduce((sum, r) => {
      const disbursed = r.disbursedAmountCents || 0;
      const spent = r.actualSpentCents || 0;
      return sum + (disbursed - spent);
    }, 0);
    
    const overdueCount = openAdvances.filter(r => {
      if (!r.disbursedAt) return false;
      const daysSinceDisbursement = differenceInDays(new Date(), new Date(r.disbursedAt));
      return daysSinceDisbursement > 14;
    }).length;

    const atRiskCount = openAdvances.filter(r => {
      if (!r.disbursedAt) return false;
      const days = differenceInDays(new Date(), new Date(r.disbursedAt));
      return days >= 7 && days <= 14;
    }).length;

    const byUserMap = new Map<string, { userId: string; userName: string; openCount: number; totalOpenCents: number; oldestDisbursementDate?: string }>();
    const byProjectMap = new Map<string, { projectId: string; projectName: string; openCount: number; totalOpenCents: number }>();

    openAdvances.forEach(r => {
      const userEntry = byUserMap.get(r.submittedBy) || {
        userId: r.submittedBy,
        userName: r.submitterName || 'Unknown',
        openCount: 0,
        totalOpenCents: 0,
        oldestDisbursementDate: r.disbursedAt,
      };
      userEntry.openCount++;
      userEntry.totalOpenCents += r.disbursedAmountCents || 0;
      if (r.disbursedAt && (!userEntry.oldestDisbursementDate || r.disbursedAt < userEntry.oldestDisbursementDate)) {
        userEntry.oldestDisbursementDate = r.disbursedAt;
      }
      byUserMap.set(r.submittedBy, userEntry);

      const projectEntry = byProjectMap.get(r.projectId) || {
        projectId: r.projectId,
        projectName: r.projectName || 'Unknown',
        openCount: 0,
        totalOpenCents: 0,
      };
      projectEntry.openCount++;
      projectEntry.totalOpenCents += r.disbursedAmountCents || 0;
      byProjectMap.set(r.projectId, projectEntry);
    });

    return {
      totalOpenAdvances: openAdvances.length,
      totalDisbursedCents: totalDisbursed,
      totalReconciledCents: totalReconciled,
      totalOpenBalanceCents: totalOpenBalance,
      overdueCount,
      byUser: Array.from(byUserMap.values()).sort((a, b) => b.totalOpenCents - a.totalOpenCents),
      byProject: Array.from(byProjectMap.values()).sort((a, b) => b.totalOpenCents - a.totalOpenCents),
    };
  }, [openAdvances]);

  if (openAdvances.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Wallet className="h-12 w-12 mx-auto mb-4 text-green-500" />
          <h3 className="text-lg font-medium text-green-700">No Outstanding Advances</h3>
          <p className="text-muted-foreground mt-2">
            All advance payments have been reconciled. Great job!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {summary.overdueCount > 0 && (
        <Alert className="bg-red-50 dark:bg-red-950/30 border-red-200">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">Overdue Reconciliations</AlertTitle>
          <AlertDescription className="text-red-700">
            {summary.overdueCount} advance{summary.overdueCount > 1 ? 's' : ''} overdue for reconciliation 
            (more than 30 days since disbursement).
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Receipt className="h-4 w-4" />
              Open Advances
            </div>
            <p className="text-2xl font-bold text-amber-700">{summary.totalOpenAdvances}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Wallet className="h-4 w-4" />
              Total Disbursed
            </div>
            <p className="text-2xl font-bold">{(summary.totalDisbursedCents / 100).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">SDG outstanding</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              Staff with Open Balances
            </div>
            <p className="text-2xl font-bold">{summary.byUser.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Building2 className="h-4 w-4" />
              Projects Affected
            </div>
            <p className="text-2xl font-bold">{summary.byProject.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              By Staff Member
            </CardTitle>
            <CardDescription>Outstanding balances per person</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.byUser.slice(0, 5).map(user => (
              <div key={user.userId} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{user.userName.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{user.userName}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.openCount} open advance{user.openCount > 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-amber-600">
                    {(user.totalOpenCents / 100).toLocaleString()} SDG
                  </p>
                  {user.oldestDisbursementDate && (
                    <p className="text-xs text-muted-foreground">
                      Since {format(new Date(user.oldestDisbursementDate), 'MMM d')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              By Project
            </CardTitle>
            <CardDescription>Outstanding balances per project</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.byProject.slice(0, 5).map(project => {
              const percentage = (project.totalOpenCents / summary.totalOpenBalanceCents) * 100;
              return (
                <div key={project.projectId} className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{project.projectName}</p>
                      <p className="text-xs text-muted-foreground">
                        {project.openCount} open advance{project.openCount > 1 ? 's' : ''}
                      </p>
                    </div>
                    <p className="font-bold text-amber-600">
                      {(project.totalOpenCents / 100).toLocaleString()} SDG
                    </p>
                  </div>
                  <Progress value={percentage} className="h-1" />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Pending Reconciliations
          </CardTitle>
          <CardDescription>
            Advances awaiting receipt uploads and reconciliation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {openAdvances.slice(0, 10).map(request => {
            const daysSinceDisbursement = request.disbursedAt 
              ? differenceInDays(new Date(), new Date(request.disbursedAt))
              : 0;
            const isOverdue = daysSinceDisbursement > 30;
            
            return (
              <div 
                key={request.id} 
                className={`p-4 rounded-lg border ${isOverdue ? 'border-red-200 bg-red-50/50 dark:bg-red-950/20' : 'bg-muted/30'}`}
                data-testid={`advance-${request.id}`}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{request.title}</h4>
                      {isOverdue && (
                        <Badge variant="destructive" className="text-xs">
                          Overdue
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {request.projectName || 'N/A'}
                      </span>
                      <span>
                        {BUDGET_LINE_LABELS[request.budgetLineCategory]?.en || request.budgetLineCategory}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {request.disbursedAt 
                          ? `${daysSinceDisbursement} days ago`
                          : 'N/A'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="text-right space-y-2">
                    <p className="text-lg font-bold text-amber-600">
                      {((request.disbursedAmountCents || 0) / 100).toLocaleString()} {request.currency}
                    </p>
                    <div className="flex gap-2">
                      {onViewDetails && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => onViewDetails(request)}
                          data-testid={`button-view-${request.id}`}
                        >
                          View
                        </Button>
                      )}
                      {onReconcile && (
                        <Button 
                          size="sm"
                          onClick={() => onReconcile(request)}
                          data-testid={`button-reconcile-${request.id}`}
                        >
                          Reconcile
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          
          {openAdvances.length > 10 && (
            <p className="text-center text-sm text-muted-foreground pt-2">
              And {openAdvances.length - 10} more...
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}