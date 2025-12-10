/**
 * MobileRetainerCard Component
 * Mobile-optimized retainer status cards with swipe actions and quick approval
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { 
  DollarSign, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  ArrowUpRight,
  ChevronRight,
  FileSignature,
  XCircle,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { format, differenceInDays } from 'date-fns';
import type { Retainer, RetainerStatus, RetainerPriority } from '@/types/retainer';

interface MobileRetainerCardProps {
  retainer: Retainer;
  onApprove?: (retainer: Retainer) => void;
  onRelease?: (retainer: Retainer) => void;
  onViewDetails?: (retainer: Retainer) => void;
  canApprove?: boolean;
  className?: string;
}

const statusConfig: Record<RetainerStatus, { label: string; icon: typeof Clock; bgClass: string }> = {
  pending: { label: 'Pending', icon: Clock, bgClass: 'bg-black/10 dark:bg-white/10' },
  approved: { label: 'Approved', icon: CheckCircle2, bgClass: 'bg-black/20 dark:bg-white/20' },
  released: { label: 'Released', icon: ArrowUpRight, bgClass: 'bg-black/5 dark:bg-white/5' },
  expired: { label: 'Expired', icon: AlertTriangle, bgClass: 'bg-black/30 dark:bg-white/30' },
  cancelled: { label: 'Cancelled', icon: XCircle, bgClass: 'bg-black/5 dark:bg-white/5' },
};

const priorityConfig: Record<RetainerPriority, { label: string; dotClass: string }> = {
  low: { label: 'Low', dotClass: 'bg-black/20 dark:bg-white/20' },
  normal: { label: 'Normal', dotClass: 'bg-black/40 dark:bg-white/40' },
  high: { label: 'High', dotClass: 'bg-black/60 dark:bg-white/60' },
  urgent: { label: 'Urgent', dotClass: 'bg-black dark:bg-white' },
};

export function MobileRetainerCard({
  retainer,
  onApprove,
  onRelease,
  onViewDetails,
  canApprove = false,
  className,
}: MobileRetainerCardProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const config = statusConfig[retainer.status];
  const priorityCfg = priorityConfig[retainer.priority];
  const StatusIcon = config.icon;

  const daysUntilExpiry = retainer.expiresAt 
    ? differenceInDays(new Date(retainer.expiresAt), new Date())
    : null;

  const formatAmount = (cents: number, currency: string) => {
    return `${currency} ${(cents / 100).toLocaleString()}`;
  };

  const handlePan = useCallback((event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (!canApprove) return;
    setSwipeOffset(info.offset.x);
  }, [canApprove]);

  const handlePanEnd = useCallback((event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (!canApprove) return;

    const threshold = 100;
    
    if (info.offset.x > threshold && retainer.status === 'pending' && onApprove) {
      hapticPresets.success();
      onApprove(retainer);
    } else if (info.offset.x < -threshold && retainer.status === 'approved' && onRelease) {
      hapticPresets.success();
      onRelease(retainer);
    }
    
    setSwipeOffset(0);
  }, [canApprove, retainer, onApprove, onRelease]);

  const handleQuickApprove = async () => {
    if (!onApprove || isProcessing) return;
    setIsProcessing(true);
    hapticPresets.buttonPress();
    
    try {
      await onApprove(retainer);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTap = () => {
    hapticPresets.selection();
    onViewDetails?.(retainer);
  };

  return (
    <motion.div
      className={cn("relative overflow-hidden", className)}
      data-testid={`mobile-retainer-card-${retainer.id}`}
    >
      {/* Swipe action backgrounds */}
      {canApprove && (
        <>
          <div className="absolute inset-y-0 left-0 w-24 bg-black dark:bg-white flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-white dark:text-black" />
          </div>
          <div className="absolute inset-y-0 right-0 w-24 bg-black dark:bg-white flex items-center justify-center">
            <ArrowUpRight className="h-6 w-6 text-white dark:text-black" />
          </div>
        </>
      )}

      {/* Main card content */}
      <motion.div
        className={cn(
          "relative bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 rounded-2xl p-4",
          "touch-manipulation"
        )}
        style={{ x: swipeOffset }}
        onPan={handlePan}
        onPanEnd={handlePanEnd}
        onTap={handleTap}
        whileTap={{ scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-black dark:text-white truncate">
                {retainer.userName}
              </span>
              <div className={cn("w-2 h-2 rounded-full", priorityCfg.dotClass)} />
            </div>
            {retainer.projectName && (
              <p className="text-sm text-black/60 dark:text-white/60 truncate mt-0.5">
                {retainer.projectName}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="font-bold text-lg text-black dark:text-white">
              {formatAmount(retainer.amountCents, retainer.currency)}
            </p>
            <div className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs", config.bgClass)}>
              <StatusIcon className="h-3 w-3" />
              <span>{config.label}</span>
            </div>
          </div>
        </div>

        {/* Reason */}
        {retainer.holdReason && (
          <p className="text-sm text-black/80 dark:text-white/80 mb-3 line-clamp-2">
            {retainer.holdReason}
          </p>
        )}

        {/* Expiry warning */}
        {daysUntilExpiry !== null && daysUntilExpiry <= 7 && daysUntilExpiry >= 0 && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-black/5 dark:bg-white/5 mb-3">
            <AlertTriangle className="h-4 w-4 text-black/60 dark:text-white/60" />
            <span className="text-sm text-black/60 dark:text-white/60">
              Expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-black/10 dark:border-white/10">
          <span className="text-xs text-black/40 dark:text-white/40">
            {format(new Date(retainer.createdAt), 'MMM d, yyyy')}
          </span>
          
          <div className="flex items-center gap-2">
            {canApprove && retainer.status === 'pending' && onApprove && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleQuickApprove();
                }}
                disabled={isProcessing}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-full",
                  "bg-black dark:bg-white text-white dark:text-black",
                  "text-sm font-medium min-h-[44px] touch-manipulation"
                )}
                data-testid={`button-quick-approve-${retainer.id}`}
                aria-label={`Quick approve retainer for ${retainer.userName}`}
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <FileSignature className="h-4 w-4" />
                    <span>Approve</span>
                  </>
                )}
              </button>
            )}
            
            {canApprove && retainer.status === 'approved' && onRelease && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRelease(retainer);
                }}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-full",
                  "bg-black/10 dark:bg-white/10 text-black dark:text-white",
                  "text-sm font-medium min-h-[44px] touch-manipulation"
                )}
                data-testid={`button-release-${retainer.id}`}
                aria-label={`Release retainer for ${retainer.userName}`}
              >
                <ArrowUpRight className="h-4 w-4" />
                <span>Release</span>
              </button>
            )}
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleTap();
              }}
              className="p-2 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center"
              data-testid={`button-details-${retainer.id}`}
              aria-label={`View details for ${retainer.userName}`}
            >
              <ChevronRight className="h-5 w-5 text-black/40 dark:text-white/40" />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default MobileRetainerCard;
