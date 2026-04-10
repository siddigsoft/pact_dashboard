import { useState } from "react";
import {
  CheckCircle2, Circle, Plus, Search, Star, Clock, Tag,
  ChevronRight, Inbox, Calendar, LayoutList, Zap, MoreHorizontal,
  ArrowUp, ArrowRight, ArrowDown, Command,
} from "lucide-react";

const TASKS = [
  { id: 1, title: "Review Q2 MMP coverage report", priority: "urgent", project: "MMP Cycle 4", due: "Today", done: false, starred: true },
  { id: 2, title: "Approve transport cost submissions for Kassala hub", priority: "high", project: "Finance", due: "Today", done: false, starred: false },
  { id: 3, title: "Follow up on uncovered sites in Gedaref", priority: "high", project: "Field Ops", due: "Tomorrow", done: false, starred: false },
  { id: 4, title: "Update data collector assignments for cycle 5", priority: "medium", project: "MMP Cycle 5", due: "Apr 12", done: false, starred: false },
  { id: 5, title: "Generate payroll report — March 2026", priority: "medium", project: "HR Hub", due: "Apr 14", done: true, starred: false },
  { id: 6, title: "Review leave requests pending approval", priority: "low", project: "HR Hub", due: "Apr 15", done: false, starred: false },
  { id: 7, title: "Sync CRM partner list with field teams", priority: "low", project: "CRM", due: "Apr 18", done: false, starred: false },
  { id: 8, title: "Prepare site visit report for Khartoum North", priority: "medium", project: "Field Ops", due: "Apr 20", done: false, starred: false },
];

const P_COLOR: Record<string, string> = {
  urgent: "text-red-500",
  high: "text-orange-500",
  medium: "text-blue-500",
  low: "text-slate-400",
};
const P_ICON: Record<string, JSX.Element> = {
  urgent: <ArrowUp className="h-3 w-3" />,
  high: <ArrowUp className="h-3 w-3" />,
  medium: <ArrowRight className="h-3 w-3" />,
  low: <ArrowDown className="h-3 w-3" />,
};

const PROJECTS = ["All", "MMP Cycle 4", "MMP Cycle 5", "Finance", "Field Ops", "HR Hub", "CRM"];

export function LinearStyle() {
  const [active, setActive] = useState<number | null>(null);
  const [done, setDone] = useState<Set<number>>(new Set(TASKS.filter(t => t.done).map(t => t.id)));
  const [project, setProject] = useState("All");
  const [search, setSearch] = useState("");

  const filtered = TASKS.filter(t =>
    (project === "All" || t.project === project) &&
    (t.title.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-[#e2e2e2] flex font-['Inter',sans-serif]" style={{fontFamily:"'Inter',system-ui,sans-serif"}}>
      {/* Sidebar */}
      <div className="w-52 border-r border-white/8 flex flex-col pt-4 pb-4 gap-1 flex-shrink-0">
        <div className="px-4 pb-3 flex items-center gap-2">
          <div className="h-5 w-5 rounded bg-violet-600 flex items-center justify-center">
            <Zap className="h-3 w-3 text-white" />
          </div>
          <span className="text-[13px] font-semibold text-white">PACT</span>
        </div>
        {[
          { icon: <Inbox className="h-3.5 w-3.5" />, label: "Inbox", count: 3 },
          { icon: <Star className="h-3.5 w-3.5" />, label: "My Tasks", active: true, count: null },
          { icon: <Calendar className="h-3.5 w-3.5" />, label: "Calendar", count: null },
          { icon: <Clock className="h-3.5 w-3.5" />, label: "Due Soon", count: 2 },
        ].map(item => (
          <button key={item.label}
            className={`flex items-center gap-2.5 px-3 py-1.5 mx-1 rounded text-[12.5px] transition-colors ${item.active ? "bg-white/10 text-white" : "text-[#888] hover:text-[#ccc] hover:bg-white/5"}`}>
            {item.icon}
            <span className="flex-1 text-left">{item.label}</span>
            {item.count && <span className="text-[11px] bg-white/10 rounded px-1.5 py-0.5 text-[#888]">{item.count}</span>}
          </button>
        ))}
        <div className="mt-3 px-3">
          <p className="text-[10px] uppercase tracking-widest text-[#555] font-semibold mb-1.5 px-1">Projects</p>
          {PROJECTS.slice(1).map(p => (
            <button key={p} onClick={() => setProject(p === project ? "All" : p)}
              className={`flex items-center gap-2 w-full px-1 py-1 rounded text-[12px] transition-colors ${project === p ? "text-white" : "text-[#666] hover:text-[#aaa]"}`}>
              <div className="h-2 w-2 rounded-full bg-violet-500/70 flex-shrink-0" />
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-6 pt-5 pb-3 border-b border-white/8">
          <h1 className="text-[15px] font-semibold text-white flex-shrink-0">My Tasks</h1>
          <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 rounded-md px-3 h-8 max-w-xs">
            <Search className="h-3.5 w-3.5 text-[#555]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              className="bg-transparent text-[12.5px] text-[#ccc] placeholder-[#555] flex-1 outline-none" />
          </div>
          <button className="flex items-center gap-1.5 text-[12px] text-[#888] border border-white/10 rounded px-2.5 h-8 hover:border-white/20 hover:text-[#bbb] transition-colors ml-auto">
            <Plus className="h-3.5 w-3.5" /> New task
          </button>
          <div className="flex items-center gap-1 border border-white/10 rounded px-2 h-8 text-[11px] text-[#555]">
            <Command className="h-3 w-3" /> K
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 px-6 pt-1 border-b border-white/8">
          {["All","Active","Starred","Done"].map((tab, i) => (
            <button key={tab}
              className={`px-3 py-2 text-[12px] border-b-2 transition-colors ${i===1 ? "border-violet-500 text-white font-medium" : "border-transparent text-[#666] hover:text-[#aaa]"}`}>
              {tab}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1 mb-1">
            <button className="flex items-center gap-1 text-[11px] text-[#555] hover:text-[#999] transition-colors px-2 py-1 rounded hover:bg-white/5">
              <LayoutList className="h-3 w-3" /> Group by
            </button>
          </div>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto">
          {/* Section header */}
          <div className="flex items-center gap-2 px-6 py-2 mt-2">
            <ChevronRight className="h-3.5 w-3.5 text-[#555]" />
            <span className="text-[11px] font-semibold text-[#555] uppercase tracking-widest">Today · {filtered.filter(t=>!done.has(t.id)).length} remaining</span>
          </div>

          {filtered.map(task => {
            const isDone = done.has(task.id);
            return (
              <div key={task.id}
                onClick={() => setActive(active === task.id ? null : task.id)}
                className={`flex items-center gap-3 px-6 py-2 cursor-pointer border-b border-white/5 group transition-colors ${active === task.id ? "bg-white/5" : "hover:bg-white/3"}`}>
                <button onClick={(e) => { e.stopPropagation(); setDone(prev => { const n = new Set(prev); n.has(task.id) ? n.delete(task.id) : n.add(task.id); return n; }); }}
                  className="flex-shrink-0 transition-colors">
                  {isDone
                    ? <CheckCircle2 className="h-4 w-4 text-violet-500" />
                    : <Circle className="h-4 w-4 text-[#444] group-hover:text-[#666]" />}
                </button>

                <span className={`flex-1 text-[13px] min-w-0 truncate ${isDone ? "line-through text-[#444]" : "text-[#d4d4d4]"}`}>
                  {task.title}
                </span>

                <div className="hidden group-hover:flex items-center gap-2 flex-shrink-0">
                  <span className="text-[11px] text-[#555]">{task.project}</span>
                </div>

                <span className={`flex items-center gap-0.5 text-[11px] flex-shrink-0 ${P_COLOR[task.priority]}`}>
                  {P_ICON[task.priority]}
                </span>

                <span className={`text-[11px] flex-shrink-0 ${task.due === "Today" ? "text-red-400" : task.due === "Tomorrow" ? "text-orange-400" : "text-[#555]"}`}>
                  {task.due}
                </span>

                <span className="text-[11px] bg-white/5 rounded px-1.5 py-0.5 text-[#555] flex-shrink-0 hidden group-hover:block">
                  {task.project}
                </span>

                <button onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover:opacity-100 text-[#555] hover:text-[#999] transition-all">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}

          {/* Add task row */}
          <div className="flex items-center gap-3 px-6 py-2 text-[#444] hover:text-[#666] cursor-pointer group transition-colors">
            <Plus className="h-4 w-4" />
            <span className="text-[13px]">Add task…</span>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/8 px-6 py-2 flex items-center gap-4 text-[11px] text-[#444]">
          <span>{filtered.filter(t=>done.has(t.id)).length} completed</span>
          <span>·</span>
          <span>{filtered.filter(t=>!done.has(t.id)).length} remaining</span>
          <span className="ml-auto flex items-center gap-1"><Tag className="h-3 w-3" /> {project !== "All" ? project : "All projects"}</span>
        </div>
      </div>
    </div>
  );
}
