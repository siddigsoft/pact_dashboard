import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  XCircle, 
  Shield, 
  ShieldCheck,
  ShieldX,
  Fingerprint,
  PenLine,
  Mail,
  Phone
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SignatureStatus, SignatureMethod } from '@/types/signature';

interface SignatureVerificationBadgeProps {
  status: SignatureStatus;
  method?: SignatureMethod;
  signedAt?: string;
  verifiedAt?: string;
  signerName?: string;
  showDetails?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const statusConfig: Record<SignatureStatus, {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon: React.ElementType;
  color: string;
}> = {
  pending: {
    label: 'Pending Signature',
    variant: 'outline',
    icon: Clock,
    color: 'text-yellow-600 dark:text-yellow-400',
  },
  signed: {
    label: 'Signed',
    variant: 'secondary',
    icon: PenLine,
    color: 'text-blue-600 dark:text-blue-400',
  },
  verified: {
    label: 'Verified',
    variant: 'default',
    icon: ShieldCheck,
    color: 'text-green-600 dark:text-green-400',
  },
  expired: {
    label: 'Expired',
    variant: 'destructive',
    icon: AlertCircle,
    color: 'text-orange-600 dark:text-orange-400',
  },
  revoked: {
    label: 'Revoked',
    variant: 'destructive',
    icon: ShieldX,
    color: 'text-red-600 dark:text-red-400',
  },
  invalid: {
    label: 'Invalid',
    variant: 'destructive',
    icon: XCircle,
    color: 'text-red-600 dark:text-red-400',
  },
};

const methodIcons: Record<SignatureMethod, React.ElementType> = {
  uuid: Shield,
  phone: Phone,
  email: Mail,
  handwriting: PenLine,
  biometric: Fingerprint,
};

export function SignatureVerificationBadge({
  status,
  method,
  signedAt,
  verifiedAt,
  signerName,
  showDetails = false,
  size = 'md',
  className,
}: SignatureVerificationBadgeProps) {
  const config = statusConfig[status];
  const StatusIcon = config.icon;
  const MethodIcon = method ? methodIcons[method] : null;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const badge = (
    <Badge
      variant={config.variant}
      className={cn(
        'gap-1.5 font-medium',
        sizeClasses[size],
        className
      )}
    >
      <StatusIcon className={cn(iconSizes[size], config.color)} />
      <span>{config.label}</span>
      {method && MethodIcon && (
        <MethodIcon className={cn(iconSizes[size], 'opacity-70')} />
      )}
    </Badge>
  );

  if (!showDetails) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {badge}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-1.5 text-sm">
          <div className="font-medium flex items-center gap-1.5">
            <StatusIcon className={cn('h-4 w-4', config.color)} />
            {config.label}
          </div>
          {signerName && (
            <div className="text-muted-foreground">
              Signed by: <span className="font-medium">{signerName}</span>
            </div>
          )}
          {method && (
            <div className="text-muted-foreground capitalize">
              Method: {method.replace('_', ' ')}
            </div>
          )}
          {signedAt && (
            <div className="text-muted-foreground">
              Signed: {formatDate(signedAt)}
            </div>
          )}
          {verifiedAt && (
            <div className="text-muted-foreground">
              Verified: {formatDate(verifiedAt)}
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function SignatureRequiredBadge({ 
  className,
  size = 'sm' 
}: { 
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <Badge 
      variant="outline" 
      className={cn(
        'gap-1 border-amber-500/50 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
        sizeClasses[size],
        className
      )}
    >
      <PenLine className="h-3 w-3" />
      Signature Required
    </Badge>
  );
}

export default SignatureVerificationBadge;