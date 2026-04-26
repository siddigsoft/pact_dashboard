import { Clock, Target, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTitle?: string | null;
  /** Has the user already typed/saved any output for this task? */
  hasOutput: boolean;
  /** Has the user already logged any actual hours for themselves on this task? */
  hasOwnHours: boolean;
  /** Start the live session timer and close the dialog. */
  onStartTimer: () => void;
  /** Scroll/focus the Output card and close the dialog. */
  onJumpToOutput: () => void;
  /** Scroll/focus the Hours & Timesheet card and close the dialog. */
  onJumpToHours: () => void;
};

/**
 * Friendly "what do you want to do here?" prompt that opens the first time
 * a participant lands on a started task in the current browser session.
 *
 * Three primary CTAs (timer / hours / output) plus a low-key dismiss.
 * The shouldShow / markShown gating lives in `useTaskWorkSession` so the
 * prompt never nags the same person twice in the same session.
 */
export function TaskOpenPrompt({
  open,
  onOpenChange,
  taskTitle,
  hasOutput,
  hasOwnHours,
  onStartTimer,
  onJumpToOutput,
  onJumpToHours,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-task-open-prompt">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Clock className="w-4 h-4 text-emerald-600" />
            Welcome back to this task
          </DialogTitle>
          <DialogDescription className="text-xs">
            {taskTitle ? <><b className="text-slate-700">{taskTitle}</b><br /></> : null}
            Want to log time or record what you accomplished while you're here?
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2 mt-1">
          <button
            type="button"
            onClick={onStartTimer}
            className="group flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50 px-3 py-2.5 text-left transition"
            data-testid="btn-prompt-start-timer"
          >
            <div className="mt-0.5 h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-200">
              <Clock className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-800">Start a work session timer</p>
              <p className="text-[11px] text-emerald-700/80 mt-0.5">
                Counts your time live. Apply to actual hours when you're done.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={onJumpToHours}
            className="group flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/40 hover:bg-blue-50 px-3 py-2.5 text-left transition"
            data-testid="btn-prompt-jump-hours"
          >
            <div className="mt-0.5 h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200">
              <Clock className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-blue-800">
                {hasOwnHours ? 'Update my actual hours' : 'Add my actual hours'}
              </p>
              <p className="text-[11px] text-blue-700/80 mt-0.5">
                Type the total hours you worked, with quick +/- buttons.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={onJumpToOutput}
            className="group flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/40 hover:bg-amber-50 px-3 py-2.5 text-left transition"
            data-testid="btn-prompt-jump-output"
          >
            <div className="mt-0.5 h-8 w-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-200">
              <Target className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-800">
                {hasOutput ? 'Update output / accomplishments' : 'Add output / accomplishments'}
              </p>
              <p className="text-[11px] text-amber-700/80 mt-0.5">
                Describe what you got done and attach any proof files.
              </p>
            </div>
          </button>
        </div>

        <DialogFooter className="mt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs text-slate-500 hover:text-slate-700"
            data-testid="btn-prompt-dismiss"
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Just browsing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
