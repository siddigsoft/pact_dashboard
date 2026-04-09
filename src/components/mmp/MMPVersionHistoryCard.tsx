import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { 
  History, 
  GitBranch, 
  GitMerge, 
  Check, 
  X, 
  Clock, 
  FileText,
  ArrowRight,
  User,
  PlusCircle,
  MinusCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { MMPFile, MMPModificationEntry } from '@/types';

interface MMPVersionHistoryCardProps {
  mmp: MMPFile;
  allMmps: MMPFile[];
  onSelectVersion?: (mmpId: string) => void;
  className?: string;
}

export const MMPVersionHistoryCard: React.FC<MMPVersionHistoryCardProps> = ({
  mmp,
  allMmps,
  onSelectVersion,
  className,
}) => {
  const relatedMmps = useMemo(() => {
    const related: MMPFile[] = [];
    
    if (mmp.relationship?.parentMmpId) {
      const parent = allMmps.find(m => m.id === mmp.relationship?.parentMmpId);
      if (parent) related.push(parent);
    }
    
    if (mmp.relationship?.childMmpIds) {
      mmp.relationship.childMmpIds.forEach(childId => {
        const child = allMmps.find(m => m.id === childId);
        if (child) related.push(child);
      });
    }
    
    if (mmp.relationship?.supersedes) {
      const superseded = allMmps.find(m => m.id === mmp.relationship?.supersedes);
      if (superseded) related.push(superseded);
    }
    
    if (mmp.relationship?.supersededBy) {
      const superseding = allMmps.find(m => m.id === mmp.relationship?.supersededBy);
      if (superseding) related.push(superseding);
    }
    
    return related;
  }, [mmp, allMmps]);

  const getSiteIds = (m: MMPFile): Set<string> => {
    const entries = m.siteEntries || (m as any).sites || (m as any).siteData || [];
    const ids = new Set<string>();
    entries.forEach((s: any) => {
      // Use stable site identifiers (not row PKs which change per upload)
      const id = s.site_id || s.siteId || s.siteCode || s.site_code || s.siteName || s.site_name;
      if (id) ids.add(String(id));
    });
    return ids;
  };

  const versionDiff = useMemo(() => {
    const parentId = mmp.relationship?.parentMmpId;
    if (!parentId) return null;
    const parent = allMmps.find(m => m.id === parentId);
    if (!parent) return null;
    const currentIds = getSiteIds(mmp);
    const parentIds = getSiteIds(parent);
    if (currentIds.size === 0 && parentIds.size === 0) return null;
    const added = [...currentIds].filter(id => !parentIds.has(id)).length;
    const removed = [...parentIds].filter(id => !currentIds.has(id)).length;
    return { added, removed, currentTotal: currentIds.size, parentTotal: parentIds.size };
  }, [mmp, allMmps]);

  const modificationHistory = mmp.modificationHistory || [];

  const getVersionDisplay = (m: MMPFile) => {
    if (m.version) {
      return `v${m.version.major}.${m.version.minor}`;
    }
    return 'v1.0';
  };

  const getClassificationIcon = (classification?: string) => {
    switch (classification) {
      case 'revised':
        return <GitBranch className="h-4 w-4 text-amber-500" />;
      case 'additional':
        return <GitMerge className="h-4 w-4 text-green-500" />;
      case 'supplementary':
        return <FileText className="h-4 w-4 text-purple-500" />;
      default:
        return <FileText className="h-4 w-4 text-blue-500" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <Check className="h-4 w-4 text-green-500" />;
      case 'rejected':
        return <X className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-amber-500" />;
    }
  };

  return (
    <Card className={className} data-testid="mmp-version-history-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History
          </CardTitle>
          <Badge variant="secondary">{getVersionDisplay(mmp)}</Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="bg-muted/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            {getClassificationIcon(mmp.classification)}
            <span className="font-medium">{mmp.name}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Classification: </span>
              <Badge variant="outline" className="text-xs">
                {mmp.classification || 'original'}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Status: </span>
              <Badge variant="outline" className="text-xs">
                {mmp.versionStatus || 'active'}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Created: </span>
              {mmp.uploadedAt 
                ? format(new Date(mmp.uploadedAt), 'MMM d, yyyy')
                : 'N/A'}
            </div>
            <div>
              <span className="text-muted-foreground">Modified: </span>
              {mmp.modifiedAt 
                ? format(new Date(mmp.modifiedAt), 'MMM d, yyyy')
                : 'Never'}
            </div>
          </div>
          {versionDiff && (
            <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-3 flex-wrap" data-testid="version-diff-summary">
              <span className="text-xs font-medium text-muted-foreground">vs. previous version:</span>
              {versionDiff.added > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400">
                  <PlusCircle className="h-3.5 w-3.5" />
                  {versionDiff.added} site{versionDiff.added !== 1 ? 's' : ''} added
                </span>
              )}
              {versionDiff.removed > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400">
                  <MinusCircle className="h-3.5 w-3.5" />
                  {versionDiff.removed} site{versionDiff.removed !== 1 ? 's' : ''} removed
                </span>
              )}
              {versionDiff.added === 0 && versionDiff.removed === 0 && (
                <span className="text-xs text-muted-foreground">No site changes detected</span>
              )}
            </div>
          )}
        </div>

        {relatedMmps.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Related MMPs</h4>
            <div className="space-y-2">
              {relatedMmps.map((related) => (
                <div
                  key={related.id}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-md border",
                    "hover:bg-muted/50 cursor-pointer"
                  )}
                  onClick={() => onSelectVersion?.(related.id)}
                >
                  <div className="flex items-center gap-2">
                    {getClassificationIcon(related.classification)}
                    <div>
                      <div className="text-sm font-medium">{related.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {getVersionDisplay(related)}
                        {mmp.relationship?.parentMmpId === related.id && (
                          <span className="ml-1 text-blue-600">(Parent)</span>
                        )}
                        {mmp.relationship?.supersedes === related.id && (
                          <span className="ml-1 text-amber-600">(Supersedes)</span>
                        )}
                        {mmp.relationship?.supersededBy === related.id && (
                          <span className="ml-1 text-gray-600">(Superseded by)</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(related.status)}
                    <Badge 
                      variant={related.versionStatus === 'active' ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {related.versionStatus || 'active'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {modificationHistory.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Modification Log</h4>
            <ScrollArea className="h-[200px]">
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-muted" />
                
                <div className="space-y-4">
                  {modificationHistory
                    .sort((a, b) => 
                      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                    )
                    .map((entry, index) => (
                      <div 
                        key={index}
                        className="relative pl-10"
                      >
                        <div className="absolute left-2 w-5 h-5 rounded-full bg-background border-2 border-muted flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-primary" />
                        </div>
                        
                        <div className="bg-muted/30 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {entry.previousVersion} <ArrowRight className="h-3 w-3 inline mx-1" /> {entry.newVersion}
                              </Badge>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(entry.timestamp), 'MMM d, yyyy HH:mm')}
                            </span>
                          </div>
                          
                          <p className="text-sm">{entry.changes}</p>
                          
                          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            <span>{entry.modifiedBy}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </ScrollArea>
          </div>
        )}

        {modificationHistory.length === 0 && relatedMmps.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No version history available</p>
            <p className="text-xs mt-1">
              History will be recorded when this MMP is modified
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MMPVersionHistoryCard;
