import { useState } from "react";
import {
  Flame, Star, Zap, CheckCircle2, Circle, Trophy,
  TrendingUp, Gift, Clock, Plus, ChevronUp,
  Award, Target, BarChart2, Users,
} from "lucide-react";

interface Task {
  id: number;
  title: string;
  project: string;
  xp: number;
  due: string;
  difficulty: "hard" | "medium" | "easy";
  done: boolean;
}

const TASKS: Task[] = [
  { id: 1, title: "Review Q2 MMP coverage report", project: "MMP Cycle 4", xp: 100, due: "Today", difficulty: "hard", done: false },
  { id: 2, title: "Approve transport cost submissions for Kassala hub", project: "Finance", xp: 75, due: "Today", difficulty: "medium", done: false },
  { id: 3, title: "Follow up on uncovered sites in Gedaref", project: "Field Ops", xp: 50, due: "Tomorrow", difficulty: "medium", done: false },
  { id: 4, title: "Update data collector assignments", project: "MMP Cycle 5", xp: 60, due: "Apr 12", difficulty: "medium", done: false },
  { id: 5, title: "Generate payroll report", project: "HR Hub", xp: 40, due: "Apr 14", difficulty: "easy", done: true },
  { id: 6, title: "Review leave requests", project: "HR Hub", xp: 25, due: "Apr 15", difficulty: "easy", done: false },
  { id: 7, title: "Sync CRM partner list", project: "CRM", xp: 20, due: "Apr 18", difficulty: "easy", done: false },
];

const TEAM = [
  { name: "Fatima A.", xp: 1480, streak: 18, avatar: "FA", rank: 1, color: "bg-yellow-400" },
  { name: "Elsiddig I.", xp: 1340, streak: 12, avatar: "EI", rank: 2, color: "bg-blue-500", isMe: true },
  { name: "Ahmed M.", xp: 1210, streak: 7, avatar: "AM", rank: 3, color: "bg-emerald-500" },
  { name: "Sara K.", xp: 980, streak: 3, avatar: "SK", rank: 4, color: "bg-violet-500" },
];

const BADGES = [
  { icon: "🏆", label: "Sprint Champion", earned: true },
  { icon: "⚡", label: "Quick Closer", earned: true },
  { icon: "🔥", label: "10-Day Streak", earned: true },
  { icon: "🎯", label: "On Target", earned: false },
  { icon: "💎", label: "Diamond Closer", earned: false },
];

const DIFF_CFG = {
  hard: { label: "Hard", color: "text-red-500", bg: "bg-red-50 border-red-100" },
  medium: { label: "Medium", color: "text-amber-600", bg: "bg-amber-50 border-amber-100" },
  easy: { label: "Easy", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
};

export function MomentumStyle() {
  const [tasks, setTasks] = useState(TASKS);
  const [totalXP, setTotalXP] = useState(1340);
  const [streak, setStreak] = useState(12);
  const [levelXP] = useState(500);
  const [floatingXP, setFloatingXP] = useState<{ id: number; x: number; y: number; val: number } | null>(null);

  const doneCount = tasks.filter(t => t.done).length;
  const totalCount = tasks.length;
  const pct = Math.round((doneCount / totalCount) * 100);
  const xpInLevel = totalXP % levelXP;
  const level = Math.floor(totalXP / levelXP) + 1;

  function completeTask(id: number, e: React.MouseEvent) {
    const task = tasks.find(t => t.id === id);
    if (!task || task.done) return;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: true } : t));
    setTotalXP(prev => prev + task.xp);
    setFloatingXP({ id, x: e.clientX, y: e.clientY, val: task.xp });
    setTimeout(() => setFloatingXP(null), 1200);
  }

  return (
    <div className="min-h-screen bg-[#0F0F23] text-white flex flex-col" style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>
      {/* Floating XP */}
      {floatingXP && (
        <div className="fixed pointer-events-none z-50 font-black text-yellow-400 text-[22px] animate-bounce"
          style={{ left: floatingXP.x - 20, top: floatingXP.y - 20 }}>
          +{floatingXP.val} XP
        </div>
      )}

      {/* Hero stats bar */}
      <div className="bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 px-6 py-4">
        <div className="flex items-center gap-6">
          {/* Avatar + level */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="relative">
              <div className="h-12 w-12 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center text-white font-black text-[16px]">EI</div>
              <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-yellow-400 flex items-center justify-center text-[9px] font-black text-yellow-900">L{level}</div>
            </div>
            <div>
              <p className="text-[13px] font-bold">Elsiddig Ibrahim</p>
              <p className="text-[11px] text-white/60">Level {level} · Field Commander</p>
            </div>
          </div>

          {/* XP bar */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-white/60 font-semibold">XP Progress</span>
              <span className="text-[11px] text-white font-bold">{xpInLevel} / {levelXP}</span>
            </div>
            <div className="h-2.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-yellow-400 to-amber-300 rounded-full transition-all duration-700"
                style={{ width: `${(xpInLevel / levelXP) * 100}%` }} />
            </div>
          </div>

          {/* Streak */}
          <div className="flex items-center gap-2 bg-white/10 rounded-2xl px-4 py-2.5 flex-shrink-0">
            <Flame className="h-6 w-6 text-orange-400" />
            <div>
              <p className="text-[20px] font-black text-orange-300 leading-none">{streak}</p>
              <p className="text-[10px] text-white/50">day streak</p>
            </div>
          </div>

          {/* Total XP */}
          <div className="flex items-center gap-2 bg-white/10 rounded-2xl px-4 py-2.5 flex-shrink-0">
            <Star className="h-5 w-5 text-yellow-400 fill-yellow-400" />
            <div>
              <p className="text-[20px] font-black text-yellow-300 leading-none">{totalXP.toLocaleString()}</p>
              <p className="text-[10px] text-white/50">total XP</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 gap-0">
        {/* Tasks */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0F0F23]">
          {/* Today's progress */}
          <div className="px-5 py-3 border-b border-white/8">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-violet-400" />
                <span className="text-[12px] font-bold text-white/70 uppercase tracking-wider">Today's Quests</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-white/50">{doneCount}/{totalCount} completed · {pct}%</span>
              </div>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-violet-500 to-blue-500 rounded-full transition-all"
                style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Task list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {tasks.map(task => {
              const diff = DIFF_CFG[task.difficulty];
              return (
                <div key={task.id}
                  className={`rounded-2xl border transition-all group cursor-pointer ${task.done ? "bg-white/3 border-white/5 opacity-50" : "bg-white/6 border-white/10 hover:bg-white/10 hover:border-white/20"}`}>
                  <div className="flex items-center gap-3 p-3.5">
                    <button onClick={(e) => completeTask(task.id, e)} className="flex-shrink-0 transition-transform hover:scale-110">
                      {task.done
                        ? <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        : <Circle className="h-5 w-5 text-white/30 group-hover:text-violet-400 transition-colors" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className={`text-[13.5px] font-semibold leading-snug ${task.done ? "line-through text-white/30" : "text-white"}`}>
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-white/40">{task.project}</span>
                        {task.due === "Today" && !task.done && (
                          <span className="text-[10px] font-bold text-red-400 bg-red-400/10 border border-red-400/20 px-1.5 py-0.5 rounded-full">TODAY</span>
                        )}
                      </div>
                    </div>

                    {/* XP reward */}
                    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border ${task.done ? "bg-white/5 border-white/10" : diff.bg}`}>
                      <Zap className={`h-3 w-3 ${task.done ? "text-white/20" : diff.color}`} />
                      <span className={`text-[12px] font-black ${task.done ? "text-white/20" : diff.color}`}>+{task.xp}</span>
                      <span className={`text-[9px] font-bold ${task.done ? "text-white/15" : diff.color} opacity-70`}>XP</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Badges row */}
          <div className="px-4 pb-3 border-t border-white/8 pt-3">
            <div className="flex items-center gap-2 mb-2">
              <Award className="h-3.5 w-3.5 text-yellow-400" />
              <span className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Achievements</span>
            </div>
            <div className="flex items-center gap-2">
              {BADGES.map(b => (
                <div key={b.label} title={b.label}
                  className={`h-9 w-9 rounded-xl flex items-center justify-center text-[18px] transition-all ${b.earned ? "bg-white/10 border border-white/20 shadow-lg" : "bg-white/3 border border-white/5 grayscale opacity-30"}`}>
                  {b.icon}
                </div>
              ))}
              <span className="text-[11px] text-white/30 ml-1">3/5 unlocked</span>
            </div>
          </div>
        </div>

        {/* Leaderboard sidebar */}
        <div className="w-56 flex-shrink-0 bg-[#0A0A1A] border-l border-white/8 flex flex-col">
          <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-400" />
            <span className="text-[12px] font-bold text-white/70 uppercase tracking-wider">Team Rank</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {TEAM.map(member => (
              <div key={member.name}
                className={`rounded-xl p-2.5 transition-all ${member.isMe ? "bg-blue-500/15 border border-blue-500/30" : "bg-white/4 border border-white/8"}`}>
                <div className="flex items-center gap-2.5">
                  <span className={`text-[11px] font-black w-4 text-center ${member.rank === 1 ? "text-yellow-400" : member.rank === 2 ? "text-slate-300" : "text-amber-600"}`}>
                    #{member.rank}
                  </span>
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${member.color}`}>
                    {member.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[12px] font-semibold truncate ${member.isMe ? "text-white" : "text-white/70"}`}>{member.name}</p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-yellow-400 font-bold">{member.xp.toLocaleString()} XP</span>
                      <span className="text-[10px] text-orange-400 flex items-center gap-0.5">
                        <Flame className="h-2.5 w-2.5" />{member.streak}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-1.5 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${member.color}`} style={{ width: `${(member.xp / 1600) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-white/8">
            <div className="flex items-center gap-1.5 text-[11px] text-white/30">
              <TrendingUp className="h-3 w-3" /> Resets Monday
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
