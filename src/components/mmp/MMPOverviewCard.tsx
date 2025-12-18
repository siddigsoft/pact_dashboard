import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileCheck, Edit, RotateCcw } from 'lucide-react';
import { MMPFile } from '@/types';
import { getTotalSiteCount, getActualSiteCount } from '@/utils/mmpUtils';
import { format } from 'date-fns';
import { useMMP } from '@/context/mmp/MMPContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { getRecallTierForRole } from '@/utils/recallUtils';
import { RecallDialog } from './RecallDialog';

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

  const displayDate = mmpFile.approvedAt || mmpFile.uploadedAt || undefined;

  const [isForwarded, setIsForwarded] = React.useState(false);
  const [recallDialogOpen, setRecallDialogOpen] = React.useState(false);
  const { refreshMMPFiles } = useMMP();
  const { currentUser } = useAuthorization();

  const userRole = currentUser?.role || '';
  const canRecall = getRecallTierForRole(userRole) !== null;

  React.useEffect(() => {
    const wf = (mmpFile.workflow as any) || {};
    const forwarded = Array.isArray(wf.forwardedToFomIds) && wf.forwardedToFomIds.length > 0;
    const verified = mmpFile.status === 'approved';
    setIsForwarded(forwarded && !verified);
  }, [mmpFile.workflow, mmpFile.status]);

  const handleRecallComplete = async () => {
    await refreshMMPFiles();
    setIsForwarded(false);
  };

  return (
    <div className="relative">
      <Card className="border-l-4 border-l-blue-500">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-transparent dark:from-blue-900/20 dark:to-transparent">
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
                    <div key={state} className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-lg p-4 mb-3">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="font-medium text-blue-700 dark:text-blue-400">{state}</h4>
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">{totalStateSites} sites</Badge>
                      </div>
                      <div className="space-y-2">
                        {localities.map(locality => (
                          <div key={locality} className="flex justify-between text-sm p-2 bg-white dark:bg-gray-800 rounded">
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
              <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg text-center">No site entries available for distribution display</div>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex justify-between flex-wrap gap-2">
          <div className="text-sm text-muted-foreground">{displayDate ? `Last: ${format(new Date(displayDate), 'MMM d, yyyy')}` : 'No date available'}</div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={onEditMMP}>
              <Edit className="h-4 w-4 mr-2" />
              Edit MMP Data
            </Button>
            {(isForwarded || canRecall) && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setRecallDialogOpen(true)}
                data-testid="button-recall-mmp-overview"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Recall MMP
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>

      <RecallDialog
        open={recallDialogOpen}
        onOpenChange={setRecallDialogOpen}
        mmpFile={mmpFile}
        onRecallComplete={handleRecallComplete}
      />
    </div>
  );
};

export default MMPOverviewCard;
