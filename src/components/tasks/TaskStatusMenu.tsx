import { useState } from 'react';
import { Check, ChevronDown, PlayCircle, PauseCircle, CalendarClock, XCircle, CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { STATUS_LABELS, STATUS_COLORS, type PersonalTaskStatus } from '@/hooks/usePersonalTasks';
import { useLogStatusChange } from '@/hooks/useTaskActivity';
import { useQueryClient } from '@tanstack/react-query';
import { useAddActivity } from '@/hooks/useTaskActivity';

interface Props {
  taskId: string;
  current: PersonalTaskStatus;
  onChange: (next: PersonalTaskStatus, reason?: string) => Promise<void> | void;
  size?: 'sm' | 'md';
  /** Status options to disable (greyed out, not pickable). Used after Start to lock cancel/reschedule for non-admins. */
  disabledStatuses?: PersonalTaskStatus[];
  /** Tooltip shown on disabled options. */
  lockedHint?: string;
}

const STATUS_ICONS: Record<PersonalTaskStatus, React.ComponentType<{ className?: string }>> = {
  todo: Circle,
  inprogress: PlayCircle,
  on_hold: PauseCircle,
  rescheduled: CalendarClock,
  done: CheckCircle2,
  cancelled: XCircle,
};

const STATUSES: PersonalTaskStatus[] = ['todo', 'inprogress', 'on_hold', 'rescheduled', 'done', 'cancelled'];

export function TaskStatusMenu({ taskId, current, onChange, size = 'sm', disabledStatuses = [], lockedHint }: Props) {
  const disabledSet = new Set(disabledStatuses);
  const [open, setOpen] = useState(false);
  const [askingReason, setAskingReason] = useState<PersonalTaskStatus | null>(null);
  const [reason, setReason] = useState('');
  const log = useLogStatusChange();
  const addActivity = useAddActivity();
  const qc = useQueryClient();

  const Icon = STATUS_ICONS[current];

  const apply = async (next: PersonalTaskStatus, reasonText?: string) => {
    if (next === current) { setOpen(false); return; }
    await onChange(next, reasonText);
    // DB trigger writes status_history automatically; only log reason + activity feed entry here
    if (reasonText) {
      await log.mutateAsync({ taskId, fromStatus: current, toStatus: next, reason: reasonText });
    } else {
      await addActivity.mutateAsync({ taskId, kind: 'system', body: `Status changed: ${current} → ${next}` });
    }
    qc.invalidateQueries({ queryKey: ['task-status-history', taskId] });
    qc.invalidateQueries({ queryKey: ['task-activity', taskId] });
    setOpen(false);
    setAskingReason(null);
    setReason('');
  };

  const handlePick = (s: PersonalTaskStatus) => {
    if (disabledSet.has(s)) return;
    if (s === 'on_hold' || s === 'cancelled' || s === 'rescheduled') {
      setAskingReason(s);
      return;
    }
    apply(s);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={`btn-status-${current}`}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border font-semibold transition-all hover:shadow-sm',
            STATUS_COLORS[current],
            size === 'sm' ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs',
          )}
        >
          <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          {STATUS_LABELS[current]}
          <ChevronDown className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start" data-testid="popover-status">
        {askingReason ? (
          <div className="p-2">
            <p className="text-[11px] font-semibold text-slate-600 mb-1.5">
              Reason for {STATUS_LABELS[askingReason]}?
            </p>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Optional…"
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20"
              data-testid="input-status-reason"
            />
            <div className="flex gap-1.5 mt-2">
              <button onClick={() => { setAskingReason(null); setReason(''); }} className="flex-1 text-xs px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50" data-testid="btn-cancel-reason">Cancel</button>
              <button onClick={() => apply(askingReason, reason.trim() || undefined)} className="flex-1 text-xs px-2 py-1 rounded-lg bg-[#1D3461] text-white font-semibold hover:bg-[#0F2041]" data-testid="btn-confirm-status">Apply</button>
            </div>
          </div>
        ) : (
          STATUSES.map(s => {
            const SI = STATUS_ICONS[s];
            const active = s === current;
            const isDisabled = disabledSet.has(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => handlePick(s)}
                disabled={isDisabled}
                title={isDisabled ? (lockedHint ?? 'Locked — admin only') : undefined}
                data-testid={`menu-status-${s}`}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-sm transition-colors',
                  active ? 'bg-slate-100 font-semibold' : 'hover:bg-slate-50',
                  isDisabled && 'opacity-40 cursor-not-allowed hover:bg-transparent',
                )}
              >
                <SI className="w-4 h-4 text-slate-500" />
                <span className="flex-1 text-slate-700">{STATUS_LABELS[s]}</span>
                {active && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                {isDisabled && !active && <span className="text-[9px] font-bold text-slate-400">🔒</span>}
              </button>
            );
          })
        )}
      </PopoverContent>
    </Popover>
  );
}
