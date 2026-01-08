import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/context/user/UserContext';
import { Hand, Loader2, CheckCircle, Wallet, Car, User, AlertCircle, Banknote, ShieldX, MapPinOff } from 'lucide-react';
import { useClaimFeeCalculation, type ClaimFeeBreakdown } from '@/hooks/use-claim-fee-calculation';
import { CLASSIFICATION_LABELS, CLASSIFICATION_COLORS } from '@/types/classification';
import { useClassification } from '@/context/classification/ClassificationContext';
import { getStateName, getLocalityName } from '@/data/sudanStates';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { useAuditLog } from '@/hooks/use-audit-log';
import { calculateConfirmationDeadlines } from '@/utils/confirmationDeadlines';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { 
  checkSiteProximity, 
  parseGpsCoordinates, 
  getProximityConfig,
  formatDistance
} from '@/utils/geoDistance';

interface ClaimSiteButtonProps {
  siteId: string;
  siteName: string;
  userId: string;
  state?: string;
  locality?: string;
  siteCoordinates?: unknown;
  scheduledDate?: string;
  onClaimed?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export function ClaimSiteButton({
  siteId,
  siteName,
  userId,
  state,
  locality,
  siteCoordinates,
  scheduledDate,
  onClaimed,
  disabled = false,
  variant = 'default',
  size = 'default',
  className = ''
}: ClaimSiteButtonProps) {
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [feeBreakdown, setFeeBreakdown] = useState<ClaimFeeBreakdown | null>(null);
  const { toast } = useToast();
  const { currentUser } = useUser();
  const { calculateFeeForClaim, loading: calculatingFee } = useClaimFeeCalculation();
  const { getUserClassification } = useClassification();
  const { isSuperAdmin } = useSuperAdmin();
  const { logSiteVisitEvent } = useAuditLog();

  const isFieldWorker = currentUser?.role === 'dataCollector' || 
                        currentUser?.role === 'datacollector' || 
                        currentUser?.role === 'coordinator';
  
  const canSeeBreakdown = !isFieldWorker;

  // PERMISSION CHECK 1: User must have an active classification to claim sites
  const userClassification = useMemo(() => {
    if (!currentUser?.id) return null;
    return getUserClassification(currentUser.id);
  }, [currentUser?.id, getUserClassification]);
  
  const hasClassification = !!userClassification;
  
  // Get proximity configuration
  const proximityConfig = useMemo(() => getProximityConfig(), []);
  
  // PERMISSION CHECK 2: Site must be in user's state + within GPS proximity (configurable, default 80km)
  // NEW LOGIC:
  // - Users without location sharing enabled cannot claim sites
  // - Sites without GPS coordinates are claimable by anyone in the state
  // - Sites with GPS coordinates are only claimable if user is within proximity radius
  const proximityCheck = useMemo(() => {
    if (!currentUser || !isFieldWorker || isSuperAdmin) {
      return { canClaim: true, reason: null, distanceKm: null };
    }
    
    const userStateId = currentUser.stateId;
    
    if (!userStateId) {
      return { 
        canClaim: false, 
        reason: 'Your profile has no state assigned. Contact your supervisor.',
        distanceKm: null
      };
    }
    
    const userLocation = parseGpsCoordinates(currentUser.location);
    const siteLocation = parseGpsCoordinates(siteCoordinates);
    
    // Convert user's state ID to state name for comparison with site.state (which is a name)
    const userStateName = getStateName(userStateId);
    
    const result = checkSiteProximity(
      userStateName || undefined, // User state NAME (not ID)
      userLocation,
      undefined,
      state, // Site state NAME
      siteLocation,
      proximityConfig
    );
    
    return { 
      canClaim: result.canAccess, 
      reason: result.reason,
      distanceKm: result.distanceKm
    };
  }, [currentUser, isFieldWorker, isSuperAdmin, state, siteCoordinates, proximityConfig]);

  // Combined permission check for field workers
  const canClaimSite = useMemo(() => {
    // Non-field workers and SuperAdmins can claim (they are typically assigning, not claiming)
    if (!isFieldWorker || isSuperAdmin) return { allowed: true, reason: null, distanceKm: null };
    
    // Field workers need classification
    if (!hasClassification) {
      return { 
        allowed: false, 
        reason: 'You must have an active classification to claim sites. Contact your supervisor to get classified.',
        distanceKm: null
      };
    }
    
    // Field workers need to be within state + GPS proximity
    if (!proximityCheck.canClaim) {
      return { allowed: false, reason: proximityCheck.reason, distanceKm: proximityCheck.distanceKm };
    }
    
    return { allowed: true, reason: null, distanceKm: proximityCheck.distanceKm };
  }, [isFieldWorker, isSuperAdmin, hasClassification, proximityCheck]);

  const handleInitiateClaim = async () => {
    if (claiming || claimed || disabled) return;

    const breakdown = await calculateFeeForClaim(siteId, userId);
    if (breakdown) {
      setFeeBreakdown(breakdown);
      setShowConfirmation(true);
    } else {
      toast({
        title: 'Error',
        description: 'Could not calculate fees. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleConfirmClaim = async () => {
    if (!feeBreakdown) return;

    setClaiming(true);
    setShowConfirmation(false);

    try {
      // Pass the calculated fee directly to the RPC for atomic update
      const { data, error } = await supabase.rpc('claim_site_visit', {
        p_site_id: siteId,
        p_user_id: userId,
        p_enumerator_fee: feeBreakdown.enumeratorFee,
        p_total_cost: feeBreakdown.totalPayout,
        p_classification_level: feeBreakdown.classificationLevel || null,
        p_role_scope: feeBreakdown.roleScope || null,
        p_fee_source: feeBreakdown.feeSource
      });

      if (error) {
        console.error('Claim RPC error:', error);
        logSiteVisitEvent('claim', siteId, siteName, `Site claim failed: ${error.message}`, {
          severity: 'error',
          success: false,
          errorMessage: error.message,
          metadata: { userId, siteId },
        });
        toast({
          title: 'Claim Failed',
          description: error.message || 'Could not claim this site. Please try again.',
          variant: 'destructive'
        });
        return;
      }

      const result = data as { success: boolean; error?: string; message: string; site_name?: string; enumerator_fee?: number; total_payout?: number };

      if (result.success) {
        // Fee is now saved atomically by the RPC, no need for separate update
        const finalFee = result.enumerator_fee ?? feeBreakdown.enumeratorFee;
        const finalTotal = result.total_payout ?? feeBreakdown.totalPayout;

        // Set confirmation deadlines for the claimed site visit
        let visitDate = scheduledDate;
        
        // If no scheduled date provided, fetch it from the database
        if (!visitDate) {
          const { data: siteData } = await supabase
            .from('site_visits')
            .select('due_date, visit_data')
            .eq('id', siteId)
            .single();
          
          visitDate = siteData?.due_date || (siteData?.visit_data as any)?.scheduledDate;
        }
        
        // Set confirmation tracking fields if we have a visit date
        if (visitDate) {
          const confirmationDeadlines = calculateConfirmationDeadlines(visitDate);
          
          // Fetch current visit_data to merge with confirmation fields
          const { data: currentData } = await supabase
            .from('site_visits')
            .select('visit_data')
            .eq('id', siteId)
            .single();
          
          const existingVisitData = (currentData?.visit_data as Record<string, unknown>) || {};
          
          // Merge confirmation tracking fields into visit_data
          const updatedVisitData = {
            ...existingVisitData,
            confirmation_deadline: confirmationDeadlines.confirmation_deadline,
            confirmation_status: confirmationDeadlines.confirmation_status,
            autorelease_at: confirmationDeadlines.autorelease_at,
          };
          
          await supabase
            .from('site_visits')
            .update({
              visit_data: updatedVisitData,
              updated_at: new Date().toISOString(),
            })
            .eq('id', siteId);
        }

        logSiteVisitEvent('claim', siteId, siteName, `Site "${siteName}" claimed successfully`, {
          workflowStep: 'in_progress',
          metadata: { fee: finalFee, totalPayout: finalTotal, userId },
        });

        // Send notification (and email for high priority) to the claimer
        NotificationTriggerService.siteAssigned(userId, siteName, siteId);
        
        // Send notifications to supervisors/admins about the claim
        if (currentUser) {
          NotificationTriggerService.siteClaimNotification(
            userId,
            currentUser.fullName || currentUser.name || 'A team member',
            currentUser.role || 'data_collector',
            siteName,
            siteId,
            currentUser.hubId,
            undefined
          );
        }

        setClaimed(true);
        toast({
          title: 'Site Claimed!',
          description: isFieldWorker 
            ? `${result.message} Total payout: ${finalTotal.toLocaleString()} SDG`
            : `${result.message} Your fee: ${finalFee.toLocaleString()} SDG + Transport: ${feeBreakdown.transportBudget.toLocaleString()} SDG = ${finalTotal.toLocaleString()} SDG`,
          variant: 'default'
        });
        onClaimed?.();
      } else {
        let description = result.message;
        
        if (result.error === 'ALREADY_CLAIMED') {
          description = 'Another enumerator claimed this site first. Try a different site.';
        } else if (result.error === 'CLAIM_IN_PROGRESS') {
          description = 'Someone else is claiming this site right now. Try again in a moment.';
        } else if (result.error === 'INVALID_STATUS') {
          description = 'This site is no longer available for claiming.';
        }

        logSiteVisitEvent('claim', siteId, siteName, `Site claim rejected: ${description}`, {
          severity: 'warning',
          success: false,
          errorMessage: result.error,
          metadata: { userId, siteId, errorCode: result.error },
        });
        toast({
          title: 'Could Not Claim Site',
          description,
          variant: 'destructive'
        });
      }
    } catch (err) {
      console.error('Claim error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logSiteVisitEvent('claim', siteId, siteName, `Site claim error: ${errorMessage}`, {
        severity: 'error',
        success: false,
        errorMessage,
        metadata: { userId, siteId },
      });
      toast({
        title: 'Claim Failed',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setClaiming(false);
    }
  };

  if (claimed) {
    return (
      <Button
        variant="outline"
        size={size}
        className={`bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 ${className}`}
        disabled
        data-testid={`button-claimed-${siteId}`}
      >
        <CheckCircle className="h-4 w-4 mr-2" />
        Claimed
      </Button>
    );
  }

  // Show blocked button if user cannot claim due to permission restrictions
  if (!canClaimSite.allowed && isFieldWorker) {
    const isClassificationIssue = !hasClassification;
    const isProximityIssue = !proximityCheck.canClaim;
    
    return (
      <Button
        variant="outline"
        size={size}
        className={`bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 cursor-not-allowed ${className}`}
        disabled
        onClick={() => {
          toast({
            title: 'Cannot Claim Site',
            description: canClaimSite.reason || 'You do not have permission to claim this site.',
            variant: 'destructive'
          });
        }}
        data-testid={`button-blocked-${siteId}`}
        title={canClaimSite.reason || 'Cannot claim this site'}
      >
        {isClassificationIssue ? (
          <>
            <ShieldX className="h-4 w-4 mr-2" />
            No Classification
          </>
        ) : isProximityIssue ? (
          <>
            <MapPinOff className="h-4 w-4 mr-2" />
            {proximityCheck.distanceKm !== null 
              ? `Too Far (${formatDistance(proximityCheck.distanceKm)})` 
              : 'Out of Range'}
          </>
        ) : (
          <>
            <AlertCircle className="h-4 w-4 mr-2" />
            Cannot Claim
          </>
        )}
      </Button>
    );
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleInitiateClaim}
        disabled={claiming || disabled || calculatingFee}
        className={`bg-primary hover:bg-primary/90 ${className}`}
        data-testid={`button-claim-${siteId}`}
      >
        {claiming || calculatingFee ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {calculatingFee ? 'Calculating...' : 'Claiming...'}
          </>
        ) : (
          <>
            <Hand className="h-4 w-4 mr-2" />
            Claim Site
          </>
        )}
      </Button>

      <Dialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <DialogContent className="sm:max-w-md max-h-[70vh] overflow-hidden p-0 flex flex-col">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Confirm Site Claim
            </DialogTitle>
            <DialogDescription>
              {canSeeBreakdown 
                ? `Review site details and your payment breakdown before accepting`
                : `Review your total payout for "${siteName}"`
              }
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 pb-4">
            {feeBreakdown && (
              <div className="space-y-4 py-4">
                {canSeeBreakdown ? (
                  <>
                    {feeBreakdown.classificationLevel && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="text-sm font-medium">Your Classification</span>
                        <Badge className={CLASSIFICATION_COLORS[feeBreakdown.classificationLevel]}>
                          {CLASSIFICATION_LABELS[feeBreakdown.classificationLevel]}
                        </Badge>
                      </div>
                    )}

                    {feeBreakdown.feeSource === 'default' && (
                      <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-amber-800 dark:text-amber-200">
                          No classification found. Using default rate of {feeBreakdown.enumeratorFee.toLocaleString()} SDG.
                          Contact your supervisor to get classified for accurate rates.
                        </p>
                      </div>
                    )}

                    <div className="space-y-3">
                      <div className="flex items-center justify-between py-2 border-b">
                        <div className="flex items-center gap-2">
                          <Car className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Transport Budget</span>
                        </div>
                        <span className="font-medium">{feeBreakdown.transportBudget.toLocaleString()} SDG</span>
                      </div>

                      <div className="flex items-center justify-between py-2 border-b">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Collector Fee</span>
                        </div>
                        <span className="font-medium">{feeBreakdown.enumeratorFee.toLocaleString()} SDG</span>
                      </div>

                      <div className="flex items-center justify-between py-3 bg-primary/10 rounded-lg px-3">
                        <div className="flex items-center gap-2">
                          <Wallet className="h-5 w-5 text-primary" />
                          <span className="font-semibold">Total Payout</span>
                        </div>
                        <span className="text-xl font-bold text-primary">{feeBreakdown.totalPayout.toLocaleString()} SDG</span>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground text-center">
                      This amount will be credited to your wallet after completing the site visit.
                    </p>
                  </>
                ) : (
                  <>
                    {feeBreakdown.classificationLevel && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="text-sm font-medium">Your Classification</span>
                        <Badge className={CLASSIFICATION_COLORS[feeBreakdown.classificationLevel]}>
                          {CLASSIFICATION_LABELS[feeBreakdown.classificationLevel]}
                        </Badge>
                      </div>
                    )}

                    <div className="flex flex-col items-center justify-center py-6 space-y-4">
                      <div className="p-4 bg-primary/10 rounded-full">
                        <Banknote className="h-10 w-10 text-primary" />
                      </div>
                      
                      <div className="text-center space-y-2">
                        <p className="text-3xl font-bold text-primary">
                          {feeBreakdown.totalPayout.toLocaleString()} SDG
                        </p>
                        <p className="text-sm text-muted-foreground max-w-xs">
                          This is your total amount for this site visit, including transportation and your fees.
                        </p>
                      </div>
                    </div>

                    {feeBreakdown.feeSource === 'default' && (
                      <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-amber-800 dark:text-amber-200">
                          Using default rate. Contact your supervisor to get classified for accurate rates.
                        </p>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground text-center">
                      This amount will be credited to your wallet after completing the site visit.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 px-6 pb-6">
            <Button
              variant="outline"
              onClick={() => setShowConfirmation(false)}
              data-testid="button-cancel-claim"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmClaim}
              disabled={claiming}
              data-testid="button-confirm-claim"
            >
              {claiming ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Claiming...
                </>
              ) : (
                <>
                  <Hand className="h-4 w-4 mr-2" />
                  Confirm Claim
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ClaimSiteButton;
