import { useState, useEffect, useRef } from "react";

const NAV = [
  { icon: "⊞", label: "Dashboard", color: "#6366f1" },
  { icon: "📋", label: "MMP Management", color: "#8b5cf6" },
  { icon: "💰", label: "Cost Submission", color: "#06b6d4" },
  { icon: "📊", label: "Finance Hub", color: "#10b981" },
  { icon: "👥", label: "Staff Directory", color: "#f59e0b" },
  { icon: "📅", label: "Calendar", color: "#ec4899" },
  { icon: "🔔", label: "Notifications", color: "#f97316", badge: 5 },
  { icon: "⚙️", label: "Settings", color: "#64748b" },
];

// CSS spring easing that mimics GSAP's elastic.out
const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

export function SpringBounce() {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(0);
  const [ripple, setRipple] = useState<{ id: number; x: number; y: number } | null>(null);
  const rippleRef = useRef(0);

  const handleNavClick = (i: number, e: React.MouseEvent<HTMLButtonElement>) => {
    setActive(i);
    const rect = e.currentTarget.getBoundingClientRect();
    const id = ++rippleRef.current;
    setRipple({ id, x: e.clientX - rect.left, y: e.clientY - rect.top });
    setTimeout(() => setRipple(null), 600);
  };

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      background: "#f8fafc",
      fontFamily: "system-ui, sans-serif",
      overflow: "hidden",
    }}>
      {/* Sidebar */}
      <div style={{
        width: open ? 232 : 68,
        transition: `width 0.5s ${SPRING}`,
        flexShrink: 0,
        background: "#fff",
        borderRight: "1px solid #e8ecf0",
        boxShadow: "2px 0 20px rgba(0,0,0,0.05)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        zIndex: 10,
      }}>
        {/* Logo */}
        <div style={{
          height: 64,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          borderBottom: "1px solid #f1f5f9",
          gap: 10,
          flexShrink: 0,
        }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 16,
            fontWeight: 800,
            flexShrink: 0,
            boxShadow: "0 4px 12px rgba(99,102,241,0.35)",
            transition: `transform 0.5s ${SPRING}`,
            transform: open ? "scale(1)" : "scale(0.9)",
          }}>P</div>
          <span style={{
            fontWeight: 700,
            fontSize: 14,
            color: "#1e293b",
            whiteSpace: "nowrap",
            opacity: open ? 1 : 0,
            transform: open ? "translateX(0)" : "translateX(-8px)",
            transition: `opacity 0.3s ease, transform 0.4s ${SPRING}`,
          }}>PACT Command</span>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "10px 8px", overflow: "hidden" }}>
          {NAV.map((item, i) => (
            <button
              key={i}
              onClick={(e) => handleNavClick(i, e)}
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                height: 42,
                borderRadius: 10,
                padding: "0 12px",
                gap: 10,
                border: "none",
                cursor: "pointer",
                marginBottom: 2,
                background: active === i ? `${item.color}15` : "transparent",
                color: active === i ? item.color : "#64748b",
                transition: `all 0.35s ${SPRING}`,
                transform: active === i ? "scale(1.02)" : "scale(1)",
                position: "relative",
                overflow: "hidden",
                whiteSpace: "nowrap",
              }}
            >
              {/* Ripple */}
              {ripple && active === i && (
                <div style={{
                  position: "absolute",
                  left: ripple.x - 30,
                  top: ripple.y - 30,
                  width: 60,
                  height: 60,
                  borderRadius: "50%",
                  background: `${item.color}30`,
                  animation: "ripple 0.6s ease-out forwards",
                  pointerEvents: "none",
                }} />
              )}

              <span style={{
                fontSize: 18,
                flexShrink: 0,
                transition: `transform 0.4s ${SPRING}`,
                transform: active === i ? "scale(1.15) rotate(-5deg)" : "scale(1) rotate(0deg)",
                display: "block",
              }}>
                {item.icon}
              </span>
              <span style={{
                fontSize: 13,
                fontWeight: active === i ? 600 : 400,
                flex: 1,
                textAlign: "left",
                opacity: open ? 1 : 0,
                transform: open ? "translateX(0)" : "translateX(-4px)",
                transition: `opacity 0.25s ease, transform 0.35s ${SPRING}`,
              }}>
                {item.label}
              </span>
              {item.badge && open && (
                <span style={{
                  background: item.color,
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 10,
                  opacity: open ? 1 : 0,
                  transform: open ? `scale(1)` : `scale(0)`,
                  transition: `all 0.4s ${SPRING}`,
                }}>
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Toggle button */}
        <div style={{
          padding: "12px 8px",
          borderTop: "1px solid #f1f5f9",
          flexShrink: 0,
        }}>
          <button
            onClick={() => setOpen(!open)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: open ? "flex-start" : "center",
              width: "100%",
              height: 38,
              borderRadius: 8,
              padding: "0 12px",
              gap: 10,
              border: "none",
              cursor: "pointer",
              background: "#f8fafc",
              color: "#94a3b8",
              transition: `all 0.4s ${SPRING}`,
              fontSize: 13,
            }}
          >
            <span style={{
              transition: `transform 0.5s ${SPRING}`,
              transform: open ? "rotate(0deg)" : "rotate(180deg)",
              display: "block",
              fontSize: 16,
            }}>
              ◀
            </span>
            {open && <span>Collapse</span>}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        <style>{`
          @keyframes ripple {
            from { transform: scale(0); opacity: 1; }
            to { transform: scale(4); opacity: 0; }
          }
        `}</style>

        <div style={{
          background: "#fff",
          border: "1px solid #e8ecf0",
          borderRadius: 14,
          padding: 20,
          marginBottom: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>
            ③ Spring Bounce
          </div>
          <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
            Uses <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>cubic-bezier(0.34, 1.56, 0.64, 1)</code> — this is the CSS equivalent of GSAP's <strong>elastic.out</strong> spring.
            Active items scale up, icons rotate, badges pop in. Click nav items to feel the spring.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { label: "Field Operations", val: "Active", color: "#10b981" },
            { label: "MMP Cycles", val: "12 open", color: "#6366f1" },
            { label: "Staff On Field", val: "247", color: "#f59e0b" },
            { label: "Coverage Rate", val: "73%", color: "#3b82f6" },
          ].map(c => (
            <div key={c.label} style={{
              background: "#fff",
              border: "1px solid #e8ecf0",
              borderRadius: 12,
              padding: 16,
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              transition: `transform 0.4s ${SPRING}`,
            }}>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>{c.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
