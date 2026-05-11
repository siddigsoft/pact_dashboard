import {
  LayoutDashboard, MapPin, FolderKanban, Users, Calculator,
  ClipboardList, BarChart3, Settings, Bell, Building2, LogOut, Zap
} from "lucide-react";

const nav = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: MapPin, label: "Site Visits", badge: "3" },
  { icon: FolderKanban, label: "Projects" },
  { icon: Users, label: "HR & Finance" },
  { icon: Calculator, label: "Accounting" },
  { icon: ClipboardList, label: "Surveys" },
  { icon: BarChart3, label: "Reports" },
];

export function BoldTeal() {
  return (
    <div className="w-[280px] h-screen bg-[#0d9488] flex flex-col font-['Inter'] select-none">
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-white/20 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-base leading-none tracking-tight">PACT</p>
            <p className="text-teal-200 text-xs mt-0.5 font-medium">Command Center</p>
          </div>
          <div className="ml-auto">
            <Zap className="w-4 h-4 text-yellow-300" />
          </div>
        </div>
      </div>

      {/* Status badge */}
      <div className="mx-5 mb-4">
        <div className="bg-white/10 rounded-xl px-3 py-2 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
          <span className="text-teal-100 text-xs font-medium">All systems operational</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {nav.map(({ icon: Icon, label, active, badge }) => (
          <div
            key={label}
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl cursor-pointer transition-all ${
              active
                ? "bg-white text-teal-700 shadow-lg shadow-black/10"
                : "text-white/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon className={`w-4.5 h-4.5 shrink-0 ${active ? "text-teal-600" : ""}`} />
            <span className={`text-sm flex-1 ${active ? "font-bold text-teal-800" : "font-medium"}`}>{label}</span>
            {badge && (
              <span className={`text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 ${
                active ? "bg-teal-500 text-white" : "bg-white/20 text-white"
              }`}>
                {badge}
              </span>
            )}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-4 py-4 border-t border-white/20 space-y-1">
        {[
          { icon: Bell, label: "Notifications", badge: "5" },
          { icon: Settings, label: "Settings" },
          { icon: LogOut, label: "Sign Out" },
        ].map(({ icon: Icon, label, badge }) => (
          <div key={label} className="flex items-center gap-3 px-4 py-2.5 rounded-2xl cursor-pointer text-white/70 hover:bg-white/10 hover:text-white transition-all">
            <Icon className="w-4 h-4" />
            <span className="text-sm font-medium flex-1">{label}</span>
            {badge && <span className="text-[10px] font-bold bg-red-400 text-white rounded-full px-1.5 py-0.5">{badge}</span>}
          </div>
        ))}
        <div className="flex items-center gap-3 px-4 pt-3">
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-teal-700 text-xs font-bold shadow">AH</div>
          <div>
            <p className="text-white text-xs font-semibold">Ahmed Hassan</p>
            <p className="text-teal-200 text-[10px]">Super Admin</p>
          </div>
        </div>
      </div>
    </div>
  );
}
