
import { useState, useMemo, useEffect, useRef } from 'react';
import { X, CheckCircle2, Circle, AlertCircle, Clock, ChevronRight, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Step1SelectCycle from './steps/Step1SelectCycle';
import Step2UploadMatch from './steps/Step2UploadMatch';
import Step3ResolveUnmatched from './steps/Step3ResolveUnmatched';
import Step4MarkUncovered from './steps/Step4MarkUncovered';
import Step5Exceptions from './steps/Step5Exceptions';
import Step6Reconciliation from './steps/Step6Reconciliation';
import Step7FinalClose from './steps/Step7FinalClose';
import type { MatchResult, MatchPair } from '@/utils/fuzzyMatcher';

export type StepStatus = 'not_started' | 'in_progress' | 'done' | 'blocked';

// ─── Session persistence ────────────────────────────────────────────────────
const STORAGE_VERSION = 'v1';
const getKey = (mmpId: string) => `pact_ccw_${STORAGE_VERSION}_${mmpId}`;

export interface SavedSession {
  savedAt: string;          // ISO timestamp
  currentStep: number;
  stepStatuses: StepStatus[];
  wizardState: Omit<WizardState, 'mmpRawRows'>; // mmpRawRows re-fetched from DB
}

export interface ExceptionDecision {
  decision: 'roll' | 'return' | 'writeoff' | 'redirect';
  amount?: number;
  justification?: string;
  approvedBy?: string;
}

export interface UncoveredReason {
  reason: string;
  note: string;
  flagged: boolean;
}

export interface WizardState {
  selectedMmpId: string | null;
  selectedMmp: any | null;
  uploadedFileName: string | null;
  fileConfirmed: boolean;
  fileRows: Record<string, string>[];
  fileColumns: string[];
  columnMapping: Record<string, string>; // legacy – kept for compat; matching now uses matchingPairs
  /** All column names loaded from mmp_site_entries for the selected cycle. */
  mmpColumns: string[];
  /** Full row data from mmp_site_entries (all loaded columns) used for preview + matching. */
  mmpRawRows: Record<string, string>[];
  /** User-defined column pairs: one MMP DB column ↔ one WFP file column. */
  matchingPairs: MatchPair[];
  matchResults: MatchResult[];
  /** MMP site IDs that were in the DB but had NO WFP file row matching them ("Not in clean data"). */
  unmatchedMmpSiteIds: string[];
  resolvedSites: Record<string, 'not_covered' | 'override_confirmed' | 'resubmit'>;
  uncoveredReasons: Record<string, UncoveredReason>;
  exceptionDecisions: Record<string, ExceptionDecision>;
  paymentActions: Record<string, { action: 'pay' | 'recover' | 'writeoff' | 'redirect'; done: boolean }>;
  overrides: Record<number, { justification: string; by: string; at: string }>;
  cycleClosedAt: string | null;
}

const STEPS = [
  { label: 'Select Cycle',      arLabel: 'اختيار الدورة',           shortLabel: '1' },
  { label: 'Upload & Match',    arLabel: 'رفع الملف والمطابقة',      shortLabel: '2' },
  { label: 'Resolve Unmatched', arLabel: 'حل غير المتطابقة',         shortLabel: '3' },
  { label: 'Mark Uncovered',    arLabel: 'المواقع غير المغطاة',       shortLabel: '4' },
  { label: 'Exceptions',        arLabel: 'الاستثناءات',               shortLabel: '5' },
  { label: 'Reconciliation',    arLabel: 'المراجعة',                  shortLabel: '6' },
  { label: 'Final Close',       arLabel: 'الإغلاق النهائي',           shortLabel: '7' },
];

const initialState: WizardState = {
  selectedMmpId: null,
  selectedMmp: null,
  uploadedFileName: null,
  fileConfirmed: false,
  fileRows: [],
  fileColumns: [],
  columnMapping: {},
  mmpColumns: [],
  mmpRawRows: [],
  matchingPairs: [],
  matchResults: [],
  unmatchedMmpSiteIds: [],
  resolvedSites: {},
  uncoveredReasons: {},
  exceptionDecisions: {},
  paymentActions: {},
  overrides: {},
  cycleClosedAt: null,
};

interface Props {
  onClose: () => void;
  isFOM: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  currentUser: any;
}

export default function CycleCloseWizard({ onClose, isFOM, isAdmin, isSuperAdmin, currentUser }: Props) {
  // Block ALL form submissions on the document for the wizard's lifetime.
  // Without this, any <form> in the layout (search bars, background dialogs,
  // portals) can accidentally submit and cause a full page reload when the user
  // interacts with the upload zone or presses Enter in the file picker.
  useEffect(() => {
    const blockSubmit = (e: SubmitEvent) => {
      // Only block if the submission did NOT originate inside this wizard's own
      // intentional submit handlers (there are none — all buttons are type="button").
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    document.addEventListener('submit', blockSubmit, true); // capture phase
    return () => document.removeEventListener('submit', blockSubmit, true);
  }, []);

  const [currentStep, setCurrentStep] = useState(1);
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>([
    'in_progress', 'not_started', 'not_started', 'not_started', 'not_started', 'not_started', 'not_started',
  ]);
  const [wizardState, setWizardState] = useState<WizardState>(initialState);
  const [savedSession, setSavedSession] = useState<SavedSession | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  const updateWizardState = (patch: Partial<WizardState>) => {
    setWizardState(prev => ({ ...prev, ...patch }));
  };

  // ── Auto-save to localStorage whenever step ≥ 2 state changes ─────────────
  useEffect(() => {
    if (!wizardState.selectedMmpId || currentStep < 2) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { mmpRawRows, ...stateToSave } = wizardState;
        const session: SavedSession = {
          savedAt: new Date().toISOString(),
          currentStep,
          stepStatuses,
          wizardState: stateToSave,
        };
        localStorage.setItem(getKey(wizardState.selectedMmpId!), JSON.stringify(session));
      } catch {
        // localStorage full or unavailable — silently skip
      }
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [wizardState, currentStep, stepStatuses]);

  // ── Clear saved session automatically when Final Close completes ───────────
  useEffect(() => {
    if (wizardState.cycleClosedAt && wizardState.selectedMmpId) {
      try { localStorage.removeItem(getKey(wizardState.selectedMmpId)); } catch {}
    }
  }, [wizardState.cycleClosedAt]);

  // ── Detect saved session when the selected MMP changes ────────────────────
  useEffect(() => {
    const id = wizardState.selectedMmpId;
    if (!id) { setSavedSession(null); return; }
    try {
      const raw = localStorage.getItem(getKey(id));
      setSavedSession(raw ? JSON.parse(raw) : null);
    } catch {
      setSavedSession(null);
    }
  }, [wizardState.selectedMmpId]);

  const handleResume = () => {
    if (!savedSession) return;
    setWizardState(prev => ({
      ...prev,
      ...savedSession.wizardState,
      mmpRawRows: [], // re-fetched by Step2's loadCandidates
    }));
    setCurrentStep(savedSession.currentStep);
    setStepStatuses(savedSession.stepStatuses);
    setSavedSession(null);
  };

  const handleStartFresh = () => {
    if (wizardState.selectedMmpId) {
      try { localStorage.removeItem(getKey(wizardState.selectedMmpId)); } catch {}
    }
    setSavedSession(null);
  };

  const markStepDone = (step: number) => {
    setStepStatuses(prev => {
      const next = [...prev];
      next[step - 1] = 'done';
      if (step < 7) next[step] = 'in_progress';
      return next;
    });
  };

  const goToStep = (step: number) => {
    if (step < currentStep || stepStatuses[step - 1] !== 'not_started') {
      setCurrentStep(step);
    }
  };

  const canAdvance = useMemo(() => {
    if (currentStep === 1) return !!wizardState.selectedMmpId;
    if (currentStep === 2) {
      const hasUnactioned = wizardState.matchResults.some(r => r.status === 'review');
      return wizardState.matchResults.length > 0 && !hasUnactioned;
    }
    if (currentStep === 3) {
      // Resubmit-flagged sites mean the cycle cannot close — they must be cleared first
      const hasResubmit = Object.values(wizardState.resolvedSites).some(v => v === 'resubmit');
      return !hasResubmit;
    }
    if (currentStep === 4) {
      const notCoveredIds = [
        ...wizardState.matchResults.filter(r => r.action === 'reject' || r.status === 'unmatched').map(r => r.matchedSiteId),
        ...Object.keys(wizardState.resolvedSites).filter(k => wizardState.resolvedSites[k] === 'not_covered'),
      ].filter(Boolean) as string[];
      return notCoveredIds.every(id => !!wizardState.uncoveredReasons[id]?.reason);
    }
    if (currentStep === 5) {
      const exceptions = Object.keys(wizardState.exceptionDecisions);
      return exceptions.every(k => !!wizardState.exceptionDecisions[k].decision);
    }
    if (currentStep === 6) return true;
    return false;
  }, [currentStep, wizardState]);

  const handleNext = () => {
    markStepDone(currentStep);
    setCurrentStep(s => Math.min(s + 1, 7));
  };

  const handleBack = () => {
    setCurrentStep(s => Math.max(s - 1, 1));
  };

  const canGoBack = currentStep > 1 && !wizardState.cycleClosedAt;
  const isClosed = !!wizardState.cycleClosedAt;
  const canOverride = isFOM || isAdmin || isSuperAdmin;

  const stepProps = {
    wizardState,
    updateWizardState,
    isFOM,
    isAdmin,
    isSuperAdmin,
    canOverride,
    currentUser,
    onNext: handleNext,
    onBack: handleBack,
    canAdvance,
    canGoBack,
    goToStep,
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 bg-gradient-to-r from-slate-800 to-slate-900 text-white px-4 py-3 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-amber-400" />
            <span className="font-semibold text-base">Cycle Close Wizard</span>
            {wizardState.selectedMmp && (
              <span className="text-slate-300 text-sm ml-2">— {wizardState.selectedMmp.name}</span>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-slate-300 hover:text-white hover:bg-white/10"
            onClick={onClose}
            data-testid="button-close-wizard"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Progress steps */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {STEPS.map((step, idx) => {
            const stepNum = idx + 1;
            const status = stepStatuses[idx];
            const isActive = stepNum === currentStep;
            const isClickable = stepNum < currentStep || status === 'done';
            return (
              <div key={stepNum} className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => isClickable && goToStep(stepNum)}
                  disabled={!isClickable && !isActive}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all
                    ${isActive ? 'bg-amber-500 text-white shadow-md' :
                      status === 'done' ? 'bg-green-600/80 text-white cursor-pointer hover:bg-green-600' :
                      status === 'in_progress' ? 'bg-blue-600/60 text-white' :
                      'bg-slate-700 text-slate-400 cursor-not-allowed'}`}
                  data-testid={`step-button-${stepNum}`}
                >
                  {status === 'done' ? <CheckCircle2 className="h-3 w-3" /> :
                   status === 'blocked' ? <AlertCircle className="h-3 w-3" /> :
                   status === 'in_progress' ? <Clock className="h-3 w-3" /> :
                   <Circle className="h-3 w-3" />}
                  <span className="hidden sm:flex sm:flex-col sm:items-start sm:leading-tight">
                    <span>{step.label}</span>
                    <span className="text-[9px] opacity-70 font-normal" dir="rtl">{step.arLabel}</span>
                  </span>
                  <span className="sm:hidden">{step.shortLabel}</span>
                </button>
                {idx < STEPS.length - 1 && (
                  <ChevronRight className="h-3 w-3 text-slate-600 flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto">
        {isClosed ? (
          <Step7FinalClose {...stepProps} />
        ) : (
          <>
            {currentStep === 1 && (
              <Step1SelectCycle
                {...stepProps}
                savedSession={savedSession}
                onResume={handleResume}
                onStartFresh={handleStartFresh}
              />
            )}
            {currentStep === 2 && <Step2UploadMatch {...stepProps} />}
            {currentStep === 3 && <Step3ResolveUnmatched {...stepProps} />}
            {currentStep === 4 && <Step4MarkUncovered {...stepProps} />}
            {currentStep === 5 && <Step5Exceptions {...stepProps} />}
            {currentStep === 6 && <Step6Reconciliation {...stepProps} />}
            {currentStep === 7 && <Step7FinalClose {...stepProps} />}
          </>
        )}
      </div>
    </div>
  );
}
