import { CheckCircle2, Calendar, Hash, ChevronRight, MoreHorizontal, Plus } from "lucide-react";

const TASKS = [
  {
    id: 1, title: "Send the Transportation For March 2026",
    description: "Approve all the field cost and transportation",
    priority: "high", status: "inprogress", due: "02 Apr",
    tags: ["finance"], subtasks: { done: 0, total: 1 }, overdue: false, today: true,
  },
  {
    id: 2, title: "Review MMP submissions for Khartoum North",
    description: "Check completeness of 12 pending forms",
    priority: "medium", status: "todo", due: "05 Apr",
    tags: ["mmp", "review"], subtasks: { done: 2, total: 5 }, overdue: false, today: false,
  },
  {
    id: 3, title: "Follow up on overdue site visits",
    description: null,
    priority: "low", status: "done", due: "28 Mar",
    tags: [], subtasks: { done: 0, total: 0 }, overdue: true, today: false,
  },
];

const PRIORITY: Record<string, { label: string; dot: string; text: string }> = {
  high:   { label: "High",   dot: "bg-red-500",    text: "text-red-600 bg-red-50 border-red-200" },
  medium: { label: "Medium", dot: "bg-amber-400",  text: "text-amber-700 bg-amber-50 border-amber-200" },
  low:    { label: "Low",    dot: "bg-slate-400",  text: "text-slate-600 bg-slate-50 border-slate-200" },
};

export function CompactRow() {
  return (
    <div className="min-h-screen bg-[#f7f8fa] p-5 font-sans">
      <p className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 mb-3 px-1">Option A — Compact Row</p>
      <div className="space-y-2">
        {TASKS.map(t => {
          const p = PRIORITY[t.priority];
          const done = t.status === "done";
          const inprog = t.status === "inprogress";
          return (
            <div
              key={t.id}
              className={`bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow ${done ? "opacity-55" : ""}`}
            >
              {/* Status circle */}
              <button className={`h-[22px] w-[22px] rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${done ? "border-emerald-500 bg-emerald-500" : inprog ? "border-[#1D3461] bg-[#1D3461]/10" : "border-slate-300 hover:border-emerald-400"}`}>
                {done
                  ? <CheckCircle2 className="h-3 w-3 text-white" />
                  : inprog
                  ? <div className="h-2 w-2 rounded-full bg-[#1D3461]" />
                  : null}
              </button>

              {/* Main content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className={`text-[14px] font-semibold leading-snug truncate ${done ? "line-through text-slate-400" : "text-slate-800"}`}>
                    {t.title}
                  </span>
                  <span className={`inline-flex h-2 w-2 rounded-full flex-shrink-0 ${p.dot}`} title={p.label} />
                </div>
                {t.description && (
                  <p className="text-[12px] text-slate-500 truncate mt-0.5">{t.description}</p>
                )}
                {t.tags.length > 0 && (
                  <div className="flex gap-1 mt-1.5">
                    {t.tags.map(tag => (
                      <span key={tag} className="text-[11px] flex items-center gap-0.5 bg-[#1D3461]/8 text-[#1D3461] border border-[#1D3461]/15 px-2 py-0.5 rounded-full font-medium">
                        <Hash className="h-2.5 w-2.5" />{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Right metadata — always visible */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {t.subtasks.total > 0 && (
                  <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">
                    {t.subtasks.done}/{t.subtasks.total}
                  </span>
                )}
                {t.due && (
                  <span className={`text-[11px] flex items-center gap-1 px-2 py-0.5 rounded-lg font-medium whitespace-nowrap ${t.overdue ? "bg-red-50 text-red-600 border border-red-200" : t.today ? "bg-amber-50 text-amber-700 border border-amber-200" : "text-slate-400"}`}>
                    <Calendar className="h-3 w-3" />{t.due}
                  </span>
                )}
                <button className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
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
