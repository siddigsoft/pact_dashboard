import { useState } from "react";

const NAV = [
  { id: "overview",     icon: "🏠", label: "Overview",               group: "Profile" },
  { id: "employment",   icon: "💼", label: "Employment & Contract",  group: "Profile" },
  { id: "personal",     icon: "👤", label: "Personal Details",       group: "Profile" },
  { id: "location",     icon: "📍", label: "Location & Work",        group: "Profile" },
  { id: "education",    icon: "🎓", label: "Education & Experience", group: "Background" },
  { id: "documents",    icon: "📁", label: "Document Vault",         group: "Background" },
  { id: "skills",       icon: "⚡", label: "Skills & Languages",     group: "Background" },
  { id: "training",     icon: "🏅", label: "Training & Certs",       group: "Background" },
  { id: "dependents",   icon: "👨‍👩‍👧", label: "Dependents",             group: "Background" },
  { id: "equipment",    icon: "💻", label: "Equipment",              group: "Background" },
  { id: "policies",     icon: "📜", label: "Policy Acknowledgements",group: "Background" },
  { id: "compensation", icon: "💰", label: "Compensation & Bank",    group: "Finance" },
  { id: "performance",  icon: "📊", label: "Performance",            group: "Finance" },
  { id: "benefits",     icon: "🛡️", label: "Benefits",               group: "Finance" },
  { id: "access",       icon: "🔒", label: "Access & Security",      group: "System" },
  { id: "itaccounts",   icon: "🖥️", label: "IT Accounts",            group: "System" },
];

const GROUPS = ["Profile", "Background", "Finance", "System"];

const COMPLETENESS: Record<string, number> = {
  overview: 100, employment: 90, personal: 70, location: 85,
  education: 100, documents: 60, skills: 80, training: 50,
  dependents: 100, equipment: 100, policies: 80,
  compensation: 100, performance: 100, benefits: 60,
  access: 100, itaccounts: 100,
};

// ── Shared helpers ───────────────────────────────────────────────────────────

function Dot({ pct }: { pct: number }) {
  const c = pct === 0 ? "#e5e7eb" : pct < 50 ? "#fbbf24" : pct < 100 ? "#60a5fa" : "#22c55e";
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: c, display: "inline-block", flexShrink: 0 }} />;
}

function Tag({ label, color }: { label: string; color: "green" | "amber" | "blue" | "red" | "gray" | "purple" | "indigo" }) {
  const map: Record<string, [string, string]> = {
    green:  ["#dcfce7","#166534"], amber: ["#fef3c7","#92400e"], blue:   ["#dbeafe","#1e40af"],
    red:    ["#fee2e2","#991b1b"], gray:  ["#f3f4f6","#374151"], purple: ["#f3e8ff","#6b21a8"],
    indigo: ["#eef2ff","#3730a3"],
  };
  const [bg, fg] = map[color] ?? map.gray;
  return <span style={{ padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: bg, color: fg }}>{label}</span>;
}

function Field({ label, value, wide, required }: { label: string; value?: string; wide?: boolean; required?: boolean }) {
  return (
    <div style={{ gridColumn: wide ? "1/-1" : undefined, display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}{required && <span style={{ color: "#ef4444", marginLeft: 2 }}>*</span>}
      </span>
      <span style={{ fontSize: 13, fontWeight: 500, color: value ? "#111827" : "#d1d5db", fontStyle: value ? "normal" : "italic" }}>
        {value || "Not filled"}
      </span>
    </div>
  );
}

function Card({ title, badge, children, action }: { title: string; badge?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ background: "white", border: "1px solid #f3f4f6", borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ padding: "12px 18px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: "#111827", flex: 1 }}>{title}</span>
        {badge}
        {action}
      </div>
      <div style={{ padding: "14px 18px" }}>{children}</div>
    </div>
  );
}

function Grid3({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>{children}</div>;
}

function EditBtn({ small }: { small?: boolean }) {
  return (
    <button style={{ fontSize: 11, fontWeight: 600, color: "#4f46e5", background: "#eef2ff", border: "none", borderRadius: 6, padding: small ? "3px 8px" : "4px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>
      ✎ Edit
    </button>
  );
}

// ── Section contents ─────────────────────────────────────────────────────────

function OverviewSection() {
  const overall = Math.round(Object.values(COMPLETENESS).reduce((a, b) => a + b, 0) / Object.keys(COMPLETENESS).length);
  const incomplete = NAV.filter(n => COMPLETENESS[n.id] < 100);
  return (
    <>
      {/* Completeness banner */}
      <div style={{ background: "linear-gradient(135deg,#1D3461 0%,#0F2041 100%)", borderRadius: 12, padding: "16px 20px", marginBottom: 14, color: "white" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 2 }}>Profile Completeness</div>
            <div style={{ fontSize: 30, fontWeight: 800 }}>{overall}%</div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{incomplete.length} section{incomplete.length !== 1 ? "s" : ""} need attention</div>
          </div>
          <svg width="60" height="60" viewBox="0 0 60 60">
            <circle cx="30" cy="30" r="24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="7" />
            <circle cx="30" cy="30" r="24" fill="none" stroke="white" strokeWidth="7"
              strokeDasharray={`${2*Math.PI*24*overall/100} ${2*Math.PI*24*(1-overall/100)}`}
              strokeLinecap="round" transform="rotate(-90 30 30)" />
          </svg>
        </div>
        <div style={{ marginTop: 10, background: "rgba(255,255,255,0.15)", borderRadius: 8, height: 6, overflow: "hidden" }}>
          <div style={{ height: "100%", background: "white", borderRadius: 8, width: `${overall}%` }} />
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
        {[
          { l: "Days Employed",  v: "847",      i: "📅" },
          { l: "Department",     v: "Field Ops", i: "🏢" },
          { l: "Contract Ends",  v: "Dec 2025",  i: "📋" },
          { l: "Leave Balance",  v: "14 days",   i: "🌴" },
        ].map(s => (
          <div key={s.l} style={{ background: "#f9fafb", borderRadius: 10, padding: "10px 12px", border: "1px solid #f3f4f6" }}>
            <div style={{ fontSize: 18, marginBottom: 3 }}>{s.i}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{s.v}</div>
            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Profile photo & summary */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 14, marginBottom: 14 }}>
        <Card title="Profile Photo">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg,#1D3461,#0F2041)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, color: "white", fontWeight: 800 }}>YM</div>
            <button style={{ fontSize: 11, fontWeight: 600, color: "#4f46e5", background: "#eef2ff", border: "none", borderRadius: 7, padding: "5px 12px", cursor: "pointer" }}>📷 Upload Photo</button>
            <div style={{ fontSize: 10, color: "#9ca3af", textAlign: "center" }}>JPG/PNG/WebP · max 5MB</div>
          </div>
        </Card>
        <Card title="Professional Summary" action={<EditBtn />}>
          <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.65, margin: 0 }}>
            Experienced Field Operations Manager with 12+ years in humanitarian aid delivery across Sudan and South Sudan. Specialises in logistics coordination, community engagement, and multi-agency programme management under UNHCR and IRC frameworks.
          </p>
          <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Tag label="Last active: 2 hrs ago" color="green" />
            <Tag label="Onboarding: 9/10" color="amber" />
            <Tag label="Docs verified: 4/6" color="blue" />
          </div>
        </Card>
      </div>

      {/* Checklist */}
      <Card title="Section Completion Checklist">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
          {NAV.map(s => {
            const pct = COMPLETENESS[s.id];
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, background: "#f9fafb", border: "1px solid #f3f4f6" }}>
                <Dot pct={pct} />
                <span style={{ fontSize: 11, flex: 1, color: "#374151" }}>{s.icon} {s.label}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: pct === 100 ? "#22c55e" : pct === 0 ? "#9ca3af" : "#f59e0b" }}>{pct}%</span>
              </div>
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
      <Card title="Job Information" action={<EditBtn />}>
        <Grid3>
          <Field label="Job Title"         value="Field Operations Manager" />
          <Field label="System Role"        value="FOM (Field Ops Manager)" />
          <Field label="Department"         value="Field Operations" />
          <Field label="Reports To"         value="Ahmed Hassan (Director)" />
          <Field label="Employment Type"    value="Full-time" />
          <Field label="Working Pattern"    value="On-site" />
        </Grid3>
      </Card>
      <Card title="Contract Details" action={<EditBtn />}>
        <Grid3>
          <Field label="Contract Type"      value="Salary" />
          <Field label="Contract Start"     value="Jan 15, 2023" />
          <Field label="Contract End"       value="Dec 31, 2025" required />
          <Field label="Probation End"      value="Apr 15, 2023" />
          <Field label="Working Schedule"   value="Standard (40h/week)" />
          <Field label="Employee ID"        value="PACT-FOM-0042" />
        </Grid3>
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Tag label="✅ Probation Confirmed" color="green" />
          <div style={{ flex: 1 }} />
          <div style={{ padding: "8px 12px", background: "#fef3c7", borderRadius: 8, border: "1px solid #fde68a", fontSize: 12, color: "#92400e" }}>
            ⚠️ Contract expires in <strong>164 days</strong> — consider renewal
          </div>
        </div>
      </Card>
      <Card title="Onboarding Status" badge={<Tag label="9/10 Complete" color="green" />}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 7 }}>
          {["Profile Created","Role Assigned","Department Set","Contract Set","Salary Config","Bank Account","Employee ID","Documents","Personal Info","Education"].map((step, i) => (
            <div key={step} style={{ textAlign: "center", padding: "7px 4px", background: i === 7 ? "#fef3c7" : "#f0fdf4", border: `1px solid ${i === 7 ? "#fde68a" : "#bbf7d0"}`, borderRadius: 8 }}>
              <div style={{ fontSize: 15, marginBottom: 2 }}>{i === 7 ? "⚠️" : "✅"}</div>
              <div style={{ fontSize: 9, color: "#374151", lineHeight: 1.3 }}>{step}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Preferences" action={<EditBtn />}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>Daily Task Digest Email</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>Receive a morning summary of your assigned tasks</div>
          </div>
          <div style={{ width: 40, height: 22, borderRadius: 11, background: "#22c55e", position: "relative", cursor: "pointer" }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "white", position: "absolute", top: 2, right: 2, boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
          </div>
        </div>
      </Card>
    </>
  );
}

function PersonalSection() {
  return (
    <>
      <Card title="Identity" action={<EditBtn />}>
        <Grid3>
          <Field label="Date of Birth"     value="March 12, 1988" />
          <Field label="Gender"            value="Male" />
          <Field label="Nationality"       value="Sudanese" />
          <Field label="Marital Status"    value="Married" />
          <Field label="Blood Type"        value="O+" />
          <Field label="Personal ID No."   value="SUD-198803-42819" />
        </Grid3>
      </Card>
      <Card title="Passport" action={<EditBtn />}>
        <Grid3>
          <Field label="Passport No."      value="SD1928374" />
          <Field label="Issue Date"        value="Jun 2019" />
          <Field label="Passport Expiry"   value="Jun 30, 2027" />
          <Field label="Issue Country"     value="Sudan" />
        </Grid3>
      </Card>
      <Card title="Home Address" action={<EditBtn />}>
        <Grid3>
          <Field label="Address Line 1"    value="Block 14, House 7" />
          <Field label="Address Line 2"    value="Near Al Manara Mosque" />
          <Field label="Neighbourhood"     value="Al Riyadh" />
          <Field label="City"              value="Khartoum" />
          <Field label="Country"           value="Sudan" />
        </Grid3>
      </Card>
      <Card title="Emergency Contact" action={<EditBtn />}>
        <Grid3>
          <Field label="Contact Name"      value="Fatima Omar" />
          <Field label="Relationship"      value="Spouse" />
          <Field label="Phone"             value="+249 912 345 678" />
          <Field label="Email"             value="fatima.omar@gmail.com" />
          <Field label="City"              value="Khartoum" />
        </Grid3>
      </Card>
      <Card title="Professional Summary" action={<EditBtn />}>
        <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.65, margin: 0 }}>
          Experienced Field Operations Manager with 12+ years in humanitarian aid delivery across Sudan and South Sudan. Specialises in logistics, community engagement, and multi-agency coordination.
        </p>
      </Card>
    </>
  );
}

function LocationSection() {
  return (
    <>
      <Card title="Field Assignment" action={<EditBtn />}>
        <Grid3>
          <Field label="Primary Hub"       value="Khartoum HQ" />
          <Field label="Secondary Hub"     value="Kassala Field Base" />
          <Field label="State"             value="Khartoum State" />
          <Field label="Locality"          value="Khartoum District" />
          <Field label="Work Location"     value="On-site" />
          <Field label="Assigned Since"    value="Jan 15, 2023" />
        </Grid3>
      </Card>
      <Card title="GPS Location Data">
        <Grid3>
          <Field label="Latitude"          value="15.5007° N" />
          <Field label="Longitude"         value="32.5599° E" />
          <Field label="Accuracy"          value="±12 m" />
          <Field label="Sharing Status"    value="Enabled" />
          <Field label="Last Updated"      value="Today, 09:14 AM" />
          <Field label="Device"            value="Samsung Galaxy A54" />
        </Grid3>
        <div style={{ marginTop: 12, borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "8px 12px", fontSize: 12, color: "#166534", display: "flex", alignItems: "center", gap: 6 }}>
          📡 Location sharing active · Last ping 14 minutes ago
        </div>
      </Card>
      <Card title="Contact Details at Duty Station" action={<EditBtn />}>
        <Grid3>
          <Field label="Office Phone"      value="+249 183 777 001" />
          <Field label="Office Email"      value="y.mohammed@pact-sd.org" />
          <Field label="Desk No."          value="3B-14" />
        </Grid3>
      </Card>
    </>
  );
}

function EducationSection() {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#111827" }}>🎓 Education History</h4>
        <button style={{ fontSize: 11, fontWeight: 600, color: "#4f46e5", background: "#eef2ff", border: "none", borderRadius: 7, padding: "5px 11px", cursor: "pointer" }}>+ Add</button>
      </div>
      {[
        { d: "Bachelor of Business Administration", s: "University of Khartoum", y: "2010", f: "Management & Finance", c: "Sudan" },
        { d: "High School Certificate", s: "Al-Ahfad Academy", y: "2006", f: "Science Stream", c: "Sudan" },
      ].map(e => (
        <div key={e.d} style={{ display: "flex", gap: 12, padding: "12px 14px", borderRadius: 10, border: "1px solid #f3f4f6", background: "white", marginBottom: 8 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "#eef2ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>🎓</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{e.d}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{e.s} · {e.c} · {e.y}</div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{e.f}</div>
          </div>
          <EditBtn small />
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, marginTop: 18 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#111827" }}>💼 Work Experience</h4>
        <button style={{ fontSize: 11, fontWeight: 600, color: "#4f46e5", background: "#eef2ff", border: "none", borderRadius: 7, padding: "5px 11px", cursor: "pointer" }}>+ Add</button>
      </div>
      {[
        { t: "Field Operations Manager", o: "UNHCR Sudan",        f: "2020", to: "Present", cur: true,  loc: "Khartoum" },
        { t: "Program Coordinator",      o: "IRC International",  f: "2016", to: "2020",   cur: false, loc: "Juba, South Sudan" },
        { t: "Field Officer",            o: "Save the Children",  f: "2012", to: "2016",   cur: false, loc: "Darfur, Sudan" },
      ].map(e => (
        <div key={e.t} style={{ display: "flex", gap: 12, padding: "12px 14px", borderRadius: 10, border: "1px solid #f3f4f6", background: "white", marginBottom: 8 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>💼</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", display: "flex", alignItems: "center", gap: 6 }}>
              {e.t}
              {e.cur && <Tag label="Current" color="green" />}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>🏢 {e.o} · 📍 {e.loc}</div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>📅 {e.f} — {e.to}</div>
          </div>
          <EditBtn small />
        </div>
      ))}
    </>
  );
}

function DocumentsSection() {
  const docs = [
    { type: "🪪 National ID",      name: "national_id_scan.pdf",   size: "1.2 MB", date: "Mar 2024", expiry: null,       v: "verified" },
    { type: "🛂 Passport",          name: "passport_copy.pdf",      size: "2.4 MB", date: "Mar 2024", expiry: "Jun 2027", v: "verified" },
    { type: "📷 Staff Photo",       name: "photo_official.jpg",     size: "340 KB", date: "Jan 2023", expiry: null,       v: "verified" },
    { type: "📄 CV / Resume",       name: "cv_2024.pdf",            size: "450 KB", date: "Feb 2024", expiry: null,       v: "verified" },
    { type: "🎓 Bachelor Degree",   name: "bsc_certificate.pdf",    size: "3.1 MB", date: "Mar 2024", expiry: null,       v: "pending" },
    { type: "📋 Work Permit",       name: "work_permit_2024.pdf",   size: "1.8 MB", date: "Jan 2024", expiry: "Dec 2024", v: "rejected" },
  ];
  const vMeta: Record<string, { label: string; bg: string; fg: string; icon: string }> = {
    verified: { label: "Verified",       bg: "#dcfce7", fg: "#166534", icon: "✅" },
    pending:  { label: "Pending Review", bg: "#fef3c7", fg: "#92400e", icon: "⏳" },
    rejected: { label: "Rejected",       bg: "#fee2e2", fg: "#991b1b", icon: "❌" },
  };
  const contracts = [
    { name: "Employment Agreement 2023.pdf", signed: "Jan 15, 2023", size: "820 KB" },
    { name: "Renewal Addendum 2024.pdf",     signed: "Jan 02, 2024", size: "340 KB" },
  ];
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button style={{ fontSize: 12, fontWeight: 600, color: "white", background: "#1D3461", border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer" }}>
          + Upload Document
        </button>
      </div>
      <Card title={`HR Documents (${docs.length})`} badge={<Tag label={`${docs.filter(d=>d.v==="verified").length} verified`} color="green" />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {docs.map(d => {
            const vm = vMeta[d.v];
            const expiring = d.expiry && d.expiry === "Dec 2024";
            return (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 11px", borderRadius: 8, border: `1px solid ${expiring ? "#fde68a" : "#f3f4f6"}`, background: expiring ? "#fffbeb" : "#fafafa" }}>
                <span style={{ fontSize: 17 }}>{d.type.split(" ")[0]}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{d.type.split(" ").slice(1).join(" ")}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>{d.name} · {d.size} · {d.date}{d.expiry ? ` · Expires ${d.expiry}` : ""}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: vm.bg, color: vm.fg, whiteSpace: "nowrap" }}>
                  {vm.icon} {vm.label}
                </span>
                {expiring && <Tag label="⚠️ Expiring" color="amber" />}
                <div style={{ display: "flex", gap: 5 }}>
                  <button style={{ fontSize: 10, color: "#4f46e5", background: "#eef2ff", border: "none", borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}>View</button>
                  <button style={{ fontSize: 10, color: "#6b7280", background: "#f3f4f6", border: "none", borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}>⬇</button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="Employment Contracts" badge={<Tag label={`${contracts.length} files`} color="blue" />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {contracts.map(c => (
            <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 11px", borderRadius: 8, border: "1px solid #f3f4f6", background: "#fafafa" }}>
              <span style={{ fontSize: 18 }}>📝</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>Signed {c.signed} · {c.size}</div>
              </div>
              <Tag label="✅ Signed" color="green" />
              <button style={{ fontSize: 10, color: "#4f46e5", background: "#eef2ff", border: "none", borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}>View</button>
            </div>
          ))}
        </div>
        {/* Upload new contract */}
        <div style={{ marginTop: 10, padding: "10px", borderRadius: 8, border: "2px dashed #e5e7eb", textAlign: "center", color: "#9ca3af", fontSize: 12, cursor: "pointer" }}>
          📎 Drop contract PDF here to upload
        </div>
      </Card>
    </>
  );
}

function SkillsSection() {
  const skills = [
    { name: "Project Management",   level: "Expert",       cat: "Management" },
    { name: "Data Analysis",        level: "Advanced",     cat: "Technical" },
    { name: "Budget Management",    level: "Advanced",     cat: "Finance" },
    { name: "Community Engagement", level: "Expert",       cat: "Field" },
    { name: "Report Writing",       level: "Advanced",     cat: "Communication" },
    { name: "MS Office Suite",      level: "Expert",       cat: "Technical" },
    { name: "GIS / Mapping",        level: "Intermediate", cat: "Technical" },
  ];
  const langs = [
    { name: "Arabic",   prof: "Native" },
    { name: "English",  prof: "Fluent" },
    { name: "French",   prof: "Conversational" },
  ];
  const levelColor: Record<string, [string, string]> = {
    Expert:       ["#fef3c7","#92400e"],
    Advanced:     ["#ede9fe","#5b21b6"],
    Intermediate: ["#dbeafe","#1e40af"],
    Beginner:     ["#f3f4f6","#374151"],
  };
  const profColor: Record<string, [string, string]> = {
    Native:        ["#dcfce7","#166534"],
    Fluent:        ["#dbeafe","#1e40af"],
    Conversational:["#fef3c7","#92400e"],
    Basic:         ["#f3f4f6","#374151"],
  };
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>⚡ Skills</h4>
        <button style={{ fontSize: 11, fontWeight: 600, color: "#4f46e5", background: "#eef2ff", border: "none", borderRadius: 7, padding: "5px 11px", cursor: "pointer" }}>+ Add Skill</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 22 }}>
        {skills.map(s => {
          const [bg, fg] = levelColor[s.level] ?? ["#f3f4f6","#374151"];
          return (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, border: "1px solid #e5e7eb", background: "white" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{s.name}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: bg, color: fg }}>{s.level}</span>
              <span style={{ fontSize: 15, cursor: "pointer", color: "#d1d5db" }}>×</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>🌍 Languages</h4>
        <button style={{ fontSize: 11, fontWeight: 600, color: "#4f46e5", background: "#eef2ff", border: "none", borderRadius: 7, padding: "5px 11px", cursor: "pointer" }}>+ Add</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {langs.map(l => {
          const [bg, fg] = profColor[l.prof] ?? ["#f3f4f6","#374151"];
          return (
            <div key={l.name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, border: "1px solid #e5e7eb", background: "white" }}>
              <span style={{ fontSize: 14 }}>🌐</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{l.name}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: bg, color: fg }}>{l.prof}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function TrainingSection() {
  const certs = [
    { name: "HEAT (Hostile Environment Awareness Training)", issuer: "UNDSS",        date: "Mar 2023", expiry: "Mar 2025", valid: true  },
    { name: "First Aid & Emergency Response",               issuer: "Red Cross",     date: "Jun 2022", expiry: "Jun 2024", valid: false },
    { name: "Advanced Project Management",                  issuer: "PMI",           date: "Nov 2021", expiry: null,       valid: true  },
    { name: "SPHERE Standards for Humanitarian Aid",        issuer: "UNHCR Academy", date: "Jan 2024", expiry: null,       valid: true  },
  ];
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button style={{ fontSize: 11, fontWeight: 600, color: "white", background: "#1D3461", border: "none", borderRadius: 7, padding: "6px 13px", cursor: "pointer" }}>+ Add Certification</button>
      </div>
      <Card title={`Certifications (${certs.length})`} badge={<Tag label={`${certs.filter(c=>c.valid).length} active`} color="green" />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {certs.map(c => (
            <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 8, border: `1px solid ${c.valid ? "#f3f4f6" : "#fde68a"}`, background: c.valid ? "#fafafa" : "#fffbeb" }}>
              <span style={{ fontSize: 20 }}>🏅</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>
                  Issued by {c.issuer} · {c.date}
                  {c.expiry ? ` · Expires ${c.expiry}` : " · No expiry"}
                </div>
              </div>
              {c.valid ? <Tag label="✅ Valid" color="green" /> : <Tag label="⚠️ Expired" color="amber" />}
              <button style={{ fontSize: 10, color: "#6b7280", background: "#f3f4f6", border: "none", borderRadius: 5, padding: "3px 7px", cursor: "pointer" }}>Edit</button>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Training History">
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {[
            { name: "Field Security Level 3", provider: "UNDSS", dur: "3 days", date: "Jan 2024" },
            { name: "Humanitarian Coordination", provider: "OCHA", dur: "2 weeks", date: "Aug 2023" },
            { name: "Data Collection & ODK", provider: "Internal PACT", dur: "1 day", date: "May 2023" },
          ].map(t => (
            <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 7, border: "1px solid #f3f4f6", background: "#fafafa" }}>
              <span style={{ fontSize: 16 }}>📚</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{t.name}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>{t.provider} · {t.dur} · {t.date}</div>
              </div>
              <Tag label="Completed" color="blue" />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function DependentsSection() {
  const deps = [
    { name: "Fatima Mohammed",  rel: "Spouse",     dob: "Apr 5, 1990",  nat: "Sudanese", id: "SUD-199004-11234" },
    { name: "Omar Mohammed",    rel: "Son",         dob: "Jun 2, 2014",  nat: "Sudanese", id: "—" },
    { name: "Aisha Mohammed",   rel: "Daughter",    dob: "Sep 18, 2017", nat: "Sudanese", id: "—" },
  ];
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button style={{ fontSize: 11, fontWeight: 600, color: "white", background: "#1D3461", border: "none", borderRadius: 7, padding: "6px 13px", cursor: "pointer" }}>+ Add Dependent</button>
      </div>
      <Card title={`Dependents & Family (${deps.length})`} badge={<Tag label="Insurance eligible" color="green" />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {deps.map(d => (
            <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8, border: "1px solid #f3f4f6", background: "#fafafa" }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#e0e7ff,#c7d2fe)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>
                {d.rel === "Spouse" ? "👩" : d.rel === "Son" ? "👦" : "👧"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{d.name}</div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>{d.rel} · DOB: {d.dob} · {d.nat}</div>
                {d.id !== "—" && <div style={{ fontSize: 10, color: "#9ca3af" }}>ID: {d.id}</div>}
              </div>
              <EditBtn small />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function EquipmentSection() {
  const items = [
    { name: "Dell Latitude 5540",    type: "Laptop",    sn: "DL5540-KH-0042", issued: "Jan 2023",  status: "In Use" },
    { name: "Samsung Galaxy A54",    type: "Phone",     sn: "SM-A546B-0788",  issued: "Mar 2023",  status: "In Use" },
    { name: "Garmin GPSMAP 67",      type: "GPS Device",sn: "GPM67-2209-KH",  issued: "Nov 2023",  status: "In Use" },
    { name: "HP LaserJet MFP",       type: "Printer",   sn: "HP-MFP-0031",    issued: "Jan 2023",  status: "Pool" },
  ];
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button style={{ fontSize: 11, fontWeight: 600, color: "white", background: "#1D3461", border: "none", borderRadius: 7, padding: "6px 13px", cursor: "pointer" }}>+ Assign Asset</button>
      </div>
      <Card title={`Assigned Equipment (${items.filter(i=>i.status==="In Use").length} active)`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {items.map(eq => (
            <div key={eq.sn} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", borderRadius: 8, border: "1px solid #f3f4f6", background: "#fafafa" }}>
              <span style={{ fontSize: 20 }}>{eq.type === "Laptop" ? "💻" : eq.type === "Phone" ? "📱" : eq.type === "GPS Device" ? "📡" : "🖨️"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{eq.name}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>S/N: {eq.sn} · Issued {eq.issued}</div>
              </div>
              <Tag label={eq.type} color="blue" />
              <Tag label={eq.status} color={eq.status === "In Use" ? "green" : "gray"} />
              <button style={{ fontSize: 10, color: "#dc2626", background: "#fee2e2", border: "none", borderRadius: 5, padding: "3px 7px", cursor: "pointer" }}>Return</button>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function PoliciesSection() {
  const policies = [
    { name: "Code of Conduct",             signed: "Jan 16, 2023", mandatory: true,  valid: true  },
    { name: "Data Protection & Privacy",   signed: "Jan 16, 2023", mandatory: true,  valid: true  },
    { name: "Anti-Fraud & Corruption",     signed: "Jan 17, 2023", mandatory: true,  valid: true  },
    { name: "Security Protocols 2024",     signed: "Feb 01, 2024", mandatory: true,  valid: true  },
    { name: "Travel & Expense Policy",     signed: "Mar 10, 2023", mandatory: false, valid: true  },
    { name: "IT Acceptable Use Policy",    signed: null,           mandatory: true,  valid: false },
    { name: "Safeguarding & PSEA Policy",  signed: null,           mandatory: true,  valid: false },
  ];
  const signed = policies.filter(p => p.valid).length;
  return (
    <>
      <Card title="Policy Acknowledgements" badge={<Tag label={`${signed}/${policies.length} signed`} color={signed === policies.length ? "green" : "amber"} />}>
        {signed < policies.length && (
          <div style={{ padding: "8px 12px", background: "#fef3c7", borderRadius: 8, border: "1px solid #fde68a", marginBottom: 12, fontSize: 12, color: "#92400e" }}>
            ⚠️ {policies.length - signed} mandatory polic{policies.length - signed === 1 ? "y requires" : "ies require"} signature
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {policies.map(p => (
            <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, border: `1px solid ${!p.valid && p.mandatory ? "#fde68a" : "#f3f4f6"}`, background: !p.valid && p.mandatory ? "#fffbeb" : "#fafafa" }}>
              <span style={{ fontSize: 17 }}>📜</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                  {p.signed ? `Signed ${p.signed}` : "Not yet signed"}
                  {p.mandatory && <span style={{ marginLeft: 6, fontWeight: 700, color: "#dc2626" }}>• Required</span>}
                </div>
              </div>
              {p.valid
                ? <Tag label="✅ Signed" color="green" />
                : <button style={{ fontSize: 11, fontWeight: 700, color: "white", background: "#1D3461", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Sign Now</button>
              }
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function CompensationSection() {
  return (
    <>
      <Card title="Salary Configuration" action={<EditBtn />}>
        <Grid3>
          <Field label="Contract Type"          value="Salary" />
          <Field label="Classification Level"   value="Level B" />
          <Field label="Base Salary"            value="SDG 250,000 / month" />
          <Field label="Transport Allowance"    value="SDG 15,000" />
          <Field label="Housing Allowance"      value="SDG 20,000" />
          <Field label="Total Package"          value="SDG 285,000 / month" />
          <Field label="Currency"               value="SDG (Sudanese Pound)" />
          <Field label="Pay Frequency"          value="Monthly" />
          <Field label="Effective Date"         value="Jan 15, 2023" />
        </Grid3>
      </Card>
      <Card title="Classification History">
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {[
            { level: "Level B", salary: "SDG 250,000", from: "Jan 2024", note: "Annual increment" },
            { level: "Level A", salary: "SDG 200,000", from: "Jan 2023", note: "Initial classification" },
          ].map((h, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, border: "1px solid #f3f4f6", background: i === 0 ? "#f0fdf4" : "#fafafa" }}>
              <span style={{ fontSize: 14 }}>📈</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{h.level} · {h.salary}/month</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>Effective {h.from} · {h.note}</div>
              </div>
              {i === 0 && <Tag label="Current" color="green" />}
            </div>
          ))}
        </div>
      </Card>
      <Card title="Bank Account" action={<EditBtn />}>
        <Grid3>
          <Field label="Bank Name"       value="Bank of Khartoum" />
          <Field label="Account Name"    value="Yousif A. Mohammed" />
          <Field label="Account Number"  value="•••• •••• 4821" />
          <Field label="Branch"          value="Khartoum Main Branch" />
          <Field label="IBAN"            value="SD•••• •••• •••• ••93" />
        </Grid3>
      </Card>
      <Card title="EOSB / Gratuity (Sudan Labour Law)">
        <Grid3>
          <Field label="Years of Service"   value="2 years 6 months" />
          <Field label="Accrued Gratuity"   value="SDG 437,500" />
          <Field label="Formula Applied"    value="21 days / year (≤ 5 yrs)" />
          <Field label="Day Rate"           value="SDG 8,333" />
          <Field label="Calculation Date"   value="Jul 22, 2026" />
          <Field label="Projected (5 yrs)"  value="SDG 875,000" />
        </Grid3>
      </Card>
      <Card title="Salary Advances" badge={<Tag label="1 active" color="amber" />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {[
            { amount: "SDG 50,000", issued: "Mar 2024", remaining: "SDG 25,000", monthly: "SDG 12,500", status: "Recovering" },
            { amount: "SDG 30,000", issued: "Sep 2023", remaining: "SDG 0",      monthly: "—",           status: "Fully Recovered" },
          ].map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, border: "1px solid #f3f4f6", background: "#fafafa" }}>
              <span style={{ fontSize: 16 }}>💵</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>Advance of {a.amount} · Issued {a.issued}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                  Remaining: {a.remaining}{a.monthly !== "—" ? ` · ${a.monthly}/month deduction` : ""}
                </div>
              </div>
              <Tag label={a.status} color={a.status === "Recovering" ? "amber" : "green"} />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function PerformanceSection() {
  const reviews = [
    { period: "Q1 2024", rating: 4.5, tasks: 42, onTime: 95, status: "Completed" },
    { period: "Q4 2023", rating: 4.2, tasks: 38, onTime: 89, status: "Completed" },
    { period: "Q3 2023", rating: 3.8, tasks: 31, onTime: 84, status: "Completed" },
    { period: "Q2 2023", rating: 4.0, tasks: 29, onTime: 90, status: "Completed" },
  ];
  const latest = reviews[0];
  const sparkPoints = reviews.map(r => r.rating);
  const sparkMax = 5, sparkMin = 3;
  const w = 140, h = 40;
  const pts = sparkPoints.map((v, i) => {
    const x = (i / (sparkPoints.length - 1)) * (w - 20) + 10;
    const y = h - 8 - ((v - sparkMin) / (sparkMax - sparkMin)) * (h - 16);
    return `${x},${y}`;
  }).join(" ");
  return (
    <>
      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
        {[
          { l: "Latest Rating",   v: `${latest.rating}/5`, i: "⭐", c: "#fef3c7", fc: "#92400e" },
          { l: "Tasks Completed", v: `${latest.tasks}`,   i: "✅", c: "#dcfce7", fc: "#166534" },
          { l: "On-Time Rate",    v: `${latest.onTime}%`, i: "⏱️", c: "#dbeafe", fc: "#1e40af" },
          { l: "Workload",        v: "Medium",             i: "📊", c: "#f3e8ff", fc: "#6b21a8" },
        ].map(k => (
          <div key={k.l} style={{ padding: "12px 14px", borderRadius: 10, background: k.c, border: `1px solid ${k.fc}22` }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{k.i}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: k.fc }}>{k.v}</div>
            <div style={{ fontSize: 10, color: k.fc, opacity: 0.8, marginTop: 1 }}>{k.l}</div>
          </div>
        ))}
      </div>

      <Card title="Rating Trend (Last 4 Cycles)">
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width={w} height={h} style={{ flexShrink: 0 }}>
            <polyline points={pts} fill="none" stroke="#1D3461" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {sparkPoints.map((v, i) => {
              const x = (i / (sparkPoints.length - 1)) * (w - 20) + 10;
              const y = h - 8 - ((v - sparkMin) / (sparkMax - sparkMin)) * (h - 16);
              return <circle key={i} cx={x} cy={y} r="4" fill="#1D3461" />;
            })}
          </svg>
          <div style={{ display: "flex", gap: 16 }}>
            {reviews.map(r => (
              <div key={r.period} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#111827" }}>{r.rating}</div>
                <div style={{ fontSize: 10, color: "#9ca3af" }}>{r.period}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card title="Review History">
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {reviews.map(r => (
            <div key={r.period} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, border: "1px solid #f3f4f6", background: "#fafafa" }}>
              <span style={{ fontSize: 16 }}>📊</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{r.period}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>Tasks: {r.tasks} · On-time: {r.onTime}%</div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: r.rating >= 4.5 ? "#166534" : r.rating >= 4 ? "#1e40af" : "#92400e" }}>
                ⭐ {r.rating}
              </div>
              <Tag label={r.status} color="green" />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function BenefitsSection() {
  const plans = [
    { name: "Medical Insurance — Family Plan", provider: "National Health Co.", coverage: "SDG 500,000/yr", status: "Active",   enrolled: "Jan 2023" },
    { name: "Life Insurance",                  provider: "Sudanese Insurance", coverage: "SDG 1,000,000",  status: "Active",   enrolled: "Jan 2023" },
    { name: "Dental & Vision Add-on",          provider: "National Health Co.", coverage: "SDG 50,000/yr", status: "Pending",  enrolled: null },
    { name: "Pension Contribution",            provider: "NSSF Sudan",          coverage: "8% of salary",  status: "Active",   enrolled: "Jan 2023" },
  ];
  return (
    <>
      <Card title="Enrolled Benefits" badge={<Tag label={`${plans.filter(p=>p.status==="Active").length} active`} color="green" />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {plans.map(p => (
            <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 8, border: "1px solid #f3f4f6", background: "#fafafa" }}>
              <span style={{ fontSize: 20 }}>🛡️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>{p.provider} · Coverage: {p.coverage}</div>
                {p.enrolled && <div style={{ fontSize: 10, color: "#9ca3af" }}>Enrolled {p.enrolled}</div>}
              </div>
              <Tag label={p.status} color={p.status === "Active" ? "green" : "amber"} />
            </div>
          ))}
        </div>
      </Card>
      <Card title="Leave Balances">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {[
            { type: "Annual Leave",  total: 21, taken: 7,  remaining: 14 },
            { type: "Sick Leave",    total: 10, taken: 2,  remaining: 8  },
            { type: "Compassionate", total: 3,  taken: 0,  remaining: 3  },
          ].map(l => (
            <div key={l.type} style={{ padding: "12px 14px", borderRadius: 10, background: "#f9fafb", border: "1px solid #f3f4f6" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 6 }}>{l.type}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#1D3461" }}>{l.remaining}</div>
              <div style={{ fontSize: 10, color: "#9ca3af" }}>days left of {l.total}</div>
              <div style={{ marginTop: 6, height: 4, background: "#e5e7eb", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", background: "#1D3461", borderRadius: 99, width: `${(l.remaining/l.total)*100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function AccessSection() {
  const roles = [
    { role: "FOM (Field Ops Manager)", hub: "System-wide", primary: true  },
    { role: "Supervisor",              hub: "Khartoum HQ", primary: false },
    { role: "Data Collector",          hub: "Kassala",     primary: false },
  ];
  const events = [
    { action: "Login",          device: "Chrome / Windows",   ip: "196.1.15.40",  time: "Today 09:02",    ok: true  },
    { action: "Login",          device: "Android App",        ip: "196.1.15.44",  time: "Yesterday 14:30",ok: true  },
    { action: "Failed Login",   device: "Unknown",            ip: "41.67.222.10", time: "Jun 20, 22:41",  ok: false },
    { action: "Password Reset", device: "Chrome / Windows",   ip: "196.1.15.40",  time: "Jun 20, 08:15",  ok: true  },
  ];
  return (
    <>
      <Card title="Role Assignments" action={<EditBtn />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {roles.map(r => (
            <div key={r.role} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, border: `1px solid ${r.primary ? "#dbeafe" : "#f3f4f6"}`, background: r.primary ? "#eff6ff" : "#fafafa" }}>
              <span style={{ fontSize: 16 }}>🔒</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{r.role}</div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>Scope: {r.hub}</div>
              </div>
              {r.primary ? <Tag label="Primary Role" color="blue" /> : <Tag label="Additional" color="gray" />}
              {!r.primary && <button style={{ fontSize: 10, color: "#dc2626", background: "#fee2e2", border: "none", borderRadius: 5, padding: "3px 7px", cursor: "pointer" }}>Remove</button>}
            </div>
          ))}
          <button style={{ fontSize: 11, fontWeight: 600, color: "#4f46e5", background: "#eef2ff", border: "1px dashed #c7d2fe", borderRadius: 8, padding: "7px", cursor: "pointer" }}>
            + Assign Additional Role
          </button>
        </div>
      </Card>
      <Card title="Security Event Log">
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {events.map((e, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, border: `1px solid ${e.ok ? "#f3f4f6" : "#fde68a"}`, background: e.ok ? "#fafafa" : "#fffbeb" }}>
              <span style={{ fontSize: 16 }}>{e.ok ? "✅" : "⚠️"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{e.action}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>{e.device} · IP {e.ip} · {e.time}</div>
              </div>
              <Tag label={e.ok ? "Success" : "Alert"} color={e.ok ? "green" : "amber"} />
            </div>
          ))}
        </div>
      </Card>
      <Card title="Account Status" action={<EditBtn />}>
        <Grid3>
          <Field label="Account Status"   value="Active" />
          <Field label="2FA Enabled"      value="Yes (TOTP)" />
          <Field label="Last Password Set" value="Jun 20, 2024" />
          <Field label="Sessions Active"   value="2 devices" />
          <Field label="Email Verified"    value="Yes" />
          <Field label="Created"           value="Jan 14, 2023" />
        </Grid3>
      </Card>
    </>
  );
}

function ITAccountsSection() {
  const accounts = [
    { system: "PACT Command Center",    username: "y.mohammed@pact-sd.org",  status: "Active",    provisioned: "Jan 14, 2023" },
    { system: "Microsoft 365",          username: "yousif.m@pactworld.org",  status: "Active",    provisioned: "Jan 15, 2023" },
    { system: "Zoom Meetings",          username: "yousif.pact@zoom.us",     status: "Active",    provisioned: "Feb 1, 2023" },
    { system: "SharePoint / OneDrive",  username: "yousif.m@pactworld.org",  status: "Active",    provisioned: "Jan 15, 2023" },
    { system: "ODK Collect",            username: "y.mohammed.field",        status: "Suspended", provisioned: "Jun 2023" },
  ];
  return (
    <>
      <Card title={`Provisioned Accounts (${accounts.filter(a=>a.status==="Active").length} active)`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {accounts.map(a => (
            <div key={a.system} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 12px", borderRadius: 8, border: "1px solid #f3f4f6", background: "#fafafa" }}>
              <span style={{ fontSize: 18 }}>🖥️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{a.system}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>{a.username} · Provisioned {a.provisioned}</div>
              </div>
              <Tag label={a.status} color={a.status === "Active" ? "green" : "red"} />
              <button style={{ fontSize: 10, color: "#4f46e5", background: "#eef2ff", border: "none", borderRadius: 5, padding: "3px 7px", cursor: "pointer" }}>
                {a.status === "Active" ? "Suspend" : "Reactivate"}
              </button>
            </div>
          ))}
        </div>
      </Card>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
        <button style={{ fontSize: 11, fontWeight: 600, color: "white", background: "#1D3461", border: "none", borderRadius: 7, padding: "6px 13px", cursor: "pointer" }}>+ Provision New Account</button>
      </div>
    </>
  );
}

// ── Top-bar action menus ─────────────────────────────────────────────────────

function CVExportMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const formats = [
    { label: "UN P11 Format",             icon: "🇺🇳" },
    { label: "Reverse Chronological",     icon: "📄" },
    { label: "Functional",                icon: "📊" },
    { label: "Combination",               icon: "📋" },
    { label: "Europass",                  icon: "🇪🇺" },
  ];
  return (
    <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, background: "white", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.12)", border: "1px solid #f3f4f6", zIndex: 100, minWidth: 210, overflow: "hidden" }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid #f3f4f6", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>Export CV As</div>
      {formats.map(f => (
        <button key={f.label} onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#374151", textAlign: "left" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
          onMouseLeave={e => (e.currentTarget.style.background = "none")}>
          <span>{f.icon}</span>{f.label}
        </button>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function UnifiedProfile() {
  const [active, setActive] = useState("overview");
  const [cvOpen, setCvOpen] = useState(false);

  const overall = Math.round(Object.values(COMPLETENESS).reduce((a, b) => a + b, 0) / Object.keys(COMPLETENESS).length);

  const renderContent = () => {
    switch (active) {
      case "overview":     return <OverviewSection />;
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
      default:             return null;
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Inter',-apple-system,sans-serif", background: "#f8f9fc", overflow: "hidden" }} onClick={() => cvOpen && setCvOpen(false)}>

      {/* ── LEFT SIDEBAR ──────────────────────────────────────────────────── */}
      <div style={{ width: 210, background: "white", borderRight: "1px solid #f3f4f6", display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto" }}>

        {/* Avatar + mini summary */}
        <div style={{ padding: "18px 14px", borderBottom: "1px solid #f3f4f6", textAlign: "center" }}>
          <div style={{ width: 62, height: 62, borderRadius: "50%", background: "linear-gradient(135deg,#1D3461,#0F2041)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px", fontSize: 22, color: "white", fontWeight: 800 }}>YM</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Yousif Mohammed</div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>Field Operations Manager</div>
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>PACT-FOM-0042</div>
          <div style={{ marginTop: 8, display: "flex", justifyContent: "center", gap: 6 }}>
            <Tag label="● Active" color="green" />
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>Profile</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: overall >= 80 ? "#22c55e" : "#f59e0b" }}>{overall}%</span>
            </div>
            <div style={{ height: 4, background: "#f3f4f6", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ height: "100%", background: overall >= 80 ? "#22c55e" : "#f59e0b", borderRadius: 99, width: `${overall}%` }} />
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "10px 6px", overflowY: "auto" }}>
          {GROUPS.map(group => (
            <div key={group} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 8px", marginBottom: 3 }}>{group}</div>
              {NAV.filter(s => s.group === group).map(s => {
                const pct = COMPLETENESS[s.id];
                const isActive = active === s.id;
                return (
                  <button key={s.id} onClick={() => setActive(s.id)} style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "6px 9px", borderRadius: 7, border: "none", cursor: "pointer", background: isActive ? "#eef2ff" : "transparent", color: isActive ? "#1D3461" : "#374151", fontWeight: isActive ? 700 : 500, fontSize: 11.5, textAlign: "left", transition: "all 0.12s" }}>
                    <span style={{ fontSize: 13 }}>{s.icon}</span>
                    <span style={{ flex: 1 }}>{s.label}</span>
                    <Dot pct={pct} />
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Sidebar actions */}
        <div style={{ padding: "10px 8px", borderTop: "1px solid #f3f4f6", display: "flex", flexDirection: "column", gap: 5 }}>
          <button style={{ fontSize: 11, fontWeight: 600, color: "#4f46e5", background: "#eef2ff", border: "none", borderRadius: 7, padding: "7px 0", cursor: "pointer", width: "100%" }}>
            📧 Send Email
          </button>
          <button style={{ fontSize: 11, fontWeight: 600, color: "#374151", background: "#f3f4f6", border: "none", borderRadius: 7, padding: "7px 0", cursor: "pointer", width: "100%" }}>
            ✍️ Signatures
          </button>
          <button style={{ fontSize: 11, fontWeight: 600, color: "#374151", background: "#f3f4f6", border: "none", borderRadius: 7, padding: "7px 0", cursor: "pointer", width: "100%" }}>
            🆔 Employee Badge
          </button>
          <button style={{ fontSize: 11, fontWeight: 600, color: "#dc2626", background: "#fef2f2", border: "none", borderRadius: 7, padding: "7px 0", cursor: "pointer", width: "100%" }}>
            🚪 Offboard
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Top bar */}
        <div style={{ background: "white", borderBottom: "1px solid #f3f4f6", padding: "11px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button style={{ fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer" }}>← HR / Users</button>
            <span style={{ color: "#e5e7eb" }}>|</span>
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Yousif Mohammed</span>
              <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: 8 }}>
                {NAV.find(s => s.id === active)?.icon} {NAV.find(s => s.id === active)?.label}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 7, alignItems: "center", position: "relative" }}>
            {/* Workspace Dossier sync */}
            <button style={{ fontSize: 11, fontWeight: 600, color: "#374151", background: "#f3f4f6", border: "none", borderRadius: 7, padding: "6px 12px", cursor: "pointer" }}>
              📂 Sync Dossier
            </button>
            {/* CV Export */}
            <div style={{ position: "relative" }}>
              <button onClick={e => { e.stopPropagation(); setCvOpen(v => !v); }} style={{ fontSize: 11, fontWeight: 600, color: "#374151", background: "#f3f4f6", border: "none", borderRadius: 7, padding: "6px 12px", cursor: "pointer" }}>
                📄 Export CV ▾
              </button>
              <CVExportMenu open={cvOpen} onClose={() => setCvOpen(false)} />
            </div>
            {/* Edit */}
            <button style={{ fontSize: 12, fontWeight: 600, color: "white", background: "#1D3461", border: "none", borderRadius: 7, padding: "7px 14px", cursor: "pointer" }}>
              ✎ Edit Profile
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
