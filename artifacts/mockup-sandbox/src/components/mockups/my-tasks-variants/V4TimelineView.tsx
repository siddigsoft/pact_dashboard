// Option 4 — Timeline Strip View
// Week calendar at top, tasks listed below grouped by due date.
// Horizontal date strip you can scroll left/right, tasks anchor to dates.

import { useState } from "react";
import {
  ChevronLeft, ChevronRight, Clock, AlertTriangle,
  CheckCircle2, Circle, Plus, Calendar, Zap, Tag,
} from "lucide-react";

const DAYS = [
  { day: "Mon", date: 14, label: "Apr 14" },
  { day: "Tue", date: 15, label: "Apr 15" },
  { day: "Wed", date: 16, label: "Apr 16" },
  { day: "Thu", date: 17, label: "Apr 17" },
  { day: "Fri", date: 18, label: "Apr 18" },
  { day: "Sat", date: 19, label: "Apr 19" },
  { day: "Sun", date: 20, label: "Apr 20" },
];

const TASK_GROUPS = [
  {
    dateLabel: "Overdue — Apr 02",
    overdue: true,
    tasks: [
      { id: 1, title: "Send the Transportation For March 2026", priority: "high", cat: "personal", subtasks: 1, status: "overdue" },
    ],
  },
  {
    dateLabel: "Today — Apr 15",
    today: true,
    tasks: [
      { id: 2, title: "Coordinator weekly debrief call", priority: "medium", cat: "recurring", subtasks: 0, status: "in_progress" },
    ],
  },
  {
    dateLabel: "Fri, Apr 18",
    tasks: [
      { id: 3, title: "Prepare Monthly Monitoring Plan Q2", priority: "high", cat: "project", subtasks: 3, status: "todo" },
    ],
  },
  {
    dateLabel: "Sun, Apr 20",
    tasks: [
      { id: 4, title: "Review field data from Hub Khartoum", priority: "medium", cat: "project", subtasks: 2, status: "in_progress" },
    ],
  },
  {
    dateLabel: "Tue, Apr 22",
    tasks: [
      { id: 5, title: "Update site visit report — Kassala", priority: "high", cat: "project", subtasks: 2, status: "todo" },
    ],
  },
  {
    dateLabel: "Wed, Apr 30",
    tasks: [
      { id: 6, title: "Submit staff timesheet April", priority: "low", cat: "personal", subtasks: 0, status: "todo" },
    ],
  },
];

const prioBar: Record<string, string> = { high: "border-l-red-500", medium: "border-l-amber-400", low: "border-l-sky-400" };
const prioBadge: Record<string, string> = { high: "bg-red-100 text-red-700", medium: "bg-amber-100 text-amber-700", low: "bg-sky-100 text-sky-700" };
const catColor: Record<string, string> = { project: "bg-blue-100 text-blue-700", personal: "bg-purple-100 text-purple-700", recurring: "bg-green-100 text-green-700" };

export function V4TimelineView() {
  const [activeDay, setActiveDay] = useState(15);

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc] font-sans overflow-hidden">
      {/* Top header */}
      <div className="bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-4 shrink-0">
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">My Workspace</p>
          <h1 className="text-xl font-bold text-[#0F2041]">My Tasks</h1>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {["Cards", "Timeline", "Planner"].map(v => (
            <button key={v} className={`px-3 py-1.5 rounded-lg text-[12px] font-medium ${
              v === "Timeline" ? "bg-[#1D3461] text-white" : "text-slate-500 hover:bg-slate-100"
            }`}>{v}</button>
          ))}
          <button className="flex items-center gap-1.5 bg-[#1D3461] text-white px-3 py-1.5 rounded-lg text-[12px] font-semibold">
            <Plus className="w-4 h-4" /> New Task
          </button>
        </div>
      </div>

      {/* Week strip */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-[13px] font-bold text-slate-700">April 2026 — Week 3</h2>
          <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="ml-auto flex items-center gap-4 text-[11px]">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-red-500 rounded-full" />
              <span className="text-red-600 font-medium">1 overdue</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-blue-500 rounded-full" />
              <span className="text-blue-600 font-medium">2 active</span>
            </div>
          </div>
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS.map(d => {
            const hasTask = [15, 18, 20].includes(d.date);
            const isToday = d.date === 15;
            const isActive = d.date === activeDay;
            return (
              <button
                key={d.date}
                onClick={() => setActiveDay(d.date)}
                className={`flex flex-col items-center py-2.5 px-2 rounded-xl transition-all border ${
                  isActive
                    ? "bg-[#1D3461] border-[#1D3461] text-white"
                    : isToday
                    ? "bg-blue-50 border-blue-200 text-blue-700"
                    : "border-transparent hover:bg-slate-50 text-slate-600"
                }`}
              >
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isActive ? "text-blue-200" : "text-slate-400"}`}>{d.day}</span>
                <span className={`text-[15px] font-bold mt-0.5 ${isActive ? "text-white" : isToday ? "text-blue-700" : "text-slate-700"}`}>{d.date}</span>
                {hasTask && (
                  <div className="flex gap-0.5 mt-1">
                    {[...Array(d.date === 18 ? 2 : 1)].map((_, i) => (
                      <div key={i} className={`w-1 h-1 rounded-full ${isActive ? "bg-blue-300" : "bg-blue-400"}`} />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable task list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {TASK_GROUPS.map((group, gi) => (
          <div key={gi}>
            {/* Group header */}
            <div className={`flex items-center gap-2 mb-2 ${group.overdue ? "text-red-600" : group.today ? "text-[#1D3461]" : "text-slate-500"}`}>
              <div className={`w-2 h-2 rounded-full ${group.overdue ? "bg-red-500" : group.today ? "bg-[#1D3461]" : "bg-slate-300"}`} />
              <span className="text-[11px] font-bold uppercase tracking-wider">{group.dateLabel}</span>
              {group.overdue && (
                <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold ml-1">Action Required</span>
              )}
              {group.today && (
                <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold ml-1">Today</span>
              )}
            </div>

            {/* Tasks */}
            <div className="space-y-2 pl-4">
              {group.tasks.map(task => (
                <div key={task.id} className={`bg-white rounded-xl border border-l-4 ${prioBar[task.priority]} border-slate-100 p-3.5 hover:shadow-sm transition-all group`}>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {task.status === "in_progress" ? (
                        <div className="w-5 h-5 rounded-full border-2 border-blue-400 flex items-center justify-center">
                          <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                        </div>
                      ) : task.status === "overdue" ? (
                        <AlertTriangle className="w-5 h-5 text-red-500" />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-300 group-hover:text-slate-400 transition-colors" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className={`text-[14px] font-semibold leading-snug ${task.status === "overdue" ? "text-red-800" : "text-slate-800"}`}>
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${prioBadge[task.priority]}`}>{task.priority}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${catColor[task.cat]}`}>{task.cat}</span>
                        {task.subtasks > 0 && (
                          <span className="text-[10px] text-slate-400">📋 {task.subtasks} subtasks</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-400 shrink-0">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{group.dateLabel.split("—").pop()?.trim() || group.dateLabel}</span>
                    </div>
                  </div>
                </div>
              ))}
              <button className="flex items-center gap-1.5 text-slate-400 hover:text-blue-500 text-[12px] transition-colors ml-2">
                <Plus className="w-3.5 h-3.5" /> Add task for this day
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
