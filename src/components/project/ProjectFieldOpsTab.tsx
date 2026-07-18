import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { MapPin, FileSpreadsheet, CheckCircle2, Clock, AlertCircle, Plus, ExternalLink, X, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useProjectContext } from '@/context/project/ProjectContext';
import { Project } from '@/types/project';

interface MmpRow {
  id: string;
  name: string;
  status: string;
  cycle_number?: number;
  total_sites?: number;
  completed_sites?: number;
  created_at: string;
}

interface SiteVisitRow {
  id: string;
  site_name: string;
  status: string;
  assigned_to?: string;
  visit_date?: string;
  created_at: string;
  assignee_name?: string;
}

const SV_STATUS: Record<string, { label: string; cls: string }> = {
  pending:              { label: 'Pending',              cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  assigned:             { label: 'Assigned',             cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  dispatched:           { label: 'Dispatched',           cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  in_progress:          { label: 'In Progress',          cls: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  verification_pending: { label: 'Verification',         cls: 'bg-violet-100 text-violet-700 border-violet-200' },
  completed:            { label: 'Completed',            cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  cancelled:            { label: 'Cancelled',            cls: 'bg-red-100 text-red-700 border-red-200' },
};

interface Props {
  project: Project;
}

export default function ProjectFieldOpsTab({ project }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { updateProject } = useProjectContext();

  const [mmps, setMmps] = useState<MmpRow[]>([]);
  const [siteVisits, setSiteVisits] = useState<SiteVisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkTab, setLinkTab] = useState<'mmp' | 'visit'>('mmp');
  const [searchTerm, setSearchTerm] = useState('');
  const [availableMmps, setAvailableMmps] = useState<MmpRow[]>([]);
  const [availableVisits, setAvailableVisits] = useState<SiteVisitRow[]>([]);
  const [linking, setLinking] = useState(false);

  const relatedMMPs = useMemo(() => project.relatedMMPs || [], [project.relatedMMPs]);
  const relatedSiteVisits = useMemo(() => project.relatedSiteVisits || [], [project.relatedSiteVisits]);

  // Fetch linked MMPs and site visits
  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const [mmpRes, svRes] = await Promise.all([
        relatedMMPs.length > 0
          ? supabase.from('mmp_files').select('id, name, status, cycle_number, total_sites, completed_sites, created_at').in('id', relatedMMPs)
          : Promise.resolve({ data: [] }),
        relatedSiteVisits.length > 0
          ? supabase.from('site_visits').select('id, site_name, status, assigned_to, visit_date, created_at').in('id', relatedSiteVisits)
          : Promise.resolve({ data: [] }),
      ]);
      setMmps((mmpRes.data || []) as MmpRow[]);

      // Enrich site visits with assignee names
      const svData = (svRes.data || []) as SiteVisitRow[];
      const assigneeIds = [...new Set(svData.map(sv => sv.assigned_to).filter(Boolean))] as string[];
      let nameMap: Record<string, string> = {};
      if (assigneeIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', assigneeIds);
        (profiles || []).forEach((p: any) => { nameMap[p.id] = p.full_name; });
      }
      setSiteVisits(svData.map(sv => ({ ...sv, assignee_name: sv.assigned_to ? nameMap[sv.assigned_to] : undefined })));
      setLoading(false);
    };
    fetch();
  }, [relatedMMPs.join(','), relatedSiteVisits.join(',')]);

  // Fetch available (unlocked) MMPs and visits for linking
  const fetchAvailable = async () => {
    const [mmpRes, svRes] = await Promise.all([
      supabase.from('mmp_files').select('id, name, status, cycle_number, total_sites, completed_sites, created_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('site_visits').select('id, site_name, status, assigned_to, visit_date, created_at').order('created_at', { ascending: false }).limit(200),
    ]);
    setAvailableMmps(((mmpRes.data || []) as MmpRow[]).filter(m => !relatedMMPs.includes(m.id)));
    setAvailableVisits(((svRes.data || []) as SiteVisitRow[]).filter(sv => !relatedSiteVisits.includes(sv.id)));
  };

  const openLinkDialog = async (tab: 'mmp' | 'visit') => {
    setLinkTab(tab);
    setSearchTerm('');
    await fetchAvailable();
    setLinkDialogOpen(true);
  };

  const handleLink = async (type: 'mmp' | 'visit', id: string) => {
    setLinking(true);
    try {
      const updatedMMPs = type === 'mmp' ? [...relatedMMPs, id] : relatedMMPs;
      const updatedSVs = type === 'visit' ? [...relatedSiteVisits, id] : relatedSiteVisits;
      await updateProject({ ...project, relatedMMPs: updatedMMPs, relatedSiteVisits: updatedSVs });
      toast({ title: `${type === 'mmp' ? 'MMP' : 'Site Visit'} linked`, variant: 'success' });
      setLinkDialogOpen(false);
    } catch (e) {
      toast({ title: 'Failed to link', description: String(e), variant: 'destructive' });
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (type: 'mmp' | 'visit', id: string) => {
    try {
      const updatedMMPs = type === 'mmp' ? relatedMMPs.filter(x => x !== id) : relatedMMPs;
      const updatedSVs = type === 'visit' ? relatedSiteVisits.filter(x => x !== id) : relatedSiteVisits;
      await updateProject({ ...project, relatedMMPs: updatedMMPs, relatedSiteVisits: updatedSVs });
      toast({ title: 'Unlinked', variant: 'default' });
    } catch {
      toast({ title: 'Failed to unlink', variant: 'destructive' });
    }
  };

  const filteredMmps = availableMmps.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredVisits = availableVisits.filter(sv => sv.site_name.toLowerCase().includes(searchTerm.toLowerCase()));

  // Stats
  const completedVisits = siteVisits.filter(sv => sv.status === 'completed').length;
  const totalMmpSites = mmps.reduce((s, m) => s + (m.total_sites || 0), 0);
  const completedMmpSites = mmps.reduce((s, m) => s + (m.completed_sites || 0), 0);

  return (
    <div className="space-y-4 mt-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <FileSpreadsheet className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Linked MMPs</span>
            </div>
            <p className="text-2xl font-bold">{mmps.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Site Visits</span>
            </div>
            <p className="text-2xl font-bold">{siteVisits.length}</p>
            <p className="text-xs text-muted-foreground">{completedVisits} completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">MMP Coverage</span>
            </div>
            <p className="text-2xl font-bold">{completedMmpSites}/{totalMmpSites}</p>
            <p className="text-xs text-muted-foreground">sites covered</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">Pending Visits</span>
            </div>
            <p className="text-2xl font-bold">
              {siteVisits.filter(sv => ['pending', 'assigned', 'dispatched', 'in_progress'].includes(sv.status)).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* MMPs section */}
      <Card>
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between border-b">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-blue-500" />
            Linked Monthly Monitoring Plans
            <Badge variant="secondary" className="text-xs">{mmps.length}</Badge>
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => openLinkDialog('mmp')}>
            <Plus className="h-4 w-4 mr-1.5" /> Link MMP
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : mmps.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <FileSpreadsheet className="h-8 w-8 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">No MMPs linked yet</p>
              <Button size="sm" variant="outline" onClick={() => openLinkDialog('mmp')}>
                <Plus className="h-4 w-4 mr-1.5" /> Link an MMP
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {mmps.map(m => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{m.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.total_sites ? `${m.completed_sites || 0}/${m.total_sites} sites` : 'No site data'}
                      {m.cycle_number ? ` · Cycle ${m.cycle_number}` : ''}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[11px] capitalize shrink-0">{m.status}</Badge>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/mmp/${m.id}`)}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleUnlink('mmp', m.id)} className="text-destructive hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Site Visits section */}
      <Card>
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between border-b">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <MapPin className="h-4 w-4 text-green-500" />
            Linked Site Visits
            <Badge variant="secondary" className="text-xs">{siteVisits.length}</Badge>
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => openLinkDialog('visit')}>
            <Plus className="h-4 w-4 mr-1.5" /> Link Visit
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : siteVisits.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <MapPin className="h-8 w-8 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">No site visits linked yet</p>
              <Button size="sm" variant="outline" onClick={() => openLinkDialog('visit')}>
                <Plus className="h-4 w-4 mr-1.5" /> Link a Site Visit
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {siteVisits.map(sv => {
                const statusCfg = SV_STATUS[sv.status] || { label: sv.status, cls: 'bg-gray-100 text-gray-600 border-gray-200' };
                return (
                  <div key={sv.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="h-8 w-8 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center shrink-0">
                      <MapPin className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{sv.site_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {sv.assignee_name ? `Assigned to ${sv.assignee_name}` : 'Unassigned'}
                        {sv.visit_date ? ` · ${sv.visit_date}` : ''}
                      </p>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusCfg.cls} shrink-0`}>
                      {statusCfg.label}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/site-visits/${sv.id}`)}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleUnlink('visit', sv.id)} className="text-destructive hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Link dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Link Field Operation to Project</DialogTitle>
          </DialogHeader>
          <Tabs value={linkTab} onValueChange={v => { setLinkTab(v as 'mmp' | 'visit'); setSearchTerm(''); }}>
            <TabsList className="w-full">
              <TabsTrigger value="mmp" className="flex-1">MMPs</TabsTrigger>
              <TabsTrigger value="visit" className="flex-1">Site Visits</TabsTrigger>
            </TabsList>

            <div className="my-3 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={`Search ${linkTab === 'mmp' ? 'MMPs' : 'site visits'}...`}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            <TabsContent value="mmp" className="mt-0 max-h-[360px] overflow-y-auto space-y-1">
              {filteredMmps.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">No MMPs available to link</p>
              ) : filteredMmps.map(m => (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                  <FileSpreadsheet className="h-4 w-4 text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.total_sites ? `${m.total_sites} sites` : ''}{m.cycle_number ? ` · Cycle ${m.cycle_number}` : ''}</p>
                  </div>
                  <Badge variant="outline" className="text-[11px] capitalize">{m.status}</Badge>
                  <Button size="sm" disabled={linking} onClick={() => handleLink('mmp', m.id)}>Link</Button>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="visit" className="mt-0 max-h-[360px] overflow-y-auto space-y-1">
              {filteredVisits.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">No site visits available to link</p>
              ) : filteredVisits.map(sv => {
                const statusCfg = SV_STATUS[sv.status] || { label: sv.status, cls: '' };
                return (
                  <div key={sv.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                    <MapPin className="h-4 w-4 text-green-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{sv.site_name}</p>
                      <p className="text-xs text-muted-foreground">{sv.visit_date || 'No date'}</p>
                    </div>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${statusCfg.cls}`}>{statusCfg.label}</span>
                    <Button size="sm" disabled={linking} onClick={() => handleLink('visit', sv.id)}>Link</Button>
                  </div>
                );
              })}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
