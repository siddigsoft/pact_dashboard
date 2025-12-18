import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RotateCcw, Clock, User } from 'lucide-react';
import { format } from 'date-fns';
import { MMPFile } from '@/types';

interface RecallHistoryProps {
  mmpFile: MMPFile;
}

interface RecallLog {
  action: 'recall';
  by: string;
  byEmail?: string;
  date: string;
  previousFomIds?: string[];
  reason?: string;
}

export function RecallHistory({ mmpFile }: RecallHistoryProps) {
  const logs = (mmpFile.logs as any[]) || [];
  const recallLogs = logs.filter((log): log is RecallLog => log.action === 'recall');

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
        {recallLogs.map((log, index) => (
          <div 
            key={index} 
            className="flex flex-col gap-1 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800"
          >
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{log.by}</span>
              {log.byEmail && (
                <span className="text-muted-foreground text-xs">({log.byEmail})</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{format(new Date(log.date), 'MMM d, yyyy \'at\' h:mm a')}</span>
            </div>
            {log.previousFomIds && log.previousFomIds.length > 0 && (
              <div className="text-xs text-muted-foreground mt-1">
                Recalled from {log.previousFomIds.length} FOM(s)
              </div>
            )}
            {log.reason && (
              <div className="text-sm mt-1 italic">
                Reason: {log.reason}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default RecallHistory;
