import { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Banknote, Users, FileText, Loader2, Settings2 } from 'lucide-react';
import { ConnectedPagesBar } from '@/components/ui/connected-pages-bar';
import { cn } from '@/lib/utils';

const PayrollPanel      = lazy(() => import('./Payroll'));
const StaffPanel        = lazy(() => import('./StaffDirectory'));
const RetainerPanel     = lazy(() => import('./RetainerManagement'));
const PayrollAdminPanel = lazy(() => import('./PayrollAdmin'));

type HRTab = 'payroll' | 'staff' | 'retainer' | 'payroll-admin';

const TABS: { id: HRTab; label: string; icon: typeof Banknote; color: string }[] = [
  { id: 'payroll',       label: 'My Payroll',      icon: Banknote,   color: '#D97706' },
  { id: 'staff',         label: 'Staff Directory',  icon: Users,      color: '#0F2041' },
  { id: 'retainer',      label: 'Retainer',         icon: FileText,   color: '#7C3AED' },
  { id: 'payroll-admin', label: 'Payroll Admin',    icon: Settings2,  color: '#0891B2' },
];

function PanelLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin opacity-40" />
      <span className="text-sm">Loading…</span>
    </div>
  );
}

export default function HRHub() {
  const [params, setParams] = useSearchParams();
  const tab: HRTab = (params.get('tab') as HRTab) ?? 'payroll';

  const setTab = (t: HRTab) => {
    setParams({ tab: t }, { replace: true });
  };

  const activeTab = TABS.find(t => t.id === tab) ?? TABS[0];

  return (
    <div className="min-h-screen bg-background">
      {/* ── Top nav bar ── */}
      <div className="border-b bg-background sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4">
          {/* Connected pages quick-nav */}
          <div className="pt-3 pb-1">
            <ConnectedPagesBar exclude="hr" />
          </div>

          {/* Page title row */}
          <div className="flex items-center gap-3 py-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: activeTab.color + '20' }}
            >
              <activeTab.icon className="h-4 w-4" style={{ color: activeTab.color }} />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">HR &amp; Finance</h1>
              <p className="text-xs text-muted-foreground">{activeTab.label}</p>
            </div>
          </div>

          {/* Tab strip */}
          <div className="flex gap-0 -mb-px overflow-x-auto">
            {TABS.map(t => {
              const Icon = t.icon;
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  data-testid={`hr-tab-${t.id}`}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap shrink-0',
                    isActive
                      ? 'border-b-2 text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
                  )}
                  style={isActive ? { borderBottomColor: t.color, color: t.color } : {}}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Tab panels ── */}
      <div className="hr-hub-panel">
        {tab === 'payroll' && (
          <Suspense fallback={<PanelLoader />}>
            <PayrollPanel embedded />
          </Suspense>
        )}
        {tab === 'staff' && (
          <Suspense fallback={<PanelLoader />}>
            <StaffPanel />
          </Suspense>
        )}
        {tab === 'retainer' && (
          <Suspense fallback={<PanelLoader />}>
            <RetainerPanel />
          </Suspense>
        )}
        {tab === 'payroll-admin' && (
          <Suspense fallback={<PanelLoader />}>
            <PayrollAdminPanel />
          </Suspense>
        )}
      </div>
    </div>
  );
}
