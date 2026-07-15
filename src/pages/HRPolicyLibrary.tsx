import { useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useToast } from '@/hooks/use-toast';
import { exportMultiSheetExcel } from '@/utils/report-export';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText, Plus, Search, Filter, CheckCircle2, Clock, AlertTriangle,
  Globe, Archive, Loader2, Eye, Edit, Trash2, Download, Users, BookOpen,
  ChevronDown, ChevronUp, Upload, X, Paperclip, Link, CalendarCheck, UserCircle,
} from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Policy {
  id: string;
  title: string;
  category: string;
  version: string;
  status: string;
  effective_date: string | null;
  content_text: string | null;
  file_url: string | null;
  required_roles: string[];
  published_at: string | null;
  created_by: string | null;
  hub_id: string | null;
  created_at: string;
  updated_at: string;
}

interface PolicyForm {
  title: string;
  category: string;
  version: string;
  effective_date: string;
  content_text: string;
  file_url: string;
  required_roles: string[];
  description: string;
  review_date: string;
  owner: string;
}

interface Employee {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  department_id: string | null;
  hub_id: string | null;
}

interface Acknowledgement {
  policy_id: string;
  user_id: string;
  acknowledged_at: string;
  policy_version: string;
  confirmed_name: string | null;
  ip_address: string | null;
  employee_name?: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const CATEGORIES = ['HR', 'IT', 'Finance', 'Safeguarding', 'Operations', 'Other'];
const CATEGORY_COLORS: Record<string, string> = {
  HR:           'bg-blue-100 text-blue-700 border-blue-200',
  IT:           'bg-purple-100 text-purple-700 border-purple-200',
  Finance:      'bg-amber-100 text-amber-700 border-amber-200',
  Safeguarding: 'bg-red-100 text-red-700 border-red-200',
  Operations:   'bg-green-100 text-green-700 border-green-200',
  Other:        'bg-gray-100 text-gray-700 border-gray-200',
};
const STATUS_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:     { label: 'Draft',     color: 'bg-gray-100 text-gray-600 border-gray-200',   icon: Clock },
  published: { label: 'Published', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: Globe },
  archived:  { label: 'Archived',  color: 'bg-orange-100 text-orange-600 border-orange-200', icon: Archive },
};
const ALL_ROLES = [
  'admin', 'super_admin', 'hr_admin', 'finance', 'ict',
  'datacollector', 'coordinator', 'supervisor', 'fom', 'data_team',
  'project_manager', 'program_manager',
];


const DEFAULT_FORM: PolicyForm = {
  title: '', category: 'HR', version: '1.0',
  effective_date: '', content_text: '', file_url: '', required_roles: [],
  description: '', review_date: '', owner: '',
};

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function HRPolicyLibrary() {
  const { profile } = useUser() as any;
  const { toast }   = useToast();
  const qc          = useQueryClient();
  const { isSuperAdmin, hasAnyRole } = useAuthorization();
  const isAdmin     = isSuperAdmin() || hasAnyRole(['admin', 'super_admin', 'superadmin', 'hr_admin', 'ict']);

  // View mode
  const [view, setView] = useState<'library' | 'compliance'>('library');

  // Library filters
  const [search, setSearch]         = useState('');
  const [catFilter, setCatFilter]   = useState('all');
  const [statFilter, setStatFilter] = useState('all');

  // Dialogs
  const [policyDialog, setPolicyDialog] = useState<{ mode: 'add' | 'edit'; policy?: Policy } | null>(null);
  const [viewPolicy, setViewPolicy]     = useState<Policy | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Policy | null>(null);
  const [form, setForm]   = useState<PolicyForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compliance filters
  const [cmpPolicyFilter, setCmpPolicyFilter]   = useState('all');
  const [cmpDeptFilter, setCmpDeptFilter]       = useState('all');
  const [cmpHubFilter, setCmpHubFilter]         = useState('all');
  const [cmpStatusFilter, setCmpStatusFilter]   = useState('all');
  const [expandedRow, setExpandedRow]           = useState<string | null>(null);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['hr-policies'] });
    qc.invalidateQueries({ queryKey: ['hr-policy-acks'] });
  }, [qc]);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: policies = [], isLoading: policiesLoading } = useQuery<Policy[]>({
    queryKey: ['hr-policies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('hr_policies').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Policy[];
    },
    enabled: isAdmin,
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['hr-policy-employees'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, email, role, department_id, hub_id').eq('is_active', true).order('full_name');
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
    enabled: isAdmin,
  });

  const { data: departments = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['hr-policy-depts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('departments').select('id, name').order('name');
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: isAdmin,
  });

  const { data: hubs = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['hr-policy-hubs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('hubs').select('id, name').order('name').limit(100);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: isAdmin,
    staleTime: 300_000,
  });

  const { data: acks = [] } = useQuery<Acknowledgement[]>({
    queryKey: ['hr-policy-acks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_policy_acknowledgements')
        .select('policy_id, user_id, acknowledged_at, policy_version, confirmed_name, ip_address, employee:profiles!user_id(full_name)')
        .order('acknowledged_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((a: any) => ({ ...a, employee_name: a.employee?.full_name ?? null })) as Acknowledgement[];
    },
    enabled: isAdmin,
  });

  // ── Library derived state ─────────────────────────────────────────────────────
  const filteredPolicies = policies.filter(p => {
    if (catFilter !== 'all' && p.category !== catFilter) return false;
    if (statFilter !== 'all' && p.status !== statFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.version.toLowerCase().includes(q);
    }
    return true;
  });

  const stats = {
    total:     policies.length,
    published: policies.filter(p => p.status === 'published').length,
    draft:     policies.filter(p => p.status === 'draft').length,
    archived:  policies.filter(p => p.status === 'archived').length,
  };

  // ── Compliance derived state ──────────────────────────────────────────────────
  const publishedPolicies = policies.filter(p => p.status === 'published');

  // Build compliance rows: employee × policy
  const complianceRows = publishedPolicies.flatMap(policy => {
    const targetEmps = employees.filter(emp => {
      if (!policy.required_roles || policy.required_roles.length === 0) return true;
      return emp.role && policy.required_roles.includes(emp.role);
    });
    return targetEmps.map(emp => {
      const ack = acks.find(a => a.policy_id === policy.id && a.user_id === emp.id && a.policy_version === policy.version);
      let status: 'acknowledged' | 'overdue' | 'pending' = 'pending';
      if (ack) { status = 'acknowledged'; }
      else if (policy.effective_date) {
        const days = differenceInDays(new Date(), parseISO(policy.effective_date));
        if (days >= 14) status = 'overdue';
      }
      return { policy, employee: emp, ack, status };
    });
  });

  const filteredCompliance = complianceRows.filter(r => {
    if (cmpPolicyFilter !== 'all' && r.policy.id !== cmpPolicyFilter) return false;
    if (cmpDeptFilter !== 'all' && r.employee.department_id !== cmpDeptFilter) return false;
    if (cmpHubFilter !== 'all' && r.employee.hub_id !== cmpHubFilter) return false;
    if (cmpStatusFilter !== 'all' && r.status !== cmpStatusFilter) return false;
    return true;
  });

  // Per-policy completion percentages
  const policyCompletionMap = publishedPolicies.reduce<Record<string, { total: number; done: number }>>((acc, policy) => {
    const targets = complianceRows.filter(r => r.policy.id === policy.id);
    acc[policy.id] = { total: targets.length, done: targets.filter(r => r.status === 'acknowledged').length };
    return acc;
  }, {});

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const openCreate = () => { setForm({ ...DEFAULT_FORM }); setUploadedFileName(null); setPolicyDialog({ mode: 'add' }); };
  const openEdit = (p: Policy) => {
    setForm({
      title: p.title, category: p.category, version: p.version,
      effective_date: p.effective_date ?? '', content_text: p.content_text ?? '',
      file_url: p.file_url ?? '', required_roles: p.required_roles ?? [],
      description: (p as any).description ?? '',
      review_date: (p as any).review_date ?? '',
      owner: (p as any).owner ?? '',
    });
    setUploadedFileName(p.file_url ? decodeURIComponent(p.file_url.split('/').pop() ?? '') : null);
    setPolicyDialog({ mode: 'edit', policy: p });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ALLOWED = ['application/pdf','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (!ALLOWED.includes(file.type)) {
      toast({ title: 'Unsupported file type', description: 'Please upload PDF, Word (.doc/.docx) or Excel (.xls/.xlsx)', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `policies/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from('hr-policies').upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('hr-policies').getPublicUrl(path);
      setForm(f => ({ ...f, file_url: urlData.publicUrl }));
      setUploadedFileName(file.name);
      toast({ title: 'File uploaded', description: file.name });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeFile = () => {
    setForm(f => ({ ...f, file_url: '' }));
    setUploadedFileName(null);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.category || !form.version.trim()) {
      toast({ title: 'Title, category, and version are required', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      const payload = {
        title:          form.title.trim(),
        category:       form.category,
        version:        form.version.trim(),
        effective_date: form.effective_date || null,
        content_text:   form.content_text.trim() || null,
        file_url:       form.file_url.trim() || null,
        required_roles: form.required_roles,
        description:    form.description.trim() || null,
        review_date:    form.review_date || null,
        owner:          form.owner.trim() || null,
        updated_at:     new Date().toISOString(),
      } as any;
      if (policyDialog?.mode === 'edit' && policyDialog.policy) {
        const { error } = await supabase.from('hr_policies').update(payload).eq('id', policyDialog.policy.id);
        if (error) throw error;
        toast({ title: 'Policy updated' });
      } else {
        const { error } = await supabase.from('hr_policies').insert({ ...payload, created_by: profile?.id ?? null });
        if (error) throw error;
        toast({ title: 'Policy created' });
      }
      setPolicyDialog(null);
      invalidate();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handlePublishToggle = async (policy: Policy) => {
    const isPublished = policy.status === 'published';
    const newStatus   = isPublished ? 'draft' : 'published';
    const extra       = isPublished ? {} : { published_at: new Date().toISOString() };
    const { error }   = await supabase.from('hr_policies').update({ status: newStatus, ...extra, updated_at: new Date().toISOString() }).eq('id', policy.id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: isPublished ? 'Policy set to draft' : 'Policy published' });
    invalidate();
  };

  const handleArchive = async (policy: Policy) => {
    const { error } = await supabase.from('hr_policies').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', policy.id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Policy archived' });
    invalidate();
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const { error } = await supabase.from('hr_policies').delete().eq('id', deleteConfirm.id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Policy deleted' });
    setDeleteConfirm(null);
    invalidate();
  };

  const handleExport = async () => {
    const policiesSheet = publishedPolicies.map(p => {
      const comp = policyCompletionMap[p.id];
      return {
        'Policy Title': p.title,
        'Category': p.category,
        'Version': p.version,
        'Effective Date': p.effective_date ?? '',
        'Published At': p.published_at ? format(parseISO(p.published_at), 'd MMM yyyy') : '',
        'Required Roles': (p.required_roles ?? []).join(', ') || 'All staff',
        'Total Employees': comp?.total ?? 0,
        'Acknowledged': comp?.done ?? 0,
        'Completion %': comp && comp.total > 0 ? `${Math.round((comp.done / comp.total) * 100)}%` : '0%',
      };
    });

    const acksSheet = acks.map(a => {
      const policy = policies.find(p => p.id === a.policy_id);
      return {
        'Employee': a.employee_name ?? '',
        'Policy': policy?.title ?? '',
        'Category': policy?.category ?? '',
        'Version': a.policy_version,
        'Confirmed Name': a.confirmed_name ?? '',
        'Acknowledged At': format(parseISO(a.acknowledged_at), 'd MMM yyyy HH:mm'),
        'IP Address': a.ip_address ?? '',
      };
    });

    exportMultiSheetExcel([
      { name: 'Policies', data: policiesSheet },
      { name: 'Acknowledgements', data: acksSheet },
    ], `hr-policy-compliance-${new Date().toISOString().slice(0, 10)}`);
    toast({ title: 'Excel exported', description: `${policiesSheet.length} policies · ${acksSheet.length} acknowledgements` });
  };

  const toggleRole = (role: string) => {
    setForm(f => ({
      ...f,
      required_roles: f.required_roles.includes(role)
        ? f.required_roles.filter(r => r !== role)
        : [...f.required_roles, role],
    }));
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  if (!isAdmin) return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <AlertTriangle className="h-10 w-10 text-amber-400 mb-3" />
      <p className="text-sm font-semibold">HR Admin access required</p>
    </div>
  );

  return (
    <div className="p-5 sm:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-500" /> Policy Library
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage organizational policies and track employee acknowledgements</p>
        </div>
        <div className="flex items-center gap-2">
          {view === 'compliance' && (
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={handleExport} data-testid="button-export-compliance">
              <Download className="h-3.5 w-3.5" /> Export Excel
            </Button>
          )}
          {view === 'library' && (
            <Button size="sm" className="gap-1.5 h-8 text-xs bg-[#0F2041] hover:bg-[#1D3461] text-white" onClick={openCreate} data-testid="button-add-policy">
              <Plus className="h-3.5 w-3.5" /> Add Policy
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Policies', value: stats.total, icon: FileText, color: 'text-blue-500' },
          { label: 'Published',      value: stats.published, icon: Globe, color: 'text-emerald-500' },
          { label: 'Drafts',         value: stats.draft, icon: Clock, color: 'text-amber-500' },
          { label: 'Archived',       value: stats.archived, icon: Archive, color: 'text-orange-400' },
        ].map(s => (
          <Card key={s.label} className="shadow-none border-border/50">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <p className="text-2xl font-bold mt-1">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* View tabs */}
      <div className="flex gap-1 border-b border-border">
        {(['library', 'compliance'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              view === v ? 'border-[#0F2041] text-[#0F2041] dark:text-white dark:border-white' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            data-testid={`tab-${v}`}
          >
            {v === 'library' ? '📚 Library' : '✅ Compliance'}
          </button>
        ))}
      </div>

      {/* ── LIBRARY TAB ── */}
      {view === 'library' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search policies…" className="pl-8 h-8 text-sm" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-policies" />
            </div>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-36 h-8 text-xs"><Filter className="h-3 w-3 mr-1" /><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statFilter} onValueChange={setStatFilter}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {Object.entries(STATUS_META).map(([v, m]) => <SelectItem key={v} value={v}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {policiesLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filteredPolicies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
                <FileText className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold">No policies found</p>
              <p className="text-xs text-muted-foreground mt-1">Add your first policy using the button above.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredPolicies.map(policy => {
                const sm = STATUS_META[policy.status] ?? STATUS_META.draft;
                const comp = policyCompletionMap[policy.id];
                const pct  = comp && comp.total > 0 ? Math.round((comp.done / comp.total) * 100) : null;
                return (
                  <Card key={policy.id} className="shadow-none border-border/60 hover:border-border transition-colors" data-testid={`policy-card-${policy.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm">{policy.title}</p>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${CATEGORY_COLORS[policy.category] ?? ''}`}>{policy.category}</Badge>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${sm.color}`}><sm.icon className="h-2.5 w-2.5 mr-1 inline" />{sm.label}</Badge>
                            <span className="text-[10px] font-mono text-muted-foreground">v{policy.version}</span>
                          </div>
                          <div className="flex flex-wrap gap-4 mt-1.5 text-xs text-muted-foreground">
                            {policy.effective_date && (
                              <span>Effective: {format(parseISO(policy.effective_date), 'd MMM yyyy')}</span>
                            )}
                            {policy.required_roles?.length > 0
                              ? <span className="flex items-center gap-1"><Users className="h-3 w-3" />{policy.required_roles.join(', ')}</span>
                              : <span className="flex items-center gap-1"><Users className="h-3 w-3" />All staff</span>
                            }
                            {pct !== null && policy.status === 'published' && (
                              <span className={`font-medium ${pct === 100 ? 'text-emerald-600' : pct < 50 ? 'text-red-500' : 'text-amber-600'}`}>
                                {comp?.done}/{comp?.total} acknowledged ({pct}%)
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {(policy.content_text || policy.file_url) && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewPolicy(policy)} data-testid={`button-view-${policy.id}`}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(policy)} data-testid={`button-edit-${policy.id}`}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          {policy.status !== 'archived' && (
                            <Button
                              size="sm" variant="outline"
                              className={`h-7 text-xs px-2.5 ${policy.status === 'published' ? 'text-amber-600 border-amber-200 hover:bg-amber-50' : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'}`}
                              onClick={() => handlePublishToggle(policy)}
                              data-testid={`button-toggle-publish-${policy.id}`}
                            >
                              {policy.status === 'published' ? 'Unpublish' : 'Publish'}
                            </Button>
                          )}
                          {policy.status === 'published' && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-orange-500 hover:bg-orange-50 px-2.5" onClick={() => handleArchive(policy)}>
                              Archive
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={() => setDeleteConfirm(policy)} data-testid={`button-delete-${policy.id}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── COMPLIANCE TAB ── */}
      {view === 'compliance' && (
        <div className="space-y-4">
          {/* Completion summary per policy */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Completion by Policy</p>
            {publishedPolicies.length === 0 ? (
              <p className="text-sm text-muted-foreground">No published policies.</p>
            ) : (
              <div className="space-y-2">
                {publishedPolicies.map(p => {
                  const comp = policyCompletionMap[p.id];
                  const pct  = comp && comp.total > 0 ? Math.round((comp.done / comp.total) * 100) : 0;
                  const isExpanded = expandedRow === p.id;
                  return (
                    <Card key={p.id} className="shadow-none border-border/50">
                      <CardContent className="p-3">
                        <button
                          className="w-full flex items-center justify-between gap-3"
                          onClick={() => setExpandedRow(isExpanded ? null : p.id)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border shrink-0 ${CATEGORY_COLORS[p.category] ?? ''}`}>{p.category}</Badge>
                            <span className="text-sm font-medium truncate">{p.title}</span>
                            <span className="text-[10px] font-mono text-muted-foreground shrink-0">v{p.version}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="hidden sm:flex items-center gap-2">
                              <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : pct < 50 ? 'bg-red-400' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                              </div>
                              <span className={`text-xs font-semibold ${pct === 100 ? 'text-emerald-600' : pct < 50 ? 'text-red-500' : 'text-amber-600'}`}>{pct}%</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{comp?.done ?? 0}/{comp?.total ?? 0}</span>
                            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="mt-3 border-t pt-3 space-y-1.5">
                            {complianceRows.filter(r => r.policy.id === p.id).map(row => (
                              <div key={`${row.policy.id}-${row.employee.id}`} className="flex items-center justify-between gap-2 text-xs py-0.5">
                                <span className="truncate text-foreground">{row.employee.full_name ?? row.employee.email}</span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {row.status === 'acknowledged' ? (
                                    <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] px-1.5 py-0">
                                      <CheckCircle2 className="h-2.5 w-2.5 mr-1 inline" />
                                      {format(parseISO(row.ack!.acknowledged_at), 'd MMM yyyy')}
                                    </Badge>
                                  ) : row.status === 'overdue' ? (
                                    <Badge className="bg-red-100 text-red-700 border border-red-200 text-[10px] px-1.5 py-0">
                                      <AlertTriangle className="h-2.5 w-2.5 mr-1 inline" />Overdue
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">Pending</Badge>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Flat compliance table */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Acknowledgement Detail</p>
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={cmpPolicyFilter} onValueChange={setCmpPolicyFilter}>
                <SelectTrigger className="w-52 h-8 text-xs"><SelectValue placeholder="All Policies" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Policies</SelectItem>
                  {publishedPolicies.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={cmpDeptFilter} onValueChange={setCmpDeptFilter}>
                <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="All Departments" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={cmpHubFilter} onValueChange={setCmpHubFilter}>
                <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="All Hubs" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Hubs</SelectItem>
                  {hubs.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={cmpStatusFilter} onValueChange={setCmpStatusFilter}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="All Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="acknowledged">Acknowledged</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground ml-auto">{filteredCompliance.length} records</span>
            </div>

            <Card className="shadow-none border-border/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left font-semibold text-muted-foreground px-4 py-2.5">Employee</th>
                        <th className="text-left font-semibold text-muted-foreground px-3 py-2.5">Policy</th>
                        <th className="text-left font-semibold text-muted-foreground px-3 py-2.5">Version</th>
                        <th className="text-left font-semibold text-muted-foreground px-3 py-2.5">Status</th>
                        <th className="text-left font-semibold text-muted-foreground px-3 py-2.5">Acknowledged At</th>
                        <th className="text-left font-semibold text-muted-foreground px-3 py-2.5">Confirmed Name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCompliance.slice(0, 200).map((row, idx) => (
                        <tr key={`${row.policy.id}-${row.employee.id}`} className={`border-b border-border/30 ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}`}>
                          <td className="px-4 py-2.5 font-medium">{row.employee.full_name ?? row.employee.email}</td>
                          <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[180px]">{row.policy.title}</td>
                          <td className="px-3 py-2.5 font-mono text-muted-foreground">v{row.policy.version}</td>
                          <td className="px-3 py-2.5">
                            {row.status === 'acknowledged' ? (
                              <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] px-1.5 py-0">Acknowledged</Badge>
                            ) : row.status === 'overdue' ? (
                              <Badge className="bg-red-100 text-red-700 border border-red-200 text-[10px] px-1.5 py-0">Overdue</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">Pending</Badge>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">
                            {row.ack ? format(parseISO(row.ack.acknowledged_at), 'd MMM yyyy HH:mm') : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">{row.ack?.confirmed_name ?? '—'}</td>
                        </tr>
                      ))}
                      {filteredCompliance.length === 0 && (
                        <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No records match the selected filters.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {filteredCompliance.length > 200 && (
                  <p className="text-xs text-muted-foreground text-center py-3">Showing first 200 rows. Use Excel export for full data.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── Create/Edit Dialog ── */}
      <Dialog open={!!policyDialog} onOpenChange={v => !v && setPolicyDialog(null)}>
        <DialogContent className="max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{policyDialog?.mode === 'edit' ? 'Edit Policy' : 'New Policy'}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Title *</label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Code of Conduct" className="h-9" data-testid="input-policy-title" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Category *</label>
                  <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Version *</label>
                  <Input value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} placeholder="e.g. 1.0" className="h-9" data-testid="input-policy-version" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Effective Date</label>
                <Input type="date" value={form.effective_date} onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))} className="h-9" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Content / Policy Text</label>
                <Textarea
                  value={form.content_text}
                  onChange={e => setForm(f => ({ ...f, content_text: e.target.value }))}
                  placeholder="Paste or type the full policy text here…"
                  rows={7}
                  className="resize-none text-sm"
                  data-testid="textarea-policy-content"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Short Description / Summary</label>
                <Textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="One or two sentences summarising what this policy covers…"
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><CalendarCheck className="h-3 w-3" /> Next Review Date</label>
                  <Input type="date" value={form.review_date} onChange={e => setForm(f => ({ ...f, review_date: e.target.value }))} className="h-9" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><UserCircle className="h-3 w-3" /> Policy Owner</label>
                  <Input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} placeholder="e.g. HR Manager" className="h-9" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Paperclip className="h-3 w-3" /> Attach Document</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                {uploadedFileName || form.file_url ? (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
                    <FileText className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span className="text-xs text-emerald-700 dark:text-emerald-400 truncate flex-1">
                      {uploadedFileName ?? form.file_url.split('/').pop()}
                    </span>
                    {form.file_url && (
                      <a href={form.file_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-800">
                        <Eye className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button type="button" onClick={removeFile} className="text-red-500 hover:text-red-700">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-full flex flex-col items-center gap-1.5 p-4 rounded-lg border-2 border-dashed border-border hover:border-[#0F2041] hover:bg-muted/40 transition-colors disabled:opacity-50"
                  >
                    {uploading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : (
                      <Upload className="h-5 w-5 text-muted-foreground" />
                    )}
                    <span className="text-xs text-muted-foreground">
                      {uploading ? 'Uploading…' : 'Click to upload PDF, Word or Excel'}
                    </span>
                  </button>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[10px] text-muted-foreground">or paste a link</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="flex items-center gap-2">
                  <Link className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <Input
                    value={form.file_url}
                    onChange={e => { setForm(f => ({ ...f, file_url: e.target.value })); if (!e.target.value) setUploadedFileName(null); else setUploadedFileName(null); }}
                    placeholder="https://sharepoint.com/…"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Required Roles (leave empty = all staff)</label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_ROLES.map(role => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(role)}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                        form.required_roles.includes(role)
                          ? 'bg-[#0F2041] text-white border-[#0F2041]'
                          : 'border-border hover:bg-muted'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {form.required_roles.length === 0 ? 'Policy will apply to all employees.' : `Policy applies to: ${form.required_roles.join(', ')}`}
                </p>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPolicyDialog(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#0F2041] hover:bg-[#1D3461] text-white" data-testid="button-save-policy">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              {policyDialog?.mode === 'edit' ? 'Save Changes' : 'Create Policy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Policy Dialog ── */}
      <Dialog open={!!viewPolicy} onOpenChange={v => !v && setViewPolicy(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {viewPolicy?.title}
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${CATEGORY_COLORS[viewPolicy?.category ?? ''] ?? ''}`}>{viewPolicy?.category}</Badge>
              <span className="text-xs font-mono text-muted-foreground">v{viewPolicy?.version}</span>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[50vh] pr-3">
            {viewPolicy?.content_text ? (
              <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{viewPolicy.content_text}</div>
            ) : viewPolicy?.file_url ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <FileText className="h-10 w-10 text-blue-400" />
                <Button size="sm" onClick={() => window.open(viewPolicy.file_url!, '_blank')}>Open Document</Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-6 text-center">No content.</p>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewPolicy(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ── */}
      <Dialog open={!!deleteConfirm} onOpenChange={v => !v && setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Policy?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete <strong>{deleteConfirm?.title}</strong> and all acknowledgement records.
            This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} data-testid="button-confirm-delete">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
