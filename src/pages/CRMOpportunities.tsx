import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import {
  TrendingUp, Plus, Search, DollarSign, Building2,
  Edit2, Trash2, Loader2, RefreshCw, Calendar, Target,
  ChevronRight, ArrowRight, FolderPlus, CheckCircle2
} from 'lucide-react';
import { useProjectContext } from '@/context/project/ProjectContext';
import type { ProjectType } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface Opportunity {
  id: string;
  partner_id: string | null;
  title: string;
  value_usd: number | null;
  stage: string;
  expected_close_date: string | null;
  description: string | null;
  created_at: string;
  partner_name?: string;
}

interface Partner { id: string; name: string; }

const STAGES = [
  { value: 'prospect', label: 'Prospect', color: 'bg-gray-400', badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800' },
  { value: 'proposal', label: 'Proposal', color: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30' },
  { value: 'negotiation', label: 'Negotiation', color: 'bg-yellow-500', badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30' },
  { value: 'won', label: 'Won', color: 'bg-green-500', badge: 'bg-green-100 text-green-700 dark:bg-green-900/30' },
  { value: 'lost', label: 'Lost', color: 'bg-red-400', badge: 'bg-red-100 text-red-700 dark:bg-red-900/30' },
];

const BLANK = {
  partner_id: null as string | null,
  title: '',
  value_usd: null as number | null,
  stage: 'prospect',
  expected_close_date: null as string | null,
  description: null as string | null,
};

function fmtCurrency(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export default function CRMOpportunities() {
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { addProject, projects: allProjects } = useProjectContext();
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Opportunity | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [convertingOppId, setConvertingOppId] = useState<string | null>(null);

  const CRM_OPP_TAG = (oppId: string) => `[crm-opp:${oppId}]`;

  // Track already-converted opportunities: check both the new crmOpportunityId field (Task #14)
  // and the legacy description tag (Task #13) for backwards compatibility
  const convertedOppIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of allProjects) {
      if ((p as any).crmOpportunityId) ids.add((p as any).crmOpportunityId);
      const match = p.description?.match(/\[crm-opp:([^\]]+)\]/);
      if (match) ids.add(match[1]);
    }
    return ids;
  }, [allProjects]);

  const load = async () => {
    setLoading(true);
    const [{ data: os }, { data: ps }] = await Promise.all([
      supabase.from('crm_opportunities').select('*').order('created_at', { ascending: false }),
      supabase.from('crm_partners').select('id, name').order('name'),
    ]);
    const pMap: Record<string, string> = {};
    (ps || []).forEach((p: any) => { pMap[p.id] = p.name; });
    setOpps((os || []).map((o: any) => ({ ...o, partner_name: o.partner_id ? pMap[o.partner_id] : null })));
    setPartners(ps || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let res = opps;
    if (stageFilter !== 'all') res = res.filter(o => o.stage === stageFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      res = res.filter(o =>
        o.title.toLowerCase().includes(q) ||
        (o.partner_name || '').toLowerCase().includes(q) ||
        (o.description || '').toLowerCase().includes(q)
      );
    }
    return res;
  }, [opps, search, stageFilter]);

  const openNew = () => { setEditing(null); setForm({ ...BLANK }); setDialogOpen(true); };
  const openEdit = (o: Opportunity) => {
    setEditing(o);
    setForm({ partner_id: o.partner_id, title: o.title, value_usd: o.value_usd, stage: o.stage, expected_close_date: o.expected_close_date, description: o.description });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast({ title: 'Title is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const payload = { ...form, partner_id: form.partner_id || null };
      if (editing) {
        const { error } = await supabase.from('crm_opportunities').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Opportunity updated' });
      } else {
        const { error } = await supabase.from('crm_opportunities').insert({ ...payload, created_by: currentUser?.id });
        if (error) throw error;
        toast({ title: 'Opportunity created' });
      }
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast({ title: 'Error saving', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this opportunity?')) return;
    const { error } = await supabase.from('crm_opportunities').delete().eq('id', id);
    if (error) toast({ title: 'Error deleting', variant: 'destructive' });
    else { toast({ title: 'Opportunity deleted' }); load(); }
  };

  // Task #13: Automatic project creation (direct, no prefill form) — used when advancing to "won"
  // or when user clicks Convert on an already-won opportunity and wants quick creation
  const createProjectFromOpp = async (o: Opportunity): Promise<void> => {
    if (convertingOppId === o.id) return;
    if (convertedOppIds.has(o.id)) {
      const existing = allProjects.find(p =>
        (p as any).crmOpportunityId === o.id ||
        p.description?.includes(CRM_OPP_TAG(o.id))
      );
      if (existing) navigate(`/projects/${existing.id}`);
      return;
    }
    setConvertingOppId(o.id);
    const today = new Date().toISOString();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 90);
    const projectType: ProjectType = 'tpm';
    const tag = CRM_OPP_TAG(o.id);
    const baseDesc = o.description
      ? `${o.description}\n\n${tag}`
      : `Active project converted from won CRM opportunity: ${o.title}\n\n${tag}`;
    const newProject = await addProject({
      id: '',
      name: o.title,
      projectCode: `WIN-${Date.now().toString(36).toUpperCase()}`,
      projectType,
      status: 'active',
      description: baseDesc,
      startDate: today,
      endDate: endDate.toISOString(),
      location: { country: 'Sudan', region: '', state: '' },
      activities: [],
      createdAt: today,
      updatedAt: today,
      createdBy: currentUser?.id,
      partnerId: o.partner_id ?? undefined,
      clientName: o.partner_name,
      crmOpportunityId: o.id,
    });
    setConvertingOppId(null);
    if (newProject) {
      toast({
        title: 'Project Created',
        description: (
          <div className="flex flex-col gap-2 mt-1">
            <span><strong>{newProject.name}</strong> is now an active TPM project.</span>
            <button
              className="self-start px-3 py-1 rounded bg-green-600 text-white text-xs font-medium hover:bg-green-700"
              onClick={() => navigate(`/projects/${newProject.id}`)}
            >
              Open Project
            </button>
          </div>
        ),
        duration: 10000,
      });
    }
  };

  const advanceStage = async (o: Opportunity) => {
    const idx = STAGES.findIndex(s => s.value === o.stage);
    if (idx === -1 || idx >= STAGES.length - 1) return;
    const newStage = STAGES[idx + 1].value;
    await supabase.from('crm_opportunities').update({ stage: newStage, updated_at: new Date().toISOString() }).eq('id', o.id);
    load();
    if (newStage === 'won') {
      await createProjectFromOpp({ ...o, stage: newStage });
    }
  };

  // Task #14: Manual "Convert to Project" — navigates to Create Project with prefilled form
  const convertToProject = (o: Opportunity) => {
    const params = new URLSearchParams();
    params.set('crm_opportunity_id', o.id);
    params.set('crm_opportunity_title', o.title);
    if (o.partner_id) params.set('crm_partner_id', o.partner_id);
    if (o.partner_name) params.set('crm_partner_name', o.partner_name);
    if (o.value_usd) params.set('crm_value_usd', String(o.value_usd));
    if (o.description) params.set('crm_description', o.description);
    navigate(`/projects/create?${params.toString()}`);
  };

  const setF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const totalPipeline = filtered.filter(o => !['won','lost'].includes(o.stage)).reduce((s, o) => s + (o.value_usd || 0), 0);
  const totalWon = filtered.filter(o => o.stage === 'won').reduce((s, o) => s + (o.value_usd || 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-r from-[#0F2041] to-[#1D3461] text-white px-6 py-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Pipeline</h1>
              <p className="text-blue-200 text-sm">{opps.filter(o => !['won','lost'].includes(o.stage)).length} open opportunities</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}
              className="border-white/30 text-white hover:bg-white/10">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button size="sm" onClick={openNew} className="bg-white text-[#0F2041] hover:bg-blue-50">
              <Plus className="h-4 w-4 mr-1" /> New Opportunity
            </Button>
          </div>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          <div className="bg-white/10 rounded-xl p-3 border border-white/10">
            <div className="text-blue-200 text-xs font-medium mb-1">Open Pipeline</div>
            <div className="text-white text-lg font-bold">{fmtCurrency(totalPipeline)}</div>
          </div>
          <div className="bg-white/10 rounded-xl p-3 border border-white/10">
            <div className="text-blue-200 text-xs font-medium mb-1">Won This View</div>
            <div className="text-green-300 text-lg font-bold">{fmtCurrency(totalWon)}</div>
          </div>
          <div className="bg-white/10 rounded-xl p-3 border border-white/10">
            <div className="text-blue-200 text-xs font-medium mb-1">Total Deals</div>
            <div className="text-white text-lg font-bold">{filtered.length}</div>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Filters + View Toggle */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search opportunities..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="All stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex border rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('board')}
              className={`px-3 py-2 text-xs font-medium transition-colors ${viewMode === 'board' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              Board
            </button>
            <button onClick={() => setViewMode('list')}
              className={`px-3 py-2 text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              List
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Target className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">{opps.length === 0 ? 'No opportunities yet' : 'No opportunities match your search'}</p>
            {opps.length === 0 && (
              <Button className="mt-4" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Create first opportunity</Button>
            )}
          </div>
        ) : viewMode === 'board' ? (
          /* Board View */
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.map(stage => {
              const items = filtered.filter(o => o.stage === stage.value);
              const colValue = items.reduce((s, o) => s + (o.value_usd || 0), 0);
              return (
                <div key={stage.value} className="flex-shrink-0 w-72">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                      <span className="font-semibold text-sm">{stage.label}</span>
                      <span className="text-xs text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">{items.length}</span>
                    </div>
                    {colValue > 0 && <span className="text-xs text-muted-foreground font-medium">{fmtCurrency(colValue)}</span>}
                  </div>
                  <div className="space-y-2">
                    {items.map(o => {
                      const stageIdx = STAGES.findIndex(s => s.value === o.stage);
                      const canAdvance = stageIdx < STAGES.length - 1;
                      const isConverted = convertedOppIds.has(o.id);
                      return (
                        <Card key={o.id} className="hover:shadow-md transition-shadow cursor-default">
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-1 mb-2">
                              <p className="font-medium text-sm leading-tight">{o.title}</p>
                              <div className="flex gap-0.5 shrink-0">
                                <button onClick={() => openEdit(o)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                                  <Edit2 className="h-3 w-3" />
                                </button>
                                <button onClick={() => remove(o.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                            {o.partner_name && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                                <Building2 className="h-3 w-3 shrink-0" /> {o.partner_name}
                              </div>
                            )}
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold">{o.value_usd ? fmtCurrency(o.value_usd) : '—'}</span>
                              {o.expected_close_date && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="h-3 w-3" /> {format(parseISO(o.expected_close_date), 'MMM d')}
                                </span>
                              )}
                            </div>
                            {canAdvance && o.stage !== 'lost' && (
                              <button onClick={() => advanceStage(o)}
                                className="mt-2 w-full text-xs text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1 py-1 rounded hover:bg-blue-50 transition-colors">
                                Move to {STAGES[stageIdx + 1]?.label} <ArrowRight className="h-3 w-3" />
                              </button>
                            )}
                            {(o.stage === 'won' || o.stage === 'negotiation') && (
                              <button
                                onClick={() => isConverted ? createProjectFromOpp(o) : convertToProject(o)}
                                className="mt-1 w-full text-xs text-green-700 hover:text-green-800 flex items-center justify-center gap-1 py-1 rounded hover:bg-green-50 transition-colors border border-green-200 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/20 disabled:opacity-50"
                                data-testid={`button-convert-to-project-${o.id}`}
                                disabled={convertingOppId === o.id}
                              >
                                {convertingOppId === o.id
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : isConverted
                                    ? <CheckCircle2 className="h-3 w-3" />
                                    : <FolderPlus className="h-3 w-3" />
                                }
                                {convertingOppId === o.id ? 'Creating…' : isConverted ? 'View Project' : 'Convert to Project'}
                              </button>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                    {items.length === 0 && (
                      <div className="border-2 border-dashed border-muted rounded-lg p-4 text-center text-xs text-muted-foreground">
                        No opportunities
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="space-y-2">
            {filtered.map(o => {
              const stage = STAGES.find(s => s.value === o.stage);
              const isConverted = convertedOppIds.has(o.id);
              return (
                <Card key={o.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className={`w-1.5 h-10 rounded-full shrink-0 ${stage?.color || 'bg-gray-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{o.title}</p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {o.partner_name && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Building2 className="h-3 w-3" /> {o.partner_name}
                            </span>
                          )}
                          {o.expected_close_date && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" /> Close {format(parseISO(o.expected_close_date), 'MMM d, yyyy')}
                            </span>
                          )}
                        </div>
                        {o.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{o.description}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stage?.badge}`}>{stage?.label}</span>
                        <span className="text-sm font-bold">{o.value_usd ? fmtCurrency(o.value_usd) : '—'}</span>
                        {(o.stage === 'won' || o.stage === 'negotiation') && (
                          <button
                            onClick={() => isConverted ? createProjectFromOpp(o) : convertToProject(o)}
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-green-700 hover:text-green-800 hover:bg-green-50 border border-green-200 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50"
                            data-testid={`button-convert-to-project-list-${o.id}`}
                            disabled={convertingOppId === o.id}
                          >
                            {convertingOppId === o.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : isConverted
                                ? <CheckCircle2 className="h-3.5 w-3.5" />
                                : <FolderPlus className="h-3.5 w-3.5" />
                            }
                            {convertingOppId === o.id ? 'Creating…' : isConverted ? 'View Project' : 'Convert'}
                          </button>
                        )}
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(o)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => remove(o.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Opportunity' : 'New Opportunity'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setF('title', e.target.value)} placeholder="UNHCR Emergency Response Fund" />
            </div>
            <div>
              <Label>Partner / Donor</Label>
              <Select value={form.partner_id || 'none'} onValueChange={v => setF('partner_id', v === 'none' ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No partner</SelectItem>
                  {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Value (USD)</Label>
                <Input type="number" min={0} value={form.value_usd ?? ''} onChange={e => setF('value_usd', e.target.value ? Number(e.target.value) : null)} placeholder="50000" />
              </div>
              <div>
                <Label>Stage</Label>
                <Select value={form.stage} onValueChange={v => setF('stage', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Expected Close Date</Label>
              <Input type="date" value={form.expected_close_date || ''} onChange={e => setF('expected_close_date', e.target.value || null)} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea rows={3} value={form.description || ''} onChange={e => setF('description', e.target.value || null)} placeholder="Scope, requirements, key contacts..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editing ? 'Update' : 'Create Opportunity'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
