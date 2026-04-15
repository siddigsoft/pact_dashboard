import { useState } from "react";
import {
  AlertCircle, Briefcase, Calendar, CheckCircle2, ChevronRight,
  Clock, FastForward, Forward, Play, SkipForward, User, Users, X,
  Inbox, Flame, ArrowRight, Tag
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type Priority = "urgent" | "high" | "normal";
type TaskType = "personal" | "project" | "collaborative";

interface Task {
  id: string;
  title: string;
  description: string;
  type: TaskType;
  priority: Priority;
  project: string;
  assignee: string;
  initials: string;
  dueDate: string;
  impact: string;
  tags: string[];
}

const QUEUE: Task[] = [
  {
    id: "t1",
    title: "Approve Vehicle Requisition — Kassala",
    description: "Field team in Kassala is requesting two vehicles for the upcoming site visit cycle. Approval needed before Thursday to arrange fuel and drivers.",
    type: "project",
    priority: "urgent",
    project: "Kassala Hub",
    assignee: "Sarah K.",
    initials: "SK",
    dueDate: "Today",
    impact: "Blocks 6 site visits scheduled this week",
    tags: ["logistics", "kassala"],
  },
  {
    id: "t2",
    title: "Submit MMP Report — El-Fasher Q2",
    description: "Quarterly MMP performance report is due. Data from all 4 coordinators has been compiled. Needs final review and submission to Programme Manager.",
    type: "project",
    priority: "urgent",
    project: "El-Fasher",
    assignee: "Ahmed M.",
    initials: "AM",
    dueDate: "Today",
    impact: "Donor reporting deadline — cannot slip",
    tags: ["mmp", "reporting"],
  },
  {
    id: "t3",
    title: "Review Budget Realignment Proposal",
    description: "Finance team has submitted a proposal to realign Q3 budget across hubs. Needs review before the budget committee meeting on Friday.",
    type: "personal",
    priority: "high",
    project: "Finance",
    assignee: "You",
    initials: "ME",
    dueDate: "Tomorrow",
    impact: "Affects Q3 operational capacity",
    tags: ["budget", "finance"],
  },
  {
    id: "t4",
    title: "Update Field Operations Protocol",
    description: "Security situation in Blue Nile has changed. Field protocol needs updating before next week's site visits begin.",
    type: "collaborative",
    priority: "high",
    project: "Operations",
    assignee: "Team",
    initials: "TM",
    dueDate: "Fri 18",
    impact: "Compliance and safety requirement",
    tags: ["protocol", "security"],
  },
  {
    id: "t5",
    title: "Weekly Coordination Meeting Notes",
    description: "Capture and distribute notes from Wednesday's hub coordination meeting.",
    type: "personal",
    priority: "normal",
    project: "Admin",
    assignee: "You",
    initials: "ME",
    dueDate: "Thu 17",
    impact: "Team alignment",
    tags: ["meeting", "admin"],
  },
];

const TYPE_COLOR: Record<TaskType, string> = {
  personal: "bg-blue-500",
  project: "bg-teal-500",
  collaborative: "bg-purple-500",
};

const PRIORITY_STYLES: Record<Priority, { ring: string; badge: string; label: string }> = {
  urgent: { ring: "ring-2 ring-red-400/50", badge: "bg-red-100 text-red-700", label: "Urgent" },
  high:   { ring: "ring-2 ring-amber-400/40", badge: "bg-amber-100 text-amber-700", label: "High" },
  normal: { ring: "", badge: "bg-slate-100 text-slate-600", label: "Normal" },
};

export function InboxTriage() {
  const [queue, setQueue] = useState(QUEUE);
  const [decided, setDecided] = useState<{ id: string; action: string }[]>([]);
  const [animating, setAnimating] = useState<string | null>(null);

  const current = queue[0];
  const remaining = queue.length;
  const doneCount = decided.length;

  function decide(action: "now" | "schedule" | "delegate" | "skip") {
    if (!current) return;
    setAnimating(action);
    setTimeout(() => {
      setDecided(d => [...d, { id: current.id, action }]);
      setQueue(q => q.slice(1));
      setAnimating(null);
    }, 280);
  }

  const priorityStyle = current ? PRIORITY_STYLES[current.priority] : null;

  return (
    <div className="flex h-screen w-full bg-[#f8f9fb] overflow-hidden font-sans">

      {/* Left — Queue panel */}
      <div className="w-64 flex flex-col bg-white border-r border-slate-200 shrink-0">
        <div className="px-5 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-1">
            <Inbox className="w-4 h-4 text-[#1D3461]" />
            <span className="text-sm font-bold text-[#0F2041]">Task Inbox</span>
          </div>
          <p className="text-xs text-slate-400">Process one at a time. Stay focused.</p>
        </div>

        {/* Progress bar */}
        <div className="px-5 pt-4 pb-3">
          <div className="flex justify-between text-xs font-medium text-slate-500 mb-2">
            <span>{doneCount} decided</span>
            <span>{remaining} remaining</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#1D3461] to-blue-400 rounded-full transition-all duration-500"
              style={{ width: `${(doneCount / (doneCount + remaining)) * 100 || 0}%` }}
            />
          </div>
        </div>

        {/* Queue list (blurred beyond first) */}
        <div className="flex-1 overflow-hidden px-3 pb-4 flex flex-col gap-1.5">
          {queue.map((task, i) => (
            <div
              key={task.id}
              className={cn(
                "px-3 py-2.5 rounded-lg border transition-all",
                i === 0
                  ? "bg-[#0F2041]/5 border-[#1D3461]/30 shadow-sm"
                  : "bg-white border-slate-100 opacity-40 blur-[0.5px]"
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", TYPE_COLOR[task.type])} />
                <span className="text-xs font-semibold text-slate-700 truncate">{task.title}</span>
              </div>
              <div className="flex items-center gap-2 pl-3.5">
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", PRIORITY_STYLES[task.priority].badge)}>
                  {PRIORITY_STYLES[task.priority].label}
                </span>
                <span className="text-[10px] text-slate-400">{task.dueDate}</span>
              </div>
            </div>
          ))}

          {/* Decided items */}
          {decided.map(d => {
            const t = QUEUE.find(t => t.id === d.id)!;
            return (
              <div key={d.id} className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 opacity-60 flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="text-xs text-slate-500 truncate">{t.title}</span>
                <span className="ml-auto text-[10px] text-slate-400 shrink-0 capitalize">{d.action}</span>
              </div>
            );
          })}

          {queue.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-2" />
              <p className="text-sm font-semibold text-slate-700">Inbox clear!</p>
              <p className="text-xs text-slate-400 mt-1">All tasks decided.</p>
            </div>
          )}
        </div>
      </div>

      {/* Center — Current task focus */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <div className="h-14 bg-white border-b border-slate-200 flex items-center px-6 gap-4 shrink-0">
          <div className="w-2 h-2 rounded-full bg-[#1D3461]" />
          <span className="text-sm font-bold text-[#0F2041]">Inbox Triage Mode</span>
          <span className="text-xs text-slate-400">Decide quickly — don't overthink</span>
          <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><Flame className="w-3.5 h-3.5 text-orange-500" />Focus active</span>
          </div>
        </div>

        {/* Task card */}
        {current ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div
              className={cn(
                "w-full max-w-2xl bg-white rounded-2xl shadow-lg border overflow-hidden transition-all duration-300",
                priorityStyle?.ring,
                animating === "now" && "translate-x-16 opacity-0 scale-95",
                animating === "skip" && "-translate-x-16 opacity-0 scale-95",
                animating === "schedule" && "translate-y-8 opacity-0 scale-95",
                animating === "delegate" && "translate-y-8 opacity-0 scale-95",
              )}
            >
              {/* Card top accent */}
              <div className={cn(
                "h-1",
                current.priority === "urgent" ? "bg-red-500" : current.priority === "high" ? "bg-amber-400" : "bg-emerald-400"
              )} />

              <div className="p-7">
                {/* Meta row */}
                <div className="flex items-center gap-2 mb-4">
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold", PRIORITY_STYLES[current.priority].badge)}>
                    {PRIORITY_STYLES[current.priority].label}
                  </span>
                  <span className="text-xs text-slate-400">·</span>
                  <div className={cn("w-2 h-2 rounded-full", TYPE_COLOR[current.type])} />
                  <span className="text-xs text-slate-500 capitalize">{current.type}</span>
                  <span className="text-xs text-slate-400">·</span>
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs font-medium text-slate-500">{current.dueDate}</span>
                  <span className="text-xs text-slate-400 ml-auto">{current.project}</span>
                </div>

                {/* Title */}
                <h2 className="text-xl font-bold text-[#0F2041] mb-3 leading-tight">{current.title}</h2>

                {/* Description */}
                <p className="text-sm text-slate-600 leading-relaxed mb-5">{current.description}</p>

                {/* Impact box */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-5 flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-amber-800 mb-0.5">Why it matters</p>
                    <p className="text-xs text-amber-700">{current.impact}</p>
                  </div>
                </div>

                {/* Tags + assignee */}
                <div className="flex items-center gap-3">
                  <Avatar className="w-7 h-7">
                    <AvatarFallback className="bg-[#1D3461]/10 text-[#1D3461] text-xs font-bold">{current.initials}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-slate-500">{current.assignee}</span>
                  <div className="flex gap-1 ml-auto">
                    {current.tags.map(tag => (
                      <span key={tag} className="flex items-center gap-1 text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                        <Tag className="w-2.5 h-2.5" />{tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center flex-col gap-3">
            <CheckCircle2 className="w-16 h-16 text-emerald-400" />
            <h3 className="text-xl font-bold text-slate-700">All caught up!</h3>
            <p className="text-sm text-slate-400">Your inbox is clear. Enjoy the focus.</p>
          </div>
        )}
      </div>

      {/* Right — Decision panel */}
      <div className="w-72 flex flex-col bg-white border-l border-slate-200 shrink-0">
        <div className="px-5 pt-6 pb-4 border-b border-slate-100">
          <p className="text-sm font-bold text-[#0F2041]">What will you do?</p>
          <p className="text-xs text-slate-400 mt-0.5">Pick one action for this task</p>
        </div>

        <div className="p-4 flex flex-col gap-3 flex-1">
          {/* Action: Do Now */}
          <button
            onClick={() => decide("now")}
            disabled={!current}
            className="group w-full flex items-start gap-4 p-4 bg-gradient-to-r from-[#0F2041] to-[#1D3461] text-white rounded-xl transition-all hover:shadow-lg hover:scale-[1.02] disabled:opacity-40"
          >
            <Play className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-left">
              <p className="text-sm font-bold">Do Now</p>
              <p className="text-xs opacity-75 mt-0.5">Start working on this immediately</p>
            </div>
            <ArrowRight className="w-4 h-4 ml-auto mt-0.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-1 transition-transform" />
          </button>

          {/* Action: Schedule */}
          <button
            onClick={() => decide("schedule")}
            disabled={!current}
            className="group w-full flex items-start gap-4 p-4 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl transition-all hover:bg-blue-100 hover:shadow-sm disabled:opacity-40"
          >
            <Calendar className="w-5 h-5 shrink-0 mt-0.5 text-blue-600" />
            <div className="text-left">
              <p className="text-sm font-bold">Schedule</p>
              <p className="text-xs opacity-75 mt-0.5">Plan for a specific time slot</p>
            </div>
          </button>

          {/* Action: Delegate */}
          <button
            onClick={() => decide("delegate")}
            disabled={!current}
            className="group w-full flex items-start gap-4 p-4 bg-teal-50 border border-teal-200 text-teal-900 rounded-xl transition-all hover:bg-teal-100 hover:shadow-sm disabled:opacity-40"
          >
            <Forward className="w-5 h-5 shrink-0 mt-0.5 text-teal-600" />
            <div className="text-left">
              <p className="text-sm font-bold">Delegate</p>
              <p className="text-xs opacity-75 mt-0.5">Assign to someone on the team</p>
            </div>
          </button>

          {/* Action: Skip */}
          <button
            onClick={() => decide("skip")}
            disabled={!current}
            className="group w-full flex items-start gap-4 p-4 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-all hover:bg-slate-100 disabled:opacity-40"
          >
            <SkipForward className="w-5 h-5 shrink-0 mt-0.5 text-slate-400" />
            <div className="text-left">
              <p className="text-sm font-bold">Skip for now</p>
              <p className="text-xs opacity-75 mt-0.5">Come back to this later</p>
            </div>
          </button>
        </div>

        {/* Session stats */}
        <div className="p-4 border-t border-slate-100">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Session</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Decided", value: doneCount, color: "text-emerald-600" },
              { label: "Remaining", value: remaining, color: "text-slate-700" },
              { label: "Do Now", value: decided.filter(d => d.action === "now").length, color: "text-[#1D3461]" },
              { label: "Delegated", value: decided.filter(d => d.action === "delegate").length, color: "text-teal-600" },
            ].map(s => (
              <div key={s.label} className="bg-slate-50 rounded-lg p-2.5 text-center">
                <p className={cn("text-lg font-bold leading-none", s.color)}>{s.value}</p>
                <p className="text-[10px] text-slate-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
