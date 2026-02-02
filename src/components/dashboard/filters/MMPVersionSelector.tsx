import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { GitBranch, GitMerge, Eye, ChevronDown, ChevronRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { MMPFile, MMPClassification, MMPVersionStatus } from '@/types';

interface MMPVersionSelectorProps {
  mmpFiles: MMPFile[];
  selectedMmpId?: string;
  onSelectMmp: (mmpId: string) => void;
  onCompareMmps?: (mmpIds: string[]) => void;
  showCompareMode?: boolean;
  className?: string;
}

interface GroupedMMP {
  periodKey: string;
  periodLabel: string;
  mmps: MMPFile[];
  originalMmp?: MMPFile;
  revisions: MMPFile[];
  additionals: MMPFile[];
}

const classificationColors: Record<MMPClassification, string> = {
  original: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  revised: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  additional: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  supplementary: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

const versionStatusColors: Record<MMPVersionStatus, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  superseded: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  draft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  archived: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export const MMPVersionSelector: React.FC<MMPVersionSelectorProps> = ({
  mmpFiles,
  selectedMmpId,
  onSelectMmp,
  onCompareMmps,
  showCompareMode = false,
  className,
}) => {
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set());
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [isCompareMode, setIsCompareMode] = useState(false);

  const groupedMmps = useMemo(() => {
    const groups: Record<string, GroupedMMP> = {};

    mmpFiles.forEach((mmp) => {
      const periodKey = mmp.periodKey || 
        (mmp.year && mmp.month ? `${mmp.year}-${mmp.month}` : 'unknown');
      
      if (!groups[periodKey]) {
        const date = mmp.year && mmp.month 
          ? new Date(mmp.year, parseInt(mmp.month) - 1, 1)
          : new Date();
        
        groups[periodKey] = {
          periodKey,
          periodLabel: format(date, 'MMMM yyyy'),
          mmps: [],
          revisions: [],
          additionals: [],
        };
      }

      groups[periodKey].mmps.push(mmp);

      const classification = mmp.classification || 'original';
      if (classification === 'original') {
        groups[periodKey].originalMmp = mmp;
      } else if (classification === 'revised') {
        groups[periodKey].revisions.push(mmp);
      } else {
        groups[periodKey].additionals.push(mmp);
      }
    });

    return Object.values(groups).sort((a, b) => 
      b.periodKey.localeCompare(a.periodKey)
    );
  }, [mmpFiles]);

  const togglePeriod = (periodKey: string) => {
    const newExpanded = new Set(expandedPeriods);
    if (newExpanded.has(periodKey)) {
      newExpanded.delete(periodKey);
    } else {
      newExpanded.add(periodKey);
    }
    setExpandedPeriods(newExpanded);
  };

  const toggleCompareSelection = (mmpId: string) => {
    const newSelection = compareSelection.includes(mmpId)
      ? compareSelection.filter(id => id !== mmpId)
      : [...compareSelection, mmpId].slice(-2);
    setCompareSelection(newSelection);
  };

  const handleCompare = () => {
    if (compareSelection.length === 2 && onCompareMmps) {
      onCompareMmps(compareSelection);
    }
  };

  const getVersionDisplay = (mmp: MMPFile) => {
    if (mmp.version) {
      return `v${mmp.version.major}.${mmp.version.minor}`;
    }
    return 'v1.0';
  };

  const renderMmpItem = (mmp: MMPFile, isNested = false) => {
    const isSelected = mmp.id === selectedMmpId;
    const isInCompare = compareSelection.includes(mmp.id);
    const classification = mmp.classification || 'original';
    const versionStatus = mmp.versionStatus || 'active';

    return (
      <div
        key={mmp.id}
        className={cn(
          "flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors",
          isNested && "ml-4 border-l-2 border-muted pl-3",
          isSelected && "bg-primary/10",
          !isSelected && "hover:bg-muted/50"
        )}
        onClick={() => isCompareMode ? toggleCompareSelection(mmp.id) : onSelectMmp(mmp.id)}
        data-testid={`mmp-version-item-${mmp.id}`}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isCompareMode && (
            <div className={cn(
              "w-4 h-4 rounded border flex items-center justify-center",
              isInCompare ? "bg-primary border-primary" : "border-muted-foreground"
            )}>
              {isInCompare && <Check className="h-3 w-3 text-primary-foreground" />}
            </div>
          )}
          
          {classification === 'revised' && (
            <GitBranch className="h-4 w-4 text-amber-500 flex-shrink-0" />
          )}
          {classification === 'additional' && (
            <GitMerge className="h-4 w-4 text-green-500 flex-shrink-0" />
          )}
          
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium truncate">{mmp.name}</span>
            <span className="text-xs text-muted-foreground">
              {getVersionDisplay(mmp)}
              {mmp.uploadedAt && ` - ${format(new Date(mmp.uploadedAt), 'MMM d, yyyy')}`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Badge 
            variant="outline" 
            className={cn("text-xs", classificationColors[classification])}
          >
            {classification}
          </Badge>
          <Badge 
            variant="outline" 
            className={cn("text-xs", versionStatusColors[versionStatus])}
          >
            {versionStatus}
          </Badge>
        </div>
      </div>
    );
  };

  return (
    <Card className={className} data-testid="mmp-version-selector">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            MMP Versions
          </CardTitle>
          {showCompareMode && (
            <div className="flex items-center gap-2">
              {isCompareMode && compareSelection.length === 2 && (
                <Button size="sm" onClick={handleCompare} data-testid="compare-button">
                  <Eye className="h-4 w-4 mr-1" />
                  Compare
                </Button>
              )}
              <Button
                size="sm"
                variant={isCompareMode ? "default" : "outline"}
                onClick={() => {
                  setIsCompareMode(!isCompareMode);
                  setCompareSelection([]);
                }}
                data-testid="toggle-compare-mode"
              >
                {isCompareMode ? 'Cancel' : 'Compare'}
              </Button>
            </div>
          )}
        </div>
        {isCompareMode && (
          <p className="text-sm text-muted-foreground">
            Select 2 MMPs to compare ({compareSelection.length}/2)
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          <div className="space-y-2">
            {groupedMmps.map((group) => (
              <Collapsible
                key={group.periodKey}
                open={expandedPeriods.has(group.periodKey)}
                onOpenChange={() => togglePeriod(group.periodKey)}
              >
                <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-muted/50 rounded-md">
                  <div className="flex items-center gap-2">
                    {expandedPeriods.has(group.periodKey) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="font-medium">{group.periodLabel}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="secondary" className="text-xs">
                      {group.mmps.length} MMP{group.mmps.length !== 1 ? 's' : ''}
                    </Badge>
                    {group.revisions.length > 0 && (
                      <Badge variant="outline" className="text-xs bg-amber-50">
                        {group.revisions.length} revision{group.revisions.length !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1 mt-1">
                  {group.originalMmp && renderMmpItem(group.originalMmp)}
                  
                  {group.revisions.length > 0 && (
                    <div className="space-y-1">
                      {group.revisions
                        .sort((a, b) => {
                          const vA = (a.version?.major || 1) * 100 + (a.version?.minor || 0);
                          const vB = (b.version?.major || 1) * 100 + (b.version?.minor || 0);
                          return vB - vA;
                        })
                        .map((mmp) => renderMmpItem(mmp, true))}
                    </div>
                  )}
                  
                  {group.additionals.length > 0 && (
                    <div className="space-y-1 mt-2 pt-2 border-t">
                      <span className="text-xs text-muted-foreground ml-2">
                        Additional MMPs
                      </span>
                      {group.additionals.map((mmp) => renderMmpItem(mmp))}
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            ))}

            {groupedMmps.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No MMPs found
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default MMPVersionSelector;
