/**
 * Project Report PDF — MS Project–style schedule (ID, % Complete, Task Name,
 * Duration, Start, Finish, Predecessors) plus project header details.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import type { FlowStage } from '@/config/projectFlows';
import type { CustomStageEntry, FlowLogEntry } from '@/hooks/useProjectFlow';
import type { AllStageChecklistItem } from '@/hooks/useStageData';

const BRAND = [15, 32, 65] as [number, number, number];
const BRAND_MID = [29, 52, 97] as [number, number, number];

export interface ProjectReportPdfInput {
  name: string;
  projectCode: string;
  projectType: string;
  status: string;
  projectManager?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  location?: string | null;
  budgetLabel?: string | null;
  stages: FlowStage[];
  customEntries: CustomStageEntry[];
  stageHistory: FlowLogEntry[];
  getStageStatus: (id: string) => 'completed' | 'current' | 'upcoming' | 'skipped';
  checklist: AllStageChecklistItem[];
  activities?: Array<{
    name: string;
    status?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    assignedTo?: string | null;
    progress?: number | null;
  }>;
}

function fmtDate(dateStr?: string | null, pattern = 'EEE M/d/yy'): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), pattern);
  } catch {
    return dateStr;
  }
}

function durationLabel(start?: string | null, end?: string | null, isMilestone?: boolean): string {
  if (isMilestone) return '0 days';
  if (!start || !end) return '—';
  try {
    const days = differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
    if (days <= 0) return '0 days';
    return days === 1 ? '1 day' : `${days} days`;
  } catch {
    return '—';
  }
}

function checklistByStage(items: AllStageChecklistItem[]): Record<string, AllStageChecklistItem[]> {
  const map: Record<string, AllStageChecklistItem[]> = {};
  for (const item of items) {
    (map[item.stageId] ??= []).push(item);
  }
  return map;
}

type ScheduleRow = [string, string, string, string, string, string, string];

function buildScheduleRows(input: ProjectReportPdfInput): {
  rows: ScheduleRow[];
  projectPct: number;
} {
  const entries = input.customEntries;
  const byStage = checklistByStage(input.checklist);
  // WBS id for predecessor references
  const wbsByStageId = new Map<string, number>();
  let wbs = 0;
  for (const stage of input.stages) {
    if (input.getStageStatus(stage.id) === 'skipped') continue;
    wbs++;
    wbsByStageId.set(stage.id, wbs);
  }

  const rows: ScheduleRow[] = [];
  const stagePcts: number[] = [];

  wbs = 0;
  for (const stage of input.stages) {
    const status = input.getStageStatus(stage.id);
    if (status === 'skipped') continue;
    wbs++;

    const entry = entries.find(e => e.id === stage.id);
    const label = entry?.customLabel || stage.label;
    const start = entry?.plannedStart ?? null;
    const end = entry?.dueDate ?? entry?.plannedEnd ?? null;
    const isMilestone = entry?.isMilestone ?? false;
    const items = byStage[stage.id] ?? [];
    const fromChecklist =
      items.length > 0
        ? Math.round((items.filter(i => i.completed).length / items.length) * 100)
        : null;
    const pct =
      status === 'completed'
        ? 100
        : (entry?.percentComplete ?? fromChecklist ?? 0);
    stagePcts.push(pct);

    const preds = (entry?.dependencies ?? [])
      .map(depId => {
        const n = wbsByStageId.get(depId);
        return n != null ? String(n) : null;
      })
      .filter(Boolean)
      .join(', ');

    rows.push([
      String(wbs),
      `${pct}%`,
      label,
      durationLabel(start, end, isMilestone),
      fmtDate(start),
      fmtDate(end),
      preds || '—',
    ]);

    items.forEach((item, idx) => {
      const itemPct = item.completed ? 100 : 0;
      rows.push([
        `${wbs}.${idx + 1}`,
        `${itemPct}%`,
        `  ${item.itemText}`,
        durationLabel(item.plannedStart, item.plannedEnd),
        fmtDate(item.plannedStart),
        fmtDate(item.plannedEnd),
        '—',
      ]);
    });
  }

  // Fallback: if no flow stages, use activities as schedule rows
  if (rows.length === 0 && input.activities?.length) {
    input.activities.forEach((a, idx) => {
      const pct = a.progress ?? (a.status === 'completed' ? 100 : 0);
      stagePcts.push(pct);
      rows.push([
        String(idx + 1),
        `${pct}%`,
        a.name,
        durationLabel(a.startDate, a.endDate),
        fmtDate(a.startDate),
        fmtDate(a.endDate),
        '—',
      ]);
    });
  }

  const projectPct =
    stagePcts.length > 0
      ? Math.round(stagePcts.reduce((s, n) => s + n, 0) / stagePcts.length)
      : 0;

  // Summary row (ID 0) like MS Project
  const summary: ScheduleRow = [
    '0',
    `${projectPct}%`,
    input.name,
    durationLabel(input.startDate, input.endDate),
    fmtDate(input.startDate),
    fmtDate(input.endDate),
    '—',
  ];

  return { rows: [summary, ...rows], projectPct };
}

export function exportProjectReportPdf(input: ProjectReportPdfInput): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const PAGE_W = 297;
  let y = 12;

  // Header
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, PAGE_W, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('PACT Command Center', 12, 9);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Project Report', 12, 16);
  doc.text(`Exported: ${format(new Date(), 'PPP')}`, PAGE_W - 12, 16, { align: 'right' });
  y = 28;

  // Title + meta
  doc.setTextColor(...BRAND);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(input.name, 12, y);
  y += 5;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Code: ${input.projectCode}  |  Type: ${input.projectType}  |  Status: ${input.status}`,
    12,
    y,
  );
  y += 6;

  // Compact project details
  const details: string[][] = [
    ['Project Manager', input.projectManager || '—'],
    ['Start Date', input.startDate ? format(parseISO(input.startDate), 'PPP') : '—'],
    ['End Date', input.endDate ? format(parseISO(input.endDate), 'PPP') : '—'],
    ['Location', input.location || '—'],
  ];
  if (input.budgetLabel) details.push(['Budget', input.budgetLabel]);

  autoTable(doc, {
    startY: y,
    head: [['Field', 'Value']],
    body: details,
    theme: 'striped',
    headStyles: { fillColor: BRAND_MID, textColor: 255, fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 80 } },
    margin: { left: 12, right: 12 },
    tableWidth: 120,
  });
  y = (doc as any).lastAutoTable.finalY + 7;

  // Schedule (MS Project–style)
  const { rows } = buildScheduleRows(input);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND);
  doc.text('Project Schedule', 12, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [['ID', '% Complete', 'Task Name', 'Duration', 'Start', 'Finish', 'Predecessors']],
    body: rows,
    theme: 'grid',
    headStyles: {
      fillColor: BRAND_MID,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    styles: { fontSize: 7.5, cellPadding: 1.8, overflow: 'linebreak', valign: 'middle' },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 110 },
      3: { cellWidth: 28, halign: 'center' },
      4: { cellWidth: 28, halign: 'center' },
      5: { cellWidth: 28, halign: 'center' },
      6: { cellWidth: 32, halign: 'center' },
    },
    didParseCell: (data) => {
      // Bold summary / stage rows (no leading spaces in task name)
      if (data.section === 'body' && data.column.index === 2) {
        const name = String(data.cell.raw ?? '');
        if (!name.startsWith('  ')) {
          data.cell.styles.fontStyle = 'bold';
        }
      }
      if (data.section === 'body' && data.row.index === 0) {
        data.cell.styles.fillColor = [232, 238, 248];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: 12, right: 12 },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Activities (legacy project activities list) if present and stages also exist
  if (input.activities?.length && input.stages.some(s => input.getStageStatus(s.id) !== 'skipped')) {
    if (y > 180) {
      doc.addPage();
      y = 14;
    }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BRAND);
    doc.text('Activities', 12, y);
    y += 3;
    autoTable(doc, {
      startY: y,
      head: [['Activity', 'Status', 'Start', 'End', 'Assigned To']],
      body: input.activities.map(a => [
        a.name,
        a.status || '—',
        a.startDate ? format(parseISO(a.startDate), 'PP') : '—',
        a.endDate ? format(parseISO(a.endDate), 'PP') : '—',
        a.assignedTo || '—',
      ]),
      theme: 'striped',
      headStyles: { fillColor: BRAND_MID, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2.5 },
      margin: { left: 12, right: 12 },
    });
  }

  // Footer on each page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text(`Project: ${input.name}`, 12, 205);
    doc.text(`Date: ${format(new Date(), 'EEE M/d/yy')}`, PAGE_W / 2, 205, { align: 'center' });
    doc.text(`Page ${i}`, PAGE_W - 12, 205, { align: 'right' });
  }

  doc.save(`project-${input.projectCode}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}
