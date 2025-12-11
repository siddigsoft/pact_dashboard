/**
 * MobileSiteVisitSignature Component
 * Signature capture integration for site visit completion
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileSignature, 
  MapPin, 
  Calendar,
  User,
  CheckCircle2,
  Clock,
  Camera,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { MobileFullScreenSignature, SignatureResult } from './MobileFullScreenSignature';
import { format } from 'date-fns';

interface SiteVisitData {
  id: string;
  siteName: string;
  siteCode?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  visitDate: string;
  collectorName: string;
  status: 'in_progress' | 'pending_signature' | 'completed';
  notes?: string;
}

interface MobileSiteVisitSignatureProps {
  siteVisit: SiteVisitData;
  onSignatureComplete: (visitId: string, signature: SignatureResult) => Promise<void>;
  onSkip?: () => void;
  offline?: boolean;
  className?: string;
}

export function MobileSiteVisitSignature({
  siteVisit,
  onSignatureComplete,
  onSkip,
  offline = false,
  className,
}: MobileSiteVisitSignatureProps) {
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const handleOpenSignature = () => {
    hapticPresets.buttonPress();
    setShowSignaturePad(true);
  };

  const handleSignatureComplete = async (signature: SignatureResult) => {
    setIsSubmitting(true);
    try {
      await onSignatureComplete(siteVisit.id, signature);
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
          Visit Completed
        </h3>
        <p className="text-sm text-black/60 dark:text-white/60">
          Your signature has been recorded
        </p>
      </motion.div>
    );
  }

  return (
    <>
      <div className={cn("space-y-4", className)}>
        {/* Visit Summary */}
        <div className="p-4 rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="font-semibold text-black dark:text-white">
                {siteVisit.siteName}
              </h3>
              {siteVisit.siteCode && (
                <p className="text-sm text-black/60 dark:text-white/60">
                  Code: {siteVisit.siteCode}
                </p>
              )}
            </div>
            <div className={cn(
              "px-3 py-1 rounded-full text-xs font-medium",
              siteVisit.status === 'pending_signature' 
                ? "bg-black dark:bg-white text-white dark:text-black"
                : "bg-black/10 dark:bg-white/10 text-black dark:text-white"
            )}>
              {siteVisit.status === 'pending_signature' ? 'Pending Signature' : 'In Progress'}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-black/60 dark:text-white/60">
              <Calendar className="h-4 w-4" />
              <span>{format(new Date(siteVisit.visitDate), 'MMM d, yyyy h:mm a')}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-black/60 dark:text-white/60">
              <User className="h-4 w-4" />
              <span>{siteVisit.collectorName}</span>
            </div>
            {siteVisit.location && (
              <div className="flex items-center gap-2 text-sm text-black/60 dark:text-white/60">
                <MapPin className="h-4 w-4" />
                <span>
                  {siteVisit.location.latitude.toFixed(6)}, {siteVisit.location.longitude.toFixed(6)}
                </span>
              </div>
            )}
          </div>

          {siteVisit.notes && (
            <div className="mt-4 p-3 rounded-lg bg-black/5 dark:bg-white/5">
              <p className="text-sm text-black/80 dark:text-white/80">{siteVisit.notes}</p>
            </div>
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
          data-testid="button-sign-visit"
          aria-label="Sign to complete visit"
        >
          {isSubmitting ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <>
              <FileSignature className="h-6 w-6" />
              <span>Sign to Complete Visit</span>
            </>
          )}
        </button>

        {onSkip && (
          <button
            onClick={() => {
              hapticPresets.buttonPress();
              onSkip();
            }}
            className={cn(
              "w-full py-3 rounded-full text-black/60 dark:text-white/60",
              "font-medium min-h-[44px]"
            )}
            data-testid="button-skip-signature"
            aria-label="Skip signature"
          >
            Skip for now
          </button>
        )}
      </div>

      {/* Full Screen Signature Pad */}
      <MobileFullScreenSignature
        isOpen={showSignaturePad}
        onClose={() => setShowSignaturePad(false)}
        onComplete={handleSignatureComplete}
        title="Complete Site Visit"
        description={`Sign to confirm visit to ${siteVisit.siteName}`}
        documentType="Site Visit"
        documentId={siteVisit.id}
        offline={offline}
      />
    </>
  );
}

export default MobileSiteVisitSignature;
