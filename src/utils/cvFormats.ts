/**
 * Multi-format CV/Resume export utility
 * Formats: Reverse-Chronological, Functional, Combination, Europass EU
 * UN P11 / World Bank lives in employeeCvExport.ts
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO, isValid } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { CVContext } from './employeeCvExport';

// ── Shared helpers ────────────────────────────────────────────────────────────
const fmtDate = (d?: string | null, fmt = 'MMM yyyy'): string => {
  if (!d) return '—';
  try { const p = parseISO(d); return isValid(p) ? format(p, fmt) : d; } catch { return d; }
};

const safe = (v: string | null | undefined) => v?.trim() || '—';

// ── Shared data fetch (all formats use the same tables) ───────────────────────
async function fetchProfileData(userId: string) {
  const [
    { data: personal },
    { data: education },
    { data: experience },
    { data: skills },
    { data: languages },
    { data: references },
    { data: trainings },
    { data: emergency },
  ] = await Promise.all([
    supabase.from('hr_employee_personal').select('*').eq('profile_id', userId).maybeSingle(),
    supabase.from('hr_employee_education').select('*').eq('profile_id', userId).order('graduation_year', { ascending: false }),
    supabase.from('hr_employee_experience').select('*').eq('profile_id', userId).order('start_date', { ascending: false }),
    supabase.from('hr_employee_skills').select('*').eq('profile_id', userId),
    supabase.from('hr_employee_languages').select('*').eq('profile_id', userId),
    supabase.from('hr_employee_references').select('*').eq('profile_id', userId),
    supabase.from('staff_certifications').select('*').eq('user_id', userId).order('issue_date', { ascending: false }),
    supabase.from('hr_employee_emergency_contacts').select('*').eq('profile_id', userId),
  ]);
  return { personal, education: education ?? [], experience: experience ?? [], skills: skills ?? [],
           languages: languages ?? [], references: references ?? [], trainings: trainings ?? [], emergency: emergency ?? [] };
}

function saveOrReturn(doc: jsPDF, filename: string, returnBytes?: boolean): void | Uint8Array {
  if (returnBytes) return new Uint8Array(doc.output('arraybuffer'));
  doc.save(filename);
}

// ── Colour palettes per format ─────────────────────────────────────────────
const PALETTE = {
  chronological: { primary: [30, 58, 138] as [number,number,number], accent: [59, 130, 246] as [number,number,number], light: [239, 246, 255] as [number,number,number], dark: [15,23,42] as [number,number,number], mid: [71,85,105] as [number,number,number] },
  functional:    { primary: [5, 150, 105] as [number,number,number],  accent: [16, 185, 129] as [number,number,number], light: [236, 253, 245] as [number,number,number], dark: [6,78,59] as [number,number,number],   mid: [52,78,65] as [number,number,number] },
  combination:   { primary: [109, 40, 217] as [number,number,number], accent: [139, 92, 246] as [number,number,number], light: [245, 243, 255] as [number,number,number], dark: [30,27,75] as [number,number,number],   mid: [91,83,102] as [number,number,number] },
  europass:      { primary: [0, 51, 153] as [number,number,number],   accent: [255, 204, 0] as [number,number,number],  light: [232, 240, 254] as [number,number,number], dark: [0,0,0] as [number,number,number],       mid: [80,80,80] as [number,number,number] },
};

// ═══════════════════════════════════════════════════════════════════════════════
// FORMAT 1 — REVERSE-CHRONOLOGICAL  (Standard ATS-friendly resume)
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateReverseChronologicalCV(
  user: any, ctx: CVContext = {}, options?: { returnBytes?: boolean },
): Promise<void | Uint8Array> {
  const d = await fetchProfileData(user.id);
  const C = PALETTE.chronological;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 16, CW = PW - M * 2;
  let y = 0;
  const W = [255,255,255] as [number,number,number];

  const checkPage = (need = 10) => {
    if (y + need > PH - 14) { doc.addPage(); y = M; }
  };

  // ── HEADER ────────────────────────────────────────────────────────────────
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, PW, 38, 'F');
  doc.setFillColor(...C.accent);
  doc.rect(0, 38, PW, 2, 'F');

  doc.setTextColor(...W);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(user.name || 'Unknown', M, 16);

  const titleLine = [ctx.employmentType, user.role, ctx.departmentName].filter(Boolean).join('  ·  ');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(200, 220, 255);
  if (titleLine) doc.text(titleLine, M, 23);

  const contactParts = [user.email, user.phone, ctx.hubName].filter(Boolean);
  doc.setFontSize(7.5);
  doc.setTextColor(180, 200, 240);
  if (contactParts.length) doc.text(contactParts.join('   |   '), M, 30);
  if (user.employeeId) doc.text(`ID: ${user.employeeId}`, PW - M, 30, { align: 'right' });

  y = 46;

  const sectionHead = (title: string) => {
    checkPage(12);
    doc.setFillColor(...C.primary);
    doc.rect(M, y, 1.5, 6, 'F');
    doc.setTextColor(...C.primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(title.toUpperCase(), M + 4, y + 4.5);
    doc.setDrawColor(...C.accent);
    doc.setLineWidth(0.3);
    doc.line(M + 4 + doc.getTextWidth(title.toUpperCase()) + 2, y + 2.5, PW - M, y + 2.5);
    y += 9;
    doc.setTextColor(0, 0, 0);
  };

  // ── PROFESSIONAL SUMMARY ─────────────────────────────────────────────────
  if (d.personal?.professional_summary) {
    sectionHead('Professional Summary');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.dark);
    const lines = doc.splitTextToSize(d.personal.professional_summary, CW);
    checkPage(lines.length * 5 + 4);
    lines.forEach((ln: string) => { doc.text(ln, M, y); y += 5; });
    y += 4;
  }

  // ── WORK EXPERIENCE ───────────────────────────────────────────────────────
  if (d.experience.length) {
    sectionHead('Professional Experience');
    d.experience.forEach((exp: any) => {
      checkPage(18);
      const dates = `${fmtDate(exp.start_date)} – ${exp.is_current ? 'Present' : fmtDate(exp.end_date)}`;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...C.dark);
      doc.text(safe(exp.job_title), M, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...C.mid);
      doc.text(dates, PW - M, y, { align: 'right' });
      y += 5;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...C.accent);
      const org = [exp.organization, exp.location].filter(Boolean).join(' · ');
      if (org) { doc.text(org, M, y); y += 5; }
      if (exp.description) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...C.dark);
        const desc = doc.splitTextToSize(exp.description, CW - 4);
        desc.slice(0, 4).forEach((ln: string) => { checkPage(5); doc.text('• ' + ln, M + 2, y); y += 4.5; });
      }
      y += 3;
    });
  }

  // ── EDUCATION ────────────────────────────────────────────────────────────
  if (d.education.length) {
    sectionHead('Education');
    d.education.forEach((edu: any) => {
      checkPage(14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...C.dark);
      doc.text(safe(edu.degree_title || edu.degree_level), M, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...C.mid);
      doc.text(safe(edu.graduation_year?.toString()), PW - M, y, { align: 'right' });
      y += 5;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...C.accent);
      const inst = [edu.institution, edu.country].filter(Boolean).join(', ');
      if (inst) { doc.text(inst, M, y); y += 5; }
      y += 2;
    });
  }

  // ── SKILLS ───────────────────────────────────────────────────────────────
  if (d.skills.length) {
    sectionHead('Skills & Competencies');
    const skillNames = d.skills.map((s: any) => s.skill_name).filter(Boolean);
    const line = skillNames.join('   ·   ');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.dark);
    const wrapped = doc.splitTextToSize(line, CW);
    wrapped.forEach((ln: string) => { checkPage(5); doc.text(ln, M, y); y += 5; });
    y += 3;
  }

  // ── LANGUAGES ────────────────────────────────────────────────────────────
  if (d.languages.length) {
    sectionHead('Languages');
    const PROF: Record<string, string> = { native: 'Native', fluent: 'Fluent', conversational: 'Conversational', basic: 'Basic' };
    const cols = 3;
    d.languages.forEach((lang: any, i: number) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      if (col === 0) checkPage(8);
      const x = M + col * (CW / cols);
      const ry = y + row * 8;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...C.dark);
      doc.text(safe(lang.language_name), x, ry);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.mid);
      doc.text(PROF[lang.proficiency_level] || safe(lang.proficiency_level), x, ry + 4.5);
    });
    y += Math.ceil(d.languages.length / cols) * 8 + 4;
  }

  // ── CERTIFICATIONS ───────────────────────────────────────────────────────
  if (d.trainings.length) {
    sectionHead('Certifications & Training');
    d.trainings.slice(0, 8).forEach((t: any) => {
      checkPage(7);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...C.dark);
      doc.text(safe(t.certification_name || t.title), M, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.mid);
      const meta = [t.issuing_organization, fmtDate(t.issue_date)].filter(v => v && v !== '—').join(' · ');
      if (meta) doc.text(meta, PW - M, y, { align: 'right' });
      y += 6;
    });
  }

  // ── FOOTER ───────────────────────────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFillColor(248, 250, 252);
    doc.rect(0, PH - 10, PW, 10, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(150, 150, 160);
    doc.text(`${user.name || ''} — Reverse-Chronological Resume`, M, PH - 4);
    doc.text(`Page ${p} of ${total}`, PW - M, PH - 4, { align: 'right' });
  }

  const safeName = (user.name || 'staff').replace(/[^a-z0-9]/gi, '_');
  return saveOrReturn(doc, `${safeName}_Resume_${format(new Date(), 'yyyyMMdd')}.pdf`, options?.returnBytes);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORMAT 2 — FUNCTIONAL / SKILLS-BASED
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateFunctionalCV(
  user: any, ctx: CVContext = {}, options?: { returnBytes?: boolean },
): Promise<void | Uint8Array> {
  const d = await fetchProfileData(user.id);
  const C = PALETTE.functional;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 16, CW = PW - M * 2;
  let y = 0;
  const W = [255,255,255] as [number,number,number];

  const checkPage = (need = 10) => { if (y + need > PH - 14) { doc.addPage(); y = M; } };

  // ── HEADER ────────────────────────────────────────────────────────────────
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, PW, 40, 'F');
  doc.setTextColor(...W);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(user.name || 'Unknown', M, 16);
  const role = [user.role, ctx.departmentName].filter(Boolean).join(' · ');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(180, 240, 210);
  if (role) doc.text(role, M, 23);
  const contact = [user.email, user.phone].filter(Boolean).join('   |   ');
  doc.setFontSize(7.5);
  if (contact) doc.text(contact, M, 30);
  if (user.employeeId) doc.text(`ID: ${user.employeeId}`, PW - M, 30, { align: 'right' });
  doc.setFillColor(...C.accent);
  doc.rect(0, 40, PW, 2, 'F');
  y = 48;

  const sectionHead = (title: string) => {
    checkPage(12);
    doc.setFillColor(...C.light);
    doc.setDrawColor(...C.primary);
    doc.setLineWidth(0);
    doc.rect(M, y, CW, 7, 'F');
    doc.setFillColor(...C.primary);
    doc.rect(M, y, 3, 7, 'F');
    doc.setTextColor(...C.primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(title.toUpperCase(), M + 6, y + 5);
    y += 10;
    doc.setTextColor(0, 0, 0);
  };

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  if (d.personal?.professional_summary) {
    sectionHead('Professional Profile');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.dark);
    const lines = doc.splitTextToSize(d.personal.professional_summary, CW);
    lines.forEach((ln: string) => { checkPage(5); doc.text(ln, M, y); y += 5; });
    y += 4;
  }

  // ── CORE COMPETENCIES (skills grouped) ────────────────────────────────────
  if (d.skills.length) {
    sectionHead('Core Competencies');
    const skillsByCategory: Record<string, string[]> = {};
    d.skills.forEach((s: any) => {
      const cat = s.category || 'General';
      if (!skillsByCategory[cat]) skillsByCategory[cat] = [];
      if (s.skill_name) skillsByCategory[cat].push(s.skill_name);
    });
    Object.entries(skillsByCategory).forEach(([cat, items]) => {
      checkPage(14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...C.primary);
      doc.text(cat.toUpperCase(), M, y);
      y += 5;
      // Skill pills (simulated with text)
      let xPos = M;
      items.forEach((skill) => {
        const w = doc.getTextWidth(skill) + 6;
        if (xPos + w > PW - M) { xPos = M; y += 6; checkPage(6); }
        doc.setFillColor(...C.light);
        doc.setDrawColor(...C.accent);
        doc.setLineWidth(0.3);
        doc.roundedRect(xPos, y - 3.5, w, 5.5, 1, 1, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...C.primary);
        doc.text(skill, xPos + 3, y + 0.5);
        xPos += w + 2;
      });
      y += 8;
    });
    y += 2;
  }

  // ── WORK HISTORY (brief) ─────────────────────────────────────────────────
  if (d.experience.length) {
    sectionHead('Work History');
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Title / Role', 'Organisation', 'Dates']],
      body: d.experience.map((exp: any) => [
        exp.job_title || '—',
        exp.organization || '—',
        `${fmtDate(exp.start_date)} – ${exp.is_current ? 'Present' : fmtDate(exp.end_date)}`,
      ]),
      headStyles: { fillColor: C.primary, textColor: [255,255,255], fontStyle: 'bold', fontSize: 8, cellPadding: 2.5 },
      bodyStyles: { fontSize: 7.5, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: C.light },
      columnStyles: { 0: { cellWidth: 60 }, 2: { cellWidth: 36 } },
      didDrawPage: () => { y = M; },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── EDUCATION ────────────────────────────────────────────────────────────
  if (d.education.length) {
    sectionHead('Education');
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Degree / Qualification', 'Institution', 'Year']],
      body: d.education.map((edu: any) => [
        edu.degree_title || edu.degree_level || '—',
        [edu.institution, edu.country].filter(Boolean).join(', ') || '—',
        edu.graduation_year || '—',
      ]),
      headStyles: { fillColor: C.primary, textColor: [255,255,255], fontStyle: 'bold', fontSize: 8, cellPadding: 2.5 },
      bodyStyles: { fontSize: 7.5, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: C.light },
      columnStyles: { 2: { cellWidth: 18 } },
      didDrawPage: () => { y = M; },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── CERTIFICATIONS ───────────────────────────────────────────────────────
  if (d.trainings.length) {
    sectionHead('Certifications & Professional Development');
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Certification / Course', 'Issuing Body', 'Date']],
      body: d.trainings.map((t: any) => [
        t.certification_name || t.title || '—',
        t.issuing_organization || '—',
        fmtDate(t.issue_date),
      ]),
      headStyles: { fillColor: C.primary, textColor: [255,255,255], fontStyle: 'bold', fontSize: 8, cellPadding: 2.5 },
      bodyStyles: { fontSize: 7.5, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: C.light },
      didDrawPage: () => { y = M; },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── FOOTER ───────────────────────────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(150, 150, 150);
    doc.text(`${user.name || ''} — Functional (Skills-Based) Resume`, M, PH - 4);
    doc.text(`Page ${p} of ${total}`, PW - M, PH - 4, { align: 'right' });
  }

  const safeName = (user.name || 'staff').replace(/[^a-z0-9]/gi, '_');
  return saveOrReturn(doc, `${safeName}_Functional_${format(new Date(), 'yyyyMMdd')}.pdf`, options?.returnBytes);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORMAT 3 — COMBINATION / HYBRID
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateCombinationCV(
  user: any, ctx: CVContext = {}, options?: { returnBytes?: boolean },
): Promise<void | Uint8Array> {
  const d = await fetchProfileData(user.id);
  const C = PALETTE.combination;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 16, CW = PW - M * 2;
  const SIDEBAR = 68, MAIN = CW - SIDEBAR - 6;
  let yL = 0, yR = 0;

  // Two-column hybrid layout: left sidebar (skills/contact) + right main (experience/education)
  const checkPageL = (need = 10) => { if (yL + need > PH - 14) { doc.addPage(); yL = M + 8; yR = M + 8; } };
  const checkPageR = (need = 10) => { if (yR + need > PH - 14) { doc.addPage(); yL = M + 8; yR = M + 8; } };

  // ── FULL-WIDTH HEADER ─────────────────────────────────────────────────────
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, PW, 38, 'F');
  doc.setFillColor(...C.accent);
  doc.rect(0, 38, PW, 1.5, 'F');
  const [r, g, b] = C.light;
  doc.setFillColor(r, g, b);
  doc.rect(0, 39.5, SIDEBAR + M + 3, PH - 39.5, 'F'); // sidebar bg

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text(user.name || 'Unknown', M, 15);
  const roleStr = [user.role, ctx.departmentName, ctx.employmentType].filter(Boolean).join(' · ');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(210, 190, 255);
  if (roleStr) doc.text(roleStr, M, 22);
  doc.setFontSize(7.5);
  doc.setTextColor(180, 170, 220);
  if (user.email) doc.text(user.email, M, 29);
  if (user.phone) doc.text(user.phone, M, 34);
  if (user.employeeId) doc.text(`ID: ${user.employeeId}`, PW - M, 29, { align: 'right' });
  if (ctx.hubName) doc.text(ctx.hubName, PW - M, 34, { align: 'right' });

  yL = 46; yR = 46;

  const leftHead = (title: string) => {
    checkPageL(10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C.primary);
    doc.text(title.toUpperCase(), M, yL);
    doc.setDrawColor(...C.accent);
    doc.setLineWidth(0.4);
    doc.line(M, yL + 1.5, M + SIDEBAR - 2, yL + 1.5);
    yL += 6;
    doc.setTextColor(0, 0, 0);
  };

  const rightHead = (title: string) => {
    checkPageR(10);
    doc.setFillColor(...C.primary);
    doc.rect(M + SIDEBAR + 6, yR - 1, MAIN, 6.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text(title.toUpperCase(), M + SIDEBAR + 9, yR + 3.5);
    yR += 9;
    doc.setTextColor(0, 0, 0);
  };

  const RX = M + SIDEBAR + 6;

  // ── LEFT: SKILLS ─────────────────────────────────────────────────────────
  if (d.skills.length) {
    leftHead('Key Skills');
    d.skills.slice(0, 16).forEach((s: any) => {
      checkPageL(6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(40, 40, 60);
      doc.text(`▸ ${safe(s.skill_name)}`, M + 1, yL);
      if (s.proficiency_level) {
        const lvl = { beginner: 1, intermediate: 2, advanced: 3, expert: 4 }[s.proficiency_level as string] || 2;
        for (let i = 0; i < 4; i++) {
          const [cr, cg, cb] = i < lvl ? C.accent : [200, 200, 200] as [number,number,number];
          doc.setFillColor(cr, cg, cb);
          doc.circle(M + SIDEBAR - 3 - i * 4.5, yL - 1, 1.5, 'F');
        }
      }
      yL += 5.5;
    });
    yL += 3;
  }

  // ── LEFT: LANGUAGES ───────────────────────────────────────────────────────
  if (d.languages.length) {
    leftHead('Languages');
    const PROF: Record<string, string> = { native: 'Native', fluent: 'Fluent', conversational: 'Conv.', basic: 'Basic' };
    d.languages.forEach((lang: any) => {
      checkPageL(6);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(40, 40, 60);
      doc.text(safe(lang.language_name), M + 1, yL);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.primary);
      doc.text(PROF[lang.proficiency_level] || safe(lang.proficiency_level), M + SIDEBAR - 2, yL, { align: 'right' });
      yL += 5;
    });
    yL += 3;
  }

  // ── LEFT: CERTIFICATIONS (brief) ────────────────────────────────────────
  if (d.trainings.length) {
    leftHead('Certifications');
    d.trainings.slice(0, 5).forEach((t: any) => {
      checkPageL(8);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(40, 40, 60);
      const name = safe(t.certification_name || t.title);
      const wrapped = doc.splitTextToSize(name, SIDEBAR - 4);
      wrapped.slice(0, 2).forEach((ln: string) => { doc.text(ln, M + 1, yL); yL += 4.5; });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...C.primary);
      if (t.issuing_organization) { doc.text(safe(t.issuing_organization), M + 1, yL); yL += 4; }
      yL += 1;
    });
  }

  // ── RIGHT: PROFESSIONAL SUMMARY ──────────────────────────────────────────
  if (d.personal?.professional_summary) {
    rightHead('Professional Summary');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 80);
    const lines = doc.splitTextToSize(d.personal.professional_summary, MAIN - 4);
    lines.forEach((ln: string) => { checkPageR(5); doc.text(ln, RX + 2, yR); yR += 5; });
    yR += 4;
  }

  // ── RIGHT: WORK EXPERIENCE ───────────────────────────────────────────────
  if (d.experience.length) {
    rightHead('Professional Experience');
    d.experience.forEach((exp: any) => {
      checkPageR(16);
      const dates = `${fmtDate(exp.start_date)} – ${exp.is_current ? 'Present' : fmtDate(exp.end_date)}`;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 30, 50);
      doc.text(safe(exp.job_title), RX + 2, yR);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.primary);
      doc.text(dates, RX + MAIN, yR, { align: 'right' });
      yR += 5;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...C.accent);
      if (exp.organization) { doc.text(safe(exp.organization), RX + 2, yR); yR += 5; }
      if (exp.description) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(50, 50, 70);
        const desc = doc.splitTextToSize(exp.description, MAIN - 6);
        desc.slice(0, 3).forEach((ln: string) => { checkPageR(5); doc.text('• ' + ln, RX + 4, yR); yR += 4.5; });
      }
      yR += 3;
    });
  }

  // ── RIGHT: EDUCATION ─────────────────────────────────────────────────────
  if (d.education.length) {
    rightHead('Education');
    d.education.forEach((edu: any) => {
      checkPageR(12);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 30, 50);
      doc.text(safe(edu.degree_title || edu.degree_level), RX + 2, yR);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.primary);
      doc.text(safe(edu.graduation_year?.toString()), RX + MAIN, yR, { align: 'right' });
      yR += 5;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...C.accent);
      const inst = [edu.institution, edu.country].filter(Boolean).join(', ');
      if (inst) { doc.text(inst, RX + 2, yR); yR += 5; }
      yR += 2;
    });
  }

  // ── FOOTER ───────────────────────────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(150, 150, 150);
    doc.text(`${user.name || ''} — Combination (Hybrid) Resume`, M, PH - 4);
    doc.text(`Page ${p} of ${total}`, PW - M, PH - 4, { align: 'right' });
  }

  const safeName = (user.name || 'staff').replace(/[^a-z0-9]/gi, '_');
  return saveOrReturn(doc, `${safeName}_Hybrid_${format(new Date(), 'yyyyMMdd')}.pdf`, options?.returnBytes);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORMAT 4 — EUROPASS (European Union Standard)
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateEuropassCV(
  user: any, ctx: CVContext = {}, options?: { returnBytes?: boolean },
): Promise<void | Uint8Array> {
  const d = await fetchProfileData(user.id);
  const C = PALETTE.europass;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 14, CW = PW - M * 2;
  let y = 0;

  const checkPage = (need = 10) => { if (y + need > PH - 14) { doc.addPage(); y = M; } };

  const EU_BLUE: [number,number,number]  = [0, 51, 153];
  const EU_GOLD: [number,number,number]  = [255, 204, 0];
  const EU_DARK: [number,number,number]  = [25, 25, 25];
  const EU_MID:  [number,number,number]  = [90, 90, 90];
  const EU_LIGHT:[number,number,number]  = [232, 240, 254];
  const W = [255,255,255] as [number,number,number];

  // ── EU FLAG HEADER ────────────────────────────────────────────────────────
  doc.setFillColor(...EU_BLUE);
  doc.rect(0, 0, PW, 44, 'F');
  doc.setFillColor(...EU_GOLD);
  doc.rect(0, 44, PW, 3, 'F');

  // EU stars (simplified row of dots)
  const starY = 8;
  for (let i = 0; i < 12; i++) {
    const angle = (i * 30 * Math.PI) / 180;
    const sx = M + 14 + Math.cos(angle) * 7;
    const sy = starY + 8 + Math.sin(angle) * 7;
    doc.setFillColor(...EU_GOLD);
    doc.circle(sx, sy, 1.2, 'F');
  }

  // "Europass" wordmark
  doc.setTextColor(...EU_GOLD);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Europass', M + 32, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(180, 200, 255);
  doc.text('Curriculum Vitae', M + 32, 20);

  // Name & contact on the right side of header
  doc.setTextColor(...W);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(user.name || 'Unknown', PW - M, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(180, 200, 255);
  if (user.email) doc.text(user.email, PW - M, 23, { align: 'right' });
  if (user.phone) doc.text(user.phone, PW - M, 28, { align: 'right' });
  if (ctx.hubName) doc.text(ctx.hubName, PW - M, 33, { align: 'right' });

  y = 54;

  const sectionHead = (title: string) => {
    checkPage(12);
    doc.setFillColor(...EU_BLUE);
    doc.rect(M, y, CW, 7.5, 'F');
    doc.setTextColor(...W);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(title.toUpperCase(), M + 3, y + 5.3);
    y += 10;
    doc.setTextColor(...EU_DARK);
  };

  const field = (label: string, value: string) => {
    checkPage(6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...EU_MID);
    doc.text(label.toUpperCase(), M, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...EU_DARK);
    doc.text(value, M + 55, y);
    y += 6;
  };

  // ── PERSONAL INFORMATION ─────────────────────────────────────────────────
  sectionHead('Personal Information');
  field('Surname(s) / First name(s)', user.name || '—');
  if (d.personal?.date_of_birth) field('Date of birth', fmtDate(d.personal.date_of_birth, 'dd MMMM yyyy'));
  if (d.personal?.nationality) field('Nationality', d.personal.nationality);
  field('Email', user.email || '—');
  if (user.phone) field('Telephone', user.phone);
  if (d.personal?.address_line1) field('Address', [d.personal.address_line1, d.personal.city, d.personal.country].filter(Boolean).join(', '));
  y += 2;

  // ── WORK EXPERIENCE ───────────────────────────────────────────────────────
  if (d.experience.length) {
    sectionHead('Work Experience');
    d.experience.forEach((exp: any) => {
      checkPage(22);
      const dates = `${fmtDate(exp.start_date)} – ${exp.is_current ? 'Present' : fmtDate(exp.end_date)}`;
      // Date column
      doc.setFillColor(...EU_LIGHT);
      doc.rect(M, y, 36, exp.description ? 24 : 14, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...EU_BLUE);
      doc.text(dates, M + 18, y + 5, { align: 'center' });
      // Content
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...EU_DARK);
      doc.text(safe(exp.job_title), M + 40, y + 5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...EU_MID);
      doc.text(safe(exp.organization), M + 40, y + 10);
      if (exp.description) {
        doc.setFontSize(7.5);
        const desc = doc.splitTextToSize(exp.description, CW - 44);
        desc.slice(0, 3).forEach((ln: string, i: number) => {
          doc.setTextColor(...EU_DARK);
          doc.text(ln, M + 40, y + 16 + i * 4);
        });
      }
      y += exp.description ? 28 : 17;
    });
    y += 2;
  }

  // ── EDUCATION & TRAINING ─────────────────────────────────────────────────
  if (d.education.length) {
    sectionHead('Education and Training');
    d.education.forEach((edu: any) => {
      checkPage(18);
      const yr = edu.graduation_year ? edu.graduation_year.toString() : '—';
      doc.setFillColor(...EU_LIGHT);
      doc.rect(M, y, 36, 14, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...EU_BLUE);
      doc.text(yr, M + 18, y + 8, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...EU_DARK);
      doc.text(safe(edu.degree_title || edu.degree_level), M + 40, y + 5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...EU_MID);
      doc.text([edu.institution, edu.country].filter(Boolean).join(', ') || '—', M + 40, y + 10);
      y += 17;
    });
    y += 2;
  }

  // ── LANGUAGE SKILLS (Europass grid: CEFR-style) ──────────────────────────
  if (d.languages.length) {
    sectionHead('Language Skills');
    const CEFR: Record<string, string> = {
      native: 'C2 (Native)',
      fluent: 'C1 – C2',
      conversational: 'B1 – B2',
      basic: 'A1 – A2',
    };
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Language', 'Listening', 'Reading', 'Spoken Interaction', 'Spoken Production', 'Writing']],
      body: d.languages.map((lang: any) => {
        const level = CEFR[lang.proficiency_level] || lang.proficiency_level || '—';
        return [lang.language_name || '—', level, level, level, level, level];
      }),
      headStyles: { fillColor: EU_BLUE, textColor: [255,255,255], fontStyle: 'bold', fontSize: 7.5, cellPadding: 2 },
      bodyStyles: { fontSize: 7.5, cellPadding: 2 },
      alternateRowStyles: { fillColor: EU_LIGHT },
      didDrawPage: () => { y = M; },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── DIGITAL COMPETENCES ──────────────────────────────────────────────────
  const digitalSkills = d.skills.filter((s: any) =>
    ['IT', 'Technology', 'Digital', 'Software', 'Computer'].some(kw =>
      (s.category || '').toLowerCase().includes(kw.toLowerCase())
    )
  );
  if (digitalSkills.length) {
    sectionHead('Digital Competences');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...EU_DARK);
    const items = digitalSkills.map((s: any) => s.skill_name).filter(Boolean).join('   ·   ');
    const lines = doc.splitTextToSize(items, CW);
    lines.forEach((ln: string) => { checkPage(5); doc.text(ln, M, y); y += 5; });
    y += 4;
  }

  // ── ADDITIONAL INFO ───────────────────────────────────────────────────────
  const otherSkills = d.skills.filter((s: any) =>
    !['IT', 'Technology', 'Digital', 'Software', 'Computer'].some(kw =>
      (s.category || '').toLowerCase().includes(kw.toLowerCase())
    )
  );
  if (otherSkills.length || d.trainings.length) {
    sectionHead('Additional Information');
    if (otherSkills.length) {
      field('Other skills', otherSkills.map((s: any) => s.skill_name).filter(Boolean).join(', '));
    }
    if (d.trainings.length) {
      checkPage(6);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...EU_MID);
      doc.text('CERTIFICATIONS', M, y);
      y += 5;
      d.trainings.slice(0, 5).forEach((t: any) => {
        checkPage(5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...EU_DARK);
        doc.text(`• ${safe(t.certification_name || t.title)}`, M + 2, y);
        y += 4.5;
      });
    }
  }

  // ── FOOTER ───────────────────────────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFillColor(...EU_BLUE);
    doc.rect(0, PH - 9, PW, 9, 'F');
    doc.setFillColor(...EU_GOLD);
    doc.rect(0, PH - 10, PW, 1, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...W);
    doc.text('European Union — Europass Curriculum Vitae', M, PH - 3.5);
    doc.text(`Page ${p} / ${total}`, PW - M, PH - 3.5, { align: 'right' });
  }

  const safeName = (user.name || 'staff').replace(/[^a-z0-9]/gi, '_');
  return saveOrReturn(doc, `${safeName}_Europass_${format(new Date(), 'yyyyMMdd')}.pdf`, options?.returnBytes);
}

// ── Format registry (used by the UI picker) ───────────────────────────────────
export const CV_FORMAT_OPTIONS = [
  {
    id:          'un_p11',
    label:       'UN P11 / World Bank',
    description: 'Comprehensive personal history form. Standard for UN, INGO, and donor-funded roles.',
    ats:         'Moderate',
    pages:       'Multi-page',
    color:       'text-blue-700 bg-blue-50 border-blue-200',
    icon:        '🌐',
  },
  {
    id:          'reverse_chronological',
    label:       'Reverse-Chronological',
    description: 'Standard resume listing most recent work first. Best ATS compatibility.',
    ats:         'Excellent',
    pages:       '1-2 pages',
    color:       'text-indigo-700 bg-indigo-50 border-indigo-200',
    icon:        '📋',
  },
  {
    id:          'functional',
    label:       'Functional (Skills-Based)',
    description: 'Leads with core competencies. Ideal for career changers or skills-heavy profiles.',
    ats:         'Low',
    pages:       '1-2 pages',
    color:       'text-emerald-700 bg-emerald-50 border-emerald-200',
    icon:        '🎯',
  },
  {
    id:          'combination',
    label:       'Combination / Hybrid',
    description: 'Two-column: skills sidebar + full chronological experience. Best of both worlds.',
    ats:         'Moderate–High',
    pages:       '1-2 pages',
    color:       'text-violet-700 bg-violet-50 border-violet-200',
    icon:        '⚡',
  },
  {
    id:          'europass',
    label:       'Europass (EU Format)',
    description: 'European Union standard. Required for EU institutional, academic, and international roles.',
    ats:         'Moderate',
    pages:       'Multi-page',
    color:       'text-sky-700 bg-sky-50 border-sky-200',
    icon:        '🇪🇺',
  },
] as const;

export type CvFormatId = typeof CV_FORMAT_OPTIONS[number]['id'];
