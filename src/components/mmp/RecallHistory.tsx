import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RotateCcw, Clock, User, Shield, DollarSign, MapPin, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { MMPFile } from '@/types';
import {
  RecallTier,
  RecallScopeType,
  RECALL_TIER_LABELS,
  RECALL_SCOPE_LABELS
} from '@/types/recall';

interface RecallHistoryProps {
  mmpFile: MMPFile;
}

interface RecallLog {
  action: 'recall' | 'recall_initiated' | 'recall_approved' | 'recall_rejected' | 'recall_completed';
  by: string;
  byEmail?: string;
  date: string;
  previousFomIds?: string[];
  reason?: string;
  tier?: RecallTier;
  scopeType?: RecallScopeType;
  affectedSites?: number;
  financialAmount?: number;
  isForceRecall?: boolean;
  recallEventId?: string;
}

const TIER_COLORS: Record<RecallTier, string> = {
  admin_to_fom: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  fom_to_coordinator: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  coordinator_to_collector: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  super_admin_approved: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  recall: { label: 'Recall', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
  recall_initiated: { label: 'Initiated', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  recall_approved: { label: 'Approved', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  recall_rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  recall_completed: { label: 'Completed', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' }
};

export function RecallHistory({ mmpFile }: RecallHistoryProps) {
  const workflow = (mmpFile.workflow as any) || {};
  const recallHistory = (workflow.recallHistory as any[]) || [];
  const recallLogs = recallHistory.filter((log): log is RecallLog => 
    log.action === 'recall' || 
    log.action?.startsWith('recall_')
  );

  if (recallLogs.length === 0) {
    return null;
  }

  return (
    <Card className="border-l-4 border-l-orange-400">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <RotateCcw className="h-4 w-4" />
          Recall History
          <Badge variant="secondary" className="ml-auto">
            {recallLogs.length} recall{recallLogs.length > 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {recallLogs.map((log, index) => {
          const actionConfig = ACTION_LABELS[log.action] || ACTION_LABELS.recall;
          
          return (
            <div 
              key={index} 
              className="flex flex-col gap-2 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{log.by}</span>
                  {log.byEmail && (
                    <span className="text-muted-foreground text-xs">({log.byEmail})</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={actionConfig.color}>
                    {actionConfig.label}
                  </Badge>
                  {log.isForceRecall && (
                    <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                      <Shield className="h-3 w-3 mr-1" />
                      Force
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{format(new Date(log.date), 'MMM d, yyyy \'at\' h:mm a')}</span>
              </div>

              {log.tier && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={TIER_COLORS[log.tier]}>
                    {RECALL_TIER_LABELS[log.tier]?.en || log.tier}
                  </Badge>
                  {log.scopeType && log.scopeType !== 'full_mmp' && (
                    <Badge variant="outline">
                      <MapPin className="h-3 w-3 mr-1" />
                      {RECALL_SCOPE_LABELS[log.scopeType]?.en || log.scopeType}
                    </Badge>
                  )}
                </div>
              )}

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                {log.previousFomIds && log.previousFomIds.length > 0 && (
                  <span>Recalled from {log.previousFomIds.length} FOM(s)</span>
                )}
                {log.affectedSites !== undefined && (
                  <span>{log.affectedSites} site(s) affected</span>
                )}
                {log.financialAmount !== undefined && log.financialAmount > 0 && (
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    {log.financialAmount.toLocaleString()} SDG recovery
                  </span>
                )}
              </div>

              {log.reason && (
                <div className="flex items-start gap-2 text-sm mt-1 p-2 bg-white/50 dark:bg-black/20 rounded">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <span className="italic">{log.reason}</span>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default RecallHistory;
