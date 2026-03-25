import { useState, useCallback } from 'react';
import { Shield, CheckCircle, Clock, Edit, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  SignatureConfirmationModal, 
  SignatureVerificationBadge,
} from '@/components/signatures';
import { SignatureService } from '@/services/signature.service';
import type { DocumentSignature, SignatureStatus as SigStatus, SignatureMethod } from '@/types/signature';
import { useToast } from '@/shared/hooks/use-toast';

interface CostSubmission {
  id: string;
  type?: string;
  siteVisitId?: string;
  projectId?: string;
  submittedBy?: string;
  amount: number;
  currency?: string;
  status: string;
  createdAt?: string;
  description?: string;
  approvalNotes?: string;
  signatureStatus?: SigStatus;
  signatureId?: string;
}

interface CostSubmissionSignatureProps {
  submission: CostSubmission;
  userId: string;
  userName: string;
  userEmail?: string;
  userRole?: string;
  isApprover?: boolean;
  onSignatureComplete?: (signature: DocumentSignature) => void;
  variant?: 'inline' | 'card';
  showBadgeOnly?: boolean;
}

export function CostSubmissionSignature({
  submission,
  userId,
  userName,
  userEmail,
  userRole,
  isApprover = false,
  onSignatureComplete,
  variant = 'inline',
  showBadgeOnly = false,
}: CostSubmissionSignatureProps) {
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [signatureStatus, setSignatureStatus] = useState<SigStatus | undefined>(
    submission.signatureStatus
  );

  // Approvers need to sign when approving, submitters sign when submitting
  const needsApproverSignature = isApprover && (submission.status === 'pending' || submission.status === 'under_review');
  const needsSubmitterSignature = !isApprover && submission.status === 'draft';
  const requiresSignature = needsApproverSignature || needsSubmitterSignature;
  const hasSigned = signatureStatus === 'signed' || signatureStatus === 'verified';

  // Badge only mode for compact display in lists
  if (showBadgeOnly) {
    if (!requiresSignature && !hasSigned) return null;
    
    return (
      <SignatureVerificationBadge
        status={signatureStatus || 'pending'}
        size="sm"
        showDetails={false}
      />
    );
  }

  if (!requiresSignature && !hasSigned) return null;

  const signatureContent = (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-medium">
          {isApprover ? 'Approval Signature' : 'Submission Signature'}
        </span>
      </div>
      
      {hasSigned ? (
        <SignatureVerificationBadge
          status={signatureStatus || 'signed'}
          size="sm"
          showDetails
        />
      ) : (
        <>
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400">
            <Clock className="w-3 h-3 mr-1" />
            Signature Required
          </Badge>
          <Button
            size="sm"
            onClick={() => setIsModalOpen(true)}
            disabled={false}
            data-testid="button-sign-cost-submission"
          >
            <Edit className="w-3 h-3 mr-1" />
            {isApprover ? 'Sign to Approve' : 'Sign & Submit'}
          </Button>
        </>
      )}

      <SignatureConfirmationModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        transaction={{
          id: submission.id,
          type: 'cost_submission',
          title: `Cost Submission #${submission.id.slice(0, 8)}`,
          description: isApprover 
            ? 'By signing, you approve this cost submission for payment.'
            : 'By signing, you certify these expenses are accurate.',
          amount: submission.amount,
          currency: submission.currency || 'SDG',
          date: submission.createdAt,
        }}
        userId={userId}
        userName={userName}
        userEmail={userEmail}
        userRole={userRole}
        allowedMethods={['uuid', 'handwriting', 'email']}
        onSignatureComplete={(result) => {
          setSignatureStatus('signed');
          toast({
            title: isApprover ? 'Approval Signed' : 'Submission Signed',
            description: 'Your digital signature has been recorded.',
          });
          setIsModalOpen(false);
        }}
      />
    </div>
  );

  if (variant === 'card') {
    return (
      <Card className="border-blue-200 dark:border-blue-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Digital Signature
          </CardTitle>
        </CardHeader>
        <CardContent>
          {signatureContent}
        </CardContent>
      </Card>
    );
  }

  return signatureContent;
}

// Signature status badge for cost submission lists
interface CostSubmissionSignatureBadgeProps {
  signatureStatus?: SigStatus;
  signatureMethod?: SignatureMethod;
}

export function CostSubmissionSignatureBadge({ 
  signatureStatus, 
  signatureMethod 
}: CostSubmissionSignatureBadgeProps) {
  if (!signatureStatus) {
    return (
      <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-900/20">
        <Clock className="w-3 h-3 mr-1" />
        Pending
      </Badge>
    );
  }

  return (
    <SignatureVerificationBadge
      status={signatureStatus}
      method={signatureMethod}
      size="sm"
    />
  );
}

export default CostSubmissionSignature;