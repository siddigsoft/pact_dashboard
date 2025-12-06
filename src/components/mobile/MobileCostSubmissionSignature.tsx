/**
 * MobileCostSubmissionSignature Component
 * Signature capture integration for cost/expense submissions
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  FileSignature, 
  Receipt,
  DollarSign,
  Calendar,
  User,
  CheckCircle2,
  Camera,
  Loader2,
  Paperclip
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { MobileFullScreenSignature, SignatureResult } from './MobileFullScreenSignature';
import { format } from 'date-fns';

interface CostSubmissionData {
  id: string;
  category: string;
  description: string;
  amountCents: number;
  currency: string;
  submittedBy: string;
  submittedAt: string;
  receipts?: string[];
  status: 'draft' | 'pending_signature' | 'submitted' | 'approved' | 'rejected';
  projectName?: string;
  siteVisitId?: string;
}

interface MobileCostSubmissionSignatureProps {
  submission: CostSubmissionData;
  onSignatureComplete: (submissionId: string, signature: SignatureResult) => Promise<void>;
  onAddReceipt?: () => void;
  offline?: boolean;
  className?: string;
}

export function MobileCostSubmissionSignature({
  submission,
  onSignatureComplete,
  onAddReceipt,
  offline = false,
  className,
}: MobileCostSubmissionSignatureProps) {
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const formatAmount = (cents: number, currency: string) => {
    return `${currency} ${(cents / 100).toLocaleString()}`;
  };

  const handleOpenSignature = () => {
    hapticPresets.buttonPress();
    setShowSignaturePad(true);
  };

  const handleSignatureComplete = async (signature: SignatureResult) => {
    setIsSubmitting(true);
    try {
      await onSignatureComplete(submission.id, signature);
      setShowSignaturePad(false);
      setIsCompleted(true);
      hapticPresets.success();
    } catch (error) {
      console.error('Failed to submit signature:', error);
      hapticPresets.error();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCompleted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "p-6 rounded-2xl bg-black/5 dark:bg-white/5 text-center",
          className
        )}
      >
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-black dark:bg-white flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-white dark:text-black" />
        </div>
        <h3 className="font-semibold text-lg text-black dark:text-white mb-1">
          Expense Submitted
        </h3>
        <p className="text-sm text-black/60 dark:text-white/60">
          Your cost submission is pending approval
        </p>
      </motion.div>
    );
  }

  return (
    <>
      <div className={cn("space-y-4", className)}>
        {/* Submission Summary */}
        <div className="p-4 rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-black/60 dark:text-white/60" />
                <h3 className="font-semibold text-black dark:text-white">
                  {submission.category}
                </h3>
              </div>
              <p className="text-sm text-black/60 dark:text-white/60 mt-1">
                {submission.description}
              </p>
            </div>
            <div className="text-right">
              <p className="font-bold text-xl text-black dark:text-white">
                {formatAmount(submission.amountCents, submission.currency)}
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t border-black/10 dark:border-white/10">
            <div className="flex items-center gap-2 text-sm text-black/60 dark:text-white/60">
              <Calendar className="h-4 w-4" />
              <span>{format(new Date(submission.submittedAt), 'MMM d, yyyy')}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-black/60 dark:text-white/60">
              <User className="h-4 w-4" />
              <span>{submission.submittedBy}</span>
            </div>
            {submission.projectName && (
              <div className="flex items-center gap-2 text-sm text-black/60 dark:text-white/60">
                <DollarSign className="h-4 w-4" />
                <span>{submission.projectName}</span>
              </div>
            )}
          </div>

          {/* Receipts */}
          {submission.receipts && submission.receipts.length > 0 && (
            <div className="mt-4 pt-4 border-t border-black/10 dark:border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <Paperclip className="h-4 w-4 text-black/60 dark:text-white/60" />
                <span className="text-sm font-medium text-black dark:text-white">
                  {submission.receipts.length} Receipt{submission.receipts.length > 1 ? 's' : ''} Attached
                </span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {submission.receipts.map((receipt, index) => (
                  <div
                    key={index}
                    className="w-16 h-16 rounded-lg bg-black/5 dark:bg-white/5 flex-shrink-0 overflow-hidden"
                  >
                    <img src={receipt} alt={`Receipt ${index + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Receipt Button */}
          {onAddReceipt && (
            <button
              onClick={() => {
                hapticPresets.buttonPress();
                onAddReceipt();
              }}
              className={cn(
                "mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-full",
                "bg-black/5 dark:bg-white/5 text-black dark:text-white",
                "min-h-[44px]"
              )}
              data-testid="button-add-receipt"
              aria-label="Add receipt photo"
            >
              <Camera className="h-5 w-5" />
              <span>Add Receipt Photo</span>
            </button>
          )}
        </div>

        {/* Signature Action */}
        <button
          onClick={handleOpenSignature}
          disabled={isSubmitting}
          className={cn(
            "w-full flex items-center justify-center gap-3 py-4 rounded-full",
            "bg-black dark:bg-white text-white dark:text-black",
            "font-medium min-h-[56px] touch-manipulation"
          )}
          data-testid="button-sign-expense"
          aria-label="Sign and submit expense"
        >
          {isSubmitting ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <>
              <FileSignature className="h-6 w-6" />
              <span>Sign & Submit Expense</span>
            </>
          )}
        </button>

        <p className="text-xs text-center text-black/40 dark:text-white/40">
          By signing, you confirm that this expense is accurate and legitimate
        </p>
      </div>

      {/* Full Screen Signature Pad */}
      <MobileFullScreenSignature
        isOpen={showSignaturePad}
        onClose={() => setShowSignaturePad(false)}
        onComplete={handleSignatureComplete}
        title="Submit Expense"
        description={`Sign to submit ${formatAmount(submission.amountCents, submission.currency)} expense`}
        documentType="Cost Submission"
        documentId={submission.id}
        offline={offline}
      />
    </>
  );
}

export default MobileCostSubmissionSignature;
