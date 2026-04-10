import { useState } from "react";
import {
  CheckCircle2, Circle, Plus, Search, ChevronDown,
  MoreHorizontal, Clock, Star, Bell, HelpCircle,
  Home, ListTodo, Calendar, BarChart2, ChevronRight,
  User, Tag, AlertCircle, Zap,
} from "lucide-react";

const TABS = ["My Tasks", "Today", "Upcoming", "Later"];
const SECTIONS = [
  {
    key: "today",
    label: "Do Today",
    color: "text-red-500",
    marker: "bg-red-500",
    tasks: [
      { id: 1, title: "Review Q2 MMP coverage report", project: "MMP Cycle 4", due: "Today", priority: "high", starred: true, complete: false },
      { id: 2, title: "Approve transport cost submissions for Kassala hub", project: "Finance Hub", due: "Today", priority: "high", starred: false, complete: false },
    ],
  },
  {
    key: "upcoming",
    label: "Do Next Week",
    color: "text-blue-500",
    marker: "bg-blue-500",
    tasks: [
      { id: 3, title: "Follow up on uncovered sites in Gedaref", project: "Field Operations", due: "Apr 11", priority: "medium", starred: false, complete: false },
      { id: 4, title: "Update data collector assignments for cycle 5", project: "MMP Cycle 5", due: "Apr 12", priority: "medium", starred: false, complete: false },
      { id: 5, title: "Generate payroll report — March 2026", project: "HR Hub", due: "Apr 14", priority: "medium", starred: false, complete: false },
    ],
  },
  {
    key: "later",
    label: "Do Later",
    color: "text-slate-400",
    marker: "bg-slate-400",
    tasks: [
      { id: 6, title: "Review leave requests pending approval", project: "HR Hub", due: "Apr 15", priority: "low", starred: false, complete: false },
      { id: 7, title: "Sync CRM partner list with field teams", project: "CRM Hub", due: "Apr 18", priority: "low", starred: false, complete: false },
      { id: 8, title: "Prepare site visit report for Khartoum North", project: "Field Operations", due: "Apr 20", priority: "low", starred: false, complete: false },
    ],
  },
];

const PRIORITY_ICON: Record<string, JSX.Element> = {
  high: <AlertCircle className="h-3.5 w-3.5 text-red-400" />,
  medium: <Zap className="h-3.5 w-3.5 text-yellow-500" />,
  low: <ArrowDown className="h-3.5 w-3.5 text-slate-400" />,
};
function ArrowDown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AsanaStyle() {
  const [activeTab, setActiveTab] = useState("My Tasks");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);

  function toggleSection(key: string) {
    setCollapsed(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  return (
    <div className="min-h-screen bg-white text-slate-800 flex" style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>
      {/* Sidebar */}
      <div className="w-52 bg-[#f9f7f7] border-r border-slate-200 flex flex-col pt-4 pb-4 flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 pb-4">
          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-pink-500 to-red-500 flex items-center justify-center">
            <Zap className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-[14px] font-bold text-slate-800">PACT</span>
        </div>

        {[
          { icon: <Home className="h-4 w-4" />, label: "Home" },
          { icon: <Bell className="h-4 w-4" />, label: "Inbox", count: 3 },
          { icon: <ListTodo className="h-4 w-4" />, label: "My Tasks", active: true },
        ].map(item => (
          <button key={item.label}
            className={`flex items-center gap-2.5 mx-2 px-3 py-2 rounded-lg text-[13px] transition-colors ${item.active ? "bg-slate-200 text-slate-900 font-medium" : "text-slate-600 hover:bg-slate-100"}`}>
            <span className={item.active ? "text-slate-700" : "text-slate-500"}>{item.icon}</span>
            <span className="flex-1 text-left">{item.label}</span>
            {item.count && <span className="text-[11px] bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold">{item.count}</span>}
          </button>
        ))}

        <div className="mt-4 px-4">
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-2">Projects</p>
          {["MMP Cycle 4","MMP Cycle 5","Finance Hub","Field Operations","HR Hub","CRM Hub"].map(p => (
            <button key={p} className="flex items-center gap-2 w-full py-1.5 px-1 rounded hover:bg-slate-100 text-[12.5px] text-slate-600 hover:text-slate-800 transition-colors group">
              <div className="h-2.5 w-2.5 rounded-sm bg-pink-400 flex-shrink-0" />
              <span className="truncate">{p}</span>
            </button>
          ))}
        </div>

        <div className="mt-auto px-3">
          <button className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[12.5px] text-slate-500 hover:bg-slate-100 transition-colors">
            <HelpCircle className="h-4 w-4" /> Help & getting started
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Page header */}
        <div className="px-8 pt-5 pb-0 border-b border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-pink-500 flex items-center justify-center text-white font-bold text-sm">EI</div>
              <h1 className="text-[20px] font-bold text-slate-900">My Tasks</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg px-3 h-8">
                <Search className="h-3.5 w-3.5 text-slate-400" />
                <input placeholder="Search tasks…" className="bg-transparent text-[12.5px] text-slate-700 placeholder-slate-400 outline-none w-40" />
              </div>
              <button className="flex items-center gap-1.5 text-[12px] font-medium text-white bg-pink-500 hover:bg-pink-600 rounded-lg px-3 h-8 transition-colors">
                <Plus className="h-3.5 w-3.5" /> Add task
              </button>
            </div>
          </div>
          {/* Tabs */}
          <div className="flex gap-0">
            {TABS.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${activeTab === tab ? "border-pink-500 text-pink-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Task sections */}
        <div className="flex-1 overflow-y-auto px-8 py-4 space-y-4">
          {SECTIONS.map(section => (
            <div key={section.key}>
              {/* Section header */}
              <button onClick={() => toggleSection(section.key)}
                className="flex items-center gap-2 mb-2 group">
                {collapsed.has(section.key)
                  ? <ChevronRight className="h-4 w-4 text-slate-400" />
                  : <ChevronDown className="h-4 w-4 text-slate-400" />}
                <div className={`h-2 w-2 rounded-full ${section.marker}`} />
                <span className={`text-[13px] font-semibold ${section.color}`}>{section.label}</span>
                <span className="text-[12px] text-slate-400">({section.tasks.filter(t => !done.has(t.id)).length})</span>
              </button>

              {/* Column headers (shown once) */}
              {!collapsed.has(section.key) && (
                <div className="flex items-center gap-3 px-3 py-1 mb-1">
                  <div className="w-5 flex-shrink-0" />
                  <div className="flex-1 text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">Task name</div>
                  <div className="w-28 text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">Project</div>
                  <div className="w-20 text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">Due date</div>
                  <div className="w-8 flex-shrink-0" />
                </div>
              )}

              {!collapsed.has(section.key) && section.tasks.map(task => {
                const isDone = done.has(task.id);
                return (
                  <div key={task.id}
                    onClick={() => setSelected(selected === task.id ? null : task.id)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 border cursor-pointer transition-all ${selected === task.id ? "bg-pink-50 border-pink-200" : "border-transparent hover:bg-slate-50 hover:border-slate-200"} group`}>
                    <button onClick={(e) => { e.stopPropagation(); setDone(prev => { const n = new Set(prev); n.has(task.id) ? n.delete(task.id) : n.add(task.id); return n; }); }}
                      className="flex-shrink-0">
                      {isDone
                        ? <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" style={{width:18,height:18}} />
                        : <Circle className="h-4.5 w-4.5 text-slate-300 group-hover:text-slate-400" style={{width:18,height:18}} />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className={`text-[13.5px] truncate ${isDone ? "line-through text-slate-400" : "text-slate-800"}`}>{task.title}</p>
                    </div>

                    <div className="w-28 flex-shrink-0">
                      <span className="flex items-center gap-1 text-[11.5px] text-slate-500 truncate">
                        <div className="h-2 w-2 rounded-sm bg-pink-400 flex-shrink-0" />
                        {task.project}
                      </span>
                    </div>

                    <div className={`w-20 text-[12px] flex-shrink-0 ${task.due === "Today" ? "text-red-500 font-medium" : "text-slate-500"}`}>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {task.due}
                      </div>
                    </div>

                    <div className="w-8 flex items-center justify-end flex-shrink-0">
                      {task.starred && <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-400" />}
                      <button onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 transition-all">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {!collapsed.has(section.key) && (
                <button className="flex items-center gap-2 px-3 py-2 text-[13px] text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg w-full transition-colors">
                  <Plus className="h-4 w-4" /> Add task
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
