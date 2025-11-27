import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Hand, Loader2, CheckCircle } from 'lucide-react';

interface ClaimSiteButtonProps {
  siteId: string;
  siteName: string;
  userId: string;
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
  onClaimed,
  disabled = false,
  variant = 'default',
  size = 'default',
  className = ''
}: ClaimSiteButtonProps) {
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const { toast } = useToast();

  const handleClaim = async () => {
    if (claiming || claimed || disabled) return;

    setClaiming(true);
    try {
      const { data, error } = await supabase.rpc('claim_site_visit', {
        p_site_id: siteId,
        p_user_id: userId
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

      const result = data as { success: boolean; error?: string; message: string; site_name?: string };

      if (result.success) {
        setClaimed(true);
        toast({
          title: 'Site Claimed!',
          description: result.message,
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

        toast({
          title: 'Could Not Claim Site',
          description,
          variant: 'destructive'
        });
      }
    } catch (err) {
      console.error('Claim error:', err);
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

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClaim}
      disabled={claiming || disabled}
      className={`bg-primary hover:bg-primary/90 ${className}`}
      data-testid={`button-claim-${siteId}`}
    >
      {claiming ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Claiming...
        </>
      ) : (
        <>
          <Hand className="h-4 w-4 mr-2" />
          Claim Site
        </>
      )}
    </Button>
  );
}

export default ClaimSiteButton;
