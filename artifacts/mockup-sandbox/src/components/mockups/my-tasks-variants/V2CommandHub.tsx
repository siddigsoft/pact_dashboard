// Option 2 — Command Hub (Dark Theme)
// Keyboard-first, dark UI, dense compact list, spotlight search,
// command palette feel, shortcut badges, category pills

import {
  Search, Plus, Clock, AlertTriangle, CheckCircle2,
  Circle, ChevronRight, CornerDownLeft, Hash, Star,
  Zap, Calendar, Target, User, Repeat, Flag,
} from "lucide-react";

const tasks = [
  { id: 1, title: "Send the Transportation For March 2026", priority: "high", status: "overdue", cat: "personal", due: "Apr 02", subtasks: 1 },
  { id: 2, title: "Prepare Monthly Monitoring Plan Q2", priority: "high", status: "todo", cat: "project", due: "Apr 18", subtasks: 3 },
  { id: 3, title: "Review field data from Hub Khartoum", priority: "medium", status: "in_progress", cat: "project", due: "Apr 20", subtasks: 2 },
  { id: 4, title: "Submit staff timesheet April", priority: "low", status: "todo", cat: "personal", due: "Apr 30", subtasks: 0 },
  { id: 5, title: "Coordinator weekly debrief call", priority: "medium", status: "in_progress", cat: "recurring", due: "Today", subtasks: 0 },
  { id: 6, title: "Update site visit report — Kassala", priority: "high", status: "todo", cat: "project", due: "Apr 22", subtasks: 2 },
];

const FILTERS = [
  { label: "All", count: 6 },
  { label: "Todo", count: 3 },
  { label: "Active", count: 2 },
  { label: "Overdue", count: 1 },
  { label: "Done", count: 0 },
];

const prio: Record<string, string> = { high: "text-red-400", medium: "text-amber-400", low: "text-sky-400" };
const prioDot: Record<string, string> = { high: "bg-red-500", medium: "bg-amber-400", low: "bg-sky-400" };

export function V2CommandHub() {
  const search = "";
  const filter = "All";
  const selected = 1;

  const selectedTask = tasks.find(t => t.id === selected);

  return (
    <div className="flex h-screen bg-[#0d1117] text-[#e6edf3] font-mono text-sm overflow-hidden">
      {/* SIDEBAR */}
      <div className="w-[200px] bg-[#161b22] border-r border-[#30363d] flex flex-col shrink-0">
        <div className="p-4 border-b border-[#30363d]">
          <div className="flex items-center gap-2 mb-0.5">
            <div className="w-6 h-6 bg-[#1D3461] rounded flex items-center justify-center">
              <Target className="w-3.5 h-3.5 text-blue-300" />
            </div>
            <span className="text-[13px] font-bold text-[#e6edf3]">My Tasks</span>
          </div>
          <span className="text-[10px] text-[#8b949e]">PACT Command Center</span>
        </div>

        <nav className="flex-1 p-2 space-y-0.5">
          {[
            { icon: Hash, label: "All Tasks", count: 6, active: true },
            { icon: User, label: "Personal", count: 2 },
            { icon: Target, label: "Projects", count: 3 },
            { icon: Repeat, label: "Recurring", count: 1 },
            { icon: Star, label: "Starred", count: 0 },
            { icon: Calendar, label: "Calendar", count: null },
          ].map((item, i) => (
            <button key={i} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
              item.active ? "bg-[#1f6feb20] text-blue-400 border border-[#1f6feb40]" : "text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]"
            }`}>
              <item.icon className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 text-[12px]">{item.label}</span>
              {item.count !== null && <span className="text-[10px] opacity-60">{item.count}</span>}
            </button>
          ))}
        </nav>

        {/* Stats */}
        <div className="p-3 border-t border-[#30363d] space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-[#8b949e]">Overdue</span>
            <span className="text-red-400 font-bold">1</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-[#8b949e]">Due today</span>
            <span className="text-amber-400 font-bold">1</span>
          </div>
          <div className="h-1.5 bg-[#21262d] rounded-full overflow-hidden mt-2">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: "0%" }} />
          </div>
          <div className="text-[10px] text-[#8b949e] text-right">0% done today</div>
        </div>
      </div>

      {/* MAIN */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Command bar */}
        <div className="p-3 border-b border-[#30363d] bg-[#0d1117]">
          <div className="flex items-center gap-2 bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 focus-within:border-blue-500 transition-colors">
            <Search className="w-4 h-4 text-[#8b949e] shrink-0" />
            <input
              className="flex-1 bg-transparent text-[13px] text-[#e6edf3] placeholder:text-[#8b949e] outline-none font-mono"
              placeholder="Search tasks, press / for commands…"
              value={search}
            />
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[#21262d] border border-[#30363d] rounded text-[10px] text-[#8b949e]">/</kbd>
              <kbd className="px-1.5 py-0.5 bg-[#21262d] border border-[#30363d] rounded text-[10px] text-[#8b949e]">N</kbd>
            </div>
          </div>
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[#30363d] bg-[#0d1117]">
          {FILTERS.map(f => (
            <button
              key={f.label}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-medium transition-colors ${
                filter === f.label
                  ? "bg-blue-600 text-white"
                  : "text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]"
              }`}
            >
              {f.label}
              <span className={`text-[10px] px-1 rounded ${filter === f.label ? "bg-white/20" : "text-[#484f58]"}`}>{f.count}</span>
            </button>
          ))}
          <div className="ml-auto">
            <button className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#238636] text-white text-[11px] font-semibold hover:bg-[#2ea043] transition-colors">
              <Plus className="w-3.5 h-3.5" /> New Task
            </button>
          </div>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto">
          {tasks.map((task, idx) => (
            <div
              key={task.id}
              className={`flex items-center gap-3 px-4 py-2.5 border-b border-[#21262d] cursor-pointer group transition-colors ${
                selected === task.id ? "bg-[#1f2937]" : "hover:bg-[#161b22]"
              }`}
            >
              <span className="text-[10px] text-[#484f58] w-4 shrink-0">{idx + 1}</span>
              {task.status === "done" ? (
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              ) : (
                <Circle className={`w-4 h-4 shrink-0 ${task.status === "overdue" ? "text-red-500" : "text-[#484f58] group-hover:text-[#8b949e]"}`} />
              )}
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${prioDot[task.priority]}`} />
              <span className={`flex-1 text-[13px] truncate ${
                task.status === "overdue" ? "text-red-300" : task.status === "done" ? "text-[#8b949e] line-through" : "text-[#e6edf3]"
              }`}>{task.title}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                  task.cat === "project" ? "bg-blue-900/50 text-blue-400" :
                  task.cat === "personal" ? "bg-purple-900/50 text-purple-400" :
                  "bg-green-900/50 text-green-400"
                }`}>#{task.cat}</span>
                {task.subtasks > 0 && (
                  <span className="text-[10px] text-[#8b949e]">[{task.subtasks}]</span>
                )}
                <div className="flex items-center gap-1 text-[10px] text-[#8b949e]">
                  <Clock className="w-3 h-3" />
                  <span>{task.due}</span>
                </div>
                {task.status === "overdue" && (
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Status bar */}
        <div className="px-4 py-1.5 border-t border-[#30363d] bg-[#161b22] flex items-center gap-4 text-[10px] text-[#8b949e]">
          <span>6 tasks</span>
          <span>·</span>
          <span className="text-red-400">1 overdue</span>
          <span>·</span>
          <span>2 in progress</span>
          <div className="ml-auto flex items-center gap-1">
            <kbd className="px-1 bg-[#21262d] border border-[#30363d] rounded text-[9px]">↑↓</kbd>
            <span>navigate</span>
            <kbd className="px-1 bg-[#21262d] border border-[#30363d] rounded text-[9px] ml-2">Enter</kbd>
            <span>open</span>
          </div>
        </div>
      </div>

      {/* DETAIL PANEL */}
      {selectedTask && (
        <div className="w-[300px] bg-[#0d1117] border-l border-[#30363d] flex flex-col shrink-0">
          <div className="p-4 border-b border-[#30363d]">
            <div className="flex items-center justify-between mb-3">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${prio[selectedTask.priority]}`}>
                {selectedTask.priority} priority
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded ${
                selectedTask.status === "overdue" ? "bg-red-900/50 text-red-400" :
                selectedTask.status === "in_progress" ? "bg-blue-900/50 text-blue-400" :
                "bg-[#21262d] text-[#8b949e]"
              }`}>{selectedTask.status.replace("_", " ")}</span>
            </div>
            <p className="text-[14px] font-semibold text-[#e6edf3] leading-snug">{selectedTask.title}</p>
          </div>
          <div className="p-4 space-y-3 flex-1">
            {[
              { label: "Category", val: `#${selectedTask.cat}` },
              { label: "Due Date", val: selectedTask.due },
              { label: "Subtasks", val: `${selectedTask.subtasks} task(s)` },
              { label: "Priority", val: selectedTask.priority },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-[11px] text-[#8b949e]">{row.label}</span>
                <span className="text-[11px] text-[#e6edf3] font-mono">{row.val}</span>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-[#30363d] flex gap-2">
            <button className="flex-1 py-1.5 rounded bg-[#238636] text-white text-[11px] font-semibold hover:bg-[#2ea043] transition-colors">
              Mark Done
            </button>
            <button className="px-3 py-1.5 rounded border border-[#30363d] text-[#8b949e] text-[11px] hover:border-[#8b949e] transition-colors">
              Edit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
