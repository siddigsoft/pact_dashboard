import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { 
  History, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Loader2,
  RefreshCw,
  User,
  MapPin
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface ConfirmationEvent {
  id: string;
  siteId: string;
  siteName: string;
  eventType: 'confirmed' | 'auto_released';
  timestamp: string;
  userId?: string;
  userName?: string;
}

interface SiteVisitData {
  confirmation_status?: 'pending' | 'confirmed' | 'auto_released';
  acknowledged_at?: string;
  acknowledged_by?: string;
  autorelease_executed_at?: string;
  former_assignee?: string;
  [key: string]: unknown;
}

interface ConfirmationHistoryLogProps {
  siteId?: string;
  limit?: number;
  showTitle?: boolean;
}

export function ConfirmationHistoryLog({ 
  siteId, 
  limit = 50,
  showTitle = true 
}: ConfirmationHistoryLogProps) {
  const [events, setEvents] = useState<ConfirmationEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchHistory = async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);

    try {
      let query = supabase
        .from('site_visits')
        .select('id, site_name, visit_data')
        .not('visit_data', 'is', null)
        .limit(limit * 2);

      if (siteId) {
        query = query.eq('id', siteId);
      }

      const { data: siteVisits, error } = await query;

      if (error) throw error;

      const historyEvents: ConfirmationEvent[] = [];
      const userIds = new Set<string>();

      for (const visit of siteVisits || []) {
        const visitData = visit.visit_data as SiteVisitData | null;
        if (!visitData?.confirmation_status) continue;
        if (visitData.confirmation_status === 'pending') continue;

        const timestamp = visitData.confirmation_status === 'confirmed'
          ? visitData.acknowledged_at || ''
          : visitData.autorelease_executed_at || '';
        
        const event: ConfirmationEvent = {
          id: `${visit.id}-${visitData.confirmation_status}-${timestamp}`,
          siteId: visit.id,
          siteName: visit.site_name || 'Unknown Site',
          eventType: visitData.confirmation_status as 'confirmed' | 'auto_released',
          timestamp,
          userId: visitData.confirmation_status === 'confirmed'
            ? visitData.acknowledged_by
            : visitData.former_assignee,
        };

        if (event.timestamp) {
          historyEvents.push(event);
          if (event.userId) userIds.add(event.userId);
        }
      }

      if (userIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', Array.from(userIds));

        const profileMap = new Map(
          (profiles || []).map(p => [p.id, p.full_name || 'Unknown'])
        );

        for (const event of historyEvents) {
          if (event.userId) {
            event.userName = profileMap.get(event.userId) || 'Unknown User';
          }
        }
      }

      historyEvents.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setEvents(historyEvents.slice(0, limit));
    } catch (error) {
      console.error('Error fetching confirmation history:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [siteId, limit]);

  if (isLoading) {
    return (
      <Card data-testid="card-confirmation-history-loading">
        {showTitle && (
          <CardHeader className="py-3 px-4 pb-2">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Confirmation History</CardTitle>
            </div>
          </CardHeader>
        )}
        <CardContent className="py-4 px-4">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card data-testid="card-confirmation-history-empty">
        {showTitle && (
          <CardHeader className="py-3 px-4 pb-2">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Confirmation History</CardTitle>
            </div>
          </CardHeader>
        )}
        <CardContent className="py-3 px-4">
          <p className="text-sm text-muted-foreground">No confirmation history available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-confirmation-history">
      {showTitle && (
        <CardHeader className="py-3 px-4 pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              <CardTitle className="text-sm font-medium">Confirmation History</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{events.length} Events</Badge>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => fetchHistory(true)}
                disabled={isRefreshing}
                data-testid="button-refresh-history"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
      )}
      <CardContent className="py-2 px-4">
        <ScrollArea className="max-h-80">
          <div className="space-y-2">
            {events.map((event) => (
              <div
                key={event.id}
                className={`p-3 rounded-md border ${
                  event.eventType === 'confirmed'
                    ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
                }`}
                data-testid={`history-event-${event.id}`}
              >
                <div className="flex items-start gap-3">
                  {event.eventType === 'confirmed' ? (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 mt-0.5 text-red-600 dark:text-red-400 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{event.siteName}</span>
                      <Badge 
                        className={
                          event.eventType === 'confirmed'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                        }
                      >
                        {event.eventType === 'confirmed' ? 'Confirmed' : 'Auto-Released'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{format(new Date(event.timestamp), 'MMM d, yyyy h:mm a')}</span>
                      </div>
                      {event.userName && (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span>{event.userName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export default ConfirmationHistoryLog;
