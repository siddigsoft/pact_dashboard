// Option 5 — Focus Mode (Zen Single-Task)
// One task front-and-center with a deep-work timer, next up queue in slim sidebar.
// Minimalist, distraction-free, pomodoro-style.

import { useState } from "react";
import {
  Timer, ChevronRight, CheckCircle2, Circle, AlertTriangle,
  Play, Pause, SkipForward, Plus, Coffee, Zap, Clock,
  ArrowLeft, MoreHorizontal, Flag,
} from "lucide-react";

const QUEUE = [
  { id: 2, title: "Prepare Monthly Monitoring Plan Q2", priority: "high", due: "Apr 18", cat: "project" },
  { id: 3, title: "Review field data from Hub Khartoum", priority: "medium", due: "Apr 20", cat: "project" },
  { id: 4, title: "Coordinator weekly debrief call", priority: "medium", due: "Today", cat: "recurring" },
  { id: 5, title: "Submit staff timesheet April", priority: "low", due: "Apr 30", cat: "personal" },
];

const ACTIVE = {
  id: 1, title: "Send the Transportation For March 2026",
  priority: "high", cat: "personal", due: "Apr 02",
  notes: "Contact the transport team and collect all receipts from March field visits before submitting.",
  subtasks: [
    { id: 1, label: "Collect receipts from all field coordinators", done: false },
    { id: 2, label: "Fill transport cost form", done: false },
    { id: 3, label: "Get supervisor signature", done: false },
  ],
  tags: ["Transport", "Finance"],
  pomodoros: 2,
};

const prioColor: Record<string, string> = { high: "#ef4444", medium: "#f59e0b", low: "#38bdf8" };
const prioLabel: Record<string, string> = { high: "High Priority", medium: "Medium Priority", low: "Low Priority" };

export function V5FocusMode() {
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(25 * 60);
  const [subtasks, setSubtasks] = useState(ACTIVE.subtasks);

  const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  const circumference = 2 * Math.PI * 54;
  const progress = ((25 * 60 - seconds) / (25 * 60)) * circumference;

  const toggle = (id: number) => setSubtasks(prev =>
    prev.map(s => s.id === id ? { ...s, done: !s.done } : s)
  );

  return (
    <div className="flex h-screen bg-[#fafaf9] font-sans overflow-hidden">
      {/* MAIN FOCUS AREA */}
      <div className="flex-1 flex flex-col items-center justify-start overflow-y-auto">
        {/* Top bar */}
        <div className="w-full flex items-center justify-between px-8 pt-6 pb-0">
          <button className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600 text-[13px] transition-colors">
            <ArrowLeft className="w-4 h-4" /> All Tasks
          </button>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: prioColor[ACTIVE.priority] }} />
            <span className="text-[12px] text-slate-500 font-medium">{prioLabel[ACTIVE.priority]}</span>
          </div>
          <button className="text-slate-400 hover:text-slate-600">
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>

        {/* Overdue alert */}
        <div className="mx-8 mt-4 w-[calc(100%-4rem)] flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-[12px] text-red-700 font-medium">This task is <strong>overdue</strong> since Apr 02 — resolve it immediately.</p>
        </div>

        {/* Task title */}
        <div className="px-8 mt-6 w-full max-w-2xl mx-auto">
          <h1 className="text-[26px] font-bold text-[#0F2041] leading-tight">{ACTIVE.title}</h1>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {ACTIVE.tags.map(tag => (
              <span key={tag} className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-[11px] font-medium">{tag}</span>
            ))}
            <span className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-[11px] font-medium">{ACTIVE.cat}</span>
            <div className="flex items-center gap-1 text-[12px] text-red-600">
              <Clock className="w-3.5 h-3.5" />
              <span>Due {ACTIVE.due}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="px-8 mt-5 w-full max-w-2xl mx-auto">
          <p className="text-[14px] text-slate-600 leading-relaxed bg-amber-50 rounded-xl p-4 border border-amber-100">
            {ACTIVE.notes}
          </p>
        </div>

        {/* Subtasks */}
        <div className="px-8 mt-5 w-full max-w-2xl mx-auto">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">
            Subtasks — {subtasks.filter(s => s.done).length}/{subtasks.length}
          </p>
          <div className="h-1.5 bg-slate-100 rounded-full mb-4 overflow-hidden">
            <div
              className="h-full bg-green-400 rounded-full transition-all"
              style={{ width: `${(subtasks.filter(s => s.done).length / subtasks.length) * 100}%` }}
            />
          </div>
          <div className="space-y-2">
            {subtasks.map(s => (
              <button
                key={s.id}
                onClick={() => toggle(s.id)}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 hover:border-blue-200 transition-all text-left"
              >
                {s.done ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-300 shrink-0" />
                )}
                <span className={`text-[13px] ${s.done ? "line-through text-slate-400" : "text-slate-700"}`}>{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Pomodoro timer */}
        <div className="px-8 mt-6 mb-8 w-full max-w-2xl mx-auto">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5" /> Focus Timer
          </p>
          <div className="bg-white rounded-2xl border border-slate-100 p-6 flex items-center gap-6">
            {/* SVG ring timer */}
            <div className="relative shrink-0">
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="54" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                <circle
                  cx="60" cy="60" r="54" fill="none"
                  stroke="#1D3461" strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference - progress}
                  strokeLinecap="round"
                  transform="rotate(-90 60 60)"
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-[#0F2041] font-mono">{mins}:{secs}</span>
                <span className="text-[10px] text-slate-400">remaining</span>
              </div>
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-medium text-slate-700 mb-1">Pomodoro Session {ACTIVE.pomodoros}</p>
              <p className="text-[11px] text-slate-400 mb-4">25 min deep work · 5 min break</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRunning(!running)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors ${
                    running ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-[#1D3461] text-white hover:bg-[#0F2041]"
                  }`}
                >
                  {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  {running ? "Pause" : "Start Focus"}
                </button>
                <button className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-colors">
                  <SkipForward className="w-4 h-4" />
                </button>
                <button className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-colors">
                  <Coffee className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* QUEUE SIDEBAR */}
      <aside className="w-[260px] bg-white border-l border-slate-100 flex flex-col shrink-0">
        <div className="px-4 py-4 border-b border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Up Next</p>
          <p className="text-[12px] text-slate-500 mt-0.5">{QUEUE.length} tasks in queue</p>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {QUEUE.map((task, i) => (
            <div key={task.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors group cursor-pointer">
              <span className="text-[11px] text-slate-300 w-5 shrink-0 text-center font-bold">{i + 1}</span>
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: prioColor[task.priority] }} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-slate-700 font-medium leading-tight line-clamp-2">{task.title}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{task.due}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-slate-100">
          <button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-500 text-[12px] transition-colors">
            <Plus className="w-4 h-4" /> Add to queue
          </button>
        </div>
      </aside>
    </div>
  );
}
