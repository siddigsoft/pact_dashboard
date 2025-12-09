import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle,
  Timer,
  CalendarClock,
  Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { 
  getTimeRemaining, 
  getDeadlineUrgency 
} from '@/utils/confirmationDeadlines';
import { format } from 'date-fns';

interface PendingConfirmation {
  id: string;
  siteName: string;
  confirmationDeadline: string;
  autoreleaseAt: string;
  urgency: 'normal' | 'warning' | 'critical' | 'expired';
  timeRemaining: string;
}

interface SiteVisitData {
  confirmation_deadline?: string;
  confirmation_status?: 'pending' | 'confirmed' | 'auto_released';
  autorelease_at?: string;
  [key: string]: unknown;
}

export function ConfirmationStatusWidget() {
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const [pendingConfirmations, setPendingConfirmations] = useState<PendingConfirmation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmingIds, setConfirmingIds] = useState<Set<string>>(new Set());

  const fetchPendingConfirmations = async () => {
    if (!currentUser?.id) return;

    try {
      const { data: siteVisits, error } = await supabase
        .from('site_visits')
        .select('id, site_name, visit_data')
        .eq('assigned_to', currentUser.id)
        .in('status', ['dispatched', 'in_progress', 'claimed', 'assigned']);

      if (error) throw error;

      const pending = (siteVisits || [])
        .filter(visit => {
          const visitData = visit.visit_data as SiteVisitData | null;
          return visitData?.confirmation_status === 'pending' && visitData?.confirmation_deadline;
        })
        .map(visit => {
          const visitData = visit.visit_data as SiteVisitData;
          const deadline = visitData.confirmation_deadline!;
          return {
            id: visit.id,
            siteName: visit.site_name || 'Unknown Site',
            confirmationDeadline: deadline,
            autoreleaseAt: visitData.autorelease_at || '',
            urgency: getDeadlineUrgency(deadline),
            timeRemaining: getTimeRemaining(deadline),
          };
        })
        .sort((a, b) => {
          const urgencyOrder = { critical: 0, warning: 1, expired: 2, normal: 3 };
          return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        });

      setPendingConfirmations(pending);
    } catch (error) {
      console.error('Error fetching pending confirmations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser?.id) {
      setIsLoading(false);
      return;
    }
    fetchPendingConfirmations();
    const interval = setInterval(fetchPendingConfirmations, 60000);
    return () => clearInterval(interval);
  }, [currentUser?.id]);

  const handleQuickConfirm = async (visitId: string, siteName: string) => {
    if (!currentUser?.id) return;

    setConfirmingIds(prev => new Set(prev).add(visitId));
    
    try {
      const now = new Date().toISOString();
      
      const { data: currentData, error: fetchError } = await supabase
        .from('site_visits')
        .select('visit_data')
        .eq('id', visitId)
        .single();

      if (fetchError) throw fetchError;

      const existingVisitData = (currentData?.visit_data as Record<string, unknown>) || {};
      const updatedVisitData = {
        ...existingVisitData,
        confirmation_status: 'confirmed',
        acknowledged_at: now,
        acknowledged_by: currentUser.id,
      };

      const { error: updateError } = await supabase
        .from('site_visits')
        .update({
          visit_data: updatedVisitData,
          updated_at: now,
        })
        .eq('id', visitId);

      if (updateError) throw updateError;

      toast({
        title: 'Assignment Confirmed',
        description: `You have confirmed your assignment to ${siteName}.`,
      });

      setPendingConfirmations(prev => prev.filter(p => p.id !== visitId));
    } catch (error) {
      console.error('Error confirming assignment:', error);
      toast({
        title: 'Confirmation Failed',
        description: 'Could not confirm assignment. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setConfirmingIds(prev => {
        const next = new Set(prev);
        next.delete(visitId);
        return next;
      });
    }
  };

  const getUrgencyStyles = (urgency: string) => {
    switch (urgency) {
      case 'critical':
        return {
          bg: 'bg-red-50 dark:bg-red-950/30',
          border: 'border-red-200 dark:border-red-800',
          text: 'text-red-700 dark:text-red-400',
          badge: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
          icon: AlertCircle,
        };
      case 'warning':
        return {
          bg: 'bg-amber-50 dark:bg-amber-950/30',
          border: 'border-amber-200 dark:border-amber-800',
          text: 'text-amber-700 dark:text-amber-400',
          badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
          icon: AlertTriangle,
        };
      case 'expired':
        return {
          bg: 'bg-gray-50 dark:bg-gray-950/30',
          border: 'border-gray-200 dark:border-gray-800',
          text: 'text-gray-600 dark:text-gray-400',
          badge: 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300',
          icon: Clock,
        };
      default:
        return {
          bg: 'bg-blue-50 dark:bg-blue-950/30',
          border: 'border-blue-200 dark:border-blue-800',
          text: 'text-blue-700 dark:text-blue-400',
          badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
          icon: Timer,
        };
    }
  };

  const stats = useMemo(() => {
    const critical = pendingConfirmations.filter(p => p.urgency === 'critical').length;
    const warning = pendingConfirmations.filter(p => p.urgency === 'warning').length;
    const normal = pendingConfirmations.filter(p => p.urgency === 'normal').length;
    return { critical, warning, normal, total: pendingConfirmations.length };
  }, [pendingConfirmations]);

  if (isLoading) {
    return (
      <Card data-testid="card-confirmation-widget-loading">
        <CardHeader className="py-3 px-4 pb-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Pending Confirmations</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="py-4 px-4">
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (pendingConfirmations.length === 0) {
    return (
      <Card data-testid="card-confirmation-widget-empty">
        <CardHeader className="py-3 px-4 pb-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            <CardTitle className="text-sm font-medium">Confirmations</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="py-3 px-4">
          <p className="text-sm text-muted-foreground">
            All assignments confirmed. No pending confirmations.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-confirmation-widget">
      <CardHeader className="py-3 px-4 pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            <CardTitle className="text-sm font-medium">Pending Confirmations</CardTitle>
          </div>
          <div className="flex items-center gap-1.5">
            {stats.critical > 0 && (
              <Badge className="bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300">
                {stats.critical} Critical
              </Badge>
            )}
            {stats.warning > 0 && (
              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                {stats.warning} Warning
              </Badge>
            )}
            <Badge variant="secondary">{stats.total} Total</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="py-2 px-4">
        <ScrollArea className="max-h-64">
          <div className="space-y-2">
            {pendingConfirmations.map((item) => {
              const styles = getUrgencyStyles(item.urgency);
              const Icon = styles.icon;
              const isConfirming = confirmingIds.has(item.id);

              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-md border ${styles.bg} ${styles.border}`}
                  data-testid={`confirmation-item-${item.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${styles.text}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.siteName}</p>
                        <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>Deadline: {format(new Date(item.confirmationDeadline), 'MMM d, h:mm a')}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge className={styles.badge}>
                        {item.timeRemaining}
                      </Badge>
                      <Button
                        size="sm"
                        onClick={() => handleQuickConfirm(item.id, item.siteName)}
                        disabled={isConfirming || item.urgency === 'expired'}
                        data-testid={`button-quick-confirm-${item.id}`}
                      >
                        {isConfirming ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export default ConfirmationStatusWidget;
