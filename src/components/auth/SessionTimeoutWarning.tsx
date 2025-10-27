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
import { Clock, RefreshCw, LogOut } from 'lucide-react';
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
    // progress relative to 60s warning window; clamp between 0-100
    const value = Math.max(0, Math.min(100, (timeLeft / 60) * 100));
    setProgress(Math.round(value));
  }, [timeLeft, isVisible]);

  return (
    <Dialog open={isVisible} onOpenChange={() => {}}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <DialogTitle className="text-base font-semibold">
              Session Ending Soon
            </DialogTitle>
          </div>
          <DialogDescription className="mt-3 text-sm text-muted-foreground">
            Your session will expire due to inactivity. You can extend your
            session to stay logged in.
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
            <Progress value={progress} className="h-2" />
          </div>
        </DialogHeader>

        <DialogFooter className="mt-4 flex gap-2">
          <Button
            variant="outline"
            onClick={onLogout}
            className="flex-1 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
          <Button
            onClick={onExtendSession}
            className="flex-1 bg-blue-600 text-white hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Stay Logged In
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SessionTimeoutWarning;
