
import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  ShieldAlert, AlertTriangle, Activity, Clock, UserX, BadgeAlert,
  Lock, ShieldCheck, AlertOctagon, ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface FraudPreventionDashboardProps {
  suspiciousTransactionsCount?: number;
  blockedTransactionsCount?: number;
  highRiskAccountsCount?: number;
}

export const FraudPreventionDashboard: React.FC<FraudPreventionDashboardProps> = ({
  suspiciousTransactionsCount = 0,
  blockedTransactionsCount = 0,
  highRiskAccountsCount = 0,
}) => {
  const [counts, setCounts] = useState({
    suspicious: suspiciousTransactionsCount,
    blocked: blockedTransactionsCount,
    highRisk: highRiskAccountsCount,
  });

  const [activities, setActivities] = useState<Array<{
    id: string;
    title: string;
    message?: string | null;
    severity?: string | null;
    status?: string | null;
    created_at?: string | null;
  }>>([]);

  const timeAgo = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso).getTime();
    const diff = Math.max(0, Date.now() - d);
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} mins ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
    const days = Math.floor(h / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  };

  useEffect(() => {
    const fetchData = async () => {
      // 1) Recent alerts for activities
      const { data: alerts } = await supabase
        .from('budget_alerts')
        .select('id, title, message, severity, status, created_at, project_budget_id, mmp_budget_id')
        .order('created_at', { ascending: false })
        .limit(10);

      setActivities((alerts || []).map((a: any) => ({
        id: a.id,
        title: a.title,
        message: a.message,
        severity: a.severity,
        status: a.status,
        created_at: a.created_at,
      })));

      // 2) Suspicious count = active alerts
      const { count: activeAlertsCount } = await supabase
        .from('budget_alerts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      // 3) Blocked = transactions awaiting approval
      const { count: blockedCount } = await supabase
        .from('budget_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('requires_approval', true)
        .is('approved_at', null);

      // 4) High risk = distinct budgets with high/critical active alerts
      const { data: highAlerts } = await supabase
        .from('budget_alerts')
        .select('project_budget_id, mmp_budget_id, severity, status')
        .in('severity', ['high', 'critical'])
        .eq('status', 'active');

      const proj = new Set((highAlerts || []).map((r: any) => r.project_budget_id).filter(Boolean));
      const mmp = new Set((highAlerts || []).map((r: any) => r.mmp_budget_id).filter(Boolean));

      setCounts({
        suspicious: activeAlertsCount || 0,
        blocked: blockedCount || 0,
        highRisk: proj.size + mmp.size,
      });
    };

    fetchData();
  }, []);

  return (
    <Card className="border-t-4 border-t-red-600 overflow-hidden transition-all hover:shadow-md">
      <CardHeader className="bg-slate-50 pb-2">
        <CardTitle className="text-xl flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-red-600" />
          Fraud Prevention Dashboard
        </CardTitle>
        <CardDescription>Real-time fraud monitoring and adaptive escalation rules</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-6">
        {/* Fraud Indicators */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className={cn(
            "p-3", 
            counts.suspicious > 5 ? "bg-amber-50 border-amber-200" : "bg-slate-50"
          )}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className={cn(
                    "h-4 w-4", 
                    counts.suspicious > 5 ? "text-amber-600" : "text-slate-400"
                  )} />
                  <span className="text-sm font-medium">Suspicious Transactions</span>
                </div>
                <p className={cn(
                  "text-lg font-bold", 
                  counts.suspicious > 5 ? "text-amber-800" : "text-slate-700"
                )}>{counts.suspicious}</p>
              </div>
              {counts.suspicious > 5 && (
                <Badge className="bg-amber-200 text-amber-800">Alert</Badge>
              )}
            </div>
          </Card>

          <Card className={cn(
            "p-3",
            counts.blocked > 0 ? "bg-red-50 border-red-200" : "bg-slate-50"
          )}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Lock className={cn(
                    "h-4 w-4",
                    counts.blocked > 0 ? "text-red-600" : "text-slate-400"
                  )} />
                  <span className="text-sm font-medium">Blocked Transactions</span>
                </div>
                <p className={cn(
                  "text-lg font-bold",
                  counts.blocked > 0 ? "text-red-800" : "text-slate-700"
                )}>{counts.blocked}</p>
              </div>
              {counts.blocked > 0 && (
                <Badge className="bg-red-200 text-red-800">Critical</Badge>
              )}
            </div>
          </Card>

          <Card className={cn(
            "p-3",
            counts.highRisk > 0 ? "bg-red-50 border-red-200" : "bg-slate-50"
          )}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <UserX className={cn(
                    "h-4 w-4",
                    counts.highRisk > 0 ? "text-red-600" : "text-slate-400"
                  )} />
                  <span className="text-sm font-medium">High-Risk Accounts</span>
                </div>
                <p className={cn(
                  "text-lg font-bold",
                  counts.highRisk > 0 ? "text-red-800" : "text-slate-700"
                )}>{counts.highRisk}</p>
              </div>
              {counts.highRisk > 0 && (
                <Badge className="bg-red-200 text-red-800">Critical</Badge>
              )}
            </div>
          </Card>
        </div>

        {/* Verification Layers */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Dynamic Verification Layers</h3>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
                  Standard Verification
                </span>
                <span className="text-xs">All transactions</span>
              </div>
              <Progress value={100} className="h-1.5 bg-slate-100" indicatorClassName="bg-green-500" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium flex items-center gap-1">
                  <BadgeAlert className="h-3.5 w-3.5 text-amber-500" />
                  Enhanced Verification
                </span>
                <span className="text-xs">Transactions {'>'}  SDG 1,000</span>
              </div>
              <Progress value={60} className="h-1.5 bg-slate-100" indicatorClassName="bg-amber-500" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium flex items-center gap-1">
                  <AlertOctagon className="h-3.5 w-3.5 text-red-500" />
                  Multi-Factor Authentication
                </span>
                <span className="text-xs">High-risk transactions</span>
              </div>
              <Progress value={30} className="h-1.5 bg-slate-100" indicatorClassName="bg-red-500" />
            </div>
          </div>
        </div>

        {/* Suspicious Activities */}
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-red-600" />
            Recent Suspicious Activities
          </h3>

          <div className="space-y-2">
            {activities.map((activity) => (
              <Card 
                key={activity.id} 
                className={cn(
                  "p-3 transition-all hover:shadow-sm",
                  activity.severity === "high" || activity.severity === "critical" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-medium text-sm">{activity.title}</p>
                    {activity.message && (
                      <p className="text-xs text-muted-foreground">{activity.message}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge 
                      className={cn(
                        activity.status === "blocked" ? "bg-red-200 text-red-800" :
                        activity.status === "flagged" || activity.status === "active" ? "bg-amber-200 text-amber-800" :
                        "bg-blue-200 text-blue-800"
                      )}
                    >
                      {activity.status || 'active'}
                    </Badge>
                    <p className="text-xs flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {timeAgo(activity.created_at)}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <Button variant="outline" className="w-full mt-3 group">
            View All Suspicious Activities
            <ArrowRight className="h-4 w-4 ml-1 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

