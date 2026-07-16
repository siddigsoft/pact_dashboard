import { useState } from "react";

// PACT exact colors: sidebar-bg hsl(222.2 47.4% 11.2%), primary hsl(221.2 83% 53.9%)
const BG = "#0f1829";
const ACCENT = "#1c2d40";
const PRIMARY = "#3b7ef5";
const FG = "#f7f9fc";
const MUTED = "rgba(247,249,252,0.45)";
const BORDER = "rgba(247,249,252,0.07)";
const PAGE = "#f0f4ff";

const NAV = [
  { icon: "⊞", label: "Dashboard" },
  { icon: "🗺", label: "Field Operations" },
  { icon: "📋", label: "MMP Management", badge: 8 },
  { icon: "💰", label: "Cost Submission", badge: 3 },
  { icon: "📊", label: "Finance Hub" },
  { icon: "👥", label: "Staff Directory" },
  { icon: "📅", label: "Calendar" },
  { icon: "🔔", label: "Notifications", badge: 12 },
  { icon: "⚙️", label: "Settings" },
];

const SPRING = "cubic-bezier(0.34, 1.4, 0.64, 1)";

export function PillRail() {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(0);

  return (
    <div style={{ display:"flex", height:"100vh", background:PAGE, fontFamily:"'Inter',system-ui,sans-serif", overflow:"hidden" }}>
      {/* Sidebar */}
      <div style={{
        width: open ? 228 : 56,
        transition: `width 0.38s ${SPRING}`,
        flexShrink: 0, overflow:"hidden",
        background: BG,
        display:"flex", flexDirection:"column",
        boxShadow: "2px 0 16px rgba(0,0,0,0.25)",
      }}>
        {/* Logo */}
        <div style={{ height:60, display:"flex", alignItems:"center", padding:"0 12px", borderBottom:`1px solid ${BORDER}`, gap:10, flexShrink:0 }}>
          <div style={{
            width:32, height:32, borderRadius:8, flexShrink:0,
            background:`linear-gradient(135deg, ${PRIMARY} 0%, #2563eb 100%)`,
            display:"flex", alignItems:"center", justifyContent:"center",
            color:"#fff", fontSize:14, fontWeight:800,
            boxShadow:`0 0 0 1px rgba(59,126,245,0.4), 0 4px 12px rgba(59,126,245,0.3)`,
          }}>P</div>
          <div style={{ opacity: open?1:0, transform: open?"translateX(0)":"translateX(-6px)", transition:`all 0.25s ease`, whiteSpace:"nowrap" }}>
            <div style={{ fontSize:13, fontWeight:700, color:FG, letterSpacing:"-0.2px" }}>PACT</div>
            <div style={{ fontSize:10, color:MUTED, letterSpacing:"0.5px" }}>Command Center</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding:"10px 8px", overflowY:"auto" }}>
          {NAV.map((item, i) => (
            <button key={i} onClick={() => setActive(i)} title={!open ? item.label : undefined}
              style={{
                display:"flex", alignItems:"center", width:"100%", height:40,
                borderRadius:8, padding: open ? "0 10px" : "0", justifyContent: open?"flex-start":"center",
                gap:10, border:"none", cursor:"pointer", marginBottom:3,
                background: active===i ? `linear-gradient(90deg, ${PRIMARY}22 0%, ${PRIMARY}08 100%)` : "transparent",
                color: active===i ? PRIMARY : MUTED,
                transition:`all 0.2s ease`,
                position:"relative", overflow:"hidden",
              }}>
              {/* Pill indicator */}
              {active===i && (
                <div style={{
                  position:"absolute", left:0, top:"50%", transform:"translateY(-50%)",
                  width:3, height:24, borderRadius:"0 3px 3px 0",
                  background: PRIMARY,
                  boxShadow:`0 0 8px ${PRIMARY}80`,
                }}/>
              )}
              <span style={{ fontSize:17, flexShrink:0, filter: active===i ? `drop-shadow(0 0 4px ${PRIMARY}80)` : "none", transition:"filter 0.2s" }}>
                {item.icon}
              </span>
              {open && (
                <>
                  <span style={{ fontSize:12.5, fontWeight: active===i?600:400, flex:1, textAlign:"left", color: active===i?FG:MUTED, whiteSpace:"nowrap" }}>
                    {item.label}
                  </span>
                  {item.badge && (
                    <span style={{
                      background: active===i ? PRIMARY : "rgba(59,126,245,0.2)",
                      color: active===i ? "#fff" : PRIMARY,
                      fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:10,
                    }}>{item.badge}</span>
                  )}
                </>
              )}
              {!open && item.badge && (
                <div style={{
                  position:"absolute", top:6, right:6,
                  width:7, height:7, borderRadius:"50%",
                  background: PRIMARY, boxShadow:`0 0 6px ${PRIMARY}`,
                }}/>
              )}
            </button>
          ))}
        </nav>

        {/* Toggle + user */}
        <div style={{ padding:"10px 8px", borderTop:`1px solid ${BORDER}`, flexShrink:0 }}>
          <button onClick={() => setOpen(!open)} style={{
            display:"flex", alignItems:"center", justifyContent: open?"space-between":"center",
            width:"100%", height:38, borderRadius:8, padding:"0 10px",
            border:"none", cursor:"pointer", background:ACCENT, color:MUTED,
            fontSize:12, gap:8, transition:"all 0.2s",
          }}>
            {open && <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:26, height:26, borderRadius:"50%", background:"linear-gradient(135deg, #f59e0b,#ef4444)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"#fff" }}>SA</div>
              <div style={{ textAlign:"left" }}>
                <div style={{ fontSize:11, fontWeight:600, color:FG, lineHeight:1.2 }}>Super Admin</div>
                <div style={{ fontSize:10, color:MUTED }}>online</div>
              </div>
            </div>}
            <span style={{ transition:`transform 0.38s ${SPRING}`, transform: open?"rotate(0deg)":"rotate(180deg)", display:"block" }}>◀</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, padding:20, overflowY:"auto" }}>
        <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:18, marginBottom:14, boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize:16, fontWeight:700, color:"#1e293b", marginBottom:6 }}>① Compact Pill Rail</div>
          <div style={{ fontSize:12.5, color:"#64748b", lineHeight:1.7 }}>
            Collapses to a 56px icon-only rail. Active item gets a left-edge glow pill + icon drop-shadow.
            Badges become dot indicators in collapsed state. Spring easing on expand.
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          {[["MMP Cycles","12 active","#3b7ef5"],["Coverage","67%","#10b981"],["Pending Costs","3","#f59e0b"],["Staff Active","247","#8b5cf6"]].map(([l,v,c]) => (
            <div key={l as string} style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:10, padding:14, boxShadow:"0 1px 2px rgba(0,0,0,0.04)" }}>
              <div style={{ fontSize:10.5, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:4 }}>{l}</div>
              <div style={{ fontSize:22, fontWeight:700, color:c as string }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
