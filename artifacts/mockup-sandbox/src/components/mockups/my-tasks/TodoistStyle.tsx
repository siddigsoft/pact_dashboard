import { useState } from "react";
import {
  CheckCircle2, Circle, Plus, Search, Star, Clock,
  ChevronDown, ChevronRight, Inbox, Calendar, MoreHorizontal,
  Flag, Hash, Grid3x3, Bell, Settings,
} from "lucide-react";

const SECTIONS = [
  {
    key: "today",
    label: "Today",
    accent: "#dc4c3e",
    tasks: [
      { id: 1, title: "Review Q2 MMP coverage report", priority: 1, project: "MMP Operations", due: "Today", starred: true },
      { id: 2, title: "Approve transport cost submissions for Kassala hub", priority: 2, project: "Finance", due: "Today", starred: false },
    ],
  },
  {
    key: "upcoming",
    label: "Upcoming",
    accent: "#246fe0",
    tasks: [
      { id: 3, title: "Follow up on uncovered sites in Gedaref", priority: 2, project: "Field Ops", due: "Apr 11", starred: false },
      { id: 4, title: "Update data collector assignments for cycle 5", priority: 3, project: "MMP Operations", due: "Apr 12", starred: false },
      { id: 5, title: "Generate payroll report — March 2026", priority: 3, project: "HR Hub", due: "Apr 14", starred: false },
    ],
  },
  {
    key: "later",
    label: "No Due Date",
    accent: "#696969",
    tasks: [
      { id: 6, title: "Review leave requests pending approval", priority: 4, project: "HR Hub", due: null, starred: false },
      { id: 7, title: "Sync CRM partner list with field teams", priority: 4, project: "CRM", due: null, starred: false },
    ],
  },
];

const PRIORITY_FLAG: Record<number, string> = { 1: "text-red-500", 2: "text-orange-400", 3: "text-blue-500", 4: "text-slate-400" };
const PRIORITY_LABEL: Record<number, string> = { 1: "Priority 1", 2: "Priority 2", 3: "Priority 3", 4: "Priority 4" };

const NAV = [
  { icon: <Inbox className="h-4 w-4" />, label: "Inbox", count: 3 },
  { icon: <Calendar className="h-4 w-4" />, label: "Today", active: true, count: 2 },
  { icon: <Grid3x3 className="h-4 w-4" />, label: "Upcoming", count: null },
  { icon: <Star className="h-4 w-4" />, label: "Favorites", count: null },
];

export function TodoistStyle() {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [hovered, setHovered] = useState<number | null>(null);

  function toggle(key: string) {
    setCollapsed(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  return (
    <div className="min-h-screen bg-[#1f1f1f] text-[#ddd] flex" style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>
      {/* Sidebar */}
      <div className="w-56 bg-[#282828] flex flex-col pt-3 pb-4 flex-shrink-0">
        {/* User */}
        <div className="flex items-center gap-2.5 px-4 py-2 mb-1">
          <div className="h-7 w-7 rounded-full bg-red-500 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">E</div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-white truncate">Elsiddig Ibrahim</p>
            <p className="text-[10px] text-[#666] truncate">PACT Sudan</p>
          </div>
        </div>

        {/* Search */}
        <button className="flex items-center gap-2 mx-3 px-3 py-1.5 rounded-lg hover:bg-white/5 text-[#888] transition-colors mb-2">
          <Search className="h-4 w-4" />
          <span className="text-[13px]">Search</span>
        </button>

        {/* Nav */}
        {NAV.map(item => (
          <button key={item.label}
            className={`flex items-center gap-2.5 mx-1 px-3 py-2 rounded-lg text-[13px] transition-colors ${item.active ? "bg-red-500/20 text-red-400" : "text-[#999] hover:bg-white/5 hover:text-[#ccc]"}`}>
            <span className={item.active ? "text-red-400" : "text-[#666]"}>{item.icon}</span>
            <span className="flex-1 text-left">{item.label}</span>
            {item.count && <span className={`text-[12px] font-medium ${item.active ? "text-red-400" : "text-[#666]"}`}>{item.count}</span>}
          </button>
        ))}

        <div className="mt-3 mx-3">
          <div className="flex items-center justify-between px-1 mb-1">
            <p className="text-[11px] text-[#555] font-semibold uppercase tracking-wider">My Projects</p>
            <button className="text-[#555] hover:text-[#999]"><Plus className="h-3.5 w-3.5" /></button>
          </div>
          {["MMP Operations","Finance","Field Ops","HR Hub","CRM"].map(p => (
            <button key={p} className="flex items-center gap-2 w-full px-1 py-1.5 rounded hover:bg-white/5 text-[13px] text-[#777] hover:text-[#bbb] transition-colors">
              <Hash className="h-3.5 w-3.5 text-[#555]" />
              {p}
            </button>
          ))}
        </div>

        <div className="mt-auto flex items-center gap-3 px-4 pt-3 border-t border-white/8">
          <button className="text-[#555] hover:text-[#999]"><Bell className="h-4 w-4" /></button>
          <button className="text-[#555] hover:text-[#999]"><Settings className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-8 pt-6 pb-4">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h1 className="text-[22px] font-bold text-white">Today</h1>
              <p className="text-[13px] text-[#666] mt-0.5">Friday, 10 Apr · 2 tasks</p>
            </div>
            <button className="flex items-center gap-1.5 text-[12px] text-[#888] border border-white/10 rounded-lg px-3 py-1.5 hover:border-white/20 hover:text-[#ccc] transition-colors">
              <Plus className="h-3.5 w-3.5" /> Add task
            </button>
          </div>
        </div>

        {/* Task sections */}
        <div className="flex-1 overflow-y-auto px-8 space-y-1">
          {SECTIONS.map(section => (
            <div key={section.key} className="mb-4">
              <button onClick={() => toggle(section.key)}
                className="flex items-center gap-2 w-full py-1.5 mb-1 group">
                {collapsed.has(section.key)
                  ? <ChevronRight className="h-4 w-4 text-[#555]" />
                  : <ChevronDown className="h-4 w-4 text-[#555]" />}
                <span className="text-[13px] font-semibold" style={{ color: section.accent }}>{section.label}</span>
                <span className="text-[12px] text-[#555]">{section.tasks.filter(t => !done.has(t.id)).length}</span>
              </button>

              {!collapsed.has(section.key) && section.tasks.map(task => {
                const isDone = done.has(task.id);
                return (
                  <div key={task.id}
                    onMouseEnter={() => setHovered(task.id)}
                    onMouseLeave={() => setHovered(null)}
                    className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/4 group border border-transparent hover:border-white/8 transition-all cursor-pointer mb-0.5">
                    <button onClick={() => setDone(prev => { const n = new Set(prev); n.has(task.id) ? n.delete(task.id) : n.add(task.id); return n; })}
                      className="flex-shrink-0">
                      {isDone
                        ? <CheckCircle2 className="h-4.5 w-4.5 text-[#dc4c3e]" />
                        : <Circle className={`h-4 w-4 border-2 rounded-full transition-colors ${isDone ? "border-[#dc4c3e]" : "border-[#555] group-hover:border-[#888]"}`} style={{ width: 18, height: 18, borderWidth: 2 }} />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className={`text-[13.5px] truncate ${isDone ? "line-through text-[#555]" : "text-[#ddd]"}`}>{task.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-[#555] flex items-center gap-1">
                          <Hash className="h-2.5 w-2.5" />{task.project}
                        </span>
                        {task.due && (
                          <span className={`text-[11px] flex items-center gap-1 ${task.due === "Today" ? "text-[#dc4c3e]" : "text-[#666]"}`}>
                            <Clock className="h-2.5 w-2.5" />{task.due}
                          </span>
                        )}
                      </div>
                    </div>

                    <Flag className={`h-3.5 w-3.5 flex-shrink-0 ${PRIORITY_FLAG[task.priority]}`} title={PRIORITY_LABEL[task.priority]} />
                    {task.starred && <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-400 flex-shrink-0" />}
                    <button className="opacity-0 group-hover:opacity-100 text-[#555] hover:text-[#999] flex-shrink-0 transition-all">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}

              {!collapsed.has(section.key) && (
                <button className="flex items-center gap-2 px-3 py-2 text-[13px] text-[#555] hover:text-[#999] w-full group transition-colors">
                  <Plus className="h-4 w-4" />
                  <span>Add task</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
