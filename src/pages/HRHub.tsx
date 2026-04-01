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

const TABS: { id: HRTab; label: string; icon: typeof Banknote; accent: string; bg: string }[] = [
  { id: 'payroll',       label: 'My Payroll',      icon: Banknote,   accent: '#D97706', bg: 'rgba(217,119,6,0.12)'  },
  { id: 'staff',         label: 'Staff Directory',  icon: Users,      accent: '#ffffff', bg: 'rgba(255,255,255,0.12)' },
  { id: 'retainer',      label: 'Retainer',         icon: FileText,   accent: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  { id: 'payroll-admin', label: 'Payroll Admin',    icon: Settings2,  accent: '#67e8f9', bg: 'rgba(103,232,249,0.12)' },
];

function PanelLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin opacity-30" />
      <span className="text-sm font-medium">Loading…</span>
    </div>
  );
}

export default function HRHub() {
  const [params, setParams] = useSearchParams();
  const tab: HRTab = (params.get('tab') as HRTab) ?? 'payroll';
  const setTab = (t: HRTab) => setParams({ tab: t }, { replace: true });
  const activeTab = TABS.find(t => t.id === tab) ?? TABS[0];

  return (
    <div className="min-h-screen bg-[#f5f7fa] dark:bg-[#0d1117]">

      {/* ── Hero Header ───────────────────────────────────────── */}
      <div
        className="sticky top-0 z-30"
        style={{ background: 'linear-gradient(135deg, #0F2041 0%, #1D3461 60%, #1e4080 100%)' }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">

          {/* Connected pages bar */}
          <div className="pt-3 pb-1 opacity-90">
            <ConnectedPagesBar exclude="hr" />
          </div>

          {/* Title row */}
          <div className="flex items-end justify-between pt-3 pb-1 gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: activeTab.bg }}>
                  <activeTab.icon className="h-5 w-5" style={{ color: activeTab.accent }} />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white leading-tight tracking-tight">HR &amp; Finance</h1>
                  <p className="text-xs text-blue-200/80 font-medium">{activeTab.label}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Tab strip */}
          <div className="flex gap-0 overflow-x-auto mt-2 scrollbar-hide -mb-px">
            {TABS.map(t => {
              const Icon = t.icon;
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  data-testid={`hr-tab-${t.id}`}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap shrink-0 select-none',
                    isActive
                      ? 'border-white text-white'
                      : 'border-transparent text-blue-200/60 hover:text-blue-100 hover:border-blue-200/30'
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────── */}
      <div className="min-h-[calc(100vh-130px)]">
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
