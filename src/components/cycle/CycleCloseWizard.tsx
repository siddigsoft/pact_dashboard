
import { useState, useMemo } from 'react';
import { X, CheckCircle2, Circle, AlertCircle, Clock, ChevronRight, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Step1SelectCycle from './steps/Step1SelectCycle';
import Step2UploadMatch from './steps/Step2UploadMatch';
import Step3ResolveUnmatched from './steps/Step3ResolveUnmatched';
import Step4MarkUncovered from './steps/Step4MarkUncovered';
import Step5Exceptions from './steps/Step5Exceptions';
import Step6Reconciliation from './steps/Step6Reconciliation';
import Step7FinalClose from './steps/Step7FinalClose';
import type { MatchResult } from '@/utils/fuzzyMatcher';

export type StepStatus = 'not_started' | 'in_progress' | 'done' | 'blocked';

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
  columnMapping: Record<string, string>;
  matchResults: MatchResult[];
  resolvedSites: Record<string, 'not_covered' | 'override_confirmed' | 'resubmit'>;
  uncoveredReasons: Record<string, UncoveredReason>;
  exceptionDecisions: Record<string, ExceptionDecision>;
  paymentActions: Record<string, { action: 'pay' | 'recover' | 'writeoff' | 'redirect'; done: boolean }>;
  overrides: Record<number, { justification: string; by: string; at: string }>;
  cycleClosedAt: string | null;
}

const STEPS = [
  { label: 'Select Cycle', shortLabel: '1' },
  { label: 'Upload & Match', shortLabel: '2' },
  { label: 'Resolve Unmatched', shortLabel: '3' },
  { label: 'Mark Uncovered', shortLabel: '4' },
  { label: 'Exceptions', shortLabel: '5' },
  { label: 'Reconciliation', shortLabel: '6' },
  { label: 'Final Close', shortLabel: '7' },
];

const initialState: WizardState = {
  selectedMmpId: null,
  selectedMmp: null,
  uploadedFileName: null,
  fileConfirmed: false,
  fileRows: [],
  fileColumns: [],
  columnMapping: {},
  matchResults: [],
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
  const [currentStep, setCurrentStep] = useState(1);
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>([
    'in_progress', 'not_started', 'not_started', 'not_started', 'not_started', 'not_started', 'not_started',
  ]);
  const [wizardState, setWizardState] = useState<WizardState>(initialState);

  const updateWizardState = (patch: Partial<WizardState>) => {
    setWizardState(prev => ({ ...prev, ...patch }));
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
    if (currentStep === 3) return true;
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
                  <span className="hidden sm:inline">{step.label}</span>
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
            {currentStep === 1 && <Step1SelectCycle {...stepProps} />}
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
