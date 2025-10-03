import React, { useState, useEffect } from 'react';
import { User, SiteVisit } from '@/types';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { calculateDistance } from '@/utils/collectorUtils';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface SmartCollectorSelectorProps {
  siteVisit: SiteVisit;
  users: User[];
  onAssign: (userId: string) => void;
  onClose: () => void;
  isOpen?: boolean;
  allSiteVisits?: SiteVisit[];
}

interface EnhancedUser extends User {
  distance?: number;
  overloaded?: boolean;
  isLocalityMatch?: boolean;
}

const SmartCollectorSelector: React.FC<SmartCollectorSelectorProps> = ({
  siteVisit,
  users,
  onAssign,
  onClose,
  isOpen,
  allSiteVisits = []
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [sortedUsers, setSortedUsers] = useState<EnhancedUser[]>([]);

  useEffect(() => {
    const dataCollectorsOnly = users.filter(user => 
      (user.role === 'dataCollector' || user.role === 'datacollector') &&
      user.status === 'active'
    );
    
    setFilteredUsers(dataCollectorsOnly);
    
    if (siteVisit.coordinates) {
      const enhancedUsers = dataCollectorsOnly.map(user => {
        const distance = user.location?.latitude && user.location?.longitude
          ? calculateDistance(
              user.location.latitude,
              user.location.longitude,
              siteVisit.coordinates.latitude,
              siteVisit.coordinates.longitude
            )
          : 999999;
        
        const isLocalityMatch = 
          (user.location?.region && siteVisit.location.region && 
           user.location.region.toLowerCase() === siteVisit.location.region.toLowerCase()) ||
          (user.stateId && siteVisit.state && 
           user.stateId.toLowerCase() === siteVisit.state.toLowerCase());
        
        const assignedVisits = allSiteVisits.filter(visit => visit.assignedTo === user.id) || [];
        const overloaded = assignedVisits.length >= 20;
        
        return {
          ...user,
          distance,
          overloaded,
          isLocalityMatch
        };
      });

      enhancedUsers.sort((a, b) => {
        if (a.availability === 'online' && b.availability !== 'online') return -1;
        if (a.availability !== 'online' && b.availability === 'online') return 1;
        
        if (a.isLocalityMatch && !b.isLocalityMatch) return -1;
        if (!a.isLocalityMatch && b.isLocalityMatch) return 1;
        
        if (!a.overloaded && b.overloaded) return -1;
        if (a.overloaded && !b.overloaded) return 1;
        
        return (a.distance || 0) - (b.distance || 0);
      });

      setSortedUsers(enhancedUsers);
    } else {
      setSortedUsers(dataCollectorsOnly);
    }
  }, [users, siteVisit, allSiteVisits]);

  if (isOpen !== undefined) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-[600px]">
          <div className="p-4">
            {renderContent()}
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  
  return renderContent();
  
  function renderContent() {
    return (
      <div className="p-4 max-h-80 overflow-y-auto">
        <h2 className="text-xl font-semibold mb-4">Smart Collector Assignment</h2>
        <p className="text-sm text-gray-500 mb-6">
          The system has automatically prioritized collectors based on proximity, workload, and availability.
        </p>
        
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-3">
            {sortedUsers.map(user => {
              const availabilityColor = 
                user.availability === 'online' ? 'bg-green-500' : 
                user.availability === 'busy' ? 'bg-amber-500' : 'bg-gray-500';
              
              return (
                <Card key={user.id} className="hover:shadow-md transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-12 w-12 border-2 border-muted">
                        <AvatarImage src={user.avatar} alt={user.name} />
                        <AvatarFallback>{user.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{user.name}</span>
                          <span className={`h-2 w-2 rounded-full ${availabilityColor}`}></span>
                          <span className="text-xs text-muted-foreground">
                            {user.availability === 'online' ? 'Available' : 
                             user.availability === 'busy' ? 'Busy' : 'Offline'}
                          </span>
                        </div>
                        
                        <div className="flex gap-2 mt-1 flex-wrap">
                          {user.distance && user.distance < 100000 && (
                            <Badge variant="outline" className="text-xs">
                              {user.distance.toFixed(1)}km away
                            </Badge>
                          )}
                          
                          {user.isLocalityMatch && (
                            <Badge variant="secondary" className="text-xs">
                              Locality match
                            </Badge>
                          )}
                          
                          {user.overloaded && (
                            <Badge variant="destructive" className="text-xs">
                              High workload
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <Button 
                        onClick={() => onAssign(user.id)} 
                        disabled={user.availability === 'offline'}
                      >
                        Assign
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            
            {sortedUsers.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No available collectors found</p>
              </div>
            )}
          </div>
        </ScrollArea>
        
        <div className="mt-6 flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }
};

export default SmartCollectorSelector;
