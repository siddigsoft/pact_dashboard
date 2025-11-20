
import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  ShieldAlert, AlertTriangle, Activity, Clock, UserX, BadgeAlert,
  Lock, ShieldCheck, AlertOctagon, ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FraudPreventionDashboardProps {
  suspiciousTransactionsCount: number;
  blockedTransactionsCount: number;
  highRiskAccountsCount: number;
}

export const FraudPreventionDashboard: React.FC<FraudPreventionDashboardProps> = ({
  suspiciousTransactionsCount = 8,
  blockedTransactionsCount = 3,
  highRiskAccountsCount = 2,
}) => {
  // Mock data for recent suspicious activities
  const suspiciousActivities = [
    { id: 1, user: "Mohammed Ali", type: "Excessive withdrawal attempts", severity: "high", time: "2 mins ago", status: "blocked" },
    { id: 2, user: "Sara Ahmed", type: "Unusual location login", severity: "medium", time: "25 mins ago", status: "flagged" },
    { id: 3, user: "Ibrahim Hassan", type: "Multiple rapid transactions", severity: "high", time: "1 hour ago", status: "under review" },
    { id: 4, user: "Fatima Osman", type: "Unusual payment pattern", severity: "medium", time: "3 hours ago", status: "flagged" },
  ];

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
            suspiciousTransactionsCount > 5 ? "bg-amber-50 border-amber-200" : "bg-slate-50"
          )}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className={cn(
                    "h-4 w-4", 
                    suspiciousTransactionsCount > 5 ? "text-amber-600" : "text-slate-400"
                  )} />
                  <span className="text-sm font-medium">Suspicious Transactions</span>
                </div>
                <p className={cn(
                  "text-lg font-bold", 
                  suspiciousTransactionsCount > 5 ? "text-amber-800" : "text-slate-700"
                )}>{suspiciousTransactionsCount}</p>
              </div>
              {suspiciousTransactionsCount > 5 && (
                <Badge className="bg-amber-200 text-amber-800">Alert</Badge>
              )}
            </div>
          </Card>

          <Card className={cn(
            "p-3",
            blockedTransactionsCount > 0 ? "bg-red-50 border-red-200" : "bg-slate-50"
          )}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Lock className={cn(
                    "h-4 w-4",
                    blockedTransactionsCount > 0 ? "text-red-600" : "text-slate-400"
                  )} />
                  <span className="text-sm font-medium">Blocked Transactions</span>
                </div>
                <p className={cn(
                  "text-lg font-bold",
                  blockedTransactionsCount > 0 ? "text-red-800" : "text-slate-700"
                )}>{blockedTransactionsCount}</p>
              </div>
              {blockedTransactionsCount > 0 && (
                <Badge className="bg-red-200 text-red-800">Critical</Badge>
              )}
            </div>
          </Card>

          <Card className={cn(
            "p-3",
            highRiskAccountsCount > 0 ? "bg-red-50 border-red-200" : "bg-slate-50"
          )}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <UserX className={cn(
                    "h-4 w-4",
                    highRiskAccountsCount > 0 ? "text-red-600" : "text-slate-400"
                  )} />
                  <span className="text-sm font-medium">High-Risk Accounts</span>
                </div>
                <p className={cn(
                  "text-lg font-bold",
                  highRiskAccountsCount > 0 ? "text-red-800" : "text-slate-700"
                )}>{highRiskAccountsCount}</p>
              </div>
              {highRiskAccountsCount > 0 && (
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
            {suspiciousActivities.map((activity) => (
              <Card 
                key={activity.id} 
                className={cn(
                  "p-3 transition-all hover:shadow-sm",
                  activity.severity === "high" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-medium text-sm">{activity.user}</p>
                    <p className="text-xs text-muted-foreground">{activity.type}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge 
                      className={cn(
                        activity.status === "blocked" ? "bg-red-200 text-red-800" :
                        activity.status === "flagged" ? "bg-amber-200 text-amber-800" :
                        "bg-blue-200 text-blue-800"
                      )}
                    >
                      {activity.status}
                    </Badge>
                    <p className="text-xs flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {activity.time}
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

