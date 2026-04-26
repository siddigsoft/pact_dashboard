import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import {
  Handshake, Users, MessageSquare, TrendingUp, Plus,
  Building2, ArrowRight, DollarSign, Target,
  RefreshCw, Loader2, CheckCircle2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

const TYPE_COLORS: Record<string, string> = {
  donor: 'bg-blue-500',
  partner: 'bg-green-500',
  contractor: 'bg-orange-500',
  un_agency: 'bg-purple-500',
  ngo: 'bg-teal-500',
  government: 'bg-red-500',
};

const STAGE_COLORS: Record<string, string> = {
  prospect: 'bg-gray-400',
  proposal: 'bg-blue-400',
  negotiation: 'bg-yellow-400',
  won: 'bg-green-500',
  lost: 'bg-red-400',
};

const ENGAGEMENT_EMOJI: Record<string, string> = {
  meeting: '🤝',
  call: '📞',
  email: '✉️',
  visit: '🏢',
  report: '📋',
  proposal: '📄',
};

function fmtCurrency(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export default function CRMDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalPartners: 0, activePartners: 0, totalContacts: 0, totalEngagements: 0, openOpportunities: 0, pipelineValue: 0 });
  const [recentEngagements, setRecentEngagements] = useState<any[]>([]);
  const [partnerDist, setPartnerDist] = useState<{ type: string; count: number }[]>([]);
  const [recentPartners, setRecentPartners] = useState<any[]>([]);
  const [topOpportunities, setTopOpportunities] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [
        { data: partners },
        { data: contacts },
        { data: engagements },
        { data: opportunities },
      ] = await Promise.all([
        supabase.from('crm_partners').select('id, name, type, status, country, created_at').order('created_at', { ascending: false }),
        supabase.from('crm_contacts').select('id'),
        supabase.from('crm_engagements').select('id, subject, type, date, partner_id').order('date', { ascending: false }).limit(50),
        supabase.from('crm_opportunities').select('id, title, stage, value_usd, partner_id'),
      ]);

      const partnerMap: Record<string, string> = {};
      (partners || []).forEach((p: any) => { partnerMap[p.id] = p.name; });

      const dist: Record<string, number> = {};
      (partners || []).forEach((p: any) => { dist[p.type] = (dist[p.type] || 0) + 1; });

      const openOpps = (opportunities || []).filter((o: any) => !['won', 'lost'].includes(o.stage));
      const pipelineValue = openOpps.reduce((s: number, o: any) => s + (o.value_usd || 0), 0);

      setStats({
        totalPartners: (partners || []).length,
        activePartners: (partners || []).filter((p: any) => p.status === 'active').length,
        totalContacts: (contacts || []).length,
        totalEngagements: (engagements || []).length,
        openOpportunities: openOpps.length,
        pipelineValue,
      });

      setRecentEngagements(
        (engagements || []).slice(0, 6).map((e: any) => ({ ...e, partner_name: partnerMap[e.partner_id] || 'Unknown' }))
      );
      setPartnerDist(Object.entries(dist).map(([type, count]) => ({ type, count: count as number })).sort((a, b) => b.count - a.count));
      setRecentPartners((partners || []).slice(0, 5));
      setTopOpportunities(
        openOpps.sort((a: any, b: any) => (b.value_usd || 0) - (a.value_usd || 0)).slice(0, 5)
          .map((o: any) => ({ ...o, partner_name: partnerMap[o.partner_id] || null }))
      );
    } catch {
      toast({ title: 'Failed to load CRM data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const kpis = [
    { label: 'Total Partners', value: stats.totalPartners, icon: Building2, path: '/crm/partners' },
    { label: 'Active Partners', value: stats.activePartners, icon: CheckCircle2, path: '/crm/partners' },
    { label: 'Contacts', value: stats.totalContacts, icon: Users, path: '/crm/contacts' },
    { label: 'Engagements', value: stats.totalEngagements, icon: MessageSquare, path: '/crm/engagements' },
    { label: 'Open Deals', value: stats.openOpportunities, icon: Target, path: '/crm/opportunities' },
    { label: 'Pipeline Value', value: fmtCurrency(stats.pipelineValue), icon: DollarSign, path: '/crm/opportunities' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="px-6 pt-4">
        <PageInfoBanner
          title="CRM Dashboard"
          description="Your at-a-glance view of every external relationship — partners (donors, government, NGOs), the contacts inside them, recent engagements (meetings, calls, emails), and active opportunities (proposals, contracts in pipeline). Use the deeper CRM pages to drill into each list. This dashboard is visible to admins, leadership, and assigned account managers only."
          descriptionAr="نظرة سريعة على كل علاقة خارجية — الشركاء (الممولون، الحكومة، المنظمات غير الحكومية)، جهات الاتصال داخلهم، المشاركات الأخيرة (الاجتماعات، المكالمات، رسائل البريد الإلكتروني)، والفرص النشطة (المقترحات، العقود في الانتظار). استخدم صفحات CRM الأعمق للتعمق في كل قائمة. هذه اللوحة مرئية للمسؤولين والقيادة ومديري الحسابات المعينين فقط."
        />
      </div>
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0F2041] to-[#1D3461] text-white px-6 py-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Handshake className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">CRM Overview</h1>
              <p className="text-blue-200 text-sm">Partners, contacts, engagements &amp; pipeline</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}
            className="border-white/30 text-white hover:bg-white/10">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-6">
          {kpis.map((k) => (
            <button key={k.label} onClick={() => navigate(k.path)}
              className="bg-white/10 hover:bg-white/20 transition-colors rounded-xl p-3 text-left border border-white/10">
              <div className="text-blue-200 text-xs font-medium mb-1">{k.label}</div>
              <div className="text-white text-xl font-bold">{loading ? '—' : String(k.value)}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Engagements */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-semibold">Recent Engagements</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/crm/engagements')}
                className="text-xs text-blue-600 hover:text-blue-700">
                View all <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-1">
              {loading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : recentEngagements.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">No engagements yet</p>
              ) : recentEngagements.map((e) => (
                <div key={e.id} onClick={() => navigate('/crm/engagements')}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                  <span className="text-lg shrink-0">{ENGAGEMENT_EMOJI[e.type] || '📌'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{e.subject}</p>
                    <p className="text-xs text-muted-foreground truncate">{e.partner_name}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{format(new Date(e.date), 'MMM d')}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Partner Types */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Partner Types</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : partnerDist.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">No partners yet</p>
              ) : partnerDist.map((d) => {
                const pct = stats.totalPartners > 0 ? Math.round((d.count / stats.totalPartners) * 100) : 0;
                return (
                  <div key={d.type} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground capitalize">{d.type.replace('_', ' ')}</span>
                      <span className="font-medium">{d.count}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${TYPE_COLORS[d.type] || 'bg-gray-400'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Partners */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-semibold">Recent Partners</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/crm/partners')}
                className="text-xs text-blue-600 hover:text-blue-700">
                View all <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-1">
              {loading ? (
                <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : recentPartners.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  No partners yet
                  <Button className="mt-3 flex mx-auto" size="sm" onClick={() => navigate('/crm/partners')}>
                    <Plus className="h-4 w-4 mr-1" /> Add Partner
                  </Button>
                </div>
              ) : recentPartners.map((p) => (
                <div key={p.id} onClick={() => navigate('/crm/partners')}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                    <Building2 className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.country || 'No country'}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-xs capitalize">{p.type.replace('_', ' ')}</Badge>
                    <div className={`w-2 h-2 rounded-full ${p.status === 'active' ? 'bg-green-500' : p.status === 'prospect' ? 'bg-yellow-500' : 'bg-gray-400'}`} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Open Pipeline */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-semibold">Open Pipeline</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/crm/opportunities')}
                className="text-xs text-blue-600 hover:text-blue-700">
                View all <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-1">
              {loading ? (
                <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : topOpportunities.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  No open opportunities
                  <Button className="mt-3 flex mx-auto" size="sm" onClick={() => navigate('/crm/opportunities')}>
                    <Plus className="h-4 w-4 mr-1" /> Add Opportunity
                  </Button>
                </div>
              ) : topOpportunities.map((o) => (
                <div key={o.id} onClick={() => navigate('/crm/opportunities')}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                  <div className={`w-1.5 h-10 rounded-full shrink-0 ${STAGE_COLORS[o.stage] || 'bg-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{o.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{o.partner_name || 'No partner'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">{o.value_usd ? fmtCurrency(o.value_usd) : '—'}</p>
                    <p className="text-xs text-muted-foreground capitalize">{o.stage}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Add Partner', icon: Building2, cls: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600', path: '/crm/partners' },
                { label: 'Log Engagement', icon: MessageSquare, cls: 'bg-green-50 dark:bg-green-900/20 text-green-600', path: '/crm/engagements' },
                { label: 'Add Contact', icon: Users, cls: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600', path: '/crm/contacts' },
                { label: 'New Opportunity', icon: TrendingUp, cls: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600', path: '/crm/opportunities' },
              ].map((qa) => (
                <button key={qa.label} onClick={() => navigate(qa.path)}
                  className={`${qa.cls} rounded-xl p-4 text-left hover:opacity-80 transition-opacity flex items-center gap-3`}>
                  <qa.icon className="h-5 w-5 shrink-0" />
                  <span className="text-sm font-medium">{qa.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
