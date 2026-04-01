import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Hash, Clock, AlertCircle, StickyNote, Plus } from "lucide-react";

const TASKS = [
  {
    id: 1, title: "Send the Transportation For March 2026",
    description: "Approve all the field cost and transportation",
    priority: "high", status: "inprogress", dueLabel: "Due today",
    tags: ["finance"], subtasks: [{ title: "Upload receipts", done: false }],
    overdue: false, today: true, notes: true,
  },
  {
    id: 2, title: "Review MMP submissions for Khartoum North",
    description: "Check completeness of 12 pending forms",
    priority: "medium", status: "todo", dueLabel: "4 days left",
    tags: ["mmp", "review"], subtasks: [
      { title: "North sector", done: true }, { title: "South sector", done: true },
      { title: "East sector", done: false }, { title: "West sector", done: false }, { title: "Central", done: false },
    ],
    overdue: false, today: false, notes: false,
  },
  {
    id: 3, title: "Follow up on overdue site visits",
    description: null, priority: "low", status: "done", dueLabel: "Overdue",
    tags: [], subtasks: [], overdue: true, today: false, notes: false,
  },
];

const P: Record<string, string> = { high: "bg-red-500", medium: "bg-amber-400", low: "bg-slate-300" };
const DUE_COLOR = (t: typeof TASKS[0]) =>
  t.overdue ? "text-red-500" : t.today ? "text-amber-600" : "text-slate-400";

export function FocusMode() {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  return (
    <div className="min-h-screen bg-[#f7f8fa] p-5 font-sans">
      <p className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 mb-3 px-1">
        Option D — Focus Mode · expand to see detail
      </p>
      <div className="space-y-1.5">
        {TASKS.map(t => {
          const open = expanded.has(t.id);
          const done = t.status === "done";
          const inprog = t.status === "inprogress";
          const doneSubs = t.subtasks.filter(s => s.done).length;
          return (
            <div key={t.id} className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all ${done ? "opacity-55" : ""}`}>
              {/* Always-visible collapsed row */}
              <div className="flex items-center gap-3 px-4 py-2.5">
                <button
                  className={`h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${done ? "border-emerald-500 bg-emerald-500" : inprog ? "border-[#1D3461] bg-[#1D3461]/10" : "border-slate-300 hover:border-emerald-400"}`}
                >
                  {done ? <CheckCircle2 className="h-3 w-3 text-white" /> : inprog ? <div className="h-2 w-2 rounded-full bg-[#1D3461]" /> : null}
                </button>

                <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${P[t.priority]}`} />

                <span className={`flex-1 text-[14px] font-semibold truncate ${done ? "line-through text-slate-400" : "text-slate-800"}`}>
                  {t.title}
                </span>

                {t.notes && <StickyNote className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />}

                {t.subtasks.length > 0 && (
                  <span className="text-[11px] text-slate-400 font-medium flex-shrink-0">{doneSubs}/{t.subtasks.length}</span>
                )}

                <span className={`text-[11px] flex items-center gap-1 font-medium flex-shrink-0 ${DUE_COLOR(t)}`}>
                  {t.overdue ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                  {t.dueLabel}
                </span>

                <button onClick={() => toggle(t.id)} className="p-0.5 text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0">
                  {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              </div>

              {/* Expanded detail */}
              {open && (
                <div className="px-4 pb-3 border-t border-slate-100 bg-slate-50/60">
                  {t.description && (
                    <p className="text-[12px] text-slate-600 mt-2.5 mb-2">{t.description}</p>
                  )}
                  {t.tags.length > 0 && (
                    <div className="flex gap-1 mb-2">
                      {t.tags.map(tag => (
                        <span key={tag} className="text-[11px] flex items-center gap-0.5 bg-[#1D3461]/8 text-[#1D3461] border border-[#1D3461]/15 px-2 py-0.5 rounded-full font-medium">
                          <Hash className="h-2.5 w-2.5" />{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {t.subtasks.length > 0 && (
                    <div className="space-y-1">
                      {t.subtasks.map((s, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className={`h-4 w-4 rounded border flex items-center justify-center ${s.done ? "bg-emerald-500 border-emerald-500" : "border-slate-300"}`}>
                            {s.done && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
                          </div>
                          <span className={`text-[12px] ${s.done ? "line-through text-slate-400" : "text-slate-600"}`}>{s.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <button className="w-full flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] text-slate-400 hover:text-slate-600 hover:bg-white hover:shadow-sm border border-dashed border-slate-200 transition-all">
          <Plus className="h-3.5 w-3.5" /> Add task
        </button>
      </div>
    </div>
  );
}
