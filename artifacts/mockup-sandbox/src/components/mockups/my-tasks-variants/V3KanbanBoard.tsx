// Option 3 — Kanban Board
// Horizontal swimlane columns by status: To Do | In Progress | Overdue | Done
// Draggable cards with priority colors, assignee avatars, tags, subtask counts

import { useState } from "react";
import {
  Plus, MoreHorizontal, Clock, Flag, ChevronDown,
  Search, Calendar, Tag, AlertCircle, CheckCircle2, Zap,
} from "lucide-react";

interface Task {
  id: number; title: string; priority: "urgent" | "high" | "medium" | "low";
  cat: string; due: string; subtasks: number; done: number; tags: string[];
}

const COLUMNS: { key: string; label: string; color: string; count: number; tasks: Task[] }[] = [
  {
    key: "todo", label: "To Do", color: "bg-slate-500", count: 3,
    tasks: [
      { id: 1, title: "Prepare MMP Q2 Plan", priority: "high", cat: "project", due: "Apr 18", subtasks: 3, done: 0, tags: ["MMP", "Q2"] },
      { id: 2, title: "Submit staff timesheet April", priority: "low", cat: "personal", due: "Apr 30", subtasks: 0, done: 0, tags: ["HR"] },
      { id: 3, title: "Update site visit report — Kassala", priority: "high", cat: "project", due: "Apr 22", subtasks: 2, done: 0, tags: ["Site Visit"] },
    ],
  },
  {
    key: "in_progress", label: "In Progress", color: "bg-blue-500", count: 2,
    tasks: [
      { id: 4, title: "Review field data from Hub Khartoum", priority: "medium", cat: "project", due: "Apr 20", subtasks: 2, done: 1, tags: ["Data", "Hub"] },
      { id: 5, title: "Coordinator weekly debrief call", priority: "medium", cat: "recurring", due: "Today", subtasks: 0, done: 0, tags: ["Call"] },
    ],
  },
  {
    key: "overdue", label: "Overdue", color: "bg-red-500", count: 1,
    tasks: [
      { id: 6, title: "Send the Transportation For March 2026", priority: "urgent", cat: "personal", due: "Apr 02", subtasks: 1, done: 0, tags: ["Transport"] },
    ],
  },
  {
    key: "done", label: "Done", color: "bg-green-500", count: 2,
    tasks: [
      { id: 7, title: "Field coordinator sync — North Hub", priority: "medium", cat: "project", due: "Apr 10", subtasks: 0, done: 0, tags: ["Sync"] },
      { id: 8, title: "Update contact list Q1", priority: "low", cat: "personal", due: "Apr 08", subtasks: 0, done: 0, tags: [] },
    ],
  },
];

const PRIORITY_CONFIG = {
  urgent: { label: "Urgent", bar: "bg-red-500", badge: "bg-red-100 text-red-700", icon: "🔴" },
  high:   { label: "High",   bar: "bg-orange-400", badge: "bg-orange-100 text-orange-700", icon: "🟠" },
  medium: { label: "Med",    bar: "bg-amber-400", badge: "bg-amber-100 text-amber-700", icon: "🟡" },
  low:    { label: "Low",    bar: "bg-sky-400", badge: "bg-sky-100 text-sky-700", icon: "🔵" },
};

const CAT_COLORS: Record<string, string> = {
  project: "bg-blue-100 text-blue-700",
  personal: "bg-purple-100 text-purple-700",
  recurring: "bg-green-100 text-green-700",
};

function TaskCard({ task, done }: { task: Task; done?: boolean }) {
  const p = PRIORITY_CONFIG[task.priority];
  return (
    <div className={`bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all group cursor-grab ${done ? "opacity-60" : ""}`}>
      <div className={`h-1 ${p.bar} rounded-t-xl`} />
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className={`text-[13px] font-semibold leading-snug text-slate-800 ${done ? "line-through text-slate-400" : ""}`}>
            {done && <CheckCircle2 className="inline w-3.5 h-3.5 text-green-500 mr-1" />}
            {task.title}
          </p>
          <button className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <MoreHorizontal className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1 mb-2">
          {task.tags.map(tag => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full">{tag}</span>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${CAT_COLORS[task.cat]}`}>{task.cat}</span>
            {task.subtasks > 0 && (
              <span className="text-[10px] text-slate-400">
                {task.done}/{task.subtasks} ✓
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-slate-400">
            <Clock className="w-3 h-3" />
            <span>{task.due}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function V3KanbanBoard() {
  return (
    <div className="flex flex-col h-screen bg-[#f1f5f9] font-sans overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4 shrink-0">
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">My Workspace</p>
          <h1 className="text-xl font-bold text-[#0F2041]">My Tasks</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[12px] text-slate-400">Search…</span>
          </div>
          {["Cards", "Timeline", "Planner"].map((v, i) => (
            <button key={v} className={`px-3 py-1.5 rounded-lg text-[12px] font-medium ${
              v === "Cards" ? "bg-[#1D3461] text-white" : "text-slate-500 hover:bg-slate-100"
            }`}>{v}</button>
          ))}
          <button className="flex items-center gap-1.5 bg-[#1D3461] text-white px-3 py-1.5 rounded-lg text-[12px] font-semibold">
            <Plus className="w-4 h-4" /> New Task
          </button>
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 flex gap-4 p-5 overflow-x-auto overflow-y-hidden">
        {COLUMNS.map(col => (
          <div key={col.key} className="flex flex-col w-[280px] shrink-0">
            {/* Column header */}
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className={`w-3 h-3 rounded-full ${col.color}`} />
              <h2 className="text-[13px] font-bold text-slate-700">{col.label}</h2>
              <span className="ml-auto text-[11px] font-semibold text-slate-400 bg-slate-200 px-2 py-0.5 rounded-full">{col.count}</span>
            </div>

            {/* Column body */}
            <div className="flex-1 space-y-2.5 overflow-y-auto pb-4">
              {col.tasks.map(task => (
                <TaskCard key={task.id} task={task} done={col.key === "done"} />
              ))}
              <button className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-400 transition-colors text-[12px]">
                <Plus className="w-4 h-4" /> Add task
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer stats */}
      <div className="bg-white border-t border-slate-200 px-6 py-2.5 flex items-center gap-6 shrink-0">
        {[
          { label: "Total", val: 8, color: "text-slate-700" },
          { label: "Active", val: 5, color: "text-blue-600" },
          { label: "Overdue", val: 1, color: "text-red-600" },
          { label: "Done", val: 2, color: "text-green-600" },
          { label: "Completion Rate", val: "25%", color: "text-slate-600" },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400">{s.label}:</span>
            <span className={`text-[12px] font-bold ${s.color}`}>{s.val}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-red-500" />
          <span className="text-[11px] text-red-600 font-medium">1 overdue — action needed</span>
        </div>
      </div>
    </div>
  );
}
