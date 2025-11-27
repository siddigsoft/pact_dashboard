import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SiteVisit } from '@/types';
import { MapPin } from 'lucide-react';
import { sudanStates } from '@/data/sudanStates';

interface SiteVisitsByStateProps {
  visits: SiteVisit[];
  onStateClick?: (state: string) => void;
}

const SiteVisitsByState: React.FC<SiteVisitsByStateProps> = ({ visits, onStateClick }) => {
  // Group visits by state
  const stateDistribution = useMemo(() => {
    const distribution: Record<string, number> = {};

    // Initialize all states from sudanStates
    sudanStates.forEach(state => {
      distribution[state.name] = 0;
    });

    // Count visits per state
    visits.forEach(visit => {
      const stateName = visit.state || 'Unknown';
      distribution[stateName] = (distribution[stateName] || 0) + 1;
    });

    // Convert to array and sort by count (descending), then by state name
    return Object.entries(distribution)
      .filter(([_, count]) => count > 0) // Only show states with visits
      .map(([stateName, count]) => ({ stateName, count }))
      .sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        return a.stateName.localeCompare(b.stateName);
      });
  }, [visits]);

  const totalVisits = visits.length;
  const handleStateClick = (stateName: string) => {
    if (onStateClick) {
      onStateClick(stateName);
    }
  };

  if (stateDistribution.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            No site visits found to display by state.
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate max count for percentage calculation
  const maxCount = Math.max(...stateDistribution.map(s => s.count));

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <CardTitle className="text-xl font-bold">Sites Distribution by State</CardTitle>
          </div>
          <Badge variant="secondary" className="text-sm">
            {totalVisits} {totalVisits === 1 ? 'Site' : 'Sites'} • {stateDistribution.length} {stateDistribution.length === 1 ? 'State' : 'States'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {stateDistribution.map(({ stateName, count }) => {
            const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
            const percentageOfTotal = totalVisits > 0 ? (count / totalVisits) * 100 : 0;
            
            return (
              <div
                key={stateName}
                className="group cursor-pointer hover:bg-muted/50 p-4 rounded-lg transition-all duration-200 border border-transparent hover:border-primary/20"
                onClick={() => handleStateClick(stateName)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <MapPin className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-semibold text-base text-foreground">{stateName}</div>
                      <div className="text-sm text-muted-foreground">
                        {percentageOfTotal.toFixed(1)}% of total sites
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-primary">{count}</div>
                    <div className="text-xs text-muted-foreground">
                      {count === 1 ? 'site' : 'sites'}
                    </div>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-500 group-hover:from-primary/90 group-hover:to-primary/60"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default SiteVisitsByState;

