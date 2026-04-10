import { useState } from "react";
import {
  CheckSquare, Square, Plus, Search, ChevronDown, MoreHorizontal,
  Clock, Star, Hash, Filter, ArrowUpDown, LayoutGrid,
  Table, Columns, Calendar, Tag, Zap, Circle, CheckCircle2,
} from "lucide-react";

const STATUS_OPTS = [
  { value: "not_started", label: "Not started", color: "bg-slate-200 text-slate-600", dot: "bg-slate-400" },
  { value: "in_progress", label: "In progress", color: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  { value: "done", label: "Done", color: "bg-green-100 text-green-700", dot: "bg-green-500" },
  { value: "blocked", label: "Blocked", color: "bg-red-100 text-red-600", dot: "bg-red-500" },
];
const PRIORITY_OPTS = [
  { value: "🔴 Urgent", color: "text-red-600 bg-red-50" },
  { value: "🟠 High", color: "text-orange-600 bg-orange-50" },
  { value: "🔵 Medium", color: "text-blue-600 bg-blue-50" },
  { value: "⚪ Low", color: "text-slate-500 bg-slate-50" },
];
const ROWS = [
  { id: 1, title: "Review Q2 MMP coverage report", status: "in_progress", priority: "🔴 Urgent", project: "MMP Cycle 4", due: "Apr 10", tags: ["urgent","ops"], starred: true },
  { id: 2, title: "Approve transport cost submissions for Kassala hub", status: "not_started", priority: "🟠 High", project: "Finance Hub", due: "Apr 10", tags: ["finance"], starred: false },
  { id: 3, title: "Follow up on uncovered sites in Gedaref", status: "not_started", priority: "🟠 High", project: "Field Ops", due: "Apr 11", tags: ["field","sites"], starred: false },
  { id: 4, title: "Update data collector assignments for cycle 5", status: "in_progress", priority: "🔵 Medium", project: "MMP Cycle 5", due: "Apr 12", tags: ["mmp"], starred: false },
  { id: 5, title: "Generate payroll report — March 2026", status: "done", priority: "🔵 Medium", project: "HR Hub", due: "Apr 14", tags: ["hr","payroll"], starred: false },
  { id: 6, title: "Review leave requests pending approval", status: "not_started", priority: "⚪ Low", project: "HR Hub", due: "Apr 15", tags: ["hr"], starred: false },
  { id: 7, title: "Sync CRM partner list with field teams", status: "not_started", priority: "⚪ Low", project: "CRM Hub", due: "Apr 18", tags: ["crm"], starred: false },
];

const COLUMNS = ["Name","Status","Priority","Project","Due","Tags"];

type ViewMode = "table" | "board" | "gallery";

export function NotionStyle() {
  const [view, setView] = useState<ViewMode>("table");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [rows, setRows] = useState(ROWS);

  const filtered = rows.filter(r => r.title.toLowerCase().includes(search.toLowerCase()));

  function getStatusCfg(val: string) { return STATUS_OPTS.find(s => s.value === val) ?? STATUS_OPTS[0]; }
  function getPriorityCfg(val: string) { return PRIORITY_OPTS.find(p => p.value === val) ?? PRIORITY_OPTS[3]; }

  function toggleStatus(id: number) {
    setRows(prev => prev.map(r => r.id === id ? {
      ...r,
      status: r.status === "done" ? "not_started" : r.status === "not_started" ? "in_progress" : r.status === "in_progress" ? "done" : "not_started"
    } : r));
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col" style={{ fontFamily: "'Georgia','Noto Serif',serif" }}>
      {/* Top nav */}
      <div className="flex items-center gap-3 px-6 py-2 border-b border-slate-100 bg-white" style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>
        <div className="flex items-center gap-2 text-slate-500">
          <span className="text-[13px] hover:text-slate-900 cursor-pointer">PACT Sudan</span>
          <span className="text-slate-300">/</span>
          <span className="text-[13px] hover:text-slate-900 cursor-pointer">Workspace</span>
          <span className="text-slate-300">/</span>
          <span className="text-[13px] font-medium text-slate-900">My Tasks</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 h-7">
            <Search className="h-3 w-3 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              className="bg-transparent text-[12px] text-slate-700 placeholder-slate-400 outline-none w-28" />
          </div>
          <button className="text-[12px] text-slate-500 hover:text-slate-900 hover:bg-slate-100 px-2 py-1 rounded transition-colors">Share</button>
        </div>
      </div>

      {/* Page header */}
      <div className="px-12 pt-8 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-3xl">✅</span>
          <h1 className="text-[28px] font-bold text-slate-900">My Tasks</h1>
        </div>
        <p className="text-[13px] text-slate-400 ml-12" style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>Personal task tracker — synced with projects</p>
      </div>

      {/* View toolbar */}
      <div className="px-12 pb-2 flex items-center gap-2 border-b border-slate-100" style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>
        {([["table","Table",Table],["board","Board",Columns],["gallery","Gallery",LayoutGrid]] as const).map(([v, label, Icon]) => (
          <button key={v} onClick={() => setView(v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[12.5px] transition-colors ${view === v ? "bg-slate-100 text-slate-900 font-medium" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}>
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
        <div className="w-px h-4 bg-slate-200 mx-1" />
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12.5px] text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors">
          <Filter className="h-3.5 w-3.5" /> Filter
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12.5px] text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors">
          <ArrowUpDown className="h-3.5 w-3.5" /> Sort
        </button>
        <button className="ml-auto flex items-center gap-1 text-[12.5px] text-slate-500 hover:text-slate-900 transition-colors">
          <Plus className="h-3.5 w-3.5" /> New
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-12" style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>
        {/* Column headers */}
        <div className="flex items-center border-b border-slate-100 py-1 sticky top-0 bg-white z-10">
          <div className="w-6 flex-shrink-0" />
          <div className="flex-1 text-[11px] font-medium text-slate-400 uppercase tracking-wider px-2">Name</div>
          <div className="w-32 text-[11px] font-medium text-slate-400 uppercase tracking-wider px-2">Status</div>
          <div className="w-28 text-[11px] font-medium text-slate-400 uppercase tracking-wider px-2">Priority</div>
          <div className="w-32 text-[11px] font-medium text-slate-400 uppercase tracking-wider px-2">Project</div>
          <div className="w-24 text-[11px] font-medium text-slate-400 uppercase tracking-wider px-2">Due</div>
          <div className="w-36 text-[11px] font-medium text-slate-400 uppercase tracking-wider px-2">Tags</div>
          <div className="w-6 flex-shrink-0" />
        </div>

        {filtered.map(row => {
          const st = getStatusCfg(row.status);
          const pr = getPriorityCfg(row.priority);
          const isDone = row.status === "done";
          return (
            <div key={row.id}
              onClick={() => setSelected(selected === row.id ? null : row.id)}
              className={`flex items-center border-b border-slate-50 py-2 cursor-pointer group transition-colors ${selected === row.id ? "bg-blue-50/50" : "hover:bg-slate-50/80"}`}>
              <div className="w-6 flex-shrink-0 opacity-0 group-hover:opacity-100">
                <div className="h-4 w-4 rounded border border-slate-300 flex items-center justify-center">
                  <div className="h-2 w-2 rounded-sm" />
                </div>
              </div>

              {/* Title */}
              <div className="flex-1 px-2 flex items-center gap-2 min-w-0">
                <button onClick={(e) => { e.stopPropagation(); toggleStatus(row.id); }}
                  className="flex-shrink-0">
                  {isDone
                    ? <CheckSquare className="h-4 w-4 text-emerald-500" />
                    : <Square className="h-4 w-4 text-slate-300 group-hover:text-slate-400" />}
                </button>
                <span className={`text-[13.5px] truncate ${isDone ? "line-through text-slate-400" : "text-slate-900"}`}>{row.title}</span>
                {row.starred && <Star className="h-3 w-3 text-yellow-400 fill-yellow-400 flex-shrink-0" />}
              </div>

              {/* Status */}
              <div className="w-32 px-2 flex-shrink-0">
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11.5px] font-medium ${st.color}`}>
                  <div className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                  {st.label}
                </span>
              </div>

              {/* Priority */}
              <div className="w-28 px-2 flex-shrink-0">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11.5px] font-medium ${pr.color}`}>
                  {row.priority}
                </span>
              </div>

              {/* Project */}
              <div className="w-32 px-2 flex-shrink-0">
                <span className="flex items-center gap-1.5 text-[12px] text-slate-600 truncate">
                  <Hash className="h-3 w-3 text-slate-400 flex-shrink-0" />
                  {row.project}
                </span>
              </div>

              {/* Due */}
              <div className={`w-24 px-2 text-[12px] flex-shrink-0 ${row.due === "Apr 10" ? "text-red-500" : "text-slate-500"}`}>
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {row.due}
                </div>
              </div>

              {/* Tags */}
              <div className="w-36 px-2 flex items-center gap-1 flex-shrink-0 flex-wrap">
                {row.tags.slice(0, 2).map(tag => (
                  <span key={tag} className="text-[10.5px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">#{tag}</span>
                ))}
              </div>

              {/* Actions */}
              <div className="w-6 flex-shrink-0">
                <button onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 transition-all">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}

        {/* Add row */}
        <button className="flex items-center gap-2 py-2 text-[13px] text-slate-400 hover:text-slate-700 w-full transition-colors group">
          <Plus className="h-4 w-4" />
          <span>New</span>
        </button>

        {/* Summary row */}
        <div className="flex items-center gap-4 py-2 border-t border-slate-100 mt-2 text-[11.5px] text-slate-400">
          <span>Count: {filtered.length}</span>
          <span>·</span>
          <span className="text-emerald-600 font-medium">{filtered.filter(r=>r.status==="done").length} done</span>
          <span>·</span>
          <span className="text-blue-600 font-medium">{filtered.filter(r=>r.status==="in_progress").length} in progress</span>
        </div>
      </div>
    </div>
  );
}
