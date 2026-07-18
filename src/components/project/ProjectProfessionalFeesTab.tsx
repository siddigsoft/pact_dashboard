import { useMemo, useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import {
  DollarSign, Users, Clock, Percent, CheckCircle2,
  AlertCircle, Clock3, Download, TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ProjectTeamMember, calcMemberTotalCost, TeamFeeType } from '@/types/project';
import { exportToExcel } from '@/utils/report-export';

interface Props {
  projectId: string;
  projectName: string;
  teamComposition: ProjectTeamMember[];
  projectBudget?: number;
  currency?: string;
  onManageTeam?: () => void;
}

const FEE_LABELS: Record<TeamFeeType, string> = {
  per_hour: 'Per Hour',
  fixed_fee: 'Fixed Fee',
  percent_budget: '% of Budget',
};

const PAY_STATUS = {
  unpaid:         { label: 'Unpaid',   cls: 'bg-red-100 text-red-700 border-red-200',             icon: AlertCircle },
  partially_paid: { label: 'Partial',  cls: 'bg-amber-100 text-amber-700 border-amber-200',       icon: Clock3 },
  paid:           { label: 'Paid',     cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
};

function fmtMoney(amount: number, cur = 'SDG') {
  return `${cur} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(s?: string) {
  if (!s) return '—';
  try { const d = parseISO(s); return isValid(d) ? format(d, 'dd MMM yyyy') : '—'; } catch { return '—'; }
}

export default function ProjectProfessionalFeesTab({
  projectName,
  teamComposition,
  projectBudget,
  currency = 'SDG',
  onManageTeam,
}: Props) {
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'partially_paid' | 'paid'>('all');

  const members = useMemo(
    () => teamComposition.filter(m => m.feeType),
    [teamComposition],
  );

  const filtered = useMemo(
    () => filter === 'all' ? members : members.filter(m => (m.paymentStatus || 'unpaid') === filter),
    [members, filter],
  );

  const totals = useMemo(() => {
    const totalFees = members.reduce((s, m) => s + calcMemberTotalCost(m, projectBudget), 0);
    const totalPaid = members.reduce((s, m) => s + (m.amountPaid || 0), 0);
    const totalUnpaid = Math.max(0, totalFees - totalPaid);
    const paidPct = totalFees > 0 ? (totalPaid / totalFees) * 100 : 0;
    const internalCount = members.filter(m => m.memberType === 'internal').length;
    const externalCount = members.filter(m => m.memberType === 'external').length;
    return { totalFees, totalPaid, totalUnpaid, paidPct, internalCount, externalCount };
  }, [members, projectBudget]);

  const handleExport = () => {
    exportToExcel(
      filtered.map(m => {
        const total = calcMemberTotalCost(m, projectBudget);
        return {
          Name: m.name,
          Role: m.role,
          Type: m.memberType === 'internal' ? 'Internal' : 'External',
          'Fee Type': m.feeType ? FEE_LABELS[m.feeType] : '—',
          'Rate': m.rate ?? 0,
          'Planned Hours': m.feeType === 'per_hour' ? (m.plannedHours ?? 0) : '—',
          [`Total Fee (${currency})`]: total.toFixed(2),
          [`Paid (${currency})`]: (m.amountPaid || 0).toFixed(2),
          [`Outstanding (${currency})`]: Math.max(0, total - (m.amountPaid || 0)).toFixed(2),
          'Payment Due': fmtDate(m.paymentDueDate),
          'Status': PAY_STATUS[m.paymentStatus || 'unpaid']?.label ?? 'Unpaid',
        };
      }),
      'Professional Fees',
      `${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_professional_fees.xlsx`,
    );
  };

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 border border-dashed rounded-xl text-center space-y-3 mt-4">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <Users className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">No professional fees configured</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Add fee details (Per Hour / Fixed Fee / % of Budget) when adding team members to track their costs and payments here.
          </p>
        </div>
        {onManageTeam && (
          <Button variant="outline" size="sm" onClick={onManageTeam}>
            <Users className="h-4 w-4 mr-1.5" /> Manage Team
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Total Fees</span>
            </div>
            <p className="text-lg font-bold">{fmtMoney(totals.totalFees, currency)}</p>
            <p className="text-xs text-muted-foreground">{members.length} member{members.length !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Paid</span>
            </div>
            <p className="text-lg font-bold text-emerald-600">{fmtMoney(totals.totalPaid, currency)}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <Progress value={totals.paidPct} className="h-1.5 flex-1" />
              <span className="text-[10px] text-muted-foreground">{totals.paidPct.toFixed(0)}%</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-xs text-muted-foreground">Outstanding</span>
            </div>
            <p className="text-lg font-bold text-red-600">{fmtMoney(totals.totalUnpaid, currency)}</p>
            <p className="text-xs text-muted-foreground">
              {members.filter(m => (m.paymentStatus || 'unpaid') !== 'paid').length} pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-violet-500" />
              <span className="text-xs text-muted-foreground">Team Split</span>
            </div>
            <p className="text-sm font-semibold">{totals.internalCount} Internal</p>
            <p className="text-xs text-muted-foreground">{totals.externalCount} External / Consultant</p>
          </CardContent>
        </Card>
      </div>

      {/* Budget share banner */}
      {projectBudget && projectBudget > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
          <Percent className="h-4 w-4 text-violet-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-violet-700 dark:text-violet-300">
              Professional fees represent{' '}
              <strong>{((totals.totalFees / projectBudget) * 100).toFixed(1)}%</strong> of total project budget
            </p>
          </div>
          <span className="text-xs text-violet-600 shrink-0">{fmtMoney(projectBudget, currency)} budget</span>
        </div>
      )}

      {/* Filters + export */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          {(['all', 'unpaid', 'partially_paid', 'paid'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filter === f
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              {f === 'all' ? 'All' : PAY_STATUS[f]?.label}
              {f !== 'all' && (
                <span className="ml-1 opacity-70">
                  ({members.filter(m => (m.paymentStatus || 'unpaid') === f).length})
                </span>
              )}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-1.5" /> Export Excel
        </Button>
      </div>

      {/* Fees table */}
      <Card>
        <CardHeader className="py-3 px-4 border-b">
          <CardTitle className="text-sm font-semibold">Professional Fees Tracker</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="pl-4">Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Fee Basis</TableHead>
                  <TableHead className="text-right">Total Fee</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(m => {
                  const total = calcMemberTotalCost(m, projectBudget);
                  const paid = m.amountPaid || 0;
                  const outstanding = Math.max(0, total - paid);
                  const status = m.paymentStatus || 'unpaid';
                  const cfg = PAY_STATUS[status] || PAY_STATUS.unpaid;
                  const StatusIcon = cfg.icon;
                  return (
                    <TableRow key={m.userId} className="hover:bg-muted/30">
                      <TableCell className="pl-4">
                        <div>
                          <p className="font-medium text-sm">{m.name}</p>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 mt-0.5 ${
                              m.memberType === 'internal'
                                ? 'border-blue-200 text-blue-700 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-violet-200 text-violet-700 bg-violet-50 dark:bg-violet-900/20'
                            }`}
                          >
                            {m.memberType === 'internal' ? 'Internal' : 'External'}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground capitalize">{m.role}</TableCell>
                      <TableCell>
                        {m.feeType && (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1 text-xs font-medium">
                              {m.feeType === 'per_hour' && <Clock className="h-3 w-3 text-blue-500" />}
                              {m.feeType === 'fixed_fee' && <DollarSign className="h-3 w-3 text-green-500" />}
                              {m.feeType === 'percent_budget' && <Percent className="h-3 w-3 text-violet-500" />}
                              {FEE_LABELS[m.feeType]}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {m.feeType === 'per_hour' && `${currency} ${m.rate ?? 0}/hr × ${m.plannedHours ?? 0}h`}
                              {m.feeType === 'fixed_fee' && `${currency} ${(m.rate ?? 0).toLocaleString()} lump sum`}
                              {m.feeType === 'percent_budget' && `${m.rate ?? 0}% of project budget`}
                            </p>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-sm">{fmtMoney(total, currency)}</TableCell>
                      <TableCell className="text-right text-emerald-600 text-sm">{fmtMoney(paid, currency)}</TableCell>
                      <TableCell className="text-right text-sm">
                        {outstanding > 0
                          ? <span className="text-red-600 font-medium">{fmtMoney(outstanding, currency)}</span>
                          : <span className="text-emerald-500">—</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(m.paymentDueDate)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.cls}`}>
                          <StatusIcon className="h-3 w-3" />
                          {cfg.label}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                      No entries match the selected filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
