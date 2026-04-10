import { useState } from "react";
import {
  Plus, Clock, ChevronLeft, ChevronRight,
  CheckCircle2, Circle, MoreHorizontal, Zap,
  Calendar, ArrowRight, GripVertical, AlertCircle,
} from "lucide-react";

interface Block {
  id: number;
  taskId: number | null;
  hour: number;
  duration: number;
  label?: string;
  color?: string;
}

interface Task {
  id: number;
  title: string;
  project: string;
  est: number;
  priority: "urgent" | "high" | "normal" | "low";
  due: string;
  scheduled: boolean;
}

const TASKS: Task[] = [
  { id: 1, title: "Review Q2 MMP coverage report", project: "MMP Cycle 4", est: 45, priority: "urgent", due: "Today", scheduled: true },
  { id: 2, title: "Approve transport cost submissions", project: "Finance", est: 20, priority: "urgent", due: "Today", scheduled: true },
  { id: 3, title: "Follow up on Gedaref sites", project: "Field Ops", est: 30, priority: "high", due: "Tomorrow", scheduled: false },
  { id: 4, title: "Update DC assignments – Cycle 5", project: "MMP", est: 60, priority: "normal", due: "Apr 12", scheduled: false },
  { id: 5, title: "Generate payroll report", project: "HR Hub", est: 45, priority: "normal", due: "Apr 14", scheduled: false },
  { id: 6, title: "Review leave requests", project: "HR Hub", est: 15, priority: "low", due: "Apr 15", scheduled: false },
];

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-400",
  normal: "bg-blue-400",
  low: "bg-slate-300",
};

const INITIAL_BLOCKS: Block[] = [
  { id: 1, taskId: 1, hour: 9, duration: 1, label: "MMP Coverage Review", color: "bg-red-100 border-red-300 text-red-800" },
  { id: 2, taskId: null, hour: 10, duration: 1, label: "🚫 Focus Block", color: "bg-slate-100 border-slate-300 text-slate-500" },
  { id: 3, taskId: 2, hour: 11, duration: 1, label: "Kassala Cost Approvals", color: "bg-orange-100 border-orange-300 text-orange-800" },
  { id: 4, taskId: null, hour: 12, duration: 1, label: "🍽 Lunch break", color: "bg-emerald-50 border-emerald-200 text-emerald-600" },
  { id: 5, taskId: null, hour: 14, duration: 2, label: "🕐 Open", color: "" },
  { id: 6, taskId: null, hour: 16, duration: 1, label: "🔁 Review & Plan tomorrow", color: "bg-violet-50 border-violet-200 text-violet-600" },
];

const HOURS = Array.from({ length: 10 }, (_, i) => i + 8); // 8am to 5pm
const HOUR_HEIGHT = 60;

export function TimeBlockStyle() {
  const [blocks, setBlocks] = useState<Block[]>(INITIAL_BLOCKS);
  const [dragTaskId, setDragTaskId] = useState<number | null>(null);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);

  const unscheduled = TASKS.filter(t => !t.scheduled);
  const totalScheduled = HOURS.filter(h => blocks.some(b => b.taskId !== null && b.hour <= h && h < b.hour + b.duration)).length;
  const freeHours = HOURS.length - blocks.filter(b => b.label !== "" || b.color !== "").length;

  function getBlockAt(hour: number) {
    return blocks.find(b => b.hour <= hour && hour < b.hour + b.duration);
  }

  return (
    <div className="min-h-screen bg-white flex flex-col" style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <button className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"><ChevronLeft className="h-4 w-4 text-slate-600" /></button>
          <div>
            <h1 className="text-[16px] font-bold text-slate-900">Friday, Apr 10</h1>
            <p className="text-[11.5px] text-slate-400">{totalScheduled}h scheduled · {freeHours}h open</p>
          </div>
          <button className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"><ChevronRight className="h-4 w-4 text-slate-600" /></button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-[11.5px] text-slate-500">
            <div className="h-2.5 w-2.5 rounded-sm bg-red-400" /> Urgent
            <div className="h-2.5 w-2.5 rounded-sm bg-orange-400 ml-1" /> High
            <div className="h-2.5 w-2.5 rounded-sm bg-blue-400 ml-1" /> Normal
          </div>
          <button className="flex items-center gap-1.5 text-[12px] font-semibold text-white bg-[#1D3461] hover:bg-[#0F2041] rounded-lg px-3 h-8 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Block time
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Timeline */}
        <div className="flex-1 min-w-0 overflow-y-auto border-r border-slate-100">
          {/* Now indicator at 9:15 */}
          <div className="relative">
            {HOURS.map(hour => {
              const block = getBlockAt(hour);
              const isNow = hour === 9;
              const isEmpty = !block;
              return (
                <div key={hour}
                  onDragOver={e => { e.preventDefault(); setHoveredHour(hour); }}
                  onDragLeave={() => setHoveredHour(null)}
                  onDrop={e => {
                    e.preventDefault();
                    if (dragTaskId !== null) {
                      const task = TASKS.find(t => t.id === dragTaskId);
                      if (task) {
                        setBlocks(prev => [...prev.filter(b => !(b.hour === hour)), {
                          id: Date.now(), taskId: dragTaskId, hour,
                          duration: Math.ceil(task.est / 60) || 1,
                          label: task.title,
                          color: task.priority === "urgent" ? "bg-red-100 border-red-300 text-red-800" : task.priority === "high" ? "bg-orange-100 border-orange-300 text-orange-800" : "bg-blue-100 border-blue-300 text-blue-800",
                        }]);
                      }
                      setDragTaskId(null); setHoveredHour(null);
                    }
                  }}
                  className={`flex border-b border-slate-50 transition-colors ${hoveredHour === hour ? "bg-blue-50" : ""}`}
                  style={{ height: HOUR_HEIGHT }}>
                  {/* Hour label */}
                  <div className="w-14 flex-shrink-0 flex items-start justify-end pr-3 pt-1.5">
                    <span className={`text-[11px] font-medium ${isNow ? "text-blue-600" : "text-slate-400"}`}>
                      {hour === 12 ? "12 PM" : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
                    </span>
                  </div>
                  {/* Block area */}
                  <div className="flex-1 relative pr-4 pt-1 pb-0.5">
                    {isNow && (
                      <div className="absolute left-0 right-4 top-4 flex items-center z-10">
                        <div className="h-2 w-2 rounded-full bg-blue-500 -ml-1 flex-shrink-0" />
                        <div className="flex-1 h-px bg-blue-500" />
                      </div>
                    )}
                    {block && block.hour === hour ? (
                      <div className={`h-full rounded-lg border px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:shadow-sm transition-all ${block.color || "bg-slate-50 border-dashed border-slate-200"}`}>
                        <GripVertical className="h-3.5 w-3.5 opacity-40 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className={`text-[12.5px] font-semibold truncate ${!block.color ? "text-slate-400" : ""}`}>{block.label}</p>
                          {block.taskId && (
                            <p className="text-[10.5px] opacity-70">{TASKS.find(t => t.id === block.taskId)?.project}</p>
                          )}
                        </div>
                        {block.taskId && <Clock className="h-3 w-3 opacity-50 flex-shrink-0" />}
                      </div>
                    ) : isEmpty ? (
                      <div className={`h-full rounded-lg border-2 border-dashed flex items-center justify-center transition-colors ${hoveredHour === hour ? "border-blue-400 bg-blue-50" : "border-transparent"}`}>
                        {hoveredHour === hour && <span className="text-[11px] text-blue-500 font-medium">Drop here</span>}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Unscheduled sidebar */}
        <div className="w-64 flex-shrink-0 bg-slate-50 flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-violet-500" />
              <h3 className="text-[12px] font-bold text-slate-600 uppercase tracking-wider">Unscheduled</h3>
              <span className="ml-auto text-[11px] text-slate-400 bg-slate-200 rounded-full px-2 py-0.5 font-medium">{unscheduled.length}</span>
            </div>
            <p className="text-[10.5px] text-slate-400 mt-1">Drag to add to your day</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {TASKS.map(task => (
              <div key={task.id}
                draggable
                onDragStart={() => setDragTaskId(task.id)}
                onDragEnd={() => setDragTaskId(null)}
                className={`bg-white rounded-xl border border-slate-200 p-3 cursor-grab active:cursor-grabbing hover:shadow-md hover:border-slate-300 transition-all group ${dragTaskId === task.id ? "opacity-50 scale-95" : ""}`}>
                <div className="flex items-start gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 mt-1 ${PRIORITY_COLOR[task.priority]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-semibold text-slate-800 leading-snug">{task.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10.5px] text-slate-400">{task.project}</span>
                      <span className="text-[10.5px] text-slate-300">·</span>
                      <span className="text-[10.5px] text-slate-400 flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />{task.est}m
                      </span>
                    </div>
                  </div>
                  <GripVertical className="h-4 w-4 text-slate-300 group-hover:text-slate-400 flex-shrink-0 mt-0.5 transition-colors" />
                </div>
                {task.due === "Today" && (
                  <div className="flex items-center gap-1 mt-2 text-[10.5px] text-red-500 font-medium">
                    <AlertCircle className="h-3 w-3" /> Due today
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Day capacity indicator */}
          <div className="px-4 py-3 border-t border-slate-100 bg-white">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-slate-500 font-medium">Day capacity</span>
              <span className="text-[11px] text-slate-400">4h / 9h</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full" style={{ width: "44%" }} />
            </div>
            <p className="text-[10.5px] text-slate-400 mt-1">5 hours still available</p>
          </div>
        </div>
      </div>
    </div>
  );
}
