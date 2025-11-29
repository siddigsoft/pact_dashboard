import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, Loader2, Wallet, Car, User, AlertCircle, MapPin, Calendar, Building2 } from 'lucide-react';
import { useClaimFeeCalculation, type ClaimFeeBreakdown } from '@/hooks/use-claim-fee-calculation';
import { CLASSIFICATION_LABELS, CLASSIFICATION_COLORS } from '@/types/classification';

interface AcceptSiteButtonProps {
  site: {
    id: string;
    site_name?: string;
    siteName?: string;
    state?: string;
    locality?: string;
    status?: string;
    transport_fee?: number;
    enumerator_fee?: number;
    cost?: number;
    due_date?: string;
    visitDate?: string;
    siteActivity?: string;
    activity_at_site?: string;
  };
  userId: string;
  onAccepted?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  isSmartAssigned?: boolean;
}

export function AcceptSiteButton({
  site,
  userId,
  onAccepted,
  disabled = false,
  variant = 'default',
  size = 'default',
  className = '',
  isSmartAssigned = false
}: AcceptSiteButtonProps) {
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [feeBreakdown, setFeeBreakdown] = useState<ClaimFeeBreakdown | null>(null);
  const { toast } = useToast();
  const { calculateFeeForClaim, loading: calculatingFee } = useClaimFeeCalculation();

  const siteName = site.site_name || site.siteName || 'Site';
  const siteStatus = site.status?.toLowerCase();
  const isAlreadyAccepted = siteStatus === 'accepted' || siteStatus === 'completed' || siteStatus === 'ongoing';
  const hasAcceptedBy = !!(site as any).accepted_by;
  const isDispatchedButClaimed = siteStatus === 'dispatched' && hasAcceptedBy;

  const handleInitiateAccept = async () => {
    if (accepting || accepted || disabled || isAlreadyAccepted || isDispatchedButClaimed) return;

    const breakdown = await calculateFeeForClaim(site.id, userId);
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

  const handleConfirmAccept = async () => {
    if (!feeBreakdown) return;

    setAccepting(true);
    setShowConfirmation(false);

    try {
      const isDispatchedSite = siteStatus === 'dispatched';

      if (isDispatchedSite) {
        const { data, error } = await supabase.rpc('claim_site_visit', {
          p_site_id: site.id,
          p_user_id: userId,
          p_enumerator_fee: feeBreakdown.enumeratorFee,
          p_total_cost: feeBreakdown.totalPayout,
          p_classification_level: feeBreakdown.classificationLevel || null,
          p_role_scope: feeBreakdown.roleScope || null,
          p_fee_source: feeBreakdown.feeSource
        });

        if (error) {
          console.error('Claim RPC error:', error);
          toast({
            title: 'Claim Failed',
            description: error.message || 'Could not claim this site. Please try again.',
            variant: 'destructive'
          });
          return;
        }

        const result = data as { success: boolean; error?: string; message: string };

        if (!result.success) {
          let description = result.message;
          
          if (result.error === 'ALREADY_CLAIMED') {
            description = 'Another enumerator claimed this site first. Try a different site.';
          } else if (result.error === 'CLAIM_IN_PROGRESS') {
            description = 'Someone else is claiming this site right now. Try again in a moment.';
          } else if (result.error === 'INVALID_STATUS') {
            description = 'This site is no longer available for claiming.';
          }

          toast({
            title: 'Could Not Claim Site',
            description,
            variant: 'destructive'
          });
          return;
        }
      } else {
        const now = new Date().toISOString();
        const { error } = await supabase
          .from('mmp_site_entries')
          .update({
            status: 'accepted',
            accepted_by: userId,
            accepted_at: now,
            updated_at: now,
            enumerator_fee: feeBreakdown.enumeratorFee,
            transport_fee: feeBreakdown.transportBudget,
            cost: feeBreakdown.totalPayout
          })
          .eq('id', site.id);

        if (error) {
          console.error('Database update failed:', error);
          throw error;
        }
      }

      setAccepted(true);
      toast({
        title: isDispatchedSite ? 'Site Claimed!' : 'Site Accepted!',
        description: `Your fee: ${feeBreakdown.enumeratorFee.toLocaleString()} SDG + Transport: ${feeBreakdown.transportBudget.toLocaleString()} SDG = ${feeBreakdown.totalPayout.toLocaleString()} SDG`,
        variant: 'default'
      });
      onAccepted?.();
    } catch (err) {
      console.error('Accept error:', err);
      toast({
        title: 'Accept Failed',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setAccepting(false);
    }
  };

  if (accepted || isAlreadyAccepted || isDispatchedButClaimed) {
    return (
      <Button
        variant="outline"
        size={size}
        className={`bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 ${className}`}
        disabled
        data-testid={`button-accepted-${site.id}`}
      >
        <CheckCircle className="h-4 w-4 mr-2" />
        {isAlreadyAccepted ? 'Accepted' : isDispatchedButClaimed ? 'Claimed' : (siteStatus === 'dispatched' ? 'Claimed' : 'Accepted')}
      </Button>
    );
  }

  const buttonText = siteStatus === 'dispatched' 
    ? 'Claim Site' 
    : isSmartAssigned 
      ? 'Accept Assignment' 
      : 'Accept Site';

  const dialogTitle = siteStatus === 'dispatched'
    ? 'Confirm Site Claim'
    : 'Confirm Site Acceptance';

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleInitiateAccept}
        disabled={accepting || disabled || calculatingFee}
        className={className}
        data-testid={`button-accept-${site.id}`}
      >
        {accepting || calculatingFee ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {calculatingFee ? 'Calculating...' : 'Processing...'}
          </>
        ) : (
          <>
            <CheckCircle className="h-4 w-4 mr-2" />
            {buttonText}
          </>
        )}
      </Button>

      <Dialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              {dialogTitle}
            </DialogTitle>
            <DialogDescription>
              Review site details and your payment breakdown before accepting
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-base">{siteName}</p>
                  <p className="text-sm text-muted-foreground">
                    {site.state || '—'}, {site.locality || '—'}
                  </p>
                </div>
              </div>
              
              {(site.due_date || site.visitDate) && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    Visit Date: {site.due_date || site.visitDate || '—'}
                  </span>
                </div>
              )}

              {(site.siteActivity || site.activity_at_site) && (
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    Activity: {site.siteActivity || site.activity_at_site || '—'}
                  </span>
                </div>
              )}
            </div>

            {feeBreakdown && (
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
                      <span className="text-sm">Your Collector Fee</span>
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
                  This amount will be credited to your account after completing the site visit.
                </p>
              </>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowConfirmation(false)}
              data-testid="button-cancel-accept"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAccept}
              disabled={accepting}
              className="bg-primary"
              data-testid="button-confirm-accept"
            >
              {accepting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {siteStatus === 'dispatched' ? 'Confirm Claim' : 'Confirm Accept'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AcceptSiteButton;
