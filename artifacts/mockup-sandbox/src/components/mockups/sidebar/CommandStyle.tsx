import { useState, useRef } from "react";

const BG = "#0f1829";
const ACCENT = "#1c2d40";
const PRIMARY = "#3b7ef5";
const FG = "#f7f9fc";
const MUTED = "rgba(247,249,252,0.45)";
const BORDER = "rgba(247,249,252,0.07)";
const PAGE = "#f0f5ff";
const SPRING = "cubic-bezier(0.34,1.4,0.64,1)";

const ALL_NAV = [
  { icon:"⊞", label:"Dashboard",        section:"Core" },
  { icon:"🗺", label:"Field Operations", section:"Core" },
  { icon:"📋", label:"MMP Management",   section:"Core",    badge:8 },
  { icon:"💰", label:"Cost Submission",  section:"Finance", badge:3 },
  { icon:"📊", label:"Finance Hub",      section:"Finance" },
  { icon:"🏦", label:"Budget Planning",  section:"Finance" },
  { icon:"👥", label:"Staff Directory",  section:"HR" },
  { icon:"📅", label:"Calendar",         section:"HR" },
  { icon:"🔔", label:"Notifications",    section:"HR",      badge:12 },
  { icon:"🛡", label:"Audit Logs",       section:"System" },
  { icon:"⚙️", label:"Settings",         section:"System" },
];

export function CommandStyle() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("Dashboard");
  const [open, setOpen] = useState(true);
  const [cmdOpen, setCmdOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query
    ? ALL_NAV.filter(n => n.label.toLowerCase().includes(query.toLowerCase()))
    : ALL_NAV;

  const sections = [...new Set(ALL_NAV.map(n => n.section))];

  const handleCmdSelect = (label: string) => {
    setActive(label);
    setQuery("");
    setCmdOpen(false);
  };

  return (
    <div style={{ display:"flex", height:"100vh", background:PAGE, fontFamily:"'Inter',system-ui,sans-serif", overflow:"hidden", position:"relative" }}>
      {/* CMD Palette overlay */}
      {cmdOpen && (
        <div onClick={() => { setCmdOpen(false); setQuery(""); }} style={{
          position:"absolute", inset:0, background:"rgba(0,0,0,0.45)", zIndex:50, display:"flex", alignItems:"flex-start", justifyContent:"center", paddingTop:80,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width:420, background:"#fff", borderRadius:14, boxShadow:"0 25px 60px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.1)", overflow:"hidden",
            animation:`cmdIn 0.25s ${SPRING}`,
          }}>
            <div style={{ display:"flex", alignItems:"center", padding:"10px 14px", borderBottom:"1px solid #e8edf5", gap:8 }}>
              <span style={{ fontSize:16 }}>🔍</span>
              <input ref={inputRef} autoFocus value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search pages, actions…"
                style={{ flex:1, border:"none", outline:"none", fontSize:14, color:"#1e293b", background:"transparent" }}
              />
              <kbd style={{ background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:5, padding:"2px 7px", fontSize:11, color:"#64748b", cursor:"pointer" }}>ESC</kbd>
            </div>
            <div style={{ maxHeight:340, overflowY:"auto" }}>
              {filtered.length === 0 && (
                <div style={{ padding:"24px 16px", textAlign:"center", color:"#94a3b8", fontSize:13 }}>No results for "{query}"</div>
              )}
              {sections.map(sec => {
                const items = filtered.filter(n => n.section === sec);
                if (!items.length) return null;
                return (
                  <div key={sec}>
                    <div style={{ padding:"8px 14px 4px", fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.7px" }}>{sec}</div>
                    {items.map((item,i) => (
                      <button key={i} onClick={() => handleCmdSelect(item.label)} style={{
                        display:"flex", alignItems:"center", width:"100%", padding:"9px 14px", gap:10, border:"none", cursor:"pointer",
                        background: active===item.label ? "#f0f4ff" : "transparent",
                        color: "#1e293b", transition:"background 0.1s",
                      }}>
                        <span style={{ fontSize:16, width:24, textAlign:"center" }}>{item.icon}</span>
                        <span style={{ fontSize:13, flex:1, textAlign:"left" }}>{item.label}</span>
                        {(item as any).badge && <span style={{ background:"#eff6ff", color:PRIMARY, fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:8, border:`1px solid #bfdbfe` }}>{(item as any).badge}</span>}
                        <kbd style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:4, padding:"1px 5px", fontSize:10, color:"#94a3b8" }}>↵</kbd>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
            <div style={{ padding:"8px 14px", borderTop:"1px solid #f1f5f9", display:"flex", gap:12, fontSize:11, color:"#94a3b8" }}>
              <span>↑↓ navigate</span><span>↵ select</span><span>ESC close</span>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div style={{
        width: open ? 230 : 0,
        opacity: open ? 1 : 0,
        transition:`width 0.35s ${SPRING}, opacity 0.25s ease`,
        flexShrink:0, overflow:"hidden",
        background:BG, boxShadow:"3px 0 18px rgba(0,0,0,0.22)",
        display:"flex", flexDirection:"column",
      }}>
        {/* Logo */}
        <div style={{ padding:"14px 14px 10px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:10 }}>
          <div style={{
            width:32, height:32, borderRadius:8, flexShrink:0,
            background:`linear-gradient(135deg,${PRIMARY},#2563eb)`,
            display:"flex", alignItems:"center", justifyContent:"center",
            color:"#fff", fontSize:14, fontWeight:800,
            boxShadow:`0 4px 12px rgba(59,126,245,0.35)`,
          }}>P</div>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:FG }}>PACT</div>
            <div style={{ fontSize:10, color:MUTED }}>Command Center</div>
          </div>
        </div>

        {/* CMD+K search trigger */}
        <div style={{ padding:"10px 10px 6px" }}>
          <button onClick={() => { setCmdOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }} style={{
            width:"100%", background:ACCENT,
            border:`1px solid rgba(247,249,252,0.1)`,
            borderRadius:8, padding:"8px 12px",
            display:"flex", alignItems:"center", gap:8,
            color:MUTED, fontSize:12, cursor:"pointer",
            transition:"background 0.15s",
          }}>
            <span>🔍</span>
            <span style={{ flex:1, textAlign:"left" }}>Search…</span>
            <div style={{ display:"flex", gap:3 }}>
              <kbd style={{ background:"rgba(247,249,252,0.08)", border:"1px solid rgba(247,249,252,0.12)", borderRadius:4, padding:"1px 4px", fontSize:10, color:MUTED }}>⌘</kbd>
              <kbd style={{ background:"rgba(247,249,252,0.08)", border:"1px solid rgba(247,249,252,0.12)", borderRadius:4, padding:"1px 4px", fontSize:10, color:MUTED }}>K</kbd>
            </div>
          </button>
        </div>

        {/* Pinned favorites */}
        <div style={{ padding:"6px 10px 4px" }}>
          <div style={{ fontSize:10, fontWeight:600, color:MUTED, textTransform:"uppercase", letterSpacing:"0.6px", marginBottom:4, padding:"0 2px" }}>Pinned</div>
          {ALL_NAV.slice(0,3).map((item, i) => (
            <button key={i} onClick={() => setActive(item.label)} style={{
              display:"flex", alignItems:"center", width:"100%", height:36, borderRadius:7, padding:"0 10px", gap:9, border:"none", cursor:"pointer", marginBottom:1,
              background: active===item.label ? `rgba(59,126,245,0.18)` : "transparent",
              color: active===item.label ? "#7eb8ff" : MUTED,
              transition:"all 0.15s ease",
            }}>
              <span style={{ fontSize:15 }}>{item.icon}</span>
              <span style={{ fontSize:12, fontWeight:active===item.label?600:400, flex:1, textAlign:"left", color:active===item.label?FG:MUTED, whiteSpace:"nowrap" }}>
                {item.label}
              </span>
              {(item as any).badge && <span style={{ background:"rgba(59,126,245,0.25)", color:"#7eb8ff", fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:8 }}>{(item as any).badge}</span>}
            </button>
          ))}
        </div>

        <div style={{ height:1, background:BORDER, margin:"4px 10px" }}/>

        {/* Recent */}
        <div style={{ padding:"6px 10px", flex:1, overflowY:"auto" }}>
          <div style={{ fontSize:10, fontWeight:600, color:MUTED, textTransform:"uppercase", letterSpacing:"0.6px", marginBottom:4, padding:"0 2px" }}>All Pages</div>
          {ALL_NAV.map((item, i) => (
            <button key={i} onClick={() => setActive(item.label)} style={{
              display:"flex", alignItems:"center", width:"100%", height:34, borderRadius:7, padding:"0 10px", gap:9, border:"none", cursor:"pointer", marginBottom:1,
              background: active===item.label ? `rgba(59,126,245,0.18)` : "transparent",
              color: active===item.label ? "#7eb8ff" : MUTED,
              transition:"all 0.15s ease",
            }}>
              <span style={{ fontSize:14 }}>{item.icon}</span>
              <span style={{ fontSize:11.5, fontWeight:active===item.label?600:400, flex:1, textAlign:"left", color:active===item.label?FG:MUTED, whiteSpace:"nowrap" }}>
                {item.label}
              </span>
              {(item as any).badge && <span style={{ background:"rgba(59,126,245,0.2)", color:"#7eb8ff", fontSize:10, fontWeight:700, padding:"1px 5px", borderRadius:7 }}>{(item as any).badge}</span>}
            </button>
          ))}
        </div>

        {/* User */}
        <div style={{ padding:"8px 10px", borderTop:`1px solid ${BORDER}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:9, padding:"7px 8px", borderRadius:7, background:ACCENT, cursor:"pointer" }}>
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
          <button onClick={() => setCmdOpen(true)} style={{
            marginLeft:"auto", display:"flex", alignItems:"center", gap:6, background:"#f8fafc", border:"1px solid #e2e8f0",
            borderRadius:7, padding:"5px 12px", cursor:"pointer", fontSize:12, color:"#64748b",
          }}>
            <span>🔍</span> Search
            <div style={{ display:"flex", gap:2, marginLeft:4 }}>
              <kbd style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:4, padding:"1px 4px", fontSize:10 }}>⌘</kbd>
              <kbd style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:4, padding:"1px 4px", fontSize:10 }}>K</kbd>
            </div>
          </button>
        </div>
        <div style={{ flex:1, padding:18, overflowY:"auto" }}>
          <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:18, marginBottom:14 }}>
            <div style={{ fontSize:16, fontWeight:700, color:"#1e293b", marginBottom:6 }}>⑦ Command Style</div>
            <div style={{ fontSize:12.5, color:"#64748b", lineHeight:1.7 }}>
              A <strong>CMD+K command palette</strong> (click Search or the ⌘K button) opens a fuzzy-search overlay — navigate and select without touching the sidebar.
              Sidebar shows Pinned shortcuts + All Pages list. Linear / Vercel-style navigation feel.
            </div>
          </div>
          <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:10, padding:"10px 14px", fontSize:12, color:"#1d4ed8" }}>
            💡 <strong>Try it:</strong> Click the "Search" button in the header or press the CMD+K button in the sidebar to open the command palette.
          </div>
        </div>
      </div>
      <style>{`@keyframes cmdIn { from { opacity:0; transform:translateY(-16px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }`}</style>
    </div>
  );
}
