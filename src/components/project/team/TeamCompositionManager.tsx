
import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, UserPlus, UserMinus, Clock, DollarSign, Percent, Users, Briefcase,
  Copy, Link2, Trash2, RefreshCw, CheckCircle2, ChevronDown, ChevronUp, Globe,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Project, ProjectRole, ProjectTeamMember, TeamFeeType, TeamMemberType,
  PaymentScheduleType, PaymentInstallment,
  calcMemberTotalCost, generateInstallmentSchedule, derivePaymentStatus, totalPaidFromInstallments,
} from '@/types/project';
import { User } from '@/types';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface TeamCompositionManagerProps {
  project: Project;
  onTeamChange: (teamMembers: ProjectTeamMember[]) => void;
}

const FEE_LABELS: Record<TeamFeeType, string> = {
  per_hour: 'Per Hour',
  fixed_fee: 'Fixed Fee',
  percent_budget: '% of Budget',
};

function fmtMoney(amount: number, cur = 'SDG') {
  return `${cur} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const TeamCompositionManager: React.FC<TeamCompositionManagerProps> = ({
  project,
  onTeamChange,
}) => {
  const { users } = useUser();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<ProjectRole>('dataCollector');
  const [teamMembers, setTeamMembers] = useState<ProjectTeamMember[]>(
    project.team?.teamComposition || []
  );
  const [userWorkloads, setUserWorkloads] = useState<Record<string, number>>({});
  // Cross-project workload: other active projects each member is on
  const [crossProjectCounts, setCrossProjectCounts] = useState<Record<string, number>>({});
  const [crossProjectNames, setCrossProjectNames] = useState<Record<string, string[]>>({});

  // Fee fields for the add-member dialog
  const [memberType, setMemberType] = useState<TeamMemberType>('internal');
  const [feeType, setFeeType] = useState<TeamFeeType | ''>('');
  const [rate, setRate] = useState('');
  const [plannedHours, setPlannedHours] = useState('');
  const [feeCurrency, setFeeCurrency] = useState('SDG');
  const [paymentDueDate, setPaymentDueDate] = useState('');

  // Edit-fee dialog state (for existing members)
  const [editFeeOpen, setEditFeeOpen] = useState(false);
  const [editFeeUserId, setEditFeeUserId] = useState<string | null>(null);
  const [editFeeType, setEditFeeType] = useState<TeamFeeType | ''>('');
  const [editRate, setEditRate] = useState('');
  const [editHours, setEditHours] = useState('');
  const [editCurrency, setEditCurrency] = useState('SDG');
  const [editDueDate, setEditDueDate] = useState('');
  // Installment schedule state
  const [editScheduleType, setEditScheduleType] = useState<PaymentScheduleType>('lump_sum');
  const [editInstallmentCount, setEditInstallmentCount] = useState('3');
  const [editPaymentStartDate, setEditPaymentStartDate] = useState('');
  const [editInstallments, setEditInstallments] = useState<PaymentInstallment[]>([]);
  const [editAmountPaid, setEditAmountPaid] = useState('');
  const [editPayStatus, setEditPayStatus] = useState<'unpaid' | 'partially_paid' | 'paid'>('unpaid');
  const [showInstallments, setShowInstallments] = useState(false);
  // External member add mode
  const [addMode, setAddMode] = useState<'system' | 'external'>('system');
  const [extName, setExtName] = useState('');
  const [extEmail, setExtEmail] = useState('');
  const [extOrg, setExtOrg] = useState('');
  const [extRole, setExtRole] = useState<ProjectRole>('consultant');
  // Copy-link feedback
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const ACTIVE_SITE_VISIT_STATUSES = ['pending', 'scheduled', 'in_progress', 'assigned', 'dispatched', 'verification_pending'];
  const ACTIVE_MMP_ENTRY_STATUSES = ['Pending', 'pending', 'in_progress', 'In Progress', 'dispatched', 'Dispatched', 'accepted', 'Accepted'];

  const teamMemberIds = teamMembers.map(m => m.userId).sort().join(',');
  const userIdList = users.map(u => u.id).sort().join(',');

  const fetchUserWorkloads = useCallback(async () => {
    try {
      const userIds = [...teamMembers.map(m => m.userId), ...users.map(u => u.id)];
      const uniqueUserIds = [...new Set(userIds)];
      if (uniqueUserIds.length === 0) return;

      const [
        { data: siteVisits, error: svError },
        { data: mmpEntries, error: mmpError },
        { data: otherProjects, error: projError },
      ] = await Promise.all([
        supabase.from('site_visits').select('assigned_to, status').in('assigned_to', uniqueUserIds).in('status', ACTIVE_SITE_VISIT_STATUSES),
        supabase.from('mmp_site_entries').select('forwarded_to_user_id, status').in('forwarded_to_user_id', uniqueUserIds).in('status', ACTIVE_MMP_ENTRY_STATUSES),
        // Fetch other active projects with their team data to calculate cross-project workload
        supabase.from('projects').select('id, name, team').neq('id', project.id).not('status', 'in', '("archived","completed","cancelled")'),
      ]);

      if (svError) console.warn('Error fetching site visits for workload:', svError);
      if (mmpError) console.warn('Error fetching MMP entries for workload:', mmpError);
      if (projError) console.warn('Error fetching cross-project workload:', projError);

      // Field-ops workload (site visits + MMP)
      const MAX_CAPACITY = 10;
      const workloads: Record<string, number> = {};
      uniqueUserIds.forEach(userId => {
        const svCount = (siteVisits || []).filter(sv => sv.assigned_to === userId).length;
        const mmpCount = (mmpEntries || []).filter(e => e.forwarded_to_user_id === userId).length;
        workloads[userId] = Math.min(100, Math.round(((svCount + mmpCount) / MAX_CAPACITY) * 100));
      });
      setUserWorkloads(workloads);

      // Cross-project workload: count other active projects each member is on
      const counts: Record<string, number> = {};
      const names: Record<string, string[]> = {};
      uniqueUserIds.forEach(uid => { counts[uid] = 0; names[uid] = []; });
      (otherProjects || []).forEach((proj: any) => {
        const composition: Array<{ userId: string }> = proj.team?.teamComposition || [];
        composition.forEach(m => {
          if (uniqueUserIds.includes(m.userId)) {
            counts[m.userId] = (counts[m.userId] || 0) + 1;
            names[m.userId] = [...(names[m.userId] || []), proj.name];
          }
        });
      });
      setCrossProjectCounts(counts);
      setCrossProjectNames(names);

      if (Object.keys(workloads).length > 0) {
        setTeamMembers(prev => {
          const updated = prev.map(member => ({ ...member, workload: workloads[member.userId] ?? member.workload ?? 0 }));
          const hasChanges = updated.some((m, i) => m.workload !== prev[i]?.workload);
          return hasChanges ? updated : prev;
        });
      }
    } catch (error) {
      console.error('Error calculating workloads:', error);
    }
  }, [teamMemberIds, userIdList, project.id]);

  useEffect(() => {
    fetchUserWorkloads();
  }, [fetchUserWorkloads]);

  const getWorkload = (userId: string): number => userWorkloads[userId] ?? 0;

  const filteredUsers = users.filter(user => {
    const isAlreadyTeamMember = teamMembers.some(member => member.userId === user.id);
    const q = searchTerm.toLowerCase();
    const matchesSearch = !q ||
      (user.name || '').toLowerCase().includes(q) ||
      (user.email || '').toLowerCase().includes(q) ||
      (user.role || '').toLowerCase().includes(q);
    return !isAlreadyTeamMember && matchesSearch;
  });

  const resetFeeFields = () => {
    setMemberType('internal');
    setFeeType('');
    setRate('');
    setPlannedHours('');
    setFeeCurrency('SDG');
    setPaymentDueDate('');
    setSelectedRole('dataCollector');
    setSearchTerm('');
  };

  const openEditFee = (member: ProjectTeamMember) => {
    setEditFeeUserId(member.userId);
    setEditFeeType(member.feeType || '');
    setEditRate(member.rate?.toString() || '');
    setEditHours(member.plannedHours?.toString() || '');
    setEditCurrency(member.currency || 'SDG');
    setEditDueDate(member.paymentDueDate || '');
    setEditScheduleType(member.paymentScheduleType || 'lump_sum');
    setEditInstallmentCount(member.installmentCount?.toString() || '3');
    setEditPaymentStartDate(member.paymentStartDate || '');
    setEditInstallments(member.installments || []);
    setEditAmountPaid(member.amountPaid?.toString() || '');
    setEditPayStatus(member.paymentStatus || 'unpaid');
    setShowInstallments((member.installments?.length || 0) > 0);
    setEditFeeOpen(true);
  };

  const handleAutoGenerateInstallments = () => {
    const feeType = editFeeType as TeamFeeType;
    const rateVal = parseFloat(editRate || '0');
    const hoursVal = parseFloat(editHours || '0');
    const total = feeType === 'per_hour' ? rateVal * hoursVal
                : feeType === 'fixed_fee' ? rateVal
                : (project.budget?.total || 0) * (rateVal / 100);
    const count = parseInt(editInstallmentCount || '1', 10);
    if (!total || !count || !editPaymentStartDate) return;
    const generated = generateInstallmentSchedule(total, count, editScheduleType, editPaymentStartDate);
    setEditInstallments(generated);
    setShowInstallments(true);
  };

  const handleInstallmentStatusToggle = (id: string) => {
    setEditInstallments(prev => prev.map(inst =>
      inst.id === id
        ? { ...inst, status: inst.status === 'paid' ? 'pending' : 'paid', paidDate: inst.status !== 'paid' ? new Date().toISOString().split('T')[0] : undefined }
        : inst
    ));
  };

  const handleInstallmentDateChange = (id: string, date: string) => {
    setEditInstallments(prev => prev.map(inst => inst.id === id ? { ...inst, dueDate: date } : inst));
  };

  const handleInstallmentAmountChange = (id: string, amount: string) => {
    setEditInstallments(prev => prev.map(inst => inst.id === id ? { ...inst, amount: parseFloat(amount) || inst.amount } : inst));
  };

  const handleInstallmentLabelChange = (id: string, label: string) => {
    setEditInstallments(prev => prev.map(inst => inst.id === id ? { ...inst, label } : inst));
  };

  const handleSaveEditFee = () => {
    if (!editFeeUserId) return;
    const hasInstallments = editInstallments.length > 0 && editScheduleType !== 'lump_sum';
    const derivedStatus  = hasInstallments ? derivePaymentStatus(editInstallments) : editPayStatus;
    const derivedPaid    = hasInstallments ? totalPaidFromInstallments(editInstallments) : parseFloat(editAmountPaid || '0');
    const updatedTeam = teamMembers.map(m => {
      if (m.userId !== editFeeUserId) return m;
      return {
        ...m,
        feeType:             editFeeType || undefined,
        rate:                editFeeType && editRate ? parseFloat(editRate) : undefined,
        plannedHours:        editFeeType === 'per_hour' && editHours ? parseFloat(editHours) : undefined,
        currency:            editFeeType ? editCurrency : undefined,
        paymentDueDate:      editFeeType && editDueDate ? editDueDate : undefined,
        paymentScheduleType: editFeeType && editScheduleType !== 'lump_sum' ? editScheduleType : undefined,
        paymentStartDate:    editFeeType && editPaymentStartDate ? editPaymentStartDate : undefined,
        installmentCount:    editFeeType && editScheduleType !== 'lump_sum' ? parseInt(editInstallmentCount || '1', 10) : undefined,
        installments:        editFeeType && hasInstallments ? editInstallments : undefined,
        paymentStatus:       editFeeType ? derivedStatus : undefined,
        amountPaid:          editFeeType ? derivedPaid : undefined,
      };
    });
    setTeamMembers(updatedTeam);
    onTeamChange(updatedTeam);
    setEditFeeOpen(false);
    toast({ title: 'Fee updated', description: 'Professional fee and payment schedule saved.', variant: 'success' });
  };

  const handleAddExternalMember = () => {
    if (!extName.trim()) { toast({ title: 'Name required', description: 'Please enter the person\'s name.', variant: 'destructive' }); return; }
    const token = crypto.randomUUID().replace(/-/g, '');
    const newMember: ProjectTeamMember = {
      userId:       crypto.randomUUID(),
      name:         extName.trim(),
      role:         extRole,
      joinedAt:     new Date().toISOString(),
      memberType:   'external',
      email:        extEmail.trim() || undefined,
      organization: extOrg.trim() || undefined,
      accessToken:  token,
      feeType:      feeType || undefined,
      rate:         feeType && rate ? parseFloat(rate) : undefined,
      plannedHours: feeType === 'per_hour' && plannedHours ? parseFloat(plannedHours) : undefined,
      currency:     feeType ? feeCurrency : undefined,
      paymentStatus: feeType ? 'unpaid' : undefined,
      amountPaid:   feeType ? 0 : undefined,
    };
    const updatedTeam = [...teamMembers, newMember];
    setTeamMembers(updatedTeam);
    onTeamChange(updatedTeam);
    setDialogOpen(false);
    setAddMode('system');
    setExtName(''); setExtEmail(''); setExtOrg(''); resetFeeFields();
    toast({
      title: 'External member added',
      description: `${extName} added. Share their portal link so they can view tasks.`,
      variant: 'success',
    });
  };

  const copyExternalLink = async (token: string, name: string) => {
    const url = `${window.location.origin}/ext/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
    toast({ title: 'Link copied', description: `Portal link for ${name} is in your clipboard.`, variant: 'success' });
  };

  const handleAddTeamMember = (user: User) => {
    const newMember: ProjectTeamMember = {
      userId: user.id,
      name: user.name,
      role: selectedRole,
      joinedAt: new Date().toISOString(),
      workload: user.performance?.currentWorkload || getWorkload(user.id),
      memberType,
      feeType: feeType || undefined,
      rate: feeType && rate ? parseFloat(rate) : undefined,
      plannedHours: feeType === 'per_hour' && plannedHours ? parseFloat(plannedHours) : undefined,
      currency: feeType ? feeCurrency : undefined,
      paymentDueDate: feeType && paymentDueDate ? paymentDueDate : undefined,
      paymentStatus: feeType ? 'unpaid' : undefined,
      amountPaid: feeType ? 0 : undefined,
    };

    const updatedTeam = [...teamMembers, newMember];
    setTeamMembers(updatedTeam);
    onTeamChange(updatedTeam);
    setDialogOpen(false);
    resetFeeFields();

    const totalCost = calcMemberTotalCost(newMember, project.budget?.total);
    toast({
      title: 'Team member added',
      description: feeType
        ? `${user.name} added as ${selectedRole}. Fee: ${fmtMoney(totalCost, feeCurrency)}`
        : `${user.name} has been added as ${selectedRole}.`,
      variant: 'success',
    });
  };

  const handleRemoveTeamMember = (userId: string) => {
    const removedMember = teamMembers.find(member => member.userId === userId);
    const updatedTeam = teamMembers.filter(member => member.userId !== userId);
    setTeamMembers(updatedTeam);
    onTeamChange(updatedTeam);
    toast({
      title: 'Team member removed',
      description: removedMember ? `${removedMember.name} has been removed.` : 'Team member removed.',
      variant: 'default',
    });
  };

  const handleRoleChange = (userId: string, role: ProjectRole) => {
    const member = teamMembers.find(m => m.userId === userId);
    const updatedTeam = teamMembers.map(m => m.userId === userId ? { ...m, role } : m);
    setTeamMembers(updatedTeam);
    onTeamChange(updatedTeam);
    if (member) {
      toast({ title: 'Role updated', description: `${member.name}'s role changed to ${role}.`, variant: 'success' });
    }
  };

  const handlePaymentStatusChange = (userId: string, paymentStatus: 'unpaid' | 'partially_paid' | 'paid') => {
    const updatedTeam = teamMembers.map(m => m.userId === userId ? { ...m, paymentStatus } : m);
    setTeamMembers(updatedTeam);
    onTeamChange(updatedTeam);
  };

  const getWorkloadColor = (workload?: number): string => {
    if (!workload) return 'bg-gray-200';
    if (workload < 30) return 'bg-green-500';
    if (workload < 70) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const membersWithFees = teamMembers.filter(m => m.feeType);
  const totalProfessionalFees = membersWithFees.reduce(
    (s, m) => s + calcMemberTotalCost(m, project.budget?.total), 0,
  );

  return (
    <Card className="mt-8">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Team Composition</CardTitle>
          <CardDescription>Assign team members and roles for this project</CardDescription>
        </div>
        <Button type="button" onClick={() => { resetFeeFields(); setDialogOpen(true); }}>
          <UserPlus className="h-4 w-4 mr-2" /> Add Team Member
        </Button>
      </CardHeader>

      <CardContent>
        {/* Professional fees summary banner */}
        {membersWithFees.length > 0 && (
          <div className="mb-4 p-3 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 flex items-center gap-3">
            <DollarSign className="h-4 w-4 text-violet-600 shrink-0" />
            <div className="flex-1 text-sm">
              <span className="font-medium text-violet-700 dark:text-violet-300">Professional Fees: </span>
              <span className="text-violet-600">{fmtMoney(totalProfessionalFees, membersWithFees[0]?.currency || 'SDG')}</span>
              <span className="text-violet-500 ml-2 text-xs">across {membersWithFees.length} member{membersWithFees.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        )}

        {teamMembers.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Fee</TableHead>
                  <TableHead className="w-[180px] text-right">Workload</TableHead>
                  <TableHead className="w-[80px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamMembers.map((member) => {
                  const totalCost = calcMemberTotalCost(member, project.budget?.total);
                  return (
                    <TableRow key={member.userId}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${member.name}`} alt={member.name} />
                            <AvatarFallback>{member.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-sm">{member.name}</p>
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 ${member.memberType === 'external' ? 'border-violet-200 text-violet-700 bg-violet-50' : 'border-blue-200 text-blue-700 bg-blue-50'}`}
                            >
                              {member.memberType === 'external' ? 'External' : 'Internal'}
                            </Badge>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select value={member.role} onValueChange={(value) => handleRoleChange(member.userId, value as ProjectRole)}>
                          <SelectTrigger className="w-[150px]">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="projectManager">Project Manager</SelectItem>
                            <SelectItem value="fieldAssistant">Field Assistant</SelectItem>
                            <SelectItem value="dataCollector">Data Collector</SelectItem>
                            <SelectItem value="supervisor">Supervisor</SelectItem>
                            <SelectItem value="coordinator">Coordinator</SelectItem>
                            <SelectItem value="analyst">Analyst</SelectItem>
                            <SelectItem value="reviewer">Reviewer</SelectItem>
                            <SelectItem value="consultant">Consultant</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-start gap-1.5 group">
                          <div className="flex-1">
                            {member.feeType ? (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1 text-xs font-medium">
                                  {member.feeType === 'per_hour' && <Clock className="h-3 w-3 text-blue-500" />}
                                  {member.feeType === 'fixed_fee' && <DollarSign className="h-3 w-3 text-green-500" />}
                                  {member.feeType === 'percent_budget' && <Percent className="h-3 w-3 text-violet-500" />}
                                  <span className="font-semibold">{fmtMoney(totalCost, member.currency)}</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground">{FEE_LABELS[member.feeType]}</p>
                                <Select
                                  value={member.paymentStatus || 'unpaid'}
                                  onValueChange={v => handlePaymentStatusChange(member.userId, v as any)}
                                >
                                  <SelectTrigger className="h-6 text-[11px] w-[110px] px-2">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="unpaid">Unpaid</SelectItem>
                                    <SelectItem value="partially_paid">Partial</SelectItem>
                                    <SelectItem value="paid">Paid</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">No fee</span>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
                            onClick={() => openEditFee(member)}
                            title="Edit fee"
                            data-testid={`button-edit-fee-${member.userId}`}
                          >
                            <Plus className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <TooltipProvider>
                          <div className="flex flex-col items-end gap-1">
                            {/* Field-ops workload bar */}
                            <div className="flex items-center gap-1.5 w-full justify-end">
                              <span className="text-[10px] text-muted-foreground shrink-0">Field ops</span>
                              <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden shrink-0">
                                <div className={`h-full ${getWorkloadColor(member.workload)}`} style={{ width: `${member.workload || 0}%` }} />
                              </div>
                              <span className="text-xs font-medium w-8 text-right tabular-nums">{member.workload || 0}%</span>
                            </div>
                            {/* Cross-project badge */}
                            {(() => {
                              const count = crossProjectCounts[member.userId] || 0;
                              const projNames = crossProjectNames[member.userId] || [];
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border cursor-default ${
                                      count === 0
                                        ? 'text-muted-foreground border-border bg-muted/40'
                                        : count <= 2
                                        ? 'text-amber-700 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-700'
                                        : 'text-red-700 border-red-200 bg-red-50 dark:bg-red-900/20 dark:text-red-300 dark:border-red-700'
                                    }`}>
                                      <Briefcase className="h-2.5 w-2.5 shrink-0" />
                                      <span>{count} other project{count !== 1 ? 's' : ''}</span>
                                    </div>
                                  </TooltipTrigger>
                                  {count > 0 && (
                                    <TooltipContent side="left" className="max-w-56">
                                      <p className="font-medium text-xs mb-1">Also assigned to:</p>
                                      <ul className="space-y-0.5">
                                        {projNames.map((n, i) => (
                                          <li key={i} className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Briefcase className="h-3 w-3 shrink-0" />{n}
                                          </li>
                                        ))}
                                      </ul>
                                    </TooltipContent>
                                  )}
                                </Tooltip>
                              );
                            })()}
                          </div>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Copy portal link for external members */}
                          {member.accessToken && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() => copyExternalLink(member.accessToken!, member.name)}
                                    data-testid={`button-copy-portal-link-${member.userId}`}
                                  >
                                    {copiedToken === member.accessToken
                                      ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                      : <Link2 className="h-4 w-4 text-blue-500" />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="text-xs">
                                  {copiedToken === member.accessToken ? 'Copied!' : 'Copy portal link'}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleRemoveTeamMember(member.userId)}>
                            <UserMinus className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 border border-dashed rounded-lg">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-sm">No team members assigned yet</p>
            <Button type="button" className="mt-4" onClick={() => { resetFeeFields(); setDialogOpen(true); }}>
              <UserPlus className="h-4 w-4 mr-2" /> Add Team Member
            </Button>
          </div>
        )}

        {/* ── Edit / Set Professional Fee Dialog ─────────────────── */}
        <Dialog open={editFeeOpen} onOpenChange={v => setEditFeeOpen(v)}>
          <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-violet-500" />
                {editFeeType ? 'Edit' : 'Set'} Professional Fee —{' '}
                {teamMembers.find(m => m.userId === editFeeUserId)?.name}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5 py-1">
              {/* ── Row 1: Fee type + currency ──────────────────────── */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Fee Basis</Label>
                  <Select value={editFeeType || '__none__'} onValueChange={v => setEditFeeType(v === '__none__' ? '' : v as TeamFeeType)}>
                    <SelectTrigger><SelectValue placeholder="None (no fee)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None (no fee)</SelectItem>
                      <SelectItem value="per_hour">Per Hour</SelectItem>
                      <SelectItem value="fixed_fee">Fixed Fee (lump sum)</SelectItem>
                      <SelectItem value="percent_budget">% of Project Budget</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editFeeType && editFeeType !== 'percent_budget' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Currency</Label>
                    <Select value={editCurrency} onValueChange={setEditCurrency}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SDG">SDG — Sudanese Pound</SelectItem>
                        <SelectItem value="USD">USD — US Dollar</SelectItem>
                        <SelectItem value="EUR">EUR — Euro</SelectItem>
                        <SelectItem value="GBP">GBP — British Pound</SelectItem>
                        <SelectItem value="SAR">SAR — Saudi Riyal</SelectItem>
                        <SelectItem value="AED">AED — UAE Dirham</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* ── Row 2: Rate / hours / due date ──────────────────── */}
              {editFeeType && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      {editFeeType === 'per_hour' ? 'Hourly Rate' : editFeeType === 'percent_budget' ? '% of Budget' : 'Fixed Amount'}
                    </Label>
                    <Input type="number" min="0" step="0.01" value={editRate} onChange={e => setEditRate(e.target.value)}
                      placeholder={editFeeType === 'percent_budget' ? 'e.g. 5' : '0.00'} />
                  </div>
                  {editFeeType === 'per_hour' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Planned Hours</Label>
                      <Input type="number" min="0" value={editHours} onChange={e => setEditHours(e.target.value)} placeholder="e.g. 40" />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Single Payment Due Date</Label>
                    <Input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} />
                  </div>
                </div>
              )}

              {/* ── Estimated total banner ───────────────────────────── */}
              {editFeeType && editRate && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                  <DollarSign className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="text-xs text-muted-foreground">Estimated total fee:</span>
                  <span className="font-bold text-emerald-700 text-sm">
                    {fmtMoney(
                      editFeeType === 'per_hour' ? parseFloat(editRate || '0') * parseFloat(editHours || '0')
                        : editFeeType === 'fixed_fee' ? parseFloat(editRate || '0')
                        : (project.budget?.total || 0) * (parseFloat(editRate || '0') / 100),
                      editFeeType === 'percent_budget' ? (project.budget?.currency || 'SDG') : editCurrency,
                    )}
                  </span>
                </div>
              )}

              {/* ── Payment schedule section ─────────────────────────── */}
              {editFeeType && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5" /> Payment Schedule
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Schedule Type</Label>
                      <Select value={editScheduleType} onValueChange={v => setEditScheduleType(v as PaymentScheduleType)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lump_sum">Lump Sum (one payment)</SelectItem>
                          <SelectItem value="monthly">Monthly installments</SelectItem>
                          <SelectItem value="quarterly">Quarterly (every 3 months)</SelectItem>
                          <SelectItem value="bi_weekly">Bi-weekly (every 2 weeks)</SelectItem>
                          <SelectItem value="fixed_dates">Custom fixed dates</SelectItem>
                          <SelectItem value="milestone">Milestone-based</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {editScheduleType !== 'lump_sum' && (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Number of Installments</Label>
                        <Input type="number" min="2" max="36" value={editInstallmentCount}
                          onChange={e => setEditInstallmentCount(e.target.value)} placeholder="e.g. 3" />
                      </div>
                    )}
                  </div>

                  {editScheduleType !== 'lump_sum' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">First Payment Date</Label>
                        <Input type="date" value={editPaymentStartDate}
                          onChange={e => setEditPaymentStartDate(e.target.value)} />
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full gap-1.5"
                          onClick={handleAutoGenerateInstallments}
                          disabled={!editRate || !editPaymentStartDate}
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Auto-generate Schedule
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Lump sum: simple paid / unpaid fields */}
                  {editScheduleType === 'lump_sum' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Amount Already Paid</Label>
                        <Input type="number" min="0" step="0.01" value={editAmountPaid}
                          onChange={e => setEditAmountPaid(e.target.value)} placeholder="0.00" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Payment Status</Label>
                        <Select value={editPayStatus} onValueChange={v => setEditPayStatus(v as typeof editPayStatus)}>
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

                  {/* Installment list ─────────────────────────────────── */}
                  {editInstallments.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          onClick={() => setShowInstallments(!showInstallments)}
                        >
                          {showInstallments ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          {editInstallments.length} installments
                          ({editInstallments.filter(i => i.status === 'paid').length} paid)
                        </button>
                        <span className="text-xs text-muted-foreground">
                          Click row to mark paid / unpaid
                        </span>
                      </div>

                      {showInstallments && (
                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                          {editInstallments.map((inst, idx) => (
                            <div key={inst.id} className={`flex items-center gap-2 p-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                              inst.status === 'paid' ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20' : 'bg-background border-border hover:bg-muted/40'
                            }`}>
                              <button type="button" onClick={() => handleInstallmentStatusToggle(inst.id)} className="shrink-0">
                                {inst.status === 'paid'
                                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                  : <div className="h-4 w-4 rounded-full border-2 border-muted-foreground" />}
                              </button>
                              <Input
                                className="h-6 text-xs px-1.5 flex-1 min-w-0"
                                value={inst.label}
                                onChange={e => handleInstallmentLabelChange(inst.id, e.target.value)}
                                onClick={e => e.stopPropagation()}
                              />
                              <Input
                                type="date"
                                className="h-6 text-xs px-1.5 w-32 shrink-0"
                                value={inst.dueDate}
                                onChange={e => handleInstallmentDateChange(inst.id, e.target.value)}
                                onClick={e => e.stopPropagation()}
                              />
                              <Input
                                type="number"
                                className="h-6 text-xs px-1.5 w-24 shrink-0 text-right"
                                value={inst.amount}
                                onChange={e => handleInstallmentAmountChange(inst.id, e.target.value)}
                                onClick={e => e.stopPropagation()}
                              />
                              <span className="text-[10px] text-muted-foreground shrink-0">{editFeeType !== 'percent_budget' ? editCurrency : project.budget?.currency || 'SDG'}</span>
                              <button type="button" onClick={() => setEditInstallments(prev => prev.filter(i => i.id !== inst.id))} className="shrink-0 text-muted-foreground hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                          {/* Add manual installment */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs h-7 border-dashed border"
                            onClick={() => setEditInstallments(prev => [...prev, {
                              id: crypto.randomUUID(), label: `Installment ${prev.length + 1}`,
                              dueDate: '', amount: 0, status: 'pending',
                            }])}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Add Installment
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => setEditFeeOpen(false)}>Cancel</Button>
              <Button type="button" onClick={handleSaveEditFee}>
                <DollarSign className="h-4 w-4 mr-1.5" /> Save Fee & Schedule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Member Dialog */}
        <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) { resetFeeFields(); setAddMode('system'); setExtName(''); setExtEmail(''); setExtOrg(''); } }}>
          <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Team Member</DialogTitle>
            </DialogHeader>

            {/* ── Mode toggle ─────────────────────────────────────────── */}
            <div className="flex gap-1 p-1 rounded-lg bg-muted w-fit">
              <button
                onClick={() => setAddMode('system')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  addMode === 'system' ? 'bg-white dark:bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Users className="h-4 w-4" /> System User
              </button>
              <button
                onClick={() => setAddMode('external')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  addMode === 'external' ? 'bg-white dark:bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Globe className="h-4 w-4" /> External Person
              </button>
            </div>

            {/* ── SYSTEM USER MODE ────────────────────────────────────── */}
            {addMode === 'system' && (
              <div className="space-y-4">
                {/* Search + role */}
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Input
                      placeholder="Search by name, email or role..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as ProjectRole)}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="projectManager">Project Manager</SelectItem>
                      <SelectItem value="fieldAssistant">Field Assistant</SelectItem>
                      <SelectItem value="dataCollector">Data Collector</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                      <SelectItem value="coordinator">Coordinator</SelectItem>
                      <SelectItem value="analyst">Analyst</SelectItem>
                      <SelectItem value="reviewer">Reviewer</SelectItem>
                      <SelectItem value="consultant">Consultant</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Fee configuration */}
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-violet-500" />
                    Professional Fee (optional)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Member Type</Label>
                      <Select value={memberType} onValueChange={v => setMemberType(v as TeamMemberType)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="internal">Internal (Staff)</SelectItem>
                          <SelectItem value="external">External / Consultant</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Fee Type</Label>
                      <Select value={feeType || '__none__'} onValueChange={v => setFeeType(v === '__none__' ? '' : v as TeamFeeType)}>
                        <SelectTrigger><SelectValue placeholder="None (no fee)" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None (no fee)</SelectItem>
                          <SelectItem value="per_hour">Per Hour</SelectItem>
                          <SelectItem value="fixed_fee">Fixed Fee (lump sum)</SelectItem>
                          <SelectItem value="percent_budget">% of Project Budget</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {feeType && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">
                          {feeType === 'per_hour' ? 'Hourly Rate' : feeType === 'percent_budget' ? '% of Budget' : 'Fixed Amount'}
                        </Label>
                        <Input type="number" min="0" step="0.01" placeholder={feeType === 'percent_budget' ? 'e.g. 5' : '0.00'} value={rate} onChange={e => setRate(e.target.value)} />
                      </div>
                      {feeType === 'per_hour' && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">Planned Hours</Label>
                          <Input type="number" min="0" placeholder="e.g. 40" value={plannedHours} onChange={e => setPlannedHours(e.target.value)} />
                        </div>
                      )}
                      {feeType !== 'percent_budget' && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">Currency</Label>
                          <Select value={feeCurrency} onValueChange={setFeeCurrency}>
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
                      <div className="space-y-1.5">
                        <Label className="text-xs">Payment Due Date</Label>
                        <Input type="date" value={paymentDueDate} onChange={e => setPaymentDueDate(e.target.value)} />
                      </div>
                    </div>
                  )}
                  {feeType && rate && (
                    <div className="flex items-center gap-2 p-2.5 rounded-md bg-background border text-sm">
                      <DollarSign className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span className="text-muted-foreground">Estimated total:</span>
                      <span className="font-bold text-emerald-600">
                        {fmtMoney(
                          feeType === 'per_hour' ? parseFloat(rate || '0') * parseFloat(plannedHours || '0')
                            : feeType === 'fixed_fee' ? parseFloat(rate || '0')
                            : (project.budget?.total || 0) * (parseFloat(rate || '0') / 100),
                          feeType === 'percent_budget' ? (project.budget?.currency || 'SDG') : feeCurrency,
                        )}
                      </span>
                    </div>
                  )}
                </div>

                {/* User list */}
                <div className="border rounded-md overflow-hidden max-h-[260px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>System Role</TableHead>
                        <TableHead className="w-[180px] text-right">Workload</TableHead>
                        <TableHead className="w-[80px] text-right">Add</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.length > 0 ? (
                        filteredUsers.map((user) => {
                          const workload = user.performance?.currentWorkload || getWorkload(user.id);
                          return (
                            <TableRow key={user.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-7 w-7">
                                    <AvatarImage src={user.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${user.name}`} alt={user.name} />
                                    <AvatarFallback>{user.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <p className="font-medium text-sm">{user.name}</p>
                                    <p className="text-xs text-muted-foreground">{user.email}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{user.role}</TableCell>
                              <TableCell className="text-right">
                                <TooltipProvider>
                                  <div className="flex flex-col items-end gap-1">
                                    <div className="flex items-center gap-1.5 justify-end">
                                      <span className="text-[10px] text-muted-foreground shrink-0">Field ops</span>
                                      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden shrink-0">
                                        <div className={`h-full ${getWorkloadColor(workload)}`} style={{ width: `${workload}%` }} />
                                      </div>
                                      <span className="text-xs text-muted-foreground tabular-nums">{workload}%</span>
                                    </div>
                                    {(() => {
                                      const count = crossProjectCounts[user.id] || 0;
                                      const projNames = crossProjectNames[user.id] || [];
                                      return (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border cursor-default ${
                                              count === 0 ? 'text-muted-foreground border-border bg-muted/40'
                                                : count <= 2 ? 'text-amber-700 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-700'
                                                : 'text-red-700 border-red-200 bg-red-50 dark:bg-red-900/20 dark:text-red-300 dark:border-red-700'
                                            }`}>
                                              <Briefcase className="h-2.5 w-2.5 shrink-0" />
                                              <span>{count} other project{count !== 1 ? 's' : ''}</span>
                                            </div>
                                          </TooltipTrigger>
                                          {count > 0 && (
                                            <TooltipContent side="left" className="max-w-56">
                                              <p className="font-medium text-xs mb-1">Also on:</p>
                                              <ul className="space-y-0.5">
                                                {projNames.map((n, i) => (
                                                  <li key={i} className="text-xs text-muted-foreground flex items-center gap-1">
                                                    <Briefcase className="h-3 w-3 shrink-0" />{n}
                                                  </li>
                                                ))}
                                              </ul>
                                            </TooltipContent>
                                          )}
                                        </Tooltip>
                                      );
                                    })()}
                                  </div>
                                </TooltipProvider>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button type="button" size="sm" onClick={() => handleAddTeamMember(user)}>
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-4 text-muted-foreground text-sm">
                            No users found matching your search
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* ── EXTERNAL PERSON MODE ─────────────────────────────────── */}
            {addMode === 'external' && (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300 flex gap-2">
                  <Globe className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>External members don't need a system account. They'll get a unique portal link to view assigned activities and update their progress.</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-xs font-medium">Full Name <span className="text-destructive">*</span></Label>
                    <Input placeholder="e.g. Dr. Ahmed Hassan" value={extName} onChange={e => setExtName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Email (optional)</Label>
                    <Input type="email" placeholder="ahmed@org.org" value={extEmail} onChange={e => setExtEmail(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Organization (optional)</Label>
                    <Input placeholder="e.g. WHO, UNICEF, independent" value={extOrg} onChange={e => setExtOrg(e.target.value)} />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-xs font-medium">Project Role</Label>
                    <Select value={extRole} onValueChange={v => setExtRole(v as ProjectRole)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="consultant">Consultant</SelectItem>
                        <SelectItem value="reviewer">Reviewer</SelectItem>
                        <SelectItem value="analyst">Analyst</SelectItem>
                        <SelectItem value="fieldAssistant">Field Assistant</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Optional fee for external */}
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-violet-500" /> Professional Fee (optional)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Fee Type</Label>
                      <Select value={feeType || '__none__'} onValueChange={v => setFeeType(v === '__none__' ? '' : v as TeamFeeType)}>
                        <SelectTrigger><SelectValue placeholder="None (no fee)" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None (no fee)</SelectItem>
                          <SelectItem value="per_hour">Per Hour</SelectItem>
                          <SelectItem value="fixed_fee">Fixed Fee (lump sum)</SelectItem>
                          <SelectItem value="percent_budget">% of Project Budget</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {feeType && feeType !== 'percent_budget' && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Currency</Label>
                        <Select value={feeCurrency} onValueChange={setFeeCurrency}>
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
                  {feeType && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">
                          {feeType === 'per_hour' ? 'Hourly Rate' : feeType === 'percent_budget' ? '% of Budget' : 'Fixed Amount'}
                        </Label>
                        <Input type="number" min="0" step="0.01" placeholder="0.00" value={rate} onChange={e => setRate(e.target.value)} />
                      </div>
                      {feeType === 'per_hour' && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">Planned Hours</Label>
                          <Input type="number" min="0" placeholder="e.g. 40" value={plannedHours} onChange={e => setPlannedHours(e.target.value)} />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 border text-xs text-muted-foreground">
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                  After adding, copy their portal link from the team table so they can access their activities without logging in.
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setAddMode('system'); setExtName(''); setExtEmail(''); setExtOrg(''); resetFeeFields(); }}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={handleAddExternalMember} disabled={!extName.trim()}>
                    <Globe className="h-4 w-4 mr-1.5" /> Add External Member
                  </Button>
                </DialogFooter>
              </div>
            )}

            {addMode === 'system' && (
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetFeeFields(); }}>
                  Cancel
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
