import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowRight, Clock, CheckCircle2, AlertCircle, RotateCcw, Users, MapPin, Calendar, Search, ChevronDown, ChevronRight, Building2 } from 'lucide-react';
import { format } from 'date-fns';

interface StateBreakdown {
  state: string;
  totalSites: number;
  verifiedSites: number;
  pendingSites: number;
  dispatchedSites: number;
  status: 'pending' | 'in_progress' | 'verified' | 'completed';
  coordinators: { id: string; name: string }[];
  percentage: number;
}

function getStateBreakdown(mmp: any): StateBreakdown[] {
  const siteEntries = mmp.siteEntries || [];
  if (siteEntries.length === 0) return [];

  const stateMap = new Map<string, StateBreakdown>();

  siteEntries.forEach((entry: any) => {
    const stateName = entry.state || entry.stateName || 'Unknown State';
    
    if (!stateMap.has(stateName)) {
      stateMap.set(stateName, {
        state: stateName,
        totalSites: 0,
        verifiedSites: 0,
        pendingSites: 0,
        dispatchedSites: 0,
        status: 'pending',
        coordinators: [],
        percentage: 0,
      });
    }

    const stateData = stateMap.get(stateName)!;
    stateData.totalSites++;

    const entryStatus = (entry.status || '').toLowerCase();
    const verifiedStatuses = ['verified', 'approved', 'approved and costed', 'completed'];
    const dispatchedStatuses = ['dispatched', 'in_progress', 'accepted'];

    if (verifiedStatuses.includes(entryStatus)) {
      stateData.verifiedSites++;
    } else if (dispatchedStatuses.includes(entryStatus)) {
      stateData.dispatchedSites++;
    } else {
      stateData.pendingSites++;
    }

    // Track coordinators for this state
    const coordId = entry.additional_data?.assigned_to || entry.forwarded_to_user_id;
    const coordName = entry.additional_data?.assigned_to_name || entry.coordinator_name;
    if (coordId && !stateData.coordinators.find(c => c.id === coordId)) {
      stateData.coordinators.push({ id: coordId, name: coordName || coordId.substring(0, 8) });
    }
  });

  // Calculate status and percentage for each state
  stateMap.forEach((data) => {
    data.percentage = data.totalSites > 0 ? Math.round((data.verifiedSites / data.totalSites) * 100) : 0;
    
    if (data.verifiedSites === data.totalSites) {
      data.status = 'completed';
    } else if (data.verifiedSites > 0 || data.dispatchedSites > 0) {
      data.status = 'in_progress';
    } else if (data.dispatchedSites > 0) {
      data.status = 'verified';
    } else {
      data.status = 'pending';
    }
  });

  return Array.from(stateMap.values()).sort((a, b) => a.state.localeCompare(b.state));
}

function StateBreakdownSection({ breakdowns }: { breakdowns: StateBreakdown[] }) {
  const [isOpen, setIsOpen] = useState(false);

  if (breakdowns.length === 0) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Building2 className="h-3 w-3" />
        No state data available
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    verified: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  };

  const statusLabels: Record<string, string> = {
    pending: 'Pending',
    in_progress: 'In Progress',
    verified: 'Verified',
    completed: 'Completed',
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover-elevate rounded px-2 py-1 -mx-2 w-full" data-testid="trigger-state-breakdown">
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Building2 className="h-4 w-4" />
        <span>State Breakdown</span>
        <Badge variant="secondary" className="ml-auto">{breakdowns.length} states</Badge>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2">
        {breakdowns.map((stateData) => (
          <div 
            key={stateData.state} 
            className="border rounded-md p-3 bg-muted/30"
            data-testid={`state-breakdown-${stateData.state}`}
          >
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">{stateData.state}</span>
              </div>
              <Badge className={statusColors[stateData.status]}>
                {statusLabels[stateData.status]}
              </Badge>
            </div>
            
            <div className="flex items-center gap-2 mb-2">
              <Progress value={stateData.percentage} className="flex-1 h-1.5" />
              <span className="text-xs text-muted-foreground w-20 text-right">
                {stateData.verifiedSites}/{stateData.totalSites} verified
              </span>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="text-muted-foreground">
                Sites: {stateData.totalSites}
              </span>
              {stateData.pendingSites > 0 && (
                <Badge variant="outline" className="text-xs py-0">
                  {stateData.pendingSites} pending
                </Badge>
              )}
              {stateData.dispatchedSites > 0 && (
                <Badge variant="outline" className="text-xs py-0 border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300">
                  {stateData.dispatchedSites} dispatched
                </Badge>
              )}
              {stateData.verifiedSites > 0 && (
                <Badge variant="outline" className="text-xs py-0 border-green-300 text-green-700 dark:border-green-700 dark:text-green-300">
                  {stateData.verifiedSites} verified
                </Badge>
              )}
            </div>

            {stateData.coordinators.length > 0 && (
              <div className="mt-2 pt-2 border-t flex items-center gap-1 flex-wrap">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Coordinators:</span>
                {stateData.coordinators.map((coord, idx) => (
                  <Badge key={coord.id} variant="secondary" className="text-xs py-0">
                    {coord.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface WorkflowTrackerTabProps {
  mmpFiles: any[];
  coordinators?: { id: string; name: string }[];
}

type WorkflowStage = 'new' | 'forwarded_to_fom' | 'forwarded_to_coordinator' | 'forwarded_to_coordinators' | 'sites_verified' | 'completed' | 'recalled';

const STAGE_CONFIG: Record<WorkflowStage, { label: string; color: string; icon: typeof Clock }> = {
  new: { label: 'New', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200', icon: Clock },
  forwarded_to_fom: { label: 'Forwarded to FOM', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', icon: ArrowRight },
  forwarded_to_coordinator: { label: 'With Coordinators', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', icon: Users },
  forwarded_to_coordinators: { label: 'With Coordinators', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', icon: Users },
  sites_verified: { label: 'Sites Verified', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: CheckCircle2 },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200', icon: CheckCircle2 },
  recalled: { label: 'Recalled', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200', icon: RotateCcw },
};

const STAGE_ORDER: WorkflowStage[] = ['new', 'forwarded_to_fom', 'forwarded_to_coordinator', 'sites_verified', 'completed'];

function deriveWorkflowStage(mmp: any): WorkflowStage {
  const workflow = mmp.workflow || {};
  
  // Check recalled first - if recalledAt exists and workflow fields were cleared, it's recalled
  if (workflow.recalledAt && (!workflow.forwardedToCoordinatorIds?.length && !workflow.forwardedToFomIds?.length)) {
    return 'recalled';
  }
  
  if (workflow.currentStage) {
    const stageMap: Record<string, WorkflowStage> = {
      'new': 'new',
      'forwarded_fom': 'forwarded_to_fom',
      'forwarded_to_fom': 'forwarded_to_fom',
      'forwarded_coordinator': 'forwarded_to_coordinator',
      'forwarded_to_coordinator': 'forwarded_to_coordinator',
      'forwarded_coordinators': 'forwarded_to_coordinator',
      'forwarded_to_coordinators': 'forwarded_to_coordinator',
      'sites_verified': 'sites_verified',
      'verified': 'sites_verified',
      'completed': 'completed',
    };
    if (stageMap[workflow.currentStage]) {
      return stageMap[workflow.currentStage];
    }
  }
  
  // Check database status field as fallback
  if (mmp.status === 'forwarded_to_coordinator') {
    return 'forwarded_to_coordinator';
  }
  
  if (mmp.status === 'completed' || workflow.completedAt) {
    return 'completed';
  }
  
  const siteEntries = mmp.siteEntries || [];
  const verifiedStatuses = ['verified', 'approved', 'approved and costed', 'dispatched', 'completed'];
  const allVerified = siteEntries.length > 0 && siteEntries.every((s: any) => 
    verifiedStatuses.includes(s.status?.toLowerCase())
  );
  if (allVerified && siteEntries.length > 0) {
    return 'sites_verified';
  }
  
  if (workflow.forwardedToCoordinatorIds?.length > 0 || workflow.forwardedToCoordinators?.length > 0) {
    return 'forwarded_to_coordinators';
  }
  
  if (workflow.forwardedToFomIds?.length > 0 || workflow.forwardedAt) {
    return 'forwarded_to_fom';
  }
  
  return 'new';
}

function getVerificationProgress(mmp: any): { verified: number; total: number; percentage: number } {
  const siteEntries = mmp.siteEntries || [];
  const total = siteEntries.length;
  if (total === 0) return { verified: 0, total: 0, percentage: 0 };
  
  const verifiedStatuses = ['verified', 'approved', 'approved and costed', 'dispatched', 'completed'];
  const verified = siteEntries.filter((s: any) => 
    verifiedStatuses.includes(s.status?.toLowerCase())
  ).length;
  
  return { verified, total, percentage: Math.round((verified / total) * 100) };
}

function buildTimeline(mmp: any): { label: string; timestamp: Date | null; actor?: string }[] {
  const workflow = mmp.workflow || {};
  const timeline: { label: string; timestamp: Date | null; actor?: string }[] = [];
  
  if (mmp.created_at || mmp.createdAt) {
    timeline.push({
      label: 'Uploaded',
      timestamp: new Date(mmp.created_at || mmp.createdAt),
      actor: mmp.uploaded_by_name || mmp.uploadedByName
    });
  }
  
  if (workflow.forwardedAt) {
    timeline.push({
      label: 'Forwarded to FOM',
      timestamp: new Date(workflow.forwardedAt),
      actor: workflow.forwardedBy
    });
  }
  
  if (workflow.forwardedToCoordinatorsAt) {
    timeline.push({
      label: 'Forwarded to Coordinators',
      timestamp: new Date(workflow.forwardedToCoordinatorsAt),
    });
  }
  
  if (workflow.coordinatorVerifiedAt) {
    timeline.push({
      label: 'Coordinator Verified',
      timestamp: new Date(workflow.coordinatorVerifiedAt),
    });
  }
  
  if (workflow.recalledAt) {
    timeline.push({
      label: 'Recalled',
      timestamp: new Date(workflow.recalledAt),
      actor: workflow.recalledBy
    });
  }
  
  if (workflow.completedAt) {
    timeline.push({
      label: 'Completed',
      timestamp: new Date(workflow.completedAt),
    });
  }
  
  return timeline.filter(t => t.timestamp).sort((a, b) => 
    (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0)
  );
}

function StageIndicator({ currentStage }: { currentStage: WorkflowStage }) {
  const currentIndex = STAGE_ORDER.indexOf(currentStage === 'recalled' ? 'new' : currentStage);
  
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STAGE_ORDER.map((stage, index) => {
        const isActive = currentStage === stage || (currentStage === 'recalled' && stage === 'new');
        const isPast = index < currentIndex;
        const config = STAGE_CONFIG[stage];
        
        return (
          <div key={stage} className="flex items-center gap-1">
            <div
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                isActive ? config.color : isPast ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-muted text-muted-foreground'
              }`}
            >
              {config.label}
            </div>
            {index < STAGE_ORDER.length - 1 && (
              <ArrowRight className={`h-3 w-3 ${isPast ? 'text-green-500' : 'text-muted-foreground'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function TimelineDisplay({ timeline }: { timeline: ReturnType<typeof buildTimeline> }) {
  if (timeline.length === 0) return <span className="text-muted-foreground text-xs">No events</span>;
  
  return (
    <div className="flex flex-col gap-1">
      {timeline.map((event, index) => (
        <div key={index} className="flex items-center gap-2 text-xs">
          <Calendar className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          <span className="font-medium">{event.label}</span>
          <span className="text-muted-foreground">
            {event.timestamp ? format(event.timestamp, 'MMM d, yyyy HH:mm') : '—'}
          </span>
          {event.actor && (
            <span className="text-muted-foreground">by {event.actor}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function WorkflowTrackerTab({ mmpFiles, coordinators = [] }: WorkflowTrackerTabProps) {
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [hubFilter, setHubFilter] = useState<string>('all');
  const [coordinatorFilter, setCoordinatorFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const enrichedMMPs = useMemo(() => {
    return mmpFiles.map(mmp => ({
      ...mmp,
      derivedStage: deriveWorkflowStage(mmp),
      verificationProgress: getVerificationProgress(mmp),
      timeline: buildTimeline(mmp),
      stateBreakdown: getStateBreakdown(mmp),
    }));
  }, [mmpFiles]);

  const uniqueHubs = useMemo(() => {
    const hubs = new Set<string>();
    mmpFiles.forEach(mmp => {
      const hub = mmp.hub || mmp.hubOffice || mmp.workflow?.hub;
      if (hub) hubs.add(hub);
    });
    return Array.from(hubs).sort();
  }, [mmpFiles]);

  // Extract unique coordinators from all MMPs
  const uniqueCoordinators = useMemo(() => {
    const coordMap = new Map<string, string>();
    mmpFiles.forEach(mmp => {
      const workflow = mmp.workflow || {};
      const ids = workflow.forwardedToCoordinatorIds || [];
      const names = workflow.forwardedToCoordinatorNames || [];
      ids.forEach((id: string, index: number) => {
        if (id && !coordMap.has(id)) {
          coordMap.set(id, names[index] || id);
        }
      });
    });
    return Array.from(coordMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [mmpFiles]);

  const filteredMMPs = useMemo(() => {
    return enrichedMMPs.filter(mmp => {
      if (stageFilter !== 'all' && mmp.derivedStage !== stageFilter) return false;
      
      const mmpHub = mmp.hub || mmp.hubOffice || mmp.workflow?.hub;
      if (hubFilter !== 'all' && mmpHub !== hubFilter) return false;
      
      // Coordinator filter
      if (coordinatorFilter !== 'all') {
        const coordIds = mmp.workflow?.forwardedToCoordinatorIds || [];
        if (!coordIds.includes(coordinatorFilter)) return false;
      }
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const name = (mmp.name || mmp.file_name || '').toLowerCase();
        if (!name.includes(query)) return false;
      }
      
      return true;
    });
  }, [enrichedMMPs, stageFilter, hubFilter, coordinatorFilter, searchQuery]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: enrichedMMPs.length };
    enrichedMMPs.forEach(mmp => {
      counts[mmp.derivedStage] = (counts[mmp.derivedStage] || 0) + 1;
    });
    return counts;
  }, [enrichedMMPs]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search MMP name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-48"
            data-testid="input-tracker-search"
          />
        </div>
        
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-48" data-testid="select-stage-filter">
            <SelectValue placeholder="Filter by stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages ({stageCounts.all})</SelectItem>
            {Object.entries(STAGE_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                {config.label} ({stageCounts[key] || 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={hubFilter} onValueChange={setHubFilter}>
          <SelectTrigger className="w-48" data-testid="select-hub-filter">
            <SelectValue placeholder="Filter by hub" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Hubs</SelectItem>
            {uniqueHubs.map(hub => (
              <SelectItem key={hub} value={hub}>{hub}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={coordinatorFilter} onValueChange={setCoordinatorFilter}>
          <SelectTrigger className="w-48" data-testid="select-coordinator-filter">
            <SelectValue placeholder="Filter by coordinator" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Coordinators</SelectItem>
            {uniqueCoordinators.map(coord => (
              <SelectItem key={coord.id} value={coord.id}>{coord.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 flex-wrap">
        {Object.entries(STAGE_CONFIG).map(([key, config]) => {
          const Icon = config.icon;
          return (
            <Badge 
              key={key} 
              variant="outline" 
              className={`${config.color} cursor-pointer`}
              onClick={() => setStageFilter(stageFilter === key ? 'all' : key)}
              data-testid={`badge-stage-${key}`}
            >
              <Icon className="h-3 w-3 mr-1" />
              {config.label}: {stageCounts[key] || 0}
            </Badge>
          );
        })}
      </div>

      {filteredMMPs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No MMPs match the current filters
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredMMPs.map(mmp => {
            const stageConfig = STAGE_CONFIG[mmp.derivedStage];
            const StageIcon = stageConfig.icon;
            const coordNames = (mmp.workflow?.forwardedToCoordinatorNames || []).join(', ');
            
            return (
              <Card key={mmp.id} data-testid={`card-mmp-tracker-${mmp.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">
                        {mmp.name || mmp.file_name}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
                        {(mmp.hub || mmp.hubOffice) && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {mmp.hub || mmp.hubOffice}
                          </span>
                        )}
                        {coordNames && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {coordNames}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge className={stageConfig.color}>
                      <StageIcon className="h-3 w-3 mr-1" />
                      {stageConfig.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <StageIndicator currentStage={mmp.derivedStage} />
                  
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">Verification:</span>
                    <Progress 
                      value={mmp.verificationProgress.percentage} 
                      className="flex-1 h-2"
                    />
                    <span className="text-sm font-medium">
                      {mmp.verificationProgress.verified}/{mmp.verificationProgress.total}
                    </span>
                  </div>

                  {/* State Breakdown Section */}
                  <StateBreakdownSection breakdowns={mmp.stateBreakdown} />
                  
                  <div>
                    <span className="text-sm font-medium mb-1 block">Timeline</span>
                    <TimelineDisplay timeline={mmp.timeline} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
