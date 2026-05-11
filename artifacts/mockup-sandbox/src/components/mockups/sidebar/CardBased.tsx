import {
  LayoutDashboard, MapPin, FolderKanban, Users, Calculator,
  ClipboardList, BarChart3, Settings, Bell, Building2, LogOut, TrendingUp, AlertCircle
} from "lucide-react";

export function CardBased() {
  return (
    <div className="w-[280px] h-screen bg-[#f8fafc] flex flex-col font-['Inter'] select-none p-3 gap-2 overflow-y-auto">
      {/* Header card */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-4 shadow-lg">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white text-sm font-bold">PACT Command</p>
            <p className="text-slate-400 text-[10px]">Field Operations</p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 bg-white/5 rounded-xl p-2 text-center">
            <p className="text-green-400 text-sm font-bold">24</p>
            <p className="text-slate-400 text-[9px]">Active Sites</p>
          </div>
          <div className="flex-1 bg-white/5 rounded-xl p-2 text-center">
            <p className="text-amber-400 text-sm font-bold">3</p>
            <p className="text-slate-400 text-[9px]">Pending</p>
          </div>
          <div className="flex-1 bg-white/5 rounded-xl p-2 text-center">
            <p className="text-blue-400 text-sm font-bold">8</p>
            <p className="text-slate-400 text-[9px]">Projects</p>
          </div>
        </div>
      </div>

      {/* Active item card */}
      <div className="bg-blue-600 rounded-2xl p-3.5 shadow-lg shadow-blue-600/20 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
          <LayoutDashboard className="w-4.5 h-4.5 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-white text-sm font-bold">Dashboard</p>
          <p className="text-blue-200 text-[10px]">Mission control view</p>
        </div>
        <TrendingUp className="w-4 h-4 text-white/60" />
      </div>

      {/* Operations card group */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Operations</p>
        </div>
        {[
          { icon: MapPin, label: "Site Visits", sub: "Monitor field sites", badge: "3", color: "text-emerald-500", bg: "bg-emerald-50" },
          { icon: FolderKanban, label: "Projects", sub: "Track project flow", color: "text-violet-500", bg: "bg-violet-50" },
        ].map(({ icon: Icon, label, sub, badge, color, bg }) => (
          <div key={label} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-all border-b border-gray-50 last:border-0">
            <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-gray-800 text-sm font-semibold">{label}</p>
              <p className="text-gray-400 text-[10px]">{sub}</p>
            </div>
            {badge && <span className="text-[10px] font-bold bg-amber-100 text-amber-600 rounded-full px-1.5 py-0.5">{badge}</span>}
          </div>
        ))}
      </div>

      {/* Finance card group */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Administration</p>
        </div>
        {[
          { icon: Users, label: "HR & Finance", sub: "People & payroll", color: "text-blue-500", bg: "bg-blue-50" },
          { icon: Calculator, label: "Accounting", sub: "GL & journals", color: "text-indigo-500", bg: "bg-indigo-50" },
          { icon: ClipboardList, label: "Surveys", sub: "Data collection", color: "text-pink-500", bg: "bg-pink-50" },
          { icon: BarChart3, label: "Reports", sub: "Analytics & export", color: "text-orange-500", bg: "bg-orange-50" },
        ].map(({ icon: Icon, label, sub, color, bg }) => (
          <div key={label} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-all border-b border-gray-50 last:border-0">
            <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-gray-800 text-sm font-semibold">{label}</p>
              <p className="text-gray-400 text-[10px]">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Alert card */}
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-amber-800 text-xs font-semibold">5 Notifications</p>
          <p className="text-amber-600 text-[10px] mt-0.5">2 require your approval</p>
        </div>
      </div>

      {/* Bottom actions */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {[{ icon: Bell, label: "Notifications", badge: "5" }, { icon: Settings, label: "Settings" }, { icon: LogOut, label: "Sign Out" }].map(({ icon: Icon, label, badge }) => (
          <div key={label} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-all border-b border-gray-50 last:border-0">
            <Icon className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600 font-medium flex-1">{label}</span>
            {badge && <span className="text-[10px] font-bold bg-red-100 text-red-600 rounded-full px-1.5 py-0.5">{badge}</span>}
          </div>
        ))}
      </div>

      {/* User */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow">AH</div>
        <div className="flex-1">
          <p className="text-gray-800 text-xs font-bold">Ahmed Hassan</p>
          <p className="text-gray-400 text-[10px]">Super Admin</p>
        </div>
        <div className="w-2 h-2 rounded-full bg-green-400" />
      </div>
    </div>
  );
}
