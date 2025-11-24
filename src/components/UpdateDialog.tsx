import { useEffect, useState } from 'react';
import { checkAppVersion, getAppVersion, type AppVersionInfo } from '@/utils/versionChecker';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Sparkles, AlertTriangle } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

export function UpdateDialog() {
  const [versionInfo, setVersionInfo] = useState<AppVersionInfo | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [appBlocked, setAppBlocked] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    async function checkVersion() {
      if (!isMobile) return;

      const currentVersion = getAppVersion();
      const info = await checkAppVersion(currentVersion, 'mobile');
      
      setVersionInfo(info);
      
      if (info.update_required) {
        setShowDialog(true);
        setAppBlocked(true);
      } else if (info.update_available) {
        setShowDialog(true);
      }
    }

    checkVersion();
    
    const interval = setInterval(checkVersion, 3600000);
    return () => clearInterval(interval);
  }, [isMobile]);

  if (!versionInfo || !isMobile) return null;

  const isRequired = versionInfo.update_required;

  return (
    <>
      {appBlocked && (
        <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center">
          <div className="max-w-md w-full mx-4">
            {/* App blocked overlay - render inside to ensure it's always visible */}
          </div>
        </div>
      )}
      <Dialog 
        open={showDialog} 
        onOpenChange={!isRequired ? setShowDialog : undefined}
      >
        <DialogContent 
          className="sm:max-w-md z-[10000]"
          onPointerDownOutside={(e) => {
            if (isRequired) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (isRequired) e.preventDefault();
          }}
        >
        <DialogHeader>
          <div className="flex items-center gap-2">
            {isRequired ? (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            ) : (
              <Sparkles className="h-5 w-5 text-primary" />
            )}
            <DialogTitle>
              {isRequired ? 'Update Required' : 'Update Available'}
            </DialogTitle>
          </div>
          <DialogDescription>
            {isRequired
              ? 'You must update to continue using PACT Workflow.'
              : 'A new version of PACT Workflow is available with new features and improvements.'}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-muted p-4 rounded-md space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Current Version</span>
              <Badge variant="outline">{versionInfo.current}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Latest Version</span>
              <Badge variant="default" className="bg-gradient-to-r from-primary to-blue-600">
                {versionInfo.latest}
              </Badge>
            </div>
          </div>

          {versionInfo.changelog && (
            <div className="bg-muted p-4 rounded-md">
              <h4 className="text-sm font-medium mb-2">What's New</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {versionInfo.changelog}
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <Button 
              onClick={() => {
                const url = versionInfo.download_url || 
                  'https://play.google.com/store/apps/details?id=com.pact.workflow';
                window.open(url, '_system');
              }}
              className="flex-1 bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90"
              data-testid="button-update-now"
            >
              <Download className="w-4 h-4 mr-2" />
              Update Now
            </Button>
            
            {!isRequired && (
              <Button 
                variant="outline"
                onClick={() => setShowDialog(false)}
                data-testid="button-update-later"
              >
                Later
              </Button>
            )}
          </div>

          {isRequired && (
            <p className="text-xs text-center text-muted-foreground">
              This update is required to ensure compatibility with the latest features and security improvements.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
