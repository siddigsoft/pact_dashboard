import { useState } from "react";

const SECTIONS = [
  { id: "overview",    icon: "🏠", label: "Overview",               group: "Profile" },
  { id: "employment",  icon: "💼", label: "Employment & Contract",  group: "Profile" },
  { id: "personal",    icon: "👤", label: "Personal Details",       group: "Profile" },
  { id: "location",    icon: "📍", label: "Location & Work",        group: "Profile" },
  { id: "education",   icon: "🎓", label: "Education & Experience", group: "Background" },
  { id: "documents",   icon: "📁", label: "Document Vault",         group: "Background" },
  { id: "skills",      icon: "⚡", label: "Skills & Languages",     group: "Background" },
  { id: "compensation",icon: "💰", label: "Compensation & Bank",    group: "Finance" },
  { id: "performance", icon: "📊", label: "Performance",            group: "Finance" },
  { id: "access",      icon: "🔒", label: "Access & Security",      group: "System" },
];

const GROUPS = ["Profile", "Background", "Finance", "System"];

const COMPLETENESS: Record<string, number> = {
  overview: 100, employment: 100, personal: 60, location: 80,
  education: 0, documents: 40, skills: 20, compensation: 100, performance: 100, access: 100,
};

function CompletionDot({ pct }: { pct: number }) {
  const color = pct === 0 ? "#e5e7eb" : pct < 50 ? "#fbbf24" : pct < 100 ? "#60a5fa" : "#22c55e";
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />;
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: color === "green" ? "#dcfce7" : color === "amber" ? "#fef3c7" : "#dbeafe", color: color === "green" ? "#166534" : color === "amber" ? "#92400e" : "#1e40af" }}>
      {label}
    </span>
  );
}

function FieldRow({ label, value, required }: { label: string; value?: string; required?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}{required && <span style={{ color: "#ef4444", marginLeft: 2 }}>*</span>}
      </span>
      <span style={{ fontSize: 13, fontWeight: 500, color: value ? "#111827" : "#d1d5db", fontStyle: value ? "normal" : "italic" }}>
        {value || "Not filled"}
      </span>
    </div>
  );
}

function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ background: "white", border: "1px solid #f3f4f6", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{title}</span>
        {action}
      </div>
      <div style={{ padding: "16px 20px" }}>{children}</div>
    </div>
  );
}

function EditBtn() {
  return (
    <button style={{ fontSize: 11, fontWeight: 600, color: "#4f46e5", background: "#eef2ff", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
      ✎ Edit
    </button>
  );
}

// ── Section content renders ─────────────────────────────────────────────────

function OverviewContent() {
  const overall = Math.round(Object.values(COMPLETENESS).reduce((a, b) => a + b, 0) / Object.keys(COMPLETENESS).length);
  return (
    <>
      {/* Completion banner */}
      <div style={{ background: "linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%)", borderRadius: 12, padding: "16px 20px", marginBottom: 16, color: "white" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4 }}>Profile Completeness</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{overall}%</div>
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>4 sections still need attention</div>
          </div>
          <div style={{ position: "relative", width: 64, height: 64 }}>
            <svg width="64" height="64" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="7" />
              <circle cx="32" cy="32" r="26" fill="none" stroke="white" strokeWidth="7"
                strokeDasharray={`${2 * Math.PI * 26 * overall / 100} ${2 * Math.PI * 26 * (1 - overall / 100)}`}
                strokeLinecap="round" transform="rotate(-90 32 32)" />
            </svg>
          </div>
        </div>
        <div style={{ marginTop: 12, background: "rgba(255,255,255,0.15)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ height: 6, background: "white", borderRadius: 8, width: `${overall}%` }} />
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        {[
          { label: "Days Employed", value: "847", icon: "📅" },
          { label: "Department", value: "Finance", icon: "🏢" },
          { label: "Contract Ends", value: "Dec 2025", icon: "📋" },
          { label: "Leave Balance", value: "14 days", icon: "🌴" },
        ].map(s => (
          <div key={s.label} style={{ background: "#f9fafb", borderRadius: 10, padding: "12px 14px", border: "1px solid #f3f4f6" }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#111827" }}>{s.value}</div>
            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Checklist */}
      <SectionCard title="Profile Completion Checklist">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {SECTIONS.map(s => {
            const pct = COMPLETENESS[s.id];
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: "#f9fafb", border: "1px solid #f3f4f6" }}>
                <CompletionDot pct={pct} />
                <span style={{ fontSize: 12, flex: 1, color: "#374151" }}>{s.icon} {s.label}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: pct === 100 ? "#22c55e" : pct === 0 ? "#9ca3af" : "#f59e0b" }}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </>
  );
}

function EmploymentContent() {
  return (
    <>
      <SectionCard title="Job Information" action={<EditBtn />}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <FieldRow label="Job Title" value="Field Operations Manager" />
          <FieldRow label="System Role" value="FOM (Field Ops Manager)" />
          <FieldRow label="Department" value="Field Operations" />
          <FieldRow label="Reports To" value="Ahmed Hassan" />
          <FieldRow label="Employment Type" value="Full-time" />
          <FieldRow label="Work Location" value="Khartoum HQ" />
        </div>
      </SectionCard>
      <SectionCard title="Contract Details" action={<EditBtn />}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <FieldRow label="Contract Type" value="Salary" />
          <FieldRow label="Contract Start" value="Jan 15, 2023" />
          <FieldRow label="Contract End" value="Dec 31, 2025" required />
          <FieldRow label="Working Schedule" value="Standard (40h/week)" />
          <FieldRow label="Probation End" value="Apr 15, 2023" />
          <FieldRow label="Employee ID" value="PACT-FOM-0042" />
        </div>
        <div style={{ marginTop: 12, padding: "10px 14px", background: "#fef3c7", borderRadius: 8, border: "1px solid #fde68a", display: "flex", alignItems: "center", gap: 8 }}>
          <span>⚠️</span>
          <span style={{ fontSize: 12, color: "#92400e" }}>Contract expires in <strong>164 days</strong>. Consider initiating renewal process.</span>
        </div>
      </SectionCard>
      <SectionCard title="Onboarding Status" action={
        <span style={{ fontSize: 11, fontWeight: 600, color: "#22c55e", background: "#dcfce7", borderRadius: 6, padding: "3px 8px" }}>9/10 Complete</span>
      }>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {["Profile Created","Role Assigned","Department Set","Contract Set","Salary Config","Bank Account","Employee ID","Documents","Personal Info","Education"].map((step, i) => (
            <div key={step} style={{ textAlign: "center", padding: "8px 4px", background: i === 7 ? "#fef3c7" : "#f0fdf4", border: `1px solid ${i === 7 ? "#fde68a" : "#bbf7d0"}`, borderRadius: 8 }}>
              <div style={{ fontSize: 16, marginBottom: 3 }}>{i === 7 ? "⚠️" : "✅"}</div>
              <div style={{ fontSize: 9, color: "#374151", lineHeight: 1.3 }}>{step}</div>
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}

function PersonalContent() {
  return (
    <>
      <SectionCard title="Identity" action={<EditBtn />}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <FieldRow label="Date of Birth" value="March 12, 1988" />
          <FieldRow label="Gender" value="Male" />
          <FieldRow label="Nationality" value="Sudanese" />
          <FieldRow label="Marital Status" value="Married" />
          <FieldRow label="Blood Type" value="O+" />
        </div>
      </SectionCard>
      <SectionCard title="ID Documents" action={<EditBtn />}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <FieldRow label="National ID No." value="SUD-198803-42819" />
          <FieldRow label="Passport No." value="SD1928374" />
          <FieldRow label="Passport Expiry" value="Jun 30, 2027" />
        </div>
      </SectionCard>
      <SectionCard title="Home Address" action={<EditBtn />}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <FieldRow label="Address Line 1" value="Block 14, House 7" />
          <FieldRow label="Neighbourhood" value="Al Riyadh, Khartoum" />
          <FieldRow label="City" value="Khartoum" />
          <FieldRow label="Country" value="Sudan" />
        </div>
      </SectionCard>
      <SectionCard title="Emergency Contact" action={<EditBtn />}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <FieldRow label="Contact Name" value="Fatima Omar" />
          <FieldRow label="Relationship" value="Spouse" />
          <FieldRow label="Phone" value="+249 912 345 678" />
        </div>
      </SectionCard>
    </>
  );
}

function DocumentsContent() {
  const docs = [
    { type: "🪪 National ID",         name: "national_id_scan.pdf",    size: "1.2 MB", date: "Mar 2024", expiry: null,         ok: true },
    { type: "🛂 Passport",             name: "passport_copy.pdf",       size: "2.4 MB", date: "Mar 2024", expiry: "Jun 2027",   ok: true },
    { type: "📷 Staff Photo",          name: "photo_official.jpg",      size: "340 KB", date: "Jan 2023", expiry: null,         ok: true },
    { type: "📄 CV / Resume",          name: "cv_2024.pdf",             size: "450 KB", date: "Feb 2024", expiry: null,         ok: true },
    { type: "🎓 Bachelor Degree",      name: "bsc_certificate.pdf",     size: "3.1 MB", date: "Mar 2024", expiry: null,         ok: true },
    { type: "📋 Work Permit",          name: "work_permit_2024.pdf",    size: "1.8 MB", date: "Jan 2024", expiry: "Dec 2024",   ok: false },
  ];
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button style={{ fontSize: 12, fontWeight: 600, color: "white", background: "#4f46e5", border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer" }}>
          + Upload Document
        </button>
      </div>
      <SectionCard title={`All Documents (${docs.length})`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {docs.map(d => (
            <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8, border: `1px solid ${d.ok ? "#f3f4f6" : "#fde68a"}`, background: d.ok ? "#fafafa" : "#fffbeb" }}>
              <span style={{ fontSize: 16 }}>{d.type.split(" ")[0]}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{d.type.split(" ").slice(1).join(" ")}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>{d.name} · {d.size} · Uploaded {d.date}{d.expiry ? ` · Expires ${d.expiry}` : ""}</div>
              </div>
              {!d.ok && <span style={{ fontSize: 10, fontWeight: 700, color: "#92400e", background: "#fef3c7", borderRadius: 6, padding: "2px 8px" }}>⚠️ Expiring</span>}
              <div style={{ display: "flex", gap: 6 }}>
                <button style={{ fontSize: 10, color: "#4f46e5", background: "#eef2ff", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}>View</button>
                <button style={{ fontSize: 10, color: "#6b7280", background: "#f3f4f6", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}>⬇</button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}

function EducationContent() {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111827" }}>🎓 Education History</h4>
        <button style={{ fontSize: 12, fontWeight: 600, color: "#4f46e5", background: "#eef2ff", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>+ Add</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {[
          { degree: "Bachelor of Business Administration", school: "University of Khartoum", year: "2010", field: "Management & Finance", country: "Sudan" },
          { degree: "High School Certificate", school: "Al-Ahfad Academy", year: "2006", field: "Science Stream", country: "Sudan" },
        ].map(e => (
          <div key={e.degree} style={{ display: "flex", gap: 12, padding: "14px 16px", borderRadius: 10, border: "1px solid #f3f4f6", background: "white" }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#eef2ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🎓</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{e.degree}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{e.school} · {e.country} · {e.year}</div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{e.field}</div>
            </div>
            <button style={{ fontSize: 10, color: "#6b7280", background: "#f3f4f6", border: "none", borderRadius: 6, padding: "4px 8px", alignSelf: "flex-start", cursor: "pointer" }}>Edit</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111827" }}>💼 Work Experience</h4>
        <button style={{ fontSize: 12, fontWeight: 600, color: "#4f46e5", background: "#eef2ff", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>+ Add</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[
          { title: "Field Operations Manager", org: "UNHCR Sudan", from: "2020", to: "Present", current: true, location: "Khartoum" },
          { title: "Program Coordinator", org: "IRC International", from: "2016", to: "2020", current: false, location: "Juba, South Sudan" },
          { title: "Field Officer", org: "Save the Children", from: "2012", to: "2016", current: false, location: "Darfur, Sudan" },
        ].map(e => (
          <div key={e.title} style={{ display: "flex", gap: 12, padding: "14px 16px", borderRadius: 10, border: "1px solid #f3f4f6", background: "white" }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>💼</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", display: "flex", alignItems: "center", gap: 6 }}>
                {e.title}
                {e.current && <span style={{ fontSize: 10, fontWeight: 700, color: "#166534", background: "#dcfce7", borderRadius: 6, padding: "1px 7px" }}>Current</span>}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>🏢 {e.org} · 📍 {e.location}</div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>📅 {e.from} — {e.to}</div>
            </div>
            <button style={{ fontSize: 10, color: "#6b7280", background: "#f3f4f6", border: "none", borderRadius: 6, padding: "4px 8px", alignSelf: "flex-start", cursor: "pointer" }}>Edit</button>
          </div>
        ))}
      </div>
    </>
  );
}

function SkillsContent() {
  const skills = [
    { name: "Project Management", level: "Expert", cat: "Management" },
    { name: "Data Analysis", level: "Advanced", cat: "Technical" },
    { name: "Budget Management", level: "Advanced", cat: "Finance" },
    { name: "Community Engagement", level: "Expert", cat: "Field" },
    { name: "Report Writing", level: "Advanced", cat: "Communication" },
    { name: "MS Office Suite", level: "Expert", cat: "Technical" },
  ];
  const langs = [
    { name: "Arabic", prof: "Native" },
    { name: "English", prof: "Fluent" },
    { name: "French", prof: "Conversational" },
  ];
  const levelColor: Record<string, string> = {
    Expert: "#fef3c7|#92400e", Advanced: "#ede9fe|#5b21b6", Intermediate: "#dbeafe|#1e40af", Beginner: "#f3f4f6|#374151",
  };
  const profColor: Record<string, string> = {
    Native: "#dcfce7|#166534", Fluent: "#dbeafe|#1e40af", Conversational: "#fef3c7|#92400e", Basic: "#f3f4f6|#374151",
  };
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>⚡ Skills</h4>
        <button style={{ fontSize: 12, fontWeight: 600, color: "#4f46e5", background: "#eef2ff", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>+ Add Skill</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {skills.map(s => {
          const [bg, fg] = levelColor[s.level]?.split("|") ?? ["#f3f4f6","#374151"];
          return (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, border: "1px solid #e5e7eb", background: "white" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{s.name}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: bg, color: fg }}>{s.level}</span>
              <span style={{ fontSize: 16, cursor: "pointer", color: "#d1d5db" }}>×</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>🌍 Languages</h4>
        <button style={{ fontSize: 12, fontWeight: 600, color: "#4f46e5", background: "#eef2ff", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>+ Add</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {langs.map(l => {
          const [bg, fg] = profColor[l.prof]?.split("|") ?? ["#f3f4f6","#374151"];
          return (
            <div key={l.name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, border: "1px solid #e5e7eb", background: "white" }}>
              <span style={{ fontSize: 14 }}>🌐</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{l.name}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: bg, color: fg }}>{l.prof}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function CompensationContent() {
  return (
    <>
      <SectionCard title="Salary Configuration" action={<EditBtn />}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <FieldRow label="Contract Type" value="Salary" />
          <FieldRow label="Base Salary" value="SDG 250,000 / month" />
          <FieldRow label="Classification Level" value="Level B" />
          <FieldRow label="Transport Allowance" value="SDG 15,000" />
          <FieldRow label="Housing Allowance" value="SDG 20,000" />
          <FieldRow label="Total Package" value="SDG 285,000 / month" />
        </div>
      </SectionCard>
      <SectionCard title="Bank Account" action={<EditBtn />}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <FieldRow label="Bank Name" value="Bank of Khartoum" />
          <FieldRow label="Account Name" value="Yousif A. Mohammed" />
          <FieldRow label="Account Number" value="•••• •••• 4821" />
        </div>
      </SectionCard>
      <SectionCard title="EOSB / Gratuity" action={<EditBtn />}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <FieldRow label="Years of Service" value="2 years 6 months" />
          <FieldRow label="Accrued Gratuity" value="SDG 437,500" />
          <FieldRow label="Formula Applied" value="21 days / year (≤5yrs)" />
        </div>
      </SectionCard>
    </>
  );
}

// ── Main layout ──────────────────────────────────────────────────────────────

export function UnifiedProfile() {
  const [active, setActive] = useState("overview");

  const overall = Math.round(Object.values(COMPLETENESS).reduce((a, b) => a + b, 0) / Object.keys(COMPLETENESS).length);

  const renderContent = () => {
    switch (active) {
      case "overview":     return <OverviewContent />;
      case "employment":   return <EmploymentContent />;
      case "personal":     return <PersonalContent />;
      case "documents":    return <DocumentsContent />;
      case "education":    return <EducationContent />;
      case "skills":       return <SkillsContent />;
      case "compensation": return <CompensationContent />;
      default:
        return (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#9ca3af" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>{SECTIONS.find(s => s.id === active)?.icon}</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{SECTIONS.find(s => s.id === active)?.label}</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>This section is ready and waiting for data.</div>
          </div>
        );
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Inter', -apple-system, sans-serif", background: "#f8f9fc", overflow: "hidden" }}>

      {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
      <div style={{ width: 220, background: "white", borderRight: "1px solid #f3f4f6", display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto" }}>

        {/* Profile summary */}
        <div style={{ padding: "20px 16px", borderBottom: "1px solid #f3f4f6", textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg,#4f46e5,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px", fontSize: 22, color: "white", fontWeight: 800 }}>
            YM
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Yousif Mohammed</div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Field Operations Manager</div>
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>PACT-FOM-0042</div>
          <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
            <StatusBadge label="● Active" color="green" />
          </div>
          {/* Overall progress */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>Profile</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: overall >= 80 ? "#22c55e" : "#f59e0b" }}>{overall}%</span>
            </div>
            <div style={{ height: 4, background: "#f3f4f6", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ height: "100%", background: overall >= 80 ? "#22c55e" : "#f59e0b", borderRadius: 99, width: `${overall}%`, transition: "width 0.3s" }} />
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto" }}>
          {GROUPS.map(group => (
            <div key={group} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 8px", marginBottom: 4 }}>{group}</div>
              {SECTIONS.filter(s => s.group === group).map(s => {
                const pct = COMPLETENESS[s.id];
                const isActive = active === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActive(s.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      padding: "7px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                      background: isActive ? "#eef2ff" : "transparent",
                      color: isActive ? "#4f46e5" : "#374151",
                      fontWeight: isActive ? 700 : 500, fontSize: 12, textAlign: "left",
                      transition: "all 0.15s",
                    }}
                  >
                    <span style={{ fontSize: 14, lineHeight: 1 }}>{s.icon}</span>
                    <span style={{ flex: 1 }}>{s.label}</span>
                    <CompletionDot pct={pct} />
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom actions */}
        <div style={{ padding: "12px 8px", borderTop: "1px solid #f3f4f6", display: "flex", flexDirection: "column", gap: 6 }}>
          <button style={{ fontSize: 11, fontWeight: 600, color: "#4f46e5", background: "#eef2ff", border: "none", borderRadius: 8, padding: "8px 0", cursor: "pointer", width: "100%" }}>
            📧 Send Email
          </button>
          <button style={{ fontSize: 11, fontWeight: 600, color: "#dc2626", background: "#fef2f2", border: "none", borderRadius: 8, padding: "8px 0", cursor: "pointer", width: "100%" }}>
            🚪 Offboard
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Top bar */}
        <div style={{ background: "white", borderBottom: "1px solid #f3f4f6", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button style={{ fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              ← HR / Users
            </button>
            <span style={{ color: "#d1d5db" }}>|</span>
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Yousif Mohammed</span>
              <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: 8 }}>
                {SECTIONS.find(s => s.id === active)?.icon} {SECTIONS.find(s => s.id === active)?.label}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ fontSize: 12, fontWeight: 600, color: "#374151", background: "#f3f4f6", border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer" }}>
              Export PDF
            </button>
            <button style={{ fontSize: 12, fontWeight: 600, color: "white", background: "#4f46e5", border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer" }}>
              ✎ Edit Profile
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
