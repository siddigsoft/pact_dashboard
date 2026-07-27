/**
 * CycleCloseGuide — Step-by-step guided wizard for closing an MMP cycle.
 * Shows 7 steps with status, instructions, error details, and direct "Fix it" links.
 * Mounts as a collapsible panel at the top of the Active Cycles tab.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  CheckCircle2, AlertTriangle, XCircle, Clock, ChevronDown,
  ChevronUp, ArrowRight, Shield, DollarSign, Users,
  FileText, MapPin, Activity, BarChart3, HelpCircle, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CycleChecklistItem } from '@/hooks/useCycleCloseReadiness';

interface Step {
  id: string;
  number: number;
  title: string;
  titleAr: string;
  description: string;
  icon: React.ReactNode;
  tabValue: string;        // Which tab to jump to when "Go to Fix" is clicked
  checklistIds: string[];  // Which readiness check IDs this step covers
  guidanceLines: string[]; // Step-by-step instructions
  errorHelp: Record<string, string>; // checklistId → human-readable fix guidance
}

const STEPS: Step[] = [
  {
    id: 'select',
    number: 1,
    title: 'Select Cycle',
    titleAr: 'اختر الدورة',
    description: 'Choose the MMP cycle you want to close.',
    icon: <Activity className="h-4 w-4" />,
    tabValue: 'active',
    checklistIds: [],
    guidanceLines: [
      'Select the MMP cycle from the dropdown at the top of this page.',
      'Confirm the cycle month, hub, and total sites shown in the summary.',
      'If the cycle is already closed, use "Re-open" (FOM/Admin only) before making changes.',
    ],
    errorHelp: {},
  },
  {
    id: 'wfp',
    number: 2,
    title: 'Upload & Match Clean Data',
    titleAr: 'رفع البيانات النظيفة',
    description: 'Upload the WFP-provided Excel file and confirm site matches.',
    icon: <Shield className="h-4 w-4" />,
    tabValue: 'wfp',
    checklistIds: ['wfp_confirmation'],
    guidanceLines: [
      'Go to the "WFP Confirmation" tab.',
      'Upload the WFP cleaned Excel or CSV file using the drag-and-drop zone.',
      'Review the preview of the first rows — confirm it is the correct file.',
      'The system auto-matches rows to MMP sites by site name, state, locality, and activity.',
      'Rows shown as "Needs Review" (amber) must be confirmed or manually linked before applying.',
      'Use the search box in the review table to find the correct MMP site and link it manually.',
      'Once all rows are actioned, click "Apply Results" to update site statuses.',
      'After applying: sites become wfp_confirmed, wfp_rejected, or remain unmatched.',
    ],
    errorHelp: {
      wfp_confirmation: 'Go to the WFP Confirmation tab → upload your clean data file → review all matches → click "Apply Results".',
    },
  },
  {
    id: 'uncovered',
    number: 3,
    title: 'Mark Uncovered Sites',
    titleAr: 'تحديد المواقع غير المشمولة',
    description: 'Assign a reason to every site that was not visited or rejected.',
    icon: <MapPin className="h-4 w-4" />,
    tabValue: 'uncovered',
    checklistIds: ['site_visits'],
    guidanceLines: [
      'Go to the "Uncovered Sites" tab.',
      'Every site that is not wfp_confirmed must have a reason assigned.',
      'Select the reason from the dropdown (Security Concerns, Access Denied, Budget, etc.).',
      'Use "Bulk Assign" to apply the same reason to multiple sites at once.',
      'Sites flagged Security Concerns or Access Denied automatically create a follow-up item for the next cycle.',
      'Sites rejected in the WFP file appear here — assign the reason "WFP Rejected".',
      'All sites must be resolved (confirmed or with reason) before you can proceed.',
    ],
    errorHelp: {
      site_visits: 'Go to the Uncovered Sites tab → find sites with no reason → assign a reason to each → save.',
    },
  },
  {
    id: 'exceptions',
    number: 4,
    title: 'Resolve Advance Exceptions',
    titleAr: 'تسوية السلف على المواقع غير المشمولة',
    description: 'Decide what to do with advances paid for sites that were not covered.',
    icon: <AlertTriangle className="h-4 w-4" />,
    tabValue: 'exceptions',
    checklistIds: ['cost_recovery'],
    guidanceLines: [
      'Go to the "Exceptions" tab.',
      'Every not-covered site that received a payment advance needs a decision.',
      'Click "Resolve" on each site and choose one of:',
      '  • Roll to Next MMP — money stays with the enumerator, pre-allocated to the next cycle.',
      '  • Return Required — enumerator must return the money by a set deadline.',
      '  • Write-Off — manager approves writing off the amount with justification.',
      '  • Redirect to Fees — reclassify the advance as enumerator fees for related work.',
      'All decisions are logged with who made them and when.',
    ],
    errorHelp: {
      cost_recovery: 'Go to the Exceptions tab → click "Resolve" on each pending site → choose Roll / Return / Write-Off / Redirect.',
    },
  },
  {
    id: 'finance',
    number: 5,
    title: 'Clear Pending Finance Items',
    titleAr: 'تصفية بنود المالية المعلقة',
    description: 'Approve pending cost submissions and settle transport advances.',
    icon: <DollarSign className="h-4 w-4" />,
    tabValue: 'finance',
    checklistIds: ['cost_submissions', 'transport_advances', 'withdrawal_requests'],
    guidanceLines: [
      'Go to the "Pending Finance" tab.',
      'Select the MMP cycle to view its pending items.',
      'Approve or reject all pending cost submissions (use "Approve All" for bulk approval).',
      'Settle any partially-paid transport advances — mark as paid or process remaining balance.',
      'Approve or complete all withdrawal requests tagged to this MMP.',
      'The red banner at the top shows exactly how many items are blocking the close.',
    ],
    errorHelp: {
      cost_submissions: 'Go to Pending Finance tab → find pending cost submissions → approve or reject each one.',
      transport_advances: 'Go to Pending Finance tab → find partially-paid advances → settle each or go to the Down Payment page.',
      withdrawal_requests: 'Go to Pending Finance tab → find pending withdrawal requests → approve, reject, or mark completed.',
    },
  },
  {
    id: 'reconciliation',
    number: 6,
    title: 'Reconcile Enumerator Payments',
    titleAr: 'مطابقة مستحقات العدادين',
    description: 'Compare advance paid vs. confirmed sites and settle each enumerator.',
    icon: <Users className="h-4 w-4" />,
    tabValue: 'finance',
    checklistIds: ['enumerator_reconciliation'],
    guidanceLines: [
      'Go to the "Pending Finance" tab → scroll to "Enumerator Financial Reconciliation".',
      'The table shows each enumerator: advance paid, confirmed sites, total earned, and net balance.',
      'For each enumerator with a pending settlement, choose an action:',
      '  • "Generate Payment" — if you owe them money (balance payment for confirmed sites).',
      '  • "Generate Full Payment" — for enumerators who completed visits with no advance at all.',
      '  • "Schedule Recovery" — if they were overpaid (deduct from next payment or cash return).',
      '  • "Redirect to Fees" — reclassify the overpayment as enumerator fees for extra work done.',
      '  • "Write-Off" — write off a small unrecoverable difference with justification.',
      '  • "Mark Balanced" — if advance exactly matches earnings.',
      'All decisions notify the enumerator automatically.',
      'Enumerators with WFP-rejected sites will show a discrepancy warning — read it carefully.',
    ],
    errorHelp: {
      enumerator_reconciliation: 'Scroll to the Enumerator Reconciliation section in the Finance tab → settle each pending enumerator.',
    },
  },
  {
    id: 'close',
    number: 7,
    title: 'Final Review & Close',
    titleAr: 'المراجعة النهائية والإغلاق',
    description: 'All checks pass — review the summary and officially close the cycle.',
    icon: <CheckCircle2 className="h-4 w-4" />,
    tabValue: 'active',
    checklistIds: [],
    guidanceLines: [
      'Return to the "Active Cycles" tab.',
      'Open the cycle checklist for your MMP — all items must show a green checkmark.',
      'Review the financial summary: total sites confirmed, fees paid, advances recovered.',
      'If a check is amber (warning), an override is available — FOM or Admin only — requires justification.',
      'Click "Submit for Approval" to send to FOM (if approval workflow is enabled).',
      'Or click "Close Cycle" to close directly (if you have the required role).',
      'A Cycle Close report is generated automatically: PDF + 6-sheet Excel.',
      'All enumerators receive a notification confirming the cycle is closed.',
    ],
    errorHelp: {},
  },
];

interface Props {
  mmpId: string | null;
  checklistItems: CycleChecklistItem[];
  loading: boolean;
  onTabChange: (tab: string) => void;
}

type StepStatus = 'done' | 'active' | 'blocked' | 'pending' | 'na';

function getStepStatus(step: Step, checklistItems: CycleChecklistItem[], stepIndex: number, allSteps: Step[]): StepStatus {
  if (step.checklistIds.length === 0) {
    // Steps with no checklist items (select / close) — infer from context
    if (stepIndex === 0) return 'done'; // always "done" — user already selected
    if (stepIndex === allSteps.length - 1) {
      return checklistItems.length > 0 && checklistItems.every(i => i.passed) ? 'active' : 'pending';
    }
    return 'na';
  }
  const relevant = checklistItems.filter(i => step.checklistIds.includes(i.id));
  if (relevant.length === 0) return 'na';
  if (relevant.every(i => i.passed)) return 'done';
  if (relevant.some(i => i.notConfigured)) return 'blocked';
  return 'active';
}

const statusConfig: Record<StepStatus, { icon: React.ReactNode; badge: string; badgeCls: string; borderCls: string }> = {
  done:    { icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,  badge: 'Done',    badgeCls: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300', borderCls: 'border-green-200 dark:border-green-800' },
  active:  { icon: <Clock className="h-4 w-4 text-amber-500" />,         badge: 'Action Needed', badgeCls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300', borderCls: 'border-amber-200 dark:border-amber-800' },
  blocked: { icon: <XCircle className="h-4 w-4 text-red-500" />,         badge: 'Blocked', badgeCls: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300', borderCls: 'border-red-200 dark:border-red-800' },
  pending: { icon: <Clock className="h-4 w-4 text-muted-foreground" />,  badge: 'Pending', badgeCls: 'bg-muted text-muted-foreground', borderCls: 'border-muted' },
  na:      { icon: <HelpCircle className="h-4 w-4 text-muted-foreground" />, badge: '', badgeCls: '', borderCls: 'border-muted' },
};

export function CycleCloseGuide({ mmpId, checklistItems, loading, onTabChange }: Props) {
  const [open, setOpen] = useState(true);
  const [expandedStep, setExpandedStep] = useState<string | null>('wfp');

  const stepStatuses = STEPS.map((step, i) => getStepStatus(step, checklistItems, i, STEPS));
  const doneCount = stepStatuses.filter(s => s === 'done').length;
  const totalWithChecks = STEPS.filter(s => s.checklistIds.length > 0).length + 2; // include step 1 (always done) and step 7
  const progress = Math.round((doneCount / STEPS.length) * 100);

  if (!mmpId) return null;

  return (
    <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/10" data-testid="cycle-close-guide">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-950/20 rounded-t-lg transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-500" />
                Step-by-Step Close Guide
                <span dir="rtl" className="text-xs font-normal text-muted-foreground">دليل إغلاق الدورة</span>
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </CardTitle>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Progress value={progress} className="w-24 h-1.5" />
                  <span className="text-xs text-muted-foreground">{doneCount}/{STEPS.length} steps</span>
                </div>
                {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 space-y-2">
            {STEPS.map((step, idx) => {
              const status = stepStatuses[idx];
              const cfg = statusConfig[status];
              const isExpanded = expandedStep === step.id;
              const relevantChecks = checklistItems.filter(i => step.checklistIds.includes(i.id) && !i.passed);

              return (
                <Collapsible key={step.id} open={isExpanded} onOpenChange={open => setExpandedStep(open ? step.id : null)}>
                  <CollapsibleTrigger asChild>
                    <div
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/30',
                        cfg.borderCls,
                        isExpanded && 'bg-muted/20',
                      )}
                      data-testid={`guide-step-${step.id}`}
                    >
                      {/* Step number */}
                      <div className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                        status === 'done'    && 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
                        status === 'active'  && 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
                        status === 'blocked' && 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
                        (status === 'pending' || status === 'na') && 'bg-muted text-muted-foreground',
                      )}>
                        {status === 'done' ? <CheckCircle2 className="h-3.5 w-3.5" /> : step.number}
                      </div>

                      {/* Title + description */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{step.title}</span>
                          <span dir="rtl" className="text-[10px] text-muted-foreground">{step.titleAr}</span>
                          {cfg.badge && (
                            <Badge className={cn('text-xs px-1.5 py-0', cfg.badgeCls)}>{cfg.badge}</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                      </div>

                      {/* Status icon + expand */}
                      <div className="flex items-center gap-2 shrink-0">
                        {cfg.icon}
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="ml-9 mt-1 mb-2 rounded-lg border bg-card p-3 space-y-3">
                      {/* Guidance */}
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What to do</p>
                        <ol className="space-y-1">
                          {step.guidanceLines.map((line, i) => (
                            <li key={i} className="text-xs text-foreground flex gap-2">
                              {line.startsWith('  •') ? (
                                <span className="ml-4 text-muted-foreground">{line.trim()}</span>
                              ) : (
                                <>
                                  <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                  <span>{line}</span>
                                </>
                              )}
                            </li>
                          ))}
                        </ol>
                      </div>

                      {/* Errors / blocking issues */}
                      {relevantChecks.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide">Issues to fix</p>
                          {relevantChecks.map(check => (
                            <div key={check.id} className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-2.5 space-y-1">
                              <p className="text-xs font-medium text-red-700 dark:text-red-300">{check.label}</p>
                              <p className="text-xs text-red-600 dark:text-red-400">{check.description}</p>
                              {step.errorHelp[check.id] && (
                                <p className="text-xs text-muted-foreground italic">
                                  Fix: {step.errorHelp[check.id]}
                                </p>
                              )}
                              {check.count !== undefined && check.total > 0 && (
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="flex-1 h-1.5 bg-red-200 dark:bg-red-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.round((check.count / check.total) * 100)}%` }} />
                                  </div>
                                  <span className="text-[10px] text-muted-foreground">{check.count}/{check.total}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Action button */}
                      {step.tabValue && status !== 'done' && (
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => onTabChange(step.tabValue)}
                          data-testid={`guide-goto-${step.id}`}
                        >
                          Go to {step.title}
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      )}
                      {status === 'done' && (
                        <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Step complete
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
