import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Trash2, RefreshCw, Download, Link2, Search, FolderOpen } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';

interface Project { id: string; name: string }
interface Account { id: string; code: string; name_en: string; account_type: string; company_id: string | null }
interface Company { id: string; name_en: string; currency_code: string }
interface ProjectLink {
  id: string; project_id: string; account_id: string; company_id: string | null;
  link_type: string; description: string | null; is_default: boolean; created_at: string;
}

const LINK_TYPE_STYLES: Record<string,string> = {
  expense:   'bg-red-100 text-red-700 border-red-200',
  revenue:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  asset:     'bg-blue-100 text-blue-700 border-blue-200',
  liability: 'bg-purple-100 text-purple-700 border-purple-200',
  clearing:  'bg-amber-100 text-amber-700 border-amber-200',
};

const BLANK = { project_id:'', account_id:'', company_id:'', link_type:'expense', description:'', is_default:false };

export default function AccountingProjectLinks() {
  const { hasAnyRole } = useAuthorization();
  const { currentUser } = useUser();
  const { toast } = useToast();
  const canManage = hasAnyRole(['super_admin','admin','financialAdmin','finance','projectManager','coordinator']);
  const allowed   = hasAnyRole(['super_admin','admin','finance','financialAdmin','accountant','auditor','projectManager','coordinator']);

  const [links, setLinks]         = useState<ProjectLink[]>([]);
  const [projects, setProjects]   = useState<Project[]>([]);
  const [accounts, setAccounts]   = useState<Account[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [typeFilter, setTypeFilter]       = useState('all');
  const [formOpen, setFormOpen]   = useState(false);
  const [form, setForm]           = useState({ ...BLANK });
  const [saving, setSaving]       = useState(false);

  const load = async () => {
    setLoading(true);
    const [lRes, pRes, aRes, cRes] = await Promise.all([
      supabase.from('project_account_links' as any).select('*').order('created_at',{ascending:false}).limit(1000),
      supabase.from('projects').select('id,name').order('name').limit(500),
      supabase.from('acct_accounts').select('id,code,name_en,account_type,company_id').eq('is_active',true).order('code').limit(2000),
      supabase.from('companies' as any).select('id,name_en,currency_code').eq('is_active',true).order('name_en'),
    ]);
    setLinks((lRes.data??[]) as ProjectLink[]);
    setProjects((pRes.data??[]) as Project[]);
    setAccounts((aRes.data??[]) as Account[]);
    setCompanies((cRes.data??[]) as Company[]);
    setLoading(false);
  };
  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const sf = (k: keyof typeof BLANK, v: any) => setForm(p=>({...p,[k]:v}));

  const handleSave = async () => {
    if (!form.project_id || !form.account_id) { toast({title:'Project and Account required',variant:'destructive'}); return; }
    setSaving(true);
    const payload = { project_id:form.project_id, account_id:form.account_id, company_id:form.company_id||null, link_type:form.link_type, description:form.description||null, is_default:form.is_default, created_by:currentUser?.id };
    const { error } = await supabase.from('project_account_links' as any).insert(payload);
    if (error) {
      if (error.code === '23505') toast({title:'Already linked',description:'This project-account combination already exists.',variant:'destructive'});
      else toast({title:'Failed',description:error.message,variant:'destructive'});
    } else { toast({title:'Link created'}); setFormOpen(false); void load(); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('project_account_links' as any).delete().eq('id',id);
    if (error) toast({title:'Failed',description:error.message,variant:'destructive'});
    else { toast({title:'Link removed'}); void load(); }
  };

  const getProject = (id: string) => projects.find(p=>p.id===id)?.name ?? '—';
  const getAccount = (id: string) => accounts.find(a=>a.id===id);
  const getCompany = (id: string | null) => companies.find(c=>c.id===id)?.name_en ?? 'All Companies';

  const filteredAccounts = form.company_id
    ? accounts.filter(a => a.company_id === form.company_id || !a.company_id)
    : accounts;

  const filtered = useMemo(() => links.filter(l => {
    if (projectFilter !== 'all' && l.project_id !== projectFilter) return false;
    if (typeFilter !== 'all' && l.link_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const prj = getProject(l.project_id).toLowerCase();
      const acc = getAccount(l.account_id);
      if (!prj.includes(q) && !(acc?.name_en??'').toLowerCase().includes(q) && !(acc?.code??'').toLowerCase().includes(q)) return false;
    }
    return true;
  }), [links, projectFilter, typeFilter, search]);

  // Group by project
  const grouped = useMemo(() => {
    const map = new Map<string, ProjectLink[]>();
    for (const l of filtered) {
      if (!map.has(l.project_id)) map.set(l.project_id, []);
      map.get(l.project_id)!.push(l);
    }
    return [...map.entries()].map(([pid, ls]) => ({ pid, name: getProject(pid), links: ls }));
  }, [filtered]);

  if (!allowed) return null;

  return (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap items-center gap-2">
        <Link2 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Project ↔ Account Links</h2>
        <p className="text-xs text-muted-foreground">Link any account from any COA to a project for GL dimension tracking</p>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" className="pl-7 w-40 h-8 text-sm" />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="All Projects" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map(p=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.keys(LINK_TYPE_STYLES).map(t=><SelectItem key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" onClick={()=>exportToExcel(filtered.map(l=>({Project:getProject(l.project_id),Account:getAccount(l.account_id)?.code??'',AccountName:getAccount(l.account_id)?.name_en??'',Type:l.link_type,Company:getCompany(l.company_id),Default:l.is_default?'Yes':'No',Description:l.description??''})),'Project Account Links','project-account-links.xlsx')}>
          <Download className="h-4 w-4 mr-1"/>Export
        </Button>
        {canManage && <Button size="sm" onClick={()=>{setForm({...BLANK});setFormOpen(true);}}><Plus className="h-4 w-4 mr-1" />Add Link</Button>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label:'Total Links',  val:filtered.length,     cls:'' },
          { label:'Projects',     val:grouped.length,      cls:'' },
          { label:'Expense Links',val:filtered.filter(l=>l.link_type==='expense').length, cls:'text-red-700' },
        ].map(k=>(
          <Card key={k.label}><CardContent className="p-3"><p className="text-xs text-muted-foreground">{k.label}</p><p className={`text-xl font-bold mt-0.5 ${k.cls}`}>{k.val}</p></CardContent></Card>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> :
      grouped.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg">
          <Link2 className="h-8 w-8 mx-auto mb-2 opacity-30" /><p>No project-account links</p>
          <p className="text-sm mt-1">Link accounts to projects to enable GL dimension tracking per project. One project can have multiple accounts across different COAs.</p>
          {canManage && <Button size="sm" className="mt-4" onClick={()=>{setForm({...BLANK});setFormOpen(true);}}><Plus className="h-4 w-4 mr-1"/>Add Link</Button>}
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(grp => (
            <Card key={grp.pid} className="overflow-hidden">
              <div className="flex items-center gap-2 p-3 bg-muted/20 border-b">
                <FolderOpen className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">{grp.name}</span>
                <Badge variant="outline" className="text-xs ml-1">{grp.links.length} accounts</Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Account Code</TableHead>
                    <TableHead>Account Name</TableHead>
                    <TableHead>Company / COA</TableHead>
                    <TableHead>Link Type</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead>Description</TableHead>
                    {canManage && <TableHead className="w-12" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grp.links.map(l => {
                    const acc = getAccount(l.account_id);
                    return (
                      <TableRow key={l.id} className="text-xs" data-testid={`row-pal-${l.id}`}>
                        <TableCell className="font-mono py-2">{acc?.code??'—'}</TableCell>
                        <TableCell className="py-2">{acc?.name_en??'Unknown Account'}</TableCell>
                        <TableCell className="py-2 text-muted-foreground">{getCompany(l.company_id)}</TableCell>
                        <TableCell className="py-2">
                          <Badge className={`text-[10px] ${LINK_TYPE_STYLES[l.link_type]??''}`}>{l.link_type}</Badge>
                        </TableCell>
                        <TableCell className="py-2">{l.is_default && <Badge variant="outline" className="text-[10px]">Default</Badge>}</TableCell>
                        <TableCell className="py-2 text-muted-foreground max-w-[160px] truncate">{l.description??'—'}</TableCell>
                        {canManage && (
                          <TableCell className="py-2">
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={()=>handleDelete(l.id)} data-testid={`button-delete-pal-${l.id}`}><Trash2 className="h-3 w-3"/></Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Project ↔ Account Link</DialogTitle>
            <DialogDescription>Link one or more accounts from any COA to a project. Each link has a type (expense/revenue/asset etc.) so the system knows how to use it for GL posting.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>Project *</Label>
              <Select value={form.project_id} onValueChange={v=>sf('project_id',v)}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>{projects.map(p=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Company / COA</Label>
              <Select value={form.company_id||'__all'} onValueChange={v=>{ sf('company_id',v==='__all'?'':v); sf('account_id',''); }}>
                <SelectTrigger><SelectValue placeholder="All companies" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All companies</SelectItem>
                  {companies.map(c=><SelectItem key={c.id} value={c.id}>{c.name_en} ({c.currency_code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Account *</Label>
              <Select value={form.account_id} onValueChange={v=>sf('account_id',v)}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {filteredAccounts.map(a=>(
                    <SelectItem key={a.id} value={a.id}>
                      <span className="font-mono">{a.code}</span> — {a.name_en} <span className="text-muted-foreground text-xs">({a.account_type})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Link Type *</Label>
                <Select value={form.link_type} onValueChange={v=>sf('link_type',v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.keys(LINK_TYPE_STYLES).map(t=><SelectItem key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Switch checked={form.is_default} onCheckedChange={v=>sf('is_default',v)} id="pal-default" />
                <Label htmlFor="pal-default" className="text-sm">Set as Default</Label>
              </div>
            </div>
            <div className="space-y-1"><Label>Description (optional)</Label><Input value={form.description} onChange={e=>sf('description',e.target.value)} placeholder="e.g. Operating costs account for this project" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} data-testid="button-save-pal">
              {saving&&<Loader2 className="h-4 w-4 mr-2 animate-spin"/>}<Link2 className="h-4 w-4 mr-2"/>Add Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
