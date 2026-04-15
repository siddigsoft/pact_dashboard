import { useState } from "react";
import {
  Activity, AlertCircle, Briefcase, CheckCircle2, ChevronDown, Clock,
  Heart, MessageCircle, MoreHorizontal, Plus, Search, ThumbsUp,
  User, Users, Zap, Bell, ArrowUpRight, Check, RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type Priority = "urgent" | "high" | "normal";
type EventType = "created" | "updated" | "commented" | "completed" | "assigned" | "overdue";

interface StreamItem {
  id: string;
  eventType: EventType;
  taskTitle: string;
  actor: string;
  actorInitials: string;
  actorColor: string;
  timestamp: string;
  timeAgo: string;
  priority: Priority;
  project: string;
  hub: string;
  description?: string;
  comment?: string;
  reactions: { emoji: string; count: number }[];
  watchers: { initials: string; color: string }[];
  status: "todo" | "in-progress" | "done";
}

const FEED: StreamItem[] = [
  {
    id: "s1",
    eventType: "overdue",
    taskTitle: "Approve Vehicle Requisition — Kassala",
    actor: "System",
    actorInitials: "SY",
    actorColor: "bg-red-500",
    timestamp: "2026-04-15T09:00:00",
    timeAgo: "2h ago",
    priority: "urgent",
    project: "Kassala Hub",
    hub: "Kassala",
    description: "This task passed its due date without action. Field team is waiting.",
    reactions: [{ emoji: "🔥", count: 2 }],
    watchers: [{ initials: "SK", color: "bg-blue-500" }, { initials: "AH", color: "bg-teal-500" }],
    status: "todo",
  },
  {
    id: "s2",
    eventType: "created",
    taskTitle: "Submit MMP Q2 Report — El-Fasher",
    actor: "Fatima N.",
    actorInitials: "FN",
    actorColor: "bg-teal-500",
    timestamp: "2026-04-15T08:30:00",
    timeAgo: "3h ago",
    priority: "urgent",
    project: "El-Fasher",
    hub: "El-Fasher",
    description: "Q2 MMP report is ready for final review and submission to Programme Manager.",
    reactions: [{ emoji: "👀", count: 3 }, { emoji: "✅", count: 1 }],
    watchers: [{ initials: "DR", color: "bg-violet-500" }, { initials: "ME", color: "bg-[#1D3461]" }],
    status: "in-progress",
  },
  {
    id: "s3",
    eventType: "commented",
    taskTitle: "Security Assessment — Blue Nile",
    actor: "Omar A.",
    actorInitials: "OA",
    actorColor: "bg-amber-500",
    timestamp: "2026-04-15T08:00:00",
    timeAgo: "4h ago",
    priority: "urgent",
    project: "Blue Nile",
    hub: "Blue Nile",
    comment: "Security situation has stabilised in the northern sector. Updated protocols attached. Ready for sign-off.",
    reactions: [{ emoji: "👍", count: 4 }],
    watchers: [{ initials: "DR", color: "bg-violet-500" }, { initials: "SK", color: "bg-blue-500" }, { initials: "RS", color: "bg-pink-500" }],
    status: "todo",
  },
  {
    id: "s4",
    eventType: "assigned",
    taskTitle: "Review Budget Realignment Proposal",
    actor: "Director",
    actorInitials: "DR",
    actorColor: "bg-violet-500",
    timestamp: "2026-04-15T07:30:00",
    timeAgo: "5h ago",
    priority: "high",
    project: "Finance",
    hub: "Khartoum",
    description: "Assigned to you for review before Friday's budget committee. Q3 operational capacity depends on approval.",
    reactions: [],
    watchers: [{ initials: "FN", color: "bg-teal-500" }],
    status: "todo",
  },
  {
    id: "s5",
    eventType: "completed",
    taskTitle: "Data Collector Payments — Kassala",
    actor: "Sarah K.",
    actorInitials: "SK",
    actorColor: "bg-blue-500",
    timestamp: "2026-04-14T16:45:00",
    timeAgo: "Yesterday",
    priority: "normal",
    project: "Kassala Hub",
    hub: "Kassala",
    description: "All 12 data collectors received their April payments. Receipts filed in Finance drive.",
    reactions: [{ emoji: "🎉", count: 5 }, { emoji: "👏", count: 3 }],
    watchers: [{ initials: "AH", color: "bg-teal-500" }, { initials: "ME", color: "bg-[#1D3461]" }],
    status: "done",
  },
  {
    id: "s6",
    eventType: "updated",
    taskTitle: "Field Operations Protocol v3.2",
    actor: "Ahmed M.",
    actorInitials: "AM",
    actorColor: "bg-emerald-500",
    timestamp: "2026-04-14T14:00:00",
    timeAgo: "Yesterday",
    priority: "high",
    project: "Operations",
    hub: "El-Fasher",
    description: "Updated Blue Nile section to reflect new movement restrictions. Awaiting review from coordinator.",
    reactions: [{ emoji: "👍", count: 2 }],
    watchers: [{ initials: "SK", color: "bg-blue-500" }, { initials: "DR", color: "bg-violet-500" }, { initials: "OA", color: "bg-amber-500" }],
    status: "in-progress",
  },
];

const EVENT_CONFIG: Record<EventType, { label: string; icon: typeof AlertCircle; color: string; bg: string }> = {
  created:   { label: "Created",   icon: Plus,          color: "text-blue-600",   bg: "bg-blue-100" },
  updated:   { label: "Updated",   icon: RefreshCw,     color: "text-amber-600",  bg: "bg-amber-100" },
  commented: { label: "Commented", icon: MessageCircle, color: "text-purple-600", bg: "bg-purple-100" },
  completed: { label: "Completed", icon: CheckCircle2,  color: "text-emerald-600",bg: "bg-emerald-100" },
  assigned:  { label: "Assigned",  icon: ArrowUpRight,  color: "text-violet-600", bg: "bg-violet-100" },
  overdue:   { label: "Overdue",   icon: AlertCircle,   color: "text-red-600",    bg: "bg-red-100" },
};

const PRIORITY_BADGE: Record<Priority, string> = {
  urgent: "bg-red-100 text-red-700",
  high:   "bg-amber-100 text-amber-700",
  normal: "bg-slate-100 text-slate-500",
};

export function StreamView() {
  const [feed, setFeed] = useState(FEED);
  const [filter, setFilter] = useState<EventType | "all">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = filter === "all" ? feed : feed.filter(i => i.eventType === filter);

  function markDone(id: string) {
    setFeed(f => f.map(i => i.id === id ? { ...i, status: "done", eventType: "completed" } : i));
  }

  return (
    <div className="flex h-screen w-full bg-[#f5f6fa] overflow-hidden font-sans">
      {/* Left column — filters + quick stats */}
      <div className="w-56 flex flex-col bg-white border-r border-slate-200 shrink-0">
        <div className="px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-[#1D3461]" />
            <span className="text-sm font-bold text-[#0F2041]">Activity Stream</span>
          </div>
          <p className="text-[11px] text-slate-400">All task events, newest first</p>
        </div>

        <div className="px-4 py-4 flex flex-col gap-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Filter by event</p>
          {(["all", ...Object.keys(EVENT_CONFIG)] as (EventType | "all")[]).map(type => {
            const count = type === "all" ? feed.length : feed.filter(i => i.eventType === type).length;
            if (count === 0 && type !== "all") return null;
            const cfg = type !== "all" ? EVENT_CONFIG[type] : null;
            return (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={cn(
                  "flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all",
                  filter === type
                    ? "bg-[#0F2041] text-white"
                    : "text-slate-600 hover:bg-slate-50"
                )}
              >
                <div className="flex items-center gap-2">
                  {cfg && <cfg.icon className="w-3.5 h-3.5" />}
                  {type === "all" ? "All Activity" : cfg!.label}
                </div>
                <span className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                  filter === type ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                )}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Quick stats */}
        <div className="px-4 py-4 border-t border-slate-100 mt-auto">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Today's pulse</p>
          <div className="flex flex-col gap-2">
            {[
              { label: "Overdue", value: feed.filter(i => i.eventType === "overdue").length, color: "text-red-600" },
              { label: "Completed", value: feed.filter(i => i.status === "done").length, color: "text-emerald-600" },
              { label: "In Progress", value: feed.filter(i => i.status === "in-progress").length, color: "text-blue-600" },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{s.label}</span>
                <span className={cn("text-sm font-bold", s.color)}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Center — Activity feed */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Feed header */}
        <div className="h-14 bg-white border-b border-slate-200 flex items-center px-5 gap-3 shrink-0">
          <Bell className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700">
            {filtered.length} events {filter !== "all" ? `· ${EVENT_CONFIG[filter as EventType].label}` : ""}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors">
              <Search className="w-3.5 h-3.5" />Search
            </button>
            <button className="bg-[#1D3461] text-white text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 hover:bg-[#0F2041] transition-colors">
              <Plus className="w-3.5 h-3.5" />New Task
            </button>
          </div>
        </div>

        {/* Feed */}
        <div className="flex-1 overflow-auto px-4 py-4 flex flex-col gap-3">
          {filtered.map(item => {
            const evt = EVENT_CONFIG[item.eventType];
            const isExpanded = expanded === item.id;
            const isDone = item.status === "done";

            return (
              <div
                key={item.id}
                className={cn(
                  "bg-white rounded-2xl border transition-all hover:shadow-sm",
                  isDone ? "border-slate-100 opacity-70" : item.priority === "urgent" ? "border-red-200" : "border-slate-200"
                )}
              >
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Actor avatar */}
                    <Avatar className="w-8 h-8 shrink-0">
                      <AvatarFallback className={cn("text-white text-xs font-bold", item.actorColor)}>
                        {item.actorInitials}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      {/* Event type + actor + time */}
                      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                        <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full", evt.bg, evt.color)}>
                          <evt.icon className="w-3 h-3" />{evt.label}
                        </span>
                        <span className="text-xs font-semibold text-slate-700">{item.actor}</span>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-xs text-slate-400">{item.timeAgo}</span>
                        <span className="ml-auto text-xs text-slate-400 shrink-0">{item.hub}</span>
                      </div>

                      {/* Task title */}
                      <button
                        onClick={() => setExpanded(isExpanded ? null : item.id)}
                        className="text-sm font-bold text-[#0F2041] text-left hover:text-[#1D3461] transition-colors mb-1 flex items-center gap-1 group"
                      >
                        {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                        <span className={isDone ? "line-through text-slate-400" : ""}>{item.taskTitle}</span>
                        <ChevronDown className={cn("w-3.5 h-3.5 text-slate-300 transition-transform", isExpanded && "rotate-180")} />
                      </button>

                      {/* Comment or description (short preview) */}
                      {(item.comment || item.description) && (
                        <p className={cn(
                          "text-xs text-slate-500 leading-relaxed",
                          !isExpanded && "line-clamp-1"
                        )}>
                          {item.comment ? `"${item.comment}"` : item.description}
                        </p>
                      )}

                      {/* Expanded quick actions */}
                      {isExpanded && !isDone && (
                        <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                          <button
                            onClick={() => markDone(item.id)}
                            className="flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg font-medium hover:bg-emerald-100 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />Mark Done
                          </button>
                          <button className="flex items-center gap-1.5 text-xs bg-slate-50 text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg font-medium hover:bg-slate-100 transition-colors">
                            <MessageCircle className="w-3.5 h-3.5" />Comment
                          </button>
                          <button className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg font-medium hover:bg-blue-100 transition-colors">
                            <ArrowUpRight className="w-3.5 h-3.5" />View Task
                          </button>
                          <span className={cn("text-[10px] font-bold px-2 py-1 rounded-full ml-auto", PRIORITY_BADGE[item.priority])}>
                            {item.priority}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Reactions + watchers footer */}
                  <div className="flex items-center justify-between mt-3 ml-11">
                    <div className="flex items-center gap-2">
                      {item.reactions.map(r => (
                        <button
                          key={r.emoji}
                          className="flex items-center gap-1 text-xs bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-full transition-colors"
                        >
                          {r.emoji} <span className="font-semibold text-slate-600">{r.count}</span>
                        </button>
                      ))}
                      <button className="text-xs text-slate-300 hover:text-slate-500 transition-colors px-1">+ React</button>
                    </div>

                    {/* Watchers */}
                    {item.watchers.length > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-400 mr-1">watching:</span>
                        <div className="flex -space-x-1.5">
                          {item.watchers.map((w, i) => (
                            <Avatar key={i} className="w-5 h-5 border border-white">
                              <AvatarFallback className={cn("text-white text-[8px] font-bold", w.color)}>{w.initials}</AvatarFallback>
                            </Avatar>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
