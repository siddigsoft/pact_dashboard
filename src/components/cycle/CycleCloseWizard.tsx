
import { useState, useMemo, useEffect, useRef } from 'react';
import { X, CheckCircle2, Circle, AlertCircle, Clock, ChevronRight, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Step1SelectCycle from './steps/Step1SelectCycle';
import Step2UploadMatch from './steps/Step2UploadMatch';
import Step3MarkUncovered from './steps/Step4MarkUncovered';
import Step5Exceptions from './steps/Step5Exceptions';
import Step6Reconciliation from './steps/Step6Reconciliation';
import Step7FinalClose from './steps/Step7FinalClose';
import type { MatchResult, MatchPair } from '@/utils/fuzzyMatcher';
import { supabase } from '@/integrations/supabase/client';
import { dispatchNotification } from '@/lib/notify';

export type StepStatus = 'not_started' | 'in_progress' | 'done' | 'blocked';

// ─── Session persistence ────────────────────────────────────────────────────
const STORAGE_VERSION = 'v2'; // bumped: 7-step → 6-step (Step 3 merged into Step 2)
const getKey = (mmpId: string) => `pact_ccw_${STORAGE_VERSION}_${mmpId}`;

export interface SavedSession {
  savedAt: string;          // ISO timestamp
  currentStep: number;
  stepStatuses: StepStatus[];
  wizardState: Omit<WizardState, 'mmpRawRows'>; // mmpRawRows re-fetched from DB
}

export interface ExceptionDecision {
  /** Paid-advance options: roll / return / writeoff / redirect
   *  Approved (unpaid) options: cancel / hold / reassign / reduce */
  decision: 'roll' | 'return' | 'writeoff' | 'redirect' | 'cancel' | 'hold' | 'reassign' | 'reduce';
  /** Amount to redirect (redirect) or reduced approved amount (reduce) */
  amount?: number;
  justification?: string;
  approvedBy?: string;
  /** For 'reassign': the covered mmp_site_entry_id to move this advance to */
  targetSiteId?: string;
}

export interface UncoveredReason {
  reason: string;
  note: string;
  flagged: boolean;
  status?: 'draft' | 'confirmed';
  confirmedBy?: string | null;
  confirmedAt?: string | null;
  confirmationNote?: string | null;
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
  { label: 'Select Cycle',   arLabel: 'اختيار الدورة',       shortLabel: '1' },
  { label: 'Upload & Match', arLabel: 'رفع الملف والمطابقة', shortLabel: '2' },
  { label: 'Mark Uncovered', arLabel: 'المواقع غير المغطاة', shortLabel: '3' },
  { label: 'Exceptions',     arLabel: 'الاستثناءات',          shortLabel: '4' },
  { label: 'Reconciliation', arLabel: 'المراجعة',             shortLabel: '5' },
  { label: 'Final Close',    arLabel: 'الإغلاق النهائي',      shortLabel: '6' },
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
  initialStep?: number;
  initialMmpId?: string | null;
}

export interface RoleFlags {
  isCoordinator: boolean;
  isSupervisor: boolean;
  isFOM: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

const normalizeRole = (value: string) => value.toLowerCase().replace(/[\s_()-]+/g, '');

export function getCycleCloseRoleFlags(currentUser: any) {
  const roles = [
    currentUser?.role,
    ...(Array.isArray(currentUser?.roles) ? currentUser.roles : []),
    ...(Array.isArray(currentUser?.additionalRoles)
      ? currentUser.additionalRoles.map((r: any) => r?.role).filter(Boolean)
      : []),
  ]
    .filter(Boolean)
    .map((r: string) => normalizeRole(String(r)));

  const hasAny = (variants: string[]) => variants.some(v => roles.includes(v));

  const isCoordinator = hasAny(['coordinator']);
  const isSupervisor = hasAny(['supervisor', 'hubsupervisor']);
  const isFOM = hasAny(['fom', 'fieldoperationmanager']);
  const isAdmin = hasAny(['admin']);
  const isSuperAdmin = hasAny(['superadmin']);

  return { isCoordinator, isSupervisor, isFOM, isAdmin, isSuperAdmin };
}

export function isCycleCloseStep4ContributorOnly(currentUser: any): boolean {
  const primary = normalizeRole(String(currentUser?.role ?? ''));
  if (['coordinator', 'supervisor', 'hubsupervisor'].includes(primary)) return true;

  const flags = getCycleCloseRoleFlags(currentUser);
  return (flags.isCoordinator || flags.isSupervisor) && !flags.isFOM && !flags.isAdmin && !flags.isSuperAdmin;
}

export function uncoveredSiteIdsFromWizardState(wizardState: WizardState): string[] {
  return [...new Set([
    ...wizardState.matchResults
      .filter(r => r.action === 'reject')
      .map(r => r.matchedSiteId).filter(Boolean) as string[],
    ...Object.keys(wizardState.resolvedSites)
      .filter(k => wizardState.resolvedSites[k] === 'not_covered'),
    ...(wizardState.unmatchedMmpSiteIds ?? []),
  ])];
}

export function allUncoveredReasonsConfirmed(wizardState: WizardState): boolean {
  return uncoveredSiteIdsFromWizardState(wizardState).every((id) => {
    const reason = wizardState.uncoveredReasons[id];
    return !!reason?.reason && reason?.status === 'confirmed';
  });
}

export function pendingUnconfirmedReasonSiteIds(
  uncoveredReasons: Record<string, UncoveredReason>
): string[] {
  return Object.entries(uncoveredReasons)
    .filter(([, reason]) => !!reason?.reason && reason.status !== 'confirmed')
    .map(([id]) => id)
    .sort();
}

export function newPendingDraftSiteIds(alreadyNotifiedIds: string[], pendingIds: string[]): string[] {
  const seen = new Set(alreadyNotifiedIds);
  return pendingIds.filter(id => !seen.has(id));
}

export function allSiteReasonsConfirmed(
  siteIds: string[],
  uncoveredReasons: Record<string, UncoveredReason>
): boolean {
  if (siteIds.length === 0) return false;
  return siteIds.every((id) => {
    const reason = uncoveredReasons[id];
    return !!reason?.reason && reason.status === 'confirmed';
  });
}

export function justBecameFullyConfirmed(
  previousReasons: Record<string, UncoveredReason>,
  nextReasons: Record<string, UncoveredReason>,
  siteIds: string[],
): boolean {
  return !allSiteReasonsConfirmed(siteIds, previousReasons)
    && allSiteReasonsConfirmed(siteIds, nextReasons);
}

export function isCycleCloseFinalizerProfile(profile: {
  role?: string | null;
  additional_roles?: unknown;
}): boolean {
  const flags = getCycleCloseRoleFlags({
    role: profile.role,
    additionalRoles: profile.additional_roles,
  });
  return flags.isAdmin || flags.isSuperAdmin || flags.isFOM;
}

function isSupervisorProfile(profile: {
  role?: string | null;
  additional_roles?: unknown;
}): boolean {
  const norm = (value: string | null | undefined) =>
    (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['supervisor', 'hubsupervisor'].includes(norm(profile.role))) return true;
  const extra = Array.isArray(profile.additional_roles) ? profile.additional_roles : [];
  return extra.some((row: any) => ['supervisor', 'hubsupervisor'].includes(norm(row?.role)));
}

export default function CycleCloseWizard({
  onClose,
  isFOM,
  isAdmin,
  isSuperAdmin,
  currentUser,
  initialStep,
  initialMmpId,
}: Props) {
  const roleFlags = getCycleCloseRoleFlags(currentUser);
  const isStep4ContributorOnly = isCycleCloseStep4ContributorOnly(currentUser);
  const canFinalizeClose = !isStep4ContributorOnly && (roleFlags.isFOM || roleFlags.isAdmin || roleFlags.isSuperAdmin);

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

  // Contributor-only users land on step 3 (Mark Uncovered). All others start at
  // initialStep if provided (clamped to 1–6), or step 1 by default.
  const [currentStep, setCurrentStep] = useState(
    isStep4ContributorOnly ? 3 : (initialStep && initialStep >= 1 && initialStep <= 6 ? initialStep : 1)
  );
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(
    isStep4ContributorOnly
      ? ['done', 'done', 'in_progress', 'blocked', 'blocked', 'blocked']
      : ['in_progress', 'not_started', 'not_started', 'not_started', 'not_started', 'not_started']
  );
  const [wizardState, setWizardState] = useState<WizardState>(initialState);
  const [savedSession, setSavedSession] = useState<SavedSession | null>(null);
  const [contributorCycleReady, setContributorCycleReady] = useState(!isStep4ContributorOnly);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const step4NotifiedMmpIdsRef = useRef<Set<string>>(new Set());
  const step4DraftNotifiedSiteIdsRef = useRef<Set<string>>(new Set());
  const step4AdminNotifiedMmpIdsRef = useRef<Set<string>>(new Set());

  const updateWizardState = (patch: Partial<WizardState>) => {
    setWizardState(prev => ({ ...prev, ...patch }));
  };

  const applySelectedCycle = (mmp: any) => {
    if (!mmp?.id) return;
    updateWizardState({
      selectedMmpId: mmp.id,
      selectedMmp: mmp,
      uploadedFileName: null,
      fileColumns: [],
      fileRows: [],
      columnMapping: {},
      fileConfirmed: false,
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
    });
  };

  const markCycleClosing = async (mmpId: string) => {
    const { error } = await supabase
      .from('mmp_files')
      .update({ cycle_status: 'closing' })
      .eq('id', mmpId)
      .neq('cycle_status', 'closed');
    if (error) console.warn('[CycleCloseWizard] failed to mark cycle closing:', error);
  };

  useEffect(() => {
    if (!isStep4ContributorOnly) return;
    setCurrentStep(3);
    setStepStatuses(['done', 'done', 'in_progress', 'blocked', 'blocked', 'blocked']);
  }, [isStep4ContributorOnly]);

  useEffect(() => {
    const requestedId = initialMmpId ?? null;
    if (!isStep4ContributorOnly && !requestedId) return;
    let cancelled = false;
    (async () => {
      if (requestedId) {
        const { data, error } = await supabase
          .from('mmp_files')
          .select('id, name, month, hub, cycle_status, status, created_at')
          .eq('id', requestedId)
          .single();
        if (error) console.warn('[CycleCloseWizard] cycle lookup failed:', error);
        if (!cancelled && data) applySelectedCycle(data);
        if (!isStep4ContributorOnly) return;
      }
      if (!isStep4ContributorOnly) return;
      const { data, error } = await supabase
        .from('mmp_files')
        .select('id, name, month, hub, cycle_status, status, created_at')
        .not('status', 'eq', 'rejected')
        .order('created_at', { ascending: false })
        .limit(80);
      if (error) {
        console.warn('[CycleCloseWizard] cycle list failed:', error);
        if (!cancelled) setContributorCycleReady(true);
        return;
      }
      if (cancelled || !data?.length) {
        if (!cancelled) setContributorCycleReady(true);
        return;
      }
      const open = data.filter((m: any) => String(m.cycle_status ?? 'active').toLowerCase() !== 'closed');
      const { data: uncovered } = await supabase
        .from('mmp_site_entries')
        .select('mmp_file_id')
        .eq('status', 'not_covered')
        .in('mmp_file_id', open.map((m: any) => m.id));
      const uncoveredCount = new Map<string, number>();
      for (const row of uncovered ?? []) {
        const id = (row as any).mmp_file_id as string;
        uncoveredCount.set(id, (uncoveredCount.get(id) ?? 0) + 1);
      }
      const ranked = open
        .map((m: any) => ({
          mmp: m,
          uncovered: uncoveredCount.get(m.id) ?? 0,
          closing: String(m.cycle_status ?? '').toLowerCase() === 'closing',
        }))
        .filter(x => x.uncovered > 0 || x.closing)
        .sort((a, b) => b.uncovered - a.uncovered || Number(b.closing) - Number(a.closing));
      const pick = ranked[0]?.mmp ?? null;
      if (!requestedId && pick) applySelectedCycle(pick);
      setContributorCycleReady(true);
    })();
    return () => { cancelled = true; };
  }, [initialMmpId, isStep4ContributorOnly]);

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
      if (step < 6) next[step] = 'in_progress';
      return next;
    });
  };

  const goToStep = (step: number) => {
    if (isStep4ContributorOnly) {
      if (step === 3) setCurrentStep(3);
      return;
    }
    if (step < currentStep || stepStatuses[step - 1] !== 'not_started') {
      setCurrentStep(step);
    }
  };

  const canAdvance = useMemo(() => {
    if (currentStep === 1) return !!wizardState.selectedMmpId;
    if (currentStep === 2) {
      const hasUnactioned = wizardState.matchResults.some(r => r.status === 'review');
      const hasResubmit   = Object.values(wizardState.resolvedSites).some(v => v === 'resubmit');
      return wizardState.matchResults.length > 0 && !hasUnactioned && !hasResubmit;
    }
    if (currentStep === 3) {
      // Step 3 = Mark Uncovered: every not-covered site must have a supervisor-confirmed reason.
      return allUncoveredReasonsConfirmed(wizardState);
    }
    if (currentStep === 4) {
      // Step 4 = Exceptions (was Step 5)
      const exceptions = Object.keys(wizardState.exceptionDecisions);
      return exceptions.every(k => !!wizardState.exceptionDecisions[k].decision);
    }
    if (currentStep === 5) {
      // Step 5 = Reconciliation (read-only financial view).
      // Payment happens in Field Payments Centre; canAdvance is always true here.
      // The real payment gate is check #8 in the Final Close step.
      return true;
    }
    return false;
  }, [currentStep, wizardState]);

  const notifyStep4Stakeholders = async () => {
    const mmpId = wizardState.selectedMmpId;
    if (!mmpId || step4NotifiedMmpIdsRef.current.has(mmpId)) return;

    const uniqueIds = uncoveredSiteIdsFromWizardState(wizardState);
    if (uniqueIds.length === 0) return;

    await markCycleClosing(mmpId);

    await supabase
      .from('mmp_site_entries')
      .update({ status: 'not_covered' })
      .in('id', uniqueIds);

    const { data: rpcRecipients, error: rpcRecipientsError } = await (supabase as any).rpc(
      'get_cycle_close_step4_recipients',
      { p_site_ids: uniqueIds }
    );
    if (rpcRecipientsError) {
      console.warn('[CycleCloseWizard] recipient RPC failed:', rpcRecipientsError);
      return;
    }
    const recipients = new Set<string>(
      (rpcRecipients ?? [])
        .map((r: any) => r?.user_id)
        .filter(Boolean)
    );

    if (recipients.size === 0) return;

    const actionUrl = `/mmp?action=close-cycle&step=3&mmpId=${mmpId}`;
    const cycleName = wizardState.selectedMmp?.name ?? 'Cycle';
    const titleEn = `Cycle Close Step 3 is ready: ${cycleName}`;
    const titleAr = `الخطوة ٣ من إغلاق الدورة جاهزة: ${cycleName}`;
    const messageEn = `Please complete Step 3 (Mark Uncovered) for your assigned state/hub scope. ${uniqueIds.length} site(s) require uncovered reasons.`;
    const messageAr = `يرجى إكمال الخطوة ٣ (تحديد المواقع غير المغطاة) ضمن نطاق الولاية/المركز الخاص بك. ${uniqueIds.length} موقع(اً) يحتاج سبباً.`;

    await dispatchNotification({
      event: 'cycle_close_step4_ready',
      recipientIds: Array.from(recipients),
      titleEn,
      titleAr,
      messageEn,
      messageAr,
      priority: 'high',
      entityType: 'mmpFile',
      entityId: mmpId,
      actionUrl,
      sendEmail: true,
      triggeredBy: currentUser?.id,
      triggeredByName: currentUser?.full_name ?? currentUser?.name,
      metadata: {
        cycle: cycleName,
        uncovered_count: uniqueIds.length,
        mmp_code: wizardState.selectedMmp?.mmp_id ?? wizardState.selectedMmp?.code ?? undefined,
      },
    });
    step4NotifiedMmpIdsRef.current.add(mmpId);
  };

  const notifyStep4SupervisorsOfDrafts = async (pendingSiteIds: string[]) => {
    const mmpId = wizardState.selectedMmpId;
    if (!mmpId || !roleFlags.isCoordinator) return;

    const newlyDrafted = newPendingDraftSiteIds(
      Array.from(step4DraftNotifiedSiteIdsRef.current),
      pendingSiteIds,
    );
    if (newlyDrafted.length === 0) return;
    newlyDrafted.forEach(id => step4DraftNotifiedSiteIdsRef.current.add(id));

    const { data: rpcRecipients, error: rpcRecipientsError } = await (supabase as any).rpc(
      'get_cycle_close_step4_recipients',
      { p_site_ids: newlyDrafted }
    );
    if (rpcRecipientsError) {
      console.warn('[CycleCloseWizard] draft recipient RPC failed:', rpcRecipientsError);
      newlyDrafted.forEach(id => step4DraftNotifiedSiteIdsRef.current.delete(id));
      return;
    }

    const candidateIds = Array.from(new Set(
      (rpcRecipients ?? [])
        .map((r: any) => r?.user_id)
        .filter((id: string | undefined) => id && id !== currentUser?.id)
    )) as string[];
    if (candidateIds.length === 0) return;

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, role, additional_roles')
      .in('id', candidateIds);
    if (profilesError) {
      console.warn('[CycleCloseWizard] draft recipient profile lookup failed:', profilesError);
      newlyDrafted.forEach(id => step4DraftNotifiedSiteIdsRef.current.delete(id));
      return;
    }

    const supervisorIds = (profiles ?? [])
      .filter(isSupervisorProfile)
      .map(p => p.id);
    if (supervisorIds.length === 0) return;

    const actionUrl = `/mmp?action=close-cycle&step=3&mmpId=${mmpId}`;
    const cycleName = wizardState.selectedMmp?.name ?? 'Cycle';
    const pendingCount = pendingSiteIds.length;
    const titleEn = `Uncovered reasons ready for confirmation: ${cycleName}`;
    const titleAr = `أسباب المواقع غير المغطاة جاهزة للتأكيد: ${cycleName}`;
    const messageEn = `${pendingCount} uncovered site(s) now have draft reasons. Please review and confirm in Step 3.`;
    const messageAr = `${pendingCount} موقع(اً) غير مغطى أصبح له سبب مسودة. يرجى المراجعة والتأكيد في الخطوة ٣.`;

    await dispatchNotification({
      event: 'cycle_close_step4_drafts_saved',
      recipientIds: supervisorIds,
      titleEn,
      titleAr,
      messageEn,
      messageAr,
      priority: 'high',
      entityType: 'mmpFile',
      entityId: mmpId,
      actionUrl,
      sendEmail: true,
      triggeredBy: currentUser?.id,
      triggeredByName: currentUser?.full_name ?? currentUser?.name,
      metadata: {
        cycle: cycleName,
        uncovered_count: pendingCount,
        mmp_code: wizardState.selectedMmp?.mmp_id ?? wizardState.selectedMmp?.code ?? undefined,
      },
    });
  };

  const notifyStep4AdminsAllConfirmed = async () => {
    const mmpId = wizardState.selectedMmpId;
    if (!mmpId || !roleFlags.isSupervisor) return;
    if (step4AdminNotifiedMmpIdsRef.current.has(mmpId)) return;
    step4AdminNotifiedMmpIdsRef.current.add(mmpId);

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, role, additional_roles')
      .eq('status', 'approved');
    if (profilesError) {
      console.warn('[CycleCloseWizard] admin recipient profile lookup failed:', profilesError);
      step4AdminNotifiedMmpIdsRef.current.delete(mmpId);
      return;
    }

    const adminIds = (profiles ?? [])
      .filter(isCycleCloseFinalizerProfile)
      .map(p => p.id)
      .filter(id => id !== currentUser?.id);
    if (adminIds.length === 0) {
      step4AdminNotifiedMmpIdsRef.current.delete(mmpId);
      return;
    }

    const actionUrl = `/mmp?action=close-cycle&step=4&mmpId=${mmpId}`;
    const cycleName = wizardState.selectedMmp?.name ?? 'Cycle';
    const supervisorName = currentUser?.full_name ?? currentUser?.name ?? 'A supervisor';
    const titleEn = `Uncovered sites confirmed — continue close: ${cycleName}`;
    const titleAr = `تم تأكيد المواقع غير المغطاة — تابع الإغلاق: ${cycleName}`;
    const messageEn = `${supervisorName} confirmed all uncovered sites for ${cycleName}. You can continue Cycle Close at Exceptions.`;
    const messageAr = `أكد ${supervisorName} جميع المواقع غير المغطاة لدورة ${cycleName}. يمكنك متابعة إغلاق الدورة من خطوة الاستثناءات.`;

    await dispatchNotification({
      event: 'cycle_close_step4_all_confirmed',
      recipientIds: adminIds,
      recipientRoles: ['admin', 'fom', 'superAdmin'],
      titleEn,
      titleAr,
      messageEn,
      messageAr,
      priority: 'high',
      entityType: 'mmpFile',
      entityId: mmpId,
      actionUrl,
      sendEmail: true,
      triggeredBy: currentUser?.id,
      triggeredByName: currentUser?.full_name ?? currentUser?.name,
      metadata: {
        cycle: cycleName,
        supervisor: supervisorName,
        mmp_code: wizardState.selectedMmp?.mmp_id ?? wizardState.selectedMmp?.code ?? undefined,
      },
    });
  };

  const handleNext = async () => {
    if (isStep4ContributorOnly) return;
    if (currentStep === 1 && wizardState.selectedMmpId) {
      await markCycleClosing(wizardState.selectedMmpId);
    }
    if (currentStep === 2) {
      try {
        await notifyStep4Stakeholders();
      } catch (err) {
        console.warn('[CycleCloseWizard] Step 3 notifications failed:', err);
      }
    }
    markStepDone(currentStep);
    setCurrentStep(s => Math.min(s + 1, 6));
  };

  const handleBack = () => {
    if (isStep4ContributorOnly) return;
    setCurrentStep(s => Math.max(s - 1, 1));
  };

  const canGoBack = !isStep4ContributorOnly && currentStep > 1 && !wizardState.cycleClosedAt;
  const isClosed = !!wizardState.cycleClosedAt;
  const canOverride = isFOM || isAdmin || isSuperAdmin;

  const stepProps = {
    wizardState,
    updateWizardState,
    isFOM,
    isAdmin,
    isSuperAdmin,
    canOverride,
    canFinalizeClose,
    roleFlags,
    currentUser,
    onNext: handleNext,
    onBack: handleBack,
    canAdvance,
    canGoBack,
    goToStep,
    isStep4ContributorOnly,
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
            const isClickable = isStep4ContributorOnly
              ? stepNum === 3
              : (stepNum < currentStep || status === 'done');
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
        {isStep4ContributorOnly && contributorCycleReady && !wizardState.selectedMmpId ? (
          <div className="max-w-2xl mx-auto p-6">
            <div className="border border-amber-300 bg-amber-50 rounded-lg p-4 text-sm text-amber-900">
              No cycle is currently in close. Coordinators and supervisors only see the MMP that an admin or FOM has started closing.
            </div>
          </div>
        ) : isClosed ? (
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
            {currentStep === 3 && (
              <Step3MarkUncovered
                {...stepProps}
                onDraftsSaved={notifyStep4SupervisorsOfDrafts}
                onAllConfirmed={notifyStep4AdminsAllConfirmed}
              />
            )}
            {currentStep === 4 && <Step5Exceptions {...stepProps} />}
            {currentStep === 5 && <Step6Reconciliation {...stepProps} />}
            {currentStep === 6 && <Step7FinalClose {...stepProps} />}
          </>
        )}
      </div>
    </div>
  );
}
