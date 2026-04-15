// Option 10 — Minimal Typographic List
// Ultra-clean, no card borders, just clean typography + color coding.
// Inspired by Things 3, Notion. White space-forward, readable at a glance.

import {
  Circle, CheckCircle2, AlertTriangle, Clock, Plus,
  Star, MoreHorizontal, ChevronDown, ChevronRight,
  Calendar, Tag, Dot,
} from "lucide-react";

const SECTIONS = [
  {
    key: "overdue",
    label: "Overdue",
    color: "text-red-600",
    dotColor: "bg-red-500",
    tasks: [
      { id: 1, title: "Send the Transportation For March 2026", priority: "high", cat: "personal", due: "Apr 02", starred: true, subtasks: 1 },
    ],
  },
  {
    key: "today",
    label: "Today",
    color: "text-[#1D3461]",
    dotColor: "bg-[#1D3461]",
    tasks: [
      { id: 2, title: "Coordinator weekly debrief call", priority: "medium", cat: "recurring", due: "Today", starred: false, subtasks: 0 },
    ],
  },
  {
    key: "upcoming",
    label: "Upcoming",
    color: "text-slate-600",
    dotColor: "bg-slate-400",
    tasks: [
      { id: 3, title: "Prepare Monthly Monitoring Plan Q2", priority: "high", cat: "project", due: "Apr 18", starred: false, subtasks: 3 },
      { id: 4, title: "Review field data from Hub Khartoum", priority: "medium", cat: "project", due: "Apr 20", starred: true, subtasks: 2 },
      { id: 5, title: "Update site visit report — Kassala", priority: "high", cat: "project", due: "Apr 22", starred: true, subtasks: 2 },
      { id: 6, title: "Submit staff timesheet April", priority: "low", cat: "personal", due: "Apr 30", starred: false, subtasks: 0 },
    ],
  },
];

const PRIO_COLOR: Record<string, string> = {
  high: "bg-red-500", medium: "bg-amber-400", low: "bg-sky-400",
};
const CAT_COLOR: Record<string, string> = {
  project: "text-blue-600",
  personal: "text-purple-600",
  recurring: "text-teal-600",
};

const NAV_ITEMS = [
  { label: "All", active: true },
  { label: "Personal" },
  { label: "Project" },
  { label: "Recurring" },
  { label: "Done" },
];

export function V10MinimalList() {
  const completed = new Set<number>();
  const starred = new Set<number>([1, 4, 5]);
  const collapsed = new Set<string>();

  return (
    <div className="flex h-screen bg-white font-['Inter',sans-serif] overflow-hidden">
      {/* Slim left nav */}
      <aside className="w-[160px] bg-[#fafaf9] border-r border-slate-100 flex flex-col shrink-0 pt-8">
        <div className="px-5 mb-6">
          <p className="text-[10px] text-slate-400 uppercase tracking-[0.15em] font-semibold mb-1">Workspace</p>
          <h1 className="text-[17px] font-bold text-[#0F2041] leading-tight">My Tasks</h1>
        </div>
        <nav className="px-2 space-y-0.5 flex-1">
          {NAV_ITEMS.map((item, i) => (
            <button key={i} className={`w-full text-left px-3 py-1.5 rounded-lg text-[13px] transition-colors ${
              item.active
                ? "font-semibold text-[#1D3461] bg-blue-50"
                : "text-slate-500 hover:bg-slate-100 font-normal"
            }`}>{item.label}</button>
          ))}
        </nav>
        <div className="px-4 pb-4">
          <div className="h-px bg-slate-100 mb-4" />
          <div className="space-y-1.5 text-[11px] text-slate-400">
            <div className="flex justify-between">
              <span>Total</span><span className="font-semibold text-slate-600">6</span>
            </div>
            <div className="flex justify-between">
              <span>Done</span><span className="font-semibold text-green-600">0</span>
            </div>
            <div className="flex justify-between">
              <span>Overdue</span><span className="font-semibold text-red-600">1</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Minimal toolbar */}
        <div className="flex items-center justify-between px-10 pt-8 pb-4 shrink-0">
          <div>
            <h2 className="text-[22px] font-bold text-[#0F2041]">All Tasks</h2>
            <p className="text-[12px] text-slate-400 mt-0.5">April 15, 2026 · 1 overdue</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1D3461] text-white text-[13px] font-semibold hover:bg-[#0F2041] transition-colors">
            <Plus className="w-4 h-4" /> New Task
          </button>
        </div>

        {/* Section list */}
        <div className="flex-1 overflow-y-auto px-10 pb-10">
          {SECTIONS.map(section => {
            const isCollapsed = collapsed.has(section.key);
            return (
              <div key={section.key} className="mb-6">
                {/* Section header */}
                <button
                  className="flex items-center gap-2 mb-2 group w-full"
                >
                  {isCollapsed
                    ? <ChevronRight className={`w-3.5 h-3.5 ${section.color} opacity-70`} />
                    : <ChevronDown className={`w-3.5 h-3.5 ${section.color} opacity-70`} />
                  }
                  <span className={`text-[12px] font-bold uppercase tracking-[0.12em] ${section.color}`}>{section.label}</span>
                  <span className={`text-[11px] font-medium ${section.color} opacity-60`}>{section.tasks.length}</span>
                </button>

                {!isCollapsed && (
                  <div className="border-l-2 border-slate-100 ml-1.5 pl-4">
                    {section.tasks.map((task, i) => {
                      const done = completed.has(task.id);
                      return (
                        <div key={task.id} className="group relative py-2.5 flex items-center gap-3 border-b border-slate-50 last:border-b-0 hover:bg-slate-50 -ml-4 pl-[calc(1rem+4px)] pr-2 rounded-lg transition-colors">
                          {/* Check button */}
                          <button
                            className="shrink-0 transition-colors"
                          >
                            {done
                              ? <CheckCircle2 className="w-5 h-5 text-green-400" />
                              : <Circle className={`w-5 h-5 ${section.key === "overdue" ? "text-red-300 hover:text-red-400" : "text-slate-200 hover:text-slate-300"} transition-colors`} />
                            }
                          </button>

                          {/* Priority dot */}
                          <div className={`w-2 h-2 rounded-full shrink-0 ${PRIO_COLOR[task.priority]}`} />

                          {/* Title area */}
                          <div className="flex-1 min-w-0">
                            <p className={`text-[14px] leading-snug ${
                              done ? "line-through text-slate-300" :
                              section.key === "overdue" ? "text-red-900 font-semibold" :
                              "text-slate-800 font-medium"
                            }`}>{task.title}</p>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className={`text-[11px] font-medium ${CAT_COLOR[task.cat]}`}>{task.cat}</span>
                              {task.subtasks > 0 && (
                                <span className="text-[11px] text-slate-400">{task.subtasks} subtasks</span>
                              )}
                            </div>
                          </div>

                          {/* Right side */}
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Star className={`w-4 h-4 ${starred.has(task.id) ? "fill-amber-400 text-amber-400" : "text-slate-200"}`} />
                            </button>
                            <div className={`flex items-center gap-1 text-[11px] font-medium ${
                              section.key === "overdue" ? "text-red-600" :
                              section.key === "today" ? "text-[#1D3461]" :
                              "text-slate-400"
                            }`}>
                              <Calendar className="w-3 h-3" />
                              {task.due}
                            </div>
                            <button className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreHorizontal className="w-4 h-4 text-slate-400" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Inline add */}
                    <button className="flex items-center gap-2.5 py-2 text-slate-300 hover:text-slate-400 transition-colors w-full mt-1">
                      <Plus className="w-4 h-4" />
                      <span className="text-[13px]">Add task in {section.label.toLowerCase()}…</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
