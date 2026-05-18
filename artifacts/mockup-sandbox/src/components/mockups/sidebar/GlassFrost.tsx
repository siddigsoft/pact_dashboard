import {
  LayoutDashboard, MapPin, FolderKanban, Users, Calculator,
  ClipboardList, BarChart3, Settings, Bell, Building2, LogOut, Search
} from "lucide-react";

const nav = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: MapPin, label: "Site Visits", badge: "3" },
  { icon: FolderKanban, label: "Projects" },
  { icon: Users, label: "HR & Finance" },
  { icon: Calculator, label: "Accounting" },
  { icon: ClipboardList, label: "Surveys" },
  { icon: BarChart3, label: "Reports" },
  { icon: Bell, label: "Notifications", badge: "5" },
  { icon: Settings, label: "Settings" },
  { icon: LogOut, label: "Sign Out" },
];

export function GlassFrost() {
  return (
    <div className="w-[280px] h-screen relative overflow-hidden font-['Inter'] select-none">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-900 via-blue-900 to-slate-900" />
      <div className="absolute top-[-80px] left-[-60px] w-64 h-64 rounded-full bg-violet-500/30 blur-3xl" />
      <div className="absolute bottom-[-60px] right-[-40px] w-48 h-48 rounded-full bg-blue-400/20 blur-3xl" />

      {/* Glass panel */}
      <div className="relative h-full flex flex-col backdrop-blur-xl bg-white/[0.07] border-r border-white/10">
        {/* Header */}
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center">
              <Building2 className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">PACT Command</p>
              <p className="text-white/50 text-xs">Field Operations</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2.5 border border-white/10">
            <Search className="w-3.5 h-3.5 text-white/40" />
            <span className="text-white/40 text-xs">Search...</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
          {nav.map(({ icon: Icon, label, active, badge }) => (
            <div
              key={label}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                active
                  ? "bg-white/20 border border-white/20 shadow-lg shadow-white/5"
                  : "hover:bg-white/10"
              }`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${active ? "bg-white/20" : "bg-white/5"}`}>
                <Icon className={`w-3.5 h-3.5 ${active ? "text-white" : "text-white/60"}`} />
              </div>
              <span className={`text-sm flex-1 ${active ? "text-white font-semibold" : "text-white/60 font-medium"}`}>{label}</span>
              {badge && (
                <span className="text-[10px] font-bold bg-white/20 backdrop-blur text-white rounded-full px-1.5 py-0.5 border border-white/20">
                  {badge}
                </span>
              )}
            </div>
          ))}
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-3 p-2 rounded-xl bg-white/5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-blue-400 flex items-center justify-center text-white text-xs font-bold border border-white/20">AH</div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold">Ahmed Hassan</p>
              <p className="text-white/40 text-[10px]">Super Admin</p>
            </div>
            <Settings className="w-3.5 h-3.5 text-white/30" />
          </div>
        </div>
      </div>
    </div>
  );
}
