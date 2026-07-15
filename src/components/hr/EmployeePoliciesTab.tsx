import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, CheckCircle2, Clock, AlertTriangle, Loader2, Eye } from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';

interface Policy {
  id: string;
  title: string;
  category: string;
  version: string;
  effective_date: string | null;
  content_text: string | null;
  file_url: string | null;
  published_at: string | null;
  required_roles: string[];
}

interface Acknowledgement {
  policy_id: string;
  policy_version: string;
  acknowledged_at: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  HR:           'bg-blue-100 text-blue-700 border-blue-200',
  IT:           'bg-purple-100 text-purple-700 border-purple-200',
  Finance:      'bg-amber-100 text-amber-700 border-amber-200',
  Safeguarding: 'bg-red-100 text-red-700 border-red-200',
  Operations:   'bg-green-100 text-green-700 border-green-200',
  Other:        'bg-gray-100 text-gray-700 border-gray-200',
};

/** Returns true if the policy applies to this employee's role */
function policyAppliesTo(policy: Policy, userRole?: string): boolean {
  if (!policy.required_roles || policy.required_roles.length === 0) return true;
  if (!userRole) return true; // unknown role — show all to be safe
  const role = userRole.toLowerCase();
  return policy.required_roles.some(r => r.toLowerCase() === role);
}

export default function EmployeePoliciesTab({
  userId,
  userRole,
  userName,
}: {
  userId: string;
  userRole?: string;
  userName?: string;
}) {
  const { toast } = useToast();
  const [policies, setPolicies]   = useState<Policy[]>([]);
  const [acks, setAcks]           = useState<Acknowledgement[]>([]);
  const [loading, setLoading]     = useState(true);
  const [viewPolicy, setViewPolicy]   = useState<Policy | null>(null);
  const [ackDialog, setAckDialog]     = useState<Policy | null>(null);
  const [ackChecked, setAckChecked]   = useState(false);
  const [ackName, setAckName]         = useState('');
  const [saving, setSaving]           = useState(false);
  const [showAcked, setShowAcked]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [polRes, ackRes] = await Promise.all([
        supabase
          .from('hr_policies')
          .select('id, title, category, version, effective_date, content_text, file_url, published_at, required_roles')
          .eq('status', 'published')
          .order('effective_date', { ascending: false }),
        supabase
          .from('hr_policy_acknowledgements')
          .select('policy_id, policy_version, acknowledged_at')
          .eq('user_id', userId),
      ]);
      const allPolicies = (polRes.data ?? []) as Policy[];

      // ── Role-based filtering ───────────────────────────────────────────────
      // Only show policies that target this employee's role (or all staff).
      const applicable = allPolicies.filter(p => policyAppliesTo(p, userRole));

      setPolicies(applicable);
      setAcks((ackRes.data ?? []) as Acknowledgement[]);
    } finally {
      setLoading(false);
    }
  }, [userId, userRole]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (ackDialog) { setAckChecked(false); setAckName(userName ?? ''); } }, [ackDialog, userName]);

  const getAck = (policy: Policy) =>
    acks.find(a => a.policy_id === policy.id && a.policy_version === policy.version);

  const getStatus = (policy: Policy) => {
    if (getAck(policy)) return 'acknowledged';
    if (!policy.effective_date) return 'pending';
    const days = differenceInDays(new Date(), parseISO(policy.effective_date));
    if (days >= 14) return 'overdue';
    if (days >= 7)  return 'reminder';
    return 'pending';
  };

  const pending      = policies.filter(p => getStatus(p) !== 'acknowledged');
  const acknowledged = policies.filter(p => getStatus(p) === 'acknowledged');
  const displayed    = showAcked ? policies : pending;

  const handleAcknowledge = async () => {
    if (!ackDialog || !ackChecked || !ackName.trim()) return;
    setSaving(true);
    try {
      // ── Server-side insertion via edge function ────────────────────────────
      // This captures ip_address server-side from request headers so the
      // audit record cannot be client-forged.
      const { data, error } = await supabase.functions.invoke('acknowledge-policy', {
        body: {
          policy_id:      ackDialog.id,
          policy_version: ackDialog.version,
          confirmed_name: ackName.trim(),
        },
      });

      if (error) throw error;
      if (data?.error === 'already_acknowledged') {
        toast({ title: 'Already acknowledged', description: 'You have already signed off on this version.' });
        setAckDialog(null);
        load();
        return;
      }
      if (data?.error) throw new Error(data.error);

      toast({ title: 'Policy acknowledged', description: `${ackDialog.title} v${ackDialog.version}` });
      setAckDialog(null);
      load();
    } catch (e: any) {
      toast({ title: 'Failed to save acknowledgement', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-500" /> Policy Acknowledgements
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {pending.length} pending · {acknowledged.length} acknowledged
          </p>
        </div>
        {acknowledged.length > 0 && (
          <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setShowAcked(v => !v)}>
            {showAcked ? 'Hide acknowledged' : 'Show all'}
          </Button>
        )}
      </div>

      {/* Pending acknowledgement banner */}
      {pending.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {pending.length} {pending.length === 1 ? 'policy requires' : 'policies require'} your acknowledgement
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Review and sign off each policy below to confirm you have read and understood it.
            </p>
          </div>
        </div>
      )}

      {/* Policy list */}
      {displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          </div>
          <p className="text-sm font-semibold">All policies acknowledged</p>
          <p className="text-xs text-muted-foreground mt-1">No pending acknowledgements — you are up to date.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {displayed.map(policy => {
            const status = getStatus(policy);
            const ack    = getAck(policy);
            return (
              <div
                key={policy.id}
                className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${
                  status === 'acknowledged'
                    ? 'border-border/30 bg-muted/20 opacity-80'
                    : status === 'overdue'
                    ? 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20'
                    : 'border-border/50 bg-background hover:border-border/80'
                }`}
                data-testid={`policy-card-${policy.id}`}
              >
                <div className={`flex items-center justify-center h-10 w-10 rounded-lg shrink-0 ${
                  status === 'acknowledged' ? 'bg-emerald-50 dark:bg-emerald-950/30'
                    : status === 'overdue' ? 'bg-red-100 dark:bg-red-950/30'
                    : 'bg-blue-50 dark:bg-blue-950/30'
                }`}>
                  {status === 'acknowledged'
                    ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    : status === 'overdue'
                    ? <AlertTriangle className="h-5 w-5 text-red-500" />
                    : <FileText className="h-5 w-5 text-blue-500" />
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{policy.title}</p>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${CATEGORY_COLORS[policy.category] ?? ''}`}>
                      {policy.category}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-mono">v{policy.version}</span>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                    {policy.effective_date && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Effective: {format(parseISO(policy.effective_date), 'd MMM yyyy')}
                      </span>
                    )}
                    {status === 'acknowledged' && ack && (
                      <span className="text-emerald-600 font-medium flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Acknowledged {format(parseISO(ack.acknowledged_at), 'd MMM yyyy')}
                      </span>
                    )}
                    {status === 'overdue' && (
                      <span className="text-red-600 font-medium">Overdue — please acknowledge immediately</span>
                    )}
                    {status === 'reminder' && (
                      <span className="text-amber-600 font-medium">7+ days since effective — acknowledgement needed</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {(policy.content_text || policy.file_url) && (
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 text-xs gap-1"
                      onClick={() => setViewPolicy(policy)}
                      data-testid={`button-view-policy-${policy.id}`}
                    >
                      <Eye className="h-3 w-3" /> View
                    </Button>
                  )}
                  {status !== 'acknowledged' && (
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1 bg-[#0F2041] hover:bg-[#1D3461] text-white"
                      onClick={() => setAckDialog(policy)}
                      data-testid={`button-acknowledge-policy-${policy.id}`}
                    >
                      Acknowledge
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* View Policy Dialog */}
      <Dialog open={!!viewPolicy} onOpenChange={v => !v && setViewPolicy(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {viewPolicy?.title}
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${CATEGORY_COLORS[viewPolicy?.category ?? ''] ?? ''}`}>
                {viewPolicy?.category}
              </Badge>
              <span className="text-xs text-muted-foreground font-mono">v{viewPolicy?.version}</span>
            </DialogTitle>
          </DialogHeader>
          {viewPolicy && (
            <ScrollArea className="max-h-[50vh] pr-3">
              {viewPolicy.content_text ? (
                <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {viewPolicy.content_text}
                </div>
              ) : viewPolicy.file_url ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <FileText className="h-10 w-10 text-blue-400" />
                  <p className="text-sm text-muted-foreground">This policy is available as an external document.</p>
                  <Button size="sm" onClick={() => window.open(viewPolicy.file_url!, '_blank')} className="gap-1.5">
                    Open Document
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-6 text-center">No content available.</p>
              )}
            </ScrollArea>
          )}
          <DialogFooter>
            {viewPolicy && getStatus(viewPolicy) !== 'acknowledged' && (
              <Button onClick={() => { setViewPolicy(null); setAckDialog(viewPolicy); }} className="bg-[#0F2041] hover:bg-[#1D3461] text-white">
                Proceed to Acknowledge
              </Button>
            )}
            <Button variant="outline" onClick={() => setViewPolicy(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Acknowledge Dialog */}
      <Dialog open={!!ackDialog} onOpenChange={v => !v && setAckDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Acknowledge Policy</DialogTitle>
          </DialogHeader>
          {ackDialog && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="text-sm font-semibold">{ackDialog.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Version {ackDialog.version} · {ackDialog.category}</p>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="ack-checkbox"
                  checked={ackChecked}
                  onCheckedChange={v => setAckChecked(!!v)}
                  data-testid="checkbox-ack-confirm"
                />
                <label htmlFor="ack-checkbox" className="text-sm leading-relaxed cursor-pointer">
                  I confirm that I have read and understood this policy in full, and I agree to comply with its requirements.
                </label>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Type your full name to sign off *
                </label>
                <Input
                  value={ackName}
                  onChange={e => setAckName(e.target.value)}
                  placeholder="Full name"
                  className="h-9"
                  data-testid="input-ack-name"
                />
                <p className="text-[10px] text-muted-foreground">
                  This will be recorded as your digital confirmation with a timestamp of {new Date().toLocaleString()}.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAckDialog(null)}>Cancel</Button>
            <Button
              disabled={!ackChecked || !ackName.trim() || saving}
              onClick={handleAcknowledge}
              className="bg-[#0F2041] hover:bg-[#1D3461] text-white"
              data-testid="button-submit-acknowledgement"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Sign & Acknowledge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
