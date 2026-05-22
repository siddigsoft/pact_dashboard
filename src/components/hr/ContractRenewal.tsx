import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format, differenceInDays, parseISO } from 'date-fns';
import { FileText, Send, Check, Clock, AlertTriangle, XCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

type RenewalStatus = 'pending' | 'contacted' | 'renewed' | 'ended';

const STATUS_CFG: Record<RenewalStatus, { label: string; color: string; icon: typeof Check }> = {
  pending:   { label: 'Pending',   color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300', icon: Clock       },
  contacted: { label: 'Contacted', color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300', icon: Send        },
  renewed:   { label: 'Renewed',   color: 'bg-green-100 dark:bg-green-900/40 text-green-700',                 icon: Check       },
  ended:     { label: 'Ended',     color: 'bg-red-100 dark:bg-red-900/40 text-red-700',                       icon: XCircle     },
};

export default function ContractRenewal() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [window_, setWindow_] = useState(90);
  const [statusFilter, setStatusFilter] = useState<'all'|RenewalStatus>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newDates, setNewDates] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['contract-renewals', window_],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const future = new Date(Date.now() + window_ * 86400000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, department_id, contract_type, contract_start_date, contract_end_date, employee_id, renewal_status, phone')
        .eq('is_employee', true)
        .lte('contract_end_date', future)
        .order('contract_end_date');
      return (data ?? []).filter((p: any) => p.contract_end_date >= today || differenceInDays(new Date(), parseISO(p.contract_end_date)) <= 14);
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => contracts.filter((c: any) =>
    statusFilter === 'all' || (c.renewal_status ?? 'pending') === statusFilter
  ), [contracts, statusFilter]);

  const statusCounts = useMemo(() => {
    const out: Record<string, number> = { pending: 0, contacted: 0, renewed: 0, ended: 0 };
    contracts.forEach((c: any) => { out[c.renewal_status ?? 'pending']++; });
    return out;
  }, [contracts]);

  const updateStatus = async (id: string, status: RenewalStatus, newEnd?: string) => {
    const update: any = { renewal_status: status };
    if (newEnd) update.contract_end_date = newEnd;
    await supabase.from('profiles').update(update).eq('id', id);
    qc.invalidateQueries({ queryKey: ['contract-renewals'] });
    toast({ title: 'Status updated', description: `Contract marked as ${status}` });
  };

  const sendReminder = async (c: any) => {
    setSending(s => ({ ...s, [c.id]: true }));
    try {
      await supabase.functions.invoke('dispatch-notification', {
        body: {
          user_id: c.id,
          type: 'contract_expiry_reminder',
          title: 'Contract Renewal Notice',
          message: `Dear ${c.full_name}, your employment contract expires on ${format(parseISO(c.contract_end_date), 'dd MMM yyyy')}. Please coordinate with HR regarding renewal.`,
          channels: ['in_app', 'whatsapp'],
        },
      });
      await updateStatus(c.id, 'contacted');
      toast({ title: 'Reminder sent', description: `WhatsApp + in-app notification sent to ${c.full_name}` });
    } catch {
      toast({ title: 'Send failed', variant: 'destructive' });
    }
    setSending(s => ({ ...s, [c.id]: false }));
  };

  const getDaysLabel = (endDate: string) => {
    const days = differenceInDays(parseISO(endDate), new Date());
    if (days < 0)  return { label: `Expired ${Math.abs(days)}d ago`, color: 'text-red-600' };
    if (days === 0) return { label: 'Expires today',                  color: 'text-red-600' };
    if (days <= 7)  return { label: `${days}d left`,                  color: 'text-red-600' };
    if (days <= 30) return { label: `${days}d left`,                  color: 'text-amber-600' };
    return             { label: `${days}d left`,                      color: 'text-muted-foreground' };
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(Object.entries(statusCounts) as [RenewalStatus, number][]).map(([s, n]) => {
          const cfg = STATUS_CFG[s];
          return (
            <button key={s} onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
              className={cn('rounded-xl border p-3 text-left transition-all hover:shadow-md', statusFilter === s ? 'ring-2 ring-[#0F2041] dark:ring-blue-400' : '')}>
              <p className="text-xs text-muted-foreground">{cfg.label}</p>
              <p className="text-2xl font-bold">{isLoading ? '—' : n}</p>
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">Show contracts expiring within:</span>
          {[30, 60, 90].map(d => (
            <button key={d} onClick={() => setWindow_(d)}
              className={cn('text-xs font-bold px-3 py-1.5 rounded-lg border transition-all', window_ === d ? 'bg-[#0F2041] text-white border-[#0F2041]' : 'border-border hover:bg-muted')}>
              {d}d
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} contracts shown</span>
      </div>

      {/* Contract list */}
      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading contracts…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <FileText className="h-10 w-10 opacity-30" />
          <p className="text-sm">No contracts match this filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c: any) => {
            const status: RenewalStatus = c.renewal_status ?? 'pending';
            const cfg = STATUS_CFG[status];
            const StatusIcon = cfg.icon;
            const daysInfo = getDaysLabel(c.contract_end_date);
            const isOpen = expandedId === c.id;

            return (
              <Card key={c.id} className={cn('overflow-hidden transition-all', status === 'ended' ? 'opacity-60' : '')}>
                <div className="px-5 py-4 flex items-center gap-4 cursor-pointer" onClick={() => setExpandedId(isOpen ? null : c.id)}>
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0F2041] to-[#2563eb] flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {(c.full_name ?? '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{c.full_name}</p>
                    <p className="text-xs text-muted-foreground">{c.role ?? '—'}{c.employee_id ? ` · ${c.employee_id}` : ''}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-muted-foreground">
                      {c.contract_end_date ? format(parseISO(c.contract_end_date), 'dd MMM yyyy') : '—'}
                    </p>
                    <p className={`text-xs font-bold ${daysInfo.color}`}>{daysInfo.label}</p>
                  </div>
                  <span className={cn('text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shrink-0', cfg.color)}>
                    <StatusIcon className="h-3 w-3" />{cfg.label}
                  </span>
                  {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                </div>

                {isOpen && (
                  <div className="border-t bg-muted/20 px-5 py-4 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                      <div><p className="text-muted-foreground">Contract Type</p><p className="font-semibold capitalize">{c.contract_type ?? '—'}</p></div>
                      <div><p className="text-muted-foreground">Start Date</p><p className="font-semibold">{c.contract_start_date ? format(parseISO(c.contract_start_date), 'dd MMM yyyy') : '—'}</p></div>
                      <div><p className="text-muted-foreground">Email</p><p className="font-semibold truncate">{c.email ?? '—'}</p></div>
                    </div>

                    {/* Renewal date input */}
                    {status !== 'ended' && (
                      <div className="flex items-end gap-3 flex-wrap">
                        <div className="flex-1 min-w-[160px]">
                          <p className="text-xs font-semibold text-muted-foreground mb-1">New contract end date</p>
                          <Input
                            type="date"
                            value={newDates[c.id] ?? ''}
                            onChange={e => setNewDates(d => ({ ...d, [c.id]: e.target.value }))}
                            className="h-8 text-xs"
                          />
                        </div>
                        <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                          disabled={!newDates[c.id]}
                          onClick={() => updateStatus(c.id, 'renewed', newDates[c.id])}>
                          <Check className="h-3.5 w-3.5 mr-1" />Mark Renewed
                        </Button>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 flex-wrap">
                      {status === 'pending' && (
                        <Button size="sm" className="h-8 text-xs bg-[#0F2041] hover:bg-[#1D3461] text-white"
                          disabled={sending[c.id]}
                          onClick={() => sendReminder(c)}>
                          {sending[c.id]
                            ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" />
                            : <Send className="h-3.5 w-3.5 mr-1" />}
                          Send Reminder (WhatsApp + In-App)
                        </Button>
                      )}
                      {status === 'contacted' && (
                        <Button size="sm" variant="outline" className="h-8 text-xs"
                          disabled={sending[c.id]}
                          onClick={() => sendReminder(c)}>
                          <Send className="h-3.5 w-3.5 mr-1" />Resend Reminder
                        </Button>
                      )}
                      {status !== 'ended' && (
                        <Button size="sm" variant="outline" className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30"
                          onClick={() => updateStatus(c.id, 'ended')}>
                          <XCircle className="h-3.5 w-3.5 mr-1" />Mark as Ended
                        </Button>
                      )}
                      {status === 'ended' && (
                        <Button size="sm" variant="outline" className="h-8 text-xs"
                          onClick={() => updateStatus(c.id, 'pending')}>
                          Reopen
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
