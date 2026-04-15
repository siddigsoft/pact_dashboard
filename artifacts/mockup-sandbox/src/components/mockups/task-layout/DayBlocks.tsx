import { useState } from "react";
import {
  Sun, Coffee, Moon, Plus, CheckCircle2, AlertCircle, Clock,
  ChevronRight, Zap, Sunset, Star, MoreHorizontal, Briefcase, User, Users
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

type Priority = "urgent" | "high" | "normal";
type Block = "morning" | "afternoon" | "evening" | "unscheduled";

interface BlockTask {
  id: string;
  title: string;
  block: Block;
  priority: Priority;
  minutes: number;
  done: boolean;
  type: "personal" | "project" | "collaborative";
  project?: string;
}

const BLOCK_CONFIG: Record<Block, {
  label: string;
  time: string;
  hint: string;
  icon: typeof Sun;
  bg: string;
  accent: string;
  text: string;
  pill: string;
  capacity: number;
}> = {
  morning: {
    label: "Morning Focus",
    time: "8:00 – 12:00",
    hint: "Deep work, critical decisions",
    icon: Coffee,
    bg: "bg-gradient-to-b from-amber-50 to-orange-50",
    accent: "border-amber-300",
    text: "text-amber-800",
    pill: "bg-amber-100 text-amber-700",
    capacity: 4 * 60,
  },
  afternoon: {
    label: "Afternoon Work",
    time: "13:00 – 17:00",
    hint: "Meetings, coordination, reviews",
    icon: Sun,
    bg: "bg-gradient-to-b from-blue-50 to-sky-50",
    accent: "border-blue-300",
    text: "text-blue-800",
    pill: "bg-blue-100 text-blue-700",
    capacity: 4 * 60,
  },
  evening: {
    label: "Evening Review",
    time: "17:00 – 19:00",
    hint: "Admin, wrap-up, planning ahead",
    icon: Moon,
    bg: "bg-gradient-to-b from-indigo-50 to-violet-50",
    accent: "border-indigo-300",
    text: "text-indigo-800",
    pill: "bg-indigo-100 text-indigo-700",
    capacity: 2 * 60,
  },
  unscheduled: {
    label: "Unscheduled",
    time: "No block yet",
    hint: "Drag to a block above",
    icon: Star,
    bg: "bg-slate-50",
    accent: "border-slate-300 border-dashed",
    text: "text-slate-600",
    pill: "bg-slate-100 text-slate-500",
    capacity: 9999,
  },
};

const INITIAL_TASKS: BlockTask[] = [
  { id: "m1", title: "Approve Vehicle Requisition — Kassala", block: "morning", priority: "urgent", minutes: 20, done: false, type: "project", project: "Kassala" },
  { id: "m2", title: "Review MMP Q2 report before submission", block: "morning", priority: "urgent", minutes: 60, done: false, type: "project", project: "El-Fasher" },
  { id: "m3", title: "Security sign-off — Blue Nile", block: "morning", priority: "high", minutes: 30, done: true, type: "project", project: "Blue Nile" },
  { id: "a1", title: "Coordination meeting — El-Fasher team", block: "afternoon", priority: "high", minutes: 60, done: false, type: "collaborative" },
  { id: "a2", title: "Review budget realignment proposal", block: "afternoon", priority: "high", minutes: 45, done: false, type: "personal", project: "Finance" },
  { id: "a3", title: "Update field operations protocol", block: "afternoon", priority: "normal", minutes: 30, done: false, type: "collaborative", project: "Operations" },
  { id: "e1", title: "Write weekly briefing notes", block: "evening", priority: "normal", minutes: 30, done: false, type: "personal" },
  { id: "e2", title: "Plan tomorrow's site visit schedule", block: "evening", priority: "normal", minutes: 20, done: false, type: "personal" },
  { id: "u1", title: "Data entry — Kassala Q1 forms", block: "unscheduled", priority: "normal", minutes: 90, done: false, type: "project", project: "Kassala" },
  { id: "u2", title: "Staff performance reviews", block: "unscheduled", priority: "high", minutes: 60, done: false, type: "personal" },
];

const PRIORITY_COLOR: Record<Priority, { dot: string; badge: string }> = {
  urgent: { dot: "bg-red-500", badge: "text-red-600 bg-red-50" },
  high:   { dot: "bg-amber-500", badge: "text-amber-600 bg-amber-50" },
  normal: { dot: "bg-slate-400", badge: "text-slate-500 bg-slate-100" },
};

function minutesLabel(m: number) {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

export function DayBlocks() {
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<Block | null>(null);

  const toggle = (id: string) =>
    setTasks(ts => ts.map(t => t.id === id ? { ...t, done: !t.done } : t));

  const getBlockTasks = (block: Block) => tasks.filter(t => t.block === block);
  const getUsed = (block: Block) =>
    getBlockTasks(block).filter(t => !t.done).reduce((s, t) => s + t.minutes, 0);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="flex h-screen w-full bg-[#f7f8fc] overflow-hidden font-sans">
      {/* Left — Day overview */}
      <div className="w-56 flex flex-col bg-white border-r border-slate-200 shrink-0">
        <div className="px-5 pt-5 pb-4 border-b border-slate-100">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Today</p>
          <p className="text-sm font-bold text-[#0F2041] leading-tight">{today}</p>
        </div>

        {/* Energy level / time summary */}
        <div className="px-4 py-4 flex flex-col gap-3">
          {(["morning", "afternoon", "evening"] as Block[]).map(b => {
            const cfg = BLOCK_CONFIG[b];
            const blockTasks = getBlockTasks(b);
            const used = getUsed(b);
            const pct = Math.min(100, (used / cfg.capacity) * 100);
            const done = blockTasks.filter(t => t.done).length;
            return (
              <div key={b} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <cfg.icon className={cn("w-3.5 h-3.5", cfg.text)} />
                    <span className="text-xs font-semibold text-slate-700">{cfg.label}</span>
                  </div>
                  <span className="text-[10px] text-slate-400">{done}/{blockTasks.length}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={cn(
                    "h-full rounded-full transition-all",
                    pct > 85 ? "bg-red-400" : pct > 60 ? "bg-amber-400" : "bg-emerald-400"
                  )} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[10px] text-slate-400">{minutesLabel(used)} / {minutesLabel(cfg.capacity)}</p>
              </div>
            );
          })}
        </div>

        {/* Total stats */}
        <div className="px-4 py-4 border-t border-slate-100 mt-auto">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Total tasks", value: tasks.length },
              { label: "Done", value: tasks.filter(t => t.done).length },
              { label: "Urgent", value: tasks.filter(t => t.priority === "urgent").length },
              { label: "Unscheduled", value: getBlockTasks("unscheduled").length },
            ].map(s => (
              <div key={s.label} className="bg-slate-50 rounded-lg p-2 text-center">
                <p className="text-base font-bold text-[#0F2041]">{s.value}</p>
                <p className="text-[10px] text-slate-400">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — Blocks */}
      <div className="flex-1 overflow-auto p-5 flex flex-col gap-4">
        {(["morning", "afternoon", "evening", "unscheduled"] as Block[]).map(block => {
          const cfg = BLOCK_CONFIG[block];
          const blockTasks = getBlockTasks(block);
          const used = getUsed(block);
          const isOver = used > cfg.capacity;

          return (
            <div
              key={block}
              className={cn(
                "rounded-2xl border-2 overflow-hidden transition-all",
                cfg.accent,
                dropTarget === block && "ring-2 ring-[#1D3461] ring-offset-2"
              )}
              onDragOver={e => { e.preventDefault(); setDropTarget(block); }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={() => {
                if (dragging) {
                  setTasks(ts => ts.map(t => t.id === dragging ? { ...t, block } : t));
                  setDragging(null); setDropTarget(null);
                }
              }}
            >
              {/* Block header */}
              <div className={cn("px-5 py-3 flex items-center gap-3", cfg.bg, "border-b", cfg.accent)}>
                <cfg.icon className={cn("w-4 h-4 shrink-0", cfg.text)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-bold", cfg.text)}>{cfg.label}</span>
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", cfg.pill)}>{cfg.time}</span>
                    {isOver && block !== "unscheduled" && (
                      <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">⚠ Overloaded</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{cfg.hint}</p>
                </div>
                {block !== "unscheduled" && (
                  <span className="text-xs text-slate-400 shrink-0">
                    {minutesLabel(used)} used · {blockTasks.length} tasks
                  </span>
                )}
                <button className={cn("p-1.5 rounded-lg transition-colors hover:bg-white/60", cfg.text)}>
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Tasks in block */}
              <div className={cn("p-4 flex flex-col gap-2", cfg.bg)}>
                {blockTasks.length === 0 && (
                  <div className="text-center py-4 text-xs text-slate-300 border-2 border-dashed border-slate-200 rounded-xl">
                    Drop tasks here
                  </div>
                )}
                {blockTasks.map(task => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => setDragging(task.id)}
                    onDragEnd={() => setDragging(null)}
                    className={cn(
                      "bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3 cursor-grab active:cursor-grabbing hover:shadow-sm transition-all group",
                      task.done && "opacity-50",
                      dragging === task.id && "opacity-30 scale-95"
                    )}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => toggle(task.id)}
                      className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                        task.done
                          ? "bg-emerald-500 border-emerald-500"
                          : "border-slate-300 hover:border-emerald-400"
                      )}
                    >
                      {task.done && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                    </button>

                    {/* Priority dot */}
                    <div className={cn("w-2 h-2 rounded-full shrink-0", PRIORITY_COLOR[task.priority].dot)} />

                    {/* Title */}
                    <span className={cn("flex-1 text-sm font-medium text-slate-700 min-w-0 truncate", task.done && "line-through text-slate-400")}>
                      {task.title}
                    </span>

                    {/* Meta */}
                    <div className="flex items-center gap-2 shrink-0">
                      {task.project && (
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full hidden group-hover:inline-block">
                          {task.project}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />{minutesLabel(task.minutes)}
                      </span>
                    </div>
                    <button className="text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
