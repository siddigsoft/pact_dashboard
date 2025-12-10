import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FileText, Clock, Trash2, RotateCcw } from 'lucide-react';
import { FormDraft, DraftRecoveryInfo } from '@/lib/offline-form-autosave';
import { hapticFeedback } from '@/lib/enhanced-haptics';

interface DraftRecoveryPromptProps {
  recoveryInfo: DraftRecoveryInfo;
  formTitle?: string;
  onRecover: (draft: FormDraft) => void;
  onDiscard: () => void;
  onDismiss: () => void;
  isOpen: boolean;
}

export function DraftRecoveryPrompt({
  recoveryInfo,
  formTitle,
  onRecover,
  onDiscard,
  onDismiss,
  isOpen,
}: DraftRecoveryPromptProps) {
  const [isLoading, setIsLoading] = useState(false);

  if (!recoveryInfo.hasDraft || !recoveryInfo.draft) {
    return null;
  }

  const { draft, age, isStale } = recoveryInfo;
  const completionPercent = draft.metadata?.completionPercent || 0;
  const step = draft.metadata?.step;
  const totalSteps = draft.metadata?.totalSteps;

  const handleRecover = async () => {
    setIsLoading(true);
    hapticFeedback.action.confirm();
    onRecover(draft);
    setIsLoading(false);
  };

  const handleDiscard = async () => {
    setIsLoading(true);
    hapticFeedback.action.delete();
    onDiscard();
    setIsLoading(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="max-w-sm" data-testid="dialog-draft-recovery">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="dialog-title-draft">
            <FileText className="h-5 w-5" />
            Unsaved Draft Found
          </DialogTitle>
          <DialogDescription data-testid="dialog-desc-draft">
            {formTitle && (
              <span className="font-medium text-foreground">{formTitle}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Last saved: {age}</span>
            {isStale && (
              <span className="text-amber-500 text-xs">(older than 24h)</span>
            )}
          </div>

          {(step !== undefined || completionPercent > 0) && (
            <div className="space-y-2">
              {step !== undefined && totalSteps !== undefined && (
                <p className="text-sm text-muted-foreground">
                  Progress: Step {step} of {totalSteps}
                </p>
              )}
              {completionPercent > 0 && (
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-foreground h-2 rounded-full transition-all"
                    style={{ width: `${completionPercent}%` }}
                  />
                </div>
              )}
            </div>
          )}

          <p className="text-sm">
            Would you like to continue where you left off or start fresh?
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={handleRecover}
            disabled={isLoading}
            className="w-full"
            data-testid="button-recover-draft"
            aria-label="Continue with saved draft"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Continue Draft
          </Button>
          <Button
            variant="outline"
            onClick={handleDiscard}
            disabled={isLoading}
            className="w-full"
            data-testid="button-discard-draft"
            aria-label="Discard draft and start fresh"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Start Fresh
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DraftIndicatorProps {
  isSaving: boolean;
  lastSaved?: Date | null;
  isDirty: boolean;
}

export function DraftIndicator({ isSaving, lastSaved, isDirty }: DraftIndicatorProps) {
  if (isSaving) {
    return (
      <div 
        className="flex items-center gap-1 text-xs text-muted-foreground"
        data-testid="indicator-draft-saving"
        aria-label="Saving draft"
      >
        <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        <span>Saving...</span>
      </div>
    );
  }

  if (lastSaved) {
    const timeAgo = getTimeAgo(lastSaved);
    return (
      <div 
        className="flex items-center gap-1 text-xs text-muted-foreground"
        data-testid="indicator-draft-saved"
        aria-label={`Draft saved ${timeAgo}`}
      >
        <div className={`h-2 w-2 rounded-full ${isDirty ? 'bg-amber-500' : 'bg-green-500'}`} />
        <span>{isDirty ? 'Unsaved changes' : `Saved ${timeAgo}`}</span>
      </div>
    );
  }

  return null;
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return `${mins}m ago`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours}h ago`;
  }
  const days = Math.floor(seconds / 86400);
  return `${days}d ago`;
}
