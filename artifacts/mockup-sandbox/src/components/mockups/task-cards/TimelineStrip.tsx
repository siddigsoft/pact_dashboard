import { CheckCircle2, Calendar, Hash, Clock, AlertCircle, Plus, MoreHorizontal, ChevronDown } from "lucide-react";

const TASKS = [
  {
    id: 1, title: "Send the Transportation For March 2026",
    description: "Approve all the field cost and transportation",
    priority: "high", status: "inprogress", dueLabel: "Due today",
    tags: ["finance"], subtasks: { done: 0, total: 1 }, overdue: false, today: true,
  },
  {
    id: 2, title: "Review MMP submissions for Khartoum North",
    description: "Check completeness of 12 pending forms",
    priority: "medium", status: "todo", dueLabel: "4 days left",
    tags: ["mmp", "review"], subtasks: { done: 2, total: 5 }, overdue: false, today: false,
  },
  {
    id: 3, title: "Follow up on overdue site visits",
    description: null,
    priority: "low", status: "done", dueLabel: "Overdue",
    tags: [], subtasks: { done: 0, total: 0 }, overdue: true, today: false,
  },
];

const PRIORITY: Record<string, { line: string; ring: string }> = {
  high:   { line: "bg-red-500",   ring: "ring-red-400" },
  medium: { line: "bg-amber-400", ring: "ring-amber-400" },
  low:    { line: "bg-slate-300", ring: "ring-slate-300" },
};

export function TimelineStrip() {
  return (
    <div className="min-h-screen bg-white p-5 font-sans">
      <p className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 mb-4 px-1">Option C — Timeline Strip</p>
      <div className="space-y-0">
        {TASKS.map((t, i) => {
          const p = PRIORITY[t.priority];
          const done = t.status === "done";
          const inprog = t.status === "inprogress";
          const isLast = i === TASKS.length - 1;
          const subPct = t.subtasks.total > 0 ? Math.round((t.subtasks.done / t.subtasks.total) * 100) : 0;
          return (
            <div key={t.id} className="flex gap-0">
              {/* Left timeline column */}
              <div className="flex flex-col items-center w-10 flex-shrink-0">
                {/* Status dot */}
                <button className={`mt-3.5 h-6 w-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 z-10 transition-all ring-2 ring-offset-2 ${done ? "border-emerald-500 bg-emerald-500 ring-emerald-200" : inprog ? `border-[#1D3461] bg-[#1D3461]/10 ${p.ring}` : `border-slate-300 bg-white ${p.ring}`}`}>
                  {done
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                    : inprog
                    ? <div className="h-2.5 w-2.5 rounded-full bg-[#1D3461]" />
                    : null}
                </button>
                {/* Connector line */}
                {!isLast && <div className={`flex-1 w-0.5 mt-1 ${p.line} opacity-30`} style={{ minHeight: 24 }} />}
              </div>

              {/* Card body */}
              <div className={`flex-1 ml-3 mb-2.5 rounded-xl border border-slate-100 bg-[#fafbfc] hover:bg-white hover:shadow-sm transition-all p-3.5 ${done ? "opacity-55" : ""}`}>
                {/* Title + actions */}
                <div className="flex items-start gap-2">
                  <span className={`flex-1 text-[14px] font-semibold leading-snug ${done ? "line-through text-slate-400" : "text-slate-800"}`}>
                    {t.title}
                  </span>
                  <button className="p-1 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors flex-shrink-0">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </div>

                {t.description && (
                  <p className="text-[12px] text-slate-500 mt-0.5 line-clamp-1">{t.description}</p>
                )}

                {/* Meta row */}
                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  {/* Due */}
                  <span className={`text-[11px] flex items-center gap-1 font-medium ${t.overdue ? "text-red-600" : t.today ? "text-amber-600" : "text-slate-400"}`}>
                    {t.overdue
                      ? <AlertCircle className="h-3 w-3" />
                      : <Clock className="h-3 w-3" />}
                    {t.dueLabel}
                  </span>
                  {/* Tags */}
                  {t.tags.map(tag => (
                    <span key={tag} className="text-[11px] flex items-center gap-0.5 bg-[#1D3461]/6 text-[#1D3461] px-2 py-0.5 rounded-full font-medium border border-[#1D3461]/12">
                      <Hash className="h-2.5 w-2.5" />{tag}
                    </span>
                  ))}
                  {/* Subtask progress */}
                  {t.subtasks.total > 0 && (
                    <div className="flex items-center gap-1.5 ml-auto">
                      <div className="w-16 h-1 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-[#1D3461] rounded-full" style={{ width: `${subPct}%` }} />
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium">{t.subtasks.done}/{t.subtasks.total}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div className="flex gap-0">
          <div className="w-10 flex justify-center">
            <button className="mt-2 h-6 w-6 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center hover:border-slate-400 transition-colors">
              <Plus className="h-3 w-3 text-slate-400" />
            </button>
          </div>
          <button className="flex-1 ml-3 mb-2.5 py-2 text-[13px] text-slate-400 hover:text-slate-600 text-left transition-colors">
            Add task...
          </button>
        </div>
      </div>
    </div>
  );
}
