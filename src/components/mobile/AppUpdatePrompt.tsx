import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Download, 
  AlertTriangle, 
  Sparkles, 
  X,
  ArrowRight,
  Shield
} from 'lucide-react';
import {
  UpdateCheckResult,
  getUpdatePriority,
  openAppStore,
  skipVersion,
  formatReleaseNotes,
} from '@/lib/app-update';
import { hapticFeedback } from '@/lib/enhanced-haptics';

interface AppUpdatePromptProps {
  updateResult: UpdateCheckResult;
  isOpen: boolean;
  onDismiss: () => void;
}

export function AppUpdatePrompt({ updateResult, isOpen, onDismiss }: AppUpdatePromptProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);
  const priority = getUpdatePriority(updateResult);

  if (!updateResult.updateAvailable || !updateResult.latestVersion) {
    return null;
  }

  const { latestVersion, isForceUpdate, currentVersion } = updateResult;

  const handleUpdate = async () => {
    setIsUpdating(true);
    setStoreError(null);
    hapticFeedback.action.confirm();
    
    const result = await openAppStore();
    
    if (!result.success) {
      hapticFeedback.form.error();
      setStoreError(result.error || 'Failed to open app store');
    }
    
    setIsUpdating(false);
  };

  const handleSkip = () => {
    if (!isForceUpdate && latestVersion) {
      hapticFeedback.action.cancel();
      skipVersion(latestVersion.version);
      onDismiss();
    }
  };

  const handleLater = () => {
    if (!isForceUpdate) {
      hapticFeedback.tap();
      onDismiss();
    }
  };

  const getPriorityColor = () => {
    switch (priority) {
      case 'critical': return 'bg-destructive text-destructive-foreground';
      case 'recommended': return 'bg-amber-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getPriorityIcon = () => {
    switch (priority) {
      case 'critical': return <Shield className="h-4 w-4" />;
      case 'recommended': return <Sparkles className="h-4 w-4" />;
      default: return <Download className="h-4 w-4" />;
    }
  };

  return (
    <Dialog 
      open={isOpen} 
      onOpenChange={(open) => !open && !isForceUpdate && onDismiss()}
      modal={true}
    >
      <DialogContent 
        className="max-w-sm"
        data-testid="dialog-app-update"
        onEscapeKeyDown={(e) => isForceUpdate && e.preventDefault()}
        onPointerDownOutside={(e) => isForceUpdate && e.preventDefault()}
        onInteractOutside={(e) => isForceUpdate && e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            {priority === 'critical' ? (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            ) : (
              <Sparkles className="h-5 w-5 text-foreground" />
            )}
            <DialogTitle data-testid="dialog-title-update">
              {isForceUpdate ? 'Update Required' : 'Update Available'}
            </DialogTitle>
          </div>
          <DialogDescription data-testid="dialog-desc-update" asChild>
            <div className="space-y-2">
              <div className="flex items-center gap-2 mt-2">
                <span className="text-sm">v{currentVersion}</span>
                <ArrowRight className="h-3 w-3" />
                <span className="text-sm font-medium">v{latestVersion.version}</span>
                <Badge className={`text-xs ${getPriorityColor()}`}>
                  {getPriorityIcon()}
                  <span className="ml-1 capitalize">{priority}</span>
                </Badge>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        {latestVersion.releaseNotes.length > 0 && (
          <>
            <Separator />
            <div className="py-2">
              <h4 className="text-sm font-medium mb-2">What&apos;s New</h4>
              <ScrollArea className="max-h-32">
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {latestVersion.releaseNotes.map((note, index) => (
                    <li key={index} className="flex gap-2">
                      <span className="text-foreground">•</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          </>
        )}

        {isForceUpdate && (
          <div 
            className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm"
            data-testid="text-force-update-warning"
          >
            <p className="text-destructive">
              This update is required to continue using the app. Please update now.
            </p>
          </div>
        )}

        {storeError && (
          <div 
            className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm"
            data-testid="text-store-error"
            role="alert"
            aria-live="polite"
          >
            <p className="text-destructive">{storeError}</p>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={handleUpdate}
            disabled={isUpdating}
            className="w-full"
            data-testid="button-update-app"
            aria-label="Update app now"
          >
            <Download className="h-4 w-4 mr-2" />
            {isUpdating ? 'Opening Store...' : 'Update Now'}
          </Button>

          {!isForceUpdate && (
            <div className="flex gap-2 w-full">
              <Button
                variant="ghost"
                onClick={handleSkip}
                className="flex-1"
                data-testid="button-skip-version"
                aria-label="Skip this version"
              >
                Skip Version
              </Button>
              <Button
                variant="outline"
                onClick={handleLater}
                className="flex-1"
                data-testid="button-update-later"
                aria-label="Remind me later"
              >
                Later
              </Button>
            </div>
          )}

          {isForceUpdate && (
            <p className="text-xs text-center text-muted-foreground">
              You cannot skip this update
            </p>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useAppUpdateCheck() {
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const setup = async () => {
      const { registerForAutoUpdateCheck, initAppVersion } = await import('@/lib/app-update');
      await initAppVersion();

      unsubscribe = await registerForAutoUpdateCheck((result) => {
        setUpdateResult(result);
        if (result.updateAvailable) {
          setShowPrompt(true);
        }
      });
    };

    setup();

    return () => {
      unsubscribe?.();
    };
  }, []);

  const dismissPrompt = () => {
    setShowPrompt(false);
  };

  return {
    updateResult,
    showPrompt,
    dismissPrompt,
  };
}
