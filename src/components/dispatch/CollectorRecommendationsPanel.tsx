import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Search, 
  MapPin, 
  Users, 
  AlertTriangle, 
  CheckCircle, 
  Circle, 
  ChevronDown,
  ChevronRight,
  Loader2,
  Sparkles,
  Navigation,
  Briefcase,
  Clock,
  Star,
  Info,
  XCircle
} from 'lucide-react';
import { 
  CollectorRecommendationService, 
  RecommendedCollector, 
  CoverageGapAlert,
  CollectorRecommendationResult 
} from '@/services/collectorRecommendation.service';
import { useQuery } from '@tanstack/react-query';

interface CollectorRecommendationsPanelProps {
  siteState: string;
  siteLocality: string;
  siteCoordinates?: { latitude: number; longitude: number } | null;
  onSelectCollector: (collector: RecommendedCollector) => void;
  selectedCollectorId?: string | null;
  isLoading?: boolean;
}

const TierIcon: React.FC<{ tier: string }> = ({ tier }) => {
  switch (tier) {
    case 'in-locality':
      return <MapPin className="h-4 w-4 text-green-600" />;
    case 'neighboring':
      return <Navigation className="h-4 w-4 text-blue-600" />;
    case 'state-wide':
      return <Users className="h-4 w-4 text-orange-600" />;
    default:
      return <Circle className="h-4 w-4" />;
  }
};

const TierBadge: React.FC<{ tier: string }> = ({ tier }) => {
  const variants: Record<string, { label: string; className: string }> = {
    'in-locality': { label: 'Same Locality', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    'neighboring': { label: 'Nearby', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    'state-wide': { label: 'State', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' }
  };
  
  const config = variants[tier] || { label: tier, className: '' };
  
  return (
    <Badge variant="outline" className={`text-xs ${config.className}`}>
      <TierIcon tier={tier} />
      <span className="ml-1">{config.label}</span>
    </Badge>
  );
};

const CollectorCard: React.FC<{
  collector: RecommendedCollector;
  isSelected: boolean;
  onSelect: () => void;
  isDispatching?: boolean;
}> = ({ collector, isSelected, onSelect, isDispatching }) => {
  const availabilityColor = collector.isOnline 
    ? 'bg-green-500' 
    : 'bg-gray-400';
  
  const initials = (collector.full_name || collector.username || 'DC')
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  
  return (
    <Card 
      className={`cursor-pointer transition-all ${
        isSelected 
          ? 'ring-2 ring-primary bg-primary/5' 
          : 'hover-elevate'
      }`}
      onClick={onSelect}
      data-testid={`card-collector-${collector.id}`}
    >
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="h-10 w-10 border">
              <AvatarFallback className="text-sm">{initials}</AvatarFallback>
            </Avatar>
            <span 
              className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background ${availabilityColor}`}
              title={collector.isOnline ? 'Online' : 'Offline'}
            />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium truncate">
                {collector.full_name || collector.username || 'Unknown'}
              </span>
              <TierBadge tier={collector.tier} />
            </div>
            
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
              {collector.distanceKm !== null && (
                <span className="flex items-center gap-1">
                  <Navigation className="h-3 w-3" />
                  {collector.distanceKm.toFixed(1)} km
                </span>
              )}
              
              {collector.localityName && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {collector.localityName}
                </span>
              )}
              
              <span className="flex items-center gap-1">
                <Briefcase className="h-3 w-3" />
                {collector.workloadCount} active
              </span>
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-1">
            {isSelected ? (
              <Badge variant="default" className="text-xs">
                <CheckCircle className="h-3 w-3 mr-1" />
                Selected
              </Badge>
            ) : (
              <Button 
                size="sm" 
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect();
                }}
                disabled={isDispatching}
                data-testid={`button-select-collector-${collector.id}`}
              >
                {isDispatching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Select'
                )}
              </Button>
            )}
            
            {collector.workloadCount >= 10 && (
              <Badge variant="destructive" className="text-xs">
                High Load
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const CoverageGapAlerts: React.FC<{ gaps: CoverageGapAlert[] }> = ({ gaps }) => {
  if (gaps.length === 0) return null;
  
  const criticalGaps = gaps.filter(g => g.severity === 'critical');
  const warningGaps = gaps.filter(g => g.severity === 'warning');
  const infoGaps = gaps.filter(g => g.severity === 'info');
  
  return (
    <div className="space-y-2 mb-4">
      {criticalGaps.map((gap, i) => (
        <Alert key={`critical-${i}`} variant="destructive" className="py-2">
          <XCircle className="h-4 w-4" />
          <AlertTitle className="text-sm font-medium">{gap.message}</AlertTitle>
          <AlertDescription className="text-xs">{gap.suggestedAction}</AlertDescription>
        </Alert>
      ))}
      
      {warningGaps.map((gap, i) => (
        <Alert key={`warning-${i}`} className="py-2 border-amber-500 bg-amber-50 dark:bg-amber-900/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-sm font-medium text-amber-800 dark:text-amber-400">{gap.message}</AlertTitle>
          <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">{gap.suggestedAction}</AlertDescription>
        </Alert>
      ))}
      
      {infoGaps.map((gap, i) => (
        <Alert key={`info-${i}`} className="py-2">
          <Info className="h-4 w-4" />
          <AlertTitle className="text-sm font-medium">{gap.message}</AlertTitle>
          <AlertDescription className="text-xs">{gap.suggestedAction}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
};

const TierSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  collectors: RecommendedCollector[];
  selectedCollectorId?: string | null;
  onSelectCollector: (collector: RecommendedCollector) => void;
  defaultOpen?: boolean;
  emptyMessage?: string;
}> = ({ title, icon, collectors, selectedCollectorId, onSelectCollector, defaultOpen = true, emptyMessage }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-md hover-elevate">
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {icon}
        <span className="font-medium">{title}</span>
        <Badge variant="secondary" className="ml-auto">{collectors.length}</Badge>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        <div className="space-y-2 mt-2 pl-6">
          {collectors.length > 0 ? (
            collectors.map(collector => (
              <CollectorCard
                key={collector.id}
                collector={collector}
                isSelected={selectedCollectorId === collector.id}
                onSelect={() => onSelectCollector(collector)}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              {emptyMessage || 'No collectors available'}
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export const CollectorRecommendationsPanel: React.FC<CollectorRecommendationsPanelProps> = ({
  siteState,
  siteLocality,
  siteCoordinates,
  onSelectCollector,
  selectedCollectorId,
  isLoading: externalLoading
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'recommended' | 'all'>('recommended');
  
  const { data: recommendations, isLoading } = useQuery({
    queryKey: ['collector-recommendations', siteState, siteLocality, siteCoordinates?.latitude, siteCoordinates?.longitude],
    queryFn: () => CollectorRecommendationService.getRecommendationsForSite(
      siteState,
      siteLocality,
      siteCoordinates
    ),
    enabled: !!siteState,
    staleTime: 30000
  });
  
  const filteredRecommendations = useMemo(() => {
    if (!recommendations) return null;
    
    if (!searchQuery.trim()) return recommendations;
    
    const query = searchQuery.toLowerCase();
    const filterCollector = (c: RecommendedCollector) =>
      (c.full_name || '').toLowerCase().includes(query) ||
      (c.username || '').toLowerCase().includes(query) ||
      (c.email || '').toLowerCase().includes(query) ||
      (c.localityName || '').toLowerCase().includes(query);
    
    return {
      ...recommendations,
      inLocality: recommendations.inLocality.filter(filterCollector),
      neighboring: recommendations.neighboring.filter(filterCollector),
      stateWide: recommendations.stateWide.filter(filterCollector),
      allRecommendations: recommendations.allRecommendations.filter(filterCollector)
    };
  }, [recommendations, searchQuery]);
  
  const bestRecommendation = useMemo(() => {
    if (!recommendations?.allRecommendations.length) return null;
    
    const online = recommendations.allRecommendations.filter(c => c.isOnline);
    if (online.length > 0) {
      return online.reduce((best, curr) => curr.priority > best.priority ? curr : best);
    }
    return recommendations.allRecommendations[0];
  }, [recommendations]);
  
  if (isLoading || externalLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Smart Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (!filteredRecommendations) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">Enter site location to see recommendations</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card data-testid="panel-collector-recommendations">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Smart Recommendations
          </CardTitle>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">
              {filteredRecommendations.totalAvailable} available
            </Badge>
            {bestRecommendation && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => onSelectCollector(bestRecommendation)}
                    data-testid="button-auto-assign-best"
                  >
                    <Star className="h-4 w-4 mr-1" />
                    Assign Best
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Auto-assign to {bestRecommendation.full_name || bestRecommendation.username}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
        
        <div className="text-sm text-muted-foreground">
          <MapPin className="h-4 w-4 inline mr-1" />
          {siteLocality}, {siteState}
        </div>
      </CardHeader>
      
      <CardContent>
        <CoverageGapAlerts gaps={filteredRecommendations.coverageGaps} />
        
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search collectors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-recommendations"
          />
        </div>
        
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="recommended" data-testid="tab-recommended">
              By Priority
            </TabsTrigger>
            <TabsTrigger value="all" data-testid="tab-all">
              All ({filteredRecommendations.allRecommendations.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="recommended" className="mt-0">
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                <TierSection
                  title="Same Locality"
                  icon={<MapPin className="h-4 w-4 text-green-600" />}
                  collectors={filteredRecommendations.inLocality}
                  selectedCollectorId={selectedCollectorId}
                  onSelectCollector={onSelectCollector}
                  defaultOpen={true}
                  emptyMessage={`No collectors assigned to ${siteLocality}`}
                />
                
                <TierSection
                  title="Nearby Localities"
                  icon={<Navigation className="h-4 w-4 text-blue-600" />}
                  collectors={filteredRecommendations.neighboring}
                  selectedCollectorId={selectedCollectorId}
                  onSelectCollector={onSelectCollector}
                  defaultOpen={filteredRecommendations.inLocality.length === 0}
                  emptyMessage="No collectors within 100km radius"
                />
                
                <TierSection
                  title="State-Wide"
                  icon={<Users className="h-4 w-4 text-orange-600" />}
                  collectors={filteredRecommendations.stateWide}
                  selectedCollectorId={selectedCollectorId}
                  onSelectCollector={onSelectCollector}
                  defaultOpen={
                    filteredRecommendations.inLocality.length === 0 && 
                    filteredRecommendations.neighboring.length === 0
                  }
                  emptyMessage={`No other collectors in ${siteState}`}
                />
              </div>
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="all" className="mt-0">
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                {filteredRecommendations.allRecommendations.length > 0 ? (
                  filteredRecommendations.allRecommendations.map(collector => (
                    <CollectorCard
                      key={collector.id}
                      collector={collector}
                      isSelected={selectedCollectorId === collector.id}
                      onSelect={() => onSelectCollector(collector)}
                    />
                  ))
                ) : (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No collectors available</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default CollectorRecommendationsPanel;
