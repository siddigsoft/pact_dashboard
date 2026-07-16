import { useState } from "react";

const NAV = [
  { icon: "⊞", label: "Dashboard" },
  { icon: "📋", label: "MMP Management" },
  { icon: "💰", label: "Cost Submission" },
  { icon: "📊", label: "Finance Hub" },
  { icon: "👥", label: "Staff Directory" },
  { icon: "📅", label: "Calendar" },
  { icon: "🔔", label: "Notifications", badge: 5 },
  { icon: "⚙️", label: "Settings" },
];

export function SlideCollapse() {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(0);

  return (
    <div className="flex h-screen bg-[#0f1117] text-white font-sans overflow-hidden">
      {/* Sidebar */}
      <div
        style={{
          width: open ? 240 : 64,
          transition: "width 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
          flexShrink: 0,
          overflow: "hidden",
          borderRight: "1px solid rgba(255,255,255,0.07)",
          background: "linear-gradient(180deg, #1a1d27 0%, #141720 100%)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Logo */}
        <div
          style={{
            height: 60,
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              flexShrink: 0,
              boxShadow: "0 4px 12px rgba(99,102,241,0.4)",
            }}
          >
            P
          </div>
          <span
            style={{
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: "-0.3px",
              whiteSpace: "nowrap",
              opacity: open ? 1 : 0,
              transition: "opacity 0.2s ease",
              color: "#f1f1f5",
            }}
          >
            PACT Command
          </span>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 8px", overflow: "hidden" }}>
          {NAV.map((item, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                height: 40,
                borderRadius: 8,
                padding: "0 10px",
                gap: 10,
                border: "none",
                cursor: "pointer",
                marginBottom: 2,
                background: active === i
                  ? "linear-gradient(90deg, rgba(99,102,241,0.25) 0%, rgba(99,102,241,0.08) 100%)"
                  : "transparent",
                color: active === i ? "#a5b4fc" : "rgba(255,255,255,0.5)",
                transition: "all 0.18s ease",
                position: "relative",
                overflow: "hidden",
                whiteSpace: "nowrap",
              }}
            >
              {active === i && (
                <div style={{
                  position: "absolute",
                  left: 0,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 3,
                  height: 20,
                  borderRadius: "0 3px 3px 0",
                  background: "#6366f1",
                }} />
              )}
              <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: active === i ? 600 : 400,
                  flex: 1,
                  textAlign: "left",
                  opacity: open ? 1 : 0,
                  transition: "opacity 0.2s ease",
                }}
              >
                {item.label}
              </span>
              {item.badge && open && (
                <span style={{
                  background: "#6366f1",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 10,
                  opacity: open ? 1 : 0,
                  transition: "opacity 0.2s ease",
                }}>
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* User */}
        <div style={{
          padding: "12px 8px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
          overflow: "hidden",
        }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #f59e0b, #ef4444)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
          }}>
            SA
          </div>
          <div style={{
            opacity: open ? 1 : 0,
            transition: "opacity 0.2s ease",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#f1f1f5" }}>Super Admin</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>admin@pact.org</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{
          height: 60,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: 12,
          background: "#141720",
        }}>
          <button
            onClick={() => setOpen(!open)}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "none",
              color: "#fff",
              width: 32,
              height: 32,
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s",
            }}
          >
            {open ? "←" : "→"}
          </button>
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
            PACT Command Center
          </span>
        </div>
        <div style={{ flex: 1, padding: 24, background: "#0f1117" }}>
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12,
            padding: 20,
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: "#f1f1f5" }}>
              ① Smooth Slide Collapse
            </div>
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, lineHeight: 1.6 }}>
              Width animates via <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>cubic-bezier(0.4, 0, 0.2, 1)</code> — Material-style ease.
              Collapses to a 64px icon rail. Text/badges fade out independently.
              No JS animation library needed.
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {["MMP Overview", "Cost Reports", "Field Staff", "Analytics"].map(t => (
              <div key={t} style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 8,
                padding: 16,
              }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>{t}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#6366f1" }}>
                  {Math.floor(Math.random() * 900 + 100)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
