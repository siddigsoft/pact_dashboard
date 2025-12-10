import { Download, RefreshCw, X, Smartphone, AlertCircle } from 'lucide-react';
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
import { useAppUpdate, openDownloadUrl, openAppStore } from '@/lib/app-update-checker';
import { cn } from '@/lib/utils';

interface AppUpdateDialogProps {
  className?: string;
}

export function AppUpdateDialog({ className }: AppUpdateDialogProps) {
  const { status, checkNow, dismissUpdate } = useAppUpdate();

  if (!status.available || !status.latestVersion) {
    return null;
  }

  const isMandatory = status.latestVersion.mandatory;

  const handleUpdate = async () => {
    if (status.latestVersion?.downloadUrl) {
      await openDownloadUrl(status.latestVersion.downloadUrl);
    } else {
      await openAppStore();
    }
  };

  return (
    <Dialog open={status.available} onOpenChange={() => !isMandatory && dismissUpdate()}>
      <DialogContent className={cn("sm:max-w-md", className)}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black">
              <Smartphone className="h-6 w-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-lg">Update Available</DialogTitle>
              <DialogDescription className="flex items-center gap-2">
                Version {status.latestVersion.version}
                {isMandatory && (
                  <Badge variant="destructive" className="text-xs">
                    Required
                  </Badge>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Current version</span>
            <span className="font-medium">{status.currentVersion}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">New version</span>
            <span className="font-medium text-black dark:text-white">
              {status.latestVersion.version}
            </span>
          </div>

          {status.latestVersion.releaseNotes && status.latestVersion.releaseNotes.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">What's new:</p>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                {status.latestVersion.releaseNotes.slice(0, 5).map((note, index) => (
                  <li key={index}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          {isMandatory && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">This update is required</p>
                <p className="text-xs mt-1">
                  Please update to continue using the app. Some features may not work correctly on older versions.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {!isMandatory && (
            <Button
              variant="outline"
              onClick={dismissUpdate}
              className="w-full sm:w-auto"
              data-testid="button-dismiss-update"
            >
              <X className="h-4 w-4 mr-2" />
              Later
            </Button>
          )}
          <Button
            onClick={handleUpdate}
            className="w-full sm:w-auto bg-black text-white hover:bg-black/90"
            data-testid="button-download-update"
          >
            <Download className="h-4 w-4 mr-2" />
            Update Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UpdateCheckButton({ className }: { className?: string }) {
  const { status, checkNow } = useAppUpdate();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={checkNow}
      disabled={status.isChecking}
      className={className}
      data-testid="button-check-update"
    >
      <RefreshCw className={cn("h-4 w-4 mr-2", status.isChecking && "animate-spin")} />
      {status.isChecking ? 'Checking...' : 'Check for Updates'}
    </Button>
  );
}

export function UpdateBadge({ className }: { className?: string }) {
  const { status } = useAppUpdate();

  if (!status.available) {
    return null;
  }

  return (
    <Badge 
      variant="default" 
      className={cn("bg-black text-white", className)}
      data-testid="badge-update-available"
    >
      Update Available
    </Badge>
  );
}
