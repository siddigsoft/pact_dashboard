import { useState } from "react";
import {
  AlertTriangle, Calendar, Users, Trash2,
  Plus, X, CheckCircle2, Clock, ArrowRight, Zap,
  ChevronDown,
} from "lucide-react";

type Quadrant = "do" | "schedule" | "delegate" | "eliminate";

interface Task {
  id: number;
  title: string;
  project: string;
  due?: string;
  q: Quadrant;
}

const INITIAL_TASKS: Task[] = [
  { id: 1, title: "Review Q2 MMP coverage report", project: "MMP Cycle 4", due: "Today", q: "do" },
  { id: 2, title: "Approve transport cost submissions for Kassala", project: "Finance", due: "Today", q: "do" },
  { id: 3, title: "Update data collector assignments", project: "MMP Cycle 5", due: "Apr 12", q: "schedule" },
  { id: 4, title: "Generate payroll report — March 2026", project: "HR Hub", due: "Apr 14", q: "schedule" },
  { id: 5, title: "Prepare site visit report — Khartoum North", project: "Field Ops", due: "Apr 20", q: "schedule" },
  { id: 6, title: "Follow up on Gedaref uncovered sites", project: "Field Ops", due: "Apr 11", q: "delegate" },
  { id: 7, title: "Review leave requests", project: "HR Hub", due: "Apr 15", q: "delegate" },
  { id: 8, title: "Sync CRM partner list", project: "CRM", due: undefined, q: "eliminate" },
];

const Q_CONFIG: Record<Quadrant, {
  label: string; subtitle: string; icon: JSX.Element;
  bg: string; border: string; header: string; badge: string; badgeText: string;
  chip: string;
}> = {
  do: {
    label: "Do First",
    subtitle: "Urgent + Important",
    icon: <AlertTriangle className="h-4 w-4" />,
    bg: "bg-red-50",
    border: "border-red-200",
    header: "bg-red-500 text-white",
    badge: "bg-red-500 text-white",
    badgeText: "text-red-700",
    chip: "bg-red-100 text-red-700 border border-red-200",
  },
  schedule: {
    label: "Schedule",
    subtitle: "Important, Not Urgent",
    icon: <Calendar className="h-4 w-4" />,
    bg: "bg-blue-50",
    border: "border-blue-200",
    header: "bg-blue-500 text-white",
    badge: "bg-blue-500 text-white",
    badgeText: "text-blue-700",
    chip: "bg-blue-100 text-blue-700 border border-blue-200",
  },
  delegate: {
    label: "Delegate",
    subtitle: "Urgent, Not Important",
    icon: <Users className="h-4 w-4" />,
    bg: "bg-amber-50",
    border: "border-amber-200",
    header: "bg-amber-500 text-white",
    badge: "bg-amber-500 text-white",
    badgeText: "text-amber-700",
    chip: "bg-amber-100 text-amber-700 border border-amber-200",
  },
  eliminate: {
    label: "Eliminate",
    subtitle: "Not Urgent, Not Important",
    icon: <Trash2 className="h-4 w-4" />,
    bg: "bg-slate-50",
    border: "border-slate-200",
    header: "bg-slate-400 text-white",
    badge: "bg-slate-400 text-white",
    badgeText: "text-slate-500",
    chip: "bg-slate-100 text-slate-500 border border-slate-200",
  },
};

export function MatrixStyle() {
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<Quadrant | null>(null);

  function moveTask(id: number, toQ: Quadrant) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, q: toQ } : t));
  }

  function removeTask(id: number) {
    setDone(prev => { const n = new Set(prev); n.add(id); return n; });
  }

  const activeTotal = tasks.filter(t => !done.has(t.id)).length;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col" style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-bold text-slate-900 flex items-center gap-2">
            <Zap className="h-5 w-5 text-violet-500" />
            Priority Matrix
          </h1>
          <p className="text-[12px] text-slate-500 mt-0.5">Drag tasks between quadrants · {activeTotal} tasks remaining</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[12px] text-slate-500">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block" /> Do First
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500 inline-block ml-2" /> Schedule
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500 inline-block ml-2" /> Delegate
            <span className="h-2.5 w-2.5 rounded-full bg-slate-400 inline-block ml-2" /> Eliminate
          </div>
          <button className="flex items-center gap-1.5 text-[12px] font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg px-3 h-8 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Add task
          </button>
        </div>
      </div>

      {/* Axes labels */}
      <div className="relative flex items-center justify-center py-1.5">
        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
          <ArrowRight className="h-3.5 w-3.5" /> Importance →
        </div>
      </div>

      {/* 2×2 Grid */}
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-3 px-4 pb-4" style={{ minHeight: 0 }}>
        {(["do","schedule","delegate","eliminate"] as Quadrant[]).map(q => {
          const cfg = Q_CONFIG[q];
          const qTasks = tasks.filter(t => t.q === q && !done.has(t.id));
          const isDragOver = dragOver === q;
          return (
            <div key={q}
              onDragOver={e => { e.preventDefault(); setDragOver(q); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => { e.preventDefault(); if (dragId !== null) { moveTask(dragId, q); setDragId(null); setDragOver(null); } }}
              className={`rounded-2xl border-2 flex flex-col overflow-hidden transition-all ${cfg.bg} ${isDragOver ? "border-violet-400 shadow-lg scale-[1.01]" : cfg.border}`}>
              {/* Quadrant header */}
              <div className={`flex items-center justify-between px-4 py-2.5 ${cfg.header}`}>
                <div className="flex items-center gap-2">
                  {cfg.icon}
                  <div>
                    <p className="text-[13px] font-bold leading-none">{cfg.label}</p>
                    <p className="text-[10px] opacity-80 mt-0.5">{cfg.subtitle}</p>
                  </div>
                </div>
                <span className="text-[12px] font-bold bg-white/20 rounded-full px-2 py-0.5">{qTasks.length}</span>
              </div>

              {/* Task cards */}
              <div className="flex-1 p-3 space-y-2 overflow-y-auto">
                {qTasks.map(task => (
                  <div key={task.id}
                    draggable
                    onDragStart={() => setDragId(task.id)}
                    onDragEnd={() => { setDragId(null); setDragOver(null); }}
                    className={`bg-white rounded-xl p-3 shadow-sm border border-white/80 cursor-grab active:cursor-grabbing transition-all hover:shadow-md group ${dragId === task.id ? "opacity-50 scale-95" : ""}`}>
                    <div className="flex items-start gap-2">
                      <button onClick={() => removeTask(task.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 flex-shrink-0">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 hover:text-emerald-500" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-semibold text-slate-800 leading-snug">{task.title}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${cfg.chip}`}>{task.project}</span>
                          {task.due && (
                            <span className={`text-[10.5px] flex items-center gap-0.5 ${task.due === "Today" ? "text-red-500 font-semibold" : "text-slate-400"}`}>
                              <Clock className="h-2.5 w-2.5" />{task.due}
                            </span>
                          )}
                        </div>
                      </div>
                      <button onClick={() => removeTask(task.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-slate-500 flex-shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {qTasks.length === 0 && (
                  <div className={`flex items-center justify-center h-12 rounded-xl border-2 border-dashed ${isDragOver ? "border-violet-400 bg-violet-50" : "border-slate-200"} text-[11.5px] text-slate-400 transition-colors`}>
                    {isDragOver ? "Drop here" : "Drop tasks here"}
                  </div>
                )}
                <button className="flex items-center gap-1.5 w-full text-[11.5px] text-slate-400 hover:text-slate-600 py-1.5 px-2 rounded-lg hover:bg-white/60 transition-colors">
                  <Plus className="h-3.5 w-3.5" /> Add here
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
