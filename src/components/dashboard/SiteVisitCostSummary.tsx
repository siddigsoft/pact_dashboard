import React from 'react';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { SiteVisit } from '@/types/siteVisit';

interface SiteVisitCostSummaryProps {
  siteVisits?: SiteVisit[];
}

export const SiteVisitCostSummary: React.FC<SiteVisitCostSummaryProps> = ({ siteVisits: propSiteVisits }) => {
  const { siteVisits: contextSiteVisits } = useSiteVisitContext();
  const siteVisits = propSiteVisits || contextSiteVisits;
  // Sum up costs
  const totalCost = (siteVisits || []).reduce((sum, v) => sum + (v.fees?.total || 0), 0);
  const completedCost = (siteVisits || []).filter(v => v.status === 'completed').reduce((sum, v) => sum + (v.fees?.total || 0), 0);
  const ongoingCost = (siteVisits || []).filter(v => ['assigned', 'inProgress'].includes(v.status)).reduce((sum, v) => sum + (v.fees?.total || 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Site Visit Costs</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-8">
          <div>
            <div className="font-bold text-lg">SDG {totalCost.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Total Cost</div>
          </div>
          <div>
            <div className="font-bold text-green-700">SDG {completedCost.toLocaleString()}</div>
            <div className="text-xs text-green-700">Completed</div>
          </div>
          <div>
            <div className="font-bold text-blue-700">SDG {ongoingCost.toLocaleString()}</div>
            <div className="text-xs text-blue-700">Ongoing</div>
          </div>
        </div>
        {/* For real charts, integrate a chart library here */}
      </CardContent>
    </Card>
  );
};
