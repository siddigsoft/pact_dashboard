import { useState } from "react";

const BG = "#0f1829";
const ACCENT = "#1c2d40";
const PRIMARY = "#3b7ef5";
const FG = "#f7f9fc";
const MUTED = "rgba(247,249,252,0.45)";
const BORDER = "rgba(247,249,252,0.07)";
const PAGE = "#f5f8ff";

const GROUPS = [
  {
    label: "Operations", color: PRIMARY,
    items: [
      { icon: "⊞", label: "Dashboard" },
      { icon: "🗺", label: "Field Operations" },
      { icon: "📋", label: "MMP Management", badge: 8 },
    ]
  },
  {
    label: "Finance", color: "#10b981",
    items: [
      { icon: "💰", label: "Cost Submission", badge: 3 },
      { icon: "📊", label: "Finance Hub" },
      { icon: "🏦", label: "Budget Planning" },
    ]
  },
  {
    label: "People", color: "#f59e0b",
    items: [
      { icon: "👥", label: "Staff Directory" },
      { icon: "📅", label: "Calendar" },
      { icon: "🔔", label: "Notifications", badge: 12 },
    ]
  },
  {
    label: "System", color: "#8b5cf6",
    items: [
      { icon: "⚙️", label: "Settings" },
    ]
  },
];

const SPRING = "cubic-bezier(0.34,1.4,0.64,1)";

export function TopAccent() {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState("Dashboard");

  return (
    <div style={{ display:"flex", height:"100vh", background:PAGE, fontFamily:"'Inter',system-ui,sans-serif", overflow:"hidden" }}>
      {/* Sidebar */}
      <div style={{
        width: open ? 236 : 0,
        opacity: open ? 1 : 0,
        transition: `width 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease`,
        flexShrink:0, overflow:"hidden",
        background: BG,
        boxShadow: "3px 0 20px rgba(0,0,0,0.2)",
        display:"flex", flexDirection:"column",
      }}>
        {/* Logo */}
        <div style={{ padding:"14px 14px 12px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:10 }}>
          <div style={{
            width:34, height:34, borderRadius:9, flexShrink:0,
            background:`linear-gradient(135deg, ${PRIMARY} 0%, #2563eb 100%)`,
            display:"flex", alignItems:"center", justifyContent:"center",
            color:"#fff", fontSize:15, fontWeight:800,
            boxShadow:`0 4px 14px rgba(59,126,245,0.4)`,
          }}>P</div>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:FG }}>PACT</div>
            <div style={{ fontSize:10, color:MUTED, letterSpacing:"0.3px" }}>Command Center</div>
          </div>
        </div>

        {/* Grouped nav with top-accent bars */}
        <nav style={{ flex:1, overflowY:"auto", padding:"8px 0" }}>
          {GROUPS.map(group => (
            <div key={group.label} style={{ marginBottom:6 }}>
              {/* Section header with color accent top-border */}
              <div style={{
                margin:"0 10px",
                borderRadius:"6px 6px 0 0",
                borderTop:`2px solid ${group.color}`,
                background:`${group.color}12`,
                padding:"5px 10px 4px",
                display:"flex", alignItems:"center", gap:6,
              }}>
                <div style={{ width:6, height:6, borderRadius:"50%", background:group.color, flexShrink:0 }}/>
                <span style={{ fontSize:10, fontWeight:700, color:group.color, textTransform:"uppercase", letterSpacing:"0.7px" }}>
                  {group.label}
                </span>
              </div>
              {/* Items */}
              <div style={{ margin:"0 10px 4px", borderRadius:"0 0 6px 6px", border:`1px solid ${group.color}20`, borderTop:"none", overflow:"hidden", background:`${group.color}06` }}>
                {group.items.map((item, i) => (
                  <button key={i} onClick={() => setActive(item.label)} style={{
                    display:"flex", alignItems:"center", width:"100%",
                    height:36, padding:"0 10px", gap:9,
                    border:"none", borderBottom: i < group.items.length-1 ? `1px solid ${BORDER}` : "none",
                    cursor:"pointer",
                    background: active===item.label ? `${group.color}20` : "transparent",
                    color: active===item.label ? FG : MUTED,
                    transition:"all 0.15s ease",
                  }}>
                    <span style={{ fontSize:15, flexShrink:0 }}>{item.icon}</span>
                    <span style={{ fontSize:12, fontWeight:active===item.label?600:400, flex:1, textAlign:"left", whiteSpace:"nowrap" }}>
                      {item.label}
                    </span>
                    {(item as any).badge && (
                      <span style={{
                        background:`${group.color}30`,
                        color:group.color, fontSize:10, fontWeight:700,
                        padding:"1px 6px", borderRadius:8,
                      }}>{(item as any).badge}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding:"10px 10px", borderTop:`1px solid ${BORDER}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:9, padding:"8px 8px", borderRadius:8, background:ACCENT, cursor:"pointer" }}>
            <div style={{ width:26, height:26, borderRadius:"50%", background:"linear-gradient(135deg,#f59e0b,#ef4444)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"#fff", flexShrink:0 }}>SA</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, fontWeight:600, color:FG }}>Super Admin</div>
              <div style={{ fontSize:10, color:MUTED }}>admin@pact.org</div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
        <div style={{ height:54, borderBottom:"1px solid #e2e8f0", display:"flex", alignItems:"center", padding:"0 18px", gap:10, background:"#fff" }}>
          <button onClick={() => setOpen(!open)} style={{ background:"#f0f4ff", border:"1px solid #dbe4f5", borderRadius:7, width:32, height:32, cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>☰</button>
          <span style={{ fontSize:13, color:"#64748b" }}>/ {active}</span>
        </div>
        <div style={{ flex:1, padding:18, overflowY:"auto" }}>
          <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:18, marginBottom:14, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize:16, fontWeight:700, color:"#1e293b", marginBottom:6 }}>③ Top-Accent Sections</div>
            <div style={{ fontSize:12.5, color:"#64748b", lineHeight:1.7 }}>
              Each section group gets a <strong>colored top-border accent bar</strong> with a matching subtle tinted background — Operations (blue), Finance (green), People (amber), System (purple).
              The active item's highlight uses the section's own color, not a global primary.
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {[["Operations","Active","#3b7ef5"],["Finance","On Track","#10b981"],["HR Alerts","2","#f59e0b"],["System","Healthy","#8b5cf6"]].map(([l,v,c]) => (
              <div key={l as string} style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:10, padding:14 }}>
                <div style={{ fontSize:10.5, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:4 }}>{l}</div>
                <div style={{ fontSize:20, fontWeight:700, color:c as string }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
