import { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2, ClipboardList, ClipboardCheck, Shield, AlertTriangle,
  Package, Activity, Map, MapPin, Compass, Info,
} from 'lucide-react';
import { HubLayout } from '@/components/ui/hub-layout';
import { cn } from '@/lib/utils';

const SiteVisitsPanel         = lazy(() => import('./SiteVisits'));
const MonitoringFormPanel     = lazy(() => import('./MonitoringForm'));
const CoverageMapPanel        = lazy(() => import('./CoverageMap'));
const SafetyHubPanel          = lazy(() => import('./SafetyHub'));
const IncidentReportsPanel    = lazy(() => import('./IncidentReports'));
const EquipmentPanel          = lazy(() => import('./Equipment'));
const FieldTeamPanel          = lazy(() => import('./FieldTeam'));
const AdvancedMapPanel        = lazy(() => import('./AdvancedMap'));
const FieldOpManagerPanel     = lazy(() => import('./FieldOperationManager'));

type FOSection = 'monitoring' | 'safety' | 'teams';
type FOTab =
  | 'site-visits' | 'monitoring-form' | 'coverage-map'
  | 'safety-hub' | 'incident-reports' | 'equipment'
  | 'field-team' | 'map' | 'field-operation-manager';

interface TabDef { id: FOTab; label: string; icon: React.ElementType; description: string }
interface SectionDef { id: FOSection; label: string; icon: React.ElementType; color: string; description: string; tabs: TabDef[] }

const SECTIONS: SectionDef[] = [
  {
    id: 'monitoring', label: 'Monitoring', icon: ClipboardList, color: '#0284c7',
    description: 'Plan and record field monitoring activities — site visits, data collection forms, and MMP coverage tracking.',
    tabs: [
      {
        id: 'site-visits', label: 'Site Visits', icon: ClipboardList,
        description: 'View, plan, and manage all field site visits — filter by status, cycle, or location; track completion and data collector assignments.',
      },
      {
        id: 'monitoring-form', label: 'Monitoring Form', icon: ClipboardCheck,
        description: 'Submit structured monitoring data for a site visit — answer indicator questions, attach photos, record observations, and save offline.',
      },
      {
        id: 'coverage-map', label: 'MMP Coverage Map', icon: MapPin,
        description: 'Visual map overlay showing MMP site coverage status — completed, pending, and uncovered sites for the active cycle across all locations.',
      },
    ],
  },
  {
    id: 'safety', label: 'Safety & Assets', icon: Shield, color: '#dc2626',
    description: 'Monitor field safety alerts, log incidents, and track equipment issued to field teams.',
    tabs: [
      {
        id: 'safety-hub', label: 'Safety Hub', icon: Shield,
        description: 'Real-time safety dashboard — active alerts, security advisories, check-in status for deployed staff, and emergency contact directory.',
      },
      {
        id: 'incident-reports', label: 'Incident Reports', icon: AlertTriangle,
        description: 'Log, review, and follow up on field incidents — accidents, security events, or operational disruptions — with severity ratings and response tracking.',
      },
      {
        id: 'equipment', label: 'Equipment Tracking', icon: Package,
        description: 'Manage field equipment inventory — track assignments, condition, maintenance schedules, and return status for all assets issued to field staff.',
      },
    ],
  },
  {
    id: 'teams', label: 'Teams & Maps', icon: Activity, color: '#059669',
    description: 'Manage field team composition and visualise operational geography across hubs and sites.',
    tabs: [
      {
        id: 'field-team', label: 'Field Team', icon: Activity,
        description: 'View and manage field team rosters — staff assignments per hub, data collector lists, role confirmations, and deployment readiness.',
      },
      {
        id: 'map', label: 'Field Map', icon: Map,
        description: 'Interactive geographic map showing all registered sites, hubs, and field team positions with filtering by state, locality, and programme.',
      },
      {
        id: 'field-operation-manager', label: 'Field Operation Manager', icon: Compass,
        description: 'Centralised operations console for FOMs — view all active cycles, monitor data collection progress, manage permit workflows, and coordinate across hubs.',
      },
    ],
  },
];

const ALL_TABS = SECTIONS.flatMap(s => s.tabs.map(t => ({ ...t, sectionId: s.id, sectionColor: s.color })));
const DEFAULT_TAB: FOTab = 'site-visits';

const PanelMap: Record<FOTab, React.LazyExoticComponent<any>> = {
  'site-visits': SiteVisitsPanel,
  'monitoring-form': MonitoringFormPanel,
  'coverage-map': CoverageMapPanel,
  'safety-hub': SafetyHubPanel,
  'incident-reports': IncidentReportsPanel,
  'equipment': EquipmentPanel,
  'field-team': FieldTeamPanel,
  'map': AdvancedMapPanel,
  'field-operation-manager': FieldOpManagerPanel,
};

const Spinner = () => (
  <div className="flex items-center justify-center py-24">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

export default function FieldOpsHub() {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab') as FOTab | null;
  const _savedFO = localStorage.getItem('hub_last_tab_field_ops') as FOTab | null;
  const _defaultFO: FOTab = (_savedFO && ALL_TABS.find(t => t.id === _savedFO)) ? _savedFO : DEFAULT_TAB;
  const activeTab: FOTab = ALL_TABS.find(t => t.id === rawTab) ? (rawTab as FOTab) : _defaultFO;

  const activeTabDef = ALL_TABS.find(t => t.id === activeTab)!;
  const activeSection = SECTIONS.find(s => s.id === activeTabDef.sectionId)!;

  const setTab = (tab: FOTab) => {
    localStorage.setItem('hub_last_tab_field_ops', tab);
    const next = new URLSearchParams(params);
    next.set('tab', tab);
    setParams(next, { replace: true });
  };

  const Panel = PanelMap[activeTab];

  return (
    <HubLayout
      title="Field Operations Hub"
      subtitle="Monitoring · Safety · Teams & Maps"
      hubIcon={Compass}
      sections={SECTIONS}
      activeSectionId={activeSection.id}
      activeTabId={activeTab}
      activeTabDescription={activeTabDef.description}
      quickLinks={['dashboard', 'mmp', 'my-tasks', 'reports']}
      onSectionClick={id => setTab(id as FOTab)}
      onTabClick={id => setTab(id as FOTab)}
    >
      <Suspense fallback={<Spinner />}>
        <Panel />
      </Suspense>
    </HubLayout>
  );
}
