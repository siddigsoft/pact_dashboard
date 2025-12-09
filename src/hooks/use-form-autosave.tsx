import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FormDraft,
  DraftRecoveryInfo,
  FormAutoSaver,
  checkForDraft,
  deleteDraft,
} from '@/lib/offline-form-autosave';

interface UseFormAutosaveOptions<T> {
  formId: string;
  userId: string;
  enabled?: boolean;
  autoStart?: boolean;
  metadata?: {
    formTitle?: string;
    step?: number;
    totalSteps?: number;
    completionPercent?: number;
  };
  onSave?: (draft: FormDraft<T>) => void;
  onError?: (error: Error) => void;
  onRecovery?: (draft: FormDraft<T>) => void;
}

interface UseFormAutosaveReturn<T> {
  recoveryInfo: DraftRecoveryInfo | null;
  isSaving: boolean;
  lastSaved: Date | null;
  isDirty: boolean;
  isChecking: boolean;
  updateData: (data: T) => void;
  updateMetadata: (metadata: Partial<FormDraft['metadata']>) => void;
  forceSave: () => Promise<FormDraft<T> | null>;
  discardDraft: () => Promise<void>;
  recoverDraft: () => Promise<FormDraft<T> | null>;
  dismissRecovery: () => void;
  start: () => void;
  stop: () => void;
}

export function useFormAutosave<T extends Record<string, any>>(
  options: UseFormAutosaveOptions<T>
): UseFormAutosaveReturn<T> {
  const {
    formId,
    userId,
    enabled = true,
    autoStart = true,
    metadata,
    onSave,
    onError,
    onRecovery,
  } = options;

  const [recoveryInfo, setRecoveryInfo] = useState<DraftRecoveryInfo | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  const autosaverRef = useRef<FormAutoSaver<T> | null>(null);
  const isStartedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !userId) return;

    const checkDraft = async () => {
      setIsChecking(true);
      try {
        const info = await checkForDraft(formId, userId);
        setRecoveryInfo(info);
      } catch (error) {
        console.error('[FormAutosave] Error checking draft:', error);
      } finally {
        setIsChecking(false);
      }
    };

    checkDraft();
  }, [formId, userId, enabled]);

  useEffect(() => {
    if (!enabled || !userId) return;

    autosaverRef.current = new FormAutoSaver<T>(formId, userId, {
      onSave: (draft) => {
        setIsSaving(false);
        setLastSaved(new Date(draft.lastSaved));
        setIsDirty(false);
        onSave?.(draft);
      },
      onError: (error) => {
        setIsSaving(false);
        onError?.(error);
      },
      metadata,
    });

    if (autoStart && !recoveryInfo?.hasDraft) {
      autosaverRef.current.start();
      isStartedRef.current = true;
    }

    return () => {
      autosaverRef.current?.stop();
      isStartedRef.current = false;
    };
  }, [formId, userId, enabled, autoStart, metadata, onSave, onError, recoveryInfo?.hasDraft]);

  const start = useCallback(() => {
    if (autosaverRef.current && !isStartedRef.current) {
      autosaverRef.current.start();
      isStartedRef.current = true;
    }
  }, []);

  const stop = useCallback(() => {
    if (autosaverRef.current && isStartedRef.current) {
      autosaverRef.current.stop();
      isStartedRef.current = false;
    }
  }, []);

  const updateData = useCallback((data: T) => {
    if (autosaverRef.current) {
      autosaverRef.current.update(data);
      setIsDirty(true);
    }
  }, []);

  const updateMetadata = useCallback((newMetadata: Partial<FormDraft['metadata']>) => {
    if (autosaverRef.current) {
      autosaverRef.current.updateMetadata(newMetadata);
    }
  }, []);

  const forceSave = useCallback(async (): Promise<FormDraft<T> | null> => {
    if (!autosaverRef.current || !enabled || !userId) return null;

    setIsSaving(true);
    try {
      const draft = await autosaverRef.current.forceSave();
      
      if (draft) {
        setLastSaved(new Date(draft.lastSaved));
        setIsDirty(false);
      }
      return draft;
    } catch (error) {
      onError?.(error as Error);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [enabled, userId, onError]);

  const discardDraft = useCallback(async (): Promise<void> => {
    if (!autosaverRef.current) return;

    await autosaverRef.current.discardDraft();
    setRecoveryInfo({ hasDraft: false, age: '', isStale: false });
    setLastSaved(null);
    setIsDirty(false);
  }, []);

  const recoverDraft = useCallback(async (): Promise<FormDraft<T> | null> => {
    if (!autosaverRef.current || !enabled || !userId) return null;

    try {
      const draft = await autosaverRef.current.loadDraft();
      
      if (draft) {
        setLastSaved(new Date(draft.lastSaved));
        onRecovery?.(draft);
        
        if (!isStartedRef.current) {
          autosaverRef.current.start();
          isStartedRef.current = true;
        }
      }

      setRecoveryInfo({ hasDraft: false, age: '', isStale: false });
      return draft;
    } catch (error) {
      onError?.(error as Error);
      return null;
    }
  }, [enabled, userId, onRecovery, onError]);

  const dismissRecovery = useCallback(async () => {
    setRecoveryInfo({ hasDraft: false, age: '', isStale: false });
    
    if (autosaverRef.current && !isStartedRef.current && enabled && userId) {
      await autosaverRef.current.discardDraft();
      autosaverRef.current.start();
      isStartedRef.current = true;
    }
  }, [enabled, userId]);

  return {
    recoveryInfo,
    isSaving,
    lastSaved,
    isDirty,
    isChecking,
    updateData,
    updateMetadata,
    forceSave,
    discardDraft,
    recoverDraft,
    dismissRecovery,
    start,
    stop,
  };
}

export function useFormDraftRecovery<T>(
  formId: string,
  userId: string
): {
  checkForDraft: () => Promise<DraftRecoveryInfo>;
  discardDraft: () => Promise<void>;
} {
  const checkDraft = useCallback(async () => {
    return checkForDraft(formId, userId);
  }, [formId, userId]);

  const discard = useCallback(async () => {
    await deleteDraft(formId, userId);
  }, [formId, userId]);

  return {
    checkForDraft: checkDraft,
    discardDraft: discard,
  };
}
