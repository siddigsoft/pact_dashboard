
import { CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SiteVerificationActionsProps {
  currentStatus: 'verified' | 'rejected' | null;
  onVerifyClick: (action: 'verified' | 'rejected') => void;
}

export const SiteVerificationActions = ({ currentStatus, onVerifyClick }: SiteVerificationActionsProps) => {
  return (
    <div className="flex justify-end gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onVerifyClick('verified')}
        disabled={currentStatus === 'verified'}
        className="border-green-300 text-green-700 hover:bg-green-50"
      >
        <CheckCircle className="h-4 w-4 mr-1" />
        Verify
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onVerifyClick('rejected')}
        disabled={currentStatus === 'rejected'}
        className="border-red-300 text-red-700 hover:bg-red-50"
      >
        <XCircle className="h-4 w-4 mr-1" />
        Reject
      </Button>
    </div>
  );
};
