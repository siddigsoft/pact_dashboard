import { useState } from "react";

const BG = "#0f1829";
const ACCENT = "#1c2d40";
const PRIMARY = "#3b7ef5";
const FG = "#f7f9fc";
const MUTED = "rgba(247,249,252,0.45)";
const BORDER = "rgba(247,249,252,0.07)";
const PAGE = "#f5f8ff";
const SPRING = "cubic-bezier(0.34,1.4,0.64,1)";

const GROUPS = [
  { key:"ops", label:"Field Operations", icon:"🗺", open:true, items:[
    { icon:"⊞", label:"Dashboard" },
    { icon:"📋", label:"MMP Management", badge:8 },
    { icon:"📍", label:"Site Visits" },
  ]},
  { key:"fin", label:"Finance", icon:"💰", open:true, items:[
    { icon:"💰", label:"Cost Submission", badge:3 },
    { icon:"📊", label:"Finance Hub" },
    { icon:"🏦", label:"Budget Planning" },
  ]},
  { key:"hr", label:"People & HR", icon:"👥", open:false, items:[
    { icon:"👥", label:"Staff Directory" },
    { icon:"📅", label:"Calendar" },
    { icon:"🔔", label:"Notifications", badge:12 },
  ]},
  { key:"sys", label:"System", icon:"⚙️", open:false, items:[
    { icon:"⚙️", label:"Settings" },
    { icon:"🛡", label:"Audit Logs" },
  ]},
];

export function BoldHeaders() {
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(["ops","fin"]));
  const [active, setActive] = useState("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const toggleGroup = (key: string) => {
    setOpenGroups(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };

  return (
    <div style={{ display:"flex", height:"100vh", background:PAGE, fontFamily:"'Inter',system-ui,sans-serif", overflow:"hidden" }}>
      {/* Sidebar */}
      <div style={{
        width: sidebarOpen ? 244 : 0,
        opacity: sidebarOpen ? 1 : 0,
        transition:`width 0.38s ${SPRING}, opacity 0.25s ease`,
        flexShrink:0, overflow:"hidden",
        background:BG, boxShadow:"3px 0 20px rgba(0,0,0,0.22)",
        display:"flex", flexDirection:"column",
      }}>
        {/* Logo */}
        <div style={{ padding:"14px 16px 12px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:10 }}>
          <div style={{
            width:36, height:36, borderRadius:10, flexShrink:0,
            background:`linear-gradient(135deg,${PRIMARY},#2563eb)`,
            display:"flex", alignItems:"center", justifyContent:"center",
            color:"#fff", fontSize:16, fontWeight:800,
            boxShadow:`0 4px 14px rgba(59,126,245,0.4)`,
          }}>P</div>
          <div>
            <div style={{ fontSize:14, fontWeight:800, color:FG, letterSpacing:"-0.3px" }}>PACT</div>
            <div style={{ fontSize:10, color:MUTED, letterSpacing:"0.3px" }}>Command Center</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex:1, overflowY:"auto", padding:"8px 0" }}>
          {GROUPS.map(group => {
            const isOpen = openGroups.has(group.key);
            return (
              <div key={group.key}>
                {/* Bold group header */}
                <button onClick={() => toggleGroup(group.key)} style={{
                  display:"flex", alignItems:"center", width:"100%",
                  height:44, padding:"0 16px", border:"none", cursor:"pointer",
                  background:"transparent", color:FG, gap:10,
                }}>
                  <span style={{ fontSize:16 }}>{group.icon}</span>
                  <span style={{ fontSize:12, fontWeight:800, flex:1, textAlign:"left", textTransform:"uppercase", letterSpacing:"0.6px", color:isOpen?FG:MUTED }}>
                    {group.label}
                  </span>
                  <span style={{
                    color:MUTED, fontSize:12,
                    transition:`transform 0.3s ${SPRING}`,
                    transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                    display:"block",
                  }}>▾</span>
                </button>

                {/* Items with animated height */}
                <div style={{
                  overflow:"hidden",
                  maxHeight: isOpen ? `${group.items.length * 40 + 8}px` : "0px",
                  transition:`max-height 0.38s ${SPRING}`,
                }}>
                  <div style={{ paddingBottom:4 }}>
                    {group.items.map((item, i) => (
                      <button key={i} onClick={() => setActive(item.label)} style={{
                        display:"flex", alignItems:"center", width:"100%",
                        height:38, padding:"0 16px 0 36px", border:"none", cursor:"pointer", marginBottom:1,
                        background: active===item.label ? `rgba(59,126,245,0.18)` : "transparent",
                        color: active===item.label ? "#7eb8ff" : MUTED,
                        transition:"all 0.15s ease",
                        gap:9,
                      }}>
                        {/* Connecting line dot */}
                        <div style={{
                          width:6, height:6, borderRadius:"50%", flexShrink:0,
                          background: active===item.label ? PRIMARY : MUTED,
                          transition:`all 0.2s ${SPRING}`,
                          boxShadow: active===item.label ? `0 0 6px ${PRIMARY}` : "none",
                        }}/>
                        <span style={{ fontSize:12, fontWeight:active===item.label?600:400, flex:1, textAlign:"left", color:active===item.label?FG:MUTED, whiteSpace:"nowrap" }}>
                          {item.label}
                        </span>
                        {(item as any).badge && (
                          <span style={{
                            background: active===item.label ? "rgba(59,126,245,0.3)" : "rgba(247,249,252,0.08)",
                            color: active===item.label ? "#7eb8ff" : MUTED,
                            fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:8,
                          }}>{(item as any).badge}</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div style={{ height:1, background:BORDER, margin:"0 16px" }}/>
                </div>
              </div>
            );
          })}
        </nav>

        {/* User */}
        <div style={{ padding:"10px 12px", borderTop:`1px solid ${BORDER}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:8, background:ACCENT, cursor:"pointer" }}>
            <div style={{ width:30, height:30, borderRadius:"50%", background:"linear-gradient(135deg,#f59e0b,#ef4444)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#fff", flexShrink:0 }}>SA</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:600, color:FG }}>Super Admin</div>
              <div style={{ fontSize:10, color:MUTED }}>admin@pact.org</div>
            </div>
            <span style={{ color:MUTED, fontSize:14 }}>⋮</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
        <div style={{ height:54, borderBottom:"1px solid #e2e8f0", display:"flex", alignItems:"center", padding:"0 18px", gap:10, background:"#fff" }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background:"#f0f4ff", border:"1px solid #dbe4f5", borderRadius:7, width:32, height:32, cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>☰</button>
          <span style={{ fontSize:13, color:"#64748b" }}>/ {active}</span>
        </div>
        <div style={{ flex:1, padding:18, overflowY:"auto" }}>
          <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:18, marginBottom:14 }}>
            <div style={{ fontSize:16, fontWeight:700, color:"#1e293b", marginBottom:6 }}>⑥ Bold Headers</div>
            <div style={{ fontSize:12.5, color:"#64748b", lineHeight:1.7 }}>
              Section group titles are <strong>bold UPPERCASE</strong> with a chevron — click them to expand/collapse with a smooth max-height transition.
              Sub-items have a dot indicator that glows blue when active. Very readable and familiar for power users.
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {[["Open Groups",Array.from(openGroups).length.toString(),"#3b7ef5"],["Active Page",active,"#10b981"],["Total Groups","4","#f59e0b"],["Items Visible",openGroups.size > 0 ? (Array.from(openGroups).reduce((s,k)=>s+(GROUPS.find(g=>g.key===k)?.items.length||0),0)).toString() : "0","#8b5cf6"]].map(([l,v,c]) => (
              <div key={l as string} style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:10, padding:14 }}>
                <div style={{ fontSize:10.5, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:4 }}>{l}</div>
                <div style={{ fontSize:16, fontWeight:700, color:c as string, maxWidth:"100%", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
