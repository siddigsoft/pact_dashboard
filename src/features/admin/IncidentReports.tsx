import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/shared/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/shared/context/AppContext';
import {
  AlertTriangle, Plus, Search, RefreshCw, X, MapPin,
  Clock, User, FileText, Filter, ChevronDown
} from 'lucide-react';

interface IncidentReport {
  id: string;
  title: string;
  description: string;
  incident_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  location: string;
  reported_by: string;
  created_at: string;
  resolved_at?: string;
  actions_taken?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-blue-100 text-blue-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};
const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-100 text-red-800',
  investigating: 'bg-yellow-100 text-yellow-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-800',
};

const INCIDENT_TYPES = ['Security Threat', 'Medical Emergency', 'Vehicle Accident', 'Natural Disaster', 'SOS Alert', 'Equipment Failure', 'Access Denied', 'Harassment', 'Other'];

export default function IncidentReports() {
  const { user } = useAppContext();
  const { toast } = useToast();
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    incident_type: '',
    severity: 'medium' as const,
    location: '',
    actions_taken: '',
  });

  useEffect(() => { fetchReports(); }, []);

  async function fetchReports() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('incident_reports')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) setReports(data as IncidentReport[]);
    } catch {
      // table may not exist yet
    } finally {
      setLoading(false);
    }
  }

  async function submitReport() {
    if (!form.title || !form.description || !form.incident_type) {
      toast({ title: 'Please fill all required fields', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('incident_reports').insert({
        ...form,
        status: 'open',
        reported_by: user?.id,
      });
      if (error) throw error;
      toast({ title: 'Incident report submitted successfully' });
      setShowForm(false);
      setForm({ title: '', description: '', incident_type: '', severity: 'medium', location: '', actions_taken: '' });
      fetchReports();
    } catch (e: any) {
      toast({ title: 'Failed to submit report', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    try {
      await supabase.from('incident_reports').update({
        status,
        ...(status === 'resolved' ? { resolved_at: new Date().toISOString() } : {}),
      }).eq('id', id);
      toast({ title: 'Status updated' });
      fetchReports();
    } catch {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    }
  }

  const filtered = reports.filter(r => {
    const matchSearch = r.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.location?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchSeverity = filterSeverity === 'all' || r.severity === filterSeverity;
    const matchStatus = filterStatus === 'all' || r.status === filterStatus;
    return matchSearch && matchSeverity && matchStatus;
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="w-7 h-7 text-orange-600" />
            Incident Reports
          </h1>
          <p className="text-muted-foreground mt-1">Track and manage field incidents, emergencies, and safety events</p>
        </div>
        <Button onClick={() => setShowForm(true)} data-testid="button-new-incident">
          <Plus className="w-4 h-4 mr-2" /> New Incident
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: reports.length, color: 'text-foreground' },
          { label: 'Open', value: reports.filter(r => r.status === 'open').length, color: 'text-red-600' },
          { label: 'Investigating', value: reports.filter(r => r.status === 'investigating').length, color: 'text-yellow-600' },
          { label: 'Resolved', value: reports.filter(r => r.status === 'resolved').length, color: 'text-green-600' },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="pt-4 pb-4 text-center">
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {showForm && (
        <Card className="border-orange-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">New Incident Report</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setShowForm(false)} data-testid="button-close-form"><X className="w-4 h-4" /></Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input placeholder="Brief incident title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} data-testid="input-incident-title" />
              </div>
              <div className="space-y-2">
                <Label>Incident Type *</Label>
                <Select value={form.incident_type} onValueChange={v => setForm(f => ({ ...f, incident_type: v }))}>
                  <SelectTrigger data-testid="select-incident-type"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>{INCIDENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Severity *</Label>
                <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v as any }))}>
                  <SelectTrigger data-testid="select-severity"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input placeholder="GPS or address" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} data-testid="input-location" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea rows={4} placeholder="Detailed description of what happened..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} data-testid="textarea-description" />
            </div>
            <div className="space-y-2">
              <Label>Immediate Actions Taken</Label>
              <Textarea rows={2} placeholder="What steps were immediately taken..." value={form.actions_taken} onChange={e => setForm(f => ({ ...f, actions_taken: e.target.value }))} data-testid="textarea-actions" />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={submitReport} disabled={submitting} data-testid="button-submit-incident">
                {submitting ? 'Submitting...' : 'Submit Report'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search incidents..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} data-testid="input-search" />
        </div>
        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-36" data-testid="select-filter-severity"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36" data-testid="select-filter-status"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="investigating">Investigating</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={fetchReports} data-testid="button-refresh"><RefreshCw className="w-4 h-4" /></Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading reports...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">{reports.length === 0 ? 'No incidents reported yet.' : 'No incidents match your filters.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(report => (
            <Card key={report.id} data-testid={`card-incident-${report.id}`}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{report.title}</p>
                      <Badge className={SEVERITY_COLORS[report.severity] || ''}>{report.severity}</Badge>
                      <Badge className={STATUS_COLORS[report.status] || ''}>{report.status}</Badge>
                      {report.incident_type && <Badge variant="outline">{report.incident_type}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{report.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                      {report.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{report.location}</span>}
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(report.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {report.status === 'open' && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(report.id, 'investigating')} data-testid={`button-investigate-${report.id}`}>Investigate</Button>
                    )}
                    {report.status === 'investigating' && (
                      <Button size="sm" variant="outline" className="text-green-700 border-green-300" onClick={() => updateStatus(report.id, 'resolved')} data-testid={`button-resolve-${report.id}`}>Resolve</Button>
                    )}
                    {report.status === 'resolved' && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(report.id, 'closed')} data-testid={`button-close-${report.id}`}>Close</Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
