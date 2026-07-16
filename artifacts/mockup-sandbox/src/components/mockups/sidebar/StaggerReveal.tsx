import { useState, useEffect } from "react";

const NAV_GROUPS = [
  {
    group: "Core",
    items: [
      { icon: "⊞", label: "Dashboard", badge: null },
      { icon: "📋", label: "MMP Management", badge: 8 },
      { icon: "💰", label: "Cost Submission", badge: 3 },
    ]
  },
  {
    group: "Finance",
    items: [
      { icon: "📊", label: "Finance Hub", badge: null },
      { icon: "💳", label: "Down Payments", badge: null },
      { icon: "🏦", label: "Budget Planning", badge: null },
    ]
  },
  {
    group: "People",
    items: [
      { icon: "👥", label: "Staff Directory", badge: null },
      { icon: "📅", label: "Calendar", badge: null },
      { icon: "🔔", label: "Notifications", badge: 12 },
      { icon: "⚙️", label: "Settings", badge: null },
    ]
  },
];

export function StaggerReveal() {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState("Dashboard");
  const [mounted, setMounted] = useState(false);
  const [wasOpen, setWasOpen] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  const handleToggle = () => {
    setWasOpen(open);
    setOpen(o => !o);
  };

  // Flat index for stagger
  let idx = 0;

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      background: "#0d1117",
      fontFamily: "'Inter', system-ui, sans-serif",
      overflow: "hidden",
      color: "#e6edf3",
    }}>
      {/* Sidebar */}
      <div style={{
        width: open ? 252 : 0,
        opacity: open ? 1 : 0,
        transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease",
        flexShrink: 0,
        overflow: "hidden",
        background: "#161b22",
        borderRight: "1px solid #30363d",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Logo */}
        <div style={{
          padding: "16px 16px 12px",
          borderBottom: "1px solid #21262d",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "linear-gradient(135deg, #238636 0%, #2ea043 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            fontWeight: 700,
            color: "#fff",
            flexShrink: 0,
          }}>P</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#e6edf3" }}>PACT Command</div>
            <div style={{ fontSize: 10, color: "#8b949e", letterSpacing: "0.3px" }}>Field Operations Hub</div>
          </div>
        </div>

        {/* Nav Groups with staggered animation */}
        <nav style={{ flex: 1, padding: "8px 8px", overflowY: "auto" }}>
          {NAV_GROUPS.map((group) => (
            <div key={group.group} style={{ marginBottom: 8 }}>
              <div style={{
                fontSize: 10,
                letterSpacing: "1px",
                color: "#8b949e",
                padding: "8px 8px 4px",
                textTransform: "uppercase",
                fontWeight: 600,
              }}>
                {group.group}
              </div>
              {group.items.map((item) => {
                const i = idx++;
                const delay = open ? i * 40 : 0;
                return (
                  <button
                    key={item.label}
                    onClick={() => setActive(item.label)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      width: "100%",
                      height: 36,
                      borderRadius: 6,
                      padding: "0 8px",
                      gap: 8,
                      border: "none",
                      cursor: "pointer",
                      marginBottom: 1,
                      background: active === item.label ? "rgba(33,110,57,0.25)" : "transparent",
                      color: active === item.label ? "#3fb950" : "#8b949e",
                      transition: `background 0.15s, color 0.15s, opacity 0.3s ease ${delay}ms, transform 0.35s cubic-bezier(0.34, 1.4, 0.64, 1) ${delay}ms`,
                      opacity: mounted ? 1 : 0,
                      transform: mounted ? "translateX(0)" : "translateX(-12px)",
                      whiteSpace: "nowrap",
                      outline: active === item.label ? "1px solid rgba(35,134,54,0.4)" : "none",
                    }}
                  >
                    <span style={{ fontSize: 15, flexShrink: 0 }}>{item.icon}</span>
                    <span style={{
                      fontSize: 12,
                      fontWeight: active === item.label ? 600 : 400,
                      flex: 1,
                      textAlign: "left",
                    }}>
                      {item.label}
                    </span>
                    {item.badge && (
                      <span style={{
                        background: active === item.label ? "rgba(33,110,57,0.5)" : "rgba(139,148,158,0.15)",
                        color: active === item.label ? "#3fb950" : "#8b949e",
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "1px 6px",
                        borderRadius: 10,
                        border: active === item.label ? "1px solid rgba(35,134,54,0.4)" : "1px solid #30363d",
                        transition: `opacity 0.3s ease ${delay}ms`,
                        opacity: mounted ? 1 : 0,
                      }}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div style={{
          padding: "12px 12px",
          borderTop: "1px solid #21262d",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px",
            borderRadius: 6,
            background: "rgba(255,255,255,0.03)",
            cursor: "pointer",
          }}>
            <div style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #f59e0b, #ef4444)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              color: "#fff",
              flexShrink: 0,
            }}>SA</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#e6edf3" }}>Super Admin</div>
              <div style={{ fontSize: 10, color: "#8b949e" }}>admin@pact.org</div>
            </div>
            <span style={{ color: "#8b949e", fontSize: 12 }}>⋮</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Topbar */}
        <div style={{
          height: 52,
          borderBottom: "1px solid #21262d",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: 12,
          background: "#0d1117",
          flexShrink: 0,
        }}>
          <button
            onClick={handleToggle}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid #30363d",
              color: "#e6edf3",
              width: 30,
              height: 30,
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {open ? "☰" : "☰"}
          </button>

          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#8b949e" }}>
            <span>PACT</span>
            <span>/</span>
            <span style={{ color: "#e6edf3", fontWeight: 500 }}>{active}</span>
          </div>
        </div>

        {/* Page */}
        <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
          <div style={{
            background: "#161b22",
            border: "1px solid #30363d",
            borderRadius: 10,
            padding: 20,
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, color: "#e6edf3" }}>
              ④ Staggered Reveal
            </div>
            <div style={{ fontSize: 13, color: "#8b949e", lineHeight: 1.7 }}>
              Each nav item animates in with an incremental <code style={{ background: "#21262d", padding: "1px 5px", borderRadius: 4, fontSize: 11, color: "#79c0ff" }}>transition-delay</code> (40ms × index) — exactly how GSAP's <strong style={{ color: "#e6edf3" }}>stagger</strong> works.
              Items slide in from the left with a spring overshoot. Toggle sidebar to re-trigger.
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {[
              { label: "Open Issues", val: "24", icon: "🔴", change: "+3" },
              { label: "Pull Requests", val: "7", icon: "🟢", change: "+1" },
              { label: "Deployments", val: "12", icon: "🔵", change: "0" },
            ].map(c => (
              <div key={c.label} style={{
                background: "#161b22",
                border: "1px solid #30363d",
                borderRadius: 8,
                padding: 14,
              }}>
                <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                  <span>{c.label}</span>
                  <span>{c.icon}</span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#e6edf3" }}>{c.val}</div>
                <div style={{ fontSize: 11, color: "#3fb950", marginTop: 4 }}>{c.change} this week</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
