import React, { useMemo, useState } from 'react';
import { format, parseISO, isValid, isPast } from 'date-fns';
import {
  DollarSign, Users, Clock, Percent, CheckCircle2,
  AlertCircle, Clock3, Download, TrendingUp, Pencil, Plus,
  ChevronDown, ChevronUp, Link2, Globe,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ProjectTeamMember, calcMemberTotalCost, TeamFeeType, PaymentInstallment,
  derivePaymentStatus, totalPaidFromInstallments,
} from '@/types/project';
import { exportToExcel } from '@/utils/report-export';
import { useToast } from '@/hooks/use-toast';

interface Props {
  projectId: string;
  projectName: string;
  teamComposition: ProjectTeamMember[];
  projectBudget?: number;
  currency?: string;
  onManageTeam?: () => void;
  onFeeUpdate?: (updatedComposition: ProjectTeamMember[]) => void;
}

const FEE_LABELS: Record<TeamFeeType, string> = {
  per_hour:       'Per Hour',
  fixed_fee:      'Fixed Fee',
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
  onFeeUpdate,
}: Props) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'partially_paid' | 'paid'>('all');
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);

  // ── Local state: mutable copy of teamComposition for fee edits ────────────
  const [localComposition, setLocalComposition] = useState<ProjectTeamMember[]>(teamComposition);
  // Sync from parent when prop changes (project reload)
  useMemo(() => setLocalComposition(teamComposition), [teamComposition]);

  // ── Fee edit dialog state ─────────────────────────────────────────────────
  const [feeDialogOpen, setFeeDialogOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [dlgFeeType, setDlgFeeType] = useState<TeamFeeType | ''>('');
  const [dlgRate, setDlgRate] = useState('');
  const [dlgHours, setDlgHours] = useState('');
  const [dlgCurrency, setDlgCurrency] = useState('SDG');
  const [dlgDueDate, setDlgDueDate] = useState('');
  const [dlgAmountPaid, setDlgAmountPaid] = useState('');
  const [dlgPayStatus, setDlgPayStatus] = useState<'unpaid' | 'partially_paid' | 'paid'>('unpaid');

  const openFeeDialog = (member: ProjectTeamMember) => {
    setEditingUserId(member.userId);
    setDlgFeeType(member.feeType || '');
    setDlgRate(member.rate?.toString() || '');
    setDlgHours(member.plannedHours?.toString() || '');
    setDlgCurrency(member.currency || currency);
    setDlgDueDate(member.paymentDueDate || '');
    setDlgAmountPaid(member.amountPaid?.toString() || '');
    setDlgPayStatus(member.paymentStatus || 'unpaid');
    setFeeDialogOpen(true);
  };

  const handleSaveFee = () => {
    if (!editingUserId) return;
    const updated = localComposition.map(m => {
      if (m.userId !== editingUserId) return m;
      return {
        ...m,
        feeType:        dlgFeeType || undefined,
        rate:           dlgFeeType && dlgRate ? parseFloat(dlgRate) : undefined,
        plannedHours:   dlgFeeType === 'per_hour' && dlgHours ? parseFloat(dlgHours) : undefined,
        currency:       dlgFeeType ? dlgCurrency : undefined,
        paymentDueDate: dlgFeeType && dlgDueDate ? dlgDueDate : undefined,
        amountPaid:     dlgFeeType ? parseFloat(dlgAmountPaid || '0') : undefined,
        paymentStatus:  dlgFeeType ? dlgPayStatus : undefined,
      };
    });
    setLocalComposition(updated);
    onFeeUpdate?.(updated);
    setFeeDialogOpen(false);
    toast({ title: 'Fee saved', description: 'Professional fee updated successfully.', variant: 'success' });
  };

  const handleMarkInstallmentPaid = (memberId: string, installmentId: string, paid: boolean) => {
    const updated = localComposition.map(m => {
      if (m.userId !== memberId || !m.installments) return m;
      const newInstallments: PaymentInstallment[] = m.installments.map(inst =>
        inst.id === installmentId
          ? { ...inst, status: paid ? 'paid' : 'pending', paidDate: paid ? new Date().toISOString().split('T')[0] : undefined }
          : inst
      );
      return {
        ...m,
        installments:  newInstallments,
        amountPaid:    totalPaidFromInstallments(newInstallments),
        paymentStatus: derivePaymentStatus(newInstallments),
      };
    });
    setLocalComposition(updated);
    onFeeUpdate?.(updated);
    const inst = updated.find(m => m.userId === memberId)?.installments?.find(i => i.id === installmentId);
    toast({
      title: paid ? 'Installment marked paid' : 'Installment marked unpaid',
      description: inst?.label || 'Payment status updated.',
      variant: 'success',
    });
  };

  // ── Derived sets ──────────────────────────────────────────────────────────
  const membersWithFees    = useMemo(() => localComposition.filter(m => m.feeType), [localComposition]);
  const membersWithoutFees = useMemo(() => localComposition.filter(m => !m.feeType), [localComposition]);

  const filtered = useMemo(
    () => filter === 'all' ? membersWithFees : membersWithFees.filter(m => (m.paymentStatus || 'unpaid') === filter),
    [membersWithFees, filter],
  );

  const totals = useMemo(() => {
    const totalFees   = membersWithFees.reduce((s, m) => s + calcMemberTotalCost(m, projectBudget), 0);
    const totalPaid   = membersWithFees.reduce((s, m) => s + (m.amountPaid || 0), 0);
    const totalUnpaid = Math.max(0, totalFees - totalPaid);
    const paidPct     = totalFees > 0 ? (totalPaid / totalFees) * 100 : 0;
    return { totalFees, totalPaid, totalUnpaid, paidPct,
      internalCount: membersWithFees.filter(m => m.memberType === 'internal').length,
      externalCount: membersWithFees.filter(m => m.memberType === 'external').length,
    };
  }, [membersWithFees, projectBudget]);

  const dlgEstTotal = useMemo(() => {
    if (!dlgFeeType || !dlgRate) return 0;
    if (dlgFeeType === 'per_hour')       return parseFloat(dlgRate || '0') * parseFloat(dlgHours || '0');
    if (dlgFeeType === 'fixed_fee')      return parseFloat(dlgRate || '0');
    if (dlgFeeType === 'percent_budget') return (projectBudget || 0) * (parseFloat(dlgRate || '0') / 100);
    return 0;
  }, [dlgFeeType, dlgRate, dlgHours, projectBudget]);

  const handleExport = () => {
    exportToExcel(
      filtered.map(m => {
        const total = calcMemberTotalCost(m, projectBudget);
        return {
          Name:                m.name,
          Role:                m.role,
          Type:                m.memberType === 'internal' ? 'Internal' : 'External',
          'Fee Type':          m.feeType ? FEE_LABELS[m.feeType] : '—',
          Rate:                m.rate ?? 0,
          'Planned Hours':     m.feeType === 'per_hour' ? (m.plannedHours ?? 0) : '—',
          [`Total Fee (${currency})`]:    total.toFixed(2),
          [`Paid (${currency})`]:         (m.amountPaid || 0).toFixed(2),
          [`Outstanding (${currency})`]:  Math.max(0, total - (m.amountPaid || 0)).toFixed(2),
          'Payment Due':       fmtDate(m.paymentDueDate),
          Status:              PAY_STATUS[m.paymentStatus || 'unpaid']?.label ?? 'Unpaid',
        };
      }),
      'Professional Fees',
      `${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_professional_fees.xlsx`,
    );
  };

  // ── Empty state: no team members at all ──────────────────────────────────
  if (localComposition.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 border border-dashed rounded-xl text-center space-y-3 mt-4">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <Users className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">No team members yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Add team members first, then configure professional fees here.
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

      {/* ── Fee Edit Dialog ──────────────────────────────────────────────── */}
      <Dialog open={feeDialogOpen} onOpenChange={v => setFeeDialogOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dlgFeeType ? 'Edit' : 'Set'} Professional Fee —{' '}
              {localComposition.find(m => m.userId === editingUserId)?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {/* Fee type + currency */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Fee Type</Label>
                <Select value={dlgFeeType || '__none__'} onValueChange={v => setDlgFeeType(v === '__none__' ? '' : v as TeamFeeType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None (no fee)</SelectItem>
                    <SelectItem value="per_hour">Per Hour</SelectItem>
                    <SelectItem value="fixed_fee">Fixed Fee (lump sum)</SelectItem>
                    <SelectItem value="percent_budget">% of Project Budget</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {dlgFeeType && dlgFeeType !== 'percent_budget' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Currency</Label>
                  <Select value={dlgCurrency} onValueChange={setDlgCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SDG">SDG</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Rate / hours / due date */}
            {dlgFeeType && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    {dlgFeeType === 'per_hour' ? 'Hourly Rate' : dlgFeeType === 'percent_budget' ? '% of Budget' : 'Fixed Amount'}
                  </Label>
                  <Input type="number" min="0" step="0.01" value={dlgRate}
                    onChange={e => setDlgRate(e.target.value)}
                    placeholder={dlgFeeType === 'percent_budget' ? 'e.g. 5' : '0.00'} />
                </div>
                {dlgFeeType === 'per_hour' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Planned Hours</Label>
                    <Input type="number" min="0" value={dlgHours}
                      onChange={e => setDlgHours(e.target.value)} placeholder="e.g. 40" />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs">Payment Due Date</Label>
                  <Input type="date" value={dlgDueDate} onChange={e => setDlgDueDate(e.target.value)} />
                </div>
              </div>
            )}

            {/* Amount paid + status */}
            {dlgFeeType && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Amount Already Paid</Label>
                  <Input type="number" min="0" step="0.01" value={dlgAmountPaid}
                    onChange={e => setDlgAmountPaid(e.target.value)} placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Payment Status</Label>
                  <Select value={dlgPayStatus} onValueChange={v => setDlgPayStatus(v as typeof dlgPayStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                      <SelectItem value="partially_paid">Partially Paid</SelectItem>
                      <SelectItem value="paid">Fully Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Live total preview */}
            {dlgFeeType && dlgRate && (
              <div className="flex items-center gap-2 p-2.5 rounded-md bg-muted text-sm">
                <DollarSign className="h-4 w-4 text-emerald-500 shrink-0" />
                <span className="text-muted-foreground text-xs">Estimated total:</span>
                <span className="font-bold text-emerald-600">
                  {fmtMoney(dlgEstTotal, dlgFeeType === 'percent_budget' ? currency : dlgCurrency)}
                </span>
                {dlgAmountPaid && parseFloat(dlgAmountPaid) > 0 && (
                  <>
                    <span className="text-muted-foreground text-xs ml-2">Outstanding:</span>
                    <span className="font-semibold text-red-600">
                      {fmtMoney(Math.max(0, dlgEstTotal - parseFloat(dlgAmountPaid || '0')), dlgFeeType === 'percent_budget' ? currency : dlgCurrency)}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeeDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveFee}>Save Fee</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── KPI cards ────────────────────────────────────────────────────── */}
      {membersWithFees.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-muted-foreground">Total Fees</span>
              </div>
              <p className="text-lg font-bold">{fmtMoney(totals.totalFees, currency)}</p>
              <p className="text-xs text-muted-foreground">{membersWithFees.length} member{membersWithFees.length !== 1 ? 's' : ''}</p>
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
                {membersWithFees.filter(m => (m.paymentStatus || 'unpaid') !== 'paid').length} pending
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
      )}

      {/* Budget share banner */}
      {projectBudget && projectBudget > 0 && totals.totalFees > 0 && (
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

      {/* ── Filters + export ──────────────────────────────────────────────── */}
      {membersWithFees.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
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
                    ({membersWithFees.filter(m => (m.paymentStatus || 'unpaid') === f).length})
                  </span>
                )}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1.5" /> Export Excel
          </Button>
        </div>
      )}

      {/* ── Members WITH fees table ───────────────────────────────────────── */}
      {membersWithFees.length > 0 ? (
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
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(m => {
                    const total       = calcMemberTotalCost(m, projectBudget);
                    const paid        = m.amountPaid || 0;
                    const outstanding = Math.max(0, total - paid);
                    const status      = m.paymentStatus || 'unpaid';
                    const cfg         = PAY_STATUS[status] || PAY_STATUS.unpaid;
                    const StatusIcon  = cfg.icon;
                    return (
                      <React.Fragment key={m.userId}>
                      <TableRow className="hover:bg-muted/30">
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
                                {m.feeType === 'per_hour'       && <Clock    className="h-3 w-3 text-blue-500" />}
                                {m.feeType === 'fixed_fee'      && <DollarSign className="h-3 w-3 text-green-500" />}
                                {m.feeType === 'percent_budget' && <Percent  className="h-3 w-3 text-violet-500" />}
                                {FEE_LABELS[m.feeType]}
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                {m.feeType === 'per_hour'       && `${m.currency || currency} ${m.rate ?? 0}/hr × ${m.plannedHours ?? 0}h`}
                                {m.feeType === 'fixed_fee'      && `${m.currency || currency} ${(m.rate ?? 0).toLocaleString()} lump sum`}
                                {m.feeType === 'percent_budget' && `${m.rate ?? 0}% of project budget`}
                              </p>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-sm">{fmtMoney(total, m.currency || currency)}</TableCell>
                        <TableCell className="text-right text-emerald-600 text-sm">{fmtMoney(paid, m.currency || currency)}</TableCell>
                        <TableCell className="text-right text-sm">
                          {outstanding > 0
                            ? <span className="text-red-600 font-medium">{fmtMoney(outstanding, m.currency || currency)}</span>
                            : <span className="text-emerald-500">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(m.paymentDueDate)}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.cls}`}>
                            <StatusIcon className="h-3 w-3" />
                            {cfg.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-0.5 justify-end">
                            {/* Expand installment schedule */}
                            {m.installments && m.installments.length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => setExpandedMemberId(expandedMemberId === m.userId ? null : m.userId)}
                                title="View payment schedule"
                                data-testid={`button-expand-installments-${m.userId}`}
                              >
                                {expandedMemberId === m.userId
                                  ? <ChevronUp className="h-3.5 w-3.5 text-primary" />
                                  : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => openFeeDialog(m)}
                              title="Edit fee"
                              data-testid={`button-edit-fee-row-${m.userId}`}
                            >
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* ── Expandable Installment Schedule Panel ───────── */}
                      {expandedMemberId === m.userId && m.installments && m.installments.length > 0 && (
                        <TableRow className="bg-muted/20 border-b">
                          <TableCell colSpan={9} className="px-6 py-3">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                  <Clock className="h-3.5 w-3.5" />
                                  Payment Schedule — {m.paymentScheduleType === 'monthly' ? 'Monthly' : m.paymentScheduleType === 'quarterly' ? 'Quarterly' : m.paymentScheduleType === 'bi_weekly' ? 'Bi-weekly' : m.paymentScheduleType === 'milestone' ? 'Milestone-based' : 'Custom'}
                                </p>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span>
                                    <strong className="text-emerald-600">{m.installments.filter(i => i.status === 'paid').length}</strong> / {m.installments.length} paid
                                  </span>
                                  <span>
                                    Remaining: <strong className="text-red-600">{fmtMoney(m.installments.filter(i => i.status !== 'paid').reduce((s, i) => s + i.amount, 0), m.currency || currency)}</strong>
                                  </span>
                                </div>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {m.installments.map(inst => {
                                  const overdue = inst.status !== 'paid' && inst.dueDate && isPast(parseISO(inst.dueDate));
                                  return (
                                    <div
                                      key={inst.id}
                                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs transition-all ${
                                        inst.status === 'paid'
                                          ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800'
                                          : overdue
                                          ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                                          : 'bg-background border-border hover:bg-muted/30'
                                      }`}
                                    >
                                      <button
                                        type="button"
                                        className="shrink-0"
                                        onClick={() => handleMarkInstallmentPaid(m.userId, inst.id, inst.status !== 'paid')}
                                        data-testid={`button-installment-paid-${m.userId}-${inst.id}`}
                                        title={inst.status === 'paid' ? 'Mark as unpaid' : 'Mark as paid'}
                                      >
                                        {inst.status === 'paid'
                                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                          : <div className="h-4 w-4 rounded-full border-2 border-muted-foreground hover:border-primary transition-colors" />}
                                      </button>
                                      <div className="flex-1 min-w-0">
                                        <p className={`font-medium ${inst.status === 'paid' ? 'text-emerald-700 dark:text-emerald-400' : overdue ? 'text-red-700 dark:text-red-400' : ''}`}>
                                          {inst.label}
                                        </p>
                                        <p className={`text-[10px] mt-0.5 ${overdue ? 'text-red-500' : 'text-muted-foreground'}`}>
                                          {inst.dueDate ? fmtDate(inst.dueDate) : '—'}
                                          {overdue && ' • Overdue'}
                                          {inst.paidDate && ` • Paid ${fmtDate(inst.paidDate)}`}
                                        </p>
                                      </div>
                                      <span className="font-bold shrink-0 tabular-nums">
                                        {fmtMoney(inst.amount, m.currency || currency)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                              {/* Progress bar */}
                              <div className="flex items-center gap-2 mt-1">
                                <Progress
                                  value={m.installments.length > 0 ? (m.installments.filter(i => i.status === 'paid').length / m.installments.length) * 100 : 0}
                                  className="h-1.5 flex-1"
                                />
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {m.installments.length > 0
                                    ? Math.round((m.installments.filter(i => i.status === 'paid').length / m.installments.length) * 100)
                                    : 0}% paid
                                </span>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      </React.Fragment>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-sm">
                        No entries match the selected filter.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 border border-dashed rounded-xl text-center space-y-2">
          <DollarSign className="h-8 w-8 text-muted-foreground/50" />
          <p className="font-medium text-sm">No professional fees configured yet</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Use the "Set Fee" button below to configure fees for team members.
          </p>
        </div>
      )}

      {/* ── Members WITHOUT fees ─────────────────────────────────────────── */}
      {membersWithoutFees.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4 border-b">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team Members Without Fees ({membersWithoutFees.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead className="pl-4">Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {membersWithoutFees.map(m => (
                  <TableRow key={m.userId} className="hover:bg-muted/20">
                    <TableCell className="pl-4 text-sm font-medium">{m.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground capitalize">{m.role}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] px-1.5 ${
                        m.memberType === 'internal'
                          ? 'border-blue-200 text-blue-700 bg-blue-50'
                          : 'border-violet-200 text-violet-700 bg-violet-50'
                      }`}>
                        {m.memberType === 'internal' ? 'Internal' : 'External'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => openFeeDialog(m)}
                        data-testid={`button-set-fee-${m.userId}`}
                      >
                        <Plus className="h-3 w-3" /> Set Fee
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
