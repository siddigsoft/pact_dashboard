
import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, Clock, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { MMPStatus } from '@/types';

interface MMPStatusBadgeProps {
  status: MMPStatus | string;
  reason?: string;
}

export const MMPStatusBadge: React.FC<MMPStatusBadgeProps> = ({ status, reason }) => {
  const getStatusConfig = () => {
    const statusLower = (status || '').toLowerCase();
    
    if (statusLower === 'returned_to_fom' || statusLower === 'returned') {
      return {
        icon: <RotateCcw className="h-3 w-3 mr-1" />,
        text: 'Returned',
        variant: 'warning' as const
      };
    }
    
    if (statusLower === 'recalled') {
      return {
        icon: <RotateCcw className="h-3 w-3 mr-1" />,
        text: 'Recalled',
        variant: 'warning' as const
      };
    }
    
    switch (status) {
      case 'verified':
        return {
          icon: <CheckCircle className="h-3 w-3 mr-1" />,
          text: 'Verified',
          variant: 'default' as const
        };
      case 'approved':
        return {
          icon: <CheckCircle className="h-3 w-3 mr-1" />,
          text: 'Approved',
          variant: 'success' as const
        };
      case 'rejected':
        return {
          icon: <XCircle className="h-3 w-3 mr-1" />,
          text: 'Rejected',
          variant: 'destructive' as const
        };
      case 'archived':
        return {
          icon: <Clock className="h-3 w-3 mr-1" />,
          text: 'Archived',
          variant: 'secondary' as const
        };
      case 'deleted':
        return {
          icon: <XCircle className="h-3 w-3 mr-1" />,
          text: 'Deleted',
          variant: 'destructive' as const
        };
      case 'pending':
      default:
        return {
          icon: <AlertTriangle className="h-3 w-3 mr-1" />,
          text: 'Pending',
          variant: 'warning' as const
        };
    }
  };

  const { icon, text, variant } = getStatusConfig();

  return (
    <div className="inline-flex flex-col items-start gap-0.5">
      <Badge variant={variant} className="flex items-center">
        {icon}
        {text}
      </Badge>
      {reason && (
        <p className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]" title={reason}>
          {reason}
        </p>
      )}
    </div>
  );
};
