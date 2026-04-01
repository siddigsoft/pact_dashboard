import { Play, CheckCheck, CalendarClock, MoreHorizontal, Hash, Clock, AlertCircle, Plus } from "lucide-react";

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
    description: null, priority: "low", status: "done", dueLabel: "Overdue",
    tags: [], subtasks: { done: 0, total: 0 }, overdue: true, today: false,
  },
];

const P: Record<string, { label: string; left: string }> = {
  high:   { label: "High",   left: "border-l-red-500" },
  medium: { label: "Medium", left: "border-l-amber-400" },
  low:    { label: "Low",    left: "border-l-slate-300" },
};

const ACTION = (status: string) => {
  if (status === "done")       return null;
  if (status === "inprogress") return { label: "Mark done", icon: <CheckCheck className="h-3.5 w-3.5" />, cls: "bg-emerald-600 hover:bg-emerald-700 text-white" };
  return { label: "Start", icon: <Play className="h-3.5 w-3.5" />, cls: "bg-[#1D3461] hover:bg-[#0F2041] text-white" };
};

export function ActionFirst() {
  return (
    <div className="min-h-screen bg-[#f0f2f5] p-5 font-sans">
      <p className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 mb-3 px-1">
        Option E — Action-First · what do you need to do?
      </p>
      <div className="space-y-2.5">
        {TASKS.map(t => {
          const p = P[t.priority];
          const done = t.status === "done";
          const action = ACTION(t.status);
          const subPct = t.subtasks.total > 0 ? Math.round((t.subtasks.done / t.subtasks.total) * 100) : 0;
          return (
            <div key={t.id} className={`bg-white rounded-xl border-l-4 ${p.left} shadow-sm overflow-hidden transition-shadow hover:shadow-md ${done ? "opacity-55" : ""}`}>
              <div className="flex items-stretch gap-0">
                {/* Left: title + meta */}
                <div className="flex-1 px-4 py-3">
                  <p className={`text-[14px] font-semibold leading-snug ${done ? "line-through text-slate-400" : "text-slate-800"}`}>
                    {t.title}
                  </p>
                  {t.description && (
                    <p className="text-[12px] text-slate-500 mt-0.5 line-clamp-1">{t.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={`text-[11px] flex items-center gap-1 font-medium ${t.overdue ? "text-red-500" : t.today ? "text-amber-600" : "text-slate-400"}`}>
                      {t.overdue ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      {t.dueLabel}
                    </span>
                    {t.tags.map(tag => (
                      <span key={tag} className="text-[11px] flex items-center gap-0.5 bg-[#1D3461]/8 text-[#1D3461] border border-[#1D3461]/15 px-2 py-0.5 rounded-full font-medium">
                        <Hash className="h-2.5 w-2.5" />{tag}
                      </span>
                    ))}
                    {t.subtasks.total > 0 && (
                      <span className="text-[11px] text-slate-400">{t.subtasks.done}/{t.subtasks.total} subtasks</span>
                    )}
                  </div>
                  {t.subtasks.total > 0 && (
                    <div className="mt-2 h-1 w-32 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#1D3461]/60 rounded-full" style={{ width: `${subPct}%` }} />
                    </div>
                  )}
                </div>

                {/* Right: action panel */}
                <div className="flex flex-col items-center justify-center gap-2 px-4 border-l border-slate-100 bg-slate-50/50">
                  {action ? (
                    <>
                      <button className={`flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors ${action.cls}`}>
                        {action.icon} {action.label}
                      </button>
                      <button className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors font-medium">
                        <CalendarClock className="h-3 w-3" /> Postpone
                      </button>
                    </>
                  ) : (
                    <span className="text-[12px] font-semibold text-emerald-600 flex items-center gap-1">
                      <CheckCheck className="h-4 w-4" /> Done
                    </span>
                  )}
                  <button className="p-1 text-slate-300 hover:text-slate-500 transition-colors">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        <button className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] text-slate-400 hover:text-slate-600 hover:bg-white hover:shadow-sm border border-dashed border-slate-200 transition-all">
          <Plus className="h-3.5 w-3.5" /> Add task
        </button>
      </div>
    </div>
  );
}
