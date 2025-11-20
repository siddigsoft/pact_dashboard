
import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { MMPStatus } from '@/types';

interface MMPStatusBadgeProps {
  status: MMPStatus;
}

export const MMPStatusBadge: React.FC<MMPStatusBadgeProps> = ({ status }) => {
  const getStatusConfig = () => {
    switch (status) {
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
    <Badge variant={variant} className="flex items-center">
      {icon}
      {text}
    </Badge>
  );
};
