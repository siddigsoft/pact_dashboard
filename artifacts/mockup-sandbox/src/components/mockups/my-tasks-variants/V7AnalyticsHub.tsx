// Option 7 — Analytics Hub
// Heavy on stats: KPI cards, completion rings, priority charts,
// progress graphs, with tasks list embedded below.

import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Clock, Circle, Target, Zap, BarChart3, Activity,
  Calendar, Plus, MoreHorizontal, Flag,
} from "lucide-react";

const TASKS = [
  { id: 1, title: "Send the Transportation For March 2026", priority: "high", status: "overdue", cat: "personal", due: "Apr 02" },
  { id: 2, title: "Prepare Monthly Monitoring Plan Q2", priority: "high", status: "todo", cat: "project", due: "Apr 18" },
  { id: 3, title: "Review field data from Hub Khartoum", priority: "medium", status: "in_progress", cat: "project", due: "Apr 20" },
  { id: 4, title: "Coordinator weekly debrief call", priority: "medium", status: "in_progress", cat: "recurring", due: "Today" },
  { id: 5, title: "Submit staff timesheet April", priority: "low", status: "todo", cat: "personal", due: "Apr 30" },
];

// Mini sparkline data (fake weekly data)
const SPARK = [2, 4, 3, 6, 5, 4, 7];
const maxSpark = Math.max(...SPARK);

// Progress ring helper
function Ring({ pct, color, size = 72, stroke = 7 }: { pct: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
      <circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={circ - (pct / 100) * circ}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
      />
    </svg>
  );
}

const KPIS = [
  { label: "Total Tasks", val: 5, delta: "+2 this week", up: true, icon: Target, color: "text-[#1D3461]", bg: "bg-blue-50" },
  { label: "Completed", val: 0, delta: "0% today", up: false, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
  { label: "Overdue", val: 1, delta: "Needs attention", up: false, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
  { label: "In Progress", val: 2, delta: "40% of total", up: true, icon: Activity, color: "text-amber-600", bg: "bg-amber-50" },
];

const PRIORITY_DIST = [
  { label: "High", count: 2, pct: 40, color: "bg-red-500" },
  { label: "Medium", count: 2, pct: 40, color: "bg-amber-400" },
  { label: "Low", count: 1, pct: 20, color: "bg-sky-400" },
];

const STATUS_PIE = [
  { label: "To Do", pct: 40, color: "#94a3b8" },
  { label: "In Progress", pct: 40, color: "#3b82f6" },
  { label: "Overdue", pct: 20, color: "#ef4444" },
];

const prioBar: Record<string, string> = { high: "border-l-red-500", medium: "border-l-amber-400", low: "border-l-sky-400" };

export function V7AnalyticsHub() {
  const tab = "Overview";

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc] font-sans overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-4 shrink-0 sticky top-0 z-10">
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">My Workspace</p>
          <h1 className="text-xl font-bold text-[#0F2041]">My Tasks</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {["Overview", "Task Cards", "Timeline"].map(t => (
            <button key={t} className={`px-3 py-1.5 rounded-lg text-[12px] font-medium ${
              tab === t ? "bg-[#1D3461] text-white" : "text-slate-500 hover:bg-slate-100"
            }`}>{t}</button>
          ))}
          <button className="flex items-center gap-1.5 bg-[#1D3461] text-white px-3 py-1.5 rounded-lg text-[12px] font-semibold">
            <Plus className="w-4 h-4" /> New Task
          </button>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-4">
          {KPIS.map(k => (
            <div key={k.label} className="bg-white rounded-2xl border border-slate-100 p-4 flex items-start gap-3">
              <div className={`p-2 rounded-xl ${k.bg}`}>
                <k.icon className={`w-5 h-5 ${k.color}`} />
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium">{k.label}</p>
                <p className={`text-2xl font-bold ${k.color} leading-tight`}>{k.val}</p>
                <p className={`text-[10px] font-medium mt-0.5 ${k.up ? "text-green-500" : "text-slate-400"}`}>{k.delta}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-3 gap-4">
          {/* Completion ring */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <p className="text-[12px] font-bold text-slate-700 mb-4">Today's Progress</p>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Ring pct={0} color="#1D3461" size={80} stroke={8} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[16px] font-bold text-[#0F2041]">0%</span>
                </div>
              </div>
              <div className="flex-1">
                {[{ label: "Done", val: 0, color: "bg-green-500" }, { label: "Active", val: 2, color: "bg-blue-500" }, { label: "Remaining", val: 3, color: "bg-slate-200" }].map(s => (
                  <div key={s.label} className="flex items-center justify-between py-0.5">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${s.color}`} />
                      <span className="text-[11px] text-slate-500">{s.label}</span>
                    </div>
                    <span className="text-[11px] font-bold text-slate-700">{s.val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Priority distribution */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <p className="text-[12px] font-bold text-slate-700 mb-4">Priority Breakdown</p>
            <div className="space-y-2.5">
              {PRIORITY_DIST.map(p => (
                <div key={p.label}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[11px] text-slate-600 font-medium">{p.label}</span>
                    <span className="text-[11px] font-bold text-slate-700">{p.count} <span className="text-slate-400 font-normal">({p.pct}%)</span></span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${p.color} rounded-full transition-all`} style={{ width: `${p.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Weekly activity sparkline */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <p className="text-[12px] font-bold text-slate-700 mb-1">Weekly Activity</p>
            <p className="text-[10px] text-slate-400 mb-4">Tasks touched per day (last 7 days)</p>
            <div className="flex items-end gap-2 h-[60px]">
              {SPARK.map((v, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-sm bg-[#1D3461] opacity-80"
                    style={{ height: `${(v / maxSpark) * 50}px` }}
                  />
                  <span className="text-[9px] text-slate-400">{["M","T","W","T","F","S","S"][i]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Category ring + alerts */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-1 bg-white rounded-2xl border border-slate-100 p-5">
            <p className="text-[12px] font-bold text-slate-700 mb-4">By Category</p>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Ring pct={60} color="#3b82f6" size={70} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[12px] font-bold text-blue-600">3</span>
                </div>
              </div>
              <div>
                {[{ l: "Project", v: 3, c: "bg-blue-500" }, { l: "Personal", v: 2, c: "bg-purple-500" }, { l: "Recurring", v: 0, c: "bg-green-500" }].map(s => (
                  <div key={s.l} className="flex items-center gap-1.5 py-0.5">
                    <div className={`w-2 h-2 rounded-full ${s.c}`} />
                    <span className="text-[11px] text-slate-500">{s.l}</span>
                    <span className="text-[11px] font-bold text-slate-700 ml-auto pl-3">{s.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="col-span-2 bg-white rounded-2xl border border-slate-100 p-5">
            <p className="text-[12px] font-bold text-slate-700 mb-3">Alerts & Insights</p>
            <div className="space-y-2">
              {[
                { icon: AlertTriangle, color: "text-red-500", bg: "bg-red-50", msg: "1 task overdue since Apr 02 — Transportation report" },
                { icon: Clock, color: "text-amber-500", bg: "bg-amber-50", msg: "3 tasks due within the next 7 days" },
                { icon: Zap, color: "text-blue-500", bg: "bg-blue-50", msg: "You have 0 completed tasks today — start with the overdue one" },
                { icon: TrendingUp, color: "text-green-500", bg: "bg-green-50", msg: "Weekly activity is trending up (avg 4.4 tasks/day)" },
              ].map((a, i) => (
                <div key={i} className={`flex items-start gap-2.5 p-2.5 rounded-lg ${a.bg}`}>
                  <a.icon className={`w-4 h-4 ${a.color} mt-0.5 shrink-0`} />
                  <p className="text-[12px] text-slate-700">{a.msg}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Task list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-bold text-slate-700">All Tasks</p>
            <div className="flex gap-1">
              {["All", "Overdue", "Active", "Done"].map(f => (
                <button key={f} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium ${f === "All" ? "bg-[#1D3461] text-white" : "text-slate-500 hover:bg-slate-100"}`}>{f}</button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {TASKS.map(task => (
              <div key={task.id} className={`bg-white rounded-xl border-l-4 border ${prioBar[task.priority]} border-slate-100 p-3.5 flex items-center gap-3 hover:shadow-sm transition-all group`}>
                <Circle className="w-4 h-4 text-slate-300 group-hover:text-slate-400 transition-colors shrink-0" />
                <p className={`flex-1 text-[13px] font-medium ${task.status === "overdue" ? "text-red-800" : "text-slate-700"}`}>{task.title}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${task.cat === "project" ? "bg-blue-100 text-blue-700" : task.cat === "personal" ? "bg-purple-100 text-purple-700" : "bg-green-100 text-green-700"}`}>{task.cat}</span>
                <span className={`text-[11px] font-medium ${task.status === "overdue" ? "text-red-600" : "text-slate-400"} flex items-center gap-1`}>
                  <Clock className="w-3.5 h-3.5" />{task.due}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
