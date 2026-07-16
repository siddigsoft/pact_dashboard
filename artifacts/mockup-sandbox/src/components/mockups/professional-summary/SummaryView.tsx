import { useState } from "react";

const BG = "#f3f5f8";
const PRIMARY = "#3b7ef5";
const DARK = "#0f1829";

const SUMMARY_TEXT = `Experienced humanitarian professional with over 12 years in field operations across Sudan, South Sudan, and the Horn of Africa. Specialises in MMP cycle management, community mobilisation, and multi-agency coordination. Proven track record of managing cross-functional field teams of up to 40 staff, delivering 95%+ site coverage across complex operating environments. Holds a Master's in Development Studies from the University of Khartoum and is fluent in Arabic and English.`;

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 10px", borderRadius:999, fontSize:11, fontWeight:600, background:`${color}18`, color, border:`1px solid ${color}30` }}>
      {label}
    </span>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background:"#fff", border:"1px solid #e8ecf3", borderRadius:14, overflow:"hidden", boxShadow:"0 1px 4px rgba(15,24,41,0.05)", ...style }}>
      {children}
    </div>
  );
}

function CardHeader({ title, icon, action }: { title: string; icon: string; action?: React.ReactNode }) {
  return (
    <div style={{ padding:"13px 18px", borderBottom:"1px solid #f1f4f9", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ fontSize:16 }}>{icon}</span>
        <span style={{ fontSize:13, fontWeight:700, color:"#1e293b" }}>{title}</span>
      </div>
      {action}
    </div>
  );
}

// ── Filled state ──────────────────────────────────────────────────────────────
function SummaryFilled({ onEdit }: { onEdit: () => void }) {
  return (
    <Card>
      <CardHeader
        title="Professional Summary"
        icon="📄"
        action={
          <button onClick={onEdit} style={{ fontSize:11, fontWeight:600, color:PRIMARY, background:`${PRIMARY}12`, border:"none", borderRadius:6, padding:"4px 10px", cursor:"pointer" }}>
            ✎ Edit
          </button>
        }
      />
      <div style={{ padding:"16px 18px", display:"flex", flexDirection:"column", gap:14 }}>
        {/* Highlight strip */}
        <div style={{ borderLeft:`3px solid ${PRIMARY}`, paddingLeft:14, background:`${PRIMARY}06`, borderRadius:"0 8px 8px 0", padding:"12px 14px" }}>
          <p style={{ fontSize:13, lineHeight:1.75, color:"#374151", margin:0 }}>
            {SUMMARY_TEXT}
          </p>
        </div>
        {/* Tags */}
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          <Tag label="Field Operations" color={PRIMARY} />
          <Tag label="MMP Management" color="#8b5cf6" />
          <Tag label="Team Leadership" color="#10b981" />
          <Tag label="12 yrs experience" color="#f59e0b" />
        </div>
        {/* CV note */}
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:"#f8faff", border:"1px solid #e0e7ff", borderRadius:8, fontSize:11, color:"#4f46e5" }}>
          <span>📋</span>
          <span>This summary appears at the top of the <strong>CV / Employee Report</strong> export</span>
        </div>
      </div>
    </Card>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function SummaryEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <button onClick={onAdd} style={{
      width:"100%", display:"flex", alignItems:"center", gap:12,
      padding:"16px 18px", borderRadius:14,
      border:"1.5px dashed #cbd5e1",
      background:"transparent",
      cursor:"pointer",
      transition:"all 0.15s ease",
      textAlign:"left",
    }}
    onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = PRIMARY; (e.currentTarget as HTMLButtonElement).style.background = `${PRIMARY}06`; }}
    onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#cbd5e1"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}>
      <div style={{ width:40, height:40, borderRadius:10, background:"#f1f5f9", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>📝</div>
      <div>
        <div style={{ fontSize:13, fontWeight:600, color:"#334155", marginBottom:3 }}>Add Professional Summary / Background</div>
        <div style={{ fontSize:11, color:"#94a3b8" }}>Shown at the top of the CV export · Write manually or generate with AI</div>
      </div>
      <span style={{ marginLeft:"auto", fontSize:18, color:"#cbd5e1", flexShrink:0 }}>→</span>
    </button>
  );
}

export function SummaryView() {
  const [hasSummary, setHasSummary] = useState(false);

  return (
    <div style={{ background:BG, minHeight:"100vh", fontFamily:"'Inter',system-ui,sans-serif", padding:20 }}>
      {/* Page header */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:11, color:"#94a3b8", letterSpacing:"0.5px", textTransform:"uppercase", marginBottom:4 }}>Staff Profile · Personal Details</div>
        <div style={{ fontSize:18, fontWeight:800, color:DARK }}>Yousif A. Mohammed</div>
        <div style={{ fontSize:12, color:"#64748b" }}>Field Operations Manager · Khartoum Hub</div>
      </div>

      {/* Toggle demo */}
      <div style={{ display:"flex", gap:8, marginBottom:20 }}>
        <button onClick={() => setHasSummary(false)} style={{ fontSize:11, fontWeight:600, padding:"6px 14px", borderRadius:8, border:"none", cursor:"pointer", background:!hasSummary?"#0f1829":"#e2e8f0", color:!hasSummary?"#fff":"#64748b" }}>
          Empty State
        </button>
        <button onClick={() => setHasSummary(true)} style={{ fontSize:11, fontWeight:600, padding:"6px 14px", borderRadius:8, border:"none", cursor:"pointer", background:hasSummary?"#0f1829":"#e2e8f0", color:hasSummary?"#fff":"#64748b" }}>
          Filled State
        </button>
      </div>

      {/* Summary card */}
      {hasSummary
        ? <SummaryFilled onEdit={() => setHasSummary(false)} />
        : <SummaryEmpty onAdd={() => setHasSummary(true)} />
      }

      {/* Rest of profile fields below */}
      <div style={{ marginTop:16, display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        {[
          ["Full Name","Yousif A. Mohammed"],
          ["Email","yousif.am@pact.org"],
          ["Phone","+249 912 345 678"],
          ["Employee ID","PACT-2021-0047"],
          ["Role","Field Operations Manager"],
          ["Hub","Khartoum"],
        ].map(([label, value]) => (
          <div key={label} style={{ background:"#fff", border:"1px solid #e8ecf3", borderRadius:10, padding:"12px 14px" }}>
            <div style={{ fontSize:10, fontWeight:600, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:4 }}>{label}</div>
            <div style={{ fontSize:13, fontWeight:500, color:"#111827" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* CV export hint */}
      <Card style={{ marginTop:16 }}>
        <CardHeader title="CV / Employee Report Export" icon="📋" />
        <div style={{ padding:"14px 18px" }}>
          <div style={{ fontSize:12, color:"#64748b", lineHeight:1.7, marginBottom:12 }}>
            When you export the employee profile as a PDF, the Professional Summary appears as the <strong>first section</strong>, right below the header with name, role, and photo.
          </div>
          {/* Mini CV preview */}
          <div style={{ border:"1px solid #e2e8f0", borderRadius:10, overflow:"hidden", background:"#fafbfc" }}>
            <div style={{ background:DARK, padding:"10px 14px", display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:"50%", background:"linear-gradient(135deg,#f59e0b,#ef4444)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"#fff" }}>YM</div>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:"#fff" }}>Yousif A. Mohammed</div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.55)" }}>Field Operations Manager · PACT</div>
              </div>
            </div>
            <div style={{ padding:"10px 14px" }}>
              <div style={{ fontSize:9, fontWeight:700, color:PRIMARY, textTransform:"uppercase", letterSpacing:"0.7px", marginBottom:5 }}>Professional Summary</div>
              <div style={{ fontSize:10, color:"#374151", lineHeight:1.6, opacity: hasSummary ? 1 : 0.3, fontStyle: hasSummary ? "normal" : "italic" }}>
                {hasSummary ? SUMMARY_TEXT.slice(0, 120) + "…" : "No summary added yet"}
              </div>
              <div style={{ marginTop:8, borderTop:"1px solid #f1f4f9", paddingTop:8, fontSize:9, color:"#94a3b8" }}>Education · Skills · Employment History · ···</div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
