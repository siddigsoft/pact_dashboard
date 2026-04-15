// Option 8 — Card Mosaic
// Pinterest/masonry style: colorful category cards with vivid priority accents,
// rich card interiors with tags, progress, subtask previews. No sidebar.

import {
  Plus, Search, Clock, AlertTriangle, CheckCircle2, Circle,
  Layers, MoreHorizontal, Tag, ChevronDown, Filter, Star,
  Zap, Calendar, Flag, LayoutGrid, List,
} from "lucide-react";

interface Task {
  id: number; title: string; priority: "urgent" | "high" | "medium" | "low";
  status: "overdue" | "todo" | "in_progress" | "done";
  cat: "project" | "personal" | "recurring";
  due: string; subtasks: { done: number; total: number };
  tags: string[]; note?: string; progress?: number; starred?: boolean;
}

const TASKS: Task[] = [
  { id: 1, title: "Send the Transportation For March 2026", priority: "urgent", status: "overdue", cat: "personal", due: "Apr 02 (OVERDUE)", subtasks: { done: 0, total: 1 }, tags: ["Transport", "Finance"], note: "Collect all March field receipts and submit with form.", starred: true },
  { id: 2, title: "Prepare Monthly Monitoring Plan Q2", priority: "high", status: "todo", cat: "project", due: "Apr 18", subtasks: { done: 0, total: 3 }, tags: ["MMP", "Q2", "Planning"], note: "Coordinate with all hub supervisors before finalizing.", progress: 0 },
  { id: 3, title: "Review field data from Hub Khartoum", priority: "medium", status: "in_progress", cat: "project", due: "Apr 20", subtasks: { done: 1, total: 2 }, tags: ["Data", "Hub", "Khartoum"], progress: 65 },
  { id: 4, title: "Coordinator weekly debrief call", priority: "medium", status: "in_progress", cat: "recurring", due: "Today", subtasks: { done: 0, total: 0 }, tags: ["Call", "Weekly"] },
  { id: 5, title: "Submit staff timesheet April", priority: "low", status: "todo", cat: "personal", due: "Apr 30", subtasks: { done: 0, total: 0 }, tags: ["HR", "Payroll"] },
  { id: 6, title: "Update site visit report — Kassala", priority: "high", status: "todo", cat: "project", due: "Apr 22", subtasks: { done: 1, total: 2 }, tags: ["Site Visit", "Kassala"], progress: 40, starred: true },
];

const CAT_STYLES = {
  project:   { header: "from-[#1D3461] to-blue-600",   badge: "bg-blue-100 text-blue-800",   dot: "bg-blue-600" },
  personal:  { header: "from-purple-700 to-purple-500", badge: "bg-purple-100 text-purple-800", dot: "bg-purple-500" },
  recurring: { header: "from-teal-700 to-teal-500",    badge: "bg-teal-100 text-teal-800",   dot: "bg-teal-500" },
};

const PRIO_STYLES = {
  urgent: { bar: "bg-red-500",   label: "bg-red-100 text-red-700",   text: "Urgent" },
  high:   { bar: "bg-orange-400", label: "bg-orange-100 text-orange-700", text: "High" },
  medium: { bar: "bg-amber-400", label: "bg-amber-100 text-amber-700", text: "Medium" },
  low:    { bar: "bg-sky-400",   label: "bg-sky-100 text-sky-700",   text: "Low" },
};

const FILTERS = ["All", "Project", "Personal", "Recurring", "Starred", "Overdue"];

function TaskCard({ task }: { task: Task }) {
  const cat = CAT_STYLES[task.cat];
  const prio = PRIO_STYLES[task.priority];

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 hover:shadow-lg transition-all group break-inside-avoid mb-4">
      {/* Card header gradient */}
      <div className={`bg-gradient-to-br ${cat.header} px-4 py-3 relative`}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider">{task.cat}</span>
          <div className="flex items-center gap-1">
            {task.starred && <Star className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />}
            <button className="opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreHorizontal className="w-4 h-4 text-white/70" />
            </button>
          </div>
        </div>
        <div className={`absolute bottom-0 left-4 right-4 h-0.5 ${prio.bar} rounded-full`} style={{ bottom: -1 }} />
      </div>

      {/* Card body */}
      <div className="p-4">
        {/* Status + priority */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${prio.label}`}>{prio.text}</span>
          {task.status === "overdue" && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
              <AlertTriangle className="w-2.5 h-2.5" /> Overdue
            </span>
          )}
          {task.status === "in_progress" && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">In Progress</span>
          )}
        </div>

        {/* Title */}
        <p className={`text-[14px] font-bold leading-snug mb-2 ${task.status === "overdue" ? "text-red-900" : "text-slate-800"}`}>
          {task.title}
        </p>

        {/* Note */}
        {task.note && (
          <p className="text-[11px] text-slate-500 leading-relaxed mb-3 bg-slate-50 rounded-lg px-3 py-2">{task.note}</p>
        )}

        {/* Progress */}
        {task.progress !== undefined && task.progress > 0 && (
          <div className="mb-3">
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-slate-400">Progress</span>
              <span className="font-bold text-slate-600">{task.progress}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${prio.bar} transition-all`} style={{ width: `${task.progress}%` }} />
            </div>
          </div>
        )}

        {/* Subtasks */}
        {task.subtasks.total > 0 && (
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-400 rounded-full" style={{ width: `${(task.subtasks.done / task.subtasks.total) * 100}%` }} />
            </div>
            <span className="text-[10px] text-slate-400 shrink-0">{task.subtasks.done}/{task.subtasks.total} sub</span>
          </div>
        )}

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mb-3">
          {task.tags.map(tag => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full">{tag}</span>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-50">
          <div className="flex items-center gap-1 text-[11px] text-slate-400">
            <Clock className="w-3 h-3" />
            <span className={task.status === "overdue" ? "text-red-600 font-semibold" : ""}>{task.due}</span>
          </div>
          <button className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
            task.status === "done" ? "border-green-400 bg-green-50" : "border-slate-200 hover:border-green-400"
          }`}>
            {task.status === "done" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Circle className="w-3 h-3 text-slate-300" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export function V8CardMosaic() {
  const activeFilter = "All";

  const visible = TASKS.filter(t => {
    if (activeFilter === "All") return true;
    if (activeFilter === "Starred") return t.starred;
    if (activeFilter === "Overdue") return t.status === "overdue";
    return t.cat === activeFilter.toLowerCase();
  });

  return (
    <div className="flex flex-col h-screen bg-[#f1f5f9] font-sans overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-4 shrink-0">
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">My Workspace</p>
          <h1 className="text-xl font-bold text-[#0F2041]">My Tasks</h1>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1.5 ml-4">
          {FILTERS.map(f => (
            <button
              key={f}
              className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                activeFilter === f
                  ? "bg-[#1D3461] text-white shadow-md"
                  : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300"
              }`}
            >{f}</button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[12px] text-slate-400">Search tasks…</span>
          </div>
          <button className="flex items-center gap-1.5 bg-[#1D3461] text-white px-3 py-1.5 rounded-lg text-[12px] font-semibold">
            <Plus className="w-4 h-4" /> New Task
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="bg-white border-b border-slate-100 px-6 py-2 flex items-center gap-6 text-[12px] shrink-0">
        {[
          { label: "Total", val: 6, color: "text-slate-700" },
          { label: "Active", val: 5, color: "text-blue-600" },
          { label: "Overdue", val: 1, color: "text-red-600" },
          { label: "Done", val: 0, color: "text-green-600" },
          { label: "Starred", val: 2, color: "text-amber-500" },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="text-slate-400">{s.label}:</span>
            <span className={`font-bold ${s.color}`}>{s.val}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-1.5 text-amber-600">
          <AlertTriangle className="w-4 h-4" />
          <span className="font-medium">1 overdue task requires your attention</span>
        </div>
      </div>

      {/* Masonry grid */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="columns-3 gap-4">
          {visible.map(task => <TaskCard key={task.id} task={task} />)}
          {/* Add card */}
          <div className="break-inside-avoid mb-4">
            <button className="w-full bg-white border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center gap-2 text-slate-400 hover:border-blue-300 hover:text-blue-400 transition-colors">
              <Plus className="w-6 h-6" />
              <span className="text-[12px] font-medium">Add new task</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
