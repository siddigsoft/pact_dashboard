
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, AlertTriangle, XCircle, Clock, Info } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

interface ApprovalRecord {
  id: string;
  submitted_by: string;
  amount_cents: number;
  currency: string;
  status: string;
  tier1_status: string | null;
  tier2_status: string | null;
  expense_category: string;
  created_at: string;
  tier1_approved_at: string | null;
  tier2_approved_at: string | null;
}

interface ProfileName {
  id: string;
  full_name: string | null;
}

const getDerivedStatus = (record: ApprovalRecord): string => {
  if (record.status === 'paid' || record.status === 'reconciled') return 'approved';
  if (record.status === 'rejected') return 'rejected';
  if (record.status === 'approved' || record.tier2_status === 'approved') return 'approved';
  if (record.tier2_status === 'rejected' || record.tier1_status === 'rejected') return 'rejected';
  if (record.tier1_status === 'approved' && !record.tier2_status) return 'escalated';
  return 'pending';
};

export const ApprovalTierAnalytics = () => {
  const [records, setRecords] = useState<ApprovalRecord[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: opCosts } = await supabase
          .from('operational_cost_submissions')
          .select('id, submitted_by, amount_cents, currency, status, tier1_status, tier2_status, expense_category, created_at, tier1_approved_at, tier2_approved_at')
          .order('created_at', { ascending: false });

        const submissions = (opCosts || []) as ApprovalRecord[];
        setRecords(submissions);

        const userIds = [...new Set(submissions.map(s => s.submitted_by).filter(Boolean))];
        if (userIds.length > 0) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', userIds);

          const profileMap: Record<string, string> = {};
          (profileData || []).forEach((p: ProfileName) => {
            profileMap[p.id] = p.full_name || 'Unknown';
          });
          setProfiles(profileMap);
        }
      } catch (err) {
        console.error('Error fetching approval data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const pendingCount = records.filter(r => getDerivedStatus(r) === 'pending').length;
  const approvedCount = records.filter(r => getDerivedStatus(r) === 'approved').length;
  const escalatedCount = records.filter(r => getDerivedStatus(r) === 'escalated').length;
  const rejectedCount = records.filter(r => getDerivedStatus(r) === 'rejected').length;
  const totalTransactions = records.length;

  const pendingPercentage = totalTransactions > 0 ? Math.round((pendingCount / totalTransactions) * 100) : 0;
  const approvedPercentage = totalTransactions > 0 ? Math.round((approvedCount / totalTransactions) * 100) : 0;
  const escalatedPercentage = totalTransactions > 0 ? Math.round((escalatedCount / totalTransactions) * 100) : 0;
  const rejectedPercentage = totalTransactions > 0 ? Math.round((rejectedCount / totalTransactions) * 100) : 0;

  const recentApprovals = records.slice(0, 5);

  return (
    <Card data-testid="card-approval-tier-analytics">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl">Operational Cost Approval Analytics</CardTitle>
        <CardDescription>Live tracking of operational cost submission approvals from the database</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-6">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="text-loading-approvals">Loading approval data...</div>
        ) : totalTransactions === 0 ? (
          <div className="text-center py-8" data-testid="text-no-approval-data">
            <Info className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">No operational cost submissions found</p>
            <p className="text-xs text-muted-foreground mt-1">Approval analytics will appear here once cost submissions are created</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-3">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-500" />
                    <span className="font-medium">Pending</span>
                  </div>
                  <Badge variant="outline" className="bg-amber-50 text-amber-700" data-testid="badge-pending-count">{pendingCount}</Badge>
                </div>
              </Card>
              <Card className="p-3">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="font-medium">Approved</span>
                  </div>
                  <Badge variant="outline" className="bg-green-50 text-green-700" data-testid="badge-approved-count">{approvedCount}</Badge>
                </div>
              </Card>
              <Card className="p-3">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    <span className="font-medium">Under Review</span>
                  </div>
                  <Badge variant="outline" className="bg-yellow-50 text-yellow-700" data-testid="badge-escalated-count">{escalatedCount}</Badge>
                </div>
              </Card>
              <Card className="p-3">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="font-medium">Rejected</span>
                  </div>
                  <Badge variant="outline" className="bg-red-50 text-red-700" data-testid="badge-rejected-count">{rejectedCount}</Badge>
                </div>
              </Card>
            </div>

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
                  <span>Under Review (Tier 1 Approved)</span>
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

            {recentApprovals.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Recent Submissions</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Submitted By</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentApprovals.map((record) => {
                      const status = getDerivedStatus(record);
                      const amount = record.amount_cents / 100;
                      return (
                        <TableRow key={record.id} data-testid={`row-approval-${record.id}`}>
                          <TableCell className="font-medium">{profiles[record.submitted_by] || 'Unknown'}</TableCell>
                          <TableCell className="capitalize">{record.expense_category?.replace(/_/g, ' ') || '-'}</TableCell>
                          <TableCell>{record.currency || 'SDG'} {amount.toLocaleString()}</TableCell>
                          <TableCell>
                            {status === "approved" && (
                              <Badge variant="outline" className="bg-green-50 text-green-700 flex items-center gap-1 w-fit">
                                <CheckCircle className="h-3 w-3" /> Approved
                              </Badge>
                            )}
                            {status === "escalated" && (
                              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 flex items-center gap-1 w-fit">
                                <AlertTriangle className="h-3 w-3" /> Under Review
                              </Badge>
                            )}
                            {status === "rejected" && (
                              <Badge variant="outline" className="bg-red-50 text-red-700 flex items-center gap-1 w-fit">
                                <XCircle className="h-3 w-3" /> Rejected
                              </Badge>
                            )}
                            {status === "pending" && (
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 flex items-center gap-1 w-fit">
                                <Clock className="h-3 w-3" /> Pending
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
