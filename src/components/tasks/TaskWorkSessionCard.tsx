import { useState } from 'react';
import { Play, Pause, Square, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatElapsed } from '@/hooks/useTaskWorkSession';
import { cn } from '@/lib/utils';

type Props = {
  isRunning: boolean;
  elapsedSec: number;
  /** Already-saved actual hours for this user (server value). */
  currentHours: number | null;
  pending: boolean;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  /** Add `hoursToAdd` to the user's saved actual hours. */
  onApply: (hoursToAdd: number) => void;
};

/**
 * Live work-session timer for the current user, sitting at the top of the
 * Hours & Timesheet card on TaskDetail. Persists in localStorage via
 * `useTaskWorkSession` so a reload doesn't lose the session.
 *
 * "Apply to my hours" rounds elapsed to the nearest 15 min and adds it
 * to the user's existing actual hours via the parent's mutation.
 */
export function TaskWorkSessionCard({
  isRunning,
  elapsedSec,
  currentHours,
  pending,
  onStart,
  onPause,
  onReset,
  onApply,
}: Props) {
  const [confirmReset, setConfirmReset] = useState(false);

  // Round elapsed to the nearest 0.25h (15 min) for the apply preview.
  const roundedHours = Math.round((elapsedSec / 3600) * 4) / 4;
  const hasElapsed = elapsedSec >= 1;
  const newTotal = (currentHours ?? 0) + roundedHours;

  return (
    <div
      className={cn(
        'rounded-xl border p-3 mb-3 transition-colors',
        isRunning
          ? 'border-emerald-300 bg-emerald-50/60'
          : hasElapsed
            ? 'border-amber-200 bg-amber-50/40'
            : 'border-slate-200 bg-slate-50/60',
      )}
      data-testid="card-work-session"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Live work session
          </p>
          <p
            className={cn(
              'font-mono font-bold tabular-nums leading-none mt-0.5',
              isRunning ? 'text-emerald-700 text-2xl' : hasElapsed ? 'text-amber-700 text-2xl' : 'text-slate-400 text-xl',
            )}
            data-testid="text-session-elapsed"
          >
            {formatElapsed(elapsedSec)}
          </p>
          {isRunning && (
            <p className="text-[10px] text-emerald-700/80 mt-1 flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Counting…
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isRunning ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onPause}
              className="h-8 px-2.5 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
              data-testid="btn-session-pause"
            >
              <Pause className="w-3.5 h-3.5" />
              <span className="ml-1 text-xs">Pause</span>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={onStart}
              className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="btn-session-start"
            >
              <Play className="w-3.5 h-3.5" />
              <span className="ml-1 text-xs">{hasElapsed ? 'Resume' : 'Start'}</span>
            </Button>
          )}
          {hasElapsed && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirmReset) {
                  onReset();
                  setConfirmReset(false);
                } else {
                  setConfirmReset(true);
                  window.setTimeout(() => setConfirmReset(false), 3000);
                }
              }}
              className={cn(
                'h-8 w-8 p-0',
                confirmReset ? 'text-rose-700 bg-rose-50 hover:bg-rose-100' : 'text-slate-500 hover:text-slate-700',
              )}
              title={confirmReset ? 'Click again to confirm reset' : 'Reset timer'}
              data-testid="btn-session-reset"
            >
              <Square className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {hasElapsed && (
        <div className="mt-2.5 pt-2.5 border-t border-emerald-200/60 flex items-center justify-between gap-2">
          <p className="text-[11px] text-slate-600 leading-tight">
            Add <span className="font-semibold text-slate-800">{roundedHours.toFixed(2)}h</span>
            {currentHours != null && currentHours > 0 ? (
              <> to your <span className="font-semibold text-slate-800">{currentHours.toFixed(2)}h</span> → <span className="font-semibold text-emerald-700">{newTotal.toFixed(2)}h</span></>
            ) : (
              <> to your actual hours</>
            )}
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              if (roundedHours <= 0) return;
              onApply(roundedHours);
            }}
            disabled={pending || roundedHours <= 0}
            className="h-7 px-2.5 bg-[#1D3461] hover:bg-[#152547] text-white text-xs"
            data-testid="btn-session-apply"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            <span className="ml-1">Apply</span>
          </Button>
        </div>
      )}
    </div>
  );
}
