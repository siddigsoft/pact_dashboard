import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Clock, CheckCircle, XCircle } from 'lucide-react';
import { DownPaymentRequestDialog } from '@/components/downPayment/DownPaymentRequestDialog';
import { useDownPayment } from '@/context/downPayment/DownPaymentContext';

interface RequestDownPaymentButtonProps {
  site: {
    id: string;
    site_name?: string;
    siteName?: string;
    transport_fee?: number;
    transportFee?: number;
    hub_id?: string;
    hubId?: string;
    hub_name?: string;
    hubName?: string;
    hub_office?: string;
    hubOffice?: string;
    status?: string;
  };
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export function RequestDownPaymentButton({
  site,
  variant = 'outline',
  size = 'sm',
  className = ''
}: RequestDownPaymentButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { requests } = useDownPayment();

  const siteName = site.site_name || site.siteName || 'Site';
  const transportBudget = site.transport_fee || site.transportFee || 0;
  const hubId = site.hub_id || site.hubId;
  const hubName = site.hub_name || site.hubName || site.hub_office || site.hubOffice;

  const existingRequest = requests.find(
    r => r.mmpSiteEntryId === site.id || r.siteVisitId === site.id
  );

  if (transportBudget <= 0) {
    return null;
  }

  if (existingRequest) {
    const statusConfig: Record<string, { icon: any; variant: any; label: string }> = {
      pending_supervisor: { icon: Clock, variant: 'secondary', label: 'Pending Supervisor' },
      pending_admin: { icon: Clock, variant: 'default', label: 'Pending Admin' },
      approved: { icon: CheckCircle, variant: 'default', label: 'Approved' },
      rejected: { icon: XCircle, variant: 'destructive', label: 'Rejected' },
      partially_paid: { icon: DollarSign, variant: 'default', label: 'Partial Payment' },
      fully_paid: { icon: CheckCircle, variant: 'default', label: 'Paid' },
    };

    const config = statusConfig[existingRequest.status] || { icon: Clock, variant: 'secondary', label: existingRequest.status };
    const Icon = config.icon;

    return (
      <Badge variant={config.variant as any} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setDialogOpen(true)}
        className={`gap-1 ${className}`}
        data-testid={`button-request-downpayment-${site.id}`}
      >
        <DollarSign className="h-4 w-4" />
        Request Advance
      </Button>

      <DownPaymentRequestDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mmpSiteEntryId={site.id}
        siteName={siteName}
        transportationBudget={transportBudget}
        hubId={hubId}
        hubName={hubName}
      />
    </>
  );
}

export default RequestDownPaymentButton;
