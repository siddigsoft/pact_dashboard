import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, User, Clock, Play } from 'lucide-react';
import { MMPSiteEntry } from '@/types/mmp';

interface StartVisitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site: MMPSiteEntry | null;
  onConfirm: () => Promise<void>;
  isStarting?: boolean;
  currentUser?: any;
}

export const StartVisitDialog: React.FC<StartVisitDialogProps> = ({
  open,
  onOpenChange,
  site,
  onConfirm,
  isStarting = false,
  currentUser
}) => {
  const handleStartVisit = async () => {
    if (!site) return;

    try {
      await onConfirm();
      // Dialog will be closed by the parent component after onConfirm
    } catch (error) {
      console.error('Error starting visit:', error);
    }
  };

  if (!site) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-blue-600" />
            Start Site Visit
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Site Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Site Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Location:</span>
                  <span className="text-sm">{site.locality || site.state || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Site ID:</span>
                  <span className="text-sm">{site.siteCode || site.id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Site Name:</span>
                  <span className="text-sm">{site.siteName || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Status:</span>
                  <Badge variant="secondary">{site.status}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Enumerator:</span>
                  <span className="text-sm">{currentUser?.full_name || currentUser?.username || currentUser?.email || 'Unknown'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Activity:</span>
                  <span className="text-sm">{site.siteActivity || 'N/A'}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">What happens next?</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Visit duration will start counting automatically</li>
              <li>• Location monitoring will begin for accuracy tracking</li>
              <li>• You'll be prompted to complete the detailed visit report</li>
              <li>• Photos and observations can be added during the visit</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isStarting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleStartVisit}
            disabled={isStarting}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
          >
            <Play className="h-4 w-4" />
            {isStarting ? 'Starting Visit...' : 'Start Site Visit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};