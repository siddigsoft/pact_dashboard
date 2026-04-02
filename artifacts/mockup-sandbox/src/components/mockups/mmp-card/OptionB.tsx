import { MapPin, Hash, User, Calendar, Building, Globe, FileText, CheckSquare } from "lucide-react";

const BRAND = "#1D3461";

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
        color: done ? "#fff" : "#9ca3af", fontSize: 11, fontWeight: 700
      }}>
        {done ? "✓" : label}
      </div>
      <span style={{ fontSize: 9, color: "#6b7280" }}>{label === "T1" ? "Supervisor" : label === "T2" ? "Admin" : "Finance"}</span>
    </div>
  );
}

export function OptionB() {
  return (
    <div style={{ background: "#f3f4f6", minHeight: "100vh", padding: 24, fontFamily: "Inter, sans-serif" }}>

      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", maxWidth: 600, overflow: "hidden" }}>

        {/* ─── OPTION B: Full-width colored banner at top of card ─── */}
        <div style={{
          background: `linear-gradient(135deg, ${BRAND} 0%, #2d5499 100%)`,
          padding: "10px 18px",
          display: "flex",
          alignItems: "center",
          gap: 10
        }}>
          <FileText size={18} color="rgba(255,255,255,0.8)" />
          <span style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: 0.3, flex: 1 }}>
            FEBRUARY MMP
          </span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>Monthly Monitoring Plan</span>
        </div>

        <div style={{ padding: "14px 18px" }}>
          {/* Row: checkbox + site name + amount */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <CheckSquare size={16} color="#9ca3af" style={{ marginTop: 3, flexShrink: 0 }} />
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <MapPin size={14} color="#6b7280" />
                  <span style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>Emtedad alzhour</span>
                  <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 400 }}>WFP TPM</span>
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

          {/* Workflow timeline */}
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 0 }}>
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
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "#6b7280", textAlign: "center" }}>
        Option B — Full-width colored banner strip at top of card
      </div>
    </div>
  );
}
