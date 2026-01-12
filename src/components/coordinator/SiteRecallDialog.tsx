import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RotateCcw, AlertTriangle, Loader2, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  recallSites,
  getTargetStatusOptions,
  SITE_STATUS_LABELS,
  type SiteStatus,
  type SiteRecallRequest
} from '@/services/siteRecall.service';

interface SiteForRecall {
  id: string;
  site_name: string;
  status: string;
  locality?: string;
  state?: string;
}

interface SiteRecallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sites: SiteForRecall[];
  currentUserId: string;
  currentUserEmail?: string;
  currentUserName?: string;
  onRecallComplete?: () => void;
}

export function SiteRecallDialog({
  open,
  onOpenChange,
  sites,
  currentUserId,
  currentUserEmail,
  currentUserName,
  onRecallComplete
}: SiteRecallDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [targetStatus, setTargetStatus] = useState<SiteStatus | ''>('');
  const [reason, setReason] = useState('');
  const [selectedState, setSelectedState] = useState<string>('all');

  // Get unique states from sites
  const availableStates = useMemo(() => {
    const states = new Set<string>();
    sites.forEach(site => {
      if (site.state) {
        states.add(site.state);
      }
    });
    return Array.from(states).sort();
  }, [sites]);

  // Filter sites by selected state
  const filteredSites = useMemo(() => {
    if (selectedState === 'all') return sites;
    return sites.filter(site => site.state === selectedState);
  }, [sites, selectedState]);

  const targetStatusOptions = useMemo(() => {
    if (filteredSites.length === 0) return [];
    
    const firstSiteStatus = filteredSites[0].status;
    const allSameStatus = filteredSites.every(s => 
      s.status?.toLowerCase().replace(/\s+/g, '_') === firstSiteStatus?.toLowerCase().replace(/\s+/g, '_')
    );
    
    if (!allSameStatus) {
      const allOptions = new Set<SiteStatus>();
      filteredSites.forEach(site => {
        getTargetStatusOptions(site.status).forEach(opt => allOptions.add(opt));
      });
      const optionsArray = Array.from(allOptions);
      return optionsArray.filter(opt => 
        filteredSites.every(site => getTargetStatusOptions(site.status).includes(opt))
      );
    }
    
    return getTargetStatusOptions(firstSiteStatus);
  }, [filteredSites]);

  const handleRecall = async () => {
    if (!targetStatus || !reason.trim()) {
      toast({
        title: 'Missing Information',
        description: 'Please select a target status and provide a reason for the recall.',
        variant: 'destructive'
      });
      return;
    }

    if (filteredSites.length === 0) {
      toast({
        title: 'No Sites Selected',
        description: 'Please select a state with sites to recall.',
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);

    try {
      const request: SiteRecallRequest = {
        siteEntryIds: filteredSites.map(s => s.id),
        targetStatus,
        reason,
        recalledBy: currentUserId,
        recalledByEmail: currentUserEmail,
        recalledByName: currentUserName
      };

      const result = await recallSites(request);

      if (result.success) {
        toast({
          title: 'Sites Recalled',
          description: `Successfully recalled ${result.successCount} site(s) to ${SITE_STATUS_LABELS[targetStatus]}.`
        });
        onRecallComplete?.();
        onOpenChange(false);
        setReason('');
        setTargetStatus('');
        setSelectedState('all');
      } else if (result.successCount > 0) {
        toast({
          title: 'Partial Success',
          description: `Recalled ${result.successCount} site(s). ${result.failedCount} site(s) failed.`,
          variant: 'default'
        });
        onRecallComplete?.();
        onOpenChange(false);
        setReason('');
        setTargetStatus('');
        setSelectedState('all');
      } else {
        toast({
          title: 'Recall Failed',
          description: result.errors.join('. ') || 'Failed to recall sites. Please try again.',
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      onOpenChange(false);
      setReason('');
      setTargetStatus('');
      setSelectedState('all');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-amber-500" />
            Recall {sites.length === 1 ? 'Site' : `${sites.length} Sites`}
          </DialogTitle>
          <DialogDescription>
            Move the selected site(s) back to an earlier verification stage.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Recalling sites will move them backward in the verification workflow. 
              Any verification data for stages after the target will be cleared.
            </AlertDescription>
          </Alert>

          {/* State Filter - only show if there are multiple states */}
          {availableStates.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="state-filter">Filter by State</Label>
              <Select 
                value={selectedState} 
                onValueChange={(value) => {
                  setSelectedState(value);
                  setTargetStatus(''); // Reset target status when state changes
                }}
              >
                <SelectTrigger id="state-filter" data-testid="select-state-filter">
                  <SelectValue placeholder="Select state..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States ({sites.length} sites)</SelectItem>
                  {availableStates.map(state => {
                    const count = sites.filter(s => s.state === state).length;
                    return (
                      <SelectItem key={state} value={state}>
                        {state} ({count} site{count !== 1 ? 's' : ''})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Sites to Recall
              {selectedState !== 'all' && (
                <span className="ml-2 text-muted-foreground font-normal">
                  ({filteredSites.length} from {selectedState})
                </span>
              )}
            </Label>
            <ScrollArea className="h-[120px] rounded-md border p-2">
              <div className="space-y-1">
                {filteredSites.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No sites found for the selected state.
                  </p>
                ) : (
                  filteredSites.map(site => (
                    <div key={site.id} className="flex items-center justify-between py-1 text-sm">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">{site.site_name}</span>
                        {selectedState === 'all' && site.state && (
                          <Badge variant="secondary" className="text-xs">
                            {site.state}
                          </Badge>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {site.status}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="space-y-2">
            <Label htmlFor="target-status">Recall To</Label>
            {targetStatusOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                These sites cannot be recalled further back.
              </p>
            ) : (
              <Select 
                value={targetStatus} 
                onValueChange={(value) => setTargetStatus(value as SiteStatus)}
              >
                <SelectTrigger id="target-status" data-testid="select-target-status">
                  <SelectValue placeholder="Select target status..." />
                </SelectTrigger>
                <SelectContent>
                  {targetStatusOptions.map(status => (
                    <SelectItem key={status} value={status}>
                      {SITE_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="recall-reason">Reason for Recall *</Label>
            <Textarea
              id="recall-reason"
              placeholder="Please explain why these sites need to be recalled..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              data-testid="textarea-recall-reason"
            />
            <p className="text-xs text-muted-foreground">
              This reason will be recorded in the audit log.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
            data-testid="button-cancel-recall"
          >
            Cancel
          </Button>
          <Button
            onClick={handleRecall}
            disabled={isLoading || !targetStatus || !reason.trim() || targetStatusOptions.length === 0 || filteredSites.length === 0}
            className="bg-amber-600 hover:bg-amber-700"
            data-testid="button-confirm-recall"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Recalling...
              </>
            ) : (
              <>
                <RotateCcw className="mr-2 h-4 w-4" />
                Recall {filteredSites.length} {filteredSites.length === 1 ? 'Site' : 'Sites'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
