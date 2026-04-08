
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { format, parseISO, isValid, differenceInDays } from 'date-fns';
import { Award, Plus, AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, X, Upload, ExternalLink, Filter, GraduationCap, BookOpen, Shield, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Cert {
  id: string;
  user_id: string;
  title: string;
  issuing_org: string | null;
  cert_type: string;
  issue_date: string | null;
  expiry_date: string | null;
  cert_number: string | null;
  file_url: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  user_name?: string;
}

const CERT_TYPES = [
  { value: 'training',      label: 'Training',       icon: BookOpen,   color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40' },
  { value: 'certification', label: 'Certification',  icon: Award,      color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40' },
  { value: 'license',       label: 'License',        icon: Shield,     color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40' },
  { value: 'course',        label: 'Course',         icon: GraduationCap, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40' },
  { value: 'workshop',      label: 'Workshop',       icon: Wrench,     color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40' },
];

const BLANK = { title: '', issuing_org: '', cert_type: 'training', issue_date: '', expiry_date: '', cert_number: '', file_url: '', notes: '' };

function getExpiryStatus(expiry: string | null): { label: string; color: string; daysLeft: number | null } {
  if (!expiry) return { label: 'No Expiry', color: 'text-gray-400', daysLeft: null };
  try {
    const d = parseISO(expiry);
    if (!isValid(d)) return { label: 'Invalid', color: 'text-gray-400', daysLeft: null };
    const days = differenceInDays(d, new Date());
    if (days < 0) return { label: 'Expired', color: 'text-red-600', daysLeft: days };
    if (days <= 30) return { label: `${days}d left`, color: 'text-amber-600', daysLeft: days };
    if (days <= 90) return { label: `${days}d left`, color: 'text-yellow-600', daysLeft: days };
    return { label: `${days}d left`, color: 'text-emerald-600', daysLeft: days };
  } catch { return { label: 'Unknown', color: 'text-gray-400', daysLeft: null }; }
}

export default function TrainingCertifications() {
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const { hasAnyRole } = useAuthorization();
  const isAdmin = hasAnyRole(['super_admin', 'admin', 'hr']);

  const [certs, setCerts] = useState<Cert[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('mine');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [targetUserId, setTargetUserId] = useState(currentUser?.id ?? '');

  const load = async () => {
    setLoading(true);
    const query = (isAdmin && userFilter === 'all')
      ? supabase.from('staff_certifications').select('*').order('created_at', { ascending: false })
      : supabase.from('staff_certifications').select('*').eq('user_id', currentUser?.id).order('created_at', { ascending: false });

    const { data } = await query;
    const userIds = [...new Set((data || []).map((c: any) => c.user_id))];
    let profileMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
      (profiles || []).forEach((p: any) => { profileMap[p.id] = p.full_name; });
    }
    setCerts((data || []).map((c: any) => ({ ...c, user_name: profileMap[c.user_id] || 'Unknown' })));
    setLoading(false);
  };

  useEffect(() => { load(); }, [currentUser?.id, userFilter]);

  useEffect(() => {
    if (isAdmin && dialogOpen) {
      supabase.from('profiles').select('id, full_name').order('full_name').then(({ data }) => {
        setUsers(data || []);
      });
    }
  }, [isAdmin, dialogOpen]);

  const filtered = certs.filter(c => {
    if (typeFilter !== 'all' && c.cert_type !== typeFilter) return false;
    if (statusFilter === 'expired') {
      const s = getExpiryStatus(c.expiry_date);
      return s.daysLeft !== null && s.daysLeft < 0;
    }
    if (statusFilter === 'expiring') {
      const s = getExpiryStatus(c.expiry_date);
      return s.daysLeft !== null && s.daysLeft >= 0 && s.daysLeft <= 90;
    }
    if (statusFilter === 'active') {
      const s = getExpiryStatus(c.expiry_date);
      return s.daysLeft === null || s.daysLeft > 90;
    }
    return true;
  });

  const stats = {
    total: certs.length,
    expired: certs.filter(c => { const s = getExpiryStatus(c.expiry_date); return s.daysLeft !== null && s.daysLeft < 0; }).length,
    expiring: certs.filter(c => { const s = getExpiryStatus(c.expiry_date); return s.daysLeft !== null && s.daysLeft >= 0 && s.daysLeft <= 90; }).length,
  };

  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim()) { toast({ title: 'Title is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const payload: any = {
        user_id: isAdmin ? targetUserId : currentUser?.id,
        title: form.title.trim(),
        issuing_org: form.issuing_org.trim() || null,
        cert_type: form.cert_type,
        issue_date: form.issue_date || null,
        expiry_date: form.expiry_date || null,
        cert_number: form.cert_number.trim() || null,
        file_url: form.file_url.trim() || null,
        notes: form.notes.trim() || null,
        created_by: currentUser?.id,
        status: 'active',
      };
      const { error } = await supabase.from('staff_certifications').insert(payload);
      if (error) throw error;
      toast({ title: 'Certification added successfully' });
      setDialogOpen(false);
      setForm({ ...BLANK });
      load();
    } catch (e: any) {
      toast({ title: 'Error saving', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteCert = async (id: string) => {
    if (!confirm('Delete this certification record?')) return;
    const { error } = await supabase.from('staff_certifications').delete().eq('id', id);
    if (error) toast({ title: 'Error deleting', variant: 'destructive' });
    else { toast({ title: 'Deleted' }); load(); }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <Award className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Training & Certifications</h2>
            <p className="text-xs text-muted-foreground">Track qualifications, licenses, and training records</p>
          </div>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mine">My Records</SelectItem>
                <SelectItem value="all">All Staff</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)} className="bg-[#1D3461] hover:bg-[#0F2041] text-white">
            <Plus className="h-4 w-4 mr-1" />Add Record
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Records', value: stats.total, color: 'text-gray-900 dark:text-white' },
          { label: 'Expiring (90d)', value: stats.expiring, color: 'text-amber-600' },
          { label: 'Expired', value: stats.expired, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-card border rounded-xl p-4 text-center">
            <div className={cn('text-2xl font-bold', s.color)}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {stats.expired > 0 && (
        <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl p-4">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-red-800 dark:text-red-300">
            {stats.expired} certification{stats.expired !== 1 ? 's' : ''} have expired — renewal required
          </p>
        </div>
      )}
      {stats.expiring > 0 && stats.expired === 0 && (
        <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4">
          <Clock className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            {stats.expiring} certification{stats.expiring !== 1 ? 's' : ''} expiring within 90 days
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44 h-8 text-xs"><Filter className="h-3.5 w-3.5 mr-1.5" /><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {CERT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expiring">Expiring Soon</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground">
          <Award className="h-12 w-12 mb-3 opacity-30" />
          <p className="font-medium">No certification records found</p>
          <Button className="mt-4" size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />Add First Record
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(cert => {
            const typeCfg = CERT_TYPES.find(t => t.value === cert.cert_type) ?? CERT_TYPES[0];
            const TypeIcon = typeCfg.icon;
            const expiry = getExpiryStatus(cert.expiry_date);
            const isExpired = expiry.daysLeft !== null && expiry.daysLeft < 0;
            const isExpiring = expiry.daysLeft !== null && expiry.daysLeft >= 0 && expiry.daysLeft <= 90;

            return (
              <div
                key={cert.id}
                className={cn(
                  'bg-card border rounded-xl p-4 hover:shadow-sm transition-all',
                  isExpired && 'border-red-200 dark:border-red-800/40',
                  isExpiring && !isExpired && 'border-amber-200 dark:border-amber-800/40',
                )}
                data-testid={`cert-${cert.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', typeCfg.color)}>
                      <TypeIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-gray-900 dark:text-white">{cert.title}</span>
                        <Badge className={cn('text-[10px] px-2', typeCfg.color)}>{typeCfg.label}</Badge>
                        {isAdmin && cert.user_name && (
                          <Badge variant="outline" className="text-[10px] px-2">{cert.user_name}</Badge>
                        )}
                      </div>
                      {cert.issuing_org && (
                        <p className="text-xs text-muted-foreground mt-0.5">{cert.issuing_org}</p>
                      )}
                      <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                        {cert.issue_date && isValid(parseISO(cert.issue_date)) && (
                          <span className="text-xs text-muted-foreground">
                            Issued: {format(parseISO(cert.issue_date), 'dd MMM yyyy')}
                          </span>
                        )}
                        {cert.expiry_date && isValid(parseISO(cert.expiry_date)) && (
                          <span className={cn('text-xs font-semibold flex items-center gap-1', expiry.color)}>
                            {isExpired ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                            Expires: {format(parseISO(cert.expiry_date), 'dd MMM yyyy')} ({expiry.label})
                          </span>
                        )}
                        {!cert.expiry_date && (
                          <span className="text-xs text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />No Expiry
                          </span>
                        )}
                        {cert.cert_number && (
                          <span className="text-xs text-muted-foreground font-mono">#{cert.cert_number}</span>
                        )}
                      </div>
                      {cert.notes && (
                        <p className="text-xs text-muted-foreground/70 mt-1">{cert.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {cert.file_url && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                        <a href={cert.file_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                    {(isAdmin || cert.user_id === currentUser?.id) && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteCert(cert.id)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Award className="h-4 w-4 text-purple-600" />Add Certification / Training Record
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {isAdmin && users.length > 0 && (
              <div>
                <Label>Staff Member</Label>
                <Select value={targetUserId} onValueChange={setTargetUserId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select staff" /></SelectTrigger>
                  <SelectContent>
                    {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Title / Name *</Label>
              <Input value={form.title} onChange={e => setF('title', e.target.value)} placeholder="e.g. First Aid Certificate, OCHA Training" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={form.cert_type} onValueChange={v => setF('cert_type', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CERT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Issuing Organization</Label>
                <Input value={form.issuing_org} onChange={e => setF('issuing_org', e.target.value)} placeholder="WHO, OCHA, Red Cross…" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Issue Date</Label>
                <Input type="date" value={form.issue_date} onChange={e => setF('issue_date', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Expiry Date <span className="text-muted-foreground">(if applicable)</span></Label>
                <Input type="date" value={form.expiry_date} onChange={e => setF('expiry_date', e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Certificate Number <span className="text-muted-foreground">(optional)</span></Label>
              <Input value={form.cert_number} onChange={e => setF('cert_number', e.target.value)} placeholder="CERT-2024-XXXXX" className="mt-1" />
            </div>
            <div>
              <Label className="flex items-center gap-1"><Upload className="h-3.5 w-3.5" />Document URL <span className="text-muted-foreground">(optional)</span></Label>
              <Input value={form.file_url} onChange={e => setF('file_url', e.target.value)} placeholder="https://… or storage path" className="mt-1" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} placeholder="Any additional notes…" className="mt-1 resize-none" />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving} className="bg-[#1D3461] hover:bg-[#0F2041] text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Save Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
