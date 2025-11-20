import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileCheck, Edit } from 'lucide-react';
import { MMPFile } from '@/types';
import { getTotalSiteCount, getActualSiteCount } from '@/utils/mmpUtils';
import { format } from 'date-fns';

interface MMPOverviewCardProps {
  mmpFile: MMPFile;
  siteEntries: any[];
  onProceedToVerification?: () => void;
  onEditMMP?: () => void;
}

const MMPOverviewCard = ({ mmpFile, siteEntries = [], onProceedToVerification, onEditMMP }: MMPOverviewCardProps) => {
  const actualSiteCount = getActualSiteCount(mmpFile);
  const totalEntries = getTotalSiteCount(mmpFile);
  const processedEntries = mmpFile?.processedEntries || 0;

  // Use uploadedAt or approvedAt (these exist on MMPFile) - avoid createdAt/created_at
  const displayDate = mmpFile.approvedAt || mmpFile.uploadedAt || undefined;

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-transparent">
        <CardTitle>MMP Overview</CardTitle>
        <div className="text-sm text-muted-foreground">
          Total entries: {totalEntries} • Site entries: {actualSiteCount} • Processed: {processedEntries}
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-6">
        <div>
          <h3 className="text-lg font-medium mb-3">Site Distribution by State</h3>
          {siteEntries && siteEntries.length > 0 ? (
            (() => {
              const stateGroups: { [key: string]: { [key: string]: number } } = {};
              siteEntries.forEach(site => {
                const state = site.state || site.state_name || (site.location && site.location.state) || 'Unknown State';
                const locality = site.locality || site.locality_name || 'Unknown Locality';
                stateGroups[state] = stateGroups[state] || {};
                stateGroups[state][locality] = (stateGroups[state][locality] || 0) + 1;
              });

              return Object.keys(stateGroups).sort().map(state => {
                const localities = Object.keys(stateGroups[state]).sort();
                const totalStateSites = localities.reduce((s, l) => s + stateGroups[state][l], 0);
                return (
                  <div key={state} className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 mb-3">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-medium text-blue-700">{state}</h4>
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800">{totalStateSites} sites</Badge>
                    </div>
                    <div className="space-y-2">
                      {localities.map(locality => (
                        <div key={locality} className="flex justify-between text-sm p-2 bg-white rounded">
                          <span>{locality}</span>
                          <span className="text-muted-foreground">{stateGroups[state][locality]} sites</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              });
            })()
          ) : (
            <div className="bg-amber-50 p-4 rounded-lg text-center">No site entries available for distribution display</div>
          )}
        </div>

        <div className="pt-4 border-t mt-4 flex justify-between">
          <div className="text-sm text-muted-foreground">{displayDate ? `Last: ${format(new Date(displayDate), 'MMM d, yyyy')}` : 'No date available'}</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onEditMMP}>
              <Edit className="h-4 w-4 mr-2" />
              Edit MMP Data
            </Button>
            {/* Verification buttons removed for admin overview */}
            {/* {onProceedToVerification && (
              <Button size="sm" onClick={onProceedToVerification}>
                <FileCheck className="h-4 w-4 mr-2" />
                Proceed to Verification
              </Button>
            )} */}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MMPOverviewCard;
