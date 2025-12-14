import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle,
  Timer,
  CalendarClock,
  Loader2,
  CheckCheck
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { 
  getTimeRemaining, 
  getDeadlineUrgency,
  isDeadlinePassed
} from '@/utils/confirmationDeadlines';
import { format } from 'date-fns';

interface PendingSite {
  id: string;
  siteName: string;
  confirmationDeadline: string;
  urgency: 'normal' | 'warning' | 'critical' | 'expired';
  timeRemaining: string;
}

interface SiteVisitData {
  confirmation_deadline?: string;
  confirmation_status?: 'pending' | 'confirmed' | 'auto_released';
  autorelease_at?: string;
  [key: string]: unknown;
}

export function BatchConfirmation() {
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const [pendingSites, setPendingSites] = useState<PendingSite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isConfirming, setIsConfirming] = useState(false);

  const fetchPendingSites = async () => {
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
            urgency: getDeadlineUrgency(deadline),
            timeRemaining: getTimeRemaining(deadline),
          };
        })
        .sort((a, b) => {
          const urgencyOrder = { critical: 0, warning: 1, expired: 2, normal: 3 };
          return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        });

      setPendingSites(pending);
    } catch (error) {
      console.error('Error fetching pending sites:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingSites();
  }, [currentUser?.id]);

  const handleToggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const confirmableSites = pendingSites.filter(s => s.urgency !== 'expired');
    if (selectedIds.size === confirmableSites.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(confirmableSites.map(s => s.id)));
    }
  };

  const handleBatchConfirm = async () => {
    if (!currentUser?.id || selectedIds.size === 0) return;

    setIsConfirming(true);
    const now = new Date().toISOString();
    let successCount = 0;
    let errorCount = 0;

    for (const visitId of selectedIds) {
      try {
        const { data: currentData, error: fetchError } = await supabase
          .from('site_visits')
          .select('visit_data')
          .eq('id', visitId)
          .single();

        if (fetchError) {
          errorCount++;
          continue;
        }

        const existingVisitData = (currentData?.visit_data as Record<string, unknown>) || {};
        const updatedVisitData = {
          ...existingVisitData,
          confirmation_status: 'confirmed',
          acknowledged_at: now,
          acknowledged_by: currentUser.id,
          batch_confirmed: true,
        };

        const { error: updateError } = await supabase
          .from('site_visits')
          .update({
            visit_data: updatedVisitData,
            updated_at: now,
          })
          .eq('id', visitId);

        if (updateError) {
          errorCount++;
        } else {
          successCount++;
        }
      } catch {
        errorCount++;
      }
    }

    setIsConfirming(false);
    setSelectedIds(new Set());

    if (successCount > 0) {
      toast({
        title: 'Batch Confirmation Complete',
        description: `Successfully confirmed ${successCount} site${successCount > 1 ? 's' : ''}.${errorCount > 0 ? ` ${errorCount} failed.` : ''}`,
      });
      fetchPendingSites();
    } else {
      toast({
        title: 'Confirmation Failed',
        description: 'Could not confirm any sites. Please try again.',
        variant: 'destructive',
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

  const confirmableSites = useMemo(() => {
    return pendingSites.filter(s => s.urgency !== 'expired');
  }, [pendingSites]);

  if (isLoading) {
    return (
      <Card data-testid="card-batch-confirmation-loading">
        <CardHeader className="py-3 px-4 pb-2">
          <div className="flex items-center gap-2">
            <CheckCheck className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Batch Confirmation</CardTitle>
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

  if (pendingSites.length === 0) {
    return (
      <Card data-testid="card-batch-confirmation-empty">
        <CardHeader className="py-3 px-4 pb-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            <CardTitle className="text-sm font-medium">Batch Confirmation</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="py-3 px-4">
          <p className="text-sm text-muted-foreground">
            No pending confirmations to process.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-batch-confirmation">
      <CardHeader className="py-3 px-4 pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <CheckCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-sm font-medium">Batch Confirmation</CardTitle>
          </div>
          <Badge variant="secondary">{pendingSites.length} Pending</Badge>
        </div>
      </CardHeader>
      <CardContent className="py-2 px-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="select-all"
              checked={selectedIds.size === confirmableSites.length && confirmableSites.length > 0}
              onCheckedChange={handleSelectAll}
              data-testid="checkbox-select-all"
            />
            <label htmlFor="select-all" className="text-sm text-muted-foreground cursor-pointer">
              Select All ({confirmableSites.length})
            </label>
          </div>
          <Button
            size="sm"
            onClick={handleBatchConfirm}
            disabled={isConfirming || selectedIds.size === 0}
            data-testid="button-batch-confirm"
          >
            {isConfirming ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Confirming...
              </>
            ) : (
              <>
                <CheckCheck className="mr-2 h-3.5 w-3.5" />
                Confirm Selected ({selectedIds.size})
              </>
            )}
          </Button>
        </div>

        <ScrollArea className="max-h-72">
          <div className="space-y-2">
            {pendingSites.map((item) => {
              const styles = getUrgencyStyles(item.urgency);
              const Icon = styles.icon;
              const isExpired = item.urgency === 'expired';

              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-md border ${styles.bg} ${styles.border} ${isExpired ? 'opacity-60' : ''}`}
                  data-testid={`batch-item-${item.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedIds.has(item.id)}
                      onCheckedChange={() => handleToggleSelection(item.id)}
                      disabled={isExpired}
                      data-testid={`checkbox-site-${item.id}`}
                    />
                    <Icon className={`h-4 w-4 flex-shrink-0 ${styles.text}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.siteName}</p>
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{format(new Date(item.confirmationDeadline), 'MMM d, h:mm a')}</span>
                      </div>
                    </div>
                    <Badge className={styles.badge}>
                      {item.timeRemaining}
                    </Badge>
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

export default BatchConfirmation;
