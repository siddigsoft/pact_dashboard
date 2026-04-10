import { useState } from "react";
import {
  CheckCircle2, ChevronRight, Clock, ArrowRight,
  Star, Zap, Coffee, Sun, Moon, Sparkles,
  MoreHorizontal, Plus, ChevronDown,
} from "lucide-react";

const FOCUS_TASK = {
  id: 1,
  title: "Review Q2 MMP coverage report",
  project: "MMP Cycle 4",
  due: "Today, by 3:00 PM",
  priority: "Urgent",
  why: "Cycle close approval depends on this. 3 team members are waiting on your sign-off.",
  subtasks: [
    { id: 1, label: "Check coverage % across all localities", done: true },
    { id: 2, label: "Flag uncovered sites for recall", done: true },
    { id: 3, label: "Write summary note for MMP lead", done: false },
    { id: 4, label: "Submit to cycle close queue", done: false },
  ],
  timeEst: "~45 min",
};

const UPCOMING = [
  { time: "11:00", title: "Kassala transport cost approvals", project: "Finance", est: "20 min", urgent: true },
  { time: "12:30", title: "Gedaref follow-up call", project: "Field Ops", est: "30 min", urgent: false },
  { time: "14:00", title: "DC assignments – Cycle 5", project: "MMP", est: "1 hr", urgent: false },
  { time: "16:00", title: "Leave request review", project: "HR Hub", est: "15 min", urgent: false },
];

const QUICK_WINS = [
  { id: 10, title: "Mark Kassala site visit done", est: "2 min" },
  { id: 11, title: "Reply to Gedaref coordinator", est: "5 min" },
  { id: 12, title: "Approve Ali's leave request", est: "1 min" },
];

export function BriefingStyle() {
  const [subtasks, setSubtasks] = useState(
    new Set(FOCUS_TASK.subtasks.filter(s => s.done).map(s => s.id))
  );
  const [dismissed, setDismissed] = useState(false);
  const [quickDone, setQuickDone] = useState<Set<number>>(new Set());
  const hour = 9;
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const greetIcon = hour < 12 ? <Coffee className="h-5 w-5 text-amber-500" /> : hour < 17 ? <Sun className="h-5 w-5 text-yellow-500" /> : <Moon className="h-5 w-5 text-indigo-400" />;
  const doneCount = subtasks.size;
  const totalCount = FOCUS_TASK.subtasks.length;
  const pct = Math.round((doneCount / totalCount) * 100);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/40 flex flex-col"
      style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>

      {/* Morning briefing banner */}
      <div className="bg-gradient-to-r from-[#0F2041] to-[#1D3461] text-white px-8 py-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {greetIcon}
              <span className="text-[13px] text-white/60 font-medium">Friday, 10 Apr 2026</span>
            </div>
            <h1 className="text-[22px] font-bold">{greeting}, Elsiddig.</h1>
            <p className="text-[13.5px] text-white/70 mt-0.5">
              You have <span className="text-white font-semibold">6 tasks</span> today · <span className="text-amber-300 font-semibold">2 urgent</span> · estimated <span className="text-white font-semibold">3.5 hrs</span> of work
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-300" />
            <span className="text-[12px] text-white/50">AI briefing</span>
          </div>
        </div>

        {/* Day progress bar */}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 rounded-full" style={{ width: "25%" }} />
          </div>
          <span className="text-[11px] text-white/50 flex-shrink-0">1 of 6 done today</span>
        </div>
      </div>

      <div className="flex-1 flex gap-4 p-5 min-h-0">
        {/* Left: Focus card */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <h2 className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Focus Right Now</h2>
          </div>

          {!dismissed ? (
            <div className="bg-white rounded-2xl border border-amber-200 shadow-md shadow-amber-50 p-5 flex flex-col gap-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10.5px] font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">{FOCUS_TASK.priority}</span>
                    <span className="text-[11px] text-slate-400">{FOCUS_TASK.project}</span>
                  </div>
                  <h3 className="text-[17px] font-bold text-slate-900 leading-snug">{FOCUS_TASK.title}</h3>
                </div>
                <button onClick={() => setDismissed(true)}
                  className="text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0 mt-1">
                  <MoreHorizontal className="h-5 w-5" />
                </button>
              </div>

              {/* Why this matters */}
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider mb-1">Why this matters</p>
                <p className="text-[13px] text-amber-900">{FOCUS_TASK.why}</p>
              </div>

              {/* Progress */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-semibold text-slate-700">Subtasks</span>
                  <span className="text-[11.5px] text-slate-400">{doneCount}/{totalCount} · {pct}%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="space-y-2">
                  {FOCUS_TASK.subtasks.map(st => (
                    <button key={st.id} onClick={() => setSubtasks(prev => { const n = new Set(prev); n.has(st.id) ? n.delete(st.id) : n.add(st.id); return n; })}
                      className="flex items-center gap-2.5 w-full text-left group">
                      {subtasks.has(st.id)
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                        : <div className="h-4 w-4 rounded-full border-2 border-slate-300 group-hover:border-emerald-400 transition-colors flex-shrink-0" />}
                      <span className={`text-[13px] ${subtasks.has(st.id) ? "line-through text-slate-400" : "text-slate-700"}`}>{st.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div className="flex items-center gap-1.5 text-[12px] text-slate-400">
                  <Clock className="h-3.5 w-3.5" /> {FOCUS_TASK.due} · {FOCUS_TASK.timeEst}
                </div>
                <button className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white bg-[#1D3461] hover:bg-[#0F2041] rounded-xl px-4 py-2 transition-colors">
                  Mark done <CheckCircle2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 flex flex-col items-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="text-[14px] font-semibold text-emerald-800">Task dismissed — moving to next</p>
              <button onClick={() => setDismissed(false)} className="text-[12px] text-emerald-600 underline">Undo</button>
            </div>
          )}

          {/* Quick wins */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-3.5 w-3.5 text-violet-500" />
              <h2 className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Quick Wins (&lt;5 min)</h2>
            </div>
            <div className="space-y-2">
              {QUICK_WINS.map(t => (
                <div key={t.id} className={`flex items-center gap-3 bg-white border rounded-xl px-4 py-2.5 transition-all ${quickDone.has(t.id) ? "border-emerald-100 opacity-50" : "border-slate-200 hover:border-violet-200 hover:shadow-sm"}`}>
                  <button onClick={() => setQuickDone(prev => { const n = new Set(prev); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n; })}>
                    {quickDone.has(t.id) ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <div className="h-4 w-4 rounded-full border-2 border-slate-300 hover:border-violet-400 transition-colors" />}
                  </button>
                  <span className={`flex-1 text-[13px] ${quickDone.has(t.id) ? "line-through text-slate-400" : "text-slate-700"}`}>{t.title}</span>
                  <span className="text-[11px] text-slate-400">{t.est}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Timeline */}
        <div className="w-64 flex-shrink-0 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            <h2 className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Up Next Today</h2>
          </div>
          <div className="flex flex-col gap-2">
            {UPCOMING.map((item, i) => (
              <div key={i} className={`flex gap-3 bg-white rounded-xl border p-3 shadow-sm ${item.urgent ? "border-red-100" : "border-slate-100"}`}>
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <span className={`text-[11px] font-bold ${item.urgent ? "text-red-500" : "text-slate-500"}`}>{item.time}</span>
                  {i < UPCOMING.length - 1 && <div className="w-px flex-1 bg-slate-100 my-0.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-medium text-slate-800 leading-snug">{item.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10.5px] text-slate-400">{item.project}</span>
                    <span className="text-[10.5px] text-slate-300">·</span>
                    <span className="text-[10.5px] text-slate-400">{item.est}</span>
                  </div>
                </div>
              </div>
            ))}
            <button className="flex items-center justify-center gap-1.5 text-[12px] text-slate-400 hover:text-[#1D3461] border border-dashed border-slate-200 rounded-xl py-2.5 transition-colors hover:border-[#1D3461]/30">
              <Plus className="h-3.5 w-3.5" /> Add to today
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
