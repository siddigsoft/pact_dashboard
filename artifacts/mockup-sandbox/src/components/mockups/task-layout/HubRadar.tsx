import { useState } from "react";
import {
  AlertCircle, CheckCircle2, ChevronDown, MapPin, Plus, User,
  Users, Filter, Clock, Briefcase
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

type Band = "today" | "week" | "later";
type Priority = "urgent" | "high" | "normal";
type HubId = "kassala" | "elfasher" | "khartoum" | "blueNile" | "personal";

interface HubTask {
  id: string;
  title: string;
  hub: HubId;
  band: Band;
  priority: Priority;
  assignee: string;
  initials: string;
  type: "personal" | "project" | "collaborative";
}

const HUBS: { id: HubId; label: string; color: string; bg: string; count: number }[] = [
  { id: "kassala",  label: "Kassala Hub",   color: "text-blue-700",   bg: "bg-blue-50 border-blue-200",   count: 3 },
  { id: "elfasher", label: "El-Fasher Hub", color: "text-teal-700",   bg: "bg-teal-50 border-teal-200",   count: 4 },
  { id: "khartoum", label: "Khartoum",      color: "text-violet-700", bg: "bg-violet-50 border-violet-200", count: 2 },
  { id: "blueNile", label: "Blue Nile",     color: "text-amber-700",  bg: "bg-amber-50 border-amber-200",  count: 2 },
  { id: "personal", label: "Personal",      color: "text-slate-700",  bg: "bg-slate-50 border-slate-200",  count: 2 },
];

const BANDS: { id: Band; label: string; icon: typeof Clock; accent: string }[] = [
  { id: "today", label: "Today",     icon: AlertCircle, accent: "border-l-4 border-l-red-400" },
  { id: "week",  label: "This Week", icon: Clock,       accent: "border-l-4 border-l-amber-400" },
  { id: "later", label: "Later",     icon: CheckCircle2,accent: "border-l-4 border-l-slate-300" },
];

const TASKS: HubTask[] = [
  { id: "k1", title: "Approve vehicle requisition",     hub: "kassala",  band: "today", priority: "urgent", assignee: "Sarah K.", initials: "SK", type: "project" },
  { id: "k2", title: "Update site visit schedule",      hub: "kassala",  band: "week",  priority: "high",   assignee: "Ahmed M.", initials: "AM", type: "project" },
  { id: "k3", title: "Staff training session",          hub: "kassala",  band: "later", priority: "normal", assignee: "Team",     initials: "TM", type: "collaborative" },
  { id: "e1", title: "Submit MMP Q2 report",            hub: "elfasher", band: "today", priority: "urgent", assignee: "Fatima N.", initials: "FN", type: "project" },
  { id: "e2", title: "Site visit: North cluster",       hub: "elfasher", band: "today", priority: "high",   assignee: "Omar A.",  initials: "OA", type: "project" },
  { id: "e3", title: "Coordinator debrief meeting",     hub: "elfasher", band: "week",  priority: "normal", assignee: "Team",     initials: "TM", type: "collaborative" },
  { id: "e4", title: "Data collector field payments",   hub: "elfasher", band: "week",  priority: "high",   assignee: "Reem S.",  initials: "RS", type: "project" },
  { id: "kh1", title: "Review field protocol update",   hub: "khartoum", band: "week",  priority: "high",   assignee: "You",      initials: "ME", type: "personal" },
  { id: "kh2", title: "Prepare donor report slides",    hub: "khartoum", band: "later", priority: "normal", assignee: "You",      initials: "ME", type: "personal" },
  { id: "bn1", title: "Security assessment sign-off",   hub: "blueNile", band: "today", priority: "urgent", assignee: "Director", initials: "DR", type: "project" },
  { id: "bn2", title: "Staff relocation planning",      hub: "blueNile", band: "week",  priority: "high",   assignee: "HR Team",  initials: "HR", type: "collaborative" },
  { id: "p1",  title: "Review budget realignment",      hub: "personal", band: "week",  priority: "high",   assignee: "You",      initials: "ME", type: "personal" },
  { id: "p2",  title: "Weekly team check-in notes",     hub: "personal", band: "week",  priority: "normal", assignee: "You",      initials: "ME", type: "personal" },
];

const PRIORITY_DOT: Record<Priority, string> = {
  urgent: "bg-red-500",
  high:   "bg-amber-400",
  normal: "bg-slate-300",
};

export function HubRadar() {
  const [expandedHub, setExpandedHub] = useState<HubId | null>(null);
  const [filterBand, setFilterBand] = useState<Band | "all">("all");

  const getCell = (hub: HubId, band: Band) =>
    TASKS.filter(t =>
      t.hub === hub && t.band === band &&
      (filterBand === "all" || t.band === filterBand)
    );

  const totalUrgent = TASKS.filter(t => t.priority === "urgent").length;

  return (
    <div className="flex h-screen flex-col bg-[#f4f6fb] overflow-hidden font-sans">
      {/* Header */}
      <div className="h-14 bg-[#0F2041] flex items-center px-6 gap-4 shrink-0">
        <MapPin className="w-4 h-4 text-blue-300" />
        <span className="text-white font-bold text-sm">Hub Radar</span>
        <span className="text-blue-300 text-xs">Tasks by operational location</span>
        <div className="ml-auto flex items-center gap-3">
          {totalUrgent > 0 && (
            <span className="flex items-center gap-1.5 bg-red-500/20 text-red-300 text-xs px-2.5 py-1 rounded-full font-medium">
              <AlertCircle className="w-3 h-3" />{totalUrgent} urgent
            </span>
          )}
          <button className="text-blue-300 hover:text-white text-xs flex items-center gap-1 transition-colors">
            <Filter className="w-3.5 h-3.5" />Filter
          </button>
          <button className="bg-blue-500 hover:bg-blue-400 text-white text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 transition-colors">
            <Plus className="w-3.5 h-3.5" />New Task
          </button>
        </div>
      </div>

      {/* Band filter row */}
      <div className="h-10 bg-white border-b border-slate-200 flex items-center px-6 gap-3 shrink-0">
        <span className="text-xs text-slate-400 font-medium mr-1">Show:</span>
        {["all", "today", "week", "later"].map(b => (
          <button
            key={b}
            onClick={() => setFilterBand(b as Band | "all")}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-all",
              filterBand === b
                ? "bg-[#1D3461] text-white"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            )}
          >
            {b === "all" ? "All" : b === "today" ? "Today" : b === "week" ? "This Week" : "Later"}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-4 text-xs text-slate-400">
          <span>Columns = Operational Hubs</span>
          <span>·</span>
          <span>Rows = Urgency</span>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-4">
        <div className="min-w-[900px]">
          {/* Hub column headers */}
          <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: `140px repeat(${HUBS.length}, 1fr)` }}>
            <div />
            {HUBS.map(hub => (
              <div key={hub.id} className={cn("rounded-xl border px-3 py-2.5 flex items-center justify-between", hub.bg)}>
                <div>
                  <p className={cn("text-xs font-bold truncate", hub.color)}>{hub.label}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{hub.count} tasks</p>
                </div>
                <button
                  onClick={() => setExpandedHub(expandedHub === hub.id ? null : hub.id)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expandedHub === hub.id && "rotate-180")} />
                </button>
              </div>
            ))}
          </div>

          {/* Rows by time band */}
          {BANDS.map(band => (
            <div key={band.id} className="grid gap-3 mb-3" style={{ gridTemplateColumns: `140px repeat(${HUBS.length}, 1fr)` }}>
              {/* Band label */}
              <div className="flex items-center gap-2 pr-2">
                <div className={cn(
                  "h-full w-full rounded-xl flex flex-col items-start justify-center pl-3 py-3 gap-1",
                  band.id === "today" ? "bg-red-50 border border-red-100" : band.id === "week" ? "bg-amber-50 border border-amber-100" : "bg-slate-50 border border-slate-200"
                )}>
                  <band.icon className={cn("w-4 h-4", band.id === "today" ? "text-red-500" : band.id === "week" ? "text-amber-500" : "text-slate-400")} />
                  <span className={cn("text-xs font-bold", band.id === "today" ? "text-red-700" : band.id === "week" ? "text-amber-700" : "text-slate-500")}>
                    {band.label}
                  </span>
                </div>
              </div>

              {/* Cells */}
              {HUBS.map(hub => {
                const tasks = getCell(hub.id, band.id);
                return (
                  <div key={hub.id} className="bg-white rounded-xl border border-slate-200 p-2 min-h-[90px] flex flex-col gap-1.5">
                    {tasks.length === 0 ? (
                      <div className="flex-1 flex items-center justify-center">
                        <span className="text-[10px] text-slate-300">—</span>
                      </div>
                    ) : (
                      tasks.map(task => (
                        <div
                          key={task.id}
                          className="flex items-start gap-1.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-200 transition-all group"
                        >
                          <div className={cn("w-1.5 h-1.5 rounded-full mt-1 shrink-0", PRIORITY_DOT[task.priority])} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold text-slate-700 truncate leading-tight group-hover:text-slate-900">{task.title}</p>
                            <div className="flex items-center gap-1 mt-1">
                              <Avatar className="w-3.5 h-3.5">
                                <AvatarFallback className="bg-slate-200 text-[7px] font-bold">{task.initials}</AvatarFallback>
                              </Avatar>
                              <span className="text-[9px] text-slate-400 truncate">{task.assignee}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                    {tasks.length > 0 && (
                      <button className="text-[10px] text-slate-400 hover:text-[#1D3461] flex items-center gap-1 pl-2 transition-colors">
                        <Plus className="w-3 h-3" />Add
                      </button>
                    )}
                    {tasks.length === 0 && (
                      <button className="text-[10px] text-slate-300 hover:text-slate-400 flex items-center justify-center gap-1 transition-colors py-1">
                        <Plus className="w-3 h-3" />Add task
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Footer summary */}
      <div className="h-10 bg-white border-t border-slate-200 flex items-center px-6 gap-6 shrink-0 text-xs text-slate-400">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />Urgent</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />High</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-300" />Normal</span>
        <span className="ml-auto">{TASKS.length} tasks across {HUBS.length} hubs</span>
      </div>
    </div>
  );
}
