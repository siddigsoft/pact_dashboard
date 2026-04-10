import { useState } from "react";
import {
  Plus, Search, ChevronDown, MoreHorizontal, Circle,
  CheckCircle2, Bell, Clock, User, Filter, ChevronRight,
  Star, Zap, LayoutGrid, List, BarChart2,
} from "lucide-react";

const STATUS_OPTIONS = [
  { label: "Working on it", color: "#fdab3d", bg: "#fff5e0" },
  { label: "Stuck", color: "#e2445c", bg: "#fce7eb" },
  { label: "Done", color: "#00c875", bg: "#e0f8ed" },
  { label: "Not started", color: "#c4c4c4", bg: "#f5f5f5" },
];
const PRIORITY_OPTIONS = [
  { label: "Critical", color: "#333333", bg: "#ebebeb" },
  { label: "High", color: "#e2445c", bg: "#fce7eb" },
  { label: "Medium", color: "#fdab3d", bg: "#fff5e0" },
  { label: "Low", color: "#579bfc", bg: "#e6f0ff" },
];

const GROUPS = [
  {
    key: "ops",
    label: "Field Operations",
    color: "#579bfc",
    rows: [
      { id: 1, title: "Review Q2 MMP coverage report", status: 0, priority: 0, owner: "EI", due: "Apr 10", done: false },
      { id: 2, title: "Follow up on uncovered sites in Gedaref", status: 3, priority: 1, owner: "EI", due: "Apr 11", done: false },
      { id: 3, title: "Update data collector assignments for cycle 5", status: 0, priority: 2, owner: "EI", due: "Apr 12", done: false },
    ],
  },
  {
    key: "fin",
    label: "Finance & Admin",
    color: "#ff7575",
    rows: [
      { id: 4, title: "Approve transport cost submissions for Kassala hub", status: 3, priority: 1, owner: "EI", due: "Apr 10", done: false },
      { id: 5, title: "Generate payroll report — March 2026", status: 2, priority: 2, owner: "EI", due: "Apr 14", done: true },
    ],
  },
  {
    key: "hr",
    label: "HR Hub",
    color: "#a25ddc",
    rows: [
      { id: 6, title: "Review leave requests pending approval", status: 3, priority: 3, owner: "EI", due: "Apr 15", done: false },
      { id: 7, title: "Sync CRM partner list with field teams", status: 3, priority: 3, owner: "EI", due: "Apr 18", done: false },
    ],
  },
];

export function MondayStyle() {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Set<number>>(new Set([5]));
  const [search, setSearch] = useState("");

  function toggleGroup(key: string) {
    setCollapsed(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  return (
    <div className="min-h-screen bg-[#f5f6f8] flex flex-col" style={{ fontFamily: "'Poppins','Inter',system-ui,sans-serif" }}>
      {/* Top nav */}
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[#f64f8b] to-[#f7b731] flex items-center justify-center">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="text-[14px] font-bold text-slate-900">PACT Tasks</span>
        </div>
        <div className="mx-4 flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-full px-4 h-8 flex-1 max-w-sm">
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            className="bg-transparent text-[12.5px] placeholder-slate-400 outline-none flex-1" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><Bell className="h-4.5 w-4.5" style={{width:18,height:18}} /></button>
          <div className="h-7 w-7 rounded-full bg-[#579bfc] flex items-center justify-center text-white text-[11px] font-bold">EI</div>
        </div>
      </div>

      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3">
          <h1 className="text-[18px] font-bold text-slate-900">My Tasks</h1>
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
            {[["list","List",List],["board","Board",LayoutGrid],["chart","Chart",BarChart2]].map(([v, label, Icon]: any) => (
              <button key={v} className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11.5px] font-medium transition-all ${v==="list" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                <Icon className="h-3 w-3" />{label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 text-[12.5px] text-slate-600 border border-slate-200 rounded-lg px-3 h-8 hover:border-slate-300 hover:bg-slate-50 transition-colors">
            <Filter className="h-3.5 w-3.5" /> Filter
          </button>
          <button className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white bg-[#0073ea] hover:bg-[#0060c0] rounded-lg px-4 h-8 transition-colors shadow-sm">
            <Plus className="h-3.5 w-3.5" /> New task
          </button>
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-0 px-6 py-1.5 bg-white border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
        <div className="flex-1">Task name</div>
        <div className="w-32 text-center">Status</div>
        <div className="w-28 text-center">Priority</div>
        <div className="w-20 text-center">Owner</div>
        <div className="w-24 text-center">Due date</div>
        <div className="w-8" />
      </div>

      {/* Groups */}
      <div className="flex-1 overflow-y-auto px-6 py-3 space-y-4">
        {GROUPS.map(group => (
          <div key={group.key} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Group header */}
            <button onClick={() => toggleGroup(group.key)}
              className="flex items-center gap-2 w-full px-4 py-2.5 border-b border-slate-100 hover:bg-slate-50 transition-colors">
              <div className="h-3 w-3 rounded-sm flex-shrink-0" style={{ backgroundColor: group.color }} />
              {collapsed.has(group.key)
                ? <ChevronRight className="h-4 w-4 text-slate-400" />
                : <ChevronDown className="h-4 w-4 text-slate-400" />}
              <span className="text-[13px] font-bold text-slate-800">{group.label}</span>
              <span className="text-[11px] text-slate-400 ml-1">{group.rows.length} items</span>
            </button>

            {!collapsed.has(group.key) && group.rows.map(row => {
              const isDone = done.has(row.id) || row.done;
              const st = STATUS_OPTIONS[row.status];
              const pr = PRIORITY_OPTIONS[row.priority];
              return (
                <div key={row.id}
                  className="flex items-center gap-0 px-4 py-2.5 border-b border-slate-50 hover:bg-blue-50/30 group transition-colors cursor-pointer">
                  {/* Color bar */}
                  <div className="w-1 h-6 rounded-full flex-shrink-0 mr-3" style={{ backgroundColor: group.color }} />

                  {/* Checkbox */}
                  <button onClick={() => setDone(prev => { const n = new Set(prev); n.has(row.id) ? n.delete(row.id) : n.add(row.id); return n; })}
                    className="flex-shrink-0 mr-2.5 transition-colors">
                    {isDone
                      ? <CheckCircle2 className="h-4.5 w-4.5 text-[#00c875]" style={{width:18,height:18}} />
                      : <Circle className="h-4.5 w-4.5 text-slate-300 group-hover:text-slate-400" style={{width:18,height:18}} />}
                  </button>

                  {/* Title */}
                  <div className="flex-1 min-w-0">
                    <span className={`text-[13.5px] ${isDone ? "line-through text-slate-400" : "text-slate-800 font-medium"}`}>{row.title}</span>
                  </div>

                  {/* Status pill */}
                  <div className="w-32 flex justify-center flex-shrink-0">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ color: st.color, backgroundColor: st.bg }}>
                      {st.label}
                    </span>
                  </div>

                  {/* Priority pill */}
                  <div className="w-28 flex justify-center flex-shrink-0">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold"
                      style={{ color: pr.color, backgroundColor: pr.bg }}>
                      {pr.label}
                    </span>
                  </div>

                  {/* Owner */}
                  <div className="w-20 flex justify-center flex-shrink-0">
                    <div className="h-6 w-6 rounded-full bg-[#579bfc] flex items-center justify-center text-white text-[10px] font-bold">
                      {row.owner}
                    </div>
                  </div>

                  {/* Due */}
                  <div className={`w-24 text-[12px] text-center flex-shrink-0 ${row.due === "Apr 10" ? "text-[#e2445c] font-medium" : "text-slate-500"}`}>
                    {row.due}
                  </div>

                  {/* Actions */}
                  <div className="w-8 flex justify-end flex-shrink-0">
                    <button className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 transition-all">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}

            {!collapsed.has(group.key) && (
              <button className="flex items-center gap-2 px-4 py-2.5 text-[13px] text-slate-400 hover:text-[#0073ea] hover:bg-blue-50/40 w-full transition-colors">
                <Plus className="h-4 w-4" /> Add item
              </button>
            )}
          </div>
        ))}

        {/* Add group */}
        <button className="flex items-center gap-2 text-[13px] text-slate-400 hover:text-[#0073ea] transition-colors py-1">
          <Plus className="h-4 w-4" /> Add group
        </button>
      </div>
    </div>
  );
}
