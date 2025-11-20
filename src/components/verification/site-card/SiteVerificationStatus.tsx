
import { CheckCircle, XCircle, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface SiteVerificationStatusProps {
  status: 'verified' | 'rejected' | null;
}

export const SiteVerificationStatus = ({ status }: SiteVerificationStatusProps) => {
  switch (status) {
    case 'verified':
      return (
        <Badge variant="success" className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4" />
          Verified
        </Badge>
      );
    case 'rejected':
      return (
        <Badge variant="destructive" className="flex items-center gap-2">
          <XCircle className="h-4 w-4" />
          Rejected
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Pending
        </Badge>
      );
  }
};
