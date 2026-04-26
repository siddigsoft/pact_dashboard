import { useState, useEffect } from 'react';
import { Minus, Plus, Check } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export type TimesheetRowProps = {
  row: {
    id: string;
    name: string;
    role: 'Primary' | 'Co-assignee';
    planned: number | null;
    actual: number | null;
    confirmedAt: string | null;
  };
  taskStarted: boolean;
  isSelf: boolean;
  isAdmin: boolean;
  canConfirmHours: boolean;
  confirmedByName: string | null;
  pending: boolean;
  onChangeHours: (hours: number | null) => void;
  onConfirm: () => void;
  /** Optional ref so the parent can focus this input from the open-prompt. */
  inputRef?: React.Ref<HTMLInputElement>;
};

/**
 * Single editable row inside the Hours & Timesheet panel — used by both
 * /tasks/:id (TaskDetail) and the inline reading pane on /my-tasks (Inbox).
 *
 * Editing rules:
 *   - Admins can edit at any time.
 *   - The signed-in person can edit their own row once the task is started.
 *   - The owner / admin can confirm a row once it has actuals reported.
 */
export function TimesheetRow({
  row, taskStarted, isSelf, isAdmin, canConfirmHours,
  confirmedByName, pending, onChangeHours, onConfirm, inputRef,
}: TimesheetRowProps) {
  const canEditActual = isAdmin || (isSelf && taskStarted);
  const confirmed = !!row.confirmedAt;

  // Controlled input — re-syncs whenever the server value changes.
  const [draft, setDraft] = useState<string>(row.actual != null ? String(row.actual) : '');
  useEffect(() => {
    setDraft(row.actual != null ? String(row.actual) : '');
  }, [row.actual]);

  const commit = () => {
    const raw = draft.trim();
    if (raw === '') {
      if (row.actual !== null) onChangeHours(null);
      return;
    }
    const next = Number(raw);
    if (Number.isNaN(next) || next < 0) {
      setDraft(row.actual != null ? String(row.actual) : '');
      return;
    }
    if (next === row.actual) return;
    onChangeHours(next);
  };

  // Step the actual-hours value by ±0.25h. Commits immediately so the server
  // sees every click — gives the row a quick "counter" feel without forcing
  // the user to type.
  const stepBy = (delta: number) => {
    const current = Number(draft) || 0;
    const next = Math.max(0, Math.round((current + delta) * 100) / 100);
    setDraft(String(next));
    if (next !== row.actual) onChangeHours(next);
  };

  const tooltip = !canEditActual
    ? (!taskStarted && isSelf ? 'Start the task before logging actual hours' : 'Only this person (or an admin) can edit their hours')
    : '';

  return (
    <li className="py-2 flex items-center gap-2.5" data-testid={`row-timesheet-${row.id}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 break-words leading-tight" title={row.name}>
          {row.name}
          {isSelf && (
            <span className="ml-1.5 inline-block text-[9px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 py-px align-middle">
              You
            </span>
          )}
        </p>
        <p className="text-[10px] text-slate-400 mt-0.5">
          {row.role} · planned {row.planned != null ? `${row.planned}h` : '—'}
        </p>
      </div>
      <div className="flex items-center gap-0.5">
        {canEditActual && (
          <button
            type="button"
            onClick={() => stepBy(-0.25)}
            disabled={pending || (Number(draft) || 0) <= 0}
            className="h-7 w-7 flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
            title="−15 min"
            data-testid={`btn-hours-step-down-${row.id}`}
          >
            <Minus className="w-3 h-3" />
          </button>
        )}
        <input
          ref={inputRef}
          type="number"
          min={0}
          step={0.25}
          value={draft}
          placeholder="0"
          disabled={!canEditActual || pending}
          title={tooltip}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
          className="w-14 px-1.5 py-1 text-xs text-right rounded border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300/50 disabled:bg-slate-50 disabled:text-slate-400 mx-0.5"
          data-testid={`input-actual-hours-${row.id}`}
        />
        {canEditActual && (
          <button
            type="button"
            onClick={() => stepBy(0.25)}
            disabled={pending}
            className="h-7 w-7 flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
            title="+15 min"
            data-testid={`btn-hours-step-up-${row.id}`}
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
        <span className="text-[10px] text-slate-400 ml-1">h</span>
      </div>
      <div className="w-24 flex items-center justify-end shrink-0">
        {confirmed ? (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold"
            title={`Confirmed by ${confirmedByName ?? 'owner'} on ${(() => { try { return format(parseISO(row.confirmedAt!), 'd MMM yyyy HH:mm'); } catch { return ''; } })()}`}
            data-testid={`badge-hours-confirmed-${row.id}`}
          >
            <Check className="w-3 h-3" /> Confirmed
          </span>
        ) : canConfirmHours && row.actual != null && row.actual > 0 ? (
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[11px] font-semibold"
            data-testid={`btn-confirm-hours-${row.id}`}
          >
            <Check className="w-3 h-3" /> Confirm
          </button>
        ) : (
          <span className="text-[10px] text-slate-400 italic text-right leading-tight">
            {row.actual == null || row.actual === 0 ? 'Awaiting log' : 'Pending owner'}
          </span>
        )}
      </div>
    </li>
  );
}
