import { MapPin, Hash, User, Calendar, Building, Globe, FileText, CheckSquare, ArrowUpRight } from "lucide-react";

const BRAND = "#1D3461";
const BRAND_DARK = "#0F2041";
const BRAND_TINT = "rgba(29,52,97,0.06)";
const BRAND_BORDER = "rgba(29,52,97,0.18)";
const BRAND_LABEL = "rgba(29,52,97,0.55)";

function StatusBadge() {
  return (
    <span style={{ background: "#166534", color: "#fff", fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "3px 10px", letterSpacing: 0.3 }}>
      Approved / تمت الموافقة
    </span>
  );
}

function WorkflowDot({ label, done }: { label: string; done?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        background: done ? "#16a34a" : "#e5e7eb",
        color: done ? "#fff" : "#9ca3af", fontSize: 11, fontWeight: 700,
      }}>
        {done ? "✓" : label}
      </div>
      <span style={{ fontSize: 9, color: "#6b7280" }}>
        {label === "T1" ? "Supervisor" : label === "T2" ? "Admin" : "Finance"}
      </span>
    </div>
  );
}

export function OptionD1() {
  return (
    <div style={{ background: "#f3f4f6", minHeight: "100vh", padding: 24, fontFamily: "Inter, sans-serif" }}>
      <div style={{
        background: "#fff", borderRadius: 12,
        border: "1px solid #e5e7eb",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        padding: "16px 18px", maxWidth: 600
      }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <CheckSquare size={16} color="#9ca3af" style={{ marginTop: 3, flexShrink: 0 }} />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <MapPin size={14} color="#6b7280" />
                <span style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>Emtedad alzhour</span>
                <span style={{ fontSize: 11, color: "#6b7280" }}>WFP TPM</span>
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#6b7280", display: "flex", alignItems: "center", gap: 3 }}>
                  <Hash size={11} /> ID: 32A45311
                </span>
                <span style={{ fontSize: 11, color: "#374151", fontWeight: 500, display: "flex", alignItems: "center", gap: 3 }}>
                  <User size={11} color="#9ca3af" /> مشرفة يوسف الطريفي
                </span>
                <span style={{ fontSize: 11, color: "#6b7280", display: "flex", alignItems: "center", gap: 3 }}>
                  <Calendar size={11} /> Feb 28, 2026
                </span>
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 3 }}>
                <span style={{ fontSize: 11, color: "#6b7280", display: "flex", alignItems: "center", gap: 3 }}>
                  <Building size={11} /> Kassala Hub
                </span>
                <span style={{ fontSize: 11, color: "#6b7280", display: "flex", alignItems: "center", gap: 3 }}>
                  <Globe size={11} /> Blue Nile / Ed Damazine
                </span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>SDG 50,000</span>
            <StatusBadge />
          </div>
        </div>

        {/* ── D1: MMP Focus Block — fully brand-aligned, no indigo leakage ── */}
        <div style={{
          marginTop: 12,
          background: BRAND_TINT,
          border: `1.5px solid ${BRAND_BORDER}`,
          borderLeft: `4px solid ${BRAND}`,
          borderRadius: 8,
          padding: "9px 13px",
          display: "flex",
          alignItems: "center",
          gap: 11,
        }}>
          {/* Icon */}
          <div style={{
            width: 34, height: 34, borderRadius: 7,
            background: BRAND,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 2px 6px rgba(29,52,97,0.25)",
          }}>
            <FileText size={16} color="#fff" />
          </div>

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9.5, color: BRAND_LABEL, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
              Monthly Monitoring Plan
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: BRAND_DARK, marginTop: 1, letterSpacing: 0.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              FEBRUARY MMP
            </div>
          </div>

          {/* Link — brand color, no indigo */}
          <div style={{
            display: "flex", alignItems: "center", gap: 3,
            color: BRAND, fontSize: 11, fontWeight: 700,
            cursor: "pointer", flexShrink: 0,
            borderBottom: `1px solid rgba(29,52,97,0.3)`,
            paddingBottom: 1,
          }}>
            View MMP <ArrowUpRight size={12} />
          </div>
        </div>

        {/* Workflow timeline */}
        <div style={{ marginTop: 12, display: "flex", alignItems: "center" }}>
          <WorkflowDot label="T1" done />
          <div style={{ flex: 1, height: 2, background: "#16a34a" }} />
          <WorkflowDot label="T2" done />
          <div style={{ flex: 1, height: 2, background: "#16a34a" }} />
          <WorkflowDot label="T3" done />
          <div style={{ flex: 1, height: 2, background: "#d1fae5" }} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: "#d1fae5", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 11 }}>💰</span>
            </div>
            <span style={{ fontSize: 9, color: "#6b7280" }}>Paid</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "#6b7280", textAlign: "center" }}>
        D1 — Sharp: Brand-consistent colors, tighter block, underline link
      </div>
    </div>
  );
}
