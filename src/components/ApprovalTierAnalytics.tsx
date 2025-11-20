
import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, AlertTriangle, XCircle, Clock } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ApprovalTierAnalyticsProps {
  pendingCount: number;
  approvedCount: number;
  escalatedCount: number;
  rejectedCount: number;
  totalTransactions: number;
}

export const ApprovalTierAnalytics: React.FC<ApprovalTierAnalyticsProps> = ({
  pendingCount,
  approvedCount,
  escalatedCount,
  rejectedCount,
  totalTransactions,
}) => {
  const pendingPercentage = Math.round((pendingCount / totalTransactions) * 100) || 0;
  const approvedPercentage = Math.round((approvedCount / totalTransactions) * 100) || 0;
  const escalatedPercentage = Math.round((escalatedCount / totalTransactions) * 100) || 0;
  const rejectedPercentage = Math.round((rejectedCount / totalTransactions) * 100) || 0;

  const recentApprovals = [
    { id: "AP1", user: "Ahmed Ibrahim", timestamp: "2025-04-14T09:30:00", status: "approved", tier: "standard", amount: 650 },
    { id: "AP2", user: "Sara Mohammed", timestamp: "2025-04-14T10:15:00", status: "escalated", tier: "review", amount: 1250 },
    { id: "AP3", user: "Omar Hassan", timestamp: "2025-04-14T11:05:00", status: "rejected", tier: "high-risk", amount: 3500 },
    { id: "AP4", user: "Fatima Ali", timestamp: "2025-04-14T11:45:00", status: "pending", tier: "standard", amount: 800 },
  ];

  return (
    <Card className="border-t-4 border-t-blue-600 overflow-hidden transition-all hover:shadow-md">
      <CardHeader className="bg-slate-50 pb-2">
        <CardTitle className="text-xl">Real-Time Approval Tier Analytics</CardTitle>
        <CardDescription>Live tracking of transaction approvals and risk assessment</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3 border-l-4 border-l-amber-400">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                <span className="font-medium">Pending</span>
              </div>
              <Badge variant="outline" className="bg-amber-50 text-amber-700">{pendingCount}</Badge>
            </div>
          </Card>
          <Card className="p-3 border-l-4 border-l-green-400">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="font-medium">Approved</span>
              </div>
              <Badge variant="outline" className="bg-green-50 text-green-700">{approvedCount}</Badge>
            </div>
          </Card>
          <Card className="p-3 border-l-4 border-l-yellow-400">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <span className="font-medium">Escalated</span>
              </div>
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700">{escalatedCount}</Badge>
            </div>
          </Card>
          <Card className="p-3 border-l-4 border-l-red-400">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="font-medium">Rejected</span>
              </div>
              <Badge variant="outline" className="bg-red-50 text-red-700">{rejectedCount}</Badge>
            </div>
          </Card>
        </div>

        {/* Approval Rate Progress */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Approval Flow Distribution</h3>
          
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span>Pending</span>
              <span>{pendingPercentage}%</span>
            </div>
            <Progress value={pendingPercentage} className="h-1.5 bg-slate-100" indicatorClassName="bg-amber-500" />
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span>Approved</span>
              <span>{approvedPercentage}%</span>
            </div>
            <Progress value={approvedPercentage} className="h-1.5 bg-slate-100" indicatorClassName="bg-green-500" />
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span>Escalated for Review</span>
              <span>{escalatedPercentage}%</span>
            </div>
            <Progress value={escalatedPercentage} className="h-1.5 bg-slate-100" indicatorClassName="bg-yellow-500" />
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span>Rejected</span>
              <span>{rejectedPercentage}%</span>
            </div>
            <Progress value={rejectedPercentage} className="h-1.5 bg-slate-100" indicatorClassName="bg-red-500" />
          </div>
        </div>

        {/* Recent Approval Activity Table */}
        <div>
          <h3 className="text-sm font-semibold mb-2">Recent Approval Activity</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Risk Tier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentApprovals.map((approval) => (
                <TableRow key={approval.id} className="hover:bg-slate-50">
                  <TableCell className="font-medium">{approval.user}</TableCell>
                  <TableCell>SDG {approval.amount}</TableCell>
                  <TableCell>
                    {approval.status === "approved" && (
                      <Badge variant="outline" className="bg-green-50 text-green-700 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Approved
                      </Badge>
                    )}
                    {approval.status === "escalated" && (
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Escalated
                      </Badge>
                    )}
                    {approval.status === "rejected" && (
                      <Badge variant="outline" className="bg-red-50 text-red-700 flex items-center gap-1">
                        <XCircle className="h-3 w-3" /> Rejected
                      </Badge>
                    )}
                    {approval.status === "pending" && (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Pending
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {approval.tier === "standard" && <Badge className="bg-green-100 text-green-800 hover:bg-green-200">Standard</Badge>}
                    {approval.tier === "review" && <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">Review</Badge>}
                    {approval.tier === "high-risk" && <Badge className="bg-red-100 text-red-800 hover:bg-red-200">High Risk</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
