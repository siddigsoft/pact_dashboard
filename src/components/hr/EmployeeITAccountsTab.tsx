import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, X, Loader2, Monitor, CheckCircle, AlertCircle, Clock, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ITAccount {
  id?: string;
  system_name: string;
  username?: string;
  account_type: string;
  status: string;
  provisioned_at?: string;
  deprovisioned_at?: string;
  notes?: string;
}

const EMPTY_ACCT: ITAccount = {
  system_name: '', username: '', account_type: 'standard', status: 'active',
  provisioned_at: '', deprovisioned_at: '', notes: '',
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; badge: string }> = {
  active:         { label: 'Active',         icon: <CheckCircle className="h-3 w-3" />,   badge: 'bg-green-100 text-green-800 border-green-200' },
  pending:        { label: 'Pending',        icon: <Clock className="h-3 w-3" />,         badge: 'bg-amber-100 text-amber-800 border-amber-200' },
  suspended:      { label: 'Suspended',      icon: <AlertCircle className="h-3 w-3" />,   badge: 'bg-orange-100 text-orange-800 border-orange-200' },
  deprovisioned:  { label: 'Deprovisioned',  icon: <XCircle className="h-3 w-3" />,       badge: 'bg-gray-100 text-gray-600 border-gray-200' },
};

const ACCT_TYPE_LABELS: Record<string, string> = {
  standard: 'Standard User',
  admin: 'Administrator',
  service: 'Service Account',
  shared: 'Shared Account',
  other: 'Other',
};

const COMMON_SYSTEMS = [
  'Microsoft 365 / Outlook', 'Supabase / PACT Platform', 'GitHub', 'Slack',
  'Zoom', 'Google Workspace', 'VPN', 'Jira', 'HR Portal', 'Accounting System', 'Other',
];

export default function EmployeeITAccountsTab({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<ITAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<ITAccount | null>(null);
  // Separate state for the free-text "Other" system name — avoids the disappearing-input bug
  // where typing changes form.system_name away from 'Other' and hides the input
  const [customSystemName, setCustomSystemName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('hr_it_accounts').select('*')
      .eq('profile_id', userId).order('status').order('system_name');
    setAccounts(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [userId]);

  const f = (key: keyof ITAccount) => (v: any) => setForm(p => p ? { ...p, [key]: v } : p);

  const openForm = (acct: ITAccount) => {
    const isCustom = acct.system_name && !COMMON_SYSTEMS.slice(0, -1).includes(acct.system_name);
    setCustomSystemName(isCustom ? acct.system_name : '');
    setForm(isCustom ? { ...acct, system_name: 'Other' } : { ...acct });
  };

  const handleSave = async () => {
    const resolvedName = form?.system_name === 'Other' ? customSystemName.trim() : form?.system_name;
    if (!resolvedName) {
      toast({ title: 'System name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, system_name: resolvedName, profile_id: userId, updated_at: new Date().toISOString() };
      if (form!.id) {
        const { error } = await supabase.from('hr_it_accounts').update(payload).eq('id', form!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('hr_it_accounts').insert(payload);
        if (error) throw error;
      }
      await load();
      setForm(null);
      setCustomSystemName('');
      toast({ title: 'IT Account saved' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    const { error } = await supabase.from('hr_it_accounts').delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    setAccounts(p => p.filter(a => a.id !== id));
    toast({ title: 'Account removed' });
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const activeCount  = accounts.filter(a => a.status === 'active').length;
  const pendingCount = accounts.filter(a => a.status === 'pending').length;

  const isSaveDisabled = saving || (form?.system_name === 'Other' ? !customSystemName.trim() : !form?.system_name);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base flex items-center gap-2">
            <Monitor className="h-4 w-4 text-blue-500" /> IT Accounts & System Access
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track provisioned accounts, usernames, and access status across organizational systems.
          </p>
        </div>
        {isAdmin && !form && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setCustomSystemName(''); setForm({ ...EMPTY_ACCT }); }} data-testid="button-add-it-account">
            <Plus className="h-3.5 w-3.5" /> Add Account
          </Button>
        )}
      </div>

      {/* Summary chips */}
      {accounts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="text-xs">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</Badge>
          {activeCount > 0 && <Badge className="text-xs bg-green-100 text-green-800 border-green-200"><CheckCircle className="h-3 w-3 mr-1" />{activeCount} active</Badge>}
          {pendingCount > 0 && <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-200"><Clock className="h-3 w-3 mr-1" />{pendingCount} pending</Badge>}
        </div>
      )}

      {/* Inline form */}
      {form && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            {form.id ? 'Edit Account' : 'New IT Account'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="space-y-1 sm:col-span-2 lg:col-span-1">
              <label className="text-xs text-muted-foreground">System / Application *</label>
              <Select
                value={form.system_name}
                onValueChange={v => {
                  f('system_name')(v);
                  if (v !== 'Other') setCustomSystemName('');
                }}
              >
                <SelectTrigger className="h-9"><SelectValue placeholder="Select system…" /></SelectTrigger>
                <SelectContent>
                  {COMMON_SYSTEMS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              {/* Separate state for custom name — input stays mounted regardless of system_name value */}
              {form.system_name === 'Other' && (
                <Input
                  value={customSystemName}
                  onChange={e => setCustomSystemName(e.target.value)}
                  placeholder="Enter system name"
                  className="h-9 mt-1"
                  data-testid="input-custom-system-name"
                  autoFocus
                />
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Username / Email</label>
              <Input value={form.username || ''} onChange={e => f('username')(e.target.value)} placeholder="user@example.com" className="h-9 font-mono" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Account Type</label>
              <Select value={form.account_type} onValueChange={f('account_type')}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ACCT_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={form.status} onValueChange={f('status')}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([v, c]) => <SelectItem key={v} value={v}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Provisioned Date</label>
              <Input type="date" value={form.provisioned_at || ''} onChange={e => f('provisioned_at')(e.target.value)} className="h-9" />
            </div>
            {(form.status === 'deprovisioned' || form.status === 'suspended') && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Deprovisioned / Suspended Date</label>
                <Input type="date" value={form.deprovisioned_at || ''} onChange={e => f('deprovisioned_at')(e.target.value)} className="h-9" />
              </div>
            )}
            <div className="space-y-1 sm:col-span-2 lg:col-span-3">
              <label className="text-xs text-muted-foreground">Notes</label>
              <Input value={form.notes || ''} onChange={e => f('notes')(e.target.value)} placeholder="Access scope, permissions, notes…" className="h-9" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleSave} disabled={isSaveDisabled} className="gap-1.5" data-testid="button-save-it-account">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setForm(null); setCustomSystemName(''); }} data-testid="button-cancel-it-account">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Accounts list */}
      {accounts.length === 0 && !form ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
            <Monitor className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No IT accounts recorded.</p>
          {isAdmin && <p className="text-xs text-muted-foreground mt-1">Click "Add Account" to track system access.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map(a => {
            const cfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.active;
            return (
              <div key={a.id} className="flex items-start gap-3 p-4 rounded-xl border border-border/40 bg-background hover:border-border/70 transition-colors" data-testid={`it-account-card-${a.id}`}>
                <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950/30 shrink-0">
                  <Monitor className="h-4 w-4 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{a.system_name}</p>
                    <Badge className={`text-[10px] px-1.5 py-0 border flex items-center gap-0.5 ${cfg.badge}`}>
                      {cfg.icon}{cfg.label}
                    </Badge>
                    {a.account_type !== 'standard' && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {ACCT_TYPE_LABELS[a.account_type] || a.account_type}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                    {a.username && <span className="font-mono">{a.username}</span>}
                    {a.provisioned_at && <span>Provisioned {new Date(a.provisioned_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</span>}
                    {a.deprovisioned_at && <span>Removed {new Date(a.deprovisioned_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</span>}
                  </div>
                  {a.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{a.notes}</p>}
                </div>
                {isAdmin && (
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openForm({ ...a })} data-testid={`button-edit-acct-${a.id}`}><Edit className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" onClick={() => handleDelete(a.id)} data-testid={`button-delete-acct-${a.id}`}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
