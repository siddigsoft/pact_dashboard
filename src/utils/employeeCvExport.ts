import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO, isValid } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

// ── Brand colours ────────────────────────────────────────────────────────────
const NAVY:   [number,number,number] = [15,  32,  65];
const NAVY2:  [number,number,number] = [29,  52,  97];
const LIGHT:  [number,number,number] = [245, 247, 252];
const MID:    [number,number,number] = [100, 110, 130];
const BORDER: [number,number,number] = [200, 205, 215];
const DARK:   [number,number,number] = [20,  20,  30];
const WHITE:  [number,number,number] = [255, 255, 255];

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (d?: string | null): string => {
  if (!d) return '—';
  try {
    const p = parseISO(d);
    return isValid(p) ? format(p, 'MMM yyyy') : d;
  } catch { return d; }
};

const DEGREE_LABELS: Record<string, string> = {
  phd: 'PhD / Doctorate', masters: "Master's Degree", bachelors: "Bachelor's Degree",
  diploma: 'Diploma', associate: 'Associate Degree', certificate: 'Certificate',
  professional: 'Professional Certification', high_school: 'High School',
  vocational: 'Vocational Training', other: 'Other',
};

const LANG_PROF: Record<string, string> = {
  native: 'Mother Tongue / Native',
  fluent: 'Fluent',
  conversational: 'Good / Conversational',
  basic: 'Limited / Elementary',
};

// ── Public interface ─────────────────────────────────────────────────────────
export interface CVContext {
  departmentName?: string;
  contractType?: string;
  contractStart?: string;
  contractEnd?: string;
  employmentType?: string;
  reportsToName?: string;
  hubName?: string;
}

// ── Main export function ─────────────────────────────────────────────────────
export async function generateEmployeeCV(user: any, ctx: CVContext = {}): Promise<void> {

  // Fetch all profile data in parallel
  const [
    { data: personal },
    { data: education },
    { data: experience },
    { data: skills },
    { data: languages },
    { data: references },
    { data: trainings },
  ] = await Promise.all([
    supabase.from('hr_employee_personal').select('*').eq('profile_id', user.id).maybeSingle(),
    supabase.from('hr_employee_education').select('*').eq('profile_id', user.id).order('graduation_year', { ascending: false }),
    supabase.from('hr_employee_experience').select('*').eq('profile_id', user.id).order('start_date', { ascending: false }),
    supabase.from('hr_employee_skills').select('*').eq('profile_id', user.id),
    supabase.from('hr_employee_languages').select('*').eq('profile_id', user.id),
    supabase.from('hr_employee_references').select('*').eq('profile_id', user.id),
    supabase.from('staff_certifications').select('*').eq('user_id', user.id).order('issue_date', { ascending: false }),
  ]);

  // ── Page setup ───────────────────────────────────────────────────────────
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 14, CW = PW - M * 2;
  const FOOTER_Y = PH - 12;
  let y = M;

  const checkPage = (need = 10) => {
    if (y + need > FOOTER_Y) { doc.addPage(); y = M; }
  };

  // ── HEADER BAR ──────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PW, 26, 'F');

  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('PACT', M, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('COMMAND CENTER', M, 16);
  doc.setFontSize(6.5);
  doc.text('STAFF PERSONAL HISTORY FORM  ·  UN P11 FORMAT  ·  CONFIDENTIAL', M, 22);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('PERSONAL HISTORY FORM', PW - M, 11, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy')}`, PW - M, 17, { align: 'right' });
  doc.text('World Bank / UN P11 Compliant Format', PW - M, 22, { align: 'right' });

  y = 31;

  // ── NAME / IDENTITY BANNER ──────────────────────────────────────────────
  doc.setFillColor(...LIGHT);
  doc.setDrawColor(...BORDER);
  doc.rect(M, y, CW, 24, 'FD');
  doc.setFillColor(...NAVY2);
  doc.rect(M, y, 3, 24, 'F');

  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(user.name || 'Unknown', M + 6, y + 9);

  const subtitle = [ctx.employmentType, ctx.departmentName, user.employeeId ? `ID: ${user.employeeId}` : null]
    .filter(Boolean).join('  ·  ');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MID);
  if (subtitle) doc.text(subtitle, M + 6, y + 16);

  doc.setTextColor(...DARK);
  doc.setFontSize(8);
  if (user.email) doc.text(user.email, PW - M - 2, y + 9, { align: 'right' });
  if (user.phone) doc.text(user.phone, PW - M - 2, y + 16, { align: 'right' });
  if (ctx.hubName) {
    doc.setTextColor(...MID);
    doc.setFontSize(7);
    doc.text(`Hub: ${ctx.hubName}`, PW - M - 2, y + 22, { align: 'right' });
  }

  y += 29;

  // ── SECTION HEADING HELPER ───────────────────────────────────────────────
  let sNum = 1;
  const section = (title: string) => {
    checkPage(12);
    doc.setFillColor(...NAVY);
    doc.rect(M, y, CW, 7, 'F');
    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(`${sNum++}.  ${title.toUpperCase()}`, M + 3, y + 5);
    y += 9;
    doc.setTextColor(...DARK);
  };

  // ── INFO GRID HELPER (label / value pairs in two columns) ───────────────
  const infoGrid = (rows: [string, string, string, string][]) => {
    const H = CW / 2;
    rows.forEach(([l1, v1, l2, v2]) => {
      checkPage(8);
      doc.setFillColor(...WHITE);
      doc.setDrawColor(...BORDER);
      doc.rect(M,     y, H, 8, 'FD');
      doc.rect(M + H, y, H, 8, 'FD');
      const cell = (lbl: string, val: string, cx: number) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(...MID);
        doc.text(lbl.toUpperCase(), cx + 2, y + 3.5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...DARK);
        // Truncate long values to fit in half-column
        const maxW = H - 4;
        const txt = doc.splitTextToSize(val || '—', maxW)[0] ?? '—';
        doc.text(txt, cx + 2, y + 7);
      };
      cell(l1, v1, M);
      cell(l2, v2, M + H);
      y += 8;
    });
    y += 3;
  };

  // ── TABLE DEFAULTS ───────────────────────────────────────────────────────
  const tHead: any = { fillColor: NAVY2, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5, cellPadding: 2.5 };
  const tBody: any = { fontSize: 7.5, cellPadding: 2.5 };
  const tAlt:  any = { fillColor: LIGHT };

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 1 — PERSONAL INFORMATION
  // ════════════════════════════════════════════════════════════════════════
  section('Personal Information');
  infoGrid([
    ['Date of Birth',   fmtDate(personal?.date_of_birth),  'Gender',          personal?.gender        || '—'],
    ['Nationality',     personal?.nationality       || '—', 'Marital Status',  personal?.marital_status || '—'],
    ['National ID No.', personal?.national_id_number || '—','Passport No.',   personal?.passport_number || '—'],
    ['Passport Expiry', fmtDate(personal?.passport_expiry), 'Blood Type',     personal?.blood_type     || '—'],
    ['Country of Birth',personal?.country_of_birth  || '—', 'Place of Birth', personal?.place_of_birth || '—'],
  ]);

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 2 — CURRENT APPOINTMENT
  // ════════════════════════════════════════════════════════════════════════
  section('Current Appointment');
  infoGrid([
    ['Job Title / Role', user.role            || '—', 'Employee ID',    user.employeeId      || '—'],
    ['Department',       ctx.departmentName   || '—', 'Hub / Office',   ctx.hubName          || '—'],
    ['Employment Type',  ctx.employmentType   || '—', 'Contract Type',  ctx.contractType     || '—'],
    ['Contract Start',   fmtDate(ctx.contractStart), 'Contract End',  ctx.contractEnd ? fmtDate(ctx.contractEnd) : 'Ongoing'],
    ['Reports To',       ctx.reportsToName    || '—', 'Email',          user.email           || '—'],
  ]);

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 3 — EMPLOYMENT HISTORY
  // ════════════════════════════════════════════════════════════════════════
  if ((experience || []).length > 0) {
    section('Employment History  (most recent first)');

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Organization', 'Position / Title', 'Period', 'Location', 'Sector']],
      body: (experience || []).map((e: any) => [
        e.employer || '—',
        e.job_title + (e.is_current ? '  ★' : ''),
        `${e.start_date ? format(parseISO(e.start_date), 'MMM yyyy') : '?'} – ${e.is_current ? 'Present' : (e.end_date ? format(parseISO(e.end_date), 'MMM yyyy') : '?')}`,
        e.location || '—',
        e.sector   || '—',
      ]),
      headStyles: tHead,
      bodyStyles: tBody,
      alternateRowStyles: tAlt,
      columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 46 }, 2: { cellWidth: 30 }, 3: { cellWidth: 28 } },
      didDrawPage: () => { y = M; },
    });
    y = (doc as any).lastAutoTable.finalY + 4;

    // Detailed responsibilities for each role
    const withDesc = (experience || []).filter((e: any) => e.description);
    if (withDesc.length > 0) {
      doc.setFontSize(7);
      doc.setTextColor(...MID);
      doc.text('Responsibilities:', M, y + 3);
      y += 6;
      withDesc.forEach((e: any) => {
        const headerH = 6;
        checkPage(headerH + 10);
        doc.setFillColor(...LIGHT);
        doc.setDrawColor(...BORDER);
        doc.rect(M, y, CW, headerH, 'FD');
        doc.setFillColor(...NAVY2);
        doc.rect(M, y, 2, headerH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...NAVY2);
        doc.text(`${e.employer}  —  ${e.job_title}`, M + 4, y + 4.5);
        y += headerH;

        const lines = doc.splitTextToSize(e.description, CW - 6);
        const blockH = lines.length * 4.5 + 4;
        checkPage(blockH);
        doc.setFillColor(...WHITE);
        doc.setDrawColor(...BORDER);
        doc.rect(M, y, CW, blockH, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...DARK);
        lines.forEach((ln: string, i: number) => {
          doc.text(ln, M + 4, y + 4 + i * 4.5);
        });
        y += blockH + 2;
      });
    }
    y += 2;
  }

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 4 — ACADEMIC QUALIFICATIONS
  // ════════════════════════════════════════════════════════════════════════
  if ((education || []).length > 0) {
    checkPage(20);
    section('Academic Qualifications  (most recent first)');

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Degree / Qualification', 'Institution', 'Field of Study', 'Country', 'Year', 'Grade']],
      body: (education || []).map((e: any) => [
        DEGREE_LABELS[e.degree_level] || e.degree_level || '—',
        e.institution    || '—',
        e.field_of_study || '—',
        e.country        || '—',
        e.graduation_year?.toString() || '—',
        e.grade          || '—',
      ]),
      headStyles: tHead,
      bodyStyles: tBody,
      alternateRowStyles: tAlt,
      columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 46 }, 2: { cellWidth: 38 }, 3: { cellWidth: 22 }, 4: { cellWidth: 13 } },
      didDrawPage: () => { y = M; },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 5 — TRAINING & CERTIFICATIONS
  // ════════════════════════════════════════════════════════════════════════
  if ((trainings || []).length > 0) {
    checkPage(20);
    section('Training & Certifications');

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Title', 'Issuing Organization', 'Type', 'Issue Date', 'Expiry', 'Cert. No.']],
      body: (trainings || []).map((t: any) => [
        t.title || '—',
        t.issuing_org || '—',
        t.cert_type ? (t.cert_type.charAt(0).toUpperCase() + t.cert_type.slice(1)) : '—',
        fmtDate(t.issue_date),
        t.expiry_date ? fmtDate(t.expiry_date) : 'No Expiry',
        t.cert_number || '—',
      ]),
      headStyles: tHead,
      bodyStyles: tBody,
      alternateRowStyles: tAlt,
      columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 36 }, 2: { cellWidth: 22 }, 3: { cellWidth: 20 }, 4: { cellWidth: 20 } },
      didDrawPage: () => { y = M; },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 6 — LANGUAGE PROFICIENCY
  // ════════════════════════════════════════════════════════════════════════
  if ((languages || []).length > 0) {
    checkPage(20);
    section('Language Proficiency');

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Language', 'Proficiency Level', 'Notes']],
      body: (languages || []).map((l: any) => [
        l.language   || '—',
        LANG_PROF[l.proficiency] || l.proficiency || '—',
        l.notes      || '—',
      ]),
      headStyles: tHead,
      bodyStyles: tBody,
      alternateRowStyles: tAlt,
      columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 60 } },
      didDrawPage: () => { y = M; },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 7 — SKILLS & COMPETENCIES
  // ════════════════════════════════════════════════════════════════════════
  if ((skills || []).length > 0) {
    checkPage(20);
    section('Skills & Competencies');

    // Group by category
    const grouped: Record<string, string[]> = {};
    (skills || []).forEach((s: any) => {
      const cat = s.category || 'General';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(s.skill_name + (s.skill_level ? ` (${s.skill_level})` : ''));
    });

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Category', 'Skills & Competencies']],
      body: Object.entries(grouped).map(([cat, list]) => [cat, list.join('  ·  ')]),
      headStyles: tHead,
      bodyStyles: tBody,
      alternateRowStyles: tAlt,
      columnStyles: { 0: { cellWidth: 38, fontStyle: 'bold' } },
      didDrawPage: () => { y = M; },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 8 — PROFESSIONAL REFERENCES
  // ════════════════════════════════════════════════════════════════════════
  if ((references || []).length > 0) {
    checkPage(20);
    section('Professional References');

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Full Name', 'Title & Organization', 'Relationship', 'Email', 'Phone']],
      body: (references || []).map((r: any) => [
        r.ref_name || '—',
        [r.ref_title, r.organization].filter(Boolean).join(' / ') || '—',
        r.relationship || '—',
        r.email || '—',
        r.phone || '—',
      ]),
      headStyles: tHead,
      bodyStyles: tBody,
      alternateRowStyles: tAlt,
      columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 46 }, 2: { cellWidth: 24 }, 3: { cellWidth: 38 } },
      didDrawPage: () => { y = M; },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── FOOTER on every page ─────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFillColor(...LIGHT);
    doc.rect(0, PH - 11, PW, 11, 'F');
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.3);
    doc.line(0, PH - 11, PW, PH - 11);
    doc.setFontSize(6.5);
    doc.setTextColor(...MID);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `PACT Command Center  ·  Staff Personal History Form (UN P11 / World Bank Format)  ·  CONFIDENTIAL`,
      M, PH - 4
    );
    doc.text(`Page ${p} of ${totalPages}`, PW - M, PH - 4, { align: 'right' });
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  const safeName = (user.name || 'staff').replace(/[^a-z0-9]/gi, '_');
  doc.save(`${safeName}_P11_CV_${format(new Date(), 'yyyyMMdd')}.pdf`);
}
