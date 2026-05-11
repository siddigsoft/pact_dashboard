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

export function RailNav() {
  return (
    <div className="w-[280px] h-screen bg-white flex font-['Inter'] select-none border-r border-gray-200">
      {/* Ultra-narrow icon rail */}
      <div className="w-16 h-full bg-[#111827] flex flex-col items-center py-4 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center mb-6 shadow-lg shadow-blue-600/30">
          <Building2 className="w-4.5 h-4.5 text-white" />
        </div>
        <div className="flex-1 flex flex-col items-center gap-1 w-full px-2">
          {nav.map(({ icon: Icon, label, active, badge }) => (
            <div
              key={label}
              title={label}
              className={`relative w-full flex items-center justify-center py-2.5 rounded-xl cursor-pointer transition-all ${
                active ? "bg-blue-600" : "hover:bg-white/5"
              }`}
            >
              <Icon className={`w-4.5 h-4.5 ${active ? "text-white" : "text-gray-500"}`} />
              {badge && (
                <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-red-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold">
                  {badge}
                </span>
              )}
              {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-400 rounded-r-full -ml-2" />}
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center gap-1 w-full px-2 mt-2">
          {[Bell, Settings, LogOut].map((Icon, i) => (
            <div key={i} className="w-full flex items-center justify-center py-2.5 rounded-xl cursor-pointer hover:bg-white/5 transition-all">
              <Icon className="w-4 h-4 text-gray-600" />
            </div>
          ))}
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold mt-2 cursor-pointer">AH</div>
        </div>
      </div>

      {/* Expanded panel for active section */}
      <div className="flex-1 flex flex-col">
        <div className="px-5 pt-6 pb-4 border-b border-gray-100">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Section</p>
          <p className="text-gray-900 font-bold text-lg leading-none">Dashboard</p>
        </div>
        <div className="flex-1 px-4 py-4">
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest mb-3">Quick Links</p>
          {["Overview", "Live Map", "Recent Activity", "KPI Cards", "Alerts"].map((item) => (
            <div key={item} className={`px-3 py-2.5 rounded-lg text-sm cursor-pointer mb-1 transition-all ${item === "Overview" ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}>
              {item}
            </div>
          ))}

          <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest mb-3 mt-6">Recent Sites</p>
          {["Khartoum North Hub", "Port Sudan Field", "Kassala District"].map((site) => (
            <div key={site} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm cursor-pointer text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-all mb-1">
              <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
              {site}
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-gray-100">
          <p className="text-gray-800 text-xs font-semibold">Ahmed Hassan</p>
          <p className="text-gray-400 text-[10px]">Super Admin • Sudan</p>
        </div>
      </div>
    </div>
  );
}
