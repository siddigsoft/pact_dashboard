import { useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download, CreditCard, Loader2 } from "lucide-react";
import { useState } from "react";

interface BadgeUser {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
  email?: string;
  phone?: string;
  avatar?: string;
  employeeId?: string;
  hubName?: string;
  departmentName?: string;
}

interface EmployeeBadgeDialogProps {
  open: boolean;
  onClose: () => void;
  user: BadgeUser;
}

const PACT_NAVY = "#0F2041";
const PACT_BLUE = "#1D3461";
const PACT_GOLD = "#C9A84C";

function roleColor(role: string): string {
  const r = role.toLowerCase();
  if (r.includes("admin") || r.includes("super")) return "#7C3AED";
  if (r.includes("director") || r.includes("country")) return "#0369A1";
  if (r.includes("fom") || r.includes("field operation")) return "#0891B2";
  if (r.includes("coordinator")) return "#059669";
  if (r.includes("supervisor")) return "#D97706";
  if (r.includes("data")) return "#DC2626";
  if (r.includes("hr")) return "#9333EA";
  if (r.includes("finance") || r.includes("ict")) return "#2563EB";
  return PACT_BLUE;
}

function BadgeCard({ user, style }: { user: BadgeUser; style?: React.CSSProperties }) {
  const qrData = encodeURIComponent(`https://app.pactorg.com/users/${user.id}`);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${qrData}&color=0F2041&bgcolor=FFFFFF&qzone=1`;
  const rc = roleColor(user.roleLabel);

  return (
    <div
      id="employee-badge-card"
      style={{
        width: 340,
        height: 530,
        borderRadius: 16,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 20px 60px rgba(15,32,65,0.35)",
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        background: "#FFFFFF",
        position: "relative",
        ...style,
      }}
    >
      {/* ── Header ── */}
      <div style={{
        background: `linear-gradient(135deg, ${PACT_NAVY} 0%, ${PACT_BLUE} 100%)`,
        padding: "20px 24px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src="/pact-logo.png"
            alt="PACT"
            style={{ height: 36, width: 36, objectFit: "contain", borderRadius: 6 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <div>
            <div style={{ color: "#FFFFFF", fontWeight: 800, fontSize: 17, letterSpacing: 1.5, lineHeight: 1 }}>PACT</div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 8.5, letterSpacing: 1.2, marginTop: 2, textTransform: "uppercase" }}>Sudan Operations</div>
          </div>
        </div>
        <div style={{
          background: "rgba(255,255,255,0.12)",
          border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: 6,
          padding: "3px 8px",
          color: "rgba(255,255,255,0.7)",
          fontSize: 8,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          fontWeight: 700,
        }}>
          Staff ID
        </div>
      </div>

      {/* ── Gold accent stripe ── */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${PACT_GOLD}, #E8C97A, ${PACT_GOLD})`, flexShrink: 0 }} />

      {/* ── Photo area ── */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 24,
        paddingBottom: 16,
        background: "#FAFBFD",
        flexShrink: 0,
      }}>
        <div style={{
          width: 110,
          height: 110,
          borderRadius: "50%",
          border: `4px solid ${PACT_GOLD}`,
          overflow: "hidden",
          background: `linear-gradient(135deg, ${PACT_NAVY}, ${PACT_BLUE})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 16px rgba(15,32,65,0.2)",
          flexShrink: 0,
        }}>
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              crossOrigin="anonymous"
            />
          ) : (
            <span style={{
              color: "rgba(255,255,255,0.9)",
              fontSize: 40,
              fontWeight: 700,
              lineHeight: 1,
            }}>
              {user.name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* ── Name & Role ── */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "0 20px",
        background: "#FAFBFD",
        flexShrink: 0,
      }}>
        <div style={{
          fontWeight: 800,
          fontSize: 19,
          color: PACT_NAVY,
          textAlign: "center",
          lineHeight: 1.2,
          letterSpacing: 0.3,
        }}>
          {user.name}
        </div>
        <div style={{
          marginTop: 6,
          display: "inline-block",
          background: rc,
          color: "#FFFFFF",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: "uppercase",
          padding: "3px 12px",
          borderRadius: 20,
        }}>
          {user.roleLabel}
        </div>
      </div>

      {/* ── Details grid ── */}
      <div style={{
        margin: "14px 20px 0",
        background: "#F0F4FA",
        borderRadius: 10,
        padding: "12px 14px",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "8px 10px",
        flexShrink: 0,
      }}>
        {user.departmentName && (
          <div>
            <div style={{ fontSize: 8, color: "#6B7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>Department</div>
            <div style={{ fontSize: 10.5, color: PACT_NAVY, fontWeight: 600, lineHeight: 1.2 }}>{user.departmentName}</div>
          </div>
        )}
        {user.hubName && (
          <div>
            <div style={{ fontSize: 8, color: "#6B7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>Hub</div>
            <div style={{ fontSize: 10.5, color: PACT_NAVY, fontWeight: 600, lineHeight: 1.2 }}>{user.hubName}</div>
          </div>
        )}
        {user.email && (
          <div style={{ gridColumn: user.email ? "1 / -1" : undefined }}>
            <div style={{ fontSize: 8, color: "#6B7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>Email</div>
            <div style={{ fontSize: 10, color: PACT_BLUE, fontWeight: 500, lineHeight: 1.2, wordBreak: "break-all" }}>{user.email}</div>
          </div>
        )}
        {user.phone && (
          <div>
            <div style={{ fontSize: 8, color: "#6B7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>Phone</div>
            <div style={{ fontSize: 10.5, color: PACT_NAVY, fontWeight: 600 }}>{user.phone}</div>
          </div>
        )}
      </div>

      {/* ── ID + QR ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        margin: "10px 20px 0",
        padding: "10px 14px",
        background: `linear-gradient(135deg, ${PACT_NAVY}08, ${PACT_BLUE}12)`,
        border: `1px solid ${PACT_NAVY}18`,
        borderRadius: 10,
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 8, color: "#6B7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>Employee ID</div>
          <div style={{
            fontSize: 18,
            fontWeight: 900,
            color: PACT_NAVY,
            letterSpacing: 3,
            fontFamily: "monospace",
          }}>
            {user.employeeId || "—"}
          </div>
          <div style={{
            display: "flex",
            gap: 2,
            marginTop: 4,
          }}>
            {(user.employeeId || "XXXXXXXX").split("").map((ch, i) => (
              <div key={i} style={{
                width: 7,
                height: 18,
                background: PACT_NAVY,
                opacity: ch === "-" ? 0 : (i % 3 === 0 ? 1 : i % 3 === 1 ? 0.7 : 0.4),
                borderRadius: 1,
              }} />
            ))}
          </div>
        </div>
        <img
          src={qrUrl}
          alt="QR"
          style={{ width: 64, height: 64, borderRadius: 6, border: `2px solid ${PACT_GOLD}` }}
        />
      </div>

      {/* ── Footer ── */}
      <div style={{
        marginTop: "auto",
        background: `linear-gradient(135deg, ${PACT_NAVY} 0%, ${PACT_BLUE} 100%)`,
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 8, letterSpacing: 0.8 }}>
          This card is the property of PACT
        </div>
        <div style={{ color: PACT_GOLD, fontSize: 8, fontWeight: 700, letterSpacing: 0.8 }}>
          app.pactorg.com
        </div>
      </div>
    </div>
  );
}

export default function EmployeeBadgeDialog({ open, onClose, user }: EmployeeBadgeDialogProps) {
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handlePrint = () => {
    setPrinting(true);
    const qrData = encodeURIComponent(`https://app.pactorg.com/users/${user.id}`);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${qrData}&color=0F2041&bgcolor=FFFFFF&qzone=1`;
    const rc = roleColor(user.roleLabel);
    const initials = user.name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Employee Badge — ${user.name}</title>
<style>
  @page { size: 340px 530px; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 340px; height: 530px; overflow: hidden; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .card { width: 340px; height: 530px; border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; font-family: 'Segoe UI', system-ui, sans-serif; background: #fff; }
  .header { background: linear-gradient(135deg, #0F2041 0%, #1D3461 100%); padding: 20px 24px 16px; display: flex; align-items: center; justify-content: space-between; }
  .logo-wrap { display: flex; align-items: center; gap: 10px; }
  .logo { height: 36px; width: 36px; object-fit: contain; border-radius: 6px; }
  .org-name { color: #fff; font-weight: 800; font-size: 17px; letter-spacing: 1.5px; line-height: 1; }
  .org-sub { color: rgba(255,255,255,0.55); font-size: 8.5px; letter-spacing: 1.2px; margin-top: 2px; text-transform: uppercase; }
  .id-pill { background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; padding: 3px 8px; color: rgba(255,255,255,0.7); font-size: 8px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 700; }
  .gold-stripe { height: 3px; background: linear-gradient(90deg, #C9A84C, #E8C97A, #C9A84C); }
  .photo-area { display: flex; flex-direction: column; align-items: center; padding: 24px 0 16px; background: #FAFBFD; }
  .photo-ring { width: 110px; height: 110px; border-radius: 50%; border: 4px solid #C9A84C; overflow: hidden; background: linear-gradient(135deg, #0F2041, #1D3461); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 16px rgba(15,32,65,0.2); }
  .photo-img { width: 100%; height: 100%; object-fit: cover; }
  .initials { color: rgba(255,255,255,0.9); font-size: 40px; font-weight: 700; line-height: 1; }
  .name-area { display: flex; flex-direction: column; align-items: center; padding: 0 20px; background: #FAFBFD; }
  .emp-name { font-weight: 800; font-size: 19px; color: #0F2041; text-align: center; line-height: 1.2; letter-spacing: 0.3px; }
  .role-pill { margin-top: 6px; display: inline-block; background: ${rc}; color: #fff; font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 3px 12px; border-radius: 20px; }
  .details { margin: 14px 20px 0; background: #F0F4FA; border-radius: 10px; padding: 12px 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; }
  .detail-label { font-size: 8px; color: #6B7280; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 2px; }
  .detail-val { font-size: 10.5px; color: #0F2041; font-weight: 600; line-height: 1.2; }
  .detail-val-email { font-size: 10px; color: #1D3461; font-weight: 500; line-height: 1.2; word-break: break-all; }
  .id-row { display: flex; align-items: center; justify-content: space-between; margin: 10px 20px 0; padding: 10px 14px; background: #F7F9FC; border: 1px solid rgba(15,32,65,0.1); border-radius: 10px; }
  .emp-id-label { font-size: 8px; color: #6B7280; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 3px; }
  .emp-id-num { font-size: 18px; font-weight: 900; color: #0F2041; letter-spacing: 3px; font-family: monospace; }
  .barcode { display: flex; gap: 2px; margin-top: 4px; }
  .bar { width: 7px; height: 18px; background: #0F2041; border-radius: 1px; }
  .qr-img { width: 64px; height: 64px; border-radius: 6px; border: 2px solid #C9A84C; }
  .footer { margin-top: auto; background: linear-gradient(135deg, #0F2041 0%, #1D3461 100%); padding: 10px 20px; display: flex; align-items: center; justify-content: space-between; }
  .footer-note { color: rgba(255,255,255,0.5); font-size: 8px; letter-spacing: 0.8px; }
  .footer-url { color: #C9A84C; font-size: 8px; font-weight: 700; letter-spacing: 0.8px; }
  @media print { body { margin: 0; } }
</style></head><body>
<div class="card">
  <div class="header">
    <div class="logo-wrap">
      <img class="logo" src="/pact-logo.png" onerror="this.style.display='none'" alt="PACT" />
      <div><div class="org-name">PACT</div><div class="org-sub">Sudan Operations</div></div>
    </div>
    <div class="id-pill">Staff ID</div>
  </div>
  <div class="gold-stripe"></div>
  <div class="photo-area">
    <div class="photo-ring">
      ${user.avatar
        ? `<img class="photo-img" src="${user.avatar}" crossorigin="anonymous" alt="${user.name}" />`
        : `<span class="initials">${initials}</span>`}
    </div>
  </div>
  <div class="name-area">
    <div class="emp-name">${user.name}</div>
    <span class="role-pill">${user.roleLabel}</span>
  </div>
  <div class="details">
    ${user.departmentName ? `<div><div class="detail-label">Department</div><div class="detail-val">${user.departmentName}</div></div>` : ""}
    ${user.hubName ? `<div><div class="detail-label">Hub</div><div class="detail-val">${user.hubName}</div></div>` : ""}
    ${user.email ? `<div style="grid-column:1/-1"><div class="detail-label">Email</div><div class="detail-val-email">${user.email}</div></div>` : ""}
    ${user.phone ? `<div><div class="detail-label">Phone</div><div class="detail-val">${user.phone}</div></div>` : ""}
  </div>
  <div class="id-row">
    <div>
      <div class="emp-id-label">Employee ID</div>
      <div class="emp-id-num">${user.employeeId || "—"}</div>
      <div class="barcode">
        ${(user.employeeId || "XXXXXXXX").split("").map((ch, i) =>
          `<div class="bar" style="opacity:${ch === "-" ? 0 : i % 3 === 0 ? 1 : i % 3 === 1 ? 0.7 : 0.4}"></div>`
        ).join("")}
      </div>
    </div>
    <img class="qr-img" src="${qrUrl}" alt="QR" />
  </div>
  <div class="footer">
    <span class="footer-note">This card is the property of PACT</span>
    <span class="footer-url">app.pactorg.com</span>
  </div>
</div>
<script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };</script>
</body></html>`;

    const win = window.open("", "_blank", "width=400,height=620");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
    setTimeout(() => setPrinting(false), 1500);
  };

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      // Badge dimensions: 54mm × 85.6mm (portrait CR80) → use mm unit
      const W = 54;
      const H = 85.6;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [W, H] });

      const navy = [15, 32, 65] as [number, number, number];
      const blue = [29, 52, 97] as [number, number, number];
      const gold = [201, 168, 76] as [number, number, number];
      const white = [255, 255, 255] as [number, number, number];
      const lightGray = [240, 244, 250] as [number, number, number];
      const darkText = [15, 32, 65] as [number, number, number];
      const mutedText = [107, 114, 128] as [number, number, number];

      // Header background
      doc.setFillColor(...navy);
      doc.rect(0, 0, W, 18, "F");
      // Gold stripe
      doc.setFillColor(...gold);
      doc.rect(0, 18, W, 0.8, "F");

      // PACT text
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...white);
      doc.text("PACT", 10, 10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5);
      doc.setTextColor(180, 195, 220);
      doc.text("Sudan Operations", 10, 14.5);

      // Staff ID pill (right side)
      doc.setFillColor(255, 255, 255, 30);
      doc.setDrawColor(255, 255, 255, 50);
      doc.roundedRect(38, 6, 14, 5, 1, 1, "FD");
      doc.setFontSize(4.5);
      doc.setTextColor(200, 210, 230);
      doc.setFont("helvetica", "bold");
      doc.text("STAFF ID", 45, 9.5, { align: "center" });

      // Photo area background
      doc.setFillColor(250, 251, 253);
      doc.rect(0, 18.8, W, 28, "F");

      // Photo circle
      const cx = W / 2;
      const cy = 33;
      const r = 9;
      if (user.avatar) {
        try {
          // Draw gold ring
          doc.setFillColor(...gold);
          doc.circle(cx, cy, r + 1, "F");
          doc.addImage(user.avatar, "JPEG", cx - r, cy - r, r * 2, r * 2, undefined, "FAST");
          // Clip with circle using white overlay trick not available in jsPDF, skip
        } catch {
          doc.setFillColor(...gold);
          doc.circle(cx, cy, r + 1, "F");
          doc.setFillColor(...navy);
          doc.circle(cx, cy, r, "F");
          const init = user.name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(...white);
          doc.text(init, cx, cy + 3.5, { align: "center" });
        }
      } else {
        doc.setFillColor(...gold);
        doc.circle(cx, cy, r + 1, "F");
        doc.setFillColor(...navy);
        doc.circle(cx, cy, r, "F");
        const init = user.name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...white);
        doc.text(init, cx, cy + 3.5, { align: "center" });
      }

      // Name
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...darkText);
      doc.text(user.name, W / 2, 48, { align: "center", maxWidth: W - 8 });

      // Role pill
      const rc_rgb = hexToRgb(roleColor(user.roleLabel));
      doc.setFillColor(rc_rgb[0], rc_rgb[1], rc_rgb[2]);
      const roleW = Math.min(doc.getTextWidth(user.roleLabel) * 0.7 + 6, 40);
      doc.roundedRect(W / 2 - roleW / 2, 50.5, roleW, 4.5, 1.5, 1.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5);
      doc.setTextColor(...white);
      doc.text(user.roleLabel.toUpperCase(), W / 2, 53.5, { align: "center" });

      // Details box
      doc.setFillColor(...lightGray);
      doc.roundedRect(4, 57, W - 8, 15, 2, 2, "F");

      let dy = 60.5;
      const labelFn = (lbl: string, val: string, x: number, y: number) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(4);
        doc.setTextColor(...mutedText);
        doc.text(lbl.toUpperCase(), x, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.5);
        doc.setTextColor(...darkText);
        doc.text(val, x, y + 3.5, { maxWidth: 20 });
      };

      if (user.departmentName) labelFn("Department", user.departmentName, 6, dy);
      if (user.hubName) labelFn("Hub", user.hubName, W / 2 + 1, dy);
      dy += 7.5;
      if (user.email) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(4);
        doc.setTextColor(...mutedText);
        doc.text("EMAIL", 6, dy);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5);
        doc.setTextColor(29, 52, 97);
        doc.text(user.email, 6, dy + 3.5, { maxWidth: W - 12 });
        dy += 7;
      }
      if (user.phone) labelFn("Phone", user.phone, 6, dy);

      // ID + QR strip
      doc.setFillColor(245, 247, 252);
      doc.setDrawColor(220, 228, 240);
      doc.roundedRect(4, 74, W - 8, 9, 2, 2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(4);
      doc.setTextColor(...mutedText);
      doc.text("EMPLOYEE ID", 6, 77);
      doc.setFont("courier", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...darkText);
      doc.text(user.employeeId || "—", 6, 81);

      // QR code (small, right side)
      const qrData = encodeURIComponent(`https://app.pactorg.com/users/${user.id}`);
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${qrData}&color=0F2041&bgcolor=FFFFFF&qzone=1`;
      try {
        const qrImg = await loadImageAsBase64(qrUrl);
        doc.addImage(qrImg, "PNG", W - 12, 75, 8, 8);
      } catch { /* skip QR if load fails */ }

      // Footer
      doc.setFillColor(...navy);
      doc.rect(0, 83.5, W, H - 83.5, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(3.5);
      doc.setTextColor(160, 180, 210);
      doc.text("This card is the property of PACT", 4, 86);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...gold);
      doc.text("app.pactorg.com", W - 4, 86, { align: "right" });

      doc.save(`PACT_Badge_${user.name.replace(/\s+/g, "_")}.pdf`);
    } catch (e: any) {
      console.error("Badge PDF error:", e);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[420px] p-0 overflow-hidden bg-gradient-to-br from-[#0d1e40] to-[#1a2f5e]">
        <DialogHeader className="px-6 pt-5 pb-3">
          <DialogTitle className="text-white flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-yellow-400" />
            Employee Badge
          </DialogTitle>
        </DialogHeader>

        {/* Badge preview */}
        <div className="flex justify-center px-6 pb-2">
          <div style={{ transform: "scale(0.88)", transformOrigin: "top center" }}>
            <BadgeCard user={user} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-6 pt-2">
          <Button
            onClick={handlePrint}
            disabled={printing}
            className="flex-1 bg-white/10 hover:bg-white/20 text-white border border-white/20 gap-2"
            variant="outline"
            data-testid="button-print-badge"
          >
            {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {printing ? "Opening…" : "Print Badge"}
          </Button>
          <Button
            onClick={handleDownloadPDF}
            disabled={downloading}
            className="flex-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 border border-yellow-500/30 gap-2"
            variant="outline"
            data-testid="button-download-badge-pdf"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloading ? "Generating…" : "Download PDF"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

async function loadImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
