import { useState } from "react";

const NAV = [
  { icon: "⊞", label: "Dashboard", sub: "Overview" },
  { icon: "📋", label: "MMP Management", sub: "8 active cycles" },
  { icon: "💰", label: "Cost Submission", sub: "3 pending" },
  { icon: "📊", label: "Finance Hub", sub: "Budget tracker" },
  { icon: "👥", label: "Staff Directory", sub: "HR & payroll" },
  { icon: "🔔", label: "Notifications", sub: "5 unread", badge: 5 },
  { icon: "⚙️", label: "Settings", sub: "System config" },
];

export function GlassmorphOverlay() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
        overflow: "hidden",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Background decorations */}
      <div style={{
        position: "absolute",
        top: -100,
        right: -100,
        width: 400,
        height: 400,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute",
        bottom: -100,
        left: 100,
        width: 300,
        height: 300,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Overlay backdrop */}
      <div
        onClick={() => setOpen(false)}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          backdropFilter: open ? "blur(4px)" : "none",
          opacity: open ? 1 : 0,
          transition: "opacity 0.3s ease, backdrop-filter 0.3s ease",
          pointerEvents: open ? "auto" : "none",
          zIndex: 10,
        }}
      />

      {/* Glass Sidebar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          width: 280,
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)",
          zIndex: 20,
          background: "rgba(15, 20, 40, 0.75)",
          backdropFilter: "blur(24px) saturate(180%)",
          borderRight: "1px solid rgba(255,255,255,0.1)",
          boxShadow: open ? "8px 0 40px rgba(0,0,0,0.5), inset -1px 0 0 rgba(255,255,255,0.05)" : "none",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "20px 20px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              boxShadow: "0 4px 16px rgba(99,102,241,0.5)",
            }}>P</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.3px" }}>PACT</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "1px", textTransform: "uppercase" }}>Command Center</div>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.6)",
              width: 28,
              height: 28,
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 14,
            }}
          >✕</button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 12px", overflowY: "auto" }}>
          <div style={{ fontSize: 10, letterSpacing: "1px", color: "rgba(255,255,255,0.25)", padding: "4px 8px 8px", textTransform: "uppercase" }}>
            Navigation
          </div>
          {NAV.map((item, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                gap: 12,
                border: active === i ? "1px solid rgba(99,102,241,0.3)" : "1px solid transparent",
                cursor: "pointer",
                marginBottom: 4,
                background: active === i
                  ? "rgba(99,102,241,0.15)"
                  : "rgba(255,255,255,0.03)",
                color: active === i ? "#a5b4fc" : "rgba(255,255,255,0.55)",
                transition: "all 0.18s ease",
                textAlign: "left",
              }}
            >
              <span style={{ fontSize: 18, width: 24, textAlign: "center" }}>{item.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: active === i ? 600 : 400 }}>{item.label}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginTop: 1 }}>{item.sub}</div>
              </div>
              {item.badge && (
                <span style={{
                  background: "rgba(99,102,241,0.8)",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: 10,
                }}>
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div style={{
          padding: 16,
          borderTop: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(0,0,0,0.15)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #f59e0b, #ef4444)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
              color: "#fff",
              boxShadow: "0 2px 8px rgba(245,158,11,0.4)",
            }}>SA</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>Super Admin</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>admin@pact.org</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{
        position: "relative",
        zIndex: 1,
        padding: 24,
        color: "#f1f5f9",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button
            onClick={() => setOpen(true)}
            style={{
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#fff",
              width: 40,
              height: 40,
              borderRadius: 10,
              cursor: "pointer",
              fontSize: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s",
            }}
          >☰</button>
          <span style={{ fontSize: 16, fontWeight: 600, opacity: 0.9 }}>PACT Command Center</span>
        </div>

        <div style={{
          background: "rgba(255,255,255,0.04)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16,
          padding: 20,
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>② Glassmorphism Overlay</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
            Sidebar slides in <em>over</em> content via <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>translateX</code> with a backdrop blur overlay.
            Uses frosted glass: <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>backdrop-filter: blur(24px)</code>.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { label: "Total Sites", value: "2,847", color: "#6366f1" },
            { label: "Coverage", value: "67%", color: "#10b981" },
            { label: "Pending", value: "341", color: "#f59e0b" },
            { label: "Completed", value: "1,902", color: "#3b82f6" },
          ].map(c => (
            <div key={c.label} style={{
              background: "rgba(255,255,255,0.04)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12,
              padding: "16px",
            }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>{c.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
