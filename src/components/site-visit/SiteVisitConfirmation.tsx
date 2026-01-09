import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Clock, AlertTriangle, Calendar, XCircle, RefreshCw } from 'lucide-react';
import { format, parseISO, differenceInHours, differenceInMinutes, isAfter, isBefore } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { calculateConfirmationDeadlines, getAutoReleaseSettings } from '@/utils/confirmationDeadlines';

interface ConfirmationData {
  confirmation_deadline?: string;
  autorelease_at?: string;
  confirmation_status?: 'pending' | 'confirmed' | 'auto_released';
  confirmed_at?: string;
  confirmed_by?: string;
}

interface SiteVisitConfirmationProps {
  siteVisitId: string;
  siteName: string;
  visitDate: string;
  visitData?: ConfirmationData;
  assignedTo: string;
  currentUserId: string;
  onConfirmationChange?: () => void;
}

export function SiteVisitConfirmation({
  siteVisitId,
  siteName,
  visitDate,
  visitData,
  assignedTo,
  currentUserId,
  onConfirmationChange
}: SiteVisitConfirmationProps) {
  const { toast } = useToast();
  const [isConfirming, setIsConfirming] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  
  const settings = getAutoReleaseSettings();
  const now = new Date();
  
  const confirmationDeadline = visitData?.confirmation_deadline 
    ? parseISO(visitData.confirmation_deadline)
    : null;
  
  const autoreleaseAt = visitData?.autorelease_at
    ? parseISO(visitData.autorelease_at)
    : null;
  
  const confirmationStatus = visitData?.confirmation_status || 'pending';
  const isAssignedToMe = assignedTo === currentUserId;
  
  const getTimeRemaining = () => {
    if (!confirmationDeadline) return null;
    
    const hoursRemaining = differenceInHours(confirmationDeadline, now);
    const minutesRemaining = differenceInMinutes(confirmationDeadline, now) % 60;
    
    if (hoursRemaining < 0) {
      return { hours: 0, minutes: 0, overdue: true };
    }
    
    return { hours: hoursRemaining, minutes: minutesRemaining, overdue: false };
  };
  
  const timeRemaining = getTimeRemaining();
  
  const getStatusDisplay = () => {
    switch (confirmationStatus) {
      case 'confirmed':
        return {
          icon: <CheckCircle className="h-5 w-5 text-green-600" />,
          label: 'Confirmed',
          color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
          description: visitData?.confirmed_at 
            ? `Confirmed on ${format(parseISO(visitData.confirmed_at), 'PPP p')}`
            : 'Visit confirmed'
        };
      case 'auto_released':
        return {
          icon: <XCircle className="h-5 w-5 text-red-600" />,
          label: 'Auto-Released',
          color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
          description: 'Site was released due to no confirmation'
        };
      default:
        if (timeRemaining?.overdue) {
          return {
            icon: <AlertTriangle className="h-5 w-5 text-amber-600" />,
            label: 'Overdue',
            color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
            description: 'Confirmation deadline has passed'
          };
        }
        if (timeRemaining && timeRemaining.hours < 12) {
          return {
            icon: <Clock className="h-5 w-5 text-amber-600" />,
            label: 'Urgent',
            color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
            description: `${timeRemaining.hours}h ${timeRemaining.minutes}m remaining`
          };
        }
        return {
          icon: <Clock className="h-5 w-5 text-blue-600" />,
          label: 'Pending',
          color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
          description: timeRemaining 
            ? `${timeRemaining.hours}h ${timeRemaining.minutes}m to confirm`
            : 'Awaiting confirmation'
        };
    }
  };
  
  const statusDisplay = getStatusDisplay();
  
  const handleConfirm = async () => {
    if (!isAssignedToMe) {
      toast({
        title: 'Cannot Confirm',
        description: 'Only the assigned data collector can confirm this visit.',
        variant: 'destructive'
      });
      return;
    }
    
    setIsConfirming(true);
    try {
      const updatedVisitData = {
        ...visitData,
        confirmation_status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        confirmed_by: currentUserId
      };
      
      const { error } = await supabase
        .from('site_visits')
        .update({
          visit_data: updatedVisitData,
          updated_at: new Date().toISOString()
        })
        .eq('id', siteVisitId);
      
      if (error) throw error;
      
      toast({
        title: 'Visit Confirmed',
        description: `You have confirmed your attendance for ${siteName}.`
      });
      
      setShowConfirmDialog(false);
      onConfirmationChange?.();
    } catch (error) {
      console.error('Failed to confirm visit:', error);
      toast({
        title: 'Confirmation Failed',
        description: 'Could not confirm the visit. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsConfirming(false);
    }
  };
  
  const getProgressPercentage = () => {
    if (!confirmationDeadline || !visitData?.confirmation_deadline) return 0;
    
    const visitDateObj = parseISO(visitDate);
    const deadlineObj = confirmationDeadline;
    const totalHours = settings.confirmationHoursBeforeVisit;
    
    if (confirmationStatus === 'confirmed') return 100;
    
    const hoursRemaining = differenceInHours(deadlineObj, now);
    const percentage = ((totalHours - hoursRemaining) / totalHours) * 100;
    
    return Math.min(100, Math.max(0, percentage));
  };
  
  return (
    <>
      <Card data-testid="card-site-confirmation">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Visit Confirmation
            </CardTitle>
            <Badge className={statusDisplay.color}>
              {statusDisplay.icon}
              <span className="ml-1">{statusDisplay.label}</span>
            </Badge>
          </div>
          <CardDescription>{statusDisplay.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Visit Date:</span>
              <span className="font-medium">{format(parseISO(visitDate), 'PPP')}</span>
            </div>
            {confirmationDeadline && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Confirm By:</span>
                <span className={timeRemaining?.overdue ? 'text-red-600 font-medium' : 'font-medium'}>
                  {format(confirmationDeadline, 'PPP p')}
                </span>
              </div>
            )}
            {autoreleaseAt && confirmationStatus === 'pending' && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Auto-Release At:</span>
                <span className="text-amber-600 font-medium">
                  {format(autoreleaseAt, 'PPP p')}
                </span>
              </div>
            )}
          </div>
          
          {confirmationStatus === 'pending' && confirmationDeadline && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Confirmation Progress</span>
                <span>{Math.round(getProgressPercentage())}%</span>
              </div>
              <Progress value={getProgressPercentage()} className="h-2" />
            </div>
          )}
          
          {isAssignedToMe && confirmationStatus === 'pending' && (
            <Button 
              onClick={() => setShowConfirmDialog(true)}
              className="w-full bg-green-600 hover:bg-green-700"
              data-testid="button-confirm-attendance"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Confirm My Attendance
            </Button>
          )}
          
          {!isAssignedToMe && confirmationStatus === 'pending' && (
            <p className="text-sm text-muted-foreground text-center">
              Waiting for the assigned data collector to confirm
            </p>
          )}
        </CardContent>
      </Card>
      
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Confirm Site Visit Attendance
            </DialogTitle>
            <DialogDescription>
              By confirming, you acknowledge that you will attend the site visit at{' '}
              <strong>{siteName}</strong> on{' '}
              <strong>{format(parseISO(visitDate), 'PPP')}</strong>.
            </DialogDescription>
          </DialogHeader>
          
          <div className="bg-muted p-4 rounded-md space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Visit Date:</span>
              <span className="font-medium">{format(parseISO(visitDate), 'PPP')}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              <span>Failure to attend after confirmation may affect your record</span>
            </div>
          </div>
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirm}
              disabled={isConfirming}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-submit-confirmation"
            >
              {isConfirming ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Confirming...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Yes, I Confirm
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default SiteVisitConfirmation;
