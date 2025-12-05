import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Check, 
  X, 
  Clock, 
  AlertCircle, 
  ChevronDown, 
  ChevronUp,
  User,
  DollarSign,
  FileText,
  MapPin,
  Calendar,
  MessageSquare,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { format, formatDistanceToNow } from 'date-fns';

type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'review';
type ApprovalType = 'payment' | 'expense' | 'leave' | 'document' | 'visit' | 'other';

interface ApprovalRequest {
  id: string;
  type: ApprovalType;
  title: string;
  description?: string;
  amount?: number;
  currency?: string;
  requester: {
    name: string;
    avatar?: string;
    role?: string;
  };
  submittedAt: Date;
  status: ApprovalStatus;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  attachments?: number;
  comments?: number;
  metadata?: Record<string, any>;
  approvers?: Array<{
    name: string;
    avatar?: string;
    status: 'pending' | 'approved' | 'rejected';
    timestamp?: Date;
  }>;
}

interface MobileApprovalCardProps {
  request: ApprovalRequest;
  onApprove?: (id: string, comment?: string) => Promise<void>;
  onReject?: (id: string, reason?: string) => Promise<void>;
  onViewDetails?: (request: ApprovalRequest) => void;
  showActions?: boolean;
  className?: string;
}

export function MobileApprovalCard({
  request,
  onApprove,
  onReject,
  onViewDetails,
  showActions = true,
  className,
}: MobileApprovalCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const getTypeIcon = () => {
    const iconClass = "h-5 w-5";
    switch (request.type) {
      case 'payment':
        return <DollarSign className={iconClass} />;
      case 'expense':
        return <DollarSign className={iconClass} />;
      case 'document':
        return <FileText className={iconClass} />;
      case 'visit':
        return <MapPin className={iconClass} />;
      case 'leave':
        return <Calendar className={iconClass} />;
      default:
        return <FileText className={iconClass} />;
    }
  };

  const getStatusBadge = () => {
    switch (request.status) {
      case 'pending':
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-black/10 dark:bg-white/10 text-black dark:text-white">
            Pending
          </span>
        );
      case 'approved':
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-black dark:bg-white text-white dark:text-black">
            Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
            Rejected
          </span>
        );
      case 'review':
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-black/20 dark:bg-white/20 text-black dark:text-white">
            In Review
          </span>
        );
    }
  };

  const getPriorityIndicator = () => {
    switch (request.priority) {
      case 'urgent':
        return <div className="w-2 h-2 rounded-full bg-destructive" />;
      case 'high':
        return <div className="w-2 h-2 rounded-full bg-black dark:bg-white" />;
      default:
        return null;
    }
  };

  const handleApprove = useCallback(async () => {
    if (isApproving || !onApprove) return;
    
    hapticPresets.success();
    setIsApproving(true);
    try {
      await onApprove(request.id);
    } finally {
      setIsApproving(false);
    }
  }, [isApproving, onApprove, request.id]);

  const handleReject = useCallback(async () => {
    if (isRejecting || !onReject) return;
    
    if (!showRejectReason) {
      setShowRejectReason(true);
      return;
    }

    hapticPresets.warning();
    setIsRejecting(true);
    try {
      await onReject(request.id, rejectReason);
      setShowRejectReason(false);
      setRejectReason('');
    } finally {
      setIsRejecting(false);
    }
  }, [isRejecting, onReject, request.id, showRejectReason, rejectReason]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <motion.div
      className={cn(
        "rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden bg-white dark:bg-neutral-900",
        className
      )}
      data-testid={`approval-card-${request.id}`}
    >
      <button
        className="w-full p-4 text-left touch-manipulation"
        onClick={() => {
          hapticPresets.selection();
          onViewDetails?.(request);
        }}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center flex-shrink-0">
            {getTypeIcon()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {getPriorityIndicator()}
              <span className="text-xs text-black/40 dark:text-white/40 capitalize">
                {request.type}
              </span>
              {getStatusBadge()}
            </div>

            <h3 className="text-sm font-semibold text-black dark:text-white mb-1">
              {request.title}
            </h3>

            {request.description && (
              <p className="text-sm text-black/60 dark:text-white/60 line-clamp-2 mb-2">
                {request.description}
              </p>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1">
                <div className="w-5 h-5 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center overflow-hidden">
                  {request.requester.avatar ? (
                    <img src={request.requester.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="h-3 w-3" />
                  )}
                </div>
                <span className="text-xs text-black/60 dark:text-white/60">
                  {request.requester.name}
                </span>
              </div>

              <span className="text-xs text-black/40 dark:text-white/40">
                {formatDistanceToNow(request.submittedAt, { addSuffix: true })}
              </span>

              {request.attachments && request.attachments > 0 && (
                <span className="text-xs text-black/40 dark:text-white/40 flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {request.attachments}
                </span>
              )}

              {request.comments && request.comments > 0 && (
                <span className="text-xs text-black/40 dark:text-white/40 flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {request.comments}
                </span>
              )}
            </div>
          </div>

          {request.amount !== undefined && (
            <div className="text-right flex-shrink-0">
              <p className="text-lg font-bold text-black dark:text-white">
                {formatCurrency(request.amount)}
              </p>
              <p className="text-xs text-black/40 dark:text-white/40">
                {request.currency || 'SDG'}
              </p>
            </div>
          )}
        </div>
      </button>

      {request.approvers && request.approvers.length > 0 && (
        <div className="px-4 pb-2">
          <button
            className="flex items-center gap-1 text-xs text-black/40 dark:text-white/40"
            onClick={() => {
              hapticPresets.selection();
              setIsExpanded(!isExpanded);
            }}
            data-testid="button-toggle-approvers"
          >
            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {request.approvers.length} approver{request.approvers.length > 1 ? 's' : ''}
          </button>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-2 space-y-2">
                  {request.approvers.map((approver, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center overflow-hidden">
                        {approver.avatar ? (
                          <img src={approver.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User className="h-3 w-3" />
                        )}
                      </div>
                      <span className="text-xs text-black/80 dark:text-white/80 flex-1">
                        {approver.name}
                      </span>
                      <span className={cn(
                        "text-xs",
                        approver.status === 'approved' && "text-black dark:text-white",
                        approver.status === 'rejected' && "text-destructive",
                        approver.status === 'pending' && "text-black/40 dark:text-white/40"
                      )}>
                        {approver.status === 'approved' && <Check className="h-3 w-3" />}
                        {approver.status === 'rejected' && <X className="h-3 w-3" />}
                        {approver.status === 'pending' && <Clock className="h-3 w-3" />}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {showActions && request.status === 'pending' && (onApprove || onReject) && (
        <div className="border-t border-black/5 dark:border-white/5 p-3">
          <AnimatePresence>
            {showRejectReason && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mb-3"
              >
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection (optional)"
                  className="w-full p-3 rounded-xl bg-black/5 dark:bg-white/5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20"
                  rows={2}
                  data-testid="input-reject-reason"
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2">
            {onReject && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReject}
                disabled={isRejecting || isApproving}
                className="flex-1 rounded-full border-destructive text-destructive hover:bg-destructive/10"
                data-testid="button-reject"
              >
                {isRejecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <X className="h-4 w-4 mr-1" />
                    {showRejectReason ? 'Confirm Reject' : 'Reject'}
                  </>
                )}
              </Button>
            )}

            {showRejectReason && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowRejectReason(false);
                  setRejectReason('');
                }}
                className="rounded-full"
                data-testid="button-cancel-reject"
              >
                Cancel
              </Button>
            )}

            {onApprove && !showRejectReason && (
              <Button
                variant="default"
                size="sm"
                onClick={handleApprove}
                disabled={isApproving || isRejecting}
                className="flex-1 rounded-full bg-black dark:bg-white text-white dark:text-black"
                data-testid="button-approve"
              >
                {isApproving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Approve
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

interface ApprovalListProps {
  requests: ApprovalRequest[];
  onApprove?: (id: string) => Promise<void>;
  onReject?: (id: string, reason?: string) => Promise<void>;
  onViewDetails?: (request: ApprovalRequest) => void;
  emptyMessage?: string;
  className?: string;
}

export function ApprovalList({
  requests,
  onApprove,
  onReject,
  onViewDetails,
  emptyMessage = 'No pending approvals',
  className,
}: ApprovalListProps) {
  if (requests.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
        <Check className="h-12 w-12 text-black/20 dark:text-white/20 mb-4" />
        <p className="text-sm text-black/60 dark:text-white/60">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)} data-testid="approval-list">
      {requests.map((request) => (
        <MobileApprovalCard
          key={request.id}
          request={request}
          onApprove={onApprove}
          onReject={onReject}
          onViewDetails={onViewDetails}
        />
      ))}
    </div>
  );
}

interface ApprovalBadgeProps {
  count: number;
  className?: string;
}

export function ApprovalBadge({ count, className }: ApprovalBadgeProps) {
  if (count === 0) return null;

  return (
    <span 
      className={cn(
        "min-w-[18px] h-[18px] px-1 rounded-full bg-black dark:bg-white text-white dark:text-black text-[10px] font-bold flex items-center justify-center",
        className
      )}
      data-testid="approval-badge"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
