// Option 6 — Priority Matrix (Eisenhower)
// Full 2x2 quadrant view: Urgent+Important | Important | Urgent | Eliminate
// Tasks are dropped into quadrants with drag-and-drop feel, labels, counts.

import { useState } from "react";
import {
  Plus, Zap, Clock, Star, Trash2, Flag, MoreHorizontal,
  AlertTriangle, CheckCircle2, Circle, Target, ArrowRight,
} from "lucide-react";

interface MatrixTask {
  id: number; title: string; priority: "urgent" | "high" | "medium" | "low";
  cat: string; due: string; quadrant: "do-first" | "schedule" | "delegate" | "eliminate";
}

const TASKS: MatrixTask[] = [
  { id: 1, title: "Send Transportation For March 2026", priority: "urgent", cat: "personal", due: "OVERDUE", quadrant: "do-first" },
  { id: 2, title: "Prepare Monthly Monitoring Plan Q2", priority: "high", cat: "project", due: "Apr 18", quadrant: "do-first" },
  { id: 3, title: "Review field data from Hub Khartoum", priority: "high", cat: "project", due: "Apr 20", quadrant: "schedule" },
  { id: 4, title: "Coordinator weekly debrief call", priority: "medium", cat: "recurring", due: "Today", quadrant: "schedule" },
  { id: 5, title: "Submit staff timesheet April", priority: "medium", cat: "personal", due: "Apr 30", quadrant: "delegate" },
  { id: 6, title: "Update site visit report — Kassala", priority: "high", cat: "project", due: "Apr 22", quadrant: "do-first" },
  { id: 7, title: "Archive completed Q1 reports", priority: "low", cat: "project", due: "No due date", quadrant: "eliminate" },
];

const QUADRANTS = [
  {
    key: "do-first" as const,
    label: "Do First",
    sub: "Urgent + Important",
    emoji: "🔴",
    color: "border-red-300 bg-red-50",
    headerColor: "bg-red-500",
    badge: "bg-red-500 text-white",
    hint: "Do these now — they're urgent AND important",
  },
  {
    key: "schedule" as const,
    label: "Schedule",
    sub: "Important, Not Urgent",
    emoji: "📅",
    color: "border-blue-300 bg-blue-50",
    headerColor: "bg-blue-500",
    badge: "bg-blue-500 text-white",
    hint: "Plan these — they're important but can wait",
  },
  {
    key: "delegate" as const,
    label: "Delegate",
    sub: "Urgent, Not Important",
    emoji: "👤",
    color: "border-amber-300 bg-amber-50",
    headerColor: "bg-amber-500",
    badge: "bg-amber-500 text-white",
    hint: "Delegate or minimize — urgent but not important",
  },
  {
    key: "eliminate" as const,
    label: "Eliminate",
    sub: "Not Urgent, Not Important",
    emoji: "🗑️",
    color: "border-slate-200 bg-slate-50",
    headerColor: "bg-slate-400",
    badge: "bg-slate-400 text-white",
    hint: "Drop these — they drain time without value",
  },
];

const catColor: Record<string, string> = {
  project: "bg-blue-100 text-blue-700",
  personal: "bg-purple-100 text-purple-700",
  recurring: "bg-green-100 text-green-700",
};

export function V6PriorityMatrix() {
  const [tasks, setTasks] = useState(TASKS);

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc] font-sans overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-4 shrink-0">
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">My Workspace</p>
          <h1 className="text-xl font-bold text-[#0F2041]">Priority Matrix</h1>
        </div>
        <div className="ml-4 flex items-center gap-2 text-[12px]">
          <Target className="w-4 h-4 text-slate-400" />
          <span className="text-slate-500">Eisenhower Decision Matrix — drag tasks to reprioritize</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {["Cards", "Timeline", "Matrix"].map(v => (
            <button key={v} className={`px-3 py-1.5 rounded-lg text-[12px] font-medium ${
              v === "Matrix" ? "bg-[#1D3461] text-white" : "text-slate-500 hover:bg-slate-100"
            }`}>{v}</button>
          ))}
          <button className="flex items-center gap-1.5 bg-[#1D3461] text-white px-3 py-1.5 rounded-lg text-[12px] font-semibold">
            <Plus className="w-4 h-4" /> New Task
          </button>
        </div>
      </div>

      {/* Axis labels */}
      <div className="relative shrink-0">
        <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          <ArrowRight className="w-3.5 h-3.5" /> IMPORTANCE →
        </div>
      </div>

      {/* 2x2 Grid */}
      <div className="flex-1 p-4 overflow-hidden">
        <div className="h-full grid grid-cols-2 grid-rows-2 gap-3">
          {QUADRANTS.map(q => {
            const qTasks = tasks.filter(t => t.quadrant === q.key);
            return (
              <div key={q.key} className={`rounded-2xl border-2 ${q.color} flex flex-col overflow-hidden`}>
                {/* Quadrant header */}
                <div className={`${q.headerColor} px-4 py-2.5 flex items-center gap-2`}>
                  <span className="text-base">{q.emoji}</span>
                  <div>
                    <p className="text-[13px] font-bold text-white">{q.label}</p>
                    <p className="text-[10px] text-white/70">{q.sub}</p>
                  </div>
                  <span className={`ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white`}>
                    {qTasks.length}
                  </span>
                </div>

                {/* Hint */}
                <p className="text-[10px] text-slate-500 italic px-4 py-1.5 border-b border-white/50">{q.hint}</p>

                {/* Task cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                  {qTasks.map(task => (
                    <div key={task.id} className="bg-white rounded-lg border border-white shadow-sm p-2.5 flex items-start gap-2 group hover:shadow-md transition-all">
                      <Circle className="w-4 h-4 text-slate-300 mt-0.5 shrink-0 group-hover:text-slate-400 transition-colors" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-slate-800 leading-tight">{task.title}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${catColor[task.cat]}`}>{task.cat}</span>
                          <span className={`text-[9px] text-slate-400 flex items-center gap-0.5 ${task.due === "OVERDUE" ? "text-red-600 font-semibold" : ""}`}>
                            <Clock className="w-2.5 h-2.5" />{task.due}
                          </span>
                        </div>
                      </div>
                      <button className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <MoreHorizontal className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    </div>
                  ))}
                  {qTasks.length === 0 && (
                    <div className="flex items-center justify-center h-full text-[11px] text-slate-400 italic py-4">
                      Drop tasks here
                    </div>
                  )}
                  <button className="w-full flex items-center justify-center gap-1 py-1.5 text-[11px] text-slate-400 hover:text-blue-500 transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Add task
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* URGENCY axis label */}
      <div className="px-6 pb-2 shrink-0">
        <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider justify-center">
          ↑ URGENCY ↑
        </div>
      </div>
    </div>
  );
}
