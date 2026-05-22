import { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2, ShieldCheck, Activity, HeartPulse, ClipboardCheck,
  Lock, ScrollText, Mail, Eye, Smartphone, PenTool, PhoneCall,
  RefreshCw, ScanLine, Database, Info,
} from 'lucide-react';
import { HubLayout } from '@/components/ui/hub-layout';
import { cn } from '@/lib/utils';

const SuperAdminMgmtPanel     = lazy(() => import('../components/superAdmin/SuperAdminManagementPage').then(m => ({ default: m.SuperAdminManagementPage })));
const MonitoringDashboardPanel = lazy(() => import('./MonitoringDashboard'));
const CycleHealthPanel        = lazy(() => import('./AdminCycleHealth'));
const ApprovalDashboardPanel  = lazy(() => import('./ApprovalDashboard'));
const PermissionsPanel        = lazy(() => import('./PermissionsManagement'));
const AuditLogsPanel          = lazy(() => import('./AuditLogs'));
const EmailTrackingPanel      = lazy(() => import('./EmailTracking'));
const EmailManagementPanel    = lazy(() => import('./EmailManagement'));
const EmailPreviewPanel       = lazy(() => import('./EmailPreviewPage'));
const MobileHelpArticlesPanel = lazy(() => import('./MobileHelpArticles'));
const MobileSignaturesPanel   = lazy(() => import('./MobileSignatureAdmin'));
const MobileCallSchedPanel    = lazy(() => import('./MobileCallScheduling'));
const MobileDocSyncPanel      = lazy(() => import('./MobileDocumentSync'));
const TransactionScannerPanel = lazy(() => import('./TransactionScanner'));
const DataManagementPanel     = lazy(() => import('../components/superAdmin/SuperAdminDataManagement').then(m => ({ default: m.SuperAdminDataManagement })));

type SASection = 'monitoring' | 'permissions' | 'email' | 'mobile' | 'data';
type SATab =
  | 'super-admin' | 'system-monitoring' | 'cycle-health' | 'approval-dashboard'
  | 'permissions' | 'audit-logs'
  | 'email-tracking' | 'email-management' | 'email-preview'
  | 'mobile-help-articles' | 'mobile-signatures' | 'mobile-call-scheduling' | 'mobile-document-sync'
  | 'transaction-scanner' | 'data-management';

interface TabDef { id: SATab; label: string; icon: React.ElementType; description: string }
interface SectionDef { id: SASection; label: string; icon: React.ElementType; color: string; description: string; tabs: TabDef[] }

const SECTIONS: SectionDef[] = [
  {
    id: 'monitoring', label: 'Monitoring & Health', icon: Activity, color: '#0f172a',
    description: 'Full platform oversight — system health, MMP cycle status, and pending approval queues.',
    tabs: [
      {
        id: 'super-admin', label: 'Super Admin', icon: ShieldCheck,
        description: 'Top-level administration console — global configuration, tenant management, feature flags, and system-wide override controls.',
      },
      {
        id: 'system-monitoring', label: 'System Monitoring', icon: Activity,
        description: 'Live infrastructure health dashboard — server uptime, API latency, background job queues, error rates, and recent system events.',
      },
      {
        id: 'cycle-health', label: 'Cycle Health Dashboard', icon: HeartPulse,
        description: 'Aggregated MMP cycle health scores across all hubs — track completion rates, coverage gaps, and flagged anomalies for all active cycles.',
      },
      {
        id: 'approval-dashboard', label: 'Approval Dashboard', icon: ClipboardCheck,
        description: 'Cross-module approval queue overview — view all pending financial, HR, and operational approvals with aging indicators and escalation alerts.',
      },
    ],
  },
  {
    id: 'permissions', label: 'Permissions & Audit', icon: Lock, color: '#1e3a5f',
    description: 'User permission overrides, role perspective testing, and full system audit trail.',
    tabs: [
      {
        id: 'permissions', label: 'User Permissions', icon: Lock,
        description: 'Fine-grained permission overrides per user — grant or revoke specific capabilities beyond role defaults, with change log and approval trail.',
      },
      {
        id: 'audit-logs', label: 'Audit Logs', icon: ScrollText,
        description: 'Immutable record of all system actions — user logins, data changes, approvals, and admin operations with timestamps, IPs, and change diffs.',
      },
    ],
  },
  {
    id: 'email', label: 'Email & Comms', icon: Mail, color: '#155e75',
    description: 'Monitor email delivery, manage notification templates, and preview rendered email designs.',
    tabs: [
      {
        id: 'email-tracking', label: 'Email Tracking', icon: Mail,
        description: 'Monitor outbound email delivery — track sent, delivered, opened, and failed messages with timestamps, recipient details, and error codes.',
      },
      {
        id: 'email-management', label: 'Email Management', icon: Mail,
        description: 'Manage email notification templates — edit subject lines, body content, and styling for all automated system emails across notification categories.',
      },
      {
        id: 'email-preview', label: 'Email Preview', icon: Eye,
        description: 'Render and preview any email template with sample data before publishing — test both desktop and mobile layouts for all notification types.',
      },
    ],
  },
  {
    id: 'mobile', label: 'Mobile Config', icon: Smartphone, color: '#065f46',
    description: 'Configure mobile app content, signatures, call scheduling, and document sync settings.',
    tabs: [
      {
        id: 'mobile-help-articles', label: 'Help Articles', icon: Smartphone,
        description: 'Manage in-app help articles for the mobile application — create, edit, and organise FAQs and guidance shown to field staff in the mobile help centre.',
      },
      {
        id: 'mobile-signatures', label: 'Mobile Signatures', icon: PenTool,
        description: 'Administer digital signature configurations for the mobile app — manage signature templates, approval flows, and signer assignments.',
      },
      {
        id: 'mobile-call-scheduling', label: 'Call Scheduling', icon: PhoneCall,
        description: 'Configure scheduled call prompts in the mobile app — set call windows, assign supervisors, and manage call completion tracking.',
      },
      {
        id: 'mobile-document-sync', label: 'Document Sync', icon: RefreshCw,
        description: 'Manage document synchronisation settings for offline mobile use — control which documents are pushed to devices and when sync runs.',
      },
    ],
  },
  {
    id: 'data', label: 'Data & Tools', icon: Database, color: '#4c1d95',
    description: 'AI-powered transaction scanning and raw data management tools.',
    tabs: [
      {
        id: 'transaction-scanner', label: 'Transaction Scanner', icon: ScanLine,
        description: 'AI-powered OCR tool for scanning transaction screenshots — extract amounts, dates, and reference numbers from bank screenshots for verification.',
      },
      {
        id: 'data-management', label: 'Data Management', icon: Database,
        description: 'Raw data management console — bulk imports, data corrections, table-level operations, and maintenance scripts for the production database.',
      },
    ],
  },
];

const ALL_TABS = SECTIONS.flatMap(s => s.tabs.map(t => ({ ...t, sectionId: s.id, sectionColor: s.color })));
const DEFAULT_TAB: SATab = 'super-admin';

const PanelMap: Record<SATab, React.LazyExoticComponent<any>> = {
  'super-admin': SuperAdminMgmtPanel,
  'system-monitoring': MonitoringDashboardPanel,
  'cycle-health': CycleHealthPanel,
  'approval-dashboard': ApprovalDashboardPanel,
  'permissions': PermissionsPanel,
  'audit-logs': AuditLogsPanel,
  'email-tracking': EmailTrackingPanel,
  'email-management': EmailManagementPanel,
  'email-preview': EmailPreviewPanel,
  'mobile-help-articles': MobileHelpArticlesPanel,
  'mobile-signatures': MobileSignaturesPanel,
  'mobile-call-scheduling': MobileCallSchedPanel,
  'mobile-document-sync': MobileDocSyncPanel,
  'transaction-scanner': TransactionScannerPanel,
  'data-management': DataManagementPanel,
};

const Spinner = () => (
  <div className="flex items-center justify-center py-24">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

export default function SuperAdminHub() {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab') as SATab | null;
  const _savedSA = localStorage.getItem('hub_last_tab_super_admin') as SATab | null;
  const _defaultSA: SATab = (_savedSA && ALL_TABS.find(t => t.id === _savedSA)) ? _savedSA : DEFAULT_TAB;
  const activeTab: SATab = ALL_TABS.find(t => t.id === rawTab) ? (rawTab as SATab) : _defaultSA;

  const activeTabDef = ALL_TABS.find(t => t.id === activeTab)!;
  const activeSection = SECTIONS.find(s => s.id === activeTabDef.sectionId)!;

  const setTab = (tab: SATab) => {
    localStorage.setItem('hub_last_tab_super_admin', tab);
    const next = new URLSearchParams(params);
    next.set('tab', tab);
    setParams(next, { replace: true });
  };

  const Panel = PanelMap[activeTab];

  return (
    <HubLayout
      title="Super Admin Hub"
      subtitle="Monitoring · Permissions · Email · Mobile · Data"
      hubIcon={ShieldCheck}
      sections={SECTIONS}
      activeSectionId={activeSection.id}
      activeTabId={activeTab}
      activeTabDescription={activeTabDef.description}
      quickLinks={['dashboard', 'admin', 'my-tasks']}
      onSectionClick={id => setTab(id as SATab)}
      onTabClick={id => setTab(id as SATab)}
    >
      <Suspense fallback={<Spinner />}>
        <Panel />
      </Suspense>
    </HubLayout>
  );
}
