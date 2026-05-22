import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Send, Users, MessageSquare, CheckCircle, RefreshCw, Eye } from 'lucide-react';

type TargetGroup = 'all' | 'department' | 'contract_type' | 'hub';

const CHANNELS = [
  { id: 'in_app',    label: 'In-App Notification', icon: '🔔' },
  { id: 'whatsapp',  label: 'WhatsApp Message',     icon: '💬' },
  { id: 'email',     label: 'Email',                icon: '📧' },
];

export default function HRBroadcast() {
  const { toast } = useToast();
  const [group, setGroup]       = useState<TargetGroup>('all');
  const [deptFilter, setDept]   = useState('__all__');
  const [ctFilter,   setCt]     = useState('__all__');
  const [hubFilter,  setHub]    = useState('__all__');
  const [title, setTitle]       = useState('');
  const [message, setMessage]   = useState('');
  const [channels, setChannels] = useState<string[]>(['in_app']);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending]   = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);

  const { data: profiles = [] } = useQuery({
    queryKey: ['hr-broadcast-profiles'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, contract_type, department_id, hub_id, is_employee')
        .eq('is_employee', true);
      return data ?? [];
    },
    staleTime: 120_000,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['hr-broadcast-depts'],
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('id,name').order('name');
      return data ?? [];
    },
    staleTime: 300_000,
  });

  const { data: hubs = [] } = useQuery({
    queryKey: ['hr-broadcast-hubs'],
    queryFn: async () => {
      const { data } = await supabase.from('hubs').select('id,name').order('name').limit(50);
      return data ?? [];
    },
    staleTime: 300_000,
  });

  const recipients = useMemo(() => {
    return profiles.filter((p: any) => {
      if (group === 'department'    && deptFilter !== '__all__' && p.department_id !== deptFilter) return false;
      if (group === 'contract_type' && ctFilter   !== '__all__' && p.contract_type  !== ctFilter)  return false;
      if (group === 'hub'           && hubFilter  !== '__all__' && p.hub_id         !== hubFilter)  return false;
      return true;
    });
  }, [profiles, group, deptFilter, ctFilter, hubFilter]);

  const toggleChannel = (ch: string) => setChannels(cs => cs.includes(ch) ? cs.filter(c => c !== ch) : [...cs, ch]);

  const canSend = title.trim() && message.trim() && channels.length > 0 && recipients.length > 0;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setSentCount(null);
    let sent = 0;
    try {
      // Fire in batches of 10 to avoid overwhelming the edge function
      const batches: any[][] = [];
      for (let i = 0; i < recipients.length; i += 10) batches.push(recipients.slice(i, i + 10));
      for (const batch of batches) {
        await Promise.all(batch.map((p: any) =>
          supabase.functions.invoke('dispatch-notification', {
            body: {
              user_id: p.id,
              type: 'hr_broadcast',
              title: title.trim(),
              message: message.trim(),
              channels,
            },
          })
        ));
        sent += batch.length;
      }
      setSentCount(sent);
      toast({ title: 'Broadcast sent', description: `Message delivered to ${sent} staff members.` });
      setTitle('');
      setMessage('');
    } catch (e) {
      toast({ title: 'Broadcast failed', description: 'An error occurred. Please try again.', variant: 'destructive' });
    }
    setSending(false);
  };

  const CT_LABEL: Record<string, string> = { salary: 'Salary Staff', retainer: 'Retainer-Only', both: 'Salary + Retainer' };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {/* Sent confirmation */}
      {sentCount !== null && (
        <div className="flex items-center gap-3 rounded-xl border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 px-5 py-4">
          <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-bold text-green-800 dark:text-green-300">Broadcast delivered to {sentCount} staff members</p>
            <p className="text-xs text-green-600 dark:text-green-400">Notifications sent via {channels.join(', ')} at {new Date().toLocaleTimeString()}</p>
          </div>
          <button onClick={() => setSentCount(null)} className="ml-auto text-xs text-green-600 hover:text-green-800 font-semibold">Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Left: compose */}
        <div className="md:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5" />Compose Message
              </p>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Title / Subject</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Payroll processed for May 2026"
                  maxLength={120}
                  className="w-full border rounded-xl px-3.5 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Message Body</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={5}
                  placeholder="Write your message here…"
                  maxLength={1000}
                  className="w-full border rounded-xl px-3.5 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
                <p className="text-[10px] text-muted-foreground text-right mt-0.5">{message.length}/1000</p>
              </div>

              {/* Delivery channels */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-2">Delivery Channels</label>
                <div className="flex gap-2 flex-wrap">
                  {CHANNELS.map(ch => (
                    <button key={ch.id} onClick={() => toggleChannel(ch.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all',
                        channels.includes(ch.id) ? 'bg-[#0F2041] text-white border-[#0F2041]' : 'border-border hover:bg-muted',
                      )}>
                      <span>{ch.icon}</span>{ch.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Preview */}
          {previewing && (
            <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20">
              <CardHeader className="pb-2 pt-4 px-5">
                <p className="text-xs font-bold uppercase tracking-widest text-blue-700 dark:text-blue-300">Message Preview</p>
              </CardHeader>
              <CardContent className="px-5 pb-5 space-y-2">
                <p className="text-sm font-bold">{title || '(No title)'}</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{message || '(No message)'}</p>
                <div className="pt-2 flex gap-2 text-[10px] text-blue-600 font-semibold">
                  {channels.map(c => <span key={c} className="border border-blue-300 rounded-full px-2 py-0.5">{CHANNELS.find(x => x.id === c)?.icon} {CHANNELS.find(x => x.id === c)?.label}</span>)}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button variant="outline" className="h-9 text-xs gap-1.5" onClick={() => setPreviewing(p => !p)}>
              <Eye className="h-3.5 w-3.5" />{previewing ? 'Hide Preview' : 'Preview'}
            </Button>
            <Button
              className="h-9 text-xs gap-1.5 bg-[#0F2041] hover:bg-[#1D3461] text-white flex-1"
              onClick={handleSend}
              disabled={!canSend || sending}
            >
              {sending
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                : <Send className="h-3.5 w-3.5" />}
              {sending ? `Sending to ${recipients.length} staff…` : `Send to ${recipients.length} staff`}
            </Button>
          </div>
        </div>

        {/* Right: target group */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Users className="h-3.5 w-3.5" />Target Group
              </p>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-3">
              {([
                { id: 'all',           label: '👥 All Staff',          sub: `${profiles.length} employees` },
                { id: 'department',    label: '🏢 By Department',      sub: 'Select a department' },
                { id: 'contract_type', label: '📋 By Contract Type',   sub: 'Salary, Retainer, Both' },
                { id: 'hub',           label: '📍 By Hub / Office',    sub: 'Select a hub' },
              ] as { id: TargetGroup; label: string; sub: string }[]).map(g => (
                <button key={g.id} onClick={() => setGroup(g.id)}
                  className={cn('w-full text-left rounded-xl border px-3 py-2.5 transition-all', group === g.id ? 'border-[#0F2041] bg-[#0F2041]/5 dark:bg-[#0F2041]/20' : 'border-border hover:bg-muted/40')}>
                  <p className="text-xs font-bold">{g.label}</p>
                  <p className="text-[10px] text-muted-foreground">{g.sub}</p>
                </button>
              ))}

              {/* Sub-filter */}
              {group === 'department' && (
                <select value={deptFilter} onChange={e => setDept(e.target.value)}
                  className="w-full text-xs border rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="__all__">All departments</option>
                  {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
              {group === 'contract_type' && (
                <select value={ctFilter} onChange={e => setCt(e.target.value)}
                  className="w-full text-xs border rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="__all__">All contract types</option>
                  {Object.entries(CT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              )}
              {group === 'hub' && (
                <select value={hubFilter} onChange={e => setHub(e.target.value)}
                  className="w-full text-xs border rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="__all__">All hubs</option>
                  {hubs.map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              )}

              {/* Recipient count */}
              <div className={cn('rounded-xl border px-3 py-3 text-center transition-all', recipients.length > 0 ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/20' : 'border-border bg-muted/20')}>
                <p className={`text-2xl font-bold ${recipients.length > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'}`}>{recipients.length}</p>
                <p className="text-[10px] text-muted-foreground">staff will receive this message</p>
              </div>

              {/* Mini recipient list */}
              {recipients.length > 0 && recipients.length <= 12 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {recipients.map((p: any) => (
                    <div key={p.id} className="flex items-center gap-2 text-[11px] py-0.5">
                      <div className="w-5 h-5 rounded-full bg-[#0F2041] text-white flex items-center justify-center font-bold text-[9px] shrink-0">
                        {(p.full_name ?? '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                      </div>
                      <span className="truncate">{p.full_name}</span>
                    </div>
                  ))}
                </div>
              )}
              {recipients.length > 12 && (
                <p className="text-[10px] text-muted-foreground text-center">+{recipients.length - 12} more recipients</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
