import { useState, useEffect, useContext, createContext, useRef } from "react";

// ── Contexts ──────────────────────────────────────────────────────────────────
type ToastFn = (msg: string, type?: "success"|"error"|"info") => void;
const ToastCtx = createContext<ToastFn>(() => {});
const DocPreviewCtx = createContext<(name: string) => void>(() => {});

// ── Navigation ────────────────────────────────────────────────────────────────
const NAV = [
  { id: "overview",     icon: "🏠", label: "Overview",                group: "Profile",    count: 0  },
  { id: "employment",   icon: "💼", label: "Employment & Contract",   group: "Profile",    count: 0  },
  { id: "personal",     icon: "👤", label: "Personal Details",        group: "Profile",    count: 0  },
  { id: "location",     icon: "📍", label: "Location & Work",         group: "Profile",    count: 0  },
  { id: "education",    icon: "🎓", label: "Education & Experience",  group: "Background", count: 5  },
  { id: "documents",    icon: "📁", label: "Document Vault",          group: "Background", count: 6  },
  { id: "skills",       icon: "⚡", label: "Skills & Languages",      group: "Background", count: 10 },
  { id: "training",     icon: "🏅", label: "Training & Certs",        group: "Background", count: 4  },
  { id: "dependents",   icon: "👨‍👩‍👧", label: "Dependents",              group: "Background", count: 3  },
  { id: "equipment",    icon: "💻", label: "Equipment",               group: "Background", count: 3  },
  { id: "policies",     icon: "📜", label: "Policies",                group: "Background", count: 7  },
  { id: "compensation", icon: "💰", label: "Compensation & Bank",     group: "Finance",    count: 0  },
  { id: "performance",  icon: "📊", label: "Performance",             group: "Finance",    count: 4  },
  { id: "benefits",     icon: "🛡️", label: "Benefits & Leave",        group: "Finance",    count: 0  },
  { id: "access",       icon: "🔒", label: "Access & Security",       group: "System",     count: 0  },
  { id: "itaccounts",   icon: "🖥️", label: "IT Accounts",             group: "System",     count: 5  },
  { id: "hrnotes",      icon: "📝", label: "HR Notes",                group: "System",     count: 3  },
  { id: "activitylog",  icon: "🕐", label: "Activity Log",            group: "System",     count: 10 },
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

// ── Shared primitives ─────────────────────────────────────────────────────────

function Dot({ pct }: { pct: number }) {
  const c = pct === 0 ? "var(--border)" : pct < 50 ? "var(--c-amber-fg)" : pct < 100 ? "var(--c-blue-fg)" : "var(--c-green-fg)";
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: c, display: "inline-block", flexShrink: 0 }} />;
}

type TagColor = "green"|"amber"|"blue"|"red"|"gray"|"purple"|"indigo"|"navy";
function Tag({ label, color }: { label: string; color: TagColor }) {
  const map: Record<TagColor, [string,string]> = {
    green:  ["var(--c-green-bg)",  "var(--c-green-fg)"],
    amber:  ["var(--c-amber-bg)",  "var(--c-amber-fg)"],
    blue:   ["var(--c-blue-bg)",   "var(--c-blue-fg)"],
    red:    ["var(--c-red-bg)",    "var(--c-red-fg)"],
    gray:   ["var(--hl)",          "var(--muted)"],
    purple: ["var(--c-purple-bg)", "var(--c-purple-fg)"],
    indigo: ["var(--c-indigo-bg)", "var(--c-indigo-fg)"],
    navy:   ["var(--navyBg)",      "var(--navy)"],
  };
  const [bg, fg] = map[color] ?? map.gray;
  return <span style={{ padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: bg, color: fg, whiteSpace: "nowrap" }}>{label}</span>;
}

function Field({ label, value, wide, required, editable, sensitive }: {
  label: string; value?: string; wide?: boolean; required?: boolean; editable?: boolean; sensitive?: boolean;
}) {
  const showToast = useContext(ToastCtx);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || "");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(val).catch(() => {});
    setCopied(true);
    showToast(`Copied ${label}`, "success");
    setTimeout(() => setCopied(false), 1500);
  };
  const handleSave = () => { setEditing(false); showToast(`${label} saved`, "success"); };

  return (
    <div style={{ gridColumn: wide ? "1/-1" : undefined, display: "flex", flexDirection: "column", gap: 3 }}
      onClick={() => editable && !editing && setEditing(true)}>
      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 4 }}>
        {label}{required && <span style={{ color: "#ef4444" }}>*</span>}
        {editable && !editing && <span style={{ fontSize: 9, color: "var(--navy)", opacity: 0.6 }}>click to edit</span>}
      </span>
      {editing ? (
        <div style={{ display: "flex", gap: 4 }}>
          <input autoFocus value={val} onChange={e => setVal(e.target.value)}
            onBlur={handleSave} onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
            style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "var(--text)", background: "var(--hl)", border: "1px solid var(--navy)", borderRadius: 6, padding: "4px 8px", outline: "none" }} />
          <button type="button" onClick={handleSave}
            style={{ fontSize: 11, background: "var(--navy)", color: "white", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}>✓</button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: val ? "var(--text)" : "var(--border)", fontStyle: val ? "normal" : "italic", cursor: editable ? "text" : "default", flex: 1 }}>
            {val || "Not filled"}
          </span>
          {sensitive && val && (
            <button type="button" onClick={handleCopy}
              style={{ fontSize: 10, background: "none", border: "none", cursor: "pointer", color: "var(--faint)", padding: "2px 4px", borderRadius: 4, opacity: 0.7 }}
              title="Copy to clipboard">
              {copied ? "✓" : "⧉"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Card({ title, badge, ts, locked, onLock, children, action, id: anchorId }:
  { title: string; badge?: React.ReactNode; ts?: string; locked?: boolean; onLock?: () => void; children: React.ReactNode; action?: React.ReactNode; id?: string }) {
  return (
    <div id={anchorId} style={{ background: "var(--surface)", border: `1px solid ${locked ? "var(--c-amber-bg)" : "var(--border)"}`, borderRadius: 12, overflow: "hidden", marginBottom: "var(--gap)" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 12, color: "var(--text)", flex: 1 }}>{title}</span>
        {badge}{locked && <Tag label="🔒 Locked" color="amber" />}
        {ts && <span style={{ fontSize: 10, color: "var(--faint)" }}>Last edit: {ts}</span>}
        {onLock && (
          <button type="button" onClick={onLock}
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
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>{children}</div>;
}

function Btn({ label, color, onClick }: { label: string; color?: "navy"|"gray"|"red"|"green"; onClick?: () => void }) {
  const bg = color === "red" ? "var(--c-red-bg)" : color === "green" ? "var(--c-green-bg)" : color === "navy" ? "var(--navy)" : "var(--hl)";
  const fg = color === "red" ? "var(--c-red-fg)" : color === "green" ? "var(--c-green-fg)" : color === "navy" ? "white" : "var(--muted)";
  return (
    <button type="button" onClick={onClick}
      style={{ fontSize: 11, fontWeight: 600, color: fg, background: bg, border: "none", borderRadius: 7, padding: "5px 11px", cursor: "pointer", whiteSpace: "nowrap" }}>
      {label}
    </button>
  );
}

function Toast({ msg, type }: { msg: string; type: string }) {
  const bg = type === "success" ? "var(--c-green-bg)" : type === "error" ? "var(--c-red-bg)" : "var(--c-blue-bg)";
  const fg = type === "success" ? "var(--c-green-fg)" : type === "error" ? "var(--c-red-fg)" : "var(--c-blue-fg)";
  const icon = type === "success" ? "✅" : type === "error" ? "❌" : "ℹ️";
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, padding: "10px 16px", borderRadius: 10, background: bg, border: `1px solid ${fg}33`, color: fg, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", animation: "slideUp 0.25s ease" }}>
      <span>{icon}</span>{msg}
    </div>
  );
}

// ── Alert Bar ─────────────────────────────────────────────────────────────────

function AlertBar({ alerts, onNavigate, onDismiss }: { alerts: typeof GLOBAL_ALERTS; onNavigate: (s: string) => void; onDismiss: (id: string) => void }) {
  if (!alerts.length) return null;
  return (
    <div style={{ padding: "8px 20px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 5, background: "var(--surface)" }}>
      {alerts.map(a => {
        const bg = a.level === "red" ? "var(--c-red-bg)" : a.level === "amber" ? "var(--c-amber-bg)" : "var(--c-blue-bg)";
        const fg = a.level === "red" ? "var(--c-red-fg)" : a.level === "amber" ? "var(--c-amber-fg)" : "var(--c-blue-fg)";
        return (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px", borderRadius: 8, background: bg }}>
            <span style={{ fontSize: 14 }}>{a.icon}</span>
            <span style={{ fontSize: 12, color: fg, flex: 1 }}>{a.text}</span>
            <button type="button" onClick={() => onNavigate(a.section)}
              style={{ fontSize: 11, fontWeight: 600, color: fg, background: "var(--surface)", border: "none", borderRadius: 5, padding: "2px 8px", cursor: "pointer", opacity: 0.8 }}>View →</button>
            <button type="button" onClick={() => onDismiss(a.id)}
              style={{ fontSize: 14, color: fg, background: "none", border: "none", cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
        );
      })}
    </div>
  );
}

// ── Search Overlay (with keyboard nav) ────────────────────────────────────────

function SearchOverlay({ open, onClose, onNavigate }: { open: boolean; onClose: () => void; onNavigate: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  useEffect(() => { if (!open) { setQ(""); setHi(0); } }, [open]);
  const results = q ? NAV.filter(n => n.label.toLowerCase().includes(q.toLowerCase())) : NAV;
  useEffect(() => { setHi(0); }, [q]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi(h => Math.min(h + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    if (e.key === "Enter" && results[hi]) { onNavigate(results[hi].id); onClose(); }
    if (e.key === "Escape") onClose();
  };
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 80, background: "rgba(0,0,0,0.3)" }}
      onClick={onClose}>
      <div style={{ background: "var(--surface)", borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", width: 480, overflow: "hidden", border: "1px solid var(--border)" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <span>🔍</span>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={handleKey}
            placeholder="Search profile sections, fields…"
            style={{ flex: 1, fontSize: 14, border: "none", outline: "none", background: "transparent", color: "var(--text)" }} />
          <span style={{ fontSize: 11, color: "var(--faint)", background: "var(--hl)", borderRadius: 4, padding: "2px 6px" }}>Esc</span>
        </div>
        <div style={{ maxHeight: 340, overflowY: "auto", padding: "8px 0" }}>
          {results.map((n, i) => (
            <button key={n.id} type="button" onClick={() => { onNavigate(n.id); onClose(); }}
              style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 16px", background: i === hi ? "var(--hl)" : "none", border: "none", cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontSize: 16 }}>{n.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{n.label}</div>
                <div style={{ fontSize: 11, color: "var(--faint)" }}>{n.group}</div>
              </div>
              <span style={{ fontSize: 11, color: "var(--faint)" }}>{COMPLETENESS[n.id]}%</span>
            </button>
          ))}
        </div>
        <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 14, fontSize: 10, color: "var(--faint)" }}>
          <span>↑↓ navigate</span><span>↵ open</span><span>Esc close</span>
        </div>
      </div>
    </div>
  );
}

// ── CV Menu ───────────────────────────────────────────────────────────────────

function CVMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, background: "var(--surface)", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", border: "1px solid var(--border)", zIndex: 100, minWidth: 210, overflow: "hidden" }}>
      <div style={{ padding: "7px 12px", borderBottom: "1px solid var(--border)", fontSize: 10, fontWeight: 700, color: "var(--faint)", textTransform: "uppercase" }}>Export CV As</div>
      {[{ l:"UN P11 Format",i:"🇺🇳"},{ l:"Reverse Chronological",i:"📄"},{ l:"Functional",i:"📊"},{ l:"Combination",i:"📋"},{ l:"Europass",i:"🇪🇺"}].map(f => (
        <button key={f.l} type="button" onClick={onClose}
          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text)", textAlign: "left" }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--hl)")}
          onMouseLeave={e => (e.currentTarget.style.background = "none")}>
          <span>{f.i}</span>{f.l}
        </button>
      ))}
    </div>
  );
}

// ── QR Code + Barcode SVGs ────────────────────────────────────────────────────

function QRCodeSVG({ size = 64, fg = "black" }: { size?: number; fg?: string }) {
  const p = [
    [1,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,1],
    [1,0,1,1,1,0,1,0,1,0,1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1,0,0,1,1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1,0,1,1,1,0,1,1,1,0,1],
    [1,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,1],
    [0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
    [1,0,1,0,0,1,1,1,1,0,0,1,0,0,1,0,1],
    [0,1,0,0,1,0,0,1,0,1,1,0,1,0,0,1,0],
    [1,1,1,0,1,1,1,0,0,0,1,1,0,1,1,0,1],
    [0,0,0,1,0,0,0,0,1,0,0,0,1,0,0,0,0],
    [1,1,1,1,1,1,1,0,1,0,0,1,0,1,1,0,1],
    [1,0,0,0,0,0,1,0,0,1,1,0,1,0,0,1,0],
    [1,0,1,1,1,0,1,0,1,0,1,0,0,1,0,1,0],
    [1,0,1,1,1,0,1,0,0,1,0,1,1,0,1,0,1],
    [1,0,0,0,0,0,1,0,1,0,1,1,0,0,1,1,1],
  ];
  const cs = size / p[0].length;
  return (
    <svg width={size} height={size} style={{ display: "block" }}>
      {p.map((row, ri) => row.map((cell, ci) =>
        cell ? <rect key={`${ri}-${ci}`} x={ci * cs} y={ri * cs} width={cs + 0.5} height={cs + 0.5} fill={fg} /> : null
      ))}
    </svg>
  );
}

function BarcodeStrip({ value, width = 120 }: { value: string; width?: number }) {
  const bars = [1,0,1,1,0,1,0,1,1,0,0,1,0,1,1,0,1,0,1,1,0,0,1,0,1,0,1,1,0,1,0,1,0,0,1,1,0,1,0,1];
  const bw = width / bars.length;
  return (
    <svg width={width} height={32} style={{ display: "block" }}>
      {bars.map((b, i) => b ? <rect key={i} x={i * bw} y={0} width={bw * 0.7} height={24} fill="black" /> : null)}
      <text x={width / 2} y={31} textAnchor="middle" fontSize={7} fill="black" fontFamily="monospace">{value}</text>
    </svg>
  );
}

// ── Employee Badge Modal ──────────────────────────────────────────────────────

function EmployeeBadgeModal({ onClose }: { onClose: () => void }) {
  const [flipped, setFlipped] = useState(false);
  const [printed, setPrinted] = useState(false);
  const showToast = useContext(ToastCtx);

  const handlePrint = () => {
    setPrinted(true);
    showToast("Badge sent to printer", "success");
    setTimeout(() => setPrinted(false), 2000);
  };

  const cardW = 340, cardH = 215;
  const NAVY = "#1D3461";

  const FrontFace = () => (
    <div style={{ width: cardW, height: cardH, borderRadius: 14, overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,0.3)", position: "relative", background: "white", fontFamily: "sans-serif" }}>
      {/* Top band */}
      <div style={{ background: NAVY, height: 54, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🌍</div>
          <div>
            <div style={{ color: "white", fontSize: 10, fontWeight: 800, letterSpacing: "0.1em" }}>PACT WORLD</div>
            <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 7, letterSpacing: "0.07em" }}>COMMAND CENTER</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 9, fontWeight: 600 }}>🇸🇩 SUDAN</div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 7 }}>STAFF ID CARD</div>
        </div>
      </div>

      {/* Holographic shimmer strip */}
      <div style={{ height: 4, background: "linear-gradient(90deg,#ff6b6b,#ffd93d,#6bcb77,#4d96ff,#c77dff,#ff6b6b)", opacity: 0.7 }} />

      {/* Body */}
      <div style={{ display: "flex", gap: 14, padding: "12px 14px" }}>
        {/* Photo */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ width: 76, height: 88, borderRadius: 10, background: `linear-gradient(135deg,${NAVY},#0F2041)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, color: "white", fontWeight: 800, border: "3px solid #e5e7eb" }}>YM</div>
        </div>
        {/* Details */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", lineHeight: 1.2 }}>YOUSIF MOHAMMED</div>
          <div style={{ fontSize: 10, color: NAVY, fontWeight: 700, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>Field Operations Manager</div>
          <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>Field Operations Department</div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontSize: 9, color: "#374151" }}>🏢 <strong>Hub:</strong> Khartoum HQ</div>
            <div style={{ fontSize: 9, color: "#374151" }}>🩸 <strong>Blood:</strong> O+</div>
            <div style={{ fontSize: 9, color: "#374151" }}>📞 <strong>ICE:</strong> +249 912 345 678</div>
          </div>
        </div>
        {/* QR */}
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <div style={{ padding: 3, border: "1px solid #e5e7eb", borderRadius: 6, background: "white" }}>
            <QRCodeSVG size={56} />
          </div>
          <div style={{ fontSize: 7, color: "#9ca3af" }}>Scan to verify</div>
        </div>
      </div>

      {/* Bottom band */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: NAVY, height: 36, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px" }}>
        <div>
          <div style={{ color: "white", fontSize: 10, fontWeight: 800, letterSpacing: "0.08em" }}>PACT-FOM-0042</div>
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 7 }}>Valid until Dec 31, 2025</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fbbf24", opacity: 0.8 }} />
          <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#f87171", marginLeft: -8, opacity: 0.8 }} />
        </div>
      </div>
    </div>
  );

  const BackFace = () => (
    <div style={{ width: cardW, height: cardH, borderRadius: 14, overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,0.3)", background: "white", fontFamily: "sans-serif" }}>
      <div style={{ background: NAVY, height: 54, display: "flex", alignItems: "center", padding: "0 16px" }}>
        <div style={{ color: "white", fontSize: 10, fontWeight: 800, letterSpacing: "0.08em" }}>EMERGENCY INFORMATION</div>
      </div>
      <div style={{ height: 4, background: "linear-gradient(90deg,#ff6b6b,#ffd93d,#6bcb77,#4d96ff,#c77dff,#ff6b6b)", opacity: 0.7 }} />
      <div style={{ padding: "10px 14px", fontSize: 9, color: "#374151", display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ background: "#fef3c7", borderRadius: 6, padding: "5px 8px" }}>
          <div style={{ fontWeight: 700, color: "#92400e", marginBottom: 2 }}>🚨 EMERGENCY CONTACT</div>
          <div>Fatima Omar (Spouse) · +249 912 345 678</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <div style={{ background: "#f0fdf4", borderRadius: 6, padding: "5px 8px" }}>
            <div style={{ fontWeight: 700, color: "#166534", marginBottom: 1 }}>🩸 MEDICAL</div>
            <div>Blood: O+</div>
            <div>Insurance: National Health Co.</div>
          </div>
          <div style={{ background: "#eff6ff", borderRadius: 6, padding: "5px 8px" }}>
            <div style={{ fontWeight: 700, color: "#1e40af", marginBottom: 1 }}>🏢 OFFICE</div>
            <div>PACT World — Sudan</div>
            <div>hr@pact-sudan.org</div>
          </div>
        </div>
        <div style={{ fontSize: 8, color: "#9ca3af", textAlign: "center" }}>If found, please return to PACT World HR · Khartoum Office</div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", paddingBottom: 6 }}>
        <BarcodeStrip value="PACT-FOM-0042" width={200} />
      </div>
      <div style={{ background: NAVY, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 8 }}>Security Level B · Issued Jan 14, 2023 · pact-sudan.org</div>
      </div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 998, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 20 }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div style={{ color: "white", fontSize: 14, fontWeight: 700 }}>🆔 Employee ID Badge Preview</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>CR80 standard (85.6 × 54 mm) — shown at 4× screen size</div>

        {/* Badge face */}
        {flipped ? <BackFace /> : <FrontFace />}

        {/* Controls */}
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={() => setFlipped(v => !v)}
            style={{ padding: "9px 18px", borderRadius: 9, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            🔄 Flip to {flipped ? "Front" : "Back"}
          </button>
          <button type="button" onClick={handlePrint}
            style={{ padding: "9px 18px", borderRadius: 9, background: printed ? "#22c55e" : "white", border: "none", color: printed ? "white" : "#111", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {printed ? "✅ Sent!" : "🖨️ Print Badge"}
          </button>
          <button type="button" onClick={() => { showToast("Badge saved as PDF", "success"); }}
            style={{ padding: "9px 18px", borderRadius: 9, background: NAVY, border: "none", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            💾 Save as PDF
          </button>
          <button type="button" onClick={onClose}
            style={{ padding: "9px 18px", borderRadius: 9, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "white", fontSize: 12, cursor: "pointer" }}>
            ✕ Close
          </button>
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
          Badge includes: holographic strip · QR verification · ICAO-compliant layout · security level marking
        </div>
      </div>
    </div>
  );
}

// ── Document Preview Drawer ───────────────────────────────────────────────────

function DocPreviewDrawer({ docName, onClose }: { docName: string; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 990, display: "flex" }} onClick={onClose}>
      <div style={{ flex: 1 }} />
      <div style={{ width: 440, height: "100%", background: "var(--surface)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", boxShadow: "-8px 0 40px rgba(0,0,0,0.15)" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>📄</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{docName}</div>
            <div style={{ fontSize: 10, color: "var(--faint)" }}>PDF Document · 2.4 MB</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn label="⬇ Download" color="gray" />
            <Btn label="🖨️ Print" color="gray" />
            <button type="button" onClick={onClose} style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", color: "var(--faint)" }}>×</button>
          </div>
        </div>
        {/* Mock document viewer */}
        <div style={{ flex: 1, overflowY: "auto", background: "#525659", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Page 1 */}
          <div style={{ background: "white", borderRadius: 4, padding: "32px 36px", boxShadow: "0 2px 12px rgba(0,0,0,0.3)", minHeight: 480 }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#1D3461" }}>PACT WORLD INC.</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Sudan Country Office · Khartoum</div>
              <div style={{ marginTop: 12, fontWeight: 700, fontSize: 13, color: "#111" }}>
                {docName.includes("Passport") ? "PASSPORT COPY" : docName.includes("contract") || docName.includes("Agreement") ? "EMPLOYMENT AGREEMENT" : "OFFICIAL DOCUMENT"}
              </div>
              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>Ref: HR/2024/DOC-0042</div>
            </div>
            <div style={{ borderTop: "2px solid #1D3461", marginBottom: 16 }} />
            {[
              { label: "Employee Full Name", value: "Yousif Ahmed Mohammed" },
              { label: "Employee ID",        value: "PACT-FOM-0042" },
              { label: "Position",           value: "Field Operations Manager" },
              { label: "Department",         value: "Field Operations" },
              { label: "Issue Date",         value: "January 14, 2023" },
              { label: "Document No.",       value: "SD1928374" },
            ].map(row => (
              <div key={row.label} style={{ display: "flex", fontSize: 10, padding: "5px 0", borderBottom: "1px solid #f3f4f6" }}>
                <span style={{ width: 140, color: "#6b7280", fontWeight: 600 }}>{row.label}</span>
                <span style={{ color: "#111", fontWeight: 500 }}>{row.value}</span>
              </div>
            ))}
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{ height: 10, background: "#f3f4f6", borderRadius: 4, marginTop: 12, width: i === 5 ? "60%" : "100%" }} />
            ))}
            <div style={{ marginTop: 40, display: "flex", justifyContent: "space-between" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ width: 100, borderTop: "1px solid #374151", paddingTop: 4, fontSize: 9, color: "#6b7280" }}>Employee Signature</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ width: 100, borderTop: "1px solid #374151", paddingTop: 4, fontSize: 9, color: "#6b7280" }}>Authorised By HR</div>
              </div>
            </div>
            <div style={{ marginTop: 24, padding: "6px 10px", background: "#f0fdf4", borderRadius: 6, fontSize: 9, color: "#166534", display: "flex", gap: 6 }}>
              ✅ Verified by HR Admin · Jun 20, 2024 · Digital signature valid
            </div>
          </div>
        </div>
        <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--faint)" }}>Page 1 of 1</span>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn label="← Prev" color="gray" />
            <Btn label="Next →" color="gray" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Leave Request Modal ───────────────────────────────────────────────────────

function LeaveRequestModal({ onClose }: { onClose: () => void }) {
  const showToast = useContext(ToastCtx);
  const [form, setForm] = useState({ type: "Annual Leave", from: "2024-08-01", to: "2024-08-07", reason: "" });
  const days = Math.max(0, Math.ceil((new Date(form.to).getTime() - new Date(form.from).getTime()) / 86400000));
  const submit = () => { showToast("Leave request submitted for approval", "success"); onClose(); };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 995, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: 440, border: "1px solid var(--border)", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>🌴</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", flex: 1 }}>Request Leave</span>
          <button type="button" onClick={onClose} style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", color: "var(--faint)" }}>×</button>
        </div>
        <div style={{ padding: "18px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--faint)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Leave Type *</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--hl)", color: "var(--text)", fontSize: 13, outline: "none" }}>
                {["Annual Leave","Sick Leave","Compassionate Leave","Study Leave","Unpaid Leave"].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--faint)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>From *</label>
                <input type="date" value={form.from} onChange={e => setForm(f => ({ ...f, from: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--hl)", color: "var(--text)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--faint)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>To *</label>
                <input type="date" value={form.to} onChange={e => setForm(f => ({ ...f, to: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--hl)", color: "var(--text)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>
            {days > 0 && (
              <div style={{ padding: "8px 12px", background: "var(--c-blue-bg)", borderRadius: 8, fontSize: 12, color: "var(--c-blue-fg)", fontWeight: 600 }}>
                📅 Duration: <strong>{days} working day{days !== 1 ? "s" : ""}</strong> · Balance after: <strong>{14 - days} days</strong> remaining
              </div>
            )}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--faint)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Reason / Notes</label>
              <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={3} placeholder="Optional — e.g. family event, medical appointment…"
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--hl)", color: "var(--text)", fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
            </div>
          </div>
        </div>
        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn label="Cancel" color="gray" onClick={onClose} />
          <Btn label="Submit for Approval" color="navy" onClick={submit} />
        </div>
      </div>
    </div>
  );
}

// ── Org Chart ─────────────────────────────────────────────────────────────────

function OrgChart() {
  const nodes = [
    { id: "dir", label: "Hassan Ali",   role: "Director",     x: 200, y: 10,  color: "#1D3461", me: false },
    { id: "mgr", label: "Ahmed Hassan", role: "Senior PM",    x: 200, y: 80,  color: "#4f46e5", me: false },
    { id: "me",  label: "Yousif M.",    role: "FOM — YOU",    x: 200, y: 150, color: "#0ea5e9", me: true  },
    { id: "r1",  label: "Sara Ali",     role: "Coordinator",  x: 80,  y: 220, color: "#6b7280", me: false },
    { id: "r2",  label: "Omar Nour",    role: "Coordinator",  x: 200, y: 220, color: "#6b7280", me: false },
    { id: "r3",  label: "Hiba M.",      role: "D. Collector", x: 320, y: 220, color: "#6b7280", me: false },
  ];
  const edges = [["dir","mgr"],["mgr","me"],["me","r1"],["me","r2"],["me","r3"]];
  return (
    <div style={{ overflowX: "auto" }}>
      <svg width="420" height="268" style={{ display: "block" }}>
        {edges.map(([a, b]) => {
          const from = nodes.find(n => n.id === a)!;
          const to = nodes.find(n => n.id === b)!;
          return <line key={a+b} x1={from.x+50} y1={from.y+32} x2={to.x+50} y2={to.y} stroke="var(--border)" strokeWidth="2" />;
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

// ── Wellbeing Pulse Widget ────────────────────────────────────────────────────

function WellbeingPulse() {
  const showToast = useContext(ToastCtx);
  const [score, setScore] = useState(4);
  const [submitted, setSubmitted] = useState(false);
  const emojis = ["😞","😐","🙂","😊","🤩"];
  const labels = ["Poor","Fair","Good","Great","Excellent"];
  const submit = () => { setSubmitted(true); showToast(`Wellbeing pulse submitted: ${labels[score - 1]}`, "success"); };
  return (
    <div style={{ padding: "12px 16px", background: "var(--hl)", borderRadius: 10, border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>❤️ Wellbeing Pulse — How are you doing today?</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 10 }}>
        {emojis.map((e, i) => (
          <button key={i} type="button" onClick={() => { setScore(i + 1); setSubmitted(false); }}
            style={{ fontSize: 24, background: score === i + 1 ? "var(--navyBg)" : "transparent", border: `2px solid ${score === i + 1 ? "var(--navy)" : "transparent"}`, borderRadius: 10, padding: "6px 10px", cursor: "pointer", transition: "all 0.15s" }}>
            {e}
          </button>
        ))}
      </div>
      <div style={{ textAlign: "center", fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>{labels[score - 1]} ({score}/5)</div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <button type="button" onClick={submit}
          style={{ fontSize: 11, fontWeight: 600, padding: "6px 20px", borderRadius: 8, border: "none", cursor: "pointer", background: submitted ? "var(--c-green-bg)" : "var(--navy)", color: submitted ? "var(--c-green-fg)" : "white" }}>
          {submitted ? "✅ Submitted!" : "Submit Pulse"}
        </button>
      </div>
    </div>
  );
}

// ── Salary Chart ──────────────────────────────────────────────────────────────

function SalaryChart() {
  const data = [
    { period: "Jan 2023", amount: 200000, level: "Level A" },
    { period: "Jan 2024", amount: 250000, level: "Level B" },
    { period: "Jul 2024", amount: 265000, level: "Level B+" },
  ];
  const max = Math.max(...data.map(d => d.amount)) * 1.2;
  const w = 360, h = 80;
  return (
    <div>
      <svg width={w} height={h + 30} style={{ display: "block" }}>
        {data.map((d, i) => {
          const bw = 60, bh = (d.amount / max) * h;
          const x = i * (w / data.length) + 20;
          const y = h - bh;
          return (
            <g key={i}>
              <rect x={x} y={y} width={bw} height={bh} rx={6} fill="var(--navy)" opacity={0.85} />
              <text x={x + bw/2} y={y - 4} textAnchor="middle" fontSize={9} fill="var(--text)">
                {(d.amount/1000).toFixed(0)}K
              </text>
              <text x={x + bw/2} y={h + 12} textAnchor="middle" fontSize={8} fill="var(--faint)">{d.period}</text>
              <text x={x + bw/2} y={h + 22} textAnchor="middle" fontSize={8} fill="var(--navy)" fontWeight="700">{d.level}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Section Anchor Sub-Nav ────────────────────────────────────────────────────

function AnchorNav({ items }: { items: { label: string; id: string }[] }) {
  const [active, setActive] = useState(items[0]?.id);
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 12, borderBottom: "2px solid var(--border)", paddingBottom: 0 }}>
      {items.map(item => (
        <a key={item.id} href={`#${item.id}`} onClick={() => setActive(item.id)}
          style={{ fontSize: 11, fontWeight: active === item.id ? 700 : 500, color: active === item.id ? "var(--navy)" : "var(--faint)", padding: "6px 12px", textDecoration: "none", borderBottom: active === item.id ? "2px solid var(--navy)" : "2px solid transparent", marginBottom: -2, whiteSpace: "nowrap" }}>
          {item.label}
        </a>
      ))}
    </div>
  );
}

// ── SECTIONS ──────────────────────────────────────────────────────────────────

function OverviewSection({ onJump }: { onJump: (id: string) => void }) {
  const overall = Math.round(Object.values(COMPLETENESS).reduce((a, b) => a + b, 0) / Object.keys(COMPLETENESS).length);
  const [photoHover, setPhotoHover] = useState(false);
  const circ = 2 * Math.PI * 22;

  return (
    <>
      {/* Hero */}
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
          {/* Animated progress ring */}
          <svg width="56" height="56" viewBox="0 0 56 56" style={{ transition: "all 0.6s ease" }}>
            <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="6" />
            <circle cx="28" cy="28" r="22" fill="none" stroke="white" strokeWidth="6"
              strokeDasharray={`${circ * overall / 100} ${circ * (1 - overall / 100)}`}
              strokeLinecap="round" transform="rotate(-90 28 28)"
              style={{ transition: "stroke-dasharray 1s ease" }} />
          </svg>
        </div>
        <div style={{ marginTop: 10, background: "rgba(255,255,255,0.15)", borderRadius: 8, height: 5, overflow: "hidden" }}>
          <div style={{ height: "100%", background: "white", borderRadius: 8, width: `${overall}%`, transition: "width 1s ease" }} />
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: "var(--gap)" }}>
        {[
          { l: "Days Employed", v: "847",      i: "📅" },
          { l: "Department",    v: "Field Ops", i: "🏢" },
          { l: "Contract Ends", v: "Dec 2025",  i: "📋" },
          { l: "Leave Balance", v: "14 days",   i: "🌴" },
          { l: "Wellbeing",     v: "4.2 / 5",   i: "❤️" },
        ].map(s => (
          <div key={s.l} style={{ background: "var(--hl)", borderRadius: 10, padding: "10px 12px", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 17, marginBottom: 2 }}>{s.i}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{s.v}</div>
            <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 1 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Photo + Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, marginBottom: "var(--gap)" }}>
        <Card title="Photo">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            {/* Photo hover — properly wired to parent */}
            <div style={{ position: "relative", cursor: "pointer" }}
              onMouseEnter={() => setPhotoHover(true)} onMouseLeave={() => setPhotoHover(false)}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg,#1D3461,#0F2041)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "white", fontWeight: 800 }}>YM</div>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(0,0,0,0.45)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, opacity: photoHover ? 1 : 0, transition: "opacity 0.2s" }}>
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

      {/* Wellbeing Pulse */}
      <div style={{ marginBottom: "var(--gap)" }}><WellbeingPulse /></div>

      {/* Upcoming events */}
      <Card title="Upcoming Events & Reminders">
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {[
            { d: "Dec 31, 2025", label: "Contract Expiry",             i: "📋", color: "amber" },
            { d: "Mar 2025",     label: "HEAT Cert Renewal Due",        i: "🏅", color: "amber" },
            { d: "Aug 2025",     label: "Annual Performance Review",    i: "📊", color: "blue"  },
            { d: "Jan 2026",     label: "5-Year Service Milestone 🎉",  i: "🏆", color: "green" },
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

      {/* Checklist — clickable jump links */}
      <Card title="Section Completion — click any row to jump">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {NAV.map(s => {
            const pct = COMPLETENESS[s.id];
            return (
              <button key={s.id} type="button" onClick={() => onJump(s.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, background: "var(--hl)", border: "1px solid var(--border)", cursor: "pointer", textAlign: "left" }}>
                <Dot pct={pct} />
                <span style={{ fontSize: 11, flex: 1, color: "var(--text)" }}>{s.icon} {s.label}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: pct === 100 ? "var(--c-green-fg)" : pct === 0 ? "var(--faint)" : "var(--c-amber-fg)" }}>{pct}%</span>
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
          <Field label="System Role"     value="FOM (Field Ops Manager)"  editable />
          <Field label="Department"      value="Field Operations"          editable />
          <Field label="Reports To"      value="Ahmed Hassan (Senior PM)"  editable />
          <Field label="Employment Type" value="Full-time"                 editable />
          <Field label="Working Pattern" value="On-site"                   editable />
        </Grid3>
      </Card>
      <Card title="Contract Details" ts={TIMESTAMPS.employment} action={<Btn label="✎ Edit" color="gray" />}>
        <Grid3>
          <Field label="Contract Type"  value="Salary"          editable />
          <Field label="Start Date"     value="Jan 15, 2023"    />
          <Field label="End Date"       value="Dec 31, 2025"    required editable />
          <Field label="Probation End"  value="Apr 15, 2023"    />
          <Field label="Employee ID"    value="PACT-FOM-0042"   sensitive />
          <Field label="Schedule"       value="Standard 40h/wk" editable />
        </Grid3>
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Tag label="✅ Probation Confirmed" color="green" />
          <div style={{ flex: 1 }} />
          <div style={{ padding: "7px 12px", background: "var(--c-amber-bg)", borderRadius: 8, border: "1px solid var(--c-amber-fg)", fontSize: 11, color: "var(--c-amber-fg)", display: "flex", alignItems: "center", gap: 8 }}>
            ⚠️ Expires in <strong>164 days</strong>
            <button type="button" style={{ fontSize: 11, fontWeight: 700, color: "white", background: "#1D3461", border: "none", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}>
              Start Renewal →
            </button>
          </div>
        </div>
      </Card>
      <Card title="Org Chart — Reporting Structure"><OrgChart /></Card>
      <Card title="Career Path & Succession">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ padding: "10px 12px", background: "var(--hl)", borderRadius: 10, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--faint)", textTransform: "uppercase", marginBottom: 6 }}>Target Role</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>Senior Programme Manager</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Expected: Q2 2026 · Readiness: 70%</div>
            <div style={{ marginTop: 8, height: 5, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ height: "100%", background: "var(--navy)", width: "70%" }} />
            </div>
          </div>
          <div style={{ padding: "10px 12px", background: "var(--hl)", borderRadius: 10, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--faint)", textTransform: "uppercase", marginBottom: 6 }}>Successor for This Role</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Omar Nour (Coordinator)</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Readiness: 45% · Under mentorship</div>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>Development Plan</div>
          {[
            { task: "Complete Advanced PM Certification",       done: true  },
            { task: "Lead 2 multi-sector assessments",          done: true  },
            { task: "Attend Senior Leadership Programme",       done: false },
            { task: "Manage full programme cycle independently",done: false },
          ].map(t => (
            <div key={t.task} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
              <span>{t.done ? "✅" : "⬜"}</span>
              <span style={{ fontSize: 12, color: t.done ? "var(--faint)" : "var(--text)", textDecoration: t.done ? "line-through" : "none" }}>{t.task}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Onboarding Status" badge={<Tag label="9/10 Complete" color="green" />}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
          {["Profile Created","Role Assigned","Dept Set","Contract Set","Salary Config","Bank Account","Employee ID","Documents","Personal Info","Education"].map((s, i) => (
            <div key={s} style={{ textAlign: "center", padding: "7px 4px", background: i === 7 ? "var(--c-amber-bg)" : "var(--c-green-bg)", border: `1px solid ${i === 7 ? "var(--c-amber-fg)" : "var(--c-green-fg)"}22`, borderRadius: 8 }}>
              <div style={{ fontSize: 14, marginBottom: 2 }}>{i === 7 ? "⚠️" : "✅"}</div>
              <div style={{ fontSize: 9, color: "var(--text)", lineHeight: 1.3 }}>{s}</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function PersonalSection() {
  return (
    <>
      <Card title="Identity" ts={TIMESTAMPS.personal} action={<Btn label="✎ Edit" color="gray" />}>
        <Grid3>
          <Field label="Date of Birth"  value="March 12, 1988"   editable />
          <Field label="Gender"         value="Male"              editable />
          <Field label="Nationality"    value="Sudanese"          editable />
          <Field label="Marital Status" value="Married"           editable />
          <Field label="Blood Type"     value="O+"                editable />
          <Field label="Personal ID"    value="SUD-198803-42819"  sensitive editable />
        </Grid3>
      </Card>
      <Card title="Passport" ts={TIMESTAMPS.personal} action={<Btn label="✎ Edit" color="gray" />}>
        <Grid3>
          <Field label="Passport No."  value="SD1928374"  sensitive editable />
          <Field label="Issue Date"    value="Jun 2019"   editable />
          <Field label="Expiry"        value="Jun 30, 2027" editable />
          <Field label="Issue Country" value="Sudan"      editable />
        </Grid3>
      </Card>
      <Card title="Home Address" ts={TIMESTAMPS.personal} action={<Btn label="✎ Edit" color="gray" />}>
        <Grid3>
          <Field label="Address Line 1" value="Block 14, House 7"          editable />
          <Field label="Neighbourhood"  value="Al Riyadh"                  editable />
          <Field label="City"           value="Khartoum"                   editable />
          <Field label="Country"        value="Sudan"                      editable />
        </Grid3>
      </Card>
      <Card title="Emergency Contact" ts={TIMESTAMPS.personal} action={<Btn label="✎ Edit" color="gray" />}>
        <Grid3>
          <Field label="Contact Name" value="Fatima Omar"               editable />
          <Field label="Relationship" value="Spouse"                    editable />
          <Field label="Phone"        value="+249 912 345 678"          sensitive editable />
          <Field label="Email"        value="fatima.omar@gmail.com"     sensitive editable />
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
          <Field label="Primary Hub"    value="Khartoum HQ"      editable />
          <Field label="Secondary Hub"  value="Kassala Field"     editable />
          <Field label="State"          value="Khartoum State"    editable />
          <Field label="Locality"       value="Khartoum District" editable />
          <Field label="Work Location"  value="On-site"           editable />
          <Field label="Assigned Since" value="Jan 15, 2023"      />
        </Grid3>
      </Card>
      <Card title="GPS Location Data">
        <Grid3>
          <Field label="Latitude"       value="15.5007° N" />
          <Field label="Longitude"      value="32.5599° E" />
          <Field label="Accuracy"       value="±12 m" />
          <Field label="Sharing Status" value="Enabled" />
          <Field label="Last Updated"   value="Today 09:14" />
          <Field label="Device"         value="Samsung Galaxy A54" />
        </Grid3>
        <div style={{ marginTop: 10, borderRadius: 8, background: "var(--c-green-bg)", border: `1px solid var(--c-green-fg)33`, padding: "7px 12px", fontSize: 11, color: "var(--c-green-fg)" }}>
          📡 Location sharing active · Last ping 14 min ago
        </div>
      </Card>
      <Card title="Transfer / Mobility History">
        {[
          { from: "Kassala Field Base", to: "Khartoum HQ",       date: "Jan 2024", reason: "Role change to FOM",    type: "transfer"   },
          { from: "Gedaref Hub",        to: "Kassala Field Base", date: "Jun 2022", reason: "Operational need",      type: "temporary"  },
          { from: "Khartoum HQ",        to: "Gedaref Hub",        date: "Mar 2021", reason: "Project assignment",    type: "assignment" },
        ].map((t, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 8, background: "var(--hl)", border: "1px solid var(--border)", marginBottom: 6 }}>
            <span>🔄</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{t.from} → {t.to}</div>
              <div style={{ fontSize: 10, color: "var(--faint)" }}>{t.date} · {t.reason}</div>
            </div>
            <Tag label={t.type} color={t.type === "transfer" ? "blue" : t.type === "temporary" ? "amber" : "green"} />
          </div>
        ))}
      </Card>
    </>
  );
}

function EducationSection() {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>🎓 Education</span>
        <Btn label="+ Add" color="navy" />
      </div>
      {[
        { d: "Bachelor of Business Administration", s: "University of Khartoum", y: "2010" },
        { d: "High School Certificate",             s: "Al-Ahfad Academy",       y: "2006" },
      ].map(e => (
        <div key={e.d} style={{ display: "flex", gap: 12, padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--navyBg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🎓</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{e.d}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{e.s} · {e.y}</div>
          </div>
          <Btn label="Edit" color="gray" />
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, marginTop: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>💼 Work Experience</span>
        <Btn label="+ Add" color="navy" />
      </div>
      {[
        { t: "Field Operations Manager", o: "UNHCR Sudan",       f: "2020", to: "Present", cur: true,  loc: "Khartoum" },
        { t: "Program Coordinator",      o: "IRC International", f: "2016", to: "2020",    cur: false, loc: "Juba, S. Sudan" },
        { t: "Field Officer",            o: "Save the Children", f: "2012", to: "2016",    cur: false, loc: "Darfur" },
      ].map(e => (
        <div key={e.t} style={{ display: "flex", gap: 12, padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--c-blue-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>💼</div>
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
  const [locked, setLocked] = useState(false);
  const [filter, setFilter] = useState("All");
  const openPreview = useContext(DocPreviewCtx);
  const docs = [
    { type: "🪪 National ID",    name: "national_id_scan.pdf",  size: "1.2 MB", date: "Mar 2024", expiry: null,       v: "verified" },
    { type: "🛂 Passport",        name: "passport_copy.pdf",     size: "2.4 MB", date: "Mar 2024", expiry: "Jun 2027", v: "verified" },
    { type: "📷 Staff Photo",     name: "photo_official.jpg",    size: "340 KB", date: "Jan 2023", expiry: null,       v: "verified" },
    { type: "📄 CV / Resume",     name: "cv_2024.pdf",           size: "450 KB", date: "Feb 2024", expiry: null,       v: "verified" },
    { type: "🎓 Bachelor Degree", name: "bsc_certificate.pdf",   size: "3.1 MB", date: "Mar 2024", expiry: null,       v: "pending"  },
    { type: "📋 Work Permit",     name: "work_permit_2024.pdf",  size: "1.8 MB", date: "Jan 2024", expiry: "Dec 2024", v: "rejected" },
  ];
  const filtered = filter === "All" ? docs : docs.filter(d => d.v === filter.toLowerCase());
  const vm: Record<string,[string,string,string]> = {
    verified: ["var(--c-green-bg)","var(--c-green-fg)","✅ Verified"],
    pending:  ["var(--c-amber-bg)","var(--c-amber-fg)","⏳ Pending"],
    rejected: ["var(--c-red-bg)",  "var(--c-red-fg)",  "❌ Expired"],
  };
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        {/* Filter chips */}
        <div style={{ display: "flex", gap: 5 }}>
          {["All","Verified","Pending","Rejected"].map(f => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              style={{ fontSize: 11, fontWeight: 600, padding: "4px 11px", borderRadius: 999, border: "1px solid var(--border)", cursor: "pointer", background: filter === f ? "var(--navy)" : "var(--hl)", color: filter === f ? "white" : "var(--muted)" }}>
              {f}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn label={locked ? "🔓 Unlock" : "🔒 Lock Vault"} color="gray" onClick={() => setLocked(v => !v)} />
          <Btn label="+ Upload" color="navy" />
        </div>
      </div>
      <Card title={`HR Documents (${filtered.length})`} badge={<Tag label={`${docs.filter(d=>d.v==="verified").length} verified`} color="green" />}
        locked={locked} onLock={() => setLocked(v => !v)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map(d => {
            const [bg, fg, vlabel] = vm[d.v];
            return (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--hl)" }}>
                <span style={{ fontSize: 16 }}>{d.type.split(" ")[0]}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{d.type.split(" ").slice(1).join(" ")}</div>
                  <div style={{ fontSize: 10, color: "var(--faint)" }}>{d.name} · {d.size}{d.expiry ? ` · Exp. ${d.expiry}` : ""}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: bg, color: fg }}>{vlabel}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <Btn label="View" color="gray" onClick={() => openPreview(d.type.split(" ").slice(1).join(" "))} />
                  <Btn label="⬇" color="gray" />
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
            <Btn label="View" color="gray" onClick={() => openPreview(c.name)} />
          </div>
        ))}
      </Card>
    </>
  );
}

function SkillsSection() {
  const skills = [
    { name: "Project Management",   level: "Expert",       end: 14 },
    { name: "Data Analysis",        level: "Advanced",     end: 8  },
    { name: "Budget Management",    level: "Advanced",     end: 5  },
    { name: "Community Engagement", level: "Expert",       end: 11 },
    { name: "Report Writing",       level: "Advanced",     end: 7  },
    { name: "MS Office Suite",      level: "Expert",       end: 9  },
    { name: "GIS / Mapping",        level: "Intermediate", end: 3  },
  ];
  const lc: Record<string,[TagColor]> = {
    Expert: ["amber"], Advanced: ["purple"], Intermediate: ["blue"], Beginner: ["gray"],
  };
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>⚡ Skills</span>
        <Btn label="+ Add Skill" color="navy" />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 20 }}>
        {skills.map(s => (
          <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{s.name}</span>
            <Tag label={s.level} color={lc[s.level]?.[0] ?? "gray"} />
            <span title={`${s.end} endorsements`} style={{ fontSize: 10, color: "var(--navy)", fontWeight: 700 }}>+{s.end}</span>
            <span style={{ fontSize: 14, cursor: "pointer", color: "var(--faint)" }}>×</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>🌍 Languages</span>
        <Btn label="+ Add" color="navy" />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {[
          { name: "Arabic",  prof: "Native",        end: 4, color: "green"  as TagColor },
          { name: "English", prof: "Fluent",         end: 6, color: "blue"   as TagColor },
          { name: "French",  prof: "Conversational", end: 2, color: "amber"  as TagColor },
        ].map(l => (
          <div key={l.name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)" }}>
            <span>🌐</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{l.name}</span>
            <Tag label={l.prof} color={l.color} />
            <span style={{ fontSize: 10, color: "var(--navy)", fontWeight: 700 }}>+{l.end}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function TrainingSection() {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <Btn label="+ Add Certification" color="navy" />
      </div>
      <Card title="Certifications" badge={<Tag label="3 active" color="green" />}>
        {[
          { name: "HEAT Training",                  issuer: "UNDSS",         date: "Mar 2023", expiry: "Mar 2025", ok: true  },
          { name: "First Aid & Emergency Response", issuer: "Red Cross",     date: "Jun 2022", expiry: "Jun 2024", ok: false },
          { name: "Advanced Project Management",    issuer: "PMI",           date: "Nov 2021", expiry: null,       ok: true  },
          { name: "SPHERE Humanitarian Standards",  issuer: "UNHCR Academy", date: "Jan 2024", expiry: null,       ok: true  },
        ].map(c => (
          <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--hl)", marginBottom: 6 }}>
            <span style={{ fontSize: 18 }}>🏅</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{c.name}</div>
              <div style={{ fontSize: 10, color: "var(--faint)" }}>{c.issuer} · {c.date}{c.expiry ? ` · Exp ${c.expiry}` : " · No expiry"}</div>
            </div>
            <Tag label={c.ok ? "✅ Valid" : "⚠️ Expired"} color={c.ok ? "green" : "amber"} />
            <Btn label="Edit" color="gray" />
          </div>
        ))}
      </Card>
      <Card title="Training History">
        {[
          { name: "Field Security Level 3",    provider: "UNDSS",         dur: "3 days",  date: "Jan 2024" },
          { name: "Humanitarian Coordination", provider: "OCHA",          dur: "2 weeks", date: "Aug 2023" },
          { name: "Data Collection & ODK",     provider: "PACT Internal", dur: "1 day",   date: "May 2023" },
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
        {[
          { name: "Fatima Mohammed", rel: "Spouse",   dob: "Apr 5, 1990",  i: "👩" },
          { name: "Omar Mohammed",   rel: "Son",       dob: "Jun 2, 2014",  i: "👦" },
          { name: "Aisha Mohammed",  rel: "Daughter",  dob: "Sep 18, 2017", i: "👧" },
        ].map(d => (
          <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--hl)", marginBottom: 6 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--navyBg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{d.i}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{d.name}</div>
              <div style={{ fontSize: 11, color: "var(--faint)" }}>{d.rel} · DOB: {d.dob}</div>
            </div>
            <Btn label="Edit" color="gray" />
          </div>
        ))}
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
        {[
          { name: "Dell Latitude 5540", type: "Laptop",     sn: "DL5540-0042",  issued: "Jan 2023", i: "💻" },
          { name: "Samsung Galaxy A54", type: "Phone",      sn: "SM-A546B-0788",issued: "Mar 2023", i: "📱" },
          { name: "Garmin GPSMAP 67",   type: "GPS Device", sn: "GPM67-KH-09",  issued: "Nov 2023", i: "📡" },
        ].map(eq => (
          <div key={eq.sn} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--hl)", marginBottom: 6 }}>
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
      </Card>
    </>
  );
}

function PoliciesSection() {
  const policies = [
    { name: "Code of Conduct",           signed: "Jan 16, 2023", req: true,  ok: true  },
    { name: "Data Protection & Privacy", signed: "Jan 16, 2023", req: true,  ok: true  },
    { name: "Anti-Fraud & Corruption",   signed: "Jan 17, 2023", req: true,  ok: true  },
    { name: "Security Protocols 2024",   signed: "Feb 01, 2024", req: true,  ok: true  },
    { name: "Travel & Expense Policy",   signed: "Mar 10, 2023", req: false, ok: true  },
    { name: "IT Acceptable Use Policy",  signed: null,           req: true,  ok: false },
    { name: "Safeguarding & PSEA",       signed: null,           req: true,  ok: false },
  ];
  const signed = policies.filter(p => p.ok).length;
  return (
    <Card title="Policy Acknowledgements" badge={<Tag label={`${signed}/${policies.length}`} color={signed === policies.length ? "green" : "amber"} />}>
      {signed < policies.length && (
        <div style={{ padding: "7px 12px", background: "var(--c-amber-bg)", borderRadius: 8, marginBottom: 10, fontSize: 11, color: "var(--c-amber-fg)" }}>
          ⚠️ {policies.length - signed} mandatory polic{policies.length - signed === 1 ? "y requires" : "ies require"} signature
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {policies.map(p => (
          <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--hl)" }}>
            <span>📜</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{p.name}</div>
              <div style={{ fontSize: 10, color: "var(--faint)" }}>{p.signed ? `Signed ${p.signed}` : "Not yet signed"}{p.req && <span style={{ marginLeft: 6, color: "var(--c-red-fg)", fontWeight: 700 }}>• Required</span>}</div>
            </div>
            {p.ok ? <Tag label="✅ Signed" color="green" /> : <Btn label="Sign Now" color="navy" />}
          </div>
        ))}
      </div>
    </Card>
  );
}

function CompensationSection() {
  const anchors = [
    { label: "Salary", id: "comp-salary" },
    { label: "Bank",   id: "comp-bank"   },
    { label: "EOSB",   id: "comp-eosb"   },
    { label: "Advances",id: "comp-adv"   },
    { label: "Payslips",id: "comp-pay"   },
  ];
  const payslips = [
    { month: "Jun 2024", gross: "SDG 285,000", net: "SDG 261,500", status: "Paid" },
    { month: "May 2024", gross: "SDG 285,000", net: "SDG 261,500", status: "Paid" },
    { month: "Apr 2024", gross: "SDG 285,000", net: "SDG 248,750", status: "Paid" },
    { month: "Mar 2024", gross: "SDG 285,000", net: "SDG 261,500", status: "Paid" },
  ];
  return (
    <>
      <AnchorNav items={anchors} />
      <Card title="Salary Configuration" id="comp-salary" ts={TIMESTAMPS.compensation} action={<Btn label="✎ Edit" color="gray" />}>
        <Grid3>
          <Field label="Contract Type"       value="Salary"                  editable />
          <Field label="Classification"      value="Level B"                  editable />
          <Field label="Base Salary"         value="SDG 250,000 / month"     editable />
          <Field label="Transport Allowance" value="SDG 15,000"              editable />
          <Field label="Housing Allowance"   value="SDG 20,000"              editable />
          <Field label="Total Package"       value="SDG 285,000 / month"     />
        </Grid3>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>Salary History Chart</div>
          <SalaryChart />
        </div>
      </Card>
      <Card title="Bank Account" id="comp-bank" action={<Btn label="✎ Edit" color="gray" />}>
        <Grid3>
          <Field label="Bank Name"    value="Bank of Khartoum"    editable />
          <Field label="Account Name" value="Yousif A. Mohammed"  editable />
          <Field label="Account No."  value="•••• •••• 4821"      sensitive />
          <Field label="Branch"       value="Khartoum Main"       editable />
          <Field label="IBAN"         value="SD•••• •••• ••93"    sensitive />
        </Grid3>
      </Card>
      <Card title="EOSB / Gratuity" id="comp-eosb">
        <Grid3>
          <Field label="Years of Service" value="2 years 6 months" />
          <Field label="Accrued Gratuity" value="SDG 437,500" />
          <Field label="Formula"          value="21 days/yr (≤5yrs)" />
          <Field label="Day Rate"         value="SDG 8,333" />
          <Field label="Calc Date"        value="Jul 22, 2026" />
          <Field label="Projected (5yr)"  value="SDG 875,000" />
        </Grid3>
      </Card>
      <Card title="Salary Advances" id="comp-adv" badge={<Tag label="1 active" color="amber" />}>
        {[
          { amount: "SDG 50,000", issued: "Mar 2024", remaining: "SDG 25,000", monthly: "SDG 12,500", status: "Recovering" },
          { amount: "SDG 30,000", issued: "Sep 2023", remaining: "SDG 0",      monthly: "—",           status: "Recovered"  },
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
      <Card title="Payslip History" id="comp-pay" badge={<Btn label="⬇ All" color="gray" />}>
        {payslips.map(p => (
          <div key={p.month} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 8, background: "var(--hl)", border: "1px solid var(--border)", marginBottom: 6 }}>
            <span>📄</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{p.month}</div>
              <div style={{ fontSize: 10, color: "var(--faint)" }}>Gross {p.gross} · Net {p.net}</div>
            </div>
            <Tag label={p.status} color="green" />
            <Btn label="⬇ PDF" color="gray" />
          </div>
        ))}
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
  const w = 200, h = 50;
  const sparkMax = 5, sparkMin = 3;
  const pts = reviews.map((r, i) => {
    const x = (i / (reviews.length - 1)) * (w - 20) + 10;
    const y = h - 8 - ((r.rating - sparkMin) / (sparkMax - sparkMin)) * (h - 16);
    return `${x},${y}`;
  }).join(" ");
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: "var(--gap)" }}>
        {[
          { l: "Latest Rating", v: "4.5/5",  i: "⭐", c: "amber" as TagColor  },
          { l: "Tasks Done",    v: "42",      i: "✅", c: "green" as TagColor  },
          { l: "On-Time Rate",  v: "95%",     i: "⏱️", c: "blue"  as TagColor  },
          { l: "Workload",      v: "Medium",  i: "📊", c: "purple" as TagColor },
        ].map(k => (
          <div key={k.l} style={{ padding: "11px 12px", borderRadius: 10, background: `var(--c-${k.c}-bg)`, border: `1px solid var(--c-${k.c}-fg)22` }}>
            <div style={{ fontSize: 17, marginBottom: 3 }}>{k.i}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: `var(--c-${k.c}-fg)` }}>{k.v}</div>
            <div style={{ fontSize: 10, color: `var(--c-${k.c}-fg)`, opacity: 0.8, marginTop: 1 }}>{k.l}</div>
          </div>
        ))}
      </div>
      <Card title="Rating Trend (Last 4 Cycles)">
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width={w} height={h}>
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
            <span style={{ fontSize: 14, fontWeight: 800, color: r.rating >= 4.5 ? "var(--c-green-fg)" : "var(--c-blue-fg)" }}>⭐ {r.rating}</span>
            <Btn label="View" color="gray" />
          </div>
        ))}
      </Card>
    </>
  );
}

function BenefitsSection({ onLeaveRequest }: { onLeaveRequest: () => void }) {
  return (
    <>
      <Card title="Enrolled Benefits" badge={<Tag label="3 active" color="green" />}>
        {[
          { name: "Medical — Family Plan", provider: "National Health Co.", coverage: "SDG 500,000/yr", ok: true  },
          { name: "Life Insurance",        provider: "Sudanese Insurance",  coverage: "SDG 1,000,000",  ok: true  },
          { name: "Pension Contribution",  provider: "NSSF Sudan",          coverage: "8% of salary",   ok: true  },
          { name: "Dental & Vision",       provider: "National Health Co.", coverage: "SDG 50,000/yr",  ok: false },
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
      <Card title="Leave Balances" action={<Btn label="+ Request Leave" color="navy" onClick={onLeaveRequest} />}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {[
            { type: "Annual",     total: 21, left: 14 },
            { type: "Sick",       total: 10, left: 8  },
            { type: "Compassion", total: 3,  left: 3  },
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
        {[
          { type: "Annual Leave", from: "Mar 10", to: "Mar 17", days: 7, status: "Approved", approver: "Ahmed Hassan" },
          { type: "Sick Leave",   from: "Feb 5",  to: "Feb 6",  days: 2, status: "Approved", approver: "Ahmed Hassan" },
          { type: "Annual Leave", from: "Dec 24", to: "Jan 2",  days: 5, status: "Approved", approver: "Ahmed Hassan" },
          { type: "Annual Leave", from: "Aug 15", to: "Aug 15", days: 1, status: "Rejected", approver: "Ahmed Hassan" },
        ].map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 8, background: "var(--hl)", border: "1px solid var(--border)", marginBottom: 6 }}>
            <span>🌴</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{r.type} · {r.days} day{r.days !== 1 ? "s" : ""}</div>
              <div style={{ fontSize: 10, color: "var(--faint)" }}>{r.from} → {r.to} · {r.approver}</div>
            </div>
            <Tag label={r.status} color={r.status === "Approved" ? "green" : "red"} />
          </div>
        ))}
      </Card>
    </>
  );
}

function AccessSection() {
  return (
    <>
      <Card title="Active Sessions" badge={<Tag label="3 devices" color="blue" />}>
        {[
          { device: "Chrome / Windows 11",  ip: "196.1.15.40",  loc: "Khartoum", last: "Active now",      current: true  },
          { device: "Android App (v2.1.4)", ip: "196.1.15.44",  loc: "Khartoum", last: "Yesterday 14:30", current: false },
          { device: "Firefox / macOS",      ip: "41.67.100.22", loc: "Unknown",  last: "Jun 18, 09:00",   current: false },
        ].map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 8, border: `1px solid ${s.current ? "var(--c-blue-fg)33" : "var(--border)"}`, background: s.current ? "var(--c-blue-bg)" : "var(--hl)", marginBottom: 6 }}>
            <span>{s.device.includes("Android") ? "📱" : "💻"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{s.device}</div>
              <div style={{ fontSize: 10, color: "var(--faint)" }}>IP {s.ip} · {s.loc} · {s.last}</div>
            </div>
            {s.current ? <Tag label="● This session" color="green" /> : <Btn label="Revoke" color="red" />}
          </div>
        ))}
      </Card>
      <Card title="Role Assignments" action={<Btn label="✎ Edit" color="gray" />}>
        {[
          { role: "FOM (Field Ops Manager)", hub: "System-wide", primary: true  },
          { role: "Supervisor",              hub: "Khartoum HQ", primary: false },
          { role: "Data Collector",          hub: "Kassala",     primary: false },
        ].map(r => (
          <div key={r.role} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--hl)", marginBottom: 6 }}>
            <span>🔒</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{r.role}</div>
              <div style={{ fontSize: 10, color: "var(--faint)" }}>Scope: {r.hub}</div>
            </div>
            {r.primary ? <Tag label="Primary" color="blue" /> : <><Tag label="Additional" color="gray" /><Btn label="Remove" color="red" /></>}
          </div>
        ))}
        <button type="button" style={{ fontSize: 11, fontWeight: 600, color: "var(--navy)", background: "var(--navyBg)", border: "1px dashed var(--navy)", borderRadius: 8, padding: "7px", cursor: "pointer", width: "100%" }}>
          + Assign Additional Role
        </button>
      </Card>
      <Card title="Security Event Log">
        {[
          { action: "Login",          device: "Chrome / Windows", ip: "196.1.15.40",  time: "Today 09:02",    ok: true  },
          { action: "Login",          device: "Android App",      ip: "196.1.15.44",  time: "Yesterday 14:30",ok: true  },
          { action: "Failed Login",   device: "Unknown",          ip: "41.67.222.10", time: "Jun 20, 22:41",  ok: false },
          { action: "Password Reset", device: "Chrome / Windows", ip: "196.1.15.40",  time: "Jun 20, 08:15",  ok: true  },
        ].map((e, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--hl)", marginBottom: 6 }}>
            <span>{e.ok ? "✅" : "⚠️"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{e.action}</div>
              <div style={{ fontSize: 10, color: "var(--faint)" }}>{e.device} · {e.ip} · {e.time}</div>
            </div>
            <Tag label={e.ok ? "Success" : "Alert"} color={e.ok ? "green" : "amber"} />
          </div>
        ))}
      </Card>
      <Card title="Account Status" action={<Btn label="✎ Edit" color="gray" />}>
        <Grid3>
          <Field label="Status"         value="Active"       />
          <Field label="2FA Enabled"    value="Yes (TOTP)"   />
          <Field label="Last Password"  value="Jun 20, 2024" />
          <Field label="Sessions"       value="3 devices"    />
          <Field label="Email Verified" value="Yes"          />
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
        {[
          { system: "PACT Command Center",  user: "y.mohammed@pact-sd.org", status: "Active",    prov: "Jan 2023" },
          { system: "Microsoft 365",        user: "yousif.m@pactworld.org", status: "Active",    prov: "Jan 2023" },
          { system: "Zoom Meetings",        user: "yousif.pact@zoom.us",    status: "Active",    prov: "Feb 2023" },
          { system: "SharePoint",           user: "yousif.m@pactworld.org", status: "Active",    prov: "Jan 2023" },
          { system: "ODK Collect",          user: "y.mohammed.field",       status: "Suspended", prov: "Jun 2023" },
        ].map(a => (
          <div key={a.system} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--hl)", marginBottom: 6 }}>
            <span>🖥️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{a.system}</div>
              <div style={{ fontSize: 10, color: "var(--faint)" }}>{a.user} · {a.prov}</div>
            </div>
            <Tag label={a.status} color={a.status === "Active" ? "green" : "red"} />
            <Btn label={a.status === "Active" ? "Suspend" : "Reactivate"} color={a.status === "Active" ? "gray" : "green"} />
          </div>
        ))}
      </Card>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
        <Btn label="+ Provision Account" color="navy" />
      </div>
    </>
  );
}

function HRNotesSection() {
  const notes = [
    { author: "Ahmed Hassan", date: "Jun 18, 2024", category: "Performance", text: "Yousif demonstrated exceptional leadership during the Kassala emergency response. Recommend fast-tracking him for Level C classification in the upcoming cycle." },
    { author: "Sara (HR)",    date: "Mar 10, 2024", category: "Compliance",  text: "Work permit renewal initiated with MoL. Expect 4–6 week processing time. Employee advised to limit international travel." },
    { author: "System",       date: "Jan 2, 2024",  category: "Contract",    text: "Contract auto-renewed for 12 months effective Jan 1 2024. Signed addendum uploaded to Document Vault." },
  ];
  return (
    <>
      <div style={{ padding: "8px 12px", background: "var(--c-amber-bg)", borderRadius: 8, marginBottom: 10, fontSize: 12, color: "var(--c-amber-fg)" }}>
        🔒 HR Internal Notes — visible to HR Managers and Directors only
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <Btn label="+ Add Note" color="navy" />
      </div>
      {notes.map((n, i) => (
        <div key={i} style={{ background: "var(--surface)", borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden", marginBottom: 10 }}>
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
    </>
  );
}

function ActivityLogSection() {
  const [actorFilter, setActorFilter] = useState("All");
  const log = [
    { who: "System",        action: "Profile last active",             field: "",                  time: "Today 09:14",    icon: "🟢", type: "System"   },
    { who: "Ahmed Hassan",  action: "Updated Employment — Reports To", field: "→ Ahmed Hassan",    time: "Jun 15",         icon: "✏️", type: "HR"       },
    { who: "HR Admin",      action: "Uploaded document",               field: "Work Permit 2024",  time: "Jun 20",         icon: "📄", type: "HR"       },
    { who: "Payroll Admin", action: "Updated salary — Level B",        field: "SDG 250,000/mo",    time: "Jan 2024",       icon: "💰", type: "Payroll"  },
    { who: "IT Admin",      action: "Provisioned account",             field: "ODK Collect",       time: "Jun 2023",       icon: "🖥️", type: "IT"       },
    { who: "Ahmed Hassan",  action: "Submitted performance review",    field: "Q1 2024 · 4.5★",   time: "Apr 2024",       icon: "📊", type: "HR"       },
    { who: "System",        action: "Contract auto-renewed",           field: "12 months",         time: "Jan 2, 2024",    icon: "📋", type: "System"   },
    { who: "Yousif M.",     action: "Uploaded document",               field: "CV 2024.pdf",       time: "Feb 2024",       icon: "📄", type: "Employee" },
    { who: "HR Admin",      action: "Signed policy",                   field: "Security Protocols",time: "Feb 2024",       icon: "📜", type: "HR"       },
    { who: "System",        action: "Employee ID assigned",            field: "PACT-FOM-0042",     time: "Jan 14, 2023",   icon: "🆔", type: "System"   },
  ];
  const actors = ["All", "System", "HR", "Payroll", "IT", "Employee"];
  const filtered = actorFilter === "All" ? log : log.filter(e => e.type === actorFilter);
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "var(--faint)" }}>Filter by:</span>
        {actors.map(a => (
          <button key={a} type="button" onClick={() => setActorFilter(a)}
            style={{ fontSize: 11, fontWeight: 600, padding: "4px 11px", borderRadius: 999, border: "1px solid var(--border)", cursor: "pointer", background: actorFilter === a ? "var(--navy)" : "var(--hl)", color: actorFilter === a ? "white" : "var(--muted)" }}>
            {a}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <Btn label="Export Log" color="gray" />
      </div>
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: 19, top: 0, bottom: 0, width: 2, background: "var(--border)" }} />
        {filtered.map((e, i) => (
          <div key={i} style={{ display: "flex", gap: 12, paddingBottom: 12, position: "relative" }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--surface)", border: "2px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0, zIndex: 1 }}>{e.icon}</div>
            <div style={{ flex: 1, background: "var(--surface)", borderRadius: 10, border: "1px solid var(--border)", padding: "9px 13px", marginTop: 2 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
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
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function UnifiedProfile() {
  const [active, setActive] = useState("overview");
  const [dark, setDark] = useState(false);
  const [compact, setCompact] = useState(false);
  const [cvOpen, setCvOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [alerts, setAlerts] = useState(GLOBAL_ALERTS);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [badgeOpen, setBadgeOpen] = useState(false);
  const [docPreview, setDocPreview] = useState<string | null>(null);
  const [leaveModal, setLeaveModal] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const showToast: ToastFn = (msg, type = "success") => {
    setToast({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearchOpen(true); }
      if (e.key === "Escape") { setSearchOpen(false); setCvOpen(false); setBadgeOpen(false); setDocPreview(null); setLeaveModal(false); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const overall = Math.round(Object.values(COMPLETENESS).reduce((a, b) => a + b, 0) / Object.keys(COMPLETENESS).length);

  const cssVars = {
    "--bg": dark ? "#0f172a" : "#f8f9fc",
    "--surface": dark ? "#1e293b" : "#ffffff",
    "--border": dark ? "#334155" : "#f3f4f6",
    "--text": dark ? "#f1f5f9" : "#111827",
    "--muted": dark ? "#94a3b8" : "#6b7280",
    "--faint": dark ? "#64748b" : "#9ca3af",
    "--navy": dark ? "#60a5fa" : "#1D3461",
    "--navyBg": dark ? "#1e3a5f" : "#eef2ff",
    "--hl": dark ? "#1e293b" : "#f9fafb",
    "--gap": compact ? "8px" : "14px",
    "--c-green-bg": dark ? "#14532d" : "#dcfce7",
    "--c-green-fg": dark ? "#4ade80" : "#166534",
    "--c-amber-bg": dark ? "#78350f" : "#fef3c7",
    "--c-amber-fg": dark ? "#fbbf24" : "#92400e",
    "--c-blue-bg": dark ? "#1e3a5f" : "#dbeafe",
    "--c-blue-fg": dark ? "#60a5fa" : "#1e40af",
    "--c-red-bg": dark ? "#7f1d1d" : "#fee2e2",
    "--c-red-fg": dark ? "#f87171" : "#991b1b",
    "--c-purple-bg": dark ? "#4c1d95" : "#f3e8ff",
    "--c-purple-fg": dark ? "#c084fc" : "#6b21a8",
    "--c-indigo-bg": dark ? "#312e81" : "#eef2ff",
    "--c-indigo-fg": dark ? "#818cf8" : "#3730a3",
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
      case "benefits":     return <BenefitsSection onLeaveRequest={() => setLeaveModal(true)} />;
      case "access":       return <AccessSection />;
      case "itaccounts":   return <ITAccountsSection />;
      case "hrnotes":      return <HRNotesSection />;
      case "activitylog":  return <ActivityLogSection />;
      default: return null;
    }
  };

  return (
    <ToastCtx.Provider value={showToast}>
      <DocPreviewCtx.Provider value={setDocPreview}>
        <div style={{ display: "flex", height: "100vh", fontFamily: "'Inter',-apple-system,sans-serif", background: "var(--bg)", overflow: "hidden", ...cssVars }}
          onClick={() => cvOpen && setCvOpen(false)}>

          {/* Overlays */}
          <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} onNavigate={id => { setActive(id); setSearchOpen(false); }} />
          {badgeOpen && <EmployeeBadgeModal onClose={() => setBadgeOpen(false)} />}
          {docPreview && <DocPreviewDrawer docName={docPreview} onClose={() => setDocPreview(null)} />}
          {leaveModal && <LeaveRequestModal onClose={() => setLeaveModal(false)} />}
          {toast && <Toast msg={toast.msg} type={toast.type} />}

          {/* ── SIDEBAR ────────────────────────────────────────────────────── */}
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
                    <span style={{ fontSize: 9, fontWeight: 700, color: overall >= 80 ? "var(--c-green-fg)" : "var(--c-amber-fg)" }}>{overall}%</span>
                  </div>
                  <div style={{ height: 4, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: overall >= 80 ? "var(--c-green-fg)" : "var(--c-amber-fg)", borderRadius: 99, width: `${overall}%` }} />
                  </div>
                </div>
              </div>
            )}

            <nav style={{ flex: 1, padding: compact ? "8px 4px" : "10px 6px", overflowY: "auto" }}>
              {GROUPS.map(group => (
                <div key={group} style={{ marginBottom: compact ? 8 : 12 }}>
                  {!compact && <div style={{ fontSize: 9, fontWeight: 700, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 8px", marginBottom: 2 }}>{group}</div>}
                  {NAV.filter(s => s.group === group).map(s => {
                    const isActive = active === s.id;
                    return (
                      <button key={s.id} type="button" onClick={() => setActive(s.id)} title={compact ? s.label : undefined}
                        style={{ display: "flex", alignItems: "center", gap: compact ? 0 : 6, justifyContent: compact ? "center" : "flex-start", width: "100%", padding: compact ? "8px 0" : "5px 8px", borderRadius: 7, border: "none", cursor: "pointer", background: isActive ? "var(--navyBg)" : "transparent", color: isActive ? "var(--navy)" : "var(--muted)", fontWeight: isActive ? 700 : 500, fontSize: 11.5, textAlign: "left" }}>
                        <span style={{ fontSize: compact ? 16 : 13 }}>{s.icon}</span>
                        {!compact && (
                          <>
                            <span style={{ flex: 1 }}>{s.label}</span>
                            {s.count > 0 && <span style={{ fontSize: 9, background: "var(--border)", borderRadius: 999, padding: "1px 5px", color: "var(--faint)", fontWeight: 700 }}>{s.count}</span>}
                            <Dot pct={COMPLETENESS[s.id]} />
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>

            <div style={{ padding: compact ? "8px 4px" : "8px 6px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 4 }}>
              {compact ? (
                <>
                  <button type="button" title="Send Email" style={{ padding: "8px 0", background: "none", border: "none", cursor: "pointer", fontSize: 16, textAlign: "center" }}>📧</button>
                  <button type="button" title="Signatures" style={{ padding: "8px 0", background: "none", border: "none", cursor: "pointer", fontSize: 16, textAlign: "center" }}>✍️</button>
                  <button type="button" title="Employee Badge" onClick={() => setBadgeOpen(true)} style={{ padding: "8px 0", background: "none", border: "none", cursor: "pointer", fontSize: 16, textAlign: "center" }}>🆔</button>
                  <button type="button" title="Offboard" style={{ padding: "8px 0", background: "none", border: "none", cursor: "pointer", fontSize: 16, textAlign: "center" }}>🚪</button>
                </>
              ) : (
                <>
                  <button type="button" style={{ fontSize: 11, fontWeight: 600, color: "var(--navy)", background: "var(--navyBg)", border: "none", borderRadius: 7, padding: "7px 0", cursor: "pointer" }}>📧 Send Email</button>
                  <button type="button" style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", background: "var(--hl)", border: "none", borderRadius: 7, padding: "7px 0", cursor: "pointer" }}>✍️ Signatures</button>
                  <button type="button" onClick={() => setBadgeOpen(true)} style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", background: "var(--hl)", border: "none", borderRadius: 7, padding: "7px 0", cursor: "pointer" }}>🆔 Employee Badge</button>
                  <button type="button" style={{ fontSize: 11, fontWeight: 600, color: "var(--c-red-fg)", background: "var(--c-red-bg)", border: "none", borderRadius: 7, padding: "7px 0", cursor: "pointer" }}>🚪 Offboard</button>
                </>
              )}
            </div>
          </div>

          {/* ── MAIN ─────────────────────────────────────────────────────── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Top bar */}
            <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "10px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button type="button" style={{ fontSize: 12, color: "var(--faint)", background: "none", border: "none", cursor: "pointer" }}>← HR / Users</button>
                <span style={{ color: "var(--border)" }}>|</span>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Yousif Mohammed</span>
                  <span style={{ fontSize: 11, color: "var(--faint)", marginLeft: 8 }}>
                    {NAV.find(s => s.id === active)?.icon} {NAV.find(s => s.id === active)?.label}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" onClick={() => setSearchOpen(true)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "var(--hl)", border: "1px solid var(--border)", borderRadius: 7, cursor: "pointer", color: "var(--faint)", fontSize: 11 }}>
                  🔍 Search <span style={{ fontSize: 10, background: "var(--border)", borderRadius: 4, padding: "1px 5px" }}>⌘K</span>
                </button>
                <button type="button" onClick={() => setCompact(v => !v)} title={compact ? "Full view" : "Compact"}
                  style={{ padding: "5px 8px", background: compact ? "var(--navyBg)" : "var(--hl)", border: "1px solid var(--border)", borderRadius: 7, cursor: "pointer", fontSize: 13 }}>
                  {compact ? "⊞" : "⊟"}
                </button>
                <button type="button" onClick={() => setDark(v => !v)} title={dark ? "Light" : "Dark"}
                  style={{ padding: "5px 8px", background: "var(--hl)", border: "1px solid var(--border)", borderRadius: 7, cursor: "pointer", fontSize: 13 }}>
                  {dark ? "☀️" : "🌙"}
                </button>
                <button type="button" style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", background: "var(--hl)", border: "1px solid var(--border)", borderRadius: 7, padding: "5px 11px", cursor: "pointer" }}>
                  📂 Sync Dossier
                </button>
                <button type="button" style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", background: "var(--hl)", border: "1px solid var(--border)", borderRadius: 7, padding: "5px 11px", cursor: "pointer" }}>
                  🖨️ Print Profile
                </button>
                <div style={{ position: "relative" }}>
                  <button type="button" onClick={e => { e.stopPropagation(); setCvOpen(v => !v); }}
                    style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", background: "var(--hl)", border: "1px solid var(--border)", borderRadius: 7, padding: "5px 11px", cursor: "pointer" }}>
                    📄 Export CV ▾
                  </button>
                  <CVMenu open={cvOpen} onClose={() => setCvOpen(false)} />
                </div>
                <button type="button" style={{ fontSize: 12, fontWeight: 700, color: "white", background: "var(--navy)", border: "none", borderRadius: 7, padding: "6px 13px", cursor: "pointer" }}>
                  ✎ Edit Profile
                </button>
              </div>
            </div>

            {/* Alert bar */}
            <AlertBar alerts={alerts} onNavigate={id => setActive(id)} onDismiss={id => setAlerts(prev => prev.filter(a => a.id !== id))} />

            {/* Section timestamp */}
            {TIMESTAMPS[active] && (
              <div style={{ padding: "4px 20px", background: "var(--hl)", borderBottom: "1px solid var(--border)", fontSize: 10, color: "var(--faint)", display: "flex", justifyContent: "flex-end" }}>
                Last edited: {TIMESTAMPS[active]}
              </div>
            )}

            {/* Content */}
            <div style={{ flex: 1, overflowY: "auto", padding: compact ? "12px 16px" : "16px 20px" }}>
              {renderContent()}
            </div>
          </div>
        </div>
      </DocPreviewCtx.Provider>
    </ToastCtx.Provider>
  );
}
