import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import {
  AlertTriangle, CheckCircle2, Clock, XCircle, ArrowRight, MapPin,
  ChevronDown, ChevronUp, FileText, Calendar, User, Users, Eye,
  ShieldCheck, FolderOpen, Info, BarChart3, CircleDot, Wallet,
  Building2, Globe, Activity, History
} from 'lucide-react';

interface UncoveredSite {
  id: string;
  site_name: string;
  site_code: string;
  state: string;
  locality: string;
  status: string;
  mmp_id: string;
  mmp_name?: string;
  hub?: string;
  not_covered_reason: string | null;
  not_covered_reason_other: string | null;
  not_covered_at: string | null;
  not_covered_by: string | null;
}

interface SiteVisitCounts {
  total: number;
  /** One entry per unique status value found in the data. */
  statusCounts: Record<string, number>;
}

// Display metadata for known statuses — unknown ones get auto-prettified.
const STATUS_META: Record<string, { label: string; labelAr: string; colorClass: string }> = {
  completed:     { label: 'Completed',     labelAr: 'مكتمل',     colorClass: 'bg-emerald-500/10' },
  verified:      { label: 'Verified',      labelAr: 'مُتحقق',    colorClass: 'bg-green-500/10' },
  approved:      { label: 'Approved',      labelAr: 'مُعتمد',    colorClass: 'bg-teal-600/10' },
  wfp_confirmed: { label: 'WFP Confirmed', labelAr: 'مُؤكَّد',   colorClass: 'bg-blue-500/10' },
  submitted:     { label: 'Submitted',     labelAr: 'مُقدَّم',   colorClass: 'bg-cyan-500/10' },
  accepted:      { label: 'Accepted',      labelAr: 'مقبول',     colorClass: 'bg-sky-500/10' },
  dispatched:    { label: 'Dispatched',    labelAr: 'مُرسَل',    colorClass: 'bg-purple-500/10' },
  assigned:      { label: 'Assigned',      labelAr: 'معيَّن',    colorClass: 'bg-indigo-500/10' },
  pending:       { label: 'Pending',       labelAr: 'معلق',      colorClass: 'bg-yellow-500/10' },
  not_covered:   { label: 'Not Covered',   labelAr: 'غير مغطى', colorClass: 'bg-red-500/10' },
  cancelled:     { label: 'Cancelled',     labelAr: 'ملغى',      colorClass: 'bg-red-400/10' },
  rejected:      { label: 'Rejected',      labelAr: 'مرفوض',    colorClass: 'bg-orange-500/10' },
};
// Preferred display order — statuses not in this list appear after, sorted alphabetically.
const STATUS_ORDER = ['completed','verified','approved','wfp_confirmed','submitted','accepted','dispatched','assigned','pending','not_covered','cancelled','rejected'];

function getStatusMeta(s: string) {
  return STATUS_META[s] ?? {
    label: s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    labelAr: s,
    colorClass: 'bg-gray-500/10',
  };
}

type CloseScope = 'full' | 'hub' | 'state' | 'activity';

interface CycleCloseRecord {
  id: string;
  scope: CloseScope;
  scopeValue: string;
  closedAt: string;
  closedBy: string;
  closedByName: string;
  siteCount: number;
  status: 'closing' | 'pending_approval' | 'closed';
}

interface MmpScopeOptions {
  hubs: string[];
  states: string[];
  activities: string[];
}

interface CycleMMPCardProps {
  mmp: any;
  uncoveredSites: UncoveredSite[];
  cycleStatus: string;
  canManageCycle: boolean;
  isFOM: boolean;
  isAdmin: boolean;
  closingCycle: boolean;
  finalizingCycle: boolean;
  siteVisitCounts?: SiteVisitCounts;
  scopeOptions?: MmpScopeOptions;
  handleStartClosingCycle: (mmpId: string) => void;
  handleScopedClose: (mmpId: string, scope: CloseScope, scopeValue: string) => void;
  handleFinalizeCycleClose: (mmpId: string) => void;
  handleApproveCycle: (mmpId: string) => void;
  handleRejectCycle: (mmpId: string, note: string) => void;
  handleSendReminders: (mmpId: string) => void;
  setSelectedMmpId: (id: string) => void;
  setActiveTab: (tab: string) => void;
  getReasonLabel: (reason: string | null) => string;
  onOpenGuide?: () => void;
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return 'N/A';
  }
}

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'closing') return 'destructive';
  if (status === 'pending_approval') return 'default';
  return 'secondary';
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: 'Active',
    closing: 'Closing',
    pending_approval: 'Pending Approval',
    closed: 'Closed',
  };
  return labels[status] || 'Active';
}

function CoverageRing({ percent, size = 56, strokeWidth = 5 }: { percent: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const color = percent >= 80 ? 'text-emerald-500' : percent >= 50 ? 'text-amber-500' : 'text-red-500';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-muted" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className={`stroke-current ${color} transition-all duration-500`} />
      </svg>
      <span className="absolute text-sm font-bold">{percent}%</span>
    </div>
  );
}

function InfoItem({ icon: Icon, label, labelAr, value, testId }: { icon: any; label: string; labelAr?: string; value: string | number | undefined | null; testId?: string }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-center gap-2 py-1" data-testid={testId}>
      <div className="flex items-center justify-center h-6 w-6 rounded bg-muted shrink-0">
        <Icon className="h-3 w-3 text-muted-foreground" />
      </div>
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <span className="text-xs text-muted-foreground whitespace-nowrap">{label}{labelAr && <span dir="rtl" className="font-normal text-muted-foreground/70 mr-1"> {labelAr}</span>}:</span>
        <span className="text-xs font-medium truncate">{value}</span>
      </div>
    </div>
  );
}

function StatBox({ count, label, labelAr, colorClass, testId }: { count: number; label: string; labelAr?: string; colorClass: string; testId?: string }) {
  return (
    <div className={`rounded-md p-2.5 text-center ${colorClass}`}>
      <div className="text-base font-bold leading-tight" data-testid={testId}>{count}</div>
      <div className="text-xs text-muted-foreground leading-tight mt-0.5">{label}</div>
      {labelAr && <div dir="rtl" className="text-[10px] text-muted-foreground/70 leading-tight">{labelAr}</div>}
    </div>
  );
}

function SectionHeader({ icon: Icon, label, labelAr, testId }: { icon: any; label: string; labelAr?: string; testId?: string }) {
  return (
    <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2" data-testid={testId}>
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
      {labelAr && <span dir="rtl" className="font-normal text-muted-foreground/70"> / {labelAr}</span>}
    </div>
  );
}

const SCOPE_LABELS: Record<CloseScope, string> = {
  full: 'Full MMP',
  hub: 'Hub',
  state: 'State',
  activity: 'Activity',
};

const SCOPE_ICONS: Record<CloseScope, any> = {
  full: FileText,
  hub: Building2,
  state: Globe,
  activity: Activity,
};

export function CycleMMPCard({
  mmp,
  uncoveredSites,
  cycleStatus,
  canManageCycle,
  isFOM,
  isAdmin,
  closingCycle,
  finalizingCycle,
  siteVisitCounts,
  scopeOptions,
  handleStartClosingCycle,
  handleScopedClose,
  handleFinalizeCycleClose,
  handleApproveCycle,
  handleRejectCycle,
  handleSendReminders,
  setSelectedMmpId,
  setActiveTab,
  getReasonLabel,
  onOpenGuide,
}: CycleMMPCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [closeScope, setCloseScope] = useState<CloseScope>('full');
  const [closeScopeValue, setCloseScopeValue] = useState<string>('');
  const [activitySubFilter, setActivitySubFilter] = useState<'none' | 'hub' | 'state'>('none');
  const [activitySubValue, setActivitySubValue] = useState<string>('');
  const [showCloseHistory, setShowCloseHistory] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const navigate = useNavigate();

  const closeRecords: CycleCloseRecord[] = (mmp as any)?.cycle_close_records || [];

  const mmpUncovered = uncoveredSites;
  const mmpReasoned = mmpUncovered.filter(s => s.not_covered_reason).length;
  const progress = mmpUncovered.length > 0 ? Math.round((mmpReasoned / mmpUncovered.length) * 100) : 100;

  const projectName = mmp.projectName || (mmp as any).project?.name || '';

  const totalSiteCount = siteVisitCounts?.total || 0;
  const sc = siteVisitCounts?.statusCounts ?? {};
  const completedCount = sc['completed'] ?? 0;
  const coveragePercent = totalSiteCount > 0 ? Math.round((completedCount / totalSiteCount) * 100) : 0;

  // Build ordered list of all status entries that have count > 0
  const statusEntries = [
    ...STATUS_ORDER.filter(s => sc[s] > 0).map(s => [s, sc[s]] as [string, number]),
    ...Object.entries(sc)
      .filter(([s, n]) => n > 0 && !STATUS_ORDER.includes(s))
      .sort(([a], [b]) => a.localeCompare(b)),
  ];

  const mmpStatus = mmp.status || 'pending';
  const statusLabel: Record<string, string> = {
    pending: 'Pending',
    verified: 'Verified',
    approved: 'Approved',
    rejected: 'Rejected',
    archived: 'Archived',
    forwarded_to_coordinator: 'Forwarded',
  };

  const topBarColor = cycleStatus === 'closing'
    ? 'bg-amber-500'
    : cycleStatus === 'pending_approval'
    ? 'bg-purple-500'
    : 'bg-emerald-500';

  const CYCLE_STEPS: { key: string; label: string }[] = [
    { key: 'active', label: 'Active' },
    { key: 'closing', label: 'Closing' },
    { key: 'pending_approval', label: 'Awaiting Approval' },
    { key: 'closed', label: 'Closed' },
  ];
  const currentStepIdx = CYCLE_STEPS.findIndex(s => s.key === cycleStatus);

  return (
    <Card className="overflow-hidden transition-all" data-testid={`card-cycle-${mmp.id}`}>
      <CardContent className="p-0">
        <div className={`h-1 w-full ${topBarColor}`} />

        {/* Status stepper */}
        <div className="flex items-center px-4 pt-3 pb-0 gap-0" data-testid={`stepper-${mmp.id}`}>
          {CYCLE_STEPS.map((step, idx) => {
            const isActive = idx === currentStepIdx;
            const isDone = idx < currentStepIdx;
            const isLast = idx === CYCLE_STEPS.length - 1;
            return (
              <div key={step.key} className="flex items-center flex-1 min-w-0">
                <div className="flex flex-col items-center shrink-0">
                  <div className={`h-2 w-2 rounded-full border ${
                    isDone
                      ? 'bg-emerald-500 border-emerald-500'
                      : isActive
                        ? cycleStatus === 'closing' ? 'bg-amber-500 border-amber-500' : cycleStatus === 'pending_approval' ? 'bg-purple-500 border-purple-500' : 'bg-primary border-primary'
                        : 'bg-muted border-border'
                  }`} />
                  <span className={`text-[9px] mt-0.5 leading-none whitespace-nowrap ${
                    isActive ? 'font-semibold text-foreground' : isDone ? 'text-muted-foreground' : 'text-muted-foreground/50'
                  }`}>{step.label}</span>
                </div>
                {!isLast && (
                  <div className={`h-px flex-1 mx-1 ${idx < currentStepIdx ? 'bg-emerald-400' : 'bg-border'}`} />
                )}
              </div>
            );
          })}
        </div>

        <div className="p-4 pb-3 pt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold leading-tight truncate" data-testid={`text-mmp-name-${mmp.id}`}>
                  {mmp.name}
                </h3>
                <Badge variant="outline" className="shrink-0" data-testid={`badge-mmp-status-${mmp.id}`}>
                  {statusLabel[mmpStatus] || mmpStatus}
                </Badge>
              </div>
              {projectName && (
                <div className="text-xs text-muted-foreground mt-0.5" data-testid={`text-project-${mmp.id}`}>
                  {projectName}
                </div>
              )}
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {mmp.hub || mmp.region || 'No hub'}
                </span>
                {(mmp.month || mmp.year) && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {mmp.month ? `Month ${mmp.month}` : ''} {mmp.year || ''}
                  </span>
                )}
                {mmp.entries > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    {mmp.entries} entries
                  </span>
                )}
              </div>
            </div>
            <Badge variant={getStatusBadgeVariant(cycleStatus)} data-testid={`badge-cycle-status-${mmp.id}`}>
              {getStatusLabel(cycleStatus)}
            </Badge>
          </div>
        </div>

        {totalSiteCount > 0 && (
          <div className="px-4 pb-3" data-testid={`coverage-summary-${mmp.id}`}>
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="flex items-center gap-4">
                <CoverageRing percent={coveragePercent} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs font-medium">Site Coverage <span dir="rtl" className="font-normal text-muted-foreground/70">/ تغطية المواقع</span></span>
                    <span className="text-xs text-muted-foreground" data-testid={`text-coverage-percent-${mmp.id}`}>
                      {completedCount}/{totalSiteCount} sites
                    </span>
                  </div>
                  <Progress value={coveragePercent} className="h-2 mb-2.5" />
                  <div className="flex flex-wrap gap-1.5">
                    {statusEntries.map(([status, count]) => {
                      const meta = getStatusMeta(status);
                      return (
                        <StatBox
                          key={status}
                          count={count}
                          label={meta.label}
                          labelAr={meta.labelAr}
                          colorClass={meta.colorClass}
                          testId={`text-status-count-${status}-${mmp.id}`}
                        />
                      );
                    })}
                    {statusEntries.length === 0 && (
                      <span className="text-xs text-muted-foreground">No site data yet</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {cycleStatus === 'closing' && (
          <div className="px-4 pb-3">
            <div className="bg-amber-500/5 border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Reason Assignment <span dir="rtl" className="font-normal text-muted-foreground/70">/ تعيين الاسباب</span>
                </span>
                <span className="font-semibold" data-testid={`text-reason-progress-${mmp.id}`}>{mmpReasoned}/{mmpUncovered.length}</span>
              </div>
              <Progress value={progress} className="h-1.5" />
              <div className="grid grid-cols-3 gap-1.5">
                <StatBox count={mmpUncovered.length} label="Uncovered" labelAr="غير مغطى" colorClass="bg-red-500/10" testId={`text-uncovered-count-${mmp.id}`} />
                <StatBox count={mmpUncovered.length - mmpReasoned} label="Pending" labelAr="معلق" colorClass="bg-amber-500/10" testId={`text-pending-reason-count-${mmp.id}`} />
                <StatBox count={mmpReasoned} label="Reasoned" labelAr="مسبب" colorClass="bg-emerald-500/10" testId={`text-reasoned-count-${mmp.id}`} />
              </div>
              {onOpenGuide && (
                <Button
                  size="sm"
                  className="w-full mt-1 bg-amber-600 hover:bg-amber-700 text-white text-xs h-8 gap-1.5"
                  onClick={onOpenGuide}
                  data-testid={`button-open-guide-${mmp.id}`}
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  View Closing Guide — What to do next
                  <span dir="rtl" className="text-[10px] font-normal opacity-80">/ دليل الإغلاق</span>
                </Button>
              )}
            </div>

            {(mmp as any).cycle_close_deadline && (
              <div className={`flex items-center gap-2 text-xs mt-2 rounded-md px-2 py-1.5 ${
                new Date((mmp as any).cycle_close_deadline) < new Date()
                  ? 'bg-destructive/10 text-destructive font-semibold'
                  : 'bg-muted text-muted-foreground'
              }`} data-testid={`text-deadline-${mmp.id}`}>
                <Clock className="h-3.5 w-3.5 shrink-0" />
                {new Date((mmp as any).cycle_close_deadline) < new Date() ? (
                  <span>OVERDUE - Deadline was {new Date((mmp as any).cycle_close_deadline).toLocaleDateString()}</span>
                ) : (
                  <span>Deadline: {new Date((mmp as any).cycle_close_deadline).toLocaleDateString()} ({Math.ceil((new Date((mmp as any).cycle_close_deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days left)</span>
                )}
              </div>
            )}
          </div>
        )}

        <div className="px-4">
          <Separator />
        </div>

        <div className="px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between text-xs"
            onClick={() => setExpanded(!expanded)}
            data-testid={`button-toggle-details-${mmp.id}`}
          >
            <span className="flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" />
              {expanded ? 'Hide Details' : 'View MMP Details'}
              <span dir="rtl" className="font-normal text-muted-foreground/70">{expanded ? '/ اخفاء التفاصيل' : '/ عرض تفاصيل MMP'}</span>
            </span>
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {expanded && (
          <div className="px-4 pb-3 space-y-2" data-testid={`details-panel-${mmp.id}`}>
            <div className="bg-muted/30 rounded-lg p-3">
              <SectionHeader icon={FileText} label="General Information" labelAr="معلومات عامة" testId={`section-general-${mmp.id}`} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                <InfoItem label="Status" labelAr="الحالة" value={statusLabel[mmpStatus] || mmpStatus} icon={ShieldCheck} testId={`detail-mmp-status-${mmp.id}`} />
                <InfoItem label="Entries" labelAr="الادخالات" value={mmp.entries || 0} icon={FolderOpen} testId={`detail-entries-${mmp.id}`} />
                <InfoItem label="Region" labelAr="المنطقة" value={mmp.region} icon={MapPin} testId={`detail-region-${mmp.id}`} />
                <InfoItem label="Type" labelAr="النوع" value={mmp.type} icon={FileText} testId={`detail-type-${mmp.id}`} />
              </div>
              {mmp.description && (
                <div className="text-xs mt-2 p-2 bg-muted rounded" data-testid={`detail-description-${mmp.id}`}>
                  <span className="text-muted-foreground">Description: </span>
                  <span>{mmp.description}</span>
                </div>
              )}
            </div>

            <div className="bg-muted/30 rounded-lg p-3">
              <SectionHeader icon={Calendar} label="Timeline" labelAr="الجدول الزمني" testId={`section-timeline-${mmp.id}`} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                <InfoItem label="Uploaded" labelAr="رفع" value={formatDate(mmp.uploadedAt)} icon={Calendar} testId={`detail-uploaded-${mmp.id}`} />
                <InfoItem label="Uploaded By" labelAr="رفع بواسطة" value={mmp.uploadedBy} icon={User} testId={`detail-uploaded-by-${mmp.id}`} />
                <InfoItem label="Verified" labelAr="تم التحقق" value={formatDate(mmp.verifiedAt)} icon={CheckCircle2} testId={`detail-verified-${mmp.id}`} />
                <InfoItem label="Approved" labelAr="تمت الموافقة" value={formatDate(mmp.approvedAt)} icon={CheckCircle2} testId={`detail-approved-${mmp.id}`} />
              </div>
            </div>

            {(mmp.team?.coordinator || mmp.team?.supervisors?.length > 0 || mmp.team?.dataCollector) && (
              <div className="bg-muted/30 rounded-lg p-3">
                <SectionHeader icon={Users} label="Team" labelAr="الفريق" testId={`section-team-${mmp.id}`} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                  <InfoItem label="Coordinator" labelAr="المنسق" value={mmp.team?.coordinator} icon={User} testId={`detail-coordinator-${mmp.id}`} />
                  <InfoItem label="Data Collector" labelAr="جامع البيانات" value={mmp.team?.dataCollector} icon={User} testId={`detail-collector-${mmp.id}`} />
                </div>
                {mmp.team?.supervisors?.length > 0 && (
                  <div className="flex items-center gap-2 py-1" data-testid={`detail-supervisors-${mmp.id}`}>
                    <div className="flex items-center justify-center h-6 w-6 rounded bg-muted shrink-0">
                      <Users className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">Supervisors <span dir="rtl" className="font-normal text-muted-foreground/70">المشرفون</span>:</span>
                      <span className="text-xs font-medium truncate">{mmp.team.supervisors.join(', ')}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {mmp.financial && (mmp.financial.budgetAllocation || mmp.financial.currency || mmp.financial.paymentMethod) && (
              <div className="bg-muted/30 rounded-lg p-3">
                <SectionHeader icon={Wallet} label="Financial" labelAr="المالية" testId={`section-financial-${mmp.id}`} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                  {mmp.financial.budgetAllocation && (
                    <InfoItem
                      label="Budget"
                      labelAr="الميزانية"
                      value={`${mmp.financial.currency || 'USD'} ${Number(mmp.financial.budgetAllocation).toLocaleString()}`}
                      icon={Wallet}
                      testId={`detail-budget-${mmp.id}`}
                    />
                  )}
                  <InfoItem label="Payment" labelAr="الدفع" value={mmp.financial.paymentMethod} icon={FileText} testId={`detail-payment-${mmp.id}`} />
                  <InfoItem label="Approval" labelAr="الموافقة" value={mmp.financial.approvalStatus} icon={ShieldCheck} testId={`detail-fin-approval-${mmp.id}`} />
                </div>
              </div>
            )}

            {mmp.rejectionReason && (
              <div className="p-2.5 bg-destructive/10 rounded-lg text-xs text-destructive" data-testid={`detail-rejection-${mmp.id}`}>
                <span className="font-medium">Rejection Reason:</span> {mmp.rejectionReason}
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => navigate(`/mmp/${mmp.id}`)}
              data-testid={`button-view-full-mmp-${mmp.id}`}
            >
              <Eye className="h-3.5 w-3.5 mr-1.5" /> Open Full MMP View
            </Button>
          </div>
        )}

        {closeRecords.length > 0 && (
          <div className="px-4 pb-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between text-xs"
              onClick={() => setShowCloseHistory(!showCloseHistory)}
              data-testid={`button-toggle-close-history-${mmp.id}`}
            >
              <span className="flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" />
                Close History ({closeRecords.length} {closeRecords.length === 1 ? 'record' : 'records'})
                <span dir="rtl" className="font-normal text-muted-foreground/70">/ سجل الاغلاق</span>
              </span>
              {showCloseHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
            {showCloseHistory && (
              <div className="mt-2 space-y-1.5 relative" data-testid={`close-history-${mmp.id}`}>
                <div className="absolute left-[18px] top-2 bottom-2 w-px bg-border" />
                {closeRecords.map((record, idx) => {
                  const ScopeIcon = SCOPE_ICONS[record.scope] || FileText;
                  return (
                    <div key={record.id} className="bg-muted/30 rounded-md p-2.5 flex items-start gap-2.5 text-xs relative ml-2">
                      <div className="flex items-center justify-center h-6 w-6 rounded-full bg-muted shrink-0 z-10 border-2 border-background">
                        <ScopeIcon className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">
                            {record.scope === 'activity' && record.scopeValue?.includes('||') ? (() => {
                              const parts = record.scopeValue.split('||');
                              const actName = parts[0];
                              const subParts = parts[1]?.split(':');
                              const subLabel = subParts?.[0] === 'state' ? 'State' : 'Hub';
                              return <>{SCOPE_LABELS[record.scope]}: {actName} <span className="text-muted-foreground font-normal">({subLabel}: {subParts?.[1]})</span></>;
                            })() : <>{SCOPE_LABELS[record.scope]}: {record.scopeValue}</>}
                          </span>
                          <Badge variant={record.status === 'closed' ? 'default' : 'secondary'}>
                            {record.status === 'closed' ? 'Closed' : record.status === 'pending_approval' ? 'Pending' : 'Closing'}
                          </Badge>
                        </div>
                        <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span>{record.siteCount} sites</span>
                          <span className="text-muted-foreground/50">|</span>
                          <span>{formatDate(record.closedAt)}</span>
                          <span className="text-muted-foreground/50">|</span>
                          <span>by {record.closedByName || 'System'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {(canManageCycle || cycleStatus === 'closing' || cycleStatus === 'pending_approval') && (
          <>
            <div className="px-4"><Separator /></div>
            <div className="px-4 py-3 space-y-3">
              {cycleStatus === 'active' && canManageCycle && (
                <div className="space-y-2.5" data-testid={`close-scope-section-${mmp.id}`}>
                  <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> Close Scope <span dir="rtl" className="font-normal text-muted-foreground/70">/ نطاق الاغلاق</span>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3">
                    <div className="flex flex-wrap gap-2 items-end">
                      <Select value={closeScope} onValueChange={(v) => { setCloseScope(v as CloseScope); setCloseScopeValue(''); setActivitySubFilter('none'); setActivitySubValue(''); }}>
                        <SelectTrigger className="w-[140px]" data-testid={`select-close-scope-${mmp.id}`}>
                          <SelectValue placeholder="Close Scope" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="full">Full MMP</SelectItem>
                          {(scopeOptions?.hubs?.length ?? 0) > 0 && <SelectItem value="hub">By Hub</SelectItem>}
                          {(scopeOptions?.states?.length ?? 0) > 0 && <SelectItem value="state">By State</SelectItem>}
                          {(scopeOptions?.activities?.length ?? 0) > 0 && <SelectItem value="activity">By Activity</SelectItem>}
                        </SelectContent>
                      </Select>
                      {closeScope !== 'full' && closeScope !== 'activity' && (
                        <Select value={closeScopeValue} onValueChange={setCloseScopeValue}>
                          <SelectTrigger className="w-[180px]" data-testid={`select-close-scope-value-${mmp.id}`}>
                            <SelectValue placeholder={`Select ${SCOPE_LABELS[closeScope]}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {closeScope === 'hub' && scopeOptions?.hubs?.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                            {closeScope === 'state' && scopeOptions?.states?.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      {closeScope === 'activity' && (
                        <>
                          <Select value={closeScopeValue} onValueChange={(v) => { setCloseScopeValue(v); setActivitySubFilter('none'); setActivitySubValue(''); }}>
                            <SelectTrigger className="w-[180px]" data-testid={`select-close-activity-${mmp.id}`}>
                              <SelectValue placeholder="Select Activity" />
                            </SelectTrigger>
                            <SelectContent>
                              {scopeOptions?.activities?.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {closeScopeValue && (
                            <Select value={activitySubFilter} onValueChange={(v) => { setActivitySubFilter(v as 'none' | 'hub' | 'state'); setActivitySubValue(''); }}>
                              <SelectTrigger className="w-[140px]" data-testid={`select-activity-sub-scope-${mmp.id}`}>
                                <SelectValue placeholder="Filter by..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">All Areas</SelectItem>
                                {(scopeOptions?.states?.length ?? 0) > 0 && <SelectItem value="state">By State</SelectItem>}
                                {(scopeOptions?.hubs?.length ?? 0) > 0 && <SelectItem value="hub">By Hub</SelectItem>}
                              </SelectContent>
                            </Select>
                          )}
                          {closeScopeValue && activitySubFilter !== 'none' && (
                            <Select value={activitySubValue} onValueChange={setActivitySubValue}>
                              <SelectTrigger className="w-[160px]" data-testid={`select-activity-sub-value-${mmp.id}`}>
                                <SelectValue placeholder={`Select ${activitySubFilter === 'state' ? 'State' : 'Hub'}`} />
                              </SelectTrigger>
                              <SelectContent>
                                {activitySubFilter === 'state' && scopeOptions?.states?.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                {activitySubFilter === 'hub' && scopeOptions?.hubs?.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                        </>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={closingCycle || (closeScope !== 'full' && !closeScopeValue) || (closeScope === 'activity' && activitySubFilter !== 'none' && !activitySubValue)}
                            data-testid={`button-start-close-${mmp.id}`}
                          >
                            <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                            {closeScope === 'full' ? 'Close Full MMP' : `Close ${SCOPE_LABELS[closeScope]}`}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {closeScope === 'full' ? 'Start Full MMP Cycle Close' : closeScope === 'activity'
                                ? `Close Activity: ${closeScopeValue}${activitySubFilter !== 'none' && activitySubValue ? ` (${activitySubFilter === 'state' ? 'State' : 'Hub'}: ${activitySubValue})` : ''}`
                                : `Close by ${SCOPE_LABELS[closeScope]}: ${closeScopeValue}`}
                            </AlertDialogTitle>
                            <AlertDialogDescription asChild>
                              <div className="space-y-3">
                                {closeScope === 'full' ? (
                                  <p>
                                    This will flag all incomplete site visits (pending, assigned, dispatched) as &quot;Not Covered&quot;.
                                    Supervisors will need to provide a reason for each uncovered site before the cycle can be fully closed.
                                  </p>
                                ) : closeScope === 'activity' ? (
                                  <p>
                                    This will flag all incomplete site visits for <strong>Activity: {closeScopeValue}</strong>
                                    {activitySubFilter !== 'none' && activitySubValue && (
                                      <> in <strong>{activitySubFilter === 'state' ? 'State' : 'Hub'}: {activitySubValue}</strong></>
                                    )} as &quot;Not Covered&quot;.
                                    Only sites matching this scope will be affected.
                                  </p>
                                ) : (
                                  <p>
                                    This will flag all incomplete site visits for <strong>{SCOPE_LABELS[closeScope]}: {closeScopeValue}</strong> as &quot;Not Covered&quot;.
                                    Only sites matching this {closeScope} will be affected. Other sites will remain active.
                                  </p>
                                )}
                                <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                                  <div className="flex items-center gap-2">
                                    {(() => { const ScopeIcon = SCOPE_ICONS[closeScope]; return <ScopeIcon className="h-4 w-4 text-muted-foreground" />; })()}
                                    <span className="font-medium">Scope: {SCOPE_LABELS[closeScope]}</span>
                                  </div>
                                  {closeScope === 'activity' && closeScopeValue && (
                                    <div className="text-muted-foreground">Activity: {closeScopeValue}</div>
                                  )}
                                  {closeScope === 'activity' && activitySubFilter !== 'none' && activitySubValue && (
                                    <div className="text-muted-foreground">{activitySubFilter === 'state' ? 'State' : 'Hub'}: {activitySubValue}</div>
                                  )}
                                  {closeScope !== 'full' && closeScope !== 'activity' && (
                                    <div className="text-muted-foreground">Target: {closeScopeValue}</div>
                                  )}
                                  <div className="text-muted-foreground">Close date will be recorded: {new Date().toLocaleDateString()}</div>
                                </div>
                                <p className="text-xs text-muted-foreground"><strong>This action cannot be undone.</strong></p>
                              </div>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => {
                                if (closeScope === 'full') {
                                  handleStartClosingCycle(mmp.id);
                                } else if (closeScope === 'activity') {
                                  const scopeVal = activitySubFilter !== 'none' && activitySubValue
                                    ? `${closeScopeValue}||${activitySubFilter}:${activitySubValue}`
                                    : closeScopeValue;
                                  handleScopedClose(mmp.id, 'activity', scopeVal);
                                } else {
                                  handleScopedClose(mmp.id, closeScope, closeScopeValue);
                                }
                              }}
                              data-testid="button-confirm-start-close"
                            >
                              Start Closing
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              )}

              {cycleStatus === 'closing' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2 items-center">
                    {canManageCycle && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" disabled={finalizingCycle || progress < 100} data-testid={`button-finalize-${mmp.id}`}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Finalize Close
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Finalize Cycle Close</AlertDialogTitle>
                            <AlertDialogDescription asChild>
                              <div className="space-y-3">
                                <p>You are about to close this MMP cycle. Here is a summary:</p>
                                <div className="grid grid-cols-2 gap-2 text-sm bg-muted rounded-lg p-3">
                                  <div>Total Uncovered Sites:</div>
                                  <div className="font-semibold" data-testid="text-summary-uncovered">{mmpUncovered.length}</div>
                                  <div>Reasons Assigned:</div>
                                  <div className="font-semibold text-green-600 dark:text-green-400" data-testid="text-summary-reasoned">{mmpReasoned}</div>
                                  <div>Top Reason:</div>
                                  <div className="font-semibold" data-testid="text-summary-top-reason">{(() => { const counts: Record<string, number> = {}; mmpUncovered.forEach(s => { if (s.not_covered_reason) counts[s.not_covered_reason] = (counts[s.not_covered_reason] || 0) + 1; }); const top = Object.entries(counts).sort((a,b) => b[1]-a[1])[0]; return top ? `${getReasonLabel(top[0])} (${top[1]})` : 'N/A'; })()}</div>
                                  <div>Completion Rate:</div>
                                  <div className="font-semibold text-blue-600 dark:text-blue-400" data-testid="text-summary-completion">{progress}%</div>
                                </div>
                                {closeRecords.length > 0 && (
                                  <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                                    <div className="text-xs font-medium text-muted-foreground">Scoped Closures Recorded:</div>
                                    {closeRecords.map(r => (
                                      <div key={r.id} className="text-xs flex items-center gap-2">
                                        <Badge variant="outline">{SCOPE_LABELS[r.scope]}</Badge>
                                        <span>{r.scopeValue}</span>
                                        <span className="text-muted-foreground">({formatDate(r.closedAt)})</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <p className="text-xs text-muted-foreground">All uncovered site visits will be cancelled and archived. This action cannot be undone.</p>
                              </div>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleFinalizeCycleClose(mmp.id)} data-testid="button-confirm-finalize">
                              Close Cycle
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}

                    <Button size="sm" variant="outline" onClick={() => { setSelectedMmpId(mmp.id); setActiveTab('uncovered'); }} data-testid={`button-view-uncovered-${mmp.id}`}>
                      View Sites <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>

                    {canManageCycle && (mmp as any).cycle_close_deadline && new Date((mmp as any).cycle_close_deadline) < new Date() && (
                      <Button size="sm" variant="outline" onClick={() => handleSendReminders(mmp.id)} data-testid={`button-send-reminder-${mmp.id}`}>
                        <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Send Reminders
                      </Button>
                    )}
                  </div>

                  {canManageCycle && (scopeOptions?.hubs?.length ?? 0) + (scopeOptions?.states?.length ?? 0) + (scopeOptions?.activities?.length ?? 0) > 0 && (
                    <div className="bg-muted/30 rounded-lg p-3">
                      <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
                        <Building2 className="h-3.5 w-3.5" /> Close Additional Scope <span dir="rtl" className="font-normal text-muted-foreground/70">/ نطاق اضافي</span>
                      </div>
                      <div className="flex flex-wrap gap-2 items-end">
                        <Select value={closeScope} onValueChange={(v) => { setCloseScope(v as CloseScope); setCloseScopeValue(''); setActivitySubFilter('none'); setActivitySubValue(''); }}>
                          <SelectTrigger className="w-[140px]" data-testid={`select-close-scope-closing-${mmp.id}`}>
                            <SelectValue placeholder="Scope" />
                          </SelectTrigger>
                          <SelectContent>
                            {(scopeOptions?.hubs?.length ?? 0) > 0 && <SelectItem value="hub">By Hub</SelectItem>}
                            {(scopeOptions?.states?.length ?? 0) > 0 && <SelectItem value="state">By State</SelectItem>}
                            {(scopeOptions?.activities?.length ?? 0) > 0 && <SelectItem value="activity">By Activity</SelectItem>}
                          </SelectContent>
                        </Select>
                        {closeScope !== 'full' && closeScope !== 'activity' && (
                          <Select value={closeScopeValue} onValueChange={setCloseScopeValue}>
                            <SelectTrigger className="w-[160px]" data-testid={`select-scope-val-closing-${mmp.id}`}>
                              <SelectValue placeholder={`Select ${SCOPE_LABELS[closeScope]}`} />
                            </SelectTrigger>
                            <SelectContent>
                              {closeScope === 'hub' && scopeOptions?.hubs?.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                              {closeScope === 'state' && scopeOptions?.states?.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                        {closeScope === 'activity' && (
                          <>
                            <Select value={closeScopeValue} onValueChange={(v) => { setCloseScopeValue(v); setActivitySubFilter('none'); setActivitySubValue(''); }}>
                              <SelectTrigger className="w-[160px]" data-testid={`select-close-activity-closing-${mmp.id}`}>
                                <SelectValue placeholder="Select Activity" />
                              </SelectTrigger>
                              <SelectContent>
                                {scopeOptions?.activities?.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            {closeScopeValue && (
                              <Select value={activitySubFilter} onValueChange={(v) => { setActivitySubFilter(v as 'none' | 'hub' | 'state'); setActivitySubValue(''); }}>
                                <SelectTrigger className="w-[130px]" data-testid={`select-activity-sub-closing-${mmp.id}`}>
                                  <SelectValue placeholder="Filter by..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">All Areas</SelectItem>
                                  {(scopeOptions?.states?.length ?? 0) > 0 && <SelectItem value="state">By State</SelectItem>}
                                  {(scopeOptions?.hubs?.length ?? 0) > 0 && <SelectItem value="hub">By Hub</SelectItem>}
                                </SelectContent>
                              </Select>
                            )}
                            {closeScopeValue && activitySubFilter !== 'none' && (
                              <Select value={activitySubValue} onValueChange={setActivitySubValue}>
                                <SelectTrigger className="w-[150px]" data-testid={`select-activity-sub-val-closing-${mmp.id}`}>
                                  <SelectValue placeholder={`Select ${activitySubFilter === 'state' ? 'State' : 'Hub'}`} />
                                </SelectTrigger>
                                <SelectContent>
                                  {activitySubFilter === 'state' && scopeOptions?.states?.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                  {activitySubFilter === 'hub' && scopeOptions?.hubs?.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            )}
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={closingCycle || !closeScopeValue || (closeScope === 'activity' && activitySubFilter !== 'none' && !activitySubValue)}
                          onClick={() => {
                            if (closeScope === 'activity') {
                              const scopeVal = activitySubFilter !== 'none' && activitySubValue
                                ? `${closeScopeValue}||${activitySubFilter}:${activitySubValue}`
                                : closeScopeValue;
                              handleScopedClose(mmp.id, 'activity', scopeVal);
                            } else {
                              handleScopedClose(mmp.id, closeScope, closeScopeValue);
                            }
                          }}
                          data-testid={`button-scoped-close-${mmp.id}`}
                        >
                          <AlertTriangle className="h-3.5 w-3.5 mr-1.5" /> Close
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {cycleStatus === 'pending_approval' && (isFOM || isAdmin) && (
                <div className="flex flex-wrap gap-2 items-center">
                  <Button size="sm" onClick={() => handleApproveCycle(mmp.id)} data-testid={`button-approve-${mmp.id}`}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Approve & Close
                  </Button>
                  <AlertDialog onOpenChange={(open) => { if (!open) setRejectNote(''); }}>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive" data-testid={`button-reject-${mmp.id}`}>
                        <XCircle className="h-3.5 w-3.5 mr-1.5" /> Reject
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reject Cycle Close</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will return the cycle to &quot;Closing&quot; status. The team will need to resolve issues and resubmit.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className="px-1 pb-2">
                        <label className="text-sm font-medium mb-1.5 block">Reason for rejection <span className="text-muted-foreground font-normal">(required)</span></label>
                        <textarea
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                          rows={3}
                          placeholder="Explain what the team needs to fix before resubmitting..."
                          value={rejectNote}
                          onChange={e => setRejectNote(e.target.value)}
                          data-testid="input-reject-note"
                        />
                      </div>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          disabled={!rejectNote.trim()}
                          onClick={() => handleRejectCycle(mmp.id, rejectNote.trim() || 'Cycle close rejected — additional review needed')}
                          data-testid="button-confirm-reject"
                        >
                          Reject
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          </>
        )}

        {(mmp as any).cycle_approval_note && (
          <div className="mx-4 mb-3 p-2.5 bg-destructive/10 rounded-lg text-xs text-destructive" data-testid={`text-rejection-note-${mmp.id}`}>
            <span className="font-medium">Rejection Note:</span> {(mmp as any).cycle_approval_note}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
