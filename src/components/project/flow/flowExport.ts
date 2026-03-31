/**
 * Flow export helpers — PDF via jsPDF and Word via docx.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import type { FlowStage } from '@/config/projectFlows';
import type { FlowLogEntry } from '@/hooks/useProjectFlow';
import type { StageAssignee, StageChecklistItem, StageAttachment } from '@/hooks/useStageData';

interface StageExtra {
  assignees: StageAssignee[];
  checklist: StageChecklistItem[];
  attachments: StageAttachment[];
}

interface ExportData {
  projectName: string;
  projectType: string;
  projectCode?: string;
  exportedAt?: string;
  stages: FlowStage[];
  stageHistory: FlowLogEntry[];
  currentStageId: string | null;
  extras?: Record<string, StageExtra>;
  customEntries?: Array<{ id: string; skipped?: boolean; customLabel?: string; customDescription?: string; customOutputs?: string[] }>;
}

function getStageStatus(stageId: string, data: ExportData): 'completed' | 'current' | 'upcoming' | 'skipped' {
  if (data.customEntries?.find(e => e.id === stageId)?.skipped) return 'skipped';
  const completedIds = data.stageHistory.map(h => h.stageId);
  if (completedIds.includes(stageId)) return 'completed';
  if (stageId === data.currentStageId) return 'current';
  return 'upcoming';
}

// ── PDF Export ─────────────────────────────────────────────────────────────

export async function exportFlowPDF(data: ExportData): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PACT_BLUE = [13, 32, 65] as [number, number, number];
  const PACT_MID = [29, 52, 97] as [number, number, number];
  const WHITE = [255, 255, 255] as [number, number, number];
  const LIGHT_GRAY = [245, 247, 250] as [number, number, number];
  const TEXT_DARK = [30, 30, 30] as [number, number, number];
  const TEXT_MID = [80, 80, 90] as [number, number, number];
  const GREEN = [16, 124, 65] as [number, number, number];
  const AMBER = [180, 120, 20] as [number, number, number];
  const SLATE = [120, 130, 145] as [number, number, number];

  const PAGE_W = 210;
  const MARGIN = 14;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const now = format(new Date(), 'dd MMMM yyyy HH:mm');

  // ── Header banner ───────────────────────────────────────────────────────
  doc.setFillColor(...PACT_BLUE);
  doc.rect(0, 0, PAGE_W, 32, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('PACT — Project Flow Report', MARGIN, 14);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${now}`, MARGIN, 22);

  // ── Project meta ────────────────────────────────────────────────────────
  let y = 40;
  doc.setTextColor(...TEXT_DARK);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(data.projectName, MARGIN, y);
  y += 6;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_MID);
  doc.text(`Type: ${data.projectType.replace(/_/g, ' ')}  ${data.projectCode ? `· Code: ${data.projectCode}` : ''}`, MARGIN, y);
  y += 8;

  // ── Progress summary ────────────────────────────────────────────────────
  const completedCount = data.stages.filter(s => getStageStatus(s.id, data) === 'completed').length;
  const totalActive = data.stages.filter(s => getStageStatus(s.id, data) !== 'skipped').length;
  const pct = totalActive > 0 ? Math.round((completedCount / totalActive) * 100) : 0;

  doc.setFillColor(...LIGHT_GRAY);
  doc.roundedRect(MARGIN, y, CONTENT_W, 14, 2, 2, 'F');
  doc.setTextColor(...TEXT_DARK);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Progress: ${completedCount} / ${totalActive} stages complete (${pct}%)`, MARGIN + 4, y + 9);
  y += 20;

  // ── Stage table ─────────────────────────────────────────────────────────
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PACT_BLUE);
  doc.text('Stage Details', MARGIN, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['#', 'Stage', 'Status', 'Completed At', 'Notes / Outputs']],
    body: data.stages.map((stage, idx) => {
      const status = getStageStatus(stage.id, data);
      const history = data.stageHistory.filter(h => h.stageId === stage.id).at(-1);
      const customEntry = data.customEntries?.find(e => e.id === stage.id);
      const label = customEntry?.customLabel || stage.label;
      const outputs = [...(customEntry?.customOutputs ?? []), ...(stage.keyOutputs ?? [])];
      return [
        String(idx + 1),
        label,
        status.charAt(0).toUpperCase() + status.slice(1),
        history ? format(new Date(history.advancedAt), 'dd MMM yyyy') : '—',
        outputs.length > 0 ? outputs.slice(0, 3).join(', ') : (history?.notes ?? '—'),
      ];
    }),
    headStyles: { fillColor: PACT_MID, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: TEXT_DARK },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 48 },
      2: { cellWidth: 24 },
      3: { cellWidth: 28 },
      4: { cellWidth: CONTENT_W - 8 - 48 - 24 - 28 },
    },
    didParseCell: (hookData) => {
      const status = hookData.row.cells[2]?.text?.[0]?.toLowerCase();
      if (hookData.column.index === 2) {
        if (status === 'completed') hookData.cell.styles.textColor = GREEN;
        else if (status === 'current') hookData.cell.styles.textColor = PACT_MID;
        else if (status === 'skipped') hookData.cell.styles.textColor = SLATE;
        else hookData.cell.styles.textColor = AMBER;
      }
    },
  });

  y = (doc as any).lastAutoTable?.finalY ?? y + 40;

  // ── Per-stage detail sections (assignees + checklist) ───────────────────
  if (data.extras) {
    data.stages.forEach(stage => {
      const extra = data.extras![stage.id];
      if (!extra) return;
      const hasData = extra.assignees.length > 0 || extra.checklist.length > 0 || extra.attachments.length > 0;
      if (!hasData) return;

      if (y > 240) { doc.addPage(); y = MARGIN; }

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...PACT_BLUE);
      doc.text(stage.label, MARGIN, y);
      y += 5;

      if (extra.assignees.length > 0) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...TEXT_MID);
        doc.text('Assignees:', MARGIN, y);
        y += 4;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...TEXT_DARK);
        doc.text(extra.assignees.map(a => a.fullName).join(', '), MARGIN + 2, y);
        y += 5;
      }

      if (extra.checklist.length > 0) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...TEXT_MID);
        const done = extra.checklist.filter(c => c.completed).length;
        doc.text(`Checklist (${done}/${extra.checklist.length} complete):`, MARGIN, y);
        y += 4;
        extra.checklist.forEach(item => {
          if (y > 270) { doc.addPage(); y = MARGIN; }
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...TEXT_DARK);
          const mark = item.completed ? '☑' : '☐';
          doc.text(`  ${mark}  ${item.itemText}`, MARGIN, y);
          y += 4;
        });
      }

      if (extra.attachments.length > 0) {
        if (y > 260) { doc.addPage(); y = MARGIN; }
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...TEXT_MID);
        doc.text(`Attachments (${extra.attachments.length}):`, MARGIN, y);
        y += 4;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...TEXT_DARK);
        extra.attachments.forEach(att => {
          doc.text(`  • ${att.fileName}`, MARGIN, y);
          y += 4;
        });
      }
      y += 3;
    });
  }

  // ── Footer on all pages ─────────────────────────────────────────────────
  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(...PACT_BLUE);
    doc.rect(0, 290, PAGE_W, 10, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('PACT Command Center — Confidential', MARGIN, 296);
    doc.text(`Page ${i} of ${totalPages}`, PAGE_W - MARGIN, 296, { align: 'right' });
  }

  const safeName = data.projectName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
  doc.save(`${safeName}_Flow_Report_${format(new Date(), 'yyyyMMdd')}.pdf`);
}

// ── Word Export ────────────────────────────────────────────────────────────

export async function exportFlowDocx(data: ExportData): Promise<void> {
  const now = format(new Date(), 'dd MMMM yyyy HH:mm');

  const noBorder = {
    top: { style: BorderStyle.NONE, size: 0 },
    bottom: { style: BorderStyle.NONE, size: 0 },
    left: { style: BorderStyle.NONE, size: 0 },
    right: { style: BorderStyle.NONE, size: 0 },
  };

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [
        new TextRun({ text: 'PACT — Project Flow Report', bold: true, color: '0F2041', size: 36 }),
      ],
    }),
    new Paragraph({
      children: [new TextRun({ text: `Generated: ${now}`, color: '666666', size: 18 })],
      spacing: { after: 200 },
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: data.projectName, color: '1D3461', bold: true })],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Project Type: `, bold: true }),
        new TextRun({ text: data.projectType.replace(/_/g, ' ') }),
        data.projectCode ? new TextRun({ text: `  ·  Code: ${data.projectCode}`, color: '666666' }) : new TextRun({ text: '' }),
      ],
      spacing: { after: 300 },
    }),

    // Stage table
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: 'Stage Overview', color: '0F2041' })],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: ['#', 'Stage Name', 'Status', 'Completed'].map(h =>
            new TableCell({
              shading: { fill: '1D3461' },
              children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 18 })],
              })],
            }),
          ),
        }),
        ...data.stages.map((stage, idx) => {
          const status = getStageStatus(stage.id, data);
          const history = data.stageHistory.filter(h => h.stageId === stage.id).at(-1);
          const customEntry = data.customEntries?.find(e => e.id === stage.id);
          const label = customEntry?.customLabel || stage.label;
          const statusColor = status === 'completed' ? '107A3C' : status === 'current' ? '1D3461' : '888888';
          return new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(idx + 1) })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: label, bold: status === 'current' })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: status.charAt(0).toUpperCase() + status.slice(1), color: statusColor, bold: true })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: history ? format(new Date(history.advancedAt), 'dd MMM yyyy') : '—', color: '555555' })] })] }),
            ],
          });
        }),
      ],
    }),
    new Paragraph({ text: '', spacing: { after: 300 } }),
  ];

  // Per-stage detail sections
  if (data.extras) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: 'Stage Details', color: '0F2041' })],
    }));

    data.stages.forEach(stage => {
      const extra = data.extras![stage.id];
      if (!extra) return;
      const customEntry = data.customEntries?.find(e => e.id === stage.id);
      const label = customEntry?.customLabel || stage.label;
      const desc = customEntry?.customDescription || stage.description;
      const outputs = [...(customEntry?.customOutputs ?? []), ...(stage.keyOutputs ?? [])];

      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: label, color: '1D3461' })],
        }),
      );

      if (desc) {
        children.push(new Paragraph({ children: [new TextRun({ text: desc, color: '555555', italics: true })] }));
      }

      if (outputs.length > 0) {
        children.push(new Paragraph({ children: [new TextRun({ text: 'Key Outputs:', bold: true })] }));
        outputs.forEach(o => {
          children.push(new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: o })],
          }));
        });
      }

      if (extra.assignees.length > 0) {
        children.push(new Paragraph({ children: [new TextRun({ text: 'Assignees:', bold: true })] }));
        children.push(new Paragraph({ children: [new TextRun({ text: extra.assignees.map(a => a.fullName).join(', ') })] }));
      }

      if (extra.checklist.length > 0) {
        const done = extra.checklist.filter(c => c.completed).length;
        children.push(new Paragraph({ children: [new TextRun({ text: `Checklist (${done}/${extra.checklist.length} done):`, bold: true })] }));
        extra.checklist.forEach(item => {
          children.push(new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({
              text: `[${item.completed ? '✓' : ' '}] ${item.itemText}`,
              color: item.completed ? '107A3C' : '333333',
            })],
          }));
        });
      }

      if (extra.attachments.length > 0) {
        children.push(new Paragraph({ children: [new TextRun({ text: `Attachments (${extra.attachments.length}):`, bold: true })] }));
        extra.attachments.forEach(att => {
          children.push(new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: att.fileName })],
          }));
        });
      }

      children.push(new Paragraph({ text: '' }));
    });
  }

  // Footer note
  children.push(
    new Paragraph({
      spacing: { before: 400 },
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: '0F2041' } },
      children: [new TextRun({ text: 'PACT Command Center — Confidential', size: 16, color: '888888', italics: true })],
    }),
  );

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const buffer = await Packer.toBuffer(doc);
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const safeName = data.projectName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
  saveAs(blob, `${safeName}_Flow_Report_${format(new Date(), 'yyyyMMdd')}.docx`);
}
