import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone, AlertTriangle, Lock, ExternalLink, CheckCircle2 } from 'lucide-react';
import { useNotifications } from '@/context/notifications/NotificationContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * GlobalBroadcastAlert
 *
 * Renders a full-screen blocking overlay whenever a high- or urgent-priority
 * broadcast notification is in the queue.  Mirrors the behaviour of the mobile
 * _showBlockingBroadcast() dialog in main.dart:
 *
 *  - PACT navy gradient header with priority badge
 *  - Bilingual title + message
 *  - "Open Action" button (routes to notification.link when present)
 *  - "Acknowledge" button (marks read, removes from queue, shows next)
 *  - Urgent  → clicking outside / pressing ESC does nothing
 *  - High    → clicking outside dismisses (acknowledges)
 *
 * Queue:  if multiple arrive in quick succession they are shown one at a time.
 */
export const GlobalBroadcastAlert = () => {
  const { broadcastQueue, dismissBroadcast } = useNotifications();
  const navigate = useNavigate();

  const current = broadcastQueue[0] ?? null;

  const isUrgent = current?.priority === 'urgent';
  const hasLink  = !!(current?.link);
  const remaining = broadcastQueue.length - 1; // others waiting behind this one
  const totalCount = broadcastQueue.length;
  const currentIndex = totalCount > 0 ? totalCount - remaining : 1;

  const priorityBg    = isUrgent ? 'bg-red-600'    : 'bg-amber-500';
  const priorityText  = isUrgent ? 'URGENT'         : 'HIGH';
  const accentColor   = isUrgent ? '#dc2626'        : '#d97706';
  const btnBg         = isUrgent ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600';

  // ── Keyboard handling ──────────────────────────────────────────────────────
  const handleEsc = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (isUrgent) {
      e.preventDefault();   // block ESC for urgent
      e.stopPropagation();
    } else {
      // high priority — ESC acknowledges
      if (current) dismissBroadcast(current.id);
    }
  }, [isUrgent, current, dismissBroadcast]);

  useEffect(() => {
    if (!current) return;
    document.addEventListener('keydown', handleEsc, true);
    return () => document.removeEventListener('keydown', handleEsc, true);
  }, [current, handleEsc]);

  // Prevent body scroll while alert is visible
  useEffect(() => {
    if (!current) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [current]);

  if (!current) return null;

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleAcknowledge = () => dismissBroadcast(current.id);

  const handleOpenAction = async () => {
    await dismissBroadcast(current.id);
    const link = current.link!;
    if (link.startsWith('http://') || link.startsWith('https://')) {
      window.open(link, '_blank', 'noopener,noreferrer');
    } else {
      navigate(link);
    }
  };

  const handleOverlayClick = () => {
    if (!isUrgent) handleAcknowledge();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.80)' }}
      onClick={handleOverlayClick}
      data-testid="global-broadcast-alert-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="High priority broadcast notification"
    >
      {/* ── Card ─────────────────────────────────────────────────────────── */}
      <div
        className="relative w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
        data-testid="global-broadcast-alert-card"
      >
        {/* ── PACT Brand Header ─────────────────────────────────────────── */}
        <div
          className="px-5 py-4"
          style={{
            background: 'linear-gradient(135deg, #0F2041 0%, #1D3461 100%)',
          }}
        >
          <div className="flex items-center gap-3">
            {/* Icon circle */}
            <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-white/10">
              {isUrgent
                ? <AlertTriangle className="h-5 w-5 text-white" />
                : <Megaphone className="h-5 w-5 text-white" />
              }
            </div>

            {/* Title block */}
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm tracking-wide uppercase">
                {isUrgent ? 'Urgent Broadcast / بث عاجل' : 'High Priority / أولوية عالية'}
              </p>
              <p className="text-white/60 text-xs mt-0.5">
                Blocking all screens — action required
              </p>
            </div>

            {/* Priority badge */}
            <span
              className={cn(
                'shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-widest text-white',
                priorityBg,
              )}
              data-testid="broadcast-priority-badge"
            >
              {priorityText}
            </span>
          </div>

          {/* Queue indicator — shown when more than one broadcast is waiting */}
          {totalCount > 1 && (
            <div
              className="mt-3 flex items-center justify-between rounded-lg bg-white/10 px-3 py-1.5"
              data-testid="broadcast-queue-indicator"
            >
              <span className="text-white text-xs font-semibold">
                {currentIndex} of {totalCount}
              </span>
              <span className="text-white/70 text-xs">
                {remaining} more after this
              </span>
            </div>
          )}
        </div>

        {/* ── Content card ─────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-900 px-5 py-5 space-y-4">
          {/* Accent line */}
          <div
            className="h-1 w-16 rounded-full"
            style={{ background: `linear-gradient(to right, ${accentColor}, transparent)` }}
          />

          {/* Title — English */}
          <h2 className="font-bold text-lg text-[#0F2041] dark:text-white leading-snug">
            {current.title}
          </h2>

          {/* Message — English */}
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            {current.message}
          </p>

          {/* Mandatory-acknowledgment notice */}
          <div
            className="flex gap-2.5 items-start rounded-xl p-3"
            style={{
              backgroundColor: `${accentColor}10`,
              border: `1px solid ${accentColor}40`,
            }}
          >
            <Lock className="shrink-0 mt-0.5 h-4 w-4" style={{ color: accentColor }} />
            <p className="text-xs font-semibold leading-relaxed" style={{ color: accentColor }}>
              {isUrgent
                ? 'You must acknowledge this alert before continuing. You cannot navigate away until acknowledged.'
                : 'Please acknowledge this broadcast to continue. Click outside or press ESC to dismiss.'}
              <br />
              <span className="opacity-80">
                {isUrgent
                  ? 'يجب تأكيد هذا التنبيه قبل المتابعة.'
                  : 'يُرجى تأكيد هذا البث للمتابعة.'}
              </span>
            </p>
          </div>

          {/* ── Buttons ──────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2.5 pt-1">
            {/* "Open Action" — only when notification has a link */}
            {hasLink && (
              <Button
                className="w-full h-11 font-bold text-sm gap-2 bg-[#0F2041] hover:bg-[#1D3461] text-white"
                onClick={handleOpenAction}
                data-testid="button-broadcast-open-action"
              >
                <ExternalLink className="h-4 w-4" />
                Open Action / تنفيذ الإجراء
              </Button>
            )}

            {/* "Acknowledge" */}
            <Button
              className={cn('w-full h-11 font-bold text-sm gap-2 text-white', btnBg)}
              onClick={handleAcknowledge}
              data-testid="button-broadcast-acknowledge"
            >
              <CheckCircle2 className="h-4 w-4" />
              {hasLink
                ? 'Acknowledge Only / تأكيد فقط'
                : 'Acknowledge & Continue / تأكيد ومتابعة'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
