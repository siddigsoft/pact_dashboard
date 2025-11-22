import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, MapPin, Calendar, AlertCircle, CheckCircle2 } from 'lucide-react';
import { User } from '@/types/user';
import { SiteVisit } from '@/types/siteVisit';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { calculateDistance } from '@/utils/collectorUtils';
import { format, parseISO } from 'date-fns';

interface SmartSiteAssignmentDialogProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
  onOpenChange: (open: boolean) => void;
  onAssignmentComplete: () => void;
}

export const SmartSiteAssignmentDialog: React.FC<SmartSiteAssignmentDialogProps> = ({
  user,
  isOpen,
  onClose,
  onOpenChange,
  onAssignmentComplete,
}) => {
  const { siteVisits, assignSiteVisit } = useSiteVisitContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortedSites, setSortedSites] = useState<SiteVisit[]>([]);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const assignableSites = siteVisits.filter(
      visit => visit.status === 'pending' || visit.status === 'permitVerified'
    );

    if (!user.location?.latitude || !user.location?.longitude) {
      setSortedSites(assignableSites);
      return;
    }

    const sitesWithDistance = assignableSites.map(site => {
      const siteCoords = (site as any).coordinates || site.location;
      
      let distance = Infinity;
      if (siteCoords?.latitude && siteCoords?.longitude) {
        distance = calculateDistance(
          user.location!.latitude!,
          user.location!.longitude!,
          siteCoords.latitude,
          siteCoords.longitude
        );
      }

      return {
        ...site,
        distance,
      };
    });

    sitesWithDistance.sort((a, b) => {
      if (a.distance === Infinity && b.distance === Infinity) {
        return a.priority === 'high' ? -1 : 1;
      }
      if (a.distance === Infinity) return 1;
      if (b.distance === Infinity) return -1;
      return a.distance - b.distance;
    });

    setSortedSites(sitesWithDistance);
  }, [siteVisits, user, isOpen]);

  const filteredSites = sortedSites.filter(site =>
    site.siteName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    site.siteCode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    site.locality?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    site.state?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAssign = async (siteVisit: SiteVisit) => {
    setAssigningId(siteVisit.id);
    try {
      const success = await assignSiteVisit(siteVisit.id, user.id);
      if (success) {
        onAssignmentComplete();
      }
    } catch (error) {
      console.error('Error assigning site visit:', error);
    } finally {
      setAssigningId(null);
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high':
        return 'bg-gradient-to-r from-red-500 to-red-600 text-white';
      case 'medium':
        return 'bg-gradient-to-r from-orange-500 to-orange-600 text-white';
      default:
        return 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'permitVerified':
        return 'bg-gradient-to-r from-green-500 to-green-600 text-white';
      default:
        return 'bg-gradient-to-r from-gray-500 to-gray-600 text-white';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-4 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Assign Site Visit to {user.name}
          </DialogTitle>
          <DialogDescription>
            Select a site visit to assign. Sites are sorted by distance from {user.name}'s current location.
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 pb-3 border-b bg-muted/30">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search sites by name, code, locality, or state..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-sites"
            />
          </div>
        </div>

        <ScrollArea className="flex-1 px-4">
          <div className="space-y-2 py-3">
            {filteredSites.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No assignable sites found</p>
                <p className="text-sm">
                  {searchQuery ? 'Try adjusting your search' : 'No pending sites available'}
                </p>
              </div>
            ) : (
              filteredSites.map((site) => {
                const distance = (site as any).distance;
                const dueDate = site.dueDate ? parseISO(site.dueDate) : null;

                return (
                  <div
                    key={site.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover-elevate bg-card"
                    data-testid={`site-item-${site.id}`}
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-sm">{site.siteName}</h4>
                        {site.siteCode && (
                          <Badge variant="outline" className="text-[10px] h-5">
                            {site.siteCode}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {site.locality}, {site.state}
                        </span>
                        {dueDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(dueDate, 'MMM dd, yyyy')}
                          </span>
                        )}
                        {distance !== Infinity && (
                          <Badge variant="secondary" className="text-[10px] h-5">
                            {distance.toFixed(1)} km away
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`text-[10px] h-5 ${getStatusColor(site.status)}`}>
                          {site.status}
                        </Badge>
                        {site.priority && (
                          <Badge className={`text-[10px] h-5 ${getPriorityColor(site.priority)}`}>
                            {site.priority} Priority
                          </Badge>
                        )}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => handleAssign(site)}
                      disabled={assigningId === site.id}
                      className="ml-3 gap-1"
                      data-testid={`button-assign-site-${site.id}`}
                    >
                      {assigningId === site.id ? (
                        <>Assigning...</>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3 w-3" />
                          Assign
                        </>
                      )}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <div className="p-4 pt-3 border-t bg-muted/30 flex justify-end">
          <Button variant="outline" onClick={onClose} data-testid="button-close-dialog">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
