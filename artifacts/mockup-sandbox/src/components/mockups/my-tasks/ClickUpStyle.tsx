import { useState } from "react";
import {
  CheckCircle2, Circle, Plus, Search, Filter,
  LayoutList, Kanban, Calendar, ChevronDown, MoreHorizontal,
  ArrowUp, ArrowRight, ArrowDown, Minus, Clock, User,
  Tag, SlidersHorizontal, RefreshCw, Star,
} from "lucide-react";

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  todo: { label: "TO DO", color: "text-slate-400", bg: "bg-slate-400/10" },
  inprogress: { label: "IN PROGRESS", color: "text-blue-400", bg: "bg-blue-400/10" },
  review: { label: "IN REVIEW", color: "text-purple-400", bg: "bg-purple-400/10" },
  done: { label: "DONE", color: "text-emerald-400", bg: "bg-emerald-400/10" },
};
const PRIORITY_CFG: Record<string, { label: string; color: string; icon: JSX.Element }> = {
  urgent: { label: "Urgent", color: "text-red-400", icon: <ArrowUp className="h-3 w-3" /> },
  high: { label: "High", color: "text-orange-400", icon: <ArrowUp className="h-3 w-3" /> },
  normal: { label: "Normal", color: "text-blue-400", icon: <ArrowRight className="h-3 w-3" /> },
  low: { label: "Low", color: "text-slate-500", icon: <ArrowDown className="h-3 w-3" /> },
  none: { label: "No priority", color: "text-slate-600", icon: <Minus className="h-3 w-3" /> },
};

const TASKS = [
  { id: 1, title: "Review Q2 MMP coverage report", status: "inprogress", priority: "urgent", project: "MMP Cycle 4", due: "Apr 10", assignee: "EI", progress: 60 },
  { id: 2, title: "Approve transport cost submissions for Kassala hub", status: "todo", priority: "high", project: "Finance", due: "Apr 10", assignee: "EI", progress: 0 },
  { id: 3, title: "Follow up on uncovered sites in Gedaref", status: "todo", priority: "high", project: "Field Ops", due: "Apr 11", assignee: "EI", progress: 20 },
  { id: 4, title: "Update data collector assignments for cycle 5", status: "inprogress", priority: "normal", project: "MMP Cycle 5", due: "Apr 12", assignee: "EI", progress: 35 },
  { id: 5, title: "Generate payroll report — March 2026", status: "review", priority: "normal", project: "HR Hub", due: "Apr 14", assignee: "EI", progress: 90 },
  { id: 6, title: "Review leave requests pending approval", status: "todo", priority: "low", project: "HR Hub", due: "Apr 15", assignee: "EI", progress: 0 },
  { id: 7, title: "Sync CRM partner list with field teams", status: "done", priority: "none", project: "CRM", due: "Apr 8", assignee: "EI", progress: 100 },
];

type View = "list" | "board" | "calendar";

export function ClickUpStyle() {
  const [view, setView] = useState<View>("list");
  const [done, setDone] = useState<Set<number>>(new Set([7]));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = TASKS.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) &&
    (statusFilter === "all" || t.status === statusFilter)
  );

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-[#e2e2e2] flex flex-col" style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>
      {/* Top header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/8 bg-[#16213e]">
        <div className="flex items-center gap-1.5">
          <div className="h-5 w-5 rounded bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
            <Star className="h-3 w-3 text-white fill-white" />
          </div>
          <span className="text-[13px] font-bold text-white">My Tasks</span>
        </div>
        <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 h-8 max-w-sm mx-4">
          <Search className="h-3.5 w-3.5 text-[#555]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…"
            className="bg-transparent text-[12.5px] text-[#ccc] placeholder-[#555] flex-1 outline-none" />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button className="flex items-center gap-1.5 text-[12px] text-[#888] hover:text-[#ccc] border border-white/10 rounded-lg px-2.5 h-7 hover:border-white/20 transition-colors">
            <Filter className="h-3 w-3" /> Filter
          </button>
          <button className="flex items-center gap-1.5 text-[12px] text-[#888] hover:text-[#ccc] border border-white/10 rounded-lg px-2.5 h-7 hover:border-white/20 transition-colors">
            <SlidersHorizontal className="h-3 w-3" /> Group
          </button>
          <button className="text-[#555] hover:text-[#999] p-1.5 rounded hover:bg-white/5 transition-colors">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Sub-header: view switcher + stats */}
      <div className="flex items-center gap-4 px-5 py-2 border-b border-white/8 bg-[#16213e]/50">
        {/* View switcher */}
        <div className="flex items-center bg-white/5 border border-white/10 rounded-lg p-0.5 gap-0.5">
          {([["list","List",LayoutList],["board","Board",Kanban],["calendar","Cal",Calendar]] as const).map(([v, label, Icon]) => (
            <button key={v} onClick={() => setView(v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11.5px] font-medium transition-all ${view === v ? "bg-white/15 text-white" : "text-[#666] hover:text-[#aaa]"}`}>
              <Icon className="h-3 w-3" />{label}
            </button>
          ))}
        </div>
        {/* Status filters */}
        <div className="flex items-center gap-1">
          {["all","todo","inprogress","review","done"].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${statusFilter === s ? "bg-blue-600 text-white" : "text-[#555] hover:text-[#999] hover:bg-white/5"}`}>
              {s === "all" ? "All" : STATUS_CFG[s]?.label}
            </button>
          ))}
        </div>
        {/* Mini stats */}
        <div className="ml-auto flex items-center gap-4 text-[11px] text-[#555]">
          <span className="text-blue-400 font-medium">{filtered.filter(t=>t.status==="inprogress").length} in progress</span>
          <span className="text-orange-400 font-medium">{filtered.filter(t=>t.priority==="urgent"||t.priority==="high").length} high priority</span>
          <span className="text-emerald-400 font-medium">{filtered.filter(t=>t.status==="done").length} done</span>
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-2 px-5 py-2 border-b border-white/5 bg-white/2">
        <div className="w-5 flex-shrink-0" />
        <div className="flex-1 text-[10.5px] font-semibold text-[#555] uppercase tracking-wider">Task name</div>
        <div className="w-28 text-[10.5px] font-semibold text-[#555] uppercase tracking-wider">Status</div>
        <div className="w-24 text-[10.5px] font-semibold text-[#555] uppercase tracking-wider">Priority</div>
        <div className="w-24 text-[10.5px] font-semibold text-[#555] uppercase tracking-wider">Project</div>
        <div className="w-20 text-[10.5px] font-semibold text-[#555] uppercase tracking-wider">Due</div>
        <div className="w-16 text-[10.5px] font-semibold text-[#555] uppercase tracking-wider">Progress</div>
        <div className="w-7 flex-shrink-0" />
      </div>

      {/* Task rows */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map(task => {
          const isDone = done.has(task.id) || task.status === "done";
          const st = STATUS_CFG[task.status];
          const pr = PRIORITY_CFG[task.priority];
          return (
            <div key={task.id}
              className="flex items-center gap-2 px-5 py-2.5 border-b border-white/5 hover:bg-white/3 group transition-colors cursor-pointer">
              <button onClick={() => setDone(prev => { const n = new Set(prev); n.has(task.id) ? n.delete(task.id) : n.add(task.id); return n; })}
                className="flex-shrink-0 transition-colors">
                {isDone
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  : <Circle className="h-4 w-4 text-[#444] group-hover:text-[#666]" />}
              </button>

              <div className="flex-1 min-w-0">
                <p className={`text-[13px] truncate ${isDone ? "line-through text-[#444]" : "text-[#d4d4d4]"}`}>{task.title}</p>
              </div>

              <div className="w-28 flex-shrink-0">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-bold ${st.color} ${st.bg}`}>
                  {st.label}
                </span>
              </div>

              <div className={`w-24 flex items-center gap-1 text-[12px] font-medium flex-shrink-0 ${pr.color}`}>
                {pr.icon} {pr.label}
              </div>

              <div className="w-24 flex-shrink-0">
                <span className="text-[11.5px] text-[#666] truncate block">{task.project}</span>
              </div>

              <div className={`w-20 text-[11.5px] flex-shrink-0 ${task.due === "Apr 10" ? "text-red-400" : "text-[#555]"}`}>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {task.due}
                </div>
              </div>

              <div className="w-16 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${task.progress}%` }} />
                  </div>
                  <span className="text-[10px] text-[#555]">{task.progress}%</span>
                </div>
              </div>

              <button className="opacity-0 group-hover:opacity-100 text-[#555] hover:text-[#999] flex-shrink-0 transition-all">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        {/* Add row */}
        <button className="flex items-center gap-2 px-5 py-2.5 text-[13px] text-[#444] hover:text-[#777] w-full hover:bg-white/3 transition-colors group">
          <Plus className="h-4 w-4" />
          <span>Add task</span>
        </button>
      </div>

      {/* Footer stats */}
      <div className="border-t border-white/8 bg-[#16213e]/50 px-5 py-2 flex items-center gap-6 text-[11px] text-[#444]">
        <span>{filtered.length} tasks</span>
        <span>·</span>
        <div className="flex items-center gap-4">
          {Object.entries(STATUS_CFG).map(([key, cfg]) => (
            <span key={key} className={cfg.color}>{filtered.filter(t=>t.status===key).length} {cfg.label.toLowerCase()}</span>
          ))}
        </div>
        <button className="ml-auto flex items-center gap-1 text-[#555] hover:text-[#999] transition-colors">
          <Plus className="h-3 w-3" /> New field
        </button>
      </div>
    </div>
  );
}
