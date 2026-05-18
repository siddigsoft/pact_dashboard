import {
  LayoutDashboard, MapPin, FolderKanban, Users, Calculator,
  ClipboardList, BarChart3, Settings, Bell, Building2, LogOut, ChevronRight
} from "lucide-react";

const groups = [
  {
    label: "Operations",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", active: true },
      { icon: MapPin, label: "Site Visits", badge: "3" },
      { icon: FolderKanban, label: "Projects" },
    ],
  },
  {
    label: "Management",
    items: [
      { icon: Users, label: "HR & Finance" },
      { icon: Calculator, label: "Accounting" },
      { icon: ClipboardList, label: "Surveys" },
      { icon: BarChart3, label: "Reports" },
    ],
  },
];

export function MinimalLight() {
  return (
    <div className="w-[280px] h-screen bg-white flex flex-col font-['Inter'] select-none border-r border-gray-100">
      {/* Header */}
      <div className="px-6 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center">
            <Building2 className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-gray-900 font-semibold text-sm tracking-tight">PACT Command</span>
        </div>
      </div>

      <div className="mx-6 h-px bg-gray-100" />

      {/* Nav */}
      <nav className="flex-1 px-4 py-4 space-y-5 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-widest px-2 mb-1.5">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map(({ icon: Icon, label, active, badge }) => (
                <div
                  key={label}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all group ${
                    active
                      ? "bg-gray-900 text-white"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-medium flex-1">{label}</span>
                  {badge && (
                    <span className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
                      {badge}
                    </span>
                  )}
                  {!badge && (
                    <ChevronRight className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity ${active ? "opacity-40" : ""}`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mx-6 h-px bg-gray-100" />

      {/* Bottom */}
      <div className="px-4 py-4 space-y-0.5">
        {[{ icon: Bell, label: "Notifications", badge: "5" }, { icon: Settings, label: "Settings" }, { icon: LogOut, label: "Sign Out" }].map(({ icon: Icon, label, badge }) => (
          <div key={label} className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-all">
            <Icon className="w-4 h-4" />
            <span className="text-sm font-medium flex-1">{label}</span>
            {badge && <span className="text-[10px] font-semibold bg-red-100 text-red-600 rounded-full px-1.5 py-0.5">{badge}</span>}
          </div>
        ))}
      </div>

      {/* User */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-100 bg-gray-50">
          <div className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center text-white text-[10px] font-bold">AH</div>
          <div className="flex-1 min-w-0">
            <p className="text-gray-800 text-xs font-semibold">Ahmed Hassan</p>
            <p className="text-gray-400 text-[10px]">Super Admin</p>
          </div>
        </div>
      </div>
    </div>
  );
}
