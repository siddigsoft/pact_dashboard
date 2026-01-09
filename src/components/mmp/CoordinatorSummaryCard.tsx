import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Users, MapPin, ChevronDown, ChevronRight, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

interface CoordinatorInfo {
  id: string;
  name: string;
  sitesAssigned: number;
  sitesVerified: number;
  receivedAt?: string;
}

interface StateCoordinatorGroup {
  state: string;
  coordinators: CoordinatorInfo[];
  totalSites: number;
  verifiedSites: number;
}

interface CoordinatorSummaryCardProps {
  siteEntries: any[];
  mmpId?: string;
}

export default function CoordinatorSummaryCard({ siteEntries, mmpId }: CoordinatorSummaryCardProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [coordinatorNames, setCoordinatorNames] = useState<Record<string, string>>({});

  const coordinatorsByState = useMemo(() => {
    if (!siteEntries || siteEntries.length === 0) return [];

    const stateMap = new Map<string, StateCoordinatorGroup>();
    const coordIds = new Set<string>();

    siteEntries.forEach((entry: any) => {
      const stateName = entry.state || entry.stateName || 'Unknown State';
      
      if (!stateMap.has(stateName)) {
        stateMap.set(stateName, {
          state: stateName,
          coordinators: [],
          totalSites: 0,
          verifiedSites: 0,
        });
      }

      const stateData = stateMap.get(stateName)!;
      stateData.totalSites++;

      const coordId = entry.additional_data?.assigned_to || 
                     entry.additionalData?.assigned_to ||
                     entry.forwarded_to_user_id || 
                     entry.forwardedToUserId;
      const coordName = entry.additional_data?.assigned_to_name || 
                       entry.additionalData?.assigned_to_name ||
                       entry.coordinator_name || 
                       entry.coordinatorName;
      const receivedAt = entry.forwarded_at || entry.forwardedAt || entry.dispatched_at || entry.dispatchedAt;
      
      const entryStatus = (entry.status || '').toLowerCase();
      const isVerified = ['verified', 'approved', 'approved and costed', 'dispatched', 'completed'].includes(entryStatus);
      
      if (isVerified) {
        stateData.verifiedSites++;
      }

      if (coordId) {
        coordIds.add(coordId);
        const existingCoord = stateData.coordinators.find(c => c.id === coordId);
        
        if (existingCoord) {
          existingCoord.sitesAssigned++;
          if (isVerified) existingCoord.sitesVerified++;
        } else {
          stateData.coordinators.push({ 
            id: coordId, 
            name: coordName || coordinatorNames[coordId] || coordId.substring(0, 8),
            sitesAssigned: 1,
            sitesVerified: isVerified ? 1 : 0,
            receivedAt: receivedAt,
          });
        }
      }
    });

    return Array.from(stateMap.values())
      .filter(state => state.coordinators.length > 0)
      .sort((a, b) => a.state.localeCompare(b.state));
  }, [siteEntries, coordinatorNames]);

  useEffect(() => {
    const fetchCoordinatorNames = async () => {
      const coordIds = new Set<string>();
      siteEntries.forEach((entry: any) => {
        const coordId = entry.additional_data?.assigned_to || 
                       entry.additionalData?.assigned_to ||
                       entry.forwarded_to_user_id || 
                       entry.forwardedToUserId;
        if (coordId && !entry.additional_data?.assigned_to_name && !entry.coordinator_name) {
          coordIds.add(coordId);
        }
      });

      if (coordIds.size === 0) return;

      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', Array.from(coordIds));

      if (data) {
        const names: Record<string, string> = {};
        data.forEach((p: any) => {
          names[p.id] = p.full_name || p.id.substring(0, 8);
        });
        setCoordinatorNames(names);
      }
    };

    if (siteEntries.length > 0) {
      fetchCoordinatorNames();
    }
  }, [siteEntries]);

  const totalCoordinators = useMemo(() => {
    const uniqueCoords = new Set<string>();
    coordinatorsByState.forEach(state => {
      state.coordinators.forEach(c => uniqueCoords.add(c.id));
    });
    return uniqueCoords.size;
  }, [coordinatorsByState]);

  const totalAssigned = useMemo(() => {
    return coordinatorsByState.reduce((sum, state) => 
      sum + state.coordinators.reduce((s, c) => s + c.sitesAssigned, 0), 0);
  }, [coordinatorsByState]);

  const totalVerified = useMemo(() => {
    return coordinatorsByState.reduce((sum, state) => 
      sum + state.coordinators.reduce((s, c) => s + c.sitesVerified, 0), 0);
  }, [coordinatorsByState]);

  if (coordinatorsByState.length === 0) {
    return (
      <Card className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/30 dark:to-slate-800/20 border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            Coordinator Assignments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            No coordinators assigned yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/20 border-purple-200 dark:border-purple-800">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            Coordinator Assignments
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900/50">
              {totalCoordinators} coordinator{totalCoordinators !== 1 ? 's' : ''}
            </Badge>
            <Badge variant="outline" className="border-purple-300 dark:border-purple-700">
              {coordinatorsByState.length} state{coordinatorsByState.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-2 text-sm">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-muted-foreground">{totalAssigned} assigned</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-muted-foreground">{totalVerified} verified</span>
          </div>
          <Progress 
            value={totalAssigned > 0 ? (totalVerified / totalAssigned) * 100 : 0} 
            className="flex-1 h-2 max-w-[100px]" 
          />
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger 
            className="flex items-center gap-2 text-sm font-medium hover-elevate rounded px-2 py-1 -mx-2 w-full"
            data-testid="trigger-coordinator-summary"
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span>View by State</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-3">
            {coordinatorsByState.map((stateData) => (
              <div 
                key={stateData.state} 
                className="border border-purple-200 dark:border-purple-800 rounded-lg p-3 bg-background/80"
                data-testid={`coordinator-state-${stateData.state}`}
              >
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    <span className="font-medium text-sm">{stateData.state}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {stateData.verifiedSites}/{stateData.totalSites} verified
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {stateData.coordinators.length} coordinator{stateData.coordinators.length !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                </div>
                
                <Progress 
                  value={stateData.totalSites > 0 ? (stateData.verifiedSites / stateData.totalSites) * 100 : 0} 
                  className="h-1.5 mb-3" 
                />

                <div className="space-y-2">
                  {stateData.coordinators.map((coord) => (
                    <div 
                      key={coord.id}
                      className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50 text-sm"
                      data-testid={`coordinator-${coord.id}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-purple-200 dark:bg-purple-800 flex items-center justify-center flex-shrink-0">
                          <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            {coordinatorNames[coord.id] || coord.name}
                          </p>
                          {coord.receivedAt && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {(() => {
                                try {
                                  const date = new Date(coord.receivedAt);
                                  if (!isNaN(date.getTime())) {
                                    return format(date, 'MMM d, yyyy');
                                  }
                                } catch {
                                  return null;
                                }
                                return 'Date unavailable';
                              })()}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-right">
                          <div className="flex items-center gap-1">
                            {coord.sitesVerified === coord.sitesAssigned && coord.sitesAssigned > 0 ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : null}
                            <span className="text-sm font-medium">
                              {coord.sitesVerified}/{coord.sitesAssigned}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">sites verified</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
