import { useState } from "react";

const BG = "#0f1829";
const ACCENT = "#1c2d40";
const PRIMARY = "#3b7ef5";
const FG = "#f7f9fc";
const MUTED = "rgba(247,249,252,0.45)";
const BORDER = "rgba(247,249,252,0.07)";
const PAGE = "#f0f4ff";

const MAIN_NAV = [
  { icon: "⊞", label: "Dashboard", subs: [] },
  { icon: "🗺", label: "Field Ops", subs: [
    { label: "Site Visits" }, { label: "MMP Cycles" }, { label: "GPS Tracking" }
  ]},
  { icon: "💰", label: "Finance", subs: [
    { label: "Cost Submission" }, { label: "Down Payments" }, { label: "Budget" }, { label: "GL Journal" }
  ]},
  { icon: "👥", label: "HR", subs: [
    { label: "Staff Directory" }, { label: "Payroll" }, { label: "Leave" }, { label: "Performance" }
  ]},
  { icon: "📊", label: "Reports", subs: [
    { label: "MMP Reports" }, { label: "Financial Stmts" }, { label: "Analytics" }
  ]},
  { icon: "🔔", label: "Alerts", subs: [{ label: "Notifications" }, { label: "Broadcasts" }] },
  { icon: "⚙️", label: "System", subs: [{ label: "Settings" }, { label: "Audit Logs" }] },
];

const SPRING = "cubic-bezier(0.34,1.4,0.64,1)";

export function ContextDrawer() {
  const [activeMain, setActiveMain] = useState(1);
  const [activeSub, setActiveSub] = useState("Site Visits");

  const currentItem = MAIN_NAV[activeMain];

  return (
    <div style={{ display:"flex", height:"100vh", background:PAGE, fontFamily:"'Inter',system-ui,sans-serif", overflow:"hidden" }}>
      {/* Icon Rail */}
      <div style={{
        width:56, flexShrink:0,
        background:BG, borderRight:`1px solid ${BORDER}`,
        display:"flex", flexDirection:"column", alignItems:"center",
        boxShadow:"2px 0 12px rgba(0,0,0,0.2)",
        zIndex:20,
      }}>
        {/* Logo */}
        <div style={{ width:56, height:58, display:"flex", alignItems:"center", justifyContent:"center", borderBottom:`1px solid ${BORDER}` }}>
          <div style={{
            width:32, height:32, borderRadius:8,
            background:`linear-gradient(135deg,${PRIMARY},#2563eb)`,
            display:"flex", alignItems:"center", justifyContent:"center",
            color:"#fff", fontSize:14, fontWeight:800,
            boxShadow:`0 4px 10px rgba(59,126,245,0.35)`,
          }}>P</div>
        </div>

        {/* Icons */}
        <nav style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", padding:"8px 0", gap:2 }}>
          {MAIN_NAV.map((item, i) => (
            <button key={i} onClick={() => setActiveMain(i)} title={item.label}
              style={{
                width:40, height:40, borderRadius:8, border:"none", cursor:"pointer",
                background: activeMain===i ? `rgba(59,126,245,0.25)` : "transparent",
                color: activeMain===i ? "#7eb8ff" : MUTED,
                fontSize:19, display:"flex", alignItems:"center", justifyContent:"center",
                transition:`all 0.2s ${SPRING}`,
                transform: activeMain===i ? "scale(1.1)" : "scale(1)",
                outline: activeMain===i ? `1px solid rgba(59,126,245,0.3)` : "none",
                position:"relative",
              }}>
              {item.icon}
              {activeMain===i && (
                <div style={{
                  position:"absolute", right:0, top:"50%", transform:"translateY(-50%)",
                  width:3, height:22, borderRadius:"3px 0 0 3px",
                  background: PRIMARY, boxShadow:`0 0 6px ${PRIMARY}`,
                }}/>
              )}
            </button>
          ))}
        </nav>

        {/* User */}
        <div style={{ width:56, height:54, display:"flex", alignItems:"center", justifyContent:"center", borderTop:`1px solid ${BORDER}` }}>
          <div style={{ width:30, height:30, borderRadius:"50%", background:"linear-gradient(135deg,#f59e0b,#ef4444)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"#fff", cursor:"pointer" }}>SA</div>
        </div>
      </div>

      {/* Sub-menu panel */}
      <div style={{
        width: currentItem.subs.length > 0 ? 180 : 0,
        overflow:"hidden",
        background: "rgba(15,24,41,0.95)",
        borderRight: `1px solid ${BORDER}`,
        transition:`width 0.35s ${SPRING}`,
        display:"flex", flexDirection:"column",
        backdropFilter:"blur(8px)",
        zIndex:10,
      }}>
        {/* Section header */}
        <div style={{ height:58, display:"flex", alignItems:"center", padding:"0 16px", borderBottom:`1px solid ${BORDER}` }}>
          <span style={{ fontSize:17, marginRight:8 }}>{currentItem.icon}</span>
          <span style={{ fontSize:13, fontWeight:700, color:FG, whiteSpace:"nowrap" }}>{currentItem.label}</span>
        </div>
        <nav style={{ flex:1, padding:"8px 8px", overflowY:"auto" }}>
          {currentItem.subs.map((sub, i) => (
            <button key={i} onClick={() => setActiveSub(sub.label)} style={{
              display:"flex", alignItems:"center", width:"100%",
              height:36, borderRadius:7, padding:"0 10px",
              border:"none", cursor:"pointer", marginBottom:2,
              background: activeSub===sub.label ? `rgba(59,126,245,0.2)` : "transparent",
              color: activeSub===sub.label ? "#7eb8ff" : MUTED,
              fontSize:12, fontWeight: activeSub===sub.label ? 600 : 400,
              textAlign:"left", whiteSpace:"nowrap",
              transition:"all 0.15s ease",
              animation:`slideIn 0.3s cubic-bezier(0.34,1.4,0.64,1) ${i*30}ms both`,
            }}>
              <span style={{ width:16, flexShrink:0, color:activeSub===sub.label?PRIMARY:MUTED, fontSize:16, marginRight:6 }}>
                {activeSub===sub.label?"›":" "}
              </span>
              {sub.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <div style={{ height:54, borderBottom:"1px solid #e2e8f0", display:"flex", alignItems:"center", padding:"0 18px", gap:8, background:"#fff" }}>
          <span style={{ fontSize:13, color:"#94a3b8" }}>{currentItem.icon} {currentItem.label}</span>
          {activeSub && <><span style={{ color:"#cbd5e1" }}>/</span><span style={{ fontSize:13, color:"#1e293b", fontWeight:500 }}>{activeSub}</span></>}
        </div>
        <div style={{ flex:1, padding:18, overflowY:"auto" }}>
          <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:18, marginBottom:14 }}>
            <div style={{ fontSize:16, fontWeight:700, color:"#1e293b", marginBottom:6 }}>⑤ Context Drawer</div>
            <div style={{ fontSize:12.5, color:"#64748b", lineHeight:1.7 }}>
              A <strong>two-panel system</strong>: a 56px icon rail (always visible) + a 180px sub-menu panel that slides in when you select a top-level icon.
              Sub-items cascade in with stagger. Click different icons to see the drawer change content. Sub-panel disappears for items with no children (Dashboard).
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {[["Active Section",currentItem.label,PRIMARY],["Selected",activeSub||"—","#10b981"],["Sub-Items",currentItem.subs.length.toString(),"#f59e0b"],["Modules","7","#8b5cf6"]].map(([l,v,c]) => (
              <div key={l as string} style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:10, padding:14 }}>
                <div style={{ fontSize:10.5, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:4 }}>{l}</div>
                <div style={{ fontSize:16, fontWeight:700, color:c as string }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes slideIn { from { opacity:0; transform:translateX(-8px); } to { opacity:1; transform:translateX(0); } }`}</style>
    </div>
  );
}
