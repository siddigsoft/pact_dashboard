import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Clock, RefreshCw, LogOut, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface SessionTimeoutWarningProps {
  isVisible: boolean;
  timeLeft: number; // seconds
  onExtendSession: () => void;
  onLogout: () => void;
  formatTimeLeft: (seconds: number) => string;
}

const SessionTimeoutWarning: React.FC<SessionTimeoutWarningProps> = ({
  isVisible,
  timeLeft,
  onExtendSession,
  onLogout,
  formatTimeLeft,
}) => {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!isVisible) return;
    const value = Math.max(0, Math.min(100, (timeLeft / 30) * 100));
    setProgress(Math.round(value));
  }, [timeLeft, isVisible]);

  return (
    <Dialog open={isVisible} onOpenChange={(open) => { if (!open) onExtendSession(); }}>
      <DialogContent className="max-w-md animate-fade-in">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <DialogTitle className="text-base font-semibold">
              Session About to Expire
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto"
              onClick={onExtendSession}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <DialogDescription className="mt-3 text-sm text-muted-foreground">
            Your session is about to expire due to inactivity.
          </DialogDescription>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Time remaining
              </span>
              <Badge variant="outline" className="font-mono">
                {formatTimeLeft(timeLeft)}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              Auto logout in {formatTimeLeft(timeLeft)}
            </div>
          </div>
          <div className="mt-3">
            <Progress value={progress} className="h-2 transition-all duration-300" />
          </div>
        </DialogHeader>
        <DialogFooter className="mt-4 flex gap-2">
          <Button
            variant="outline"
            onClick={onLogout}
            className="flex-1 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout Now
          </Button>
          <Button
            onClick={onExtendSession}
            className="flex-1 bg-blue-600 text-white hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Extend Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SessionTimeoutWarning;
