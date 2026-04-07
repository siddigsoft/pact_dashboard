import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  format, parseISO, isValid, differenceInCalendarDays,
  startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  addMonths, subMonths, isToday,
} from 'date-fns';
import {
  CalendarOff, Plus, CheckCircle2, XCircle, Clock, Loader2,
  RefreshCw, User, CalendarDays, MessageSquare, Filter,
  AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, List,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { cn } from '@/lib/utils';

interface LeaveRequest {
  id: string;
  user_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  created_at: string;
  user_name?: string;
  reviewer_name?: string;
}

const LEAVE_TYPES = [
  { value: 'annual',    label: 'Annual Leave',    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40' },
  { value: 'sick',      label: 'Sick Leave',      color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40' },
  { value: 'unpaid',    label: 'Unpaid Leave',    color: 'bg-gray-100 text-gray-700 dark:bg-gray-800' },
  { value: 'emergency', label: 'Emergency Leave', color: 'bg-red-100 text-red-700 dark:bg-red-900/40' },
  { value: 'maternity', label: 'Maternity Leave', color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40' },
  { value: 'paternity', label: 'Paternity Leave', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40' },
  { value: 'other',     label: 'Other',           color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40' },
];

const STATUS_CFG: Record<string, { label: string; badge: string; icon: React.ReactNode }> = {
  pending:   { label: 'Pending',   badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40',   icon: <Clock className="h-3.5 w-3.5" /> },
  approved:  { label: 'Approved',  badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  rejected:  { label: 'Rejected',  badge: 'bg-red-100 text-red-700 dark:bg-red-900/40',          icon: <XCircle className="h-3.5 w-3.5" /> },
  cancelled: { label: 'Cancelled', badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800',           icon: <XCircle className="h-3.5 w-3.5" /> },
};

const BLANK = { leave_type: 'annual', start_date: '', end_date: '', reason: '' };

function calcDays(start: string, end: string): number {
  if (!start || !end) return 0;
  try {
    const s = parseISO(start);
    const e = parseISO(end);
    if (!isValid(s) || !isValid(e)) return 0;
    const diff = differenceInCalendarDays(e, s) + 1;
    return diff > 0 ? diff : 0;
  } catch { return 0; }
}

export default function LeaveRequests() {
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const { hasAnyRole } = useAuthorization();
  const isAdmin = hasAnyRole(['super_admin', 'admin', 'hr']);

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [calMonth, setCalMonth] = useState(() => startOfMonth(new Date()));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reviewDialog, setReviewDialog] = useState<LeaveRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected'>('approved');
  const [reviewNotes, setReviewNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...BLANK });

  const load = async () => {
    setLoading(true);
    const query = isAdmin
      ? supabase.from('leave_requests').select('*').order('created_at', { ascending: false })
      : supabase.from('leave_requests').select('*').eq('user_id', currentUser?.id).order('created_at', { ascending: false });

    const { data: reqs } = await query;
    const userIds = [...new Set((reqs || []).map((r: any) => r.user_id).concat((reqs || []).map((r: any) => r.reviewed_by).filter(Boolean)))];

    let profileMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
      (profiles || []).forEach((p: any) => { profileMap[p.id] = p.full_name; });
    }

    setRequests((reqs || []).map((r: any) => ({
      ...r,
      user_name: profileMap[r.user_id] || 'Unknown',
      reviewer_name: r.reviewed_by ? profileMap[r.reviewed_by] || null : null,
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, [currentUser?.id]);

  const filtered = useMemo(() => {
    let res = requests;
    if (statusFilter !== 'all') res = res.filter(r => r.status === statusFilter);
    if (typeFilter !== 'all') res = res.filter(r => r.leave_type === typeFilter);
    return res;
  }, [requests, statusFilter, typeFilter]);

  /* ── Calendar: map approved requests to days in calMonth ── */
  const calDays = useMemo(() => {
    const monthStart = startOfMonth(calMonth);
    const monthEnd   = endOfMonth(calMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const approvedReqs = requests.filter(r => r.status === 'approved' || r.status === 'pending');
    return days.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const entries = approvedReqs.filter(r => {
        if (!isValid(parseISO(r.start_date)) || !isValid(parseISO(r.end_date))) return false;
        return r.start_date <= dayStr && r.end_date >= dayStr;
      });
      return { day, entries };
    });
  }, [calMonth, requests]);

  const stats = useMemo(() => ({
    pending:  requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    totalDaysApproved: requests.filter(r => r.status === 'approved').reduce((s, r) => s + (r.days_count || 0), 0),
    myPending: requests.filter(r => r.user_id === currentUser?.id && r.status === 'pending').length,
  }), [requests, currentUser?.id]);

  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submitRequest = async () => {
    if (!form.start_date || !form.end_date) { toast({ title: 'Start and end dates are required', variant: 'destructive' }); return; }
    const days = calcDays(form.start_date, form.end_date);
    if (days <= 0) { toast({ title: 'End date must be after start date', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('leave_requests').insert({
        user_id: currentUser?.id,
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        days_count: days,
        reason: form.reason.trim() || null,
        status: 'pending',
      });
      if (error) throw error;
      toast({ title: 'Leave request submitted', description: `${days} day${days !== 1 ? 's' : ''} of ${LEAVE_TYPES.find(t => t.value === form.leave_type)?.label}` });
      setDialogOpen(false);
      setForm({ ...BLANK });
      load();
    } catch (e: any) {
      toast({ title: 'Error submitting request', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (id: string) => {
    if (!confirm('Cancel this leave request?')) return;
    const { error } = await supabase.from('leave_requests').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id);
    if (error) toast({ title: 'Error cancelling', variant: 'destructive' });
    else { toast({ title: 'Request cancelled' }); load(); }
  };

  const submitReview = async () => {
    if (!reviewDialog) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('leave_requests').update({
        status: reviewAction,
        reviewed_by: currentUser?.id,
        reviewed_at: new Date().toISOString(),
        reviewer_notes: reviewNotes.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', reviewDialog.id);
      if (error) throw error;
      toast({ title: `Request ${reviewAction}`, description: `${reviewDialog.user_name}'s leave has been ${reviewAction}` });
      setReviewDialog(null);
      setReviewNotes('');
      load();
    } catch (e: any) {
      toast({ title: 'Error updating request', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const days = calcDays(form.start_date, form.end_date);
  const leaveTypeCfg = (type: string) => LEAVE_TYPES.find(t => t.value === type) ?? LEAVE_TYPES[0];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0F2041] to-[#1D3461] text-white px-6 py-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <CalendarOff className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Leave Requests</h1>
              <p className="text-blue-200 text-sm">
                {isAdmin ? `${requests.length} request${requests.length !== 1 ? 's' : ''} — ${stats.pending} pending review` : 'Manage your leave applications'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}
              className="border-white/30 text-white hover:bg-white/10">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)} className="bg-white text-[#0F2041] hover:bg-blue-50">
              <Plus className="h-4 w-4 mr-1" />Request Leave
            </Button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          {[
            { label: 'Pending Review', value: stats.pending, color: 'text-amber-300' },
            { label: 'Approved', value: stats.approved, color: 'text-emerald-300' },
            { label: 'Total Days Approved', value: stats.totalDaysApproved, color: 'text-white' },
            { label: isAdmin ? 'Total Requests' : 'My Pending', value: isAdmin ? requests.length : stats.myPending, color: 'text-blue-200' },
          ].map(k => (
            <div key={k.label} className="bg-white/10 rounded-xl p-3 border border-white/10">
              <div className={cn('text-xl font-bold', k.color)}>{k.value}</div>
              <div className="text-blue-200 text-xs mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-6">
        {/* Pending alert for admin */}
        {isAdmin && stats.pending > 0 && (
          <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4 mb-5">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{stats.pending} request{stats.pending !== 1 ? 's' : ''} awaiting your review</p>
              <p className="text-xs text-amber-700/70 dark:text-amber-400/70">Click "Review" on any pending request below to approve or reject</p>
            </div>
          </div>
        )}

        {/* Filters + view toggle */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5 items-start sm:items-center">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44"><Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" /><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(STATUS_CFG).map(([v, c]) => <SelectItem key={v} value={v}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="All leave types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {LEAVE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex border rounded-lg overflow-hidden ml-auto">
            <button type="button" onClick={() => setView('list')}
              className={cn('px-3 py-2 flex items-center gap-1.5 text-xs font-medium transition-colors', view === 'list' ? 'bg-[#0F2041] text-white' : 'bg-background text-muted-foreground hover:bg-muted')}
              data-testid="button-leave-list-view">
              <List className="h-3.5 w-3.5" />List
            </button>
            <button type="button" onClick={() => setView('calendar')}
              className={cn('px-3 py-2 flex items-center gap-1.5 text-xs font-medium transition-colors', view === 'calendar' ? 'bg-[#0F2041] text-white' : 'bg-background text-muted-foreground hover:bg-muted')}
              data-testid="button-leave-calendar-view">
              <CalendarDays className="h-3.5 w-3.5" />Calendar
            </button>
          </div>
        </div>

        {/* ── Calendar view ── */}
        {view === 'calendar' && loading && (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        )}
        {view === 'calendar' && !loading && (
          <div className="bg-card border rounded-2xl overflow-hidden shadow-sm">
            {/* Month navigation */}
            <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
              <button type="button" onClick={() => setCalMonth(m => subMonths(m, 1))}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors" data-testid="button-cal-prev">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-sm">{format(calMonth, 'MMMM yyyy')}</span>
                <button type="button" onClick={() => setCalMonth(startOfMonth(new Date()))}
                  className="text-xs text-[#1D3461] font-medium hover:underline" data-testid="button-cal-today">
                  Today
                </button>
              </div>
              <button type="button" onClick={() => setCalMonth(m => addMonths(m, 1))}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors" data-testid="button-cal-next">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Day-of-week header */}
            <div className="grid grid-cols-7 border-b">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-2 border-r last:border-r-0">
                  {d}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7">
              {/* Leading empty cells */}
              {Array.from({ length: getDay(calDays[0]?.day ?? new Date()) }).map((_, i) => (
                <div key={`pre-${i}`} className="min-h-[80px] border-r border-b bg-muted/10" />
              ))}
              {calDays.map(({ day, entries }) => {
                const today = isToday(day);
                return (
                  <div
                    key={day.toISOString()}
                    className={cn('min-h-[80px] border-r last:border-r-0 border-b p-1.5 relative', today && 'bg-blue-50/60 dark:bg-blue-900/10')}
                  >
                    <span className={cn('inline-flex items-center justify-center text-xs font-semibold w-5 h-5 rounded-full mb-1',
                      today ? 'bg-[#0F2041] text-white' : 'text-muted-foreground')}>
                      {format(day, 'd')}
                    </span>
                    <div className="space-y-0.5">
                      {entries.slice(0, 3).map(req => {
                        const tc = LEAVE_TYPES.find(t => t.value === req.leave_type);
                        const isFirst = req.start_date === format(day, 'yyyy-MM-dd');
                        return (
                          <div
                            key={req.id}
                            className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium truncate leading-tight cursor-default',
                              req.status === 'approved' ? (tc?.color ?? 'bg-blue-100 text-blue-700') : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40'
                            )}
                            title={`${req.user_name || 'You'} — ${tc?.label} (${req.status})`}
                          >
                            {isAdmin ? (isFirst ? (req.user_name?.split(' ')[0] || 'Staff') : '·') : (tc?.label || req.leave_type)}
                          </div>
                        );
                      })}
                      {entries.length > 3 && (
                        <div className="text-[10px] text-muted-foreground px-1">+{entries.length - 3} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
              {/* Trailing empty cells to complete last row */}
              {Array.from({ length: calDays.length > 0 ? (6 - getDay(calDays[calDays.length - 1].day)) : 0 }).map((_, i) => (
                <div key={`post-${i}`} className="min-h-[80px] border-r border-b bg-muted/10" />
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 px-5 py-3 border-t bg-muted/20 flex-wrap">
              {LEAVE_TYPES.filter(t => requests.some(r => r.leave_type === t.value && (r.status === 'approved' || r.status === 'pending'))).map(t => (
                <div key={t.value} className="flex items-center gap-1.5">
                  <span className={cn('w-3 h-3 rounded-sm inline-block', t.color)} />
                  <span className="text-[11px] text-muted-foreground">{t.label}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm inline-block bg-amber-100 dark:bg-amber-900/40" />
                <span className="text-[11px] text-muted-foreground">Pending</span>
              </div>
            </div>
          </div>
        )}

        {/* ── List view ── */}
        {view === 'list' && (loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-muted-foreground">
            <CalendarOff className="h-12 w-12 mb-3 opacity-30" />
            <p className="font-medium">{requests.length === 0 ? 'No leave requests yet' : 'No requests match your filters'}</p>
            {requests.length === 0 && (
              <Button className="mt-4" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />Submit first request
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(req => {
              const stCfg = STATUS_CFG[req.status] ?? STATUS_CFG.pending;
              const typCfg = leaveTypeCfg(req.leave_type);
              const isOwn = req.user_id === currentUser?.id;
              return (
                <div
                  key={req.id}
                  className={cn(
                    'bg-card border rounded-xl p-4 hover:shadow-sm transition-all',
                    req.status === 'pending' && 'border-amber-200 dark:border-amber-800/40',
                    req.status === 'approved' && 'border-emerald-200 dark:border-emerald-800/40',
                    req.status === 'rejected' && 'border-red-200 dark:border-red-800/40',
                  )}
                  data-testid={`leave-request-${req.id}`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        {isAdmin && (
                          <span className="flex items-center gap-1 text-sm font-semibold">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />{req.user_name}
                          </span>
                        )}
                        <Badge className={cn('text-[11px] px-2', typCfg.color)}>{typCfg.label}</Badge>
                        <Badge className={cn('text-[11px] px-2 flex items-center gap-1', stCfg.badge)}>
                          {stCfg.icon}{stCfg.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {isValid(parseISO(req.start_date)) ? format(parseISO(req.start_date), 'dd MMM yyyy') : req.start_date}
                          {' → '}
                          {isValid(parseISO(req.end_date)) ? format(parseISO(req.end_date), 'dd MMM yyyy') : req.end_date}
                        </span>
                        <span className="font-semibold text-foreground">{req.days_count} day{req.days_count !== 1 ? 's' : ''}</span>
                      </div>
                      {req.reason && (
                        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                          <MessageSquare className="h-3 w-3 inline mr-0.5" />{req.reason}
                        </p>
                      )}
                      {req.reviewer_notes && (
                        <div className={cn('mt-2 text-xs rounded-lg px-3 py-2 border', req.status === 'approved' ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/30 text-emerald-800 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30 text-red-800 dark:text-red-300')}>
                          <span className="font-semibold">Reviewer note:</span> {req.reviewer_notes}
                          {req.reviewer_name && <span className="ml-1 opacity-70">— {req.reviewer_name}</span>}
                        </div>
                      )}
                      <p className="text-[11px] text-muted-foreground/60 mt-1.5">
                        Submitted {isValid(parseISO(req.created_at)) ? format(parseISO(req.created_at), 'dd MMM yyyy') : ''}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isAdmin && req.status === 'pending' && (
                        <Button size="sm" onClick={() => { setReviewDialog(req); setReviewAction('approved'); setReviewNotes(''); }}
                          className="bg-[#1D3461] hover:bg-[#0F2041] text-white h-8 text-xs">
                          Review
                        </Button>
                      )}
                      {isOwn && req.status === 'pending' && (
                        <Button size="sm" variant="outline" onClick={() => cancel(req.id)} className="h-8 text-xs text-muted-foreground hover:text-destructive">
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Submit Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarOff className="h-4 w-4 text-[#1D3461]" />Request Leave
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Leave Type</Label>
              <Select value={form.leave_type} onValueChange={v => setF('leave_type', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date *</Label>
                <Input type="date" value={form.start_date} onChange={e => setF('start_date', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>End Date *</Label>
                <Input type="date" value={form.end_date} onChange={e => setF('end_date', e.target.value)} className="mt-1" />
              </div>
            </div>
            {days > 0 && (
              <div className="flex items-center gap-2 bg-[#1D3461]/8 text-[#1D3461] rounded-lg px-3 py-2 text-sm font-medium">
                <CalendarDays className="h-4 w-4" />
                {days} working day{days !== 1 ? 's' : ''} of {leaveTypeCfg(form.leave_type).label}
              </div>
            )}
            <div>
              <Label>Reason / Notes</Label>
              <Textarea
                rows={3}
                value={form.reason}
                onChange={e => setF('reason', e.target.value)}
                placeholder="Provide context or reason for this leave request…"
                className="mt-1 resize-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitRequest} disabled={saving} className="bg-[#1D3461] hover:bg-[#0F2041] text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Dialog (Admin) */}
      <Dialog open={!!reviewDialog} onOpenChange={() => { setReviewDialog(null); setReviewNotes(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Review Leave Request</DialogTitle>
          </DialogHeader>
          {reviewDialog && (
            <div className="space-y-4">
              <div className="bg-muted/40 rounded-xl p-4 space-y-1.5">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">{reviewDialog.user_name}</span>
                  <Badge className={cn('text-[11px]', leaveTypeCfg(reviewDialog.leave_type).color)}>{leaveTypeCfg(reviewDialog.leave_type).label}</Badge>
                </div>
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {isValid(parseISO(reviewDialog.start_date)) ? format(parseISO(reviewDialog.start_date), 'dd MMM') : ''} → {isValid(parseISO(reviewDialog.end_date)) ? format(parseISO(reviewDialog.end_date), 'dd MMM yyyy') : ''}
                  <span className="font-semibold text-foreground">({reviewDialog.days_count} days)</span>
                </div>
                {reviewDialog.reason && (
                  <p className="text-xs text-muted-foreground">{reviewDialog.reason}</p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setReviewAction('approved')}
                  className={cn('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all', reviewAction === 'approved' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'border-border text-muted-foreground hover:border-emerald-300')}
                >
                  <CheckCircle2 className="h-4 w-4" />Approve
                </button>
                <button
                  type="button"
                  onClick={() => setReviewAction('rejected')}
                  className={cn('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all', reviewAction === 'rejected' ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' : 'border-border text-muted-foreground hover:border-red-300')}
                >
                  <XCircle className="h-4 w-4" />Reject
                </button>
              </div>

              <div>
                <Label>Notes <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea
                  rows={3}
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  placeholder={reviewAction === 'approved' ? 'Any conditions or notes for the employee…' : 'Reason for rejection…'}
                  className="mt-1 resize-none"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setReviewDialog(null); setReviewNotes(''); }}>Cancel</Button>
            <Button
              onClick={submitReview}
              disabled={saving}
              className={cn('text-white', reviewAction === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700')}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {reviewAction === 'approved' ? 'Approve Request' : 'Reject Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
