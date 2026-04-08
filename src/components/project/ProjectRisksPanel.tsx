import { useState, useEffect, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, isValid } from 'date-fns';
import {
  ShieldAlert, Plus, Edit2, Trash2, Loader2, CheckCircle2,
  AlertTriangle, Circle, ChevronDown, ChevronUp, User, Calendar,
  Activity, Target, X, ShieldCheck, Flame,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useUser } from '@/context/user/UserContext';

interface Risk {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  category: string;
  likelihood: string;
  impact: string;
  risk_score: number;
  status: string;
  owner_id: string | null;
  mitigation_plan: string | null;
  contingency_plan: string | null;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  owner_name?: string | null;
}

interface Profile { id: string; full_name: string; }

interface Props { projectId: string; }

const LIKELIHOOD_OPTS = [
  { value: 'very_low', label: 'Very Low', score: 1, color: 'text-emerald-600' },
  { value: 'low',      label: 'Low',      score: 2, color: 'text-green-600' },
  { value: 'medium',   label: 'Medium',   score: 3, color: 'text-amber-600' },
  { value: 'high',     label: 'High',     score: 4, color: 'text-orange-600' },
  { value: 'very_high',label: 'Very High',score: 5, color: 'text-red-600' },
];

const IMPACT_OPTS = [
  { value: 'negligible', label: 'Negligible', score: 1, color: 'text-emerald-600' },
  { value: 'minor',      label: 'Minor',      score: 2, color: 'text-green-600' },
  { value: 'moderate',   label: 'Moderate',   score: 3, color: 'text-amber-600' },
  { value: 'major',      label: 'Major',      score: 4, color: 'text-orange-600' },
  { value: 'critical',   label: 'Critical',   score: 5, color: 'text-red-600' },
];

const CATEGORIES = [
  'operational', 'financial', 'technical', 'schedule', 'resource', 'external', 'compliance', 'security',
];

const STATUS_CFG: Record<string, { label: string; badge: string; icon: ReactNode }> = {
  open:      { label: 'Open',      badge: 'bg-red-100 text-red-700 dark:bg-red-900/40',         icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  mitigated: { label: 'Mitigated', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40',   icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  closed:    { label: 'Closed',    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  accepted:  { label: 'Accepted',  badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800',         icon: <Circle className="h-3.5 w-3.5" /> },
};

function getRiskLevel(score: number): { label: string; bg: string; text: string } {
  if (score <= 4)  return { label: 'Low',      bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400' };
  if (score <= 9)  return { label: 'Medium',   bg: 'bg-amber-100 dark:bg-amber-900/30',    text: 'text-amber-700 dark:text-amber-400' };
  if (score <= 16) return { label: 'High',     bg: 'bg-orange-100 dark:bg-orange-900/30',  text: 'text-orange-700 dark:text-orange-400' };
  return               { label: 'Critical',  bg: 'bg-red-100 dark:bg-red-900/30',        text: 'text-red-700 dark:text-red-400' };
}

const BLANK = {
  title: '', description: '', category: 'operational', likelihood: 'medium',
  impact: 'moderate', status: 'open', owner_id: '', mitigation_plan: '', contingency_plan: '', due_date: '',
};

export function ProjectRisksPanel({ projectId }: Props) {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [risks, setRisks] = useState<Risk[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Risk | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => { fetchRisks(); fetchProfiles(); }, [projectId]);

  async function fetchRisks() {
    setLoading(true);
    const { data } = await supabase
      .from('project_risks')
      .select('*')
      .eq('project_id', projectId)
      .order('risk_score', { ascending: false });
    if (data) setRisks(data as Risk[]);
    setLoading(false);
  }

  async function fetchProfiles() {
    const { data } = await supabase.from('profiles').select('id, full_name').order('full_name');
    if (data) setProfiles(data as Profile[]);
  }

  function openNew() {
    setEditing(null);
    setForm({ ...BLANK });
    setDialogOpen(true);
  }

  function openEdit(risk: Risk) {
    setEditing(risk);
    setForm({
      title: risk.title,
      description: risk.description ?? '',
      category: risk.category,
      likelihood: risk.likelihood,
      impact: risk.impact,
      status: risk.status,
      owner_id: risk.owner_id ?? '',
      mitigation_plan: risk.mitigation_plan ?? '',
      contingency_plan: risk.contingency_plan ?? '',
      due_date: risk.due_date ?? '',
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    const payload: any = {
      project_id: projectId,
      title: form.title.trim(),
      description: form.description || null,
      category: form.category,
      likelihood: form.likelihood,
      impact: form.impact,
      status: form.status,
      owner_id: form.owner_id || null,
      mitigation_plan: form.mitigation_plan || null,
      contingency_plan: form.contingency_plan || null,
      due_date: form.due_date || null,
      created_by: currentUser?.id ?? null,
      updated_at: new Date().toISOString(),
    };
    if (editing) {
      const { error } = await supabase.from('project_risks').update(payload).eq('id', editing.id);
      if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
      else { toast({ title: 'Risk updated' }); setDialogOpen(false); fetchRisks(); }
    } else {
      const { error } = await supabase.from('project_risks').insert(payload);
      if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
      else { toast({ title: 'Risk added' }); setDialogOpen(false); fetchRisks(); }
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    await supabase.from('project_risks').delete().eq('id', id);
    toast({ title: 'Risk deleted' });
    setRisks(p => p.filter(r => r.id !== id));
    setDeleting(null);
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const ownerMap = Object.fromEntries(profiles.map(p => [p.id, p.full_name]));

  const filtered = statusFilter === 'all' ? risks : risks.filter(r => r.status === statusFilter);

  const stats = {
    total: risks.length,
    open: risks.filter(r => r.status === 'open').length,
    high: risks.filter(r => r.risk_score >= 10).length,
    mitigated: risks.filter(r => r.status === 'mitigated').length,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-500" />
            Risk Register
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">Identify, assess, and track project risks</p>
        </div>
        <Button size="sm" onClick={openNew} data-testid="btn-add-risk">
          <Plus className="h-4 w-4 mr-1" /> Add Risk
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Risks', value: stats.total, icon: <Activity className="h-4 w-4" />, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Open',        value: stats.open,  icon: <AlertTriangle className="h-4 w-4" />, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20' },
          { label: 'High/Critical', value: stats.high, icon: <Flame className="h-4 w-4" />, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20' },
          { label: 'Mitigated',   value: stats.mitigated, icon: <ShieldCheck className="h-4 w-4" />, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
        ].map(s => (
          <div key={s.label} className={cn('rounded-lg p-3 flex items-center gap-3', s.bg)}>
            <span className={s.color}>{s.icon}</span>
            <div>
              <p className={cn('text-xl font-bold', s.color)}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'open', 'mitigated', 'accepted', 'closed'].map(s => (
          <Button
            key={s}
            variant={statusFilter === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(s)}
            className="capitalize"
            data-testid={`filter-${s}`}
          >
            {s === 'all' ? 'All' : STATUS_CFG[s]?.label ?? s}
          </Button>
        ))}
      </div>

      {/* Risk Matrix hint */}
      <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 border">
        <span className="font-medium">Risk Score</span> = Likelihood × Impact.
        <span className="ml-2 text-emerald-600 font-medium">1–4 Low</span>
        <span className="ml-2 text-amber-600 font-medium">5–9 Medium</span>
        <span className="ml-2 text-orange-600 font-medium">10–16 High</span>
        <span className="ml-2 text-red-600 font-medium">17–25 Critical</span>
      </div>

      {/* Risk list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ShieldAlert className="h-10 w-10 mx-auto mb-2 opacity-20" />
          <p>{risks.length === 0 ? 'No risks identified yet.' : 'No risks match the current filter.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(risk => {
            const lvl = getRiskLevel(risk.risk_score);
            const isExpanded = expanded.has(risk.id);
            const status = STATUS_CFG[risk.status] ?? STATUS_CFG.open;
            return (
              <div key={risk.id} className="border rounded-lg bg-card overflow-hidden" data-testid={`risk-row-${risk.id}`}>
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => toggleExpand(risk.id)}
                >
                  {/* Score badge */}
                  <div className={cn('min-w-[2.5rem] h-10 rounded-md flex flex-col items-center justify-center text-sm font-bold', lvl.bg, lvl.text)}>
                    <span>{risk.risk_score}</span>
                    <span className="text-[9px] font-normal">{lvl.label}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{risk.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <Badge variant="outline" className="text-xs capitalize">{risk.category}</Badge>
                      <span className={cn('flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full', status.badge)}>
                        {status.icon}<span>{status.label}</span>
                      </span>
                      {risk.owner_id && ownerMap[risk.owner_id] && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <User className="h-3 w-3" />{ownerMap[risk.owner_id]}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={e => { e.stopPropagation(); openEdit(risk); }}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={e => { e.stopPropagation(); handleDelete(risk.id); }} disabled={deleting === risk.id}>
                      {deleting === risk.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t bg-muted/20 p-3 space-y-3 text-sm">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      {[
                        { label: 'Likelihood', value: LIKELIHOOD_OPTS.find(o => o.value === risk.likelihood)?.label ?? risk.likelihood },
                        { label: 'Impact',     value: IMPACT_OPTS.find(o => o.value === risk.impact)?.label ?? risk.impact },
                        { label: 'Due Date',   value: risk.due_date && isValid(parseISO(risk.due_date)) ? format(parseISO(risk.due_date), 'dd MMM yyyy') : '—' },
                      ].map(d => (
                        <div key={d.label} className="bg-background rounded p-2 border">
                          <p className="text-xs text-muted-foreground">{d.label}</p>
                          <p className="font-medium">{d.value}</p>
                        </div>
                      ))}
                    </div>
                    {risk.description && (
                      <div><p className="text-xs font-medium text-muted-foreground mb-1">Description</p><p>{risk.description}</p></div>
                    )}
                    {risk.mitigation_plan && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded p-2 border border-blue-100 dark:border-blue-800">
                        <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">Mitigation Plan</p>
                        <p>{risk.mitigation_plan}</p>
                      </div>
                    )}
                    {risk.contingency_plan && (
                      <div className="bg-amber-50 dark:bg-amber-900/20 rounded p-2 border border-amber-100 dark:border-amber-800">
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">Contingency Plan</p>
                        <p>{risk.contingency_plan}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Risk' : 'Add New Risk'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Risk title" data-testid="input-risk-title" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Describe the risk..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CFG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Likelihood</Label>
                <Select value={form.likelihood} onValueChange={v => setForm(p => ({ ...p, likelihood: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LIKELIHOOD_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Impact</Label>
                <Select value={form.impact} onValueChange={v => setForm(p => ({ ...p, impact: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IMPACT_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Risk Owner</Label>
                <Select value={form.owner_id} onValueChange={v => setForm(p => ({ ...p, owner_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Mitigation Plan</Label>
              <Textarea value={form.mitigation_plan} onChange={e => setForm(p => ({ ...p, mitigation_plan: e.target.value }))} rows={2} placeholder="How will this risk be reduced or prevented?" />
            </div>
            <div>
              <Label>Contingency Plan</Label>
              <Textarea value={form.contingency_plan} onChange={e => setForm(p => ({ ...p, contingency_plan: e.target.value }))} rows={2} placeholder="What to do if the risk occurs?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.title.trim()} data-testid="btn-save-risk">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editing ? 'Save Changes' : 'Add Risk'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
