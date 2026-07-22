import { useState, useEffect } from "react";

// ── Navigation ────────────────────────────────────────────────────────────────

const NAV = [
  { id: "overview",     icon: "🏠", label: "Overview",                group: "Profile" },
  { id: "employment",   icon: "💼", label: "Employment & Contract",   group: "Profile" },
  { id: "personal",     icon: "👤", label: "Personal Details",        group: "Profile" },
  { id: "location",     icon: "📍", label: "Location & Work",         group: "Profile" },
  { id: "education",    icon: "🎓", label: "Education & Experience",  group: "Background" },
  { id: "documents",    icon: "📁", label: "Document Vault",          group: "Background" },
  { id: "skills",       icon: "⚡", label: "Skills & Languages",      group: "Background" },
  { id: "training",     icon: "🏅", label: "Training & Certs",        group: "Background" },
  { id: "dependents",   icon: "👨‍👩‍👧", label: "Dependents",              group: "Background" },
  { id: "equipment",    icon: "💻", label: "Equipment",               group: "Background" },
  { id: "policies",     icon: "📜", label: "Policy Acknowledgements", group: "Background" },
  { id: "compensation", icon: "💰", label: "Compensation & Bank",     group: "Finance" },
  { id: "performance",  icon: "📊", label: "Performance",             group: "Finance" },
  { id: "benefits",     icon: "🛡️", label: "Benefits & Leave",        group: "Finance" },
  { id: "access",       icon: "🔒", label: "Access & Security",       group: "System" },
  { id: "itaccounts",   icon: "🖥️", label: "IT Accounts",             group: "System" },
  { id: "hrnotes",      icon: "📝", label: "HR Notes",                group: "System" },
  { id: "activitylog",  icon: "🕐", label: "Activity Log",            group: "System" },
];

const GROUPS = ["Profile", "Background", "Finance", "System"];

const COMPLETENESS: Record<string, number> = {
  overview: 100, employment: 90, personal: 70, location: 85,
  education: 100, documents: 60, skills: 80, training: 50,
  dependents: 100, equipment: 100, policies: 80,
  compensation: 100, performance: 100, benefits: 60,
  access: 100, itaccounts: 100, hrnotes: 100, activitylog: 100,
};

const TIMESTAMPS: Record<string, string> = {
  overview: "Today 09:14 · System", employment: "Jun 15 · Ahmed Hassan",
  personal: "Mar 2024 · Yousif Mohammed", location: "Jan 2023 · HR Admin",
  education: "Mar 2024 · Yousif Mohammed", documents: "Jun 20 · HR Admin",
  skills: "Feb 2024 · Yousif Mohammed", training: "Jan 2024 · HR Admin",
  dependents: "Jan 2023 · HR Admin", equipment: "Nov 2023 · IT Admin",
  policies: "Feb 2024 · HR Admin", compensation: "Jan 2024 · Payroll Admin",
  performance: "Apr 2024 · Ahmed Hassan", benefits: "Jan 2023 · HR Admin",
  access: "Today 09:02 · System", itaccounts: "Nov 2023 · IT Admin",
  hrnotes: "Jun 18 · Ahmed Hassan", activitylog: "Today 09:14 · System",
};

const GLOBAL_ALERTS = [
  { id: "a1", level: "red",   icon: "🚨", text: "Work Permit expired Dec 2024 — immediate renewal required", section: "documents" },
  { id: "a2", level: "amber", icon: "⚠️", text: "Contract expires in 164 days — start renewal process",     section: "employment" },
  { id: "a3", level: "amber", icon: "⚠️", text: "First Aid cert expired Jun 2024",                          section: "training" },
  { id: "a4", level: "blue",  icon: "ℹ️", text: "2 mandatory policies pending signature",                   section: "policies" },
];

// ── Shared helpers ─────────────────────────────────────────────────────────────

function Dot({ pct }: { pct: number }) {
  const c = pct === 0 ? "var(--border)" : pct < 50 ? "#fbbf24" : pct < 100 ? "#60a5fa" : "#22c55e";
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: c, display: "inline-block", flexShrink: 0 }} />;
}

type TagColor = "green"|"amber"|"blue"|"red"|"gray"|"purple"|"indigo"|"navy";
function Tag({ label, color }: { label: string; color: TagColor }) {
  const map: Record<TagColor,[string,string]> = {
    green: ["#dcfce7","#166534"], amber: ["#fef3c7","#92400e"], blue: ["#dbeafe","#1e40af"],
    red: ["#fee2e2","#991b1b"], gray: ["var(--hl)","var(--muted)"],
    purple: ["#f3e8ff","#6b21a8"], indigo: ["#eef2ff","#3730a3"], navy: ["var(--navyBg)","var(--navy)"],
  };
  const [bg, fg] = map[color] ?? map.gray;
  return <span style={{ padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: bg, color: fg, whiteSpace: "nowrap" }}>{label}</span>;
}

function Field({ label, value, wide, required, editable }: { label: string; value?: string; wide?: boolean; required?: boolean; editable?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || "");
  return (
    <div style={{ gridColumn: wide ? "1/-1" : undefined, display: "flex", flexDirection: "column", gap: 3 }}
      onClick={() => editable && setEditing(true)}>
      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}{required && <span style={{ color: "#ef4444", marginLeft: 2 }}>*</span>}
        {editable && !editing && <span style={{ marginLeft: 5, fontSize: 9, color: "var(--navy)", opacity: 0.6 }}>click to edit</span>}
      </span>
      {editing ? (
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={e => e.key === "Enter" && setEditing(false)}
          style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", background: "var(--hl)", border: "1px solid var(--navy)", borderRadius: 6, padding: "4px 8px", outline: "none", width: "100%" }}
        />
      ) : (
        <span style={{ fontSize: 13, fontWeight: 500, color: val ? "var(--text)" : "var(--border)", fontStyle: val ? "normal" : "italic", cursor: editable ? "text" : "default" }}>
          {val || "Not filled"}
        </span>
      )}
    </div>
  );
}

function Card({ title, badge, ts, locked, onLock, children, action }:
  { title: string; badge?: React.ReactNode; ts?: string; locked?: boolean; onLock?: () => void; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface)", border: `1px solid ${locked ? "#fde68a" : "var(--border)"}`, borderRadius: 12, overflow: "hidden", marginBottom: "var(--gap)" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 12, color: "var(--text)", flex: 1 }}>{title}</span>
        {badge}
        {locked && <Tag label="🔒 Locked" color="amber" />}
        {ts && <span style={{ fontSize: 10, color: "var(--faint)" }}>Last edit: {ts}</span>}
        {onLock && (
          <button onClick={onLock} title={locked ? "Unlock section" : "Lock section"}
            style={{ fontSize: 11, background: "none", border: "none", cursor: "pointer", color: "var(--faint)", padding: "2px 4px" }}>
            {locked ? "🔓" : "🔒"}
          </button>
        )}
        {action}
      </div>
      <div style={{ padding: "12px 16px", opacity: locked ? 0.5 : 1, pointerEvents: locked ? "none" : "auto" }}>{children}</div>
    </div>
  );
}

function Grid3({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>{children}</div>;
}

function Btn({ label, color, onClick }: { label: string; color?: "navy"|"gray"|"red"|"green"; onClick?: () => void }) {
  const bg = color === "red" ? "#fee2e2" : color === "green" ? "#dcfce7" : color === "navy" ? "var(--navy)" : "var(--hl)";
  const fg = color === "red" ? "#991b1b" : color === "green" ? "#166534" : color === "navy" ? "white" : "var(--muted)";
  return (
    <button onClick={onClick} style={{ fontSize: 11, fontWeight: 600, color: fg, background: bg, border: "none", borderRadius: 7, padding: "5px 11px", cursor: "pointer", whiteSpace: "nowrap" }}>
      {label}
    </button>
  );
}

// ── Alert Bar ─────────────────────────────────────────────────────────────────

function AlertBar({ alerts, onNavigate, onDismiss }: { alerts: typeof GLOBAL_ALERTS; onNavigate: (id: string) => void; onDismiss: (id: string) => void }) {
  if (alerts.length === 0) return null;
  return (
    <div style={{ padding: "8px 20px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 5, background: "var(--surface)" }}>
      {alerts.map(a => {
        const bg = a.level === "red" ? "#fee2e2" : a.level === "amber" ? "#fef3c7" : "#dbeafe";
        const fg = a.level === "red" ? "#991b1b" : a.level === "amber" ? "#92400e" : "#1e40af";
        const border = a.level === "red" ? "#fca5a5" : a.level === "amber" ? "#fde68a" : "#bfdbfe";
        return (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px", borderRadius: 8, background: bg, border: `1px solid ${border}` }}>
            <span style={{ fontSize: 14 }}>{a.icon}</span>
            <span style={{ fontSize: 12, color: fg, flex: 1 }}>{a.text}</span>
            <button onClick={() => onNavigate(a.section)}
              style={{ fontSize: 11, fontWeight: 600, color: fg, background: "rgba(255,255,255,0.7)", border: "none", borderRadius: 5, padding: "2px 8px", cursor: "pointer" }}>
              View →
            </button>
            <button onClick={() => onDismiss(a.id)}
              style={{ fontSize: 13, color: fg, background: "none", border: "none", cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
        );
      })}
    </div>
  );
}

// ── Search Overlay ────────────────────────────────────────────────────────────

function SearchOverlay({ open, onClose, onNavigate }: { open: boolean; onClose: () => void; onNavigate: (id: string) => void }) {
  const [q, setQ] = useState("");
  useEffect(() => { if (!open) setQ(""); }, [open]);
  if (!open) return null;
  const results = q.length > 0 ? NAV.filter(n => n.label.toLowerCase().includes(q.toLowerCase())) : NAV;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 80 }}
      onClick={onClose}>
      <div style={{ background: "var(--surface)", borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", width: 480, overflow: "hidden", border: "1px solid var(--border)" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 16 }}>🔍</span>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search profile sections, fields…"
            style={{ flex: 1, fontSize: 14, border: "none", outline: "none", background: "transparent", color: "var(--text)" }} />
          <span style={{ fontSize: 11, color: "var(--faint)", background: "var(--hl)", borderRadius: 4, padding: "2px 6px" }}>Esc</span>
        </div>
        <div style={{ maxHeight: 340, overflowY: "auto", padding: "8px 0" }}>
          {results.map(n => (
            <button key={n.id} onClick={() => { onNavigate(n.id); onClose(); }}
              style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--hl)")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}>
              <span style={{ fontSize: 16 }}>{n.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{n.label}</div>
                <div style={{ fontSize: 11, color: "var(--faint)" }}>{n.group}</div>
              </div>
              <span style={{ fontSize: 11, color: "var(--faint)" }}>{COMPLETENESS[n.id]}%</span>
            </button>
          ))}
        </div>
        <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 12, fontSize: 10, color: "var(--faint)" }}>
          <span>↑↓ navigate</span><span>↵ open</span><span>Esc close</span>
        </div>
      </div>
    </div>
  );
}

// ── CV Export Menu ────────────────────────────────────────────────────────────

function CVMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const fmts = [
    { l: "UN P11 Format",          i: "🇺🇳" },
    { l: "Reverse Chronological",  i: "📄" },
    { l: "Functional",             i: "📊" },
    { l: "Combination",            i: "📋" },
    { l: "Europass",               i: "🇪🇺" },
  ];
  return (
    <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, background: "var(--surface)", borderRadius: 10,
      boxShadow: "0 8px 32px rgba(0,0,0,0.15)", border: "1px solid var(--border)", zIndex: 100, minWidth: 210, overflow: "hidden" }}>
      <div style={{ padding: "7px 12px", borderBottom: "1px solid var(--border)", fontSize: 10, fontWeight: 700, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Export CV As</div>
      {fmts.map(f => (
        <button key={f.l} onClick={onClose}
          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text)", textAlign: "left" }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--hl)")}
          onMouseLeave={e => (e.currentTarget.style.background = "none")}>
          <span>{f.i}</span>{f.l}
        </button>
      ))}
    </div>
  );
}

// ── Org Chart widget ──────────────────────────────────────────────────────────

function OrgChart() {
  const nodes = [
    { id: "dir", label: "Hassan Ali", role: "Director", x: 200, y: 10, color: "#1D3461" },
    { id: "mgr", label: "Ahmed Hassan", role: "Senior PM", x: 200, y: 80, color: "#4f46e5" },
    { id: "me",  label: "Yousif M.", role: "FOM ← YOU", x: 200, y: 150, color: "#0ea5e9", me: true },
    { id: "r1",  label: "Sara Ali",  role: "Coordinator", x: 80,  y: 220, color: "#6b7280" },
    { id: "r2",  label: "Omar Nour", role: "Coordinator", x: 200, y: 220, color: "#6b7280" },
    { id: "r3",  label: "Hiba M.",   role: "D. Collector", x: 320, y: 220, color: "#6b7280" },
  ];
  const edges = [["dir","mgr"],["mgr","me"],["me","r1"],["me","r2"],["me","r3"]];
  return (
    <div style={{ overflowX: "auto" }}>
      <svg width="400" height="270" style={{ display: "block" }}>
        {edges.map(([a, b]) => {
          const from = nodes.find(n => n.id === a)!;
          const to = nodes.find(n => n.id === b)!;
          return <line key={a+b} x1={from.x+50} y1={from.y+32} x2={to.x+50} y2={to.y} stroke="var(--border)" strokeWidth="2" strokeDasharray={a==="me"||b==="me"?"":"none"} />;
        })}
        {nodes.map(n => (
          <g key={n.id} transform={`translate(${n.x},${n.y})`}>
            <rect x="0" y="0" width="100" height="32" rx="8" fill={n.me ? n.color : "var(--hl)"} stroke={n.color} strokeWidth={n.me ? 2 : 1} />
            <text x="50" y="13" textAnchor="middle" fontSize="10" fontWeight={n.me ? 700 : 500} fill={n.me ? "white" : "var(--text)"}>{n.label}</text>
            <text x="50" y="25" textAnchor="middle" fontSize="8" fill={n.me ? "rgba(255,255,255,0.8)" : "var(--faint)"}>{n.role}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────────

function OverviewSection({ onJump }: { onJump: (id: string) => void }) {
  const overall = Math.round(Object.values(COMPLETENESS).reduce((a, b) => a + b, 0) / Object.keys(COMPLETENESS).length);
  return (
    <>
      {/* Hero banner */}
      <div style={{ background: "linear-gradient(135deg,#1D3461 0%,#0F2041 100%)", borderRadius: 12, padding: "14px 18px", marginBottom: "var(--gap)", color: "white" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 2 }}>Profile Completeness</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{overall}%</div>
            <div style={{ fontSize: 10, opacity: 0.6, marginTop: 1 }}>{NAV.filter(n => COMPLETENESS[n.id] < 100).length} sections need attention</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 4 }}>Years of Service</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>2.5</div>
            <div style={{ display: "flex", gap: 5, justifyContent: "flex-end", marginTop: 4 }}>
              {["🏆 Certified FOM","⭐ Top Performer","🌍 Multi-Hub"].map(b => (
                <span key={b} style={{ fontSize: 8, background: "rgba(255,255,255,0.15)", borderRadius: 999, padding: "2px 7px", fontWeight: 700 }}>{b}</span>
              ))}
            </div>
          </div>
          <svg width="56" height="56" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="6" />
            <circle cx="28" cy="28" r="22" fill="none" stroke="white" strokeWidth="6"
              strokeDasharray={`${2*Math.PI*22*overall/100} ${2*Math.PI*22*(1-overall/100)}`}
              strokeLinecap="round" transform="rotate(-90 28 28)" />
          </svg>
        </div>
        <div style={{ marginTop: 10, background: "rgba(255,255,255,0.15)", borderRadius: 8, height: 5, overflow: "hidden" }}>
          <div style={{ height: "100%", background: "white", borderRadius: 8, width: `${overall}%` }} />
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: "var(--gap)" }}>
        {[
          { l: "Days Employed",  v: "847",       i: "📅" },
          { l: "Department",     v: "Field Ops",  i: "🏢" },
          { l: "Contract Ends",  v: "Dec 2025",   i: "📋" },
          { l: "Leave Balance",  v: "14 days",    i: "🌴" },
          { l: "Wellbeing",      v: "4.2 / 5",    i: "❤️" },
        ].map(s => (
          <div key={s.l} style={{ background: "var(--hl)", borderRadius: 10, padding: "10px 12px", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 17, marginBottom: 2 }}>{s.i}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{s.v}</div>
            <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 1 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Profile photo + summary side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, marginBottom: "var(--gap)" }}>
        <Card title="Photo">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{ position: "relative" }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg,#1D3461,#0F2041)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "white", fontWeight: 800 }}>YM</div>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(0,0,0,0.45)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, opacity: 0, cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "0")}>
                <span style={{ fontSize: 14 }}>📷</span>
                <span style={{ fontSize: 8, color: "white", fontWeight: 700 }}>Change</span>
              </div>
            </div>
            <Btn label="📷 Upload" color="gray" />
            <div style={{ fontSize: 9, color: "var(--faint)", textAlign: "center" }}>JPG/PNG · 5MB</div>
          </div>
        </Card>
        <Card title="Professional Summary" action={<Btn label="✎ Edit" color="gray" />}>
          <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.65, margin: "0 0 10px" }}>
            Experienced Field Operations Manager with 12+ years in humanitarian aid delivery across Sudan and South Sudan. Specialises in logistics, community engagement, and multi-agency coordination.
          </p>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <Tag label="Active · 2 hrs ago" color="green" />
            <Tag label="Onboarding 9/10" color="amber" />
            <Tag label="Docs 4/6 verified" color="blue" />
            <Tag label="Wellbeing ❤️ 4.2" color="purple" />
          </div>
        </Card>
      </div>

      {/* Upcoming events */}
      <Card title="Upcoming Events & Reminders">
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {[
            { d: "Dec 31, 2025",  label: "Contract Expiry",              i: "📋", color: "amber" },
            { d: "Mar 2025",      label: "HEAT Cert Renewal Due",         i: "🏅", color: "amber" },
            { d: "Aug 2025",      label: "Annual Performance Review",     i: "📊", color: "blue" },
            { d: "Jan 2026",      label: "5-Year Service Milestone 🎉",   i: "🏆", color: "green" },
          ].map(e => (
            <div key={e.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 7, background: "var(--hl)", border: "1px solid var(--border)" }}>
              <span style={{ fontSize: 15 }}>{e.i}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{e.label}</div>
              </div>
              <Tag label={e.d} color={e.color as TagColor} />
            </div>
          ))}
        </div>
      </Card>

      {/* Recognition */}
      <Card title="Recognition & Awards" badge={<Tag label="3 awards" color="indigo" />}>
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { award: "Top Field Performer", quarter: "Q1 2024", i: "🥇" },
            { award: "Community Impact",    quarter: "2023",    i: "🌍" },
            { award: "5-Star Review",       quarter: "Q4 2023", i: "⭐" },
          ].map(a => (
            <div key={a.award} style={{ flex: 1, textAlign: "center", padding: "12px 8px", borderRadius: 10, background: "var(--hl)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 24, marginBottom: 5 }}>{a.i}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text)" }}>{a.award}</div>
              <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 2 }}>{a.quarter}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Checklist with jump links */}
      <Card title="Section Completion — click any row to navigate">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {NAV.map(s => {
            const pct = COMPLETENESS[s.id];
            return (
              <button key={s.id} onClick={() => onJump(s.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, background: "var(--hl)", border: "1px solid var(--border)", cursor: "pointer", textAlign: "left" }}>
                <Dot pct={pct} />
                <span style={{ fontSize: 11, flex: 1, color: "var(--text)" }}>{s.icon} {s.label}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: pct === 100 ? "#22c55e" : pct === 0 ? "var(--faint)" : "#f59e0b" }}>{pct}%</span>
              </button>
            );
          })}
        </div>
      </Card>
    </>
  );
}

function EmploymentSection() {
  return (
    <>
      <Card title="Job Information" ts={TIMESTAMPS.employment} action={<Btn label="✎ Edit" color="gray" />}>
        <Grid3>
          <Field label="Job Title"       value="Field Operations Manager" editable />
          <Field label="System Role"     value="FOM (Field Ops Manager)" editable />
          <Field label="Department"      value="Field Operations" editable />
          <Field label="Reports To"      value="Ahmed Hassan (Senior PM)" editable />
          <Field label="Employment Type" value="Full-time" editable />
          <Field label="Working Pattern" value="On-site" editable />
        </Grid3>
      </Card>
      <Card title="Contract Details" ts={TIMESTAMPS.employment} action={<Btn label="✎ Edit" color="gray" />}>
        <Grid3>
          <Field label="Contract Type"    value="Salary" editable />
          <Field label="Contract Start"   value="Jan 15, 2023" editable />
          <Field label="Contract End"     value="Dec 31, 2025" required editable />
          <Field label="Probation End"    value="Apr 15, 2023" />
          <Field label="Employee ID"      value="PACT-FOM-0042" />
          <Field label="Work Schedule"    value="Standard (40h/week)" editable />
        </Grid3>
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Tag label="✅ Probation Confirmed" color="green" />
          <div style={{ flex: 1 }} />
          <div style={{ padding: "7px 12px", background: "#fef3c7", borderRadius: 8, border: "1px solid #fde68a", fontSize: 11, color: "#92400e", display: "flex", alignItems: "center", gap: 8 }}>
            ⚠️ Expires in <strong>164 days</strong>
            <button style={{ fontSize: 11, fontWeight: 700, color: "white", background: "#1D3461", border: "none", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}>
              Start Renewal →
            </button>
          </div>
        </div>
      </Card>
      <Card title="Reporting Structure & Team">
        <OrgChart />
      </Card>
      <Card title="Onboarding Status" badge={<Tag label="9/10 Complete" color="green" />}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
          {["Profile Created","Role Assigned","Dept Set","Contract Set","Salary Config","Bank Account","Employee ID","Documents","Personal Info","Education"].map((s, i) => (
            <div key={s} style={{ textAlign: "center", padding: "7px 4px", background: i === 7 ? "#fef3c7" : "#f0fdf4", border: `1px solid ${i === 7 ? "#fde68a" : "#bbf7d0"}`, borderRadius: 8 }}>
              <div style={{ fontSize: 14, marginBottom: 2 }}>{i === 7 ? "⚠️" : "✅"}</div>
              <div style={{ fontSize: 9, color: "var(--text)", lineHeight: 1.3 }}>{s}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Preferences" action={<Btn label="✎ Edit" color="gray" />}>
        {[
          { label: "Daily Task Digest Email", sub: "Morning summary of assigned tasks", on: true },
          { label: "Contract Renewal Reminders", sub: "90/60/30 day alerts", on: true },
          { label: "Performance Review Alerts", sub: "Notify before review cycles open", on: false },
        ].map(p => (
          <div key={p.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{p.label}</div>
              <div style={{ fontSize: 11, color: "var(--faint)" }}>{p.sub}</div>
            </div>
            <div style={{ width: 36, height: 20, borderRadius: 10, background: p.on ? "#22c55e" : "var(--border)", position: "relative", cursor: "pointer", flexShrink: 0 }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%", background: "white", position: "absolute", top: 2, [p.on ? "right" : "left"]: 2, boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}

function PersonalSection() {
  return (
    <>
      <Card title="Identity" ts={TIMESTAMPS.personal} action={<Btn label="✎ Edit" color="gray" />}>
        <Grid3>
          <Field label="Date of Birth"   value="March 12, 1988" editable />
          <Field label="Gender"          value="Male" editable />
          <Field label="Nationality"     value="Sudanese" editable />
          <Field label="Marital Status"  value="Married" editable />
          <Field label="Blood Type"      value="O+" editable />
          <Field label="Personal ID No." value="SUD-198803-42819" editable />
        </Grid3>
      </Card>
      <Card title="Passport" ts={TIMESTAMPS.personal} action={<Btn label="✎ Edit" color="gray" />}>
        <Grid3>
          <Field label="Passport No."    value="SD1928374" editable />
          <Field label="Issue Date"      value="Jun 2019" editable />
          <Field label="Expiry"          value="Jun 30, 2027" editable />
          <Field label="Issue Country"   value="Sudan" editable />
        </Grid3>
      </Card>
      <Card title="Home Address" ts={TIMESTAMPS.personal} action={<Btn label="✎ Edit" color="gray" />}>
        <Grid3>
          <Field label="Address Line 1"  value="Block 14, House 7" editable />
          <Field label="Address Line 2"  value="Near Al Manara Mosque" editable />
          <Field label="Neighbourhood"   value="Al Riyadh" editable />
          <Field label="City"            value="Khartoum" editable />
          <Field label="Country"         value="Sudan" editable />
        </Grid3>
      </Card>
      <Card title="Emergency Contact" ts={TIMESTAMPS.personal} action={<Btn label="✎ Edit" color="gray" />}>
        <Grid3>
          <Field label="Contact Name"    value="Fatima Omar" editable />
          <Field label="Relationship"    value="Spouse" editable />
          <Field label="Phone"           value="+249 912 345 678" editable />
          <Field label="Email"           value="fatima.omar@gmail.com" editable />
        </Grid3>
      </Card>
    </>
  );
}

function LocationSection() {
  return (
    <>
      <Card title="Field Assignment" ts={TIMESTAMPS.location} action={<Btn label="✎ Edit" color="gray" />}>
        <Grid3>
          <Field label="Primary Hub"     value="Khartoum HQ" editable />
          <Field label="Secondary Hub"   value="Kassala Field Base" editable />
          <Field label="State"           value="Khartoum State" editable />
          <Field label="Locality"        value="Khartoum District" editable />
          <Field label="Work Location"   value="On-site" editable />
          <Field label="Assigned Since"  value="Jan 15, 2023" />
        </Grid3>
      </Card>
      <Card title="GPS Location Data">
        <Grid3>
          <Field label="Latitude"        value="15.5007° N" />
          <Field label="Longitude"       value="32.5599° E" />
          <Field label="Accuracy"        value="±12 m" />
          <Field label="Sharing Status"  value="Enabled" />
          <Field label="Last Updated"    value="Today, 09:14 AM" />
          <Field label="Device"          value="Samsung Galaxy A54" />
        </Grid3>
        <div style={{ marginTop: 10, borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "7px 12px", fontSize: 11, color: "#166534" }}>
          📡 Location sharing active · Last ping 14 min ago
        </div>
      </Card>
      <Card title="Hub Transfer / Mobility History">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            { from: "Kassala Field Base", to: "Khartoum HQ", date: "Jan 2024", reason: "Role change to FOM",        type: "transfer" },
            { from: "Gedaref Hub",        to: "Kassala Field Base", date: "Jun 2022", reason: "Operational need", type: "temporary" },
            { from: "Khartoum HQ",        to: "Gedaref Hub", date: "Mar 2021",    reason: "Project assignment",    type: "assignment" },
          ].map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: "var(--hl)", border: "1px solid var(--border)" }}>
              <span style={{ fontSize: 15 }}>🔄</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{t.from} → {t.to}</div>
                <div style={{ fontSize: 11, color: "var(--faint)" }}>{t.date} · {t.reason}</div>
              </div>
              <Tag label={t.type} color={t.type === "transfer" ? "blue" : t.type === "temporary" ? "amber" : "green"} />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function EducationSection() {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>🎓 Education</h4>
        <Btn label="+ Add" color="navy" />
      </div>
      {[
        { d: "Bachelor of Business Administration", s: "University of Khartoum", y: "2010", f: "Management & Finance" },
        { d: "High School Certificate",             s: "Al-Ahfad Academy",       y: "2006", f: "Science Stream" },
      ].map(e => (
        <div key={e.d} style={{ display: "flex", gap: 12, padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--navyBg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🎓</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{e.d}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{e.s} · {e.y}</div>
            <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 1 }}>{e.f}</div>
          </div>
          <Btn label="Edit" color="gray" />
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, marginTop: 16 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>💼 Work Experience</h4>
        <Btn label="+ Add" color="navy" />
      </div>
      {[
        { t: "Field Operations Manager", o: "UNHCR Sudan",       f: "2020", to: "Present", cur: true,  loc: "Khartoum" },
        { t: "Program Coordinator",      o: "IRC International", f: "2016", to: "2020",    cur: false, loc: "Juba, S. Sudan" },
        { t: "Field Officer",            o: "Save the Children", f: "2012", to: "2016",    cur: false, loc: "Darfur" },
      ].map(e => (
        <div key={e.t} style={{ display: "flex", gap: 12, padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>💼</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
              {e.t} {e.cur && <Tag label="Current" color="green" />}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>🏢 {e.o} · 📍 {e.loc} · {e.f}–{e.to}</div>
          </div>
          <Btn label="Edit" color="gray" />
        </div>
      ))}
    </>
  );
}

function DocumentsSection() {
  const [sectionLocked, setSectionLocked] = useState(false);
  const docs = [
    { type: "🪪 National ID",    name: "national_id_scan.pdf",  size: "1.2 MB", date: "Mar 2024", expiry: null,       v: "verified" },
    { type: "🛂 Passport",        name: "passport_copy.pdf",     size: "2.4 MB", date: "Mar 2024", expiry: "Jun 2027", v: "verified" },
    { type: "📷 Staff Photo",     name: "photo_official.jpg",    size: "340 KB", date: "Jan 2023", expiry: null,       v: "verified" },
    { type: "📄 CV / Resume",     name: "cv_2024.pdf",           size: "450 KB", date: "Feb 2024", expiry: null,       v: "verified" },
    { type: "🎓 Bachelor Degree", name: "bsc_certificate.pdf",   size: "3.1 MB", date: "Mar 2024", expiry: null,       v: "pending" },
    { type: "📋 Work Permit",     name: "work_permit_2024.pdf",  size: "1.8 MB", date: "Jan 2024", expiry: "Dec 2024", v: "rejected" },
  ];
  const vm: Record<string,[string,string,string]> = {
    verified: ["#dcfce7","#166534","✅ Verified"],
    pending:  ["#fef3c7","#92400e","⏳ Pending"],
    rejected: ["#fee2e2","#991b1b","❌ Expired"],
  };
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 8 }}>
        <Btn label={sectionLocked ? "🔓 Unlock Vault" : "🔒 Lock Vault"} color="gray" onClick={() => setSectionLocked(v => !v)} />
        <Btn label="+ Upload Document" color="navy" />
      </div>
      <Card title={`HR Documents (${docs.length})`} badge={<Tag label={`${docs.filter(d=>d.v==="verified").length} verified`} color="green" />}
        locked={sectionLocked} onLock={() => setSectionLocked(v => !v)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {docs.map(d => {
            const [bg, fg, vlabel] = vm[d.v];
            return (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--hl)" }}>
                <span style={{ fontSize: 16 }}>{d.type.split(" ")[0]}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{d.type.split(" ").slice(1).join(" ")}</div>
                  <div style={{ fontSize: 10, color: "var(--faint)" }}>{d.name} · {d.size}{d.expiry ? ` · Expires ${d.expiry}` : ""}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: bg, color: fg }}>{vlabel}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <Btn label="View" color="gray" /><Btn label="⬇" color="gray" />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="Employment Contracts" badge={<Tag label="2 files" color="blue" />}>
        {[
          { name: "Employment Agreement 2023.pdf", signed: "Jan 15, 2023", size: "820 KB" },
          { name: "Renewal Addendum 2024.pdf",     signed: "Jan 02, 2024", size: "340 KB" },
        ].map(c => (
          <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <span>📝</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{c.name}</div>
              <div style={{ fontSize: 10, color: "var(--faint)" }}>Signed {c.signed} · {c.size}</div>
            </div>
            <Tag label="✅ Signed" color="green" />
            <Btn label="View" color="gray" />
          </div>
        ))}
      </Card>
    </>
  );
}

function SkillsSection() {
  const skills = [
    { name: "Project Management",   level: "Expert",       end: 14 },
    { name: "Data Analysis",        level: "Advanced",     end: 8 },
    { name: "Budget Management",    level: "Advanced",     end: 5 },
    { name: "Community Engagement", level: "Expert",       end: 11 },
    { name: "Report Writing",       level: "Advanced",     end: 7 },
    { name: "MS Office Suite",      level: "Expert",       end: 9 },
    { name: "GIS / Mapping",        level: "Intermediate", end: 3 },
  ];
  const lc: Record<string,[string,string]> = {
    Expert: ["#fef3c7","#92400e"], Advanced: ["#ede9fe","#5b21b6"],
    Intermediate: ["#dbeafe","#1e40af"], Beginner: ["var(--hl)","var(--muted)"],
  };
  const langs = [
    { name: "Arabic", prof: "Native", end: 4 },
    { name: "English", prof: "Fluent", end: 6 },
    { name: "French", prof: "Conversational", end: 2 },
  ];
  const pc: Record<string,[string,string]> = {
    Native: ["#dcfce7","#166534"], Fluent: ["#dbeafe","#1e40af"],
    Conversational: ["#fef3c7","#92400e"], Basic: ["var(--hl)","var(--muted)"],
  };
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>⚡ Skills</h4>
        <Btn label="+ Add Skill" color="navy" />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 20 }}>
        {skills.map(s => {
          const [bg, fg] = lc[s.level] ?? ["var(--hl)","var(--muted)"];
          return (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{s.name}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: bg, color: fg }}>{s.level}</span>
              <span title={`${s.end} endorsements`} style={{ fontSize: 10, color: "var(--navy)", fontWeight: 700 }}>+{s.end}</span>
              <span style={{ fontSize: 14, cursor: "pointer", color: "var(--faint)" }}>×</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>🌍 Languages</h4>
        <Btn label="+ Add" color="navy" />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {langs.map(l => {
          const [bg, fg] = pc[l.prof] ?? ["var(--hl)","var(--muted)"];
          return (
            <div key={l.name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)" }}>
              <span>🌐</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{l.name}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: bg, color: fg }}>{l.prof}</span>
              <span title={`${l.end} endorsements`} style={{ fontSize: 10, color: "var(--navy)", fontWeight: 700 }}>+{l.end}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function TrainingSection() {
  const certs = [
    { name: "HEAT Training",                    issuer: "UNDSS",        date: "Mar 2023", expiry: "Mar 2025", ok: true  },
    { name: "First Aid & Emergency Response",   issuer: "Red Cross",    date: "Jun 2022", expiry: "Jun 2024", ok: false },
    { name: "Advanced Project Management",      issuer: "PMI",          date: "Nov 2021", expiry: null,       ok: true  },
    { name: "SPHERE Humanitarian Standards",    issuer: "UNHCR Academy",date: "Jan 2024", expiry: null,       ok: true  },
  ];
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <Btn label="+ Add Certification" color="navy" />
      </div>
      <Card title="Certifications" badge={<Tag label={`${certs.filter(c=>c.ok).length} active`} color="green" />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {certs.map(c => (
            <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--hl)" }}>
              <span style={{ fontSize: 18 }}>🏅</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{c.name}</div>
                <div style={{ fontSize: 10, color: "var(--faint)" }}>{c.issuer} · {c.date}{c.expiry ? ` · Expires ${c.expiry}` : " · No expiry"}</div>
              </div>
              <Tag label={c.ok ? "✅ Valid" : "⚠️ Expired"} color={c.ok ? "green" : "amber"} />
              <Btn label="Edit" color="gray" />
            </div>
          ))}
        </div>
      </Card>
      <Card title="Training History">
        {[
          { name: "Field Security Level 3", provider: "UNDSS", dur: "3 days", date: "Jan 2024" },
          { name: "Humanitarian Coordination", provider: "OCHA", dur: "2 weeks", date: "Aug 2023" },
          { name: "Data Collection & ODK", provider: "PACT Internal", dur: "1 day", date: "May 2023" },
        ].map(t => (
          <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <span>📚</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{t.name}</div>
              <div style={{ fontSize: 10, color: "var(--faint)" }}>{t.provider} · {t.dur} · {t.date}</div>
            </div>
            <Tag label="Completed" color="blue" />
          </div>
        ))}
      </Card>
    </>
  );
}

function DependentsSection() {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <Btn label="+ Add Dependent" color="navy" />
      </div>
      <Card title="Dependents (3)" badge={<Tag label="Insurance eligible" color="green" />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {[
            { name: "Fatima Mohammed", rel: "Spouse",   dob: "Apr 5, 1990",  i: "👩" },
            { name: "Omar Mohammed",   rel: "Son",       dob: "Jun 2, 2014",  i: "👦" },
            { name: "Aisha Mohammed",  rel: "Daughter",  dob: "Sep 18, 2017", i: "👧" },
          ].map(d => (
            <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--hl)" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--navyBg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{d.i}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{d.name}</div>
                <div style={{ fontSize: 11, color: "var(--faint)" }}>{d.rel} · DOB: {d.dob}</div>
              </div>
              <Btn label="Edit" color="gray" />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function EquipmentSection() {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <Btn label="+ Assign Asset" color="navy" />
      </div>
      <Card title="Assigned Equipment">
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {[
            { name: "Dell Latitude 5540",  type: "Laptop",     sn: "DL5540-0042", issued: "Jan 2023", i: "💻" },
            { name: "Samsung Galaxy A54",  type: "Phone",      sn: "SM-A546B-0788",issued: "Mar 2023", i: "📱" },
            { name: "Garmin GPSMAP 67",    type: "GPS Device", sn: "GPM67-KH-09", issued: "Nov 2023", i: "📡" },
          ].map(eq => (
            <div key={eq.sn} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--hl)" }}>
              <span style={{ fontSize: 18 }}>{eq.i}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{eq.name}</div>
                <div style={{ fontSize: 10, color: "var(--faint)" }}>S/N: {eq.sn} · Issued {eq.issued}</div>
              </div>
              <Tag label={eq.type} color="blue" />
              <Tag label="In Use" color="green" />
              <Btn label="Return" color="red" />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function PoliciesSection() {
  const policies = [
    { name: "Code of Conduct",            signed: "Jan 16, 2023", req: true,  ok: true  },
    { name: "Data Protection & Privacy",  signed: "Jan 16, 2023", req: true,  ok: true  },
    { name: "Anti-Fraud & Corruption",    signed: "Jan 17, 2023", req: true,  ok: true  },
    { name: "Security Protocols 2024",    signed: "Feb 01, 2024", req: true,  ok: true  },
    { name: "Travel & Expense Policy",    signed: "Mar 10, 2023", req: false, ok: true  },
    { name: "IT Acceptable Use Policy",   signed: null,           req: true,  ok: false },
    { name: "Safeguarding & PSEA Policy", signed: null,           req: true,  ok: false },
  ];
  const signed = policies.filter(p => p.ok).length;
  return (
    <Card title="Policy Acknowledgements" badge={<Tag label={`${signed}/${policies.length}`} color={signed === policies.length ? "green" : "amber"} />}>
      {signed < policies.length && (
        <div style={{ padding: "7px 12px", background: "#fef3c7", borderRadius: 8, border: "1px solid #fde68a", marginBottom: 10, fontSize: 11, color: "#92400e" }}>
          ⚠️ {policies.length - signed} mandatory polic{policies.length - signed === 1 ? "y requires" : "ies require"} signature
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {policies.map(p => (
          <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--hl)" }}>
            <span>📜</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{p.name}</div>
              <div style={{ fontSize: 10, color: "var(--faint)" }}>{p.signed ? `Signed ${p.signed}` : "Not yet signed"}{p.req && <span style={{ marginLeft: 6, color: "#dc2626", fontWeight: 700 }}>• Required</span>}</div>
            </div>
            {p.ok ? <Tag label="✅ Signed" color="green" /> : <Btn label="Sign Now" color="navy" />}
          </div>
        ))}
      </div>
    </Card>
  );
}

function CompensationSection() {
  const payslips = [
    { month: "Jun 2024", gross: "SDG 285,000", net: "SDG 261,500", status: "Paid" },
    { month: "May 2024", gross: "SDG 285,000", net: "SDG 261,500", status: "Paid" },
    { month: "Apr 2024", gross: "SDG 285,000", net: "SDG 248,750", status: "Paid" },
    { month: "Mar 2024", gross: "SDG 285,000", net: "SDG 261,500", status: "Paid" },
  ];
  return (
    <>
      <Card title="Salary Configuration" ts={TIMESTAMPS.compensation} action={<Btn label="✎ Edit" color="gray" />}>
        <Grid3>
          <Field label="Contract Type"        value="Salary" editable />
          <Field label="Classification Level" value="Level B" editable />
          <Field label="Base Salary"          value="SDG 250,000 / month" editable />
          <Field label="Transport Allowance"  value="SDG 15,000" editable />
          <Field label="Housing Allowance"    value="SDG 20,000" editable />
          <Field label="Total Package"        value="SDG 285,000 / month" />
        </Grid3>
      </Card>
      <Card title="Classification History">
        {[
          { level: "Level B", salary: "SDG 250,000", from: "Jan 2024", note: "Annual increment" },
          { level: "Level A", salary: "SDG 200,000", from: "Jan 2023", note: "Initial classification" },
        ].map((h, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <span>📈</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{h.level} · {h.salary}/month</div>
              <div style={{ fontSize: 10, color: "var(--faint)" }}>Effective {h.from} · {h.note}</div>
            </div>
            {i === 0 && <Tag label="Current" color="green" />}
          </div>
        ))}
      </Card>
      <Card title="Bank Account" action={<Btn label="✎ Edit" color="gray" />}>
        <Grid3>
          <Field label="Bank Name"      value="Bank of Khartoum" editable />
          <Field label="Account Name"   value="Yousif A. Mohammed" editable />
          <Field label="Account No."    value="•••• •••• 4821" />
          <Field label="Branch"         value="Khartoum Main" editable />
          <Field label="IBAN"           value="SD•••• •••• ••93" />
        </Grid3>
      </Card>
      <Card title="EOSB / Gratuity (Sudan Labour Law)">
        <Grid3>
          <Field label="Years of Service"  value="2 years 6 months" />
          <Field label="Accrued Gratuity"  value="SDG 437,500" />
          <Field label="Formula"           value="21 days/yr (≤5yrs)" />
          <Field label="Day Rate"          value="SDG 8,333" />
          <Field label="Calc Date"         value="Jul 22, 2026" />
          <Field label="Projected (5 yr)"  value="SDG 875,000" />
        </Grid3>
      </Card>
      <Card title="Salary Advances" badge={<Tag label="1 active" color="amber" />}>
        {[
          { amount: "SDG 50,000", issued: "Mar 2024", remaining: "SDG 25,000", monthly: "SDG 12,500", status: "Recovering" },
          { amount: "SDG 30,000", issued: "Sep 2023", remaining: "SDG 0",      monthly: "—",           status: "Recovered" },
        ].map((a, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <span>💵</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>Advance {a.amount} · {a.issued}</div>
              <div style={{ fontSize: 10, color: "var(--faint)" }}>Remaining: {a.remaining}{a.monthly !== "—" ? ` · ${a.monthly}/mo` : ""}</div>
            </div>
            <Tag label={a.status} color={a.status === "Recovering" ? "amber" : "green"} />
          </div>
        ))}
      </Card>
      <Card title="Payslip History" badge={<Tag label="Download all" color="navy" />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {payslips.map(p => (
            <div key={p.month} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 8, background: "var(--hl)", border: "1px solid var(--border)" }}>
              <span>📄</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{p.month}</div>
                <div style={{ fontSize: 10, color: "var(--faint)" }}>Gross {p.gross} · Net {p.net}</div>
              </div>
              <Tag label={p.status} color="green" />
              <Btn label="⬇ PDF" color="gray" />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function PerformanceSection() {
  const reviews = [
    { period: "Q1 2024", rating: 4.5, tasks: 42, onTime: 95 },
    { period: "Q4 2023", rating: 4.2, tasks: 38, onTime: 89 },
    { period: "Q3 2023", rating: 3.8, tasks: 31, onTime: 84 },
    { period: "Q2 2023", rating: 4.0, tasks: 29, onTime: 90 },
  ];
  const w = 180, h = 48, sparkMax = 5, sparkMin = 3;
  const pts = reviews.map((r, i) => {
    const x = (i / (reviews.length - 1)) * (w - 20) + 10;
    const y = h - 8 - ((r.rating - sparkMin) / (sparkMax - sparkMin)) * (h - 16);
    return `${x},${y}`;
  }).join(" ");
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: "var(--gap)" }}>
        {[
          { l: "Latest Rating",   v: "4.5/5",  i: "⭐", bg: "#fef3c7", fg: "#92400e" },
          { l: "Tasks Done",      v: "42",     i: "✅", bg: "#dcfce7", fg: "#166534" },
          { l: "On-Time Rate",    v: "95%",    i: "⏱️", bg: "#dbeafe", fg: "#1e40af" },
          { l: "Workload",        v: "Medium", i: "📊", bg: "#f3e8ff", fg: "#6b21a8" },
        ].map(k => (
          <div key={k.l} style={{ padding: "11px 12px", borderRadius: 10, background: k.bg, border: `1px solid ${k.fg}22` }}>
            <div style={{ fontSize: 17, marginBottom: 3 }}>{k.i}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: k.fg }}>{k.v}</div>
            <div style={{ fontSize: 10, color: k.fg, opacity: 0.8, marginTop: 1 }}>{k.l}</div>
          </div>
        ))}
      </div>
      <Card title="Rating Trend (Last 4 Review Cycles)">
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width={w} height={h} style={{ flexShrink: 0 }}>
            <polyline points={pts} fill="none" stroke="var(--navy)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {reviews.map((r, i) => {
              const x = (i / (reviews.length - 1)) * (w - 20) + 10;
              const y = h - 8 - ((r.rating - sparkMin) / (sparkMax - sparkMin)) * (h - 16);
              return <circle key={i} cx={x} cy={y} r="4" fill="var(--navy)" />;
            })}
          </svg>
          <div style={{ display: "flex", gap: 14 }}>
            {reviews.map(r => (
              <div key={r.period} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>{r.rating}</div>
                <div style={{ fontSize: 9, color: "var(--faint)" }}>{r.period}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>
      <Card title="Review History">
        {reviews.map(r => (
          <div key={r.period} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <span>📊</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{r.period}</div>
              <div style={{ fontSize: 10, color: "var(--faint)" }}>Tasks: {r.tasks} · On-time: {r.onTime}%</div>
            </div>
            <span style={{ fontSize: 14, fontWeight: 800, color: r.rating >= 4.5 ? "#166534" : "#1e40af" }}>⭐ {r.rating}</span>
            <Btn label="View Review" color="gray" />
          </div>
        ))}
      </Card>
    </>
  );
}

function BenefitsSection() {
  const leaveHistory = [
    { type: "Annual Leave",  from: "Mar 10",  to: "Mar 17",  days: 7, status: "Approved",  approver: "Ahmed Hassan" },
    { type: "Sick Leave",    from: "Feb 5",   to: "Feb 6",   days: 2, status: "Approved",  approver: "Ahmed Hassan" },
    { type: "Annual Leave",  from: "Dec 24",  to: "Jan 2",   days: 5, status: "Approved",  approver: "Ahmed Hassan" },
    { type: "Annual Leave",  from: "Aug 15",  to: "Aug 15",  days: 1, status: "Rejected",  approver: "Ahmed Hassan" },
  ];
  return (
    <>
      <Card title="Enrolled Benefits" badge={<Tag label="3 active" color="green" />}>
        {[
          { name: "Medical — Family Plan", provider: "National Health Co.",  coverage: "SDG 500,000/yr", ok: true  },
          { name: "Life Insurance",        provider: "Sudanese Insurance",   coverage: "SDG 1,000,000",  ok: true  },
          { name: "Pension Contribution",  provider: "NSSF Sudan",           coverage: "8% of salary",   ok: true  },
          { name: "Dental & Vision Add-on",provider: "National Health Co.",  coverage: "SDG 50,000/yr",  ok: false },
        ].map(p => (
          <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <span>🛡️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{p.name}</div>
              <div style={{ fontSize: 10, color: "var(--faint)" }}>{p.provider} · {p.coverage}</div>
            </div>
            <Tag label={p.ok ? "Active" : "Pending"} color={p.ok ? "green" : "amber"} />
          </div>
        ))}
      </Card>
      <Card title="Leave Balances">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {[
            { type: "Annual",     total: 21, taken: 7,  left: 14 },
            { type: "Sick",       total: 10, taken: 2,  left: 8  },
            { type: "Compassion", total: 3,  taken: 0,  left: 3  },
          ].map(l => (
            <div key={l.type} style={{ padding: "10px 12px", borderRadius: 10, background: "var(--hl)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>{l.type} Leave</div>
              <div style={{ fontSize: 19, fontWeight: 800, color: "var(--navy)" }}>{l.left}</div>
              <div style={{ fontSize: 10, color: "var(--faint)" }}>days left of {l.total}</div>
              <div style={{ marginTop: 6, height: 4, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", background: "var(--navy)", borderRadius: 99, width: `${(l.left/l.total)*100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Leave Request History" badge={<Tag label="4 this year" color="blue" />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {leaveHistory.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 8, background: "var(--hl)", border: "1px solid var(--border)" }}>
              <span>🌴</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{r.type} · {r.days} day{r.days !== 1 ? "s" : ""}</div>
                <div style={{ fontSize: 10, color: "var(--faint)" }}>{r.from} → {r.to} · Approved by {r.approver}</div>
              </div>
              <Tag label={r.status} color={r.status === "Approved" ? "green" : "red"} />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function AccessSection() {
  const sessions = [
    { device: "Chrome / Windows 11",  ip: "196.1.15.40",  loc: "Khartoum",    last: "Active now",    current: true  },
    { device: "Android App (v2.1.4)", ip: "196.1.15.44",  loc: "Khartoum",    last: "Yesterday 14:30", current: false },
    { device: "Firefox / macOS",      ip: "41.67.100.22", loc: "Unknown",      last: "Jun 18, 09:00",  current: false },
  ];
  const roles = [
    { role: "FOM (Field Ops Manager)", hub: "System-wide", primary: true  },
    { role: "Supervisor",              hub: "Khartoum HQ", primary: false },
    { role: "Data Collector",          hub: "Kassala",     primary: false },
  ];
  const events = [
    { action: "Login",          device: "Chrome / Windows", ip: "196.1.15.40",  time: "Today 09:02",   ok: true  },
    { action: "Login",          device: "Android App",      ip: "196.1.15.44",  time: "Yesterday 14:30",ok: true  },
    { action: "Failed Login",   device: "Unknown",          ip: "41.67.222.10", time: "Jun 20, 22:41", ok: false },
    { action: "Password Reset", device: "Chrome / Windows", ip: "196.1.15.40",  time: "Jun 20, 08:15", ok: true  },
  ];
  return (
    <>
      <Card title="Active Sessions" badge={<Tag label={`${sessions.length} devices`} color="blue" />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {sessions.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 8, border: `1px solid ${s.current ? "#bfdbfe" : "var(--border)"}`, background: s.current ? "#eff6ff" : "var(--hl)" }}>
              <span style={{ fontSize: 16 }}>{s.device.includes("Android") ? "📱" : "💻"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{s.device}</div>
                <div style={{ fontSize: 10, color: "var(--faint)" }}>IP {s.ip} · {s.loc} · {s.last}</div>
              </div>
              {s.current ? <Tag label="● This session" color="green" /> : <Btn label="Revoke" color="red" />}
            </div>
          ))}
        </div>
      </Card>
      <Card title="Role Assignments" action={<Btn label="✎ Edit" color="gray" />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {roles.map(r => (
            <div key={r.role} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--hl)" }}>
              <span>🔒</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{r.role}</div>
                <div style={{ fontSize: 10, color: "var(--faint)" }}>Scope: {r.hub}</div>
              </div>
              {r.primary ? <Tag label="Primary" color="blue" /> : <><Tag label="Additional" color="gray" /><Btn label="Remove" color="red" /></>}
            </div>
          ))}
          <button style={{ fontSize: 11, fontWeight: 600, color: "var(--navy)", background: "var(--navyBg)", border: "1px dashed var(--navy)", borderRadius: 8, padding: "7px", cursor: "pointer" }}>
            + Assign Additional Role
          </button>
        </div>
      </Card>
      <Card title="Security Event Log">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {events.map((e, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--hl)" }}>
              <span>{e.ok ? "✅" : "⚠️"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{e.action}</div>
                <div style={{ fontSize: 10, color: "var(--faint)" }}>{e.device} · {e.ip} · {e.time}</div>
              </div>
              <Tag label={e.ok ? "Success" : "Alert"} color={e.ok ? "green" : "amber"} />
            </div>
          ))}
        </div>
      </Card>
      <Card title="Account Status" action={<Btn label="✎ Edit" color="gray" />}>
        <Grid3>
          <Field label="Status"         value="Active" />
          <Field label="2FA Enabled"    value="Yes (TOTP)" />
          <Field label="Last Password"  value="Jun 20, 2024" />
          <Field label="Sessions"       value="3 devices" />
          <Field label="Email Verified" value="Yes" />
          <Field label="Created"        value="Jan 14, 2023" />
        </Grid3>
      </Card>
    </>
  );
}

function ITAccountsSection() {
  return (
    <>
      <Card title="Provisioned Accounts" badge={<Tag label="4 active" color="green" />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            { system: "PACT Command Center",   user: "y.mohammed@pact-sd.org",  status: "Active",    prov: "Jan 14, 2023" },
            { system: "Microsoft 365",         user: "yousif.m@pactworld.org",  status: "Active",    prov: "Jan 15, 2023" },
            { system: "Zoom Meetings",         user: "yousif.pact@zoom.us",     status: "Active",    prov: "Feb 1, 2023" },
            { system: "SharePoint",            user: "yousif.m@pactworld.org",  status: "Active",    prov: "Jan 15, 2023" },
            { system: "ODK Collect",           user: "y.mohammed.field",        status: "Suspended", prov: "Jun 2023" },
          ].map(a => (
            <div key={a.system} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--hl)" }}>
              <span>🖥️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{a.system}</div>
                <div style={{ fontSize: 10, color: "var(--faint)" }}>{a.user} · Provisioned {a.prov}</div>
              </div>
              <Tag label={a.status} color={a.status === "Active" ? "green" : "red"} />
              <Btn label={a.status === "Active" ? "Suspend" : "Reactivate"} color={a.status === "Active" ? "gray" : "green"} />
            </div>
          ))}
        </div>
      </Card>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
        <Btn label="+ Provision New Account" color="navy" />
      </div>
    </>
  );
}

function HRNotesSection() {
  const notes = [
    { author: "Ahmed Hassan",   date: "Jun 18, 2024",  category: "Performance",  text: "Yousif demonstrated exceptional leadership during the Kassala emergency response. Recommend fast-tracking him for Level C classification in the upcoming cycle." },
    { author: "Sara (HR)",      date: "Mar 10, 2024",  category: "Compliance",   text: "Work permit renewal initiated with MoL. Expect 4–6 week processing time. Employee advised to limit international travel in the interim." },
    { author: "System",         date: "Jan 2, 2024",   category: "Contract",     text: "Contract auto-renewed for 12 months effective Jan 1 2024. Signed addendum uploaded to Document Vault." },
  ];
  return (
    <>
      <div style={{ padding: "8px 12px", background: "#fef3c7", borderRadius: 8, border: "1px solid #fde68a", marginBottom: 10, fontSize: 12, color: "#92400e" }}>
        🔒 HR Internal Notes — visible to HR Managers and Directors only. Not visible to the employee.
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <Btn label="+ Add Note" color="navy" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {notes.map((n, i) => (
          <div key={i} style={{ background: "var(--surface)", borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden" }}>
            <div style={{ padding: "8px 14px", background: "var(--hl)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--navyBg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--navy)", fontWeight: 700 }}>
                {n.author.split(" ").map(w => w[0]).join("").slice(0, 2)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{n.author}</div>
                <div style={{ fontSize: 10, color: "var(--faint)" }}>{n.date}</div>
              </div>
              <Tag label={n.category} color="indigo" />
              <Btn label="Edit" color="gray" />
            </div>
            <div style={{ padding: "12px 14px", fontSize: 13, color: "var(--muted)", lineHeight: 1.65 }}>{n.text}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function ActivityLogSection() {
  const log = [
    { who: "System",         action: "Profile last active",            field: "",                 time: "Today 09:14",      icon: "🟢" },
    { who: "Ahmed Hassan",   action: "Updated Employment — Reports To", field: "→ Ahmed Hassan",  time: "Jun 15",           icon: "✏️" },
    { who: "HR Admin",       action: "Uploaded document",              field: "Work Permit 2024", time: "Jun 20",           icon: "📄" },
    { who: "Payroll Admin",  action: "Updated salary — Level B",       field: "SDG 250,000/mo",   time: "Jan 2024",         icon: "💰" },
    { who: "IT Admin",       action: "Provisioned account",            field: "ODK Collect",      time: "Jun 2023",         icon: "🖥️" },
    { who: "Ahmed Hassan",   action: "Submitted performance review",   field: "Q1 2024 · 4.5★",  time: "Apr 2024",         icon: "📊" },
    { who: "System",         action: "Contract auto-renewed",          field: "12 months",        time: "Jan 2, 2024",      icon: "📋" },
    { who: "Yousif M.",      action: "Uploaded document",              field: "CV 2024.pdf",      time: "Feb 2024",         icon: "📄" },
    { who: "HR Admin",       action: "Signed policy",                  field: "Security Protocols 2024", time: "Feb 2024", icon: "📜" },
    { who: "System",         action: "Employee ID assigned",           field: "PACT-FOM-0042",    time: "Jan 14, 2023",     icon: "🆔" },
  ];
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: "var(--faint)" }}>Showing last 10 changes across all sections</div>
        <Btn label="Export Log" color="gray" />
      </div>
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: 19, top: 0, bottom: 0, width: 2, background: "var(--border)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {log.map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 12, paddingBottom: 12, position: "relative" }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--surface)", border: "2px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0, zIndex: 1 }}>{e.icon}</div>
              <div style={{ flex: 1, background: "var(--surface)", borderRadius: 10, border: "1px solid var(--border)", padding: "9px 13px", marginTop: 2 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{e.who}</span>
                    <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 6 }}>{e.action}</span>
                    {e.field && <span style={{ fontSize: 11, fontWeight: 600, color: "var(--navy)", marginLeft: 6 }}>{e.field}</span>}
                  </div>
                  <span style={{ fontSize: 10, color: "var(--faint)", whiteSpace: "nowrap", marginLeft: 8 }}>{e.time}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function UnifiedProfile() {
  const [active, setActive] = useState("overview");
  const [dark, setDark] = useState(false);
  const [compact, setCompact] = useState(false);
  const [cvOpen, setCvOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [alerts, setAlerts] = useState(GLOBAL_ALERTS);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearchOpen(true); }
      if (e.key === "Escape") { setSearchOpen(false); setCvOpen(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const overall = Math.round(Object.values(COMPLETENESS).reduce((a, b) => a + b, 0) / Object.keys(COMPLETENESS).length);

  const cssVars = {
    "--bg":      dark ? "#0f172a" : "#f8f9fc",
    "--surface": dark ? "#1e293b" : "#ffffff",
    "--border":  dark ? "#334155" : "#f3f4f6",
    "--text":    dark ? "#f1f5f9" : "#111827",
    "--muted":   dark ? "#94a3b8" : "#6b7280",
    "--faint":   dark ? "#64748b" : "#9ca3af",
    "--navy":    dark ? "#60a5fa" : "#1D3461",
    "--navyBg":  dark ? "#1e3a5f" : "#eef2ff",
    "--hl":      dark ? "#1e293b" : "#f9fafb",
    "--gap":     compact ? "8px" : "14px",
  } as React.CSSProperties;

  const renderContent = () => {
    switch (active) {
      case "overview":     return <OverviewSection onJump={setActive} />;
      case "employment":   return <EmploymentSection />;
      case "personal":     return <PersonalSection />;
      case "location":     return <LocationSection />;
      case "education":    return <EducationSection />;
      case "documents":    return <DocumentsSection />;
      case "skills":       return <SkillsSection />;
      case "training":     return <TrainingSection />;
      case "dependents":   return <DependentsSection />;
      case "equipment":    return <EquipmentSection />;
      case "policies":     return <PoliciesSection />;
      case "compensation": return <CompensationSection />;
      case "performance":  return <PerformanceSection />;
      case "benefits":     return <BenefitsSection />;
      case "access":       return <AccessSection />;
      case "itaccounts":   return <ITAccountsSection />;
      case "hrnotes":      return <HRNotesSection />;
      case "activitylog":  return <ActivityLogSection />;
      default:             return null;
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Inter',-apple-system,sans-serif", background: "var(--bg)", overflow: "hidden", ...cssVars }}
      onClick={() => { cvOpen && setCvOpen(false); }}>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} onNavigate={id => { setActive(id); setSearchOpen(false); }} />

      {/* ── LEFT SIDEBAR ─────────────────────────────────────────────── */}
      <div style={{ width: compact ? 52 : 208, background: "var(--surface)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto", transition: "width 0.2s" }}>

        {!compact && (
          <div style={{ padding: "16px 12px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg,#1D3461,#0F2041)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px", fontSize: 20, color: "white", fontWeight: 800 }}>YM</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Yousif Mohammed</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>Field Ops Manager</div>
            <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 1 }}>PACT-FOM-0042</div>
            <div style={{ marginTop: 8, display: "flex", justifyContent: "center" }}>
              <Tag label="● Active" color="green" />
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 9, color: "var(--faint)", textTransform: "uppercase" }}>Profile</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: overall >= 80 ? "#22c55e" : "#f59e0b" }}>{overall}%</span>
              </div>
              <div style={{ height: 4, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", background: overall >= 80 ? "#22c55e" : "#f59e0b", borderRadius: 99, width: `${overall}%` }} />
              </div>
            </div>
          </div>
        )}

        <nav style={{ flex: 1, padding: compact ? "8px 4px" : "10px 6px", overflowY: "auto" }}>
          {GROUPS.map(group => (
            <div key={group} style={{ marginBottom: compact ? 8 : 12 }}>
              {!compact && <div style={{ fontSize: 9, fontWeight: 700, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 8px", marginBottom: 2 }}>{group}</div>}
              {NAV.filter(s => s.group === group).map(s => {
                const pct = COMPLETENESS[s.id];
                const isActive = active === s.id;
                return (
                  <button key={s.id} onClick={() => setActive(s.id)} title={compact ? s.label : undefined}
                    style={{ display: "flex", alignItems: "center", gap: compact ? 0 : 7, justifyContent: compact ? "center" : "flex-start",
                      width: "100%", padding: compact ? "8px 0" : "5px 8px", borderRadius: 7, border: "none", cursor: "pointer",
                      background: isActive ? "var(--navyBg)" : "transparent", color: isActive ? "var(--navy)" : "var(--muted)",
                      fontWeight: isActive ? 700 : 500, fontSize: 11.5, textAlign: "left" }}>
                    <span style={{ fontSize: compact ? 16 : 13 }}>{s.icon}</span>
                    {!compact && <><span style={{ flex: 1 }}>{s.label}</span><Dot pct={pct} /></>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div style={{ padding: compact ? "8px 4px" : "8px 6px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 4 }}>
          {compact ? (
            <>
              <button title="Send Email" style={{ padding: "8px 0", background: "none", border: "none", cursor: "pointer", fontSize: 16, textAlign: "center" }}>📧</button>
              <button title="Signatures" style={{ padding: "8px 0", background: "none", border: "none", cursor: "pointer", fontSize: 16, textAlign: "center" }}>✍️</button>
              <button title="Employee Badge" style={{ padding: "8px 0", background: "none", border: "none", cursor: "pointer", fontSize: 16, textAlign: "center" }}>🆔</button>
              <button title="Offboard" style={{ padding: "8px 0", background: "none", border: "none", cursor: "pointer", fontSize: 16, textAlign: "center" }}>🚪</button>
            </>
          ) : (
            <>
              <button style={{ fontSize: 11, fontWeight: 600, color: "var(--navy)", background: "var(--navyBg)", border: "none", borderRadius: 7, padding: "7px 0", cursor: "pointer" }}>📧 Send Email</button>
              <button style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", background: "var(--hl)", border: "none", borderRadius: 7, padding: "7px 0", cursor: "pointer" }}>✍️ Signatures</button>
              <button style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", background: "var(--hl)", border: "none", borderRadius: 7, padding: "7px 0", cursor: "pointer" }}>🆔 Employee Badge</button>
              <button style={{ fontSize: 11, fontWeight: 600, color: "#991b1b", background: "#fee2e2", border: "none", borderRadius: 7, padding: "7px 0", cursor: "pointer" }}>🚪 Offboard</button>
            </>
          )}
        </div>
      </div>

      {/* ── MAIN ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Top bar */}
        <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "10px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button style={{ fontSize: 12, color: "var(--faint)", background: "none", border: "none", cursor: "pointer" }}>← HR / Users</button>
            <span style={{ color: "var(--border)" }}>|</span>
            <div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Yousif Mohammed</span>
              <span style={{ fontSize: 11, color: "var(--faint)", marginLeft: 8 }}>{NAV.find(s => s.id === active)?.icon} {NAV.find(s => s.id === active)?.label}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {/* ⌘K Search */}
            <button onClick={() => setSearchOpen(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "var(--hl)", border: "1px solid var(--border)", borderRadius: 7, cursor: "pointer", color: "var(--faint)", fontSize: 11 }}>
              🔍 Search profile
              <span style={{ fontSize: 10, background: "var(--border)", borderRadius: 4, padding: "1px 5px" }}>⌘K</span>
            </button>
            {/* Compact toggle */}
            <button onClick={() => setCompact(v => !v)} title={compact ? "Full view" : "Compact view"}
              style={{ padding: "5px 8px", background: compact ? "var(--navyBg)" : "var(--hl)", border: "1px solid var(--border)", borderRadius: 7, cursor: "pointer", fontSize: 13 }}>
              {compact ? "⊞" : "⊟"}
            </button>
            {/* Dark mode toggle */}
            <button onClick={() => setDark(v => !v)} title={dark ? "Light mode" : "Dark mode"}
              style={{ padding: "5px 8px", background: "var(--hl)", border: "1px solid var(--border)", borderRadius: 7, cursor: "pointer", fontSize: 13 }}>
              {dark ? "☀️" : "🌙"}
            </button>
            {/* Sync Dossier */}
            <button style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", background: "var(--hl)", border: "1px solid var(--border)", borderRadius: 7, padding: "5px 11px", cursor: "pointer" }}>
              📂 Sync Dossier
            </button>
            {/* Full dossier export */}
            <button style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", background: "var(--hl)", border: "1px solid var(--border)", borderRadius: 7, padding: "5px 11px", cursor: "pointer" }}>
              🖨️ Print Profile
            </button>
            {/* CV Export */}
            <div style={{ position: "relative" }}>
              <button onClick={e => { e.stopPropagation(); setCvOpen(v => !v); }}
                style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", background: "var(--hl)", border: "1px solid var(--border)", borderRadius: 7, padding: "5px 11px", cursor: "pointer" }}>
                📄 Export CV ▾
              </button>
              <CVMenu open={cvOpen} onClose={() => setCvOpen(false)} />
            </div>
            <button style={{ fontSize: 12, fontWeight: 700, color: "white", background: "var(--navy)", border: "none", borderRadius: 7, padding: "6px 13px", cursor: "pointer" }}>
              ✎ Edit Profile
            </button>
          </div>
        </div>

        {/* Alert bar */}
        <AlertBar
          alerts={alerts}
          onNavigate={id => setActive(id)}
          onDismiss={id => setAlerts(prev => prev.filter(a => a.id !== id))}
        />

        {/* Section last-edited bar */}
        {TIMESTAMPS[active] && (
          <div style={{ padding: "4px 20px", background: "var(--hl)", borderBottom: "1px solid var(--border)", fontSize: 10, color: "var(--faint)", display: "flex", justifyContent: "flex-end" }}>
            Last edited: {TIMESTAMPS[active]}
          </div>
        )}

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: compact ? "12px 16px" : "16px 20px" }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
