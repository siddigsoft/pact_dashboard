import { useState } from "react";

const BG = "#0f1829";
const ACCENT = "#1c2d40";
const PRIMARY = "#3b7ef5";
const FG = "#f7f9fc";
const MUTED = "rgba(247,249,252,0.45)";
const BORDER = "rgba(247,249,252,0.08)";
const PAGE = "#ebf0fb";

const NAV = [
  { icon: "⊞", label: "Dashboard", group: "Overview" },
  { icon: "🗺", label: "Field Ops", group: "Overview" },
  { icon: "📋", label: "MMP Management", badge: 8, group: "Operations" },
  { icon: "💰", label: "Cost Submission", badge: 3, group: "Operations" },
  { icon: "📊", label: "Finance Hub", group: "Finance" },
  { icon: "👥", label: "Staff Directory", group: "HR" },
  { icon: "🔔", label: "Notifications", badge: 5, group: "HR" },
  { icon: "⚙️", label: "Settings", group: "System" },
];

export function FloatingPanel() {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(0);

  return (
    <div style={{ display:"flex", height:"100vh", background:PAGE, fontFamily:"'Inter',system-ui,sans-serif", overflow:"hidden", padding:10, gap:10 }}>
      {/* Floating Sidebar */}
      {open && (
        <div style={{
          width:220, flexShrink:0,
          background: BG,
          borderRadius:14,
          border: `1px solid ${BORDER}`,
          boxShadow: "0 8px 32px rgba(0,0,0,0.32), 0 2px 8px rgba(0,0,0,0.2)",
          display:"flex", flexDirection:"column",
          overflow:"hidden",
          animation: "floatIn 0.35s cubic-bezier(0.34,1.4,0.64,1)",
        }}>
          {/* Logo */}
          <div style={{ padding:"16px 14px 12px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:10 }}>
            <div style={{
              width:34, height:34, borderRadius:9, flexShrink:0,
              background:`linear-gradient(135deg, #3b7ef5 0%, #2563eb 100%)`,
              display:"flex", alignItems:"center", justifyContent:"center",
              color:"#fff", fontSize:15, fontWeight:800,
              boxShadow:"0 4px 12px rgba(59,126,245,0.4)",
            }}>P</div>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:FG }}>PACT</div>
              <div style={{ fontSize:10, color:MUTED }}>Command Center</div>
            </div>
          </div>

          {/* Search */}
          <div style={{ padding:"10px 10px 6px" }}>
            <div style={{
              background: ACCENT, border:`1px solid rgba(247,249,252,0.1)`,
              borderRadius:7, padding:"7px 10px",
              display:"flex", alignItems:"center", gap:7,
              color:MUTED, fontSize:12,
            }}>
              <span>🔍</span>
              <span>Search…</span>
              <span style={{ marginLeft:"auto", background:"rgba(247,249,252,0.1)", padding:"1px 5px", borderRadius:4, fontSize:10 }}>⌘K</span>
            </div>
          </div>

          {/* Nav */}
          <nav style={{ flex:1, padding:"6px 8px", overflowY:"auto" }}>
            {NAV.map((item, i) => (
              <button key={i} onClick={() => setActive(i)} style={{
                display:"flex", alignItems:"center", width:"100%",
                height:38, borderRadius:8, padding:"0 10px", gap:9,
                border:"none", cursor:"pointer", marginBottom:2,
                background: active===i ? `rgba(59,126,245,0.18)` : "transparent",
                outline: active===i ? `1px solid rgba(59,126,245,0.25)` : "none",
                color: active===i ? "#7eb8ff" : MUTED,
                transition:"all 0.15s ease",
              }}>
                <span style={{ fontSize:16, flexShrink:0 }}>{item.icon}</span>
                <span style={{ fontSize:12, fontWeight:active===i?600:400, flex:1, textAlign:"left", color:active===i?FG:MUTED, whiteSpace:"nowrap" }}>
                  {item.label}
                </span>
                {item.badge && (
                  <span style={{
                    background: active===i ? "rgba(59,126,245,0.4)" : "rgba(247,249,252,0.1)",
                    color: active===i ? "#fff" : MUTED,
                    fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:8,
                  }}>{item.badge}</span>
                )}
              </button>
            ))}
          </nav>

          {/* User */}
          <div style={{ padding:"10px 10px", borderTop:`1px solid ${BORDER}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:9, padding:"8px 8px", borderRadius:8, background:ACCENT, cursor:"pointer" }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:"linear-gradient(135deg,#f59e0b,#ef4444)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"#fff", flexShrink:0 }}>SA</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, fontWeight:600, color:FG }}>Super Admin</div>
                <div style={{ fontSize:10, color:MUTED }}>admin@pact.org</div>
              </div>
              <span style={{ color:MUTED, fontSize:13 }}>⋮</span>
            </div>
          </div>
        </div>
      )}

      {/* Content area */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", gap:10, minWidth:0 }}>
        {/* Top bar */}
        <div style={{ background:"#fff", borderRadius:12, border:"1px solid #dbe4f5", padding:"0 16px", height:52, display:"flex", alignItems:"center", gap:10, boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
          <button onClick={() => setOpen(!open)} style={{ background:"#f0f4ff", border:"1px solid #dbe4f5", borderRadius:7, width:32, height:32, cursor:"pointer", fontSize:15, display:"flex", alignItems:"center", justifyContent:"center" }}>
            {open ? "◀" : "▶"}
          </button>
          <span style={{ fontSize:13, color:"#64748b" }}>/ {NAV[active].label}</span>
        </div>

        <div style={{ background:"#fff", borderRadius:12, border:"1px solid #dbe4f5", padding:18, boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize:16, fontWeight:700, color:"#1e293b", marginBottom:6 }}>② Floating Panel</div>
          <div style={{ fontSize:12.5, color:"#64748b", lineHeight:1.7 }}>
            The sidebar is a <strong>floating rounded card</strong> (14px radius, deep shadow) with 10px padding from the screen edge — it never touches the edges.
            Includes a CMD+K search bar. Clicking the toggle hides/shows it with a spring-in entrance animation.
          </div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, flex:1 }}>
          {[["Sites Covered","1,902","#3b7ef5"],["Pending","341","#f59e0b"],["Rejected","48","#ef4444"]].map(([l,v,c]) => (
            <div key={l as string} style={{ background:"#fff", borderRadius:10, border:"1px solid #dbe4f5", padding:14 }}>
              <div style={{ fontSize:10.5, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:4 }}>{l}</div>
              <div style={{ fontSize:22, fontWeight:700, color:c as string }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      <style>{`@keyframes floatIn { from { opacity:0; transform:translateX(-12px) scale(0.97); } to { opacity:1; transform:translateX(0) scale(1); } }`}</style>
    </div>
  );
}
