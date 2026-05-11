import {
  LayoutDashboard, MapPin, FolderKanban, Users, Calculator,
  ClipboardList, BarChart3, Settings, Bell, Building2, LogOut
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

export function IconFirst() {
  return (
    <div className="w-[280px] h-screen bg-[#1e1b4b] flex flex-col font-['Inter'] select-none">
      {/* Header */}
      <div className="px-5 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/40">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-bold text-sm">PACT</span>
        </div>
        <div className="relative">
          <Bell className="w-4.5 h-4.5 text-indigo-300" />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold">5</span>
        </div>
      </div>

      {/* Nav — icon large, label below */}
      <nav className="flex-1 px-4 py-2 overflow-y-auto">
        <div className="grid grid-cols-3 gap-2">
          {nav.map(({ icon: Icon, label, active, badge }) => (
            <div
              key={label}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl cursor-pointer transition-all relative ${
                active
                  ? "bg-indigo-600 shadow-lg shadow-indigo-500/30"
                  : "hover:bg-white/5"
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${active ? "bg-white/20" : "bg-white/5"}`}>
                <Icon className={`w-5 h-5 ${active ? "text-white" : "text-indigo-300"}`} />
              </div>
              <span className={`text-[10px] font-semibold text-center leading-tight ${active ? "text-white" : "text-indigo-300/70"}`}>
                {label.split(" ").map((w, i) => <span key={i} className="block">{w}</span>)}
              </span>
              {badge && (
                <span className="absolute top-2 right-2 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {badge}
                </span>
              )}
            </div>
          ))}
        </div>
      </nav>

      {/* Bottom */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex justify-around mb-4">
          {[{ icon: Settings, label: "Settings" }, { icon: LogOut, label: "Sign Out" }].map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1 cursor-pointer group">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-all">
                <Icon className="w-4.5 h-4.5 text-indigo-300/60" />
              </div>
              <span className="text-[9px] text-indigo-300/50">{label}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 bg-white/5 rounded-2xl px-3 py-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">AH</div>
          <div>
            <p className="text-white text-xs font-semibold">Ahmed Hassan</p>
            <p className="text-indigo-300/60 text-[10px]">Super Admin</p>
          </div>
        </div>
      </div>
    </div>
  );
}
