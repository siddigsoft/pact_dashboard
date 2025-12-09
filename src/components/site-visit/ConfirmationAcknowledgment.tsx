import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle,
  Timer,
  CalendarClock
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

interface ConfirmationAcknowledgmentProps {
  visitId: string;
  visitData: {
    confirmation_deadline?: string;
    confirmation_status?: 'pending' | 'confirmed' | 'auto_released';
    acknowledged_at?: string;
    acknowledged_by?: string;
    autorelease_at?: string;
    autorelease_triggered?: boolean;
  };
  siteName: string;
  dueDate: string;
  isDispatchedSite?: boolean;
  onConfirmed?: () => void;
}

export function ConfirmationAcknowledgment({
  visitId,
  visitData,
  siteName,
  dueDate,
  isDispatchedSite = true,
  onConfirmed
}: ConfirmationAcknowledgmentProps) {
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const [isConfirming, setIsConfirming] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [urgency, setUrgency] = useState<'normal' | 'warning' | 'critical' | 'expired'>('normal');

  const confirmationDeadline = visitData?.confirmation_deadline;
  const confirmationStatus = visitData?.confirmation_status || 'pending';
  const isConfirmed = confirmationStatus === 'confirmed';
  const isAutoReleased = confirmationStatus === 'auto_released';

  useEffect(() => {
    if (!confirmationDeadline) return;

    const updateTimeRemaining = () => {
      setTimeRemaining(getTimeRemaining(confirmationDeadline));
      setUrgency(getDeadlineUrgency(confirmationDeadline));
    };

    updateTimeRemaining();
    const interval = setInterval(updateTimeRemaining, 60000);
    
    return () => clearInterval(interval);
  }, [confirmationDeadline]);

  const handleConfirmAssignment = async () => {
    if (!currentUser?.id || !visitId) return;

    setIsConfirming(true);
    try {
      const now = new Date().toISOString();
      
      if (isDispatchedSite) {
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
      } else {
        const { data: currentData, error: fetchError } = await supabase
          .from('mmp_site_entries')
          .select('extra_data')
          .eq('id', visitId)
          .single();

        if (fetchError) throw fetchError;

        const existingExtraData = (currentData?.extra_data as Record<string, unknown>) || {};
        const updatedExtraData = {
          ...existingExtraData,
          confirmation_status: 'confirmed',
          acknowledged_at: now,
          acknowledged_by: currentUser.id,
        };

        const { error: updateError } = await supabase
          .from('mmp_site_entries')
          .update({
            extra_data: updatedExtraData,
            updated_at: now,
          })
          .eq('id', visitId);

        if (updateError) throw updateError;
      }

      toast({
        title: 'Assignment Confirmed',
        description: `You have confirmed your assignment to ${siteName}. The site will not be auto-released.`,
      });

      onConfirmed?.();
    } catch (error) {
      console.error('Error confirming assignment:', error);
      toast({
        title: 'Confirmation Failed',
        description: 'Could not confirm assignment. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsConfirming(false);
    }
  };

  if (!confirmationDeadline) {
    return null;
  }

  const getUrgencyStyles = () => {
    switch (urgency) {
      case 'critical':
        return {
          borderColor: 'border-red-500 dark:border-red-600',
          bgColor: 'bg-red-50 dark:bg-red-950/20',
          textColor: 'text-red-700 dark:text-red-400',
          icon: AlertCircle,
        };
      case 'warning':
        return {
          borderColor: 'border-amber-500 dark:border-amber-600',
          bgColor: 'bg-amber-50 dark:bg-amber-950/20',
          textColor: 'text-amber-700 dark:text-amber-400',
          icon: AlertTriangle,
        };
      case 'expired':
        return {
          borderColor: 'border-gray-400 dark:border-gray-600',
          bgColor: 'bg-gray-50 dark:bg-gray-950/20',
          textColor: 'text-gray-600 dark:text-gray-400',
          icon: Clock,
        };
      default:
        return {
          borderColor: 'border-blue-500 dark:border-blue-600',
          bgColor: 'bg-blue-50 dark:bg-blue-950/20',
          textColor: 'text-blue-700 dark:text-blue-400',
          icon: Timer,
        };
    }
  };

  const styles = getUrgencyStyles();
  const UrgencyIcon = styles.icon;

  if (isConfirmed) {
    return (
      <Card className="border-green-500 dark:border-green-600 bg-green-50 dark:bg-green-950/20" data-testid="card-confirmation-confirmed">
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                Assignment Confirmed
              </p>
              {visitData.acknowledged_at && (
                <p className="text-xs text-green-600/80 dark:text-green-400/80">
                  Confirmed on {format(new Date(visitData.acknowledged_at), 'MMM d, yyyy h:mm a')}
                </p>
              )}
            </div>
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
              Confirmed
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isAutoReleased) {
    return (
      <Card className="border-gray-400 dark:border-gray-600 bg-gray-50 dark:bg-gray-950/20" data-testid="card-confirmation-released">
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Assignment Auto-Released
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                This site was released due to no confirmation before the deadline.
              </p>
            </div>
            <Badge variant="secondary">
              Released
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  const deadlinePassed = isDeadlinePassed(confirmationDeadline);

  return (
    <Card className={`${styles.borderColor} ${styles.bgColor}`} data-testid="card-confirmation-pending">
      <CardHeader className="py-3 px-4 pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <UrgencyIcon className={`h-5 w-5 ${styles.textColor} flex-shrink-0`} />
            <CardTitle className={`text-sm font-medium ${styles.textColor}`}>
              Confirmation Required
            </CardTitle>
          </div>
          <Badge 
            className={
              urgency === 'critical' 
                ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                : urgency === 'warning'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                : 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
            }
          >
            {deadlinePassed ? 'Overdue' : timeRemaining}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="py-2 px-4 space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            Deadline: {format(new Date(confirmationDeadline), 'MMM d, yyyy h:mm a')}
          </span>
        </div>
        
        <p className="text-xs text-muted-foreground">
          {urgency === 'critical' 
            ? 'Urgent: Confirm now or this site may be released to other collectors.'
            : urgency === 'warning'
            ? 'Please confirm your assignment soon to keep this site.'
            : 'Confirm your assignment to secure this site visit.'
          }
        </p>

        {!deadlinePassed && (
          <Button
            onClick={handleConfirmAssignment}
            disabled={isConfirming}
            className="w-full"
            data-testid="button-confirm-assignment"
          >
            {isConfirming ? (
              <>
                <Clock className="mr-2 h-4 w-4 animate-spin" />
                Confirming...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Confirm Assignment
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default ConfirmationAcknowledgment;
