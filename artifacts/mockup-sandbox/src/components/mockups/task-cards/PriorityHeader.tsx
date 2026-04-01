import { CheckCircle2, Calendar, Hash, StickyNote, MoreHorizontal, Plus, ChevronRight } from "lucide-react";

const TASKS = [
  {
    id: 1, title: "Send the Transportation For March 2026",
    description: "Approve all the field cost and transportation",
    priority: "high", status: "inprogress", due: "02 Apr",
    tags: ["finance"], subtasks: { done: 0, total: 1 }, overdue: false, today: true, notes: true,
  },
  {
    id: 2, title: "Review MMP submissions for Khartoum North",
    description: "Check completeness of 12 pending forms",
    priority: "medium", status: "todo", due: "05 Apr",
    tags: ["mmp", "review"], subtasks: { done: 2, total: 5 }, overdue: false, today: false, notes: false,
  },
  {
    id: 3, title: "Follow up on overdue site visits",
    description: null,
    priority: "low", status: "done", due: "28 Mar",
    tags: [], subtasks: { done: 0, total: 0 }, overdue: true, today: false, notes: false,
  },
];

const PRIORITY: Record<string, { bar: string; badge: string; label: string }> = {
  high:   { bar: "bg-red-500",   badge: "text-red-600 bg-red-50 border border-red-200",         label: "High" },
  medium: { bar: "bg-amber-400", badge: "text-amber-700 bg-amber-50 border border-amber-200",   label: "Medium" },
  low:    { bar: "bg-slate-300", badge: "text-slate-500 bg-slate-50 border border-slate-200",   label: "Low" },
};

export function PriorityHeader() {
  return (
    <div className="min-h-screen bg-[#f0f2f5] p-5 font-sans">
      <p className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 mb-3 px-1">Option B — Priority Header</p>
      <div className="space-y-2.5">
        {TASKS.map(t => {
          const p = PRIORITY[t.priority];
          const done = t.status === "done";
          const inprog = t.status === "inprogress";
          const subPct = t.subtasks.total > 0 ? Math.round((t.subtasks.done / t.subtasks.total) * 100) : 0;
          return (
            <div key={t.id} className={`bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow ${done ? "opacity-55" : ""}`}>
              {/* Priority top bar */}
              <div className={`h-1 w-full ${p.bar}`} />

              <div className="px-4 pt-2.5 pb-3">
                {/* Title row */}
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[14px] font-semibold leading-snug ${done ? "line-through text-slate-400" : "text-slate-800"}`}>
                        {t.title}
                      </span>
                      {t.notes && <StickyNote className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />}
                    </div>
                    {t.description && (
                      <p className="text-[12px] text-slate-500 mt-0.5 line-clamp-1">{t.description}</p>
                    )}
                  </div>
                  {/* Status button — right side */}
                  <button className={`h-6 w-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all mt-0.5 ${done ? "border-emerald-500 bg-emerald-500" : inprog ? "border-[#1D3461] bg-[#1D3461]/10" : "border-slate-300 hover:border-emerald-400"}`}>
                    {done
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                      : inprog
                      ? <div className="h-2.5 w-2.5 rounded-full bg-[#1D3461]" />
                      : null}
                  </button>
                </div>

                {/* Footer row */}
                <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${p.badge}`}>{p.label}</span>
                  {t.due && (
                    <span className={`text-[11px] flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${t.overdue ? "bg-red-50 text-red-600 border border-red-200" : t.today ? "bg-amber-50 text-amber-700 border border-amber-200" : "text-slate-400"}`}>
                      <Calendar className="h-3 w-3" />
                      {t.overdue && "⚠ "}{t.due}
                    </span>
                  )}
                  {t.tags.map(tag => (
                    <span key={tag} className="text-[11px] flex items-center gap-0.5 bg-[#1D3461]/8 text-[#1D3461] border border-[#1D3461]/15 px-2 py-0.5 rounded-full font-medium">
                      <Hash className="h-2.5 w-2.5" />{tag}
                    </span>
                  ))}
                  <div className="flex-1" />
                  {t.subtasks.total > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#1D3461] rounded-full" style={{ width: `${subPct}%` }} />
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium">{t.subtasks.done}/{t.subtasks.total}</span>
                    </div>
                  )}
                  <button className="p-1 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors">
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
