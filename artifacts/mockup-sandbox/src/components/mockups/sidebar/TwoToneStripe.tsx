import { useState } from "react";

const BG = "#0f1829";
const ACCENT = "#1c2d40";
const PRIMARY = "#3b7ef5";
const FG = "#f7f9fc";
const MUTED = "rgba(247,249,252,0.45)";
const BORDER = "rgba(247,249,252,0.07)";
const PAGE = "#f5f8ff";

const NAV = [
  { icon: "⊞", label: "Dashboard",       stripe: PRIMARY,   cat:"ops" },
  { icon: "🗺", label: "Field Operations", stripe: PRIMARY,   cat:"ops" },
  { icon: "📋", label: "MMP Management",   stripe: PRIMARY,   cat:"ops", badge:8 },
  { icon: "💰", label: "Cost Submission",  stripe: "#10b981", cat:"fin", badge:3 },
  { icon: "📊", label: "Finance Hub",      stripe: "#10b981", cat:"fin" },
  { icon: "🏦", label: "Budget Planning",  stripe: "#10b981", cat:"fin" },
  { icon: "👥", label: "Staff Directory",  stripe: "#f59e0b", cat:"hr" },
  { icon: "🔔", label: "Notifications",    stripe: "#f59e0b", cat:"hr", badge:12 },
  { icon: "⚙️", label: "Settings",         stripe: "#8b5cf6", cat:"sys" },
];

const SPRING = "cubic-bezier(0.34,1.4,0.64,1)";

export function TwoToneStripe() {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(0);

  return (
    <div style={{ display:"flex", height:"100vh", background:PAGE, fontFamily:"'Inter',system-ui,sans-serif", overflow:"hidden" }}>
      <div style={{
        width: open ? 234 : 58,
        transition:`width 0.38s ${SPRING}`,
        flexShrink:0, overflow:"hidden",
        background:BG,
        boxShadow:"3px 0 18px rgba(0,0,0,0.22)",
        display:"flex", flexDirection:"column",
      }}>
        {/* Logo */}
        <div style={{ height:58, display:"flex", alignItems:"center", padding:"0 12px", borderBottom:`1px solid ${BORDER}`, gap:10, flexShrink:0 }}>
          <div style={{
            width:32, height:32, borderRadius:8, flexShrink:0,
            background:`linear-gradient(135deg,${PRIMARY},#2563eb)`,
            display:"flex", alignItems:"center", justifyContent:"center",
            color:"#fff", fontSize:14, fontWeight:800,
            boxShadow:`0 4px 12px rgba(59,126,245,0.35)`,
          }}>P</div>
          <div style={{ opacity:open?1:0, transform:open?"translateX(0)":"translateX(-6px)", transition:"all 0.22s ease", whiteSpace:"nowrap" }}>
            <div style={{ fontSize:13, fontWeight:700, color:FG }}>PACT</div>
            <div style={{ fontSize:10, color:MUTED }}>Command Center</div>
          </div>
        </div>

        {/* Nav with stripe */}
        <nav style={{ flex:1, padding:"8px 0", overflowY:"auto" }}>
          {NAV.map((item, i) => (
            <button key={i} onClick={() => setActive(i)} title={!open ? item.label : undefined}
              style={{
                display:"flex", alignItems:"center", width:"100%",
                height:40, padding:0, border:"none", cursor:"pointer", marginBottom:1,
                background: active===i ? ACCENT : "transparent",
                color: active===i ? FG : MUTED,
                transition:"all 0.15s ease",
                position:"relative",
              }}>
              {/* Color stripe */}
              <div style={{
                width: active===i ? 4 : 3,
                height: active===i ? 28 : 16,
                borderRadius:"0 3px 3px 0",
                background: item.stripe,
                flexShrink:0,
                opacity: active===i ? 1 : 0.35,
                transition:`all 0.25s ${SPRING}`,
                boxShadow: active===i ? `0 0 8px ${item.stripe}80` : "none",
              }}/>
              <div style={{ width:12 }}/>
              <span style={{
                fontSize:17, flexShrink:0,
                transition:`transform 0.3s ${SPRING}`,
                transform: active===i ? "scale(1.1)" : "scale(1)",
              }}>{item.icon}</span>
              {open && (
                <>
                  <div style={{ width:10 }}/>
                  <span style={{ fontSize:12.5, fontWeight:active===i?600:400, flex:1, textAlign:"left", whiteSpace:"nowrap" }}>
                    {item.label}
                  </span>
                  {(item as any).badge && (
                    <span style={{
                      background:`${item.stripe}25`,
                      color:item.stripe, fontSize:10, fontWeight:700,
                      padding:"1px 6px", borderRadius:8, marginRight:10,
                    }}>{(item as any).badge}</span>
                  )}
                </>
              )}
              {!open && (item as any).badge && (
                <div style={{
                  position:"absolute", top:5, right:6,
                  width:7, height:7, borderRadius:"50%",
                  background:item.stripe,
                  boxShadow:`0 0 5px ${item.stripe}`,
                }}/>
              )}
            </button>
          ))}
        </nav>

        {/* Toggle */}
        <div style={{ padding:"8px 10px", borderTop:`1px solid ${BORDER}` }}>
          <button onClick={() => setOpen(!open)} style={{
            display:"flex", alignItems:"center", justifyContent:open?"space-between":"center",
            width:"100%", height:36, borderRadius:7, padding:"0 10px",
            border:"none", cursor:"pointer", background:ACCENT, color:MUTED, fontSize:12, gap:8,
          }}>
            {open && <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:24, height:24, borderRadius:"50%", background:"linear-gradient(135deg,#f59e0b,#ef4444)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"#fff" }}>SA</div>
              <span style={{ fontSize:11, fontWeight:500, color:FG }}>Super Admin</span>
            </div>}
            <span style={{ transition:`transform 0.38s ${SPRING}`, transform:open?"rotate(0)":"rotate(180deg)", display:"block" }}>◀</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
        <div style={{ height:54, borderBottom:"1px solid #e2e8f0", display:"flex", alignItems:"center", padding:"0 18px", gap:10, background:"#fff" }}>
          <span style={{ fontSize:13, color:"#64748b" }}>/ {NAV[active].label}</span>
          <span style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:4 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:NAV[active].stripe }}/>
            <span style={{ fontSize:11, color:"#94a3b8" }}>{NAV[active].cat.toUpperCase()}</span>
          </span>
        </div>
        <div style={{ flex:1, padding:18, overflowY:"auto" }}>
          <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:18, marginBottom:14 }}>
            <div style={{ fontSize:16, fontWeight:700, color:"#1e293b", marginBottom:6 }}>④ Two-Tone Stripe</div>
            <div style={{ fontSize:12.5, color:"#64748b", lineHeight:1.7 }}>
              Each nav item has a <strong>thin left-edge stripe</strong> in its category color — blue for Ops, green for Finance, amber for HR, purple for System.
              The stripe grows and glows when the item is active. Works both expanded and collapsed — in collapsed mode the stripe is the only color cue.
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
            {[["Ops","Active",PRIMARY],["Finance","On Track","#10b981"],["HR","2 alerts","#f59e0b"]].map(([l,v,c]) => (
              <div key={l as string} style={{ background:"#fff", border:`1px solid ${c as string}30`, borderLeft:`3px solid ${c as string}`, borderRadius:"0 10px 10px 0", padding:"12px 14px" }}>
                <div style={{ fontSize:10.5, color:"#94a3b8", marginBottom:4 }}>{l}</div>
                <div style={{ fontSize:18, fontWeight:700, color:c as string }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
