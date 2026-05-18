import {
  LayoutDashboard, MapPin, FolderKanban, Users, Calculator,
  ClipboardList, BarChart3, Settings, Bell, ChevronRight,
  Building2, LogOut, Search
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

const bottom = [
  { icon: Bell, label: "Notifications", badge: "5" },
  { icon: Settings, label: "Settings" },
  { icon: LogOut, label: "Sign Out" },
];

export function DarkCompact() {
  return (
    <div className="w-[280px] h-screen bg-[#0f172a] flex flex-col font-['Inter'] select-none">
      {/* Header */}
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white text-sm font-semibold leading-none">PACT</p>
            <p className="text-slate-400 text-xs mt-0.5">Command Center</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-3">
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
          <Search className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-slate-500 text-xs">Quick search...</span>
          <span className="ml-auto text-slate-600 text-[10px] bg-white/5 rounded px-1.5 py-0.5">⌘K</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-1 space-y-0.5 overflow-y-auto">
        <p className="text-slate-600 text-[10px] font-semibold uppercase tracking-widest px-2 py-2">Main Menu</p>
        {nav.map(({ icon: Icon, label, active, badge }) => (
          <div
            key={label}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
              active
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="text-sm font-medium flex-1">{label}</span>
            {badge && (
              <span className={`text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center ${active ? "bg-white/20 text-white" : "bg-blue-500 text-white"}`}>
                {badge}
              </span>
            )}
            {!badge && !active && <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100" />}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-3 border-t border-white/10 space-y-0.5">
        {bottom.map(({ icon: Icon, label, badge }) => (
          <div key={label} className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-slate-400 hover:bg-white/5 hover:text-white transition-all">
            <Icon className="w-4 h-4 shrink-0" />
            <span className="text-sm font-medium flex-1">{label}</span>
            {badge && <span className="text-[10px] font-bold bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center">{badge}</span>}
          </div>
        ))}
        <div className="flex items-center gap-3 px-3 py-2.5 mt-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold">AH</div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">Ahmed Hassan</p>
            <p className="text-slate-500 text-[10px] truncate">Super Admin</p>
          </div>
        </div>
      </div>
    </div>
  );
}
