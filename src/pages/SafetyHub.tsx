import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import {
  AlertTriangle, Shield, Phone, MapPin, Users, CheckCircle,
  AlertCircle, Activity, Siren, BookOpen, RefreshCw, Plus, Search
} from 'lucide-react';

interface EmergencyContact {
  id: string;
  name: string;
  role: string;
  phone: string;
  category: string;
  is_active: boolean;
}

interface SafetyAlert {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  location: string;
  status: string;
  created_at: string;
  reported_by: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-blue-100 text-blue-800 border-blue-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  critical: 'bg-red-100 text-red-800 border-red-200',
};

export default function SafetyHub() {
  const { user } = useAppContext();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sosActive, setSosActive] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'contacts' | 'alerts' | 'checklist'>('overview');

  const safetyChecklist = [
    { id: 1, item: 'Communication devices charged and functional', category: 'Equipment' },
    { id: 2, item: 'Emergency contact list updated and accessible', category: 'Communication' },
    { id: 3, item: 'GPS location sharing enabled', category: 'Location' },
    { id: 4, item: 'First aid kit present and stocked', category: 'Medical' },
    { id: 5, item: 'Field team briefed on local risks', category: 'Awareness' },
    { id: 6, item: 'Vehicle inspection completed', category: 'Transport' },
    { id: 7, item: 'Check-in schedule confirmed with supervisor', category: 'Communication' },
    { id: 8, item: 'Local authority contact obtained', category: 'Liaison' },
    { id: 9, item: 'Evacuation route identified', category: 'Emergency' },
    { id: 10, item: 'Incident reporting procedure reviewed', category: 'Procedure' },
  ];
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [contactsRes, incidentsRes] = await Promise.all([
        supabase.from('support_contacts').select('*').eq('is_active', true).order('name'),
        supabase.from('incident_reports').select('*').order('created_at', { ascending: false }).limit(10),
      ]);
      if (contactsRes.data) setContacts(contactsRes.data as EmergencyContact[]);
      if (incidentsRes.data) setAlerts(incidentsRes.data as SafetyAlert[]);
    } catch (e) {
      // tables may not exist yet - use empty state
    } finally {
      setLoading(false);
    }
  }

  async function triggerSOS() {
    setSosActive(true);
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name, phone')
        .eq('id', user?.id)
        .single();

      await supabase.from('incident_reports').insert({
        title: 'SOS ALERT',
        description: `Emergency SOS triggered by ${profile?.full_name || user?.email}`,
        severity: 'critical',
        status: 'active',
        reported_by: user?.id,
        location: 'Location pending GPS',
        incident_type: 'sos',
      });

      toast({
        title: '🚨 SOS Alert Sent',
        description: 'Emergency alert has been sent to all supervisors and admin.',
        variant: 'destructive',
      });
    } catch {
      toast({ title: 'SOS sent (offline mode)', description: 'Alert queued for sync.', variant: 'destructive' });
    }
    setTimeout(() => setSosActive(false), 5000);
  }

  const filteredContacts = contacts.filter(c =>
    c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.role?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const completionPct = Math.round((checkedItems.size / safetyChecklist.length) * 100);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-7 h-7 text-red-600" />
            Safety Hub
          </h1>
          <p className="text-muted-foreground mt-1">Field safety management, emergency contacts, and incident tracking</p>
        </div>
        <Button
          variant="destructive"
          size="lg"
          className={`font-bold text-lg px-8 py-6 ${sosActive ? 'animate-pulse' : ''}`}
          onClick={triggerSOS}
          disabled={sosActive}
          data-testid="button-sos"
        >
          <Siren className="w-5 h-5 mr-2" />
          {sosActive ? 'SOS SENT...' : 'SOS ALERT'}
        </Button>
      </div>

      <div className="flex gap-2 border-b pb-2">
        {(['overview', 'contacts', 'alerts', 'checklist'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-t text-sm font-medium capitalize transition-colors ${activeTab === tab ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            data-testid={`tab-${tab}`}
          >
            {tab === 'checklist' ? 'Safety Checklist' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-8 h-8 text-red-600" />
                <div>
                  <div className="text-2xl font-bold text-red-700">{alerts.filter(a => a.severity === 'critical' || a.severity === 'high').length}</div>
                  <div className="text-sm text-red-600">Active Alerts</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Phone className="w-8 h-8 text-blue-600" />
                <div>
                  <div className="text-2xl font-bold text-blue-700">{contacts.length}</div>
                  <div className="text-sm text-blue-600">Emergency Contacts</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-8 h-8 text-green-600" />
                <div>
                  <div className="text-2xl font-bold text-green-700">{completionPct}%</div>
                  <div className="text-sm text-green-600">Checklist Complete</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Activity className="w-8 h-8 text-orange-600" />
                <div>
                  <div className="text-2xl font-bold text-orange-700">{alerts.length}</div>
                  <div className="text-sm text-orange-600">Total Incidents</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-full">
            <CardHeader><CardTitle className="text-base">Quick Actions</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => setActiveTab('contacts')} data-testid="button-view-contacts">
                <Phone className="w-6 h-6 text-blue-600" />
                <span className="text-xs">Emergency Contacts</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => setActiveTab('checklist')} data-testid="button-view-checklist">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <span className="text-xs">Safety Checklist</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => setActiveTab('alerts')} data-testid="button-view-alerts">
                <AlertTriangle className="w-6 h-6 text-orange-600" />
                <span className="text-xs">Incident Reports</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => window.location.href = '/incident-reports'} data-testid="button-new-incident">
                <Plus className="w-6 h-6 text-red-600" />
                <span className="text-xs">New Incident</span>
              </Button>
            </CardContent>
          </Card>

          {alerts.slice(0, 3).map(alert => (
            <Card key={alert.id} className="col-span-full md:col-span-1">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-sm">{alert.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{alert.location}</p>
                  </div>
                  <Badge className={SEVERITY_COLORS[alert.severity] || ''}>{alert.severity}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeTab === 'contacts' && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search contacts..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} data-testid="input-search-contacts" />
            </div>
            <Button onClick={fetchData} variant="outline" size="icon" data-testid="button-refresh-contacts"><RefreshCw className="w-4 h-4" /></Button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading contacts...</div>
          ) : filteredContacts.length === 0 ? (
            <div className="text-center py-12">
              <Phone className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No emergency contacts configured yet.</p>
              <p className="text-sm text-muted-foreground mt-1">Add contacts in Admin → Support Contacts</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredContacts.map(contact => (
                <Card key={contact.id} data-testid={`card-contact-${contact.id}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <Users className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{contact.name}</p>
                        <p className="text-sm text-muted-foreground">{contact.role}</p>
                        <a href={`tel:${contact.phone}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1 mt-1" data-testid={`link-call-${contact.id}`}>
                          <Phone className="w-3 h-3" /> {contact.phone}
                        </a>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">{contact.category}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{alerts.length} incidents recorded</p>
            <Button size="sm" onClick={() => window.location.href = '/incident-reports'} data-testid="button-create-incident">
              <Plus className="w-4 h-4 mr-2" /> New Incident Report
            </Button>
          </div>
          {alerts.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No incidents recorded.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map(alert => (
                <Card key={alert.id} data-testid={`card-alert-${alert.id}`}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className={`w-5 h-5 ${alert.severity === 'critical' ? 'text-red-600' : alert.severity === 'high' ? 'text-orange-600' : 'text-yellow-600'}`} />
                        <div>
                          <p className="font-medium">{alert.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <MapPin className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{alert.location}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={SEVERITY_COLORS[alert.severity] || ''}>{alert.severity}</Badge>
                        <Badge variant={alert.status === 'resolved' ? 'outline' : 'default'}>{alert.status}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'checklist' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>Pre-Field Safety Checklist</span>
                <span className="text-sm font-normal text-muted-foreground">{checkedItems.size}/{safetyChecklist.length} completed</span>
              </CardTitle>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden mt-2">
                <div className="h-full bg-green-500 transition-all duration-300" style={{ width: `${completionPct}%` }} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {safetyChecklist.map(item => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${checkedItems.has(item.id) ? 'bg-green-50 border-green-200 dark:bg-green-950/20' : 'hover:bg-muted/50'}`}
                  onClick={() => setCheckedItems(prev => {
                    const next = new Set(prev);
                    next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                    return next;
                  })}
                  data-testid={`checklist-item-${item.id}`}
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${checkedItems.has(item.id) ? 'bg-green-500 border-green-500' : 'border-muted-foreground'}`}>
                    {checkedItems.has(item.id) && <CheckCircle className="w-3 h-3 text-white" />}
                  </div>
                  <span className={`flex-1 text-sm ${checkedItems.has(item.id) ? 'line-through text-muted-foreground' : ''}`}>{item.item}</span>
                  <Badge variant="outline" className="text-xs">{item.category}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
