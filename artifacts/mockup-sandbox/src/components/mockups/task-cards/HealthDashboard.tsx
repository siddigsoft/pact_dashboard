import { CheckCircle2, AlertTriangle, TrendingUp, Clock, Hash, MoreHorizontal, Plus } from "lucide-react";

const TASKS = [
  {
    id: 1, title: "Send the Transportation For March 2026",
    description: "Approve all the field cost and transportation",
    priority: "high", status: "inprogress", dueLabel: "Due today",
    tags: ["finance"], subtasks: { done: 0, total: 1 },
    health: "at-risk",
  },
  {
    id: 2, title: "Review MMP submissions for Khartoum North",
    description: "Check completeness of 12 pending forms",
    priority: "medium", status: "todo", dueLabel: "4 days left",
    tags: ["mmp", "review"], subtasks: { done: 2, total: 5 },
    health: "on-track",
  },
  {
    id: 3, title: "Follow up on overdue site visits",
    description: null, priority: "low", status: "done", dueLabel: "Completed",
    tags: [], subtasks: { done: 3, total: 3 },
    health: "done",
  },
];

const HEALTH: Record<string, { label: string; bg: string; text: string; icon: React.ReactNode; ring: string }> = {
  "at-risk": {
    label: "At Risk", bg: "bg-red-50", text: "text-red-700",
    icon: <AlertTriangle className="h-3.5 w-3.5" />, ring: "ring-red-200",
  },
  "on-track": {
    label: "On Track", bg: "bg-emerald-50", text: "text-emerald-700",
    icon: <TrendingUp className="h-3.5 w-3.5" />, ring: "ring-emerald-200",
  },
  "done": {
    label: "Done", bg: "bg-slate-100", text: "text-slate-500",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />, ring: "ring-slate-200",
  },
};

function ArcRing({ pct, health }: { pct: number; health: string }) {
  const r = 20; const circ = 2 * Math.PI * r;
  const stroke = health === "at-risk" ? "#ef4444" : health === "done" ? "#94a3b8" : "#10b981";
  return (
    <svg width="52" height="52" className="flex-shrink-0 -rotate-90">
      <circle cx="26" cy="26" r={r} fill="none" stroke="#e2e8f0" strokeWidth="5" />
      <circle cx="26" cy="26" r={r} fill="none" stroke={stroke} strokeWidth="5"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
        strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      <text x="26" y="26" dominantBaseline="middle" textAnchor="middle"
        className="rotate-90" style={{ transform: "rotate(90deg)", transformOrigin: "26px 26px" }}
        fill="#64748b" fontSize="11" fontWeight="700" fontFamily="sans-serif">
        {pct}%
      </text>
    </svg>
  );
}

import React from "react";

export function HealthDashboard() {
  return (
    <div className="min-h-screen bg-[#f0f2f5] p-5 font-sans">
      <p className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 mb-3 px-1">
        Option F — Health Dashboard · task-as-health-signal
      </p>
      <div className="space-y-2.5">
        {TASKS.map(t => {
          const h = HEALTH[t.health];
          const done = t.status === "done";
          const pct = t.subtasks.total > 0 ? Math.round((t.subtasks.done / t.subtasks.total) * 100) : (done ? 100 : 0);
          return (
            <div key={t.id} className={`bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow ${done ? "opacity-60" : ""}`}>
              <div className="flex items-center gap-4 px-4 py-3">
                {/* Arc progress ring */}
                <ArcRing pct={pct} health={t.health} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ring-1 ${h.bg} ${h.text} ${h.ring}`}>
                      {h.icon} {h.label}
                    </span>
                  </div>
                  <p className={`text-[14px] font-semibold leading-snug ${done ? "line-through text-slate-400" : "text-slate-800"}`}>
                    {t.title}
                  </p>
                  {t.description && (
                    <p className="text-[12px] text-slate-500 mt-0.5 line-clamp-1">{t.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={`text-[11px] flex items-center gap-1 font-medium text-slate-400`}>
                      <Clock className="h-3 w-3" />{t.dueLabel}
                    </span>
                    {t.tags.map(tag => (
                      <span key={tag} className="text-[11px] flex items-center gap-0.5 bg-[#1D3461]/8 text-[#1D3461] border border-[#1D3461]/15 px-2 py-0.5 rounded-full font-medium">
                        <Hash className="h-2.5 w-2.5" />{tag}
                      </span>
                    ))}
                  </div>
                </div>

                <button className="p-1.5 text-slate-300 hover:text-slate-500 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0 self-start">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
        <button className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] text-slate-400 hover:text-slate-600 hover:bg-white hover:shadow-sm border border-dashed border-slate-200 transition-all">
          <Plus className="h-3.5 w-3.5" /> Add task
        </button>
      </div>
    </div>
  );
}
