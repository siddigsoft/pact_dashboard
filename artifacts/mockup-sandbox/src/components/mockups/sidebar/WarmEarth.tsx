import {
  LayoutDashboard, MapPin, FolderKanban, Users, Calculator,
  ClipboardList, BarChart3, Settings, Bell, Building2, LogOut, Leaf
} from "lucide-react";

const groups = [
  {
    label: "Field Ops",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", active: true },
      { icon: MapPin, label: "Site Visits", badge: "3" },
      { icon: FolderKanban, label: "Projects" },
    ],
  },
  {
    label: "Back Office",
    items: [
      { icon: Users, label: "HR & Finance" },
      { icon: Calculator, label: "Accounting" },
      { icon: ClipboardList, label: "Surveys" },
      { icon: BarChart3, label: "Reports" },
    ],
  },
];

export function WarmEarth() {
  return (
    <div className="w-[280px] h-screen bg-[#faf6f1] flex flex-col font-['Georgia,_serif'] select-none border-r border-[#e8d5c0]">
      {/* Header */}
      <div className="px-5 py-5 bg-[#8b5e3c] relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{backgroundImage:"radial-gradient(circle at 80% 50%, #f59e0b 0%, transparent 60%)"}} />
        <div className="relative flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center border border-white/30">
            <Building2 className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm">PACT Command</p>
            <p className="text-amber-200/80 text-xs">Field Operations</p>
          </div>
          <Leaf className="ml-auto w-4 h-4 text-green-300/60" />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 py-5 space-y-5 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-[#b08050] text-[10px] font-bold uppercase tracking-widest px-2 mb-2 font-['Inter']">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map(({ icon: Icon, label, active, badge }) => (
                <div
                  key={label}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                    active
                      ? "bg-[#8b5e3c] text-white shadow-md shadow-[#8b5e3c]/20"
                      : "text-[#7a5c42] hover:bg-[#f0e6d8] hover:text-[#5a3e28]"
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${active ? "bg-white/20" : "bg-[#e8d5c0]"}`}>
                    <Icon className={`w-3.5 h-3.5 ${active ? "text-white" : "text-[#8b5e3c]"}`} />
                  </div>
                  <span className={`text-sm flex-1 font-['Inter'] ${active ? "font-semibold" : "font-medium"}`}>{label}</span>
                  {badge && (
                    <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 font-['Inter'] ${active ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"}`}>
                      {badge}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-4 pb-4 border-t border-[#e8d5c0] pt-4 space-y-0.5">
        {[{ icon: Bell, label: "Notifications", badge: "5" }, { icon: Settings, label: "Settings" }, { icon: LogOut, label: "Sign Out" }].map(({ icon: Icon, label, badge }) => (
          <div key={label} className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-[#9a7050] hover:bg-[#f0e6d8] transition-all font-['Inter']">
            <Icon className="w-4 h-4" />
            <span className="text-sm font-medium flex-1">{label}</span>
            {badge && <span className="bg-red-100 text-red-600 text-[10px] font-bold rounded-full px-1.5 py-0.5">{badge}</span>}
          </div>
        ))}
        <div className="flex items-center gap-3 mt-3 px-3 py-2 rounded-xl bg-[#f0e6d8] border border-[#e8d5c0]">
          <div className="w-8 h-8 rounded-full bg-[#8b5e3c] flex items-center justify-center text-white text-xs font-bold font-['Inter']">AH</div>
          <div>
            <p className="text-[#5a3e28] text-xs font-semibold font-['Inter']">Ahmed Hassan</p>
            <p className="text-[#b08050] text-[10px] font-['Inter']">Super Admin</p>
          </div>
        </div>
      </div>
    </div>
  );
}
