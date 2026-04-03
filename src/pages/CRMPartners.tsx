import { useState, useEffect, useMemo } from 'react';
import { useAuthorization } from '@/hooks/use-authorization';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { format } from 'date-fns';
import {
  Building2, Plus, Search, Filter, Phone, Mail, Globe, MapPin,
  User, Calendar, MessageSquare, FileText, ChevronRight, X,
  Edit2, Trash2, Loader2, RefreshCw, ExternalLink, Handshake,
  DollarSign, Users, CheckCircle2, Clock, AlertCircle, FolderKanban,
  MoreVertical, PhoneCall, Send, Briefcase
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';

// ─── Types ────────────────────────────────────────────────────────────────────
interface CRMPartner {
  id: string;
  name: string;
  type: string;
  sector: string | null;
  country: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  focal_point_name: string | null;
  focal_point_email: string | null;
  focal_point_phone: string | null;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface CRMEngagement {
  id: string;
  partner_id: string;
  type: string;
  subject: string;
  notes: string | null;
  date: string;
  created_by: string | null;
  created_at: string;
  creator?: { full_name: string };
}

interface LinkedProject {
  id: string;
  name: string;
  status: string;
  project_code: string | null;
  project_type: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PARTNER_TYPES = [
  { value: 'donor', label: 'Donor' },
  { value: 'partner', label: 'Implementing Partner' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'un_agency', label: 'UN Agency' },
  { value: 'ngo', label: 'NGO' },
  { value: 'government', label: 'Government' },
];

const SECTORS = [
  'Food Security', 'WASH', 'Health', 'Protection', 'Education',
  'Shelter', 'Nutrition', 'Livelihoods', 'Multi-Sector', 'Other'
];

const ENGAGEMENT_TYPES = [
  { value: 'meeting', label: 'Meeting', icon: Users },
  { value: 'call', label: 'Phone Call', icon: PhoneCall },
  { value: 'email', label: 'Email', icon: Send },
  { value: 'visit', label: 'Field Visit', icon: MapPin },
  { value: 'report_submission', label: 'Report Submission', icon: FileText },
  { value: 'proposal', label: 'Proposal', icon: Briefcase },
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active:   { label: 'Active',   color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  inactive: { label: 'Inactive', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  prospect: { label: 'Prospect', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
};

const TYPE_COLOR: Record<string, string> = {
  donor:          'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  partner:        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  contractor:     'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  un_agency:      'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  ngo:            'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  government:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

const ENGAGEMENT_COLOR: Record<string, string> = {
  meeting:           'bg-blue-100 text-blue-700',
  call:              'bg-green-100 text-green-700',
  email:             'bg-purple-100 text-purple-700',
  visit:             'bg-orange-100 text-orange-700',
  report_submission: 'bg-gray-100 text-gray-700',
  proposal:          'bg-amber-100 text-amber-700',
};

// ─── Blank forms ──────────────────────────────────────────────────────────────
const blankPartner = (): Partial<CRMPartner> => ({
  name: '', type: 'partner', sector: '', country: 'Sudan',
  website: '', phone: '', email: '', address: '',
  focal_point_name: '', focal_point_email: '', focal_point_phone: '',
  status: 'active', notes: '',
});

const blankEngagement = () => ({
  type: 'meeting', subject: '', notes: '',
  date: format(new Date(), 'yyyy-MM-dd'),
});

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CRMPartners() {
  const { isSuperAdmin, hasAnyRole } = useAuthorization();
  const { currentUser } = useAppContext();
  const { toast } = useToast();

  const canManage = isSuperAdmin || hasAnyRole(['admin', 'fom', 'projectManager', 'CountryDirector', 'countryDirector']);

  // ── State ──────────────────────────────────────────────────────────────────
  const [partners, setPartners] = useState<CRMPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const [selectedPartner, setSelectedPartner] = useState<CRMPartner | null>(null);
  const [engagements, setEngagements] = useState<CRMEngagement[]>([]);
  const [linkedProjects, setLinkedProjects] = useState<LinkedProject[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [showPartnerDialog, setShowPartnerDialog] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partial<CRMPartner>>(blankPartner());
  const [savingPartner, setSavingPartner] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  const [showEngDialog, setShowEngDialog] = useState(false);
  const [engForm, setEngForm] = useState(blankEngagement());
  const [savingEng, setSavingEng] = useState(false);

  // ── Data loading ───────────────────────────────────────────────────────────
  const loadPartners = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('crm_partners')
      .select('*')
      .order('name');
    if (error) toast({ title: 'Error loading partners', variant: 'destructive' });
    else setPartners(data || []);
    setLoading(false);
  };

  const loadPartnerDetail = async (partner: CRMPartner) => {
    setLoadingDetail(true);
    setEngagements([]);
    setLinkedProjects([]);

    const [{ data: engs }, { data: projs }] = await Promise.all([
      supabase
        .from('crm_engagements')
        .select('*, creator:created_by(full_name)')
        .eq('partner_id', partner.id)
        .order('date', { ascending: false }),
      supabase
        .from('projects')
        .select('id, name, status, project_code, project_type')
        .eq('partner_id', partner.id),
    ]);

    setEngagements((engs as any) || []);
    setLinkedProjects(projs || []);
    setLoadingDetail(false);
  };

  useEffect(() => { loadPartners(); }, []);
  useEffect(() => {
    if (selectedPartner) loadPartnerDetail(selectedPartner);
  }, [selectedPartner?.id]);

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return partners.filter(p => {
      const matchSearch = !q || p.name.toLowerCase().includes(q) ||
        (p.focal_point_name || '').toLowerCase().includes(q) ||
        (p.sector || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q);
      const matchType = filterType === 'all' || p.type === filterType;
      const matchStatus = filterStatus === 'all' || p.status === filterStatus;
      return matchSearch && matchType && matchStatus;
    });
  }, [partners, search, filterType, filterStatus]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:    partners.length,
    donors:   partners.filter(p => p.type === 'donor').length,
    active:   partners.filter(p => p.status === 'active').length,
    prospect: partners.filter(p => p.status === 'prospect').length,
  }), [partners]);

  // ── Save partner ───────────────────────────────────────────────────────────
  const savePartner = async () => {
    if (!editingPartner.name?.trim()) {
      toast({ title: 'Organization name is required', variant: 'destructive' });
      return;
    }
    setSavingPartner(true);
    const payload = { ...editingPartner, updated_at: new Date().toISOString() };

    if (isEditMode && editingPartner.id) {
      const { error } = await supabase.from('crm_partners').update(payload).eq('id', editingPartner.id);
      if (error) { toast({ title: 'Error saving', variant: 'destructive' }); setSavingPartner(false); return; }
      toast({ title: 'Partner updated' });
      if (selectedPartner?.id === editingPartner.id) {
        setSelectedPartner({ ...selectedPartner, ...(payload as CRMPartner) });
      }
    } else {
      const { error } = await supabase.from('crm_partners').insert({ ...payload, created_by: currentUser?.id });
      if (error) { toast({ title: 'Error saving', variant: 'destructive' }); setSavingPartner(false); return; }
      toast({ title: 'Partner added' });
    }
    setSavingPartner(false);
    setShowPartnerDialog(false);
    loadPartners();
  };

  const deletePartner = async (id: string) => {
    if (!confirm('Delete this partner? All engagements will also be removed.')) return;
    const { error } = await supabase.from('crm_partners').delete().eq('id', id);
    if (error) toast({ title: 'Error deleting', variant: 'destructive' });
    else {
      toast({ title: 'Partner removed' });
      if (selectedPartner?.id === id) setSelectedPartner(null);
      loadPartners();
    }
  };

  // ── Save engagement ────────────────────────────────────────────────────────
  const saveEngagement = async () => {
    if (!engForm.subject.trim()) {
      toast({ title: 'Subject is required', variant: 'destructive' });
      return;
    }
    setSavingEng(true);
    const { error } = await supabase.from('crm_engagements').insert({
      ...engForm,
      partner_id: selectedPartner!.id,
      created_by: currentUser?.id,
    });
    if (error) toast({ title: 'Error saving engagement', variant: 'destructive' });
    else {
      toast({ title: 'Engagement logged' });
      setShowEngDialog(false);
      setEngForm(blankEngagement());
      loadPartnerDetail(selectedPartner!);
    }
    setSavingEng(false);
  };

  const openAdd = () => {
    setIsEditMode(false);
    setEditingPartner(blankPartner());
    setShowPartnerDialog(true);
  };

  const openEdit = (p: CRMPartner) => {
    setIsEditMode(true);
    setEditingPartner({ ...p });
    setShowPartnerDialog(true);
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Handshake className="h-5 w-5 text-blue-600" />
              Partners & Donors
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Manage partner organizations, donors, and engagement history
            </p>
          </div>
          {canManage && (
            <Button onClick={openAdd} className="gap-2">
              <Plus className="h-4 w-4" /> Add Organization
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Organizations', value: stats.total, icon: Building2, color: 'text-blue-600' },
            { label: 'Donors', value: stats.donors, icon: DollarSign, color: 'text-purple-600' },
            { label: 'Active', value: stats.active, icon: CheckCircle2, color: 'text-emerald-600' },
            { label: 'Prospects', value: stats.prospect, icon: Clock, color: 'text-amber-600' },
          ].map(s => (
            <Card key={s.label} className="border border-gray-200 dark:border-gray-800">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`rounded-lg bg-gray-100 dark:bg-gray-800 p-2`}>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name, contact, sector..."
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {PARTNER_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="prospect">Prospect</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={loadPartners} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Partner Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Building2 className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-lg font-medium">No organizations found</p>
            {canManage && (
              <Button variant="outline" className="mt-4 gap-2" onClick={openAdd}>
                <Plus className="h-4 w-4" /> Add first organization
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(partner => (
              <Card
                key={partner.id}
                className="border border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700 cursor-pointer transition-all hover:shadow-md"
                onClick={() => setSelectedPartner(partner)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${TYPE_COLOR[partner.type] || 'bg-gray-100 text-gray-600'}`}>
                          {PARTNER_TYPES.find(t => t.value === partner.type)?.label || partner.type}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CONFIG[partner.status]?.color || ''}`}>
                          {STATUS_CONFIG[partner.status]?.label || partner.status}
                        </span>
                      </div>
                      <h3 className="font-semibold text-gray-900 dark:text-white text-sm leading-snug line-clamp-2">
                        {partner.name}
                      </h3>
                      {partner.sector && (
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{partner.sector}</p>
                      )}
                    </div>
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={e => { e.stopPropagation(); openEdit(partner); }}>
                            <Edit2 className="h-3.5 w-3.5 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={e => { e.stopPropagation(); deletePartner(partner.id); }}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  <Separator className="my-3" />

                  <div className="space-y-1.5">
                    {partner.focal_point_name && (
                      <div className="flex items-center gap-1.5 text-[12px] text-gray-600 dark:text-gray-400">
                        <User className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{partner.focal_point_name}</span>
                      </div>
                    )}
                    {partner.email && (
                      <div className="flex items-center gap-1.5 text-[12px] text-gray-600 dark:text-gray-400">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{partner.email}</span>
                      </div>
                    )}
                    {partner.phone && (
                      <div className="flex items-center gap-1.5 text-[12px] text-gray-600 dark:text-gray-400">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span>{partner.phone}</span>
                      </div>
                    )}
                    {partner.country && (
                      <div className="flex items-center gap-1.5 text-[12px] text-gray-600 dark:text-gray-400">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span>{partner.country}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[11px] text-gray-400">
                      Added {format(new Date(partner.created_at), 'MMM d, yyyy')}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── Partner Detail Sheet ──────────────────────────────────────────── */}
      <Sheet open={!!selectedPartner} onOpenChange={open => { if (!open) setSelectedPartner(null); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0">
          {selectedPartner && (
            <>
              {/* Sheet header */}
              <div className="bg-[#0F2041] text-white p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-white/20 text-white">
                        {PARTNER_TYPES.find(t => t.value === selectedPartner.type)?.label || selectedPartner.type}
                      </span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CONFIG[selectedPartner.status]?.color || ''}`}>
                        {STATUS_CONFIG[selectedPartner.status]?.label}
                      </span>
                    </div>
                    <h2 className="font-bold text-lg leading-snug">{selectedPartner.name}</h2>
                    {selectedPartner.sector && (
                      <p className="text-blue-200 text-sm mt-0.5">{selectedPartner.sector}</p>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm" variant="ghost"
                        className="text-white hover:bg-white/20 gap-1.5"
                        onClick={() => openEdit(selectedPartner)}
                      >
                        <Edit2 className="h-3.5 w-3.5" /> Edit
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-5">
                <Tabs defaultValue="info">
                  <TabsList className="w-full">
                    <TabsTrigger value="info" className="flex-1">Info</TabsTrigger>
                    <TabsTrigger value="engagements" className="flex-1">
                      Engagements {engagements.length > 0 && `(${engagements.length})`}
                    </TabsTrigger>
                    <TabsTrigger value="projects" className="flex-1">
                      Projects {linkedProjects.length > 0 && `(${linkedProjects.length})`}
                    </TabsTrigger>
                  </TabsList>

                  {/* ─ Info Tab ─ */}
                  <TabsContent value="info" className="mt-4 space-y-4">
                    {loadingDetail ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: 'Country', value: selectedPartner.country, icon: MapPin },
                            { label: 'Website', value: selectedPartner.website, icon: Globe, isLink: true },
                            { label: 'Phone', value: selectedPartner.phone, icon: Phone },
                            { label: 'Email', value: selectedPartner.email, icon: Mail },
                            { label: 'Address', value: selectedPartner.address, icon: Building2 },
                          ].filter(f => f.value).map(field => (
                            <div key={field.label} className="col-span-2 sm:col-span-1">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">{field.label}</p>
                              <div className="flex items-center gap-1.5">
                                <field.icon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                {field.isLink && field.value ? (
                                  <a href={field.value.startsWith('http') ? field.value : `https://${field.value}`}
                                    target="_blank" rel="noreferrer"
                                    className="text-sm text-blue-600 hover:underline truncate flex items-center gap-1">
                                    {field.value} <ExternalLink className="h-3 w-3" />
                                  </a>
                                ) : (
                                  <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{field.value}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {(selectedPartner.focal_point_name || selectedPartner.focal_point_email || selectedPartner.focal_point_phone) && (
                          <>
                            <Separator />
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Focal Point / Primary Contact</p>
                              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-1.5">
                                {selectedPartner.focal_point_name && (
                                  <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                    <User className="h-3.5 w-3.5 text-gray-400" />
                                    <span className="font-medium">{selectedPartner.focal_point_name}</span>
                                  </div>
                                )}
                                {selectedPartner.focal_point_email && (
                                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                    <Mail className="h-3.5 w-3.5" />
                                    <a href={`mailto:${selectedPartner.focal_point_email}`} className="hover:underline text-blue-600">
                                      {selectedPartner.focal_point_email}
                                    </a>
                                  </div>
                                )}
                                {selectedPartner.focal_point_phone && (
                                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                    <Phone className="h-3.5 w-3.5" />
                                    <span>{selectedPartner.focal_point_phone}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </>
                        )}

                        {selectedPartner.notes && (
                          <>
                            <Separator />
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Notes</p>
                              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{selectedPartner.notes}</p>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </TabsContent>

                  {/* ─ Engagements Tab ─ */}
                  <TabsContent value="engagements" className="mt-4">
                    {canManage && (
                      <Button
                        size="sm" className="w-full gap-2 mb-4"
                        onClick={() => { setEngForm(blankEngagement()); setShowEngDialog(true); }}
                      >
                        <Plus className="h-4 w-4" /> Log Engagement
                      </Button>
                    )}
                    {loadingDetail ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
                    ) : engagements.length === 0 ? (
                      <div className="text-center py-10 text-gray-400">
                        <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No engagements logged yet</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {engagements.map(eng => {
                          const engMeta = ENGAGEMENT_TYPES.find(t => t.value === eng.type);
                          const EngIcon = engMeta?.icon || MessageSquare;
                          return (
                            <div key={eng.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                              <div className="flex items-start gap-2">
                                <div className="rounded-md bg-gray-100 dark:bg-gray-800 p-1.5 shrink-0">
                                  <EngIcon className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${ENGAGEMENT_COLOR[eng.type] || 'bg-gray-100 text-gray-600'}`}>
                                      {engMeta?.label || eng.type}
                                    </span>
                                    <span className="text-[11px] text-gray-400 flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {format(new Date(eng.date), 'MMM d, yyyy')}
                                    </span>
                                  </div>
                                  <p className="text-sm font-medium text-gray-900 dark:text-white">{eng.subject}</p>
                                  {eng.notes && (
                                    <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-1 whitespace-pre-line">{eng.notes}</p>
                                  )}
                                  {eng.creator && (
                                    <p className="text-[11px] text-gray-400 mt-1">Logged by {(eng.creator as any).full_name}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>

                  {/* ─ Projects Tab ─ */}
                  <TabsContent value="projects" className="mt-4">
                    {loadingDetail ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
                    ) : linkedProjects.length === 0 ? (
                      <div className="text-center py-10 text-gray-400">
                        <FolderKanban className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No linked projects yet</p>
                        <p className="text-[12px] mt-1">Link this partner to a project from the Projects page</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {linkedProjects.map(proj => (
                          <div key={proj.id} className="flex items-center gap-3 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                            <FolderKanban className="h-4 w-4 text-blue-600 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{proj.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {proj.project_code && (
                                  <span className="text-[11px] text-gray-400">{proj.project_code}</span>
                                )}
                                <span className="text-[11px] text-gray-400 capitalize">{proj.status}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Add/Edit Partner Dialog ───────────────────────────────────────── */}
      <Dialog open={showPartnerDialog} onOpenChange={setShowPartnerDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditMode ? 'Edit Organization' : 'Add Organization'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            {/* Name */}
            <div className="sm:col-span-2">
              <Label>Organization Name *</Label>
              <Input
                placeholder="e.g. World Food Programme"
                value={editingPartner.name || ''}
                onChange={e => setEditingPartner(p => ({ ...p, name: e.target.value }))}
                className="mt-1"
              />
            </div>

            {/* Type */}
            <div>
              <Label>Type *</Label>
              <Select value={editingPartner.type || 'partner'} onValueChange={v => setEditingPartner(p => ({ ...p, type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PARTNER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div>
              <Label>Status *</Label>
              <Select value={editingPartner.status || 'active'} onValueChange={v => setEditingPartner(p => ({ ...p, status: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sector */}
            <div>
              <Label>Sector</Label>
              <Select value={editingPartner.sector || ''} onValueChange={v => setEditingPartner(p => ({ ...p, sector: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select sector" /></SelectTrigger>
                <SelectContent>
                  {SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Country */}
            <div>
              <Label>Country</Label>
              <Input
                value={editingPartner.country || ''}
                onChange={e => setEditingPartner(p => ({ ...p, country: e.target.value }))}
                className="mt-1"
              />
            </div>

            {/* Email */}
            <div>
              <Label>Organization Email</Label>
              <Input
                type="email"
                placeholder="info@org.org"
                value={editingPartner.email || ''}
                onChange={e => setEditingPartner(p => ({ ...p, email: e.target.value }))}
                className="mt-1"
              />
            </div>

            {/* Phone */}
            <div>
              <Label>Organization Phone</Label>
              <Input
                placeholder="+249..."
                value={editingPartner.phone || ''}
                onChange={e => setEditingPartner(p => ({ ...p, phone: e.target.value }))}
                className="mt-1"
              />
            </div>

            {/* Website */}
            <div>
              <Label>Website</Label>
              <Input
                placeholder="www.org.org"
                value={editingPartner.website || ''}
                onChange={e => setEditingPartner(p => ({ ...p, website: e.target.value }))}
                className="mt-1"
              />
            </div>

            {/* Address */}
            <div>
              <Label>Address</Label>
              <Input
                placeholder="Khartoum, Sudan"
                value={editingPartner.address || ''}
                onChange={e => setEditingPartner(p => ({ ...p, address: e.target.value }))}
                className="mt-1"
              />
            </div>

            <Separator className="sm:col-span-2" />
            <p className="sm:col-span-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Focal Point / Primary Contact</p>

            {/* Focal Point Name */}
            <div>
              <Label>Contact Name</Label>
              <Input
                placeholder="Full name"
                value={editingPartner.focal_point_name || ''}
                onChange={e => setEditingPartner(p => ({ ...p, focal_point_name: e.target.value }))}
                className="mt-1"
              />
            </div>

            {/* Focal Point Email */}
            <div>
              <Label>Contact Email</Label>
              <Input
                type="email"
                placeholder="contact@org.org"
                value={editingPartner.focal_point_email || ''}
                onChange={e => setEditingPartner(p => ({ ...p, focal_point_email: e.target.value }))}
                className="mt-1"
              />
            </div>

            {/* Focal Point Phone */}
            <div>
              <Label>Contact Phone</Label>
              <Input
                placeholder="+249..."
                value={editingPartner.focal_point_phone || ''}
                onChange={e => setEditingPartner(p => ({ ...p, focal_point_phone: e.target.value }))}
                className="mt-1"
              />
            </div>

            <Separator className="sm:col-span-2" />

            {/* Notes */}
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Additional notes about this organization..."
                value={editingPartner.notes || ''}
                onChange={e => setEditingPartner(p => ({ ...p, notes: e.target.value }))}
                className="mt-1 min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPartnerDialog(false)}>Cancel</Button>
            <Button onClick={savePartner} disabled={savingPartner}>
              {savingPartner && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditMode ? 'Save Changes' : 'Add Organization'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Log Engagement Dialog ─────────────────────────────────────────── */}
      <Dialog open={showEngDialog} onOpenChange={setShowEngDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log Engagement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Type *</Label>
              <Select value={engForm.type} onValueChange={v => setEngForm(f => ({ ...f, type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENGAGEMENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date *</Label>
              <Input
                type="date"
                value={engForm.date}
                onChange={e => setEngForm(f => ({ ...f, date: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Subject *</Label>
              <Input
                placeholder="Brief title of the engagement"
                value={engForm.subject}
                onChange={e => setEngForm(f => ({ ...f, subject: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                placeholder="Key points, outcomes, next steps..."
                value={engForm.notes}
                onChange={e => setEngForm(f => ({ ...f, notes: e.target.value }))}
                className="mt-1 min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEngDialog(false)}>Cancel</Button>
            <Button onClick={saveEngagement} disabled={savingEng}>
              {savingEng && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Log Engagement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
