// Option 1 — Refined 3-Panel Layout
// Polished evolution of the current design:
// LEFT 220px (categories + progress + smart nudge)
// CENTER (tab strip + filtered cards)
// RIGHT 280px (planning tools + matrix)

import { useState } from "react";
import {
  CheckCircle2, Circle, Clock, AlertTriangle, Plus, Search,
  LayoutGrid, List, Calendar, Timer, Target, Star, Repeat,
  ChevronRight, MoreHorizontal, Flag, User, Zap,
} from "lucide-react";

const tasks = [
  { id: 1, title: "Send the Transportation For March 2026", priority: "medium", status: "overdue", category: "personal", due: "02 Apr", subtasks: 1, progress: 0 },
  { id: 2, title: "Prepare Monthly Monitoring Plan Q2", priority: "high", status: "todo", category: "project", due: "18 Apr", subtasks: 3, progress: 30 },
  { id: 3, title: "Review field data from Hub Khartoum", priority: "medium", status: "in_progress", category: "project", due: "20 Apr", subtasks: 2, progress: 65 },
  { id: 4, title: "Submit staff timesheet April", priority: "low", status: "todo", category: "personal", due: "30 Apr", subtasks: 0, progress: 0 },
  { id: 5, title: "Coordinator weekly debrief call", priority: "high", status: "in_progress", category: "recurring", due: "Today", subtasks: 0, progress: 50 },
];

const CATS = [
  { key: "all", label: "All Tasks", count: 5, icon: LayoutGrid },
  { key: "personal", label: "Personal", count: 2, icon: User },
  { key: "project", label: "Project", count: 2, icon: Target },
  { key: "recurring", label: "Recurring", count: 1, icon: Repeat },
];

const TABS = ["All", "To Do", "In Progress", "Overdue", "Done"];

const priorityColor: Record<string, string> = {
  high: "bg-red-500", medium: "bg-amber-400", low: "bg-sky-400",
};
const statusBadge: Record<string, { label: string; cls: string }> = {
  overdue: { label: "Overdue", cls: "bg-red-100 text-red-700" },
  todo: { label: "To Do", cls: "bg-slate-100 text-slate-600" },
  in_progress: { label: "In Progress", cls: "bg-blue-100 text-blue-700" },
  done: { label: "Done", cls: "bg-green-100 text-green-700" },
};

export function V1SideNavCards() {
  const [activeTab, setActiveTab] = useState("All");
  const [activeCat, setActiveCat] = useState("all");

  const visible = tasks.filter(t => {
    if (activeCat !== "all" && t.category !== activeCat) return false;
    if (activeTab === "To Do") return t.status === "todo";
    if (activeTab === "In Progress") return t.status === "in_progress";
    if (activeTab === "Overdue") return t.status === "overdue";
    if (activeTab === "Done") return t.status === "done";
    return true;
  });

  const overdue = tasks.filter(t => t.status === "overdue").length;
  const done = tasks.filter(t => t.status === "done").length;
  const pct = Math.round((done / tasks.length) * 100);

  return (
    <div className="flex h-screen bg-[#f8fafc] font-sans text-sm overflow-hidden">
      {/* LEFT SIDEBAR */}
      <aside className="w-[220px] bg-white border-r border-slate-100 flex flex-col shrink-0">
        {/* Header */}
        <div className="px-5 pt-6 pb-4 border-b border-slate-100">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">My Workspace</p>
          <h1 className="text-xl font-bold text-[#0F2041]">My Tasks</h1>
        </div>

        {/* Categories */}
        <div className="px-3 pt-4 flex-1">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2">Categories</p>
          {CATS.map(c => (
            <button
              key={c.key}
              onClick={() => setActiveCat(c.key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg mb-0.5 transition-all ${
                activeCat === c.key
                  ? "bg-[#1D3461] text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <c.icon className="w-4 h-4 opacity-80" />
              <span className="flex-1 text-left text-[13px] font-medium">{c.label}</span>
              <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                activeCat === c.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
              }`}>{c.count}</span>
            </button>
          ))}
        </div>

        {/* Progress block */}
        <div className="mx-3 mb-4 bg-slate-50 rounded-xl p-4 border border-slate-100">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Today's Progress</p>
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl font-bold text-[#1D3461]">{pct}%</span>
            <span className="text-xs text-slate-500">{done}/{tasks.length} done</span>
          </div>
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-gradient-to-r from-[#1D3461] to-blue-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          {overdue > 0 && (
            <div className="flex items-center gap-1.5 mt-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
              <span className="text-xs text-red-600 font-medium">{overdue} overdue</span>
            </div>
          )}
        </div>

        {/* Smart nudge */}
        <div className="mx-3 mb-4 bg-amber-50 border border-amber-100 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[11px] font-semibold text-amber-700">Smart Tip</span>
          </div>
          <p className="text-[11px] text-amber-700 leading-relaxed">You have 1 overdue task. Tackle it first to clear your queue.</p>
        </div>
      </aside>

      {/* CENTER */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
            <Search className="w-4 h-4 text-slate-400" />
            <span className="text-slate-400 text-[13px]">Search tasks…</span>
          </div>
          <button className="flex items-center gap-1.5 bg-[#1D3461] text-white px-4 py-2 rounded-lg text-[13px] font-semibold hover:bg-[#0F2041] transition-colors">
            <Plus className="w-4 h-4" /> New Task
          </button>
        </div>

        {/* View mode tabs + filter tabs */}
        <div className="bg-white border-b border-slate-100 px-6 flex items-center gap-6">
          {[
            { icon: LayoutGrid, label: "Cards" },
            { icon: Calendar, label: "Timeline" },
            { icon: Timer, label: "Planner" },
          ].map((v, i) => (
            <button key={i} className={`flex items-center gap-1.5 py-3 text-[13px] font-medium border-b-2 transition-colors ${
              i === 0 ? "border-[#1D3461] text-[#1D3461]" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>
              <v.icon className="w-4 h-4" />
              {v.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                  activeTab === tab ? "bg-[#1D3461] text-white" : "text-slate-500 hover:bg-slate-100"
                }`}
              >{tab}</button>
            ))}
          </div>
        </div>

        {/* Cards */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {visible.map(task => (
            <div key={task.id} className="bg-white rounded-xl border border-slate-100 p-4 hover:border-blue-200 hover:shadow-sm transition-all group">
              <div className="flex items-start gap-3">
                <div className={`w-1 self-stretch rounded-full ${priorityColor[task.priority]}`} />
                <div className="w-5 h-5 rounded-full border-2 border-slate-300 flex items-center justify-center mt-0.5 group-hover:border-blue-400 transition-colors shrink-0">
                  {task.status === "done" && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`font-semibold text-[14px] leading-snug ${task.status === "overdue" ? "text-red-700" : "text-slate-800"}`}>
                      {task.title}
                    </p>
                    <button className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusBadge[task.status].cls}`}>
                      {statusBadge[task.status].label}
                    </span>
                    <div className="flex items-center gap-1 text-slate-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="text-[11px]">{task.due}</span>
                    </div>
                    {task.subtasks > 0 && (
                      <span className="text-[11px] text-slate-400">{task.subtasks} subtask{task.subtasks > 1 ? "s" : ""}</span>
                    )}
                    <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${
                      task.category === "personal" ? "bg-purple-50 text-purple-600" :
                      task.category === "project" ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"
                    }`}>{task.category}</span>
                  </div>
                  {task.progress > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full" style={{ width: `${task.progress}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">{task.progress}%</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* RIGHT PANEL */}
      <aside className="w-[280px] bg-white border-l border-slate-100 flex flex-col shrink-0 overflow-y-auto">
        <div className="px-5 py-4 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-widest">Planning Tools</p>
        </div>

        {/* Priority Matrix */}
        <div className="p-4 border-b border-slate-100">
          <p className="text-[11px] font-semibold text-slate-500 mb-3 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" /> Priority Matrix
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { label: "Do First", sub: "Urgent · Important", color: "bg-red-500", count: 1 },
              { label: "Schedule", sub: "Important", color: "bg-blue-500", count: 2 },
              { label: "Delegate", sub: "Urgent", color: "bg-amber-400", count: 1 },
              { label: "Eliminate", sub: "Neither", color: "bg-slate-300", count: 1 },
            ].map(q => (
              <div key={q.label} className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                <div className={`w-2 h-2 rounded-full ${q.color} mb-1.5`} />
                <p className="text-[11px] font-bold text-slate-700">{q.label}</p>
                <p className="text-[10px] text-slate-400">{q.sub}</p>
                <p className="text-lg font-bold text-slate-700 mt-1">{q.count}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Quick stats */}
        <div className="p-4 border-b border-slate-100">
          <p className="text-[11px] font-semibold text-slate-500 mb-3 flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5" /> Quick Stats
          </p>
          {[
            { label: "Active Tasks", val: 4, color: "text-blue-600" },
            { label: "Due This Week", val: 3, color: "text-amber-600" },
            { label: "Overdue", val: 1, color: "text-red-600" },
            { label: "Completed Today", val: 0, color: "text-green-600" },
          ].map(s => (
            <div key={s.label} className="flex items-center justify-between py-1.5">
              <span className="text-[12px] text-slate-600">{s.label}</span>
              <span className={`text-[13px] font-bold ${s.color}`}>{s.val}</span>
            </div>
          ))}
        </div>

        {/* Upcoming */}
        <div className="p-4">
          <p className="text-[11px] font-semibold text-slate-500 mb-3 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Upcoming
          </p>
          {tasks.slice(0, 3).map(t => (
            <div key={t.id} className="flex items-center gap-2 py-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${priorityColor[t.priority]}`} />
              <span className="text-[12px] text-slate-600 flex-1 truncate">{t.title}</span>
              <span className="text-[10px] text-slate-400 shrink-0">{t.due}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
