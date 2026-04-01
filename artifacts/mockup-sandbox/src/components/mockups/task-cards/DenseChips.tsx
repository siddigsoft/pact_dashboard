import { useState } from "react";
import { CheckCircle2, Calendar, Hash, ChevronDown, ChevronRight, AlertCircle, Plus, MoreHorizontal } from "lucide-react";

const TASKS = [
  { id: 1, title: "Send the Transportation For March 2026", priority: "high", status: "inprogress", due: "02 Apr", tags: ["finance"], subtasks: { done: 0, total: 1 }, overdue: false, today: true, description: "Approve all the field cost and transportation" },
  { id: 2, title: "Review MMP submissions for Khartoum North", priority: "medium", status: "todo", due: "05 Apr", tags: ["mmp", "review"], subtasks: { done: 2, total: 5 }, overdue: false, today: false, description: "Check completeness of 12 pending forms" },
  { id: 3, title: "Follow up on overdue site visits", priority: "low", status: "done", due: "28 Mar", tags: [], subtasks: { done: 0, total: 0 }, overdue: true, today: false, description: null },
  { id: 4, title: "Coordinate field team for Port Sudan", priority: "high", status: "todo", due: "03 Apr", tags: ["coordination"], subtasks: { done: 0, total: 0 }, overdue: false, today: false, description: "Assign 4 data collectors" },
  { id: 5, title: "Submit monthly expense report", priority: "medium", status: "todo", due: "07 Apr", tags: ["finance"], subtasks: { done: 1, total: 2 }, overdue: false, today: false, description: null },
  { id: 6, title: "Update beneficiary database", priority: "low", status: "inprogress", due: "10 Apr", tags: ["data"], subtasks: { done: 0, total: 0 }, overdue: false, today: false, description: "Sync with MoDa records" },
];

const P: Record<string, { dot: string; badge: string }> = {
  high:   { dot: "bg-red-500",   badge: "bg-red-50 text-red-600 border-red-200" },
  medium: { dot: "bg-amber-400", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  low:    { dot: "bg-slate-300", badge: "bg-slate-50 text-slate-500 border-slate-200" },
};

export function DenseChips() {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  return (
    <div className="min-h-screen bg-white p-5 font-sans">
      <p className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 mb-2 px-1">
        Option G — Dense Chips · scan many, expand one
      </p>
      <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm divide-y divide-slate-100">
        {TASKS.map(t => {
          const p = P[t.priority];
          const done = t.status === "done";
          const inprog = t.status === "inprogress";
          const open = expanded.has(t.id);
          return (
            <div key={t.id} className={done ? "opacity-55" : ""}>
              {/* Single dense row */}
              <div
                className="flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-50 cursor-pointer transition-colors group"
                onClick={() => toggle(t.id)}
              >
                {/* Status circle */}
                <button
                  onClick={e => { e.stopPropagation(); }}
                  className={`h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${done ? "border-emerald-500 bg-emerald-500" : inprog ? "border-[#1D3461] bg-[#1D3461]/10" : "border-slate-300 group-hover:border-emerald-400"}`}
                >
                  {done ? <CheckCircle2 className="h-3 w-3 text-white" /> : inprog ? <div className="h-2 w-2 rounded-full bg-[#1D3461]" /> : null}
                </button>

                {/* Priority dot */}
                <span className={`h-2 w-2 rounded-full flex-shrink-0 ${p.dot}`} />

                {/* Title */}
                <span className={`flex-1 text-[13px] font-medium truncate ${done ? "line-through text-slate-400" : "text-slate-700"}`}>
                  {t.title}
                </span>

                {/* Right chips — always visible */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {t.tags.slice(0, 1).map(tag => (
                    <span key={tag} className="hidden sm:flex text-[10px] items-center gap-0.5 bg-[#1D3461]/6 text-[#1D3461] border border-[#1D3461]/12 px-1.5 py-0.5 rounded-full font-medium">
                      <Hash className="h-2 w-2" />{tag}
                    </span>
                  ))}
                  {t.subtasks.total > 0 && (
                    <span className="text-[10px] text-slate-400 font-medium">{t.subtasks.done}/{t.subtasks.total}</span>
                  )}
                  <span className={`text-[10px] flex items-center gap-0.5 font-medium px-1.5 py-0.5 rounded-md border ${t.overdue ? "bg-red-50 text-red-600 border-red-200" : t.today ? "bg-amber-50 text-amber-700 border-amber-200" : "text-slate-400 border-transparent"}`}>
                    {t.overdue && <AlertCircle className="h-2.5 w-2.5" />}
                    <Calendar className="h-2.5 w-2.5" />
                    {t.due}
                  </span>
                  {open
                    ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    : <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-400" />}
                </div>
              </div>

              {/* Inline expanded detail */}
              {open && (
                <div className="px-12 pb-3 pt-1.5 bg-[#f8f9fb] border-t border-slate-100">
                  {t.description && <p className="text-[12px] text-slate-600 mb-2">{t.description}</p>}
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.tags.map(tag => (
                      <span key={tag} className="text-[11px] flex items-center gap-0.5 bg-[#1D3461]/8 text-[#1D3461] border border-[#1D3461]/15 px-2 py-0.5 rounded-full font-medium">
                        <Hash className="h-2.5 w-2.5" />{tag}
                      </span>
                    ))}
                    <button className="ml-auto p-1 text-slate-300 hover:text-slate-500 hover:bg-slate-200 rounded-lg transition-colors">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {/* Add row */}
        <div className="flex items-center gap-2.5 px-3.5 py-2 text-slate-400 hover:bg-slate-50 cursor-pointer transition-colors">
          <Plus className="h-4 w-4" />
          <span className="text-[13px]">Add task</span>
        </div>
      </div>
    </div>
  );
}
