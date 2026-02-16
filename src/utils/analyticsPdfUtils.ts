import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

const C = {
  navy: [15, 32, 65] as [number, number, number],
  navyMid: [22, 48, 90] as [number, number, number],
  blue: [41, 98, 255] as [number, number, number],
  blueLight: [232, 240, 255] as [number, number, number],
  dark: [20, 20, 30] as [number, number, number],
  body: [45, 45, 60] as [number, number, number],
  label: [90, 95, 110] as [number, number, number],
  muted: [120, 125, 140] as [number, number, number],
  border: [200, 205, 215] as [number, number, number],
  bgLight: [245, 247, 252] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  green: [16, 120, 60] as [number, number, number],
  amber: [180, 120, 0] as [number, number, number],
};

export { C, autoTable };

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export async function loadLogoAsDataUrl(): Promise<string | null> {
  try {
    const resp = await fetch('/pact-logo.png');
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function loadArabicFont(doc: jsPDF): Promise<boolean> {
  try {
    const resp = await fetch('/fonts/Amiri-Regular.ttf');
    if (!resp.ok) return false;
    const buffer = await resp.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    doc.addFileToVFS('Amiri-Regular.ttf', base64);
    doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');
    return true;
  } catch {
    return false;
  }
}

export function arText(doc: jsPDF, hasArabic: boolean, text: string, x: number, y: number, opts?: any) {
  if (!hasArabic) return;
  doc.setFont('Amiri', 'normal');
  doc.text(text, x, y, opts);
  doc.setFont('helvetica', 'normal');
}

export async function drawPdfHeader(
  doc: jsPDF,
  title: string,
  arabicTitle?: string,
  subtitle?: string,
  orientation: 'portrait' | 'landscape' = 'portrait'
): Promise<number> {
  const pw = doc.internal.pageSize.width;
  const ml = 14;
  const mr = 14;

  const logoDataUrl = await loadLogoAsDataUrl();
  const hasArabic = await loadArabicFont(doc);

  doc.setFillColor(...C.navy);
  doc.rect(0, 0, pw, 34, 'F');
  doc.setFillColor(...C.navyMid);
  doc.rect(0, 32, pw, 2, 'F');

  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, 'PNG', ml + 1, 5, 22, 22); } catch {}
  }

  doc.setFontSize(18);
  doc.setTextColor(...C.white);
  doc.setFont('helvetica', 'bold');
  doc.text('PACT', ml + 27, 16);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Command Center  |  Questionnaire Analytics', ml + 27, 22);
  if (hasArabic && arabicTitle) {
    doc.setFontSize(10);
    doc.setTextColor(190, 205, 225);
    arText(doc, hasArabic, 'مركز قيادة باكت', ml + 27, 28);
  }

  doc.setFontSize(8);
  doc.setTextColor(190, 205, 225);
  doc.setFont('helvetica', 'bold');
  doc.text(format(new Date(), 'MMM d, yyyy | HH:mm'), pw - mr, 13, { align: 'right' });

  let y = 40;

  doc.setFontSize(14);
  doc.setTextColor(...C.dark);
  doc.setFont('helvetica', 'bold');
  doc.text(title, ml, y);

  if (hasArabic && arabicTitle) {
    doc.setFontSize(11);
    doc.setTextColor(...C.muted);
    arText(doc, hasArabic, arabicTitle, pw - mr, y, { align: 'right' });
  }
  y += 6;

  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(...C.label);
    if (hasArabic && ARABIC_RE.test(subtitle)) {
      doc.setFont('Amiri', 'normal');
    } else {
      doc.setFont('helvetica', 'normal');
    }
    doc.text(subtitle, ml, y);
    doc.setFont('helvetica', 'normal');
    y += 6;
  }

  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(ml, y, pw - mr, y);
  y += 6;

  return y;
}

export function addPageHeader(doc: jsPDF, title: string) {
  const pw = doc.internal.pageSize.width;
  doc.setFillColor(...C.navy);
  doc.rect(0, 0, pw, 10, 'F');
  doc.setFontSize(7);
  doc.setTextColor(...C.white);
  doc.setFont('helvetica', 'normal');
  doc.text(`PACT Command Center — ${title}`, 14, 7);
  doc.text(format(new Date(), 'MMM d, yyyy'), pw - 14, 7, { align: 'right' });
}

export function addFooter(doc: jsPDF, pageNum: number, totalPages: number) {
  const pw = doc.internal.pageSize.width;
  const ph = doc.internal.pageSize.height;
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(14, ph - 12, pw - 14, ph - 12);
  doc.setFontSize(7);
  doc.setTextColor(...C.muted);
  doc.setFont('helvetica', 'normal');
  doc.text('PACT Command Center — Confidential', 14, ph - 7);
  doc.text(`Page ${pageNum} of ${totalPages}`, pw - 14, ph - 7, { align: 'right' });
}

export function addAllFooters(doc: jsPDF) {
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages);
  }
}

function hasArabicChars(text: string): boolean {
  return ARABIC_RE.test(text);
}

export function styledAutoTable(
  doc: jsPDF,
  head: string[][],
  body: (string | number)[][],
  startY: number,
  options?: {
    margin?: { left?: number; right?: number };
    fontSize?: number;
    boldLastRow?: boolean;
    columnStyles?: Record<number, any>;
    useArabicFont?: boolean;
  }
) {
  const opts = options || {};
  const fs = opts.fontSize || 8;
  let amiriAvailable = opts.useArabicFont || false;
  if (!amiriAvailable) {
    try {
      const fl = doc.getFontList();
      amiriAvailable = !!fl['Amiri'];
    } catch { amiriAvailable = false; }
  }
  autoTable(doc, {
    head,
    body,
    startY,
    margin: opts.margin || { left: 14, right: 14 },
    styles: {
      fontSize: fs,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      lineColor: [200, 205, 215],
      lineWidth: 0.2,
      textColor: C.body,
      overflow: 'linebreak',
      halign: 'left',
      font: 'helvetica',
    },
    headStyles: {
      fillColor: C.navy,
      textColor: C.white,
      fontStyle: 'bold',
      fontSize: fs,
      cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
      halign: 'center',
    },
    alternateRowStyles: { fillColor: C.bgLight },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold', ...(opts.columnStyles?.[0] || {}) },
      ...Object.fromEntries(
        head[0].slice(1).map((_, i) => [i + 1, { halign: 'center', overflow: 'visible' as const, ...(opts.columnStyles?.[i + 1] || {}) }])
      ),
    },
    didParseCell: (data: any) => {
      if (opts.boldLastRow && data.row.index === body.length - 1 && data.section === 'body') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [226, 232, 240];
        data.cell.styles.textColor = C.dark;
      }
      if (amiriAvailable && data.section === 'body') {
        const raw = data.cell.raw;
        const cellText = typeof raw === 'string' ? raw : Array.isArray(data.cell.text) ? data.cell.text.join('') : String(raw ?? '');
        if (hasArabicChars(cellText)) {
          data.cell.styles.font = 'Amiri';
          data.cell.styles.fontStyle = 'normal';
        }
      }
    },
    willDrawCell: (data: any) => {
      if (amiriAvailable && data.section === 'body') {
        const raw = data.cell.raw;
        const cellText = typeof raw === 'string' ? raw : Array.isArray(data.cell.text) ? data.cell.text.join('') : String(raw ?? '');
        if (hasArabicChars(cellText)) {
          doc.setFont('Amiri', 'normal');
        }
      }
    },
    didDrawCell: (data: any) => {
      if (amiriAvailable && data.section === 'body') {
        doc.setFont('helvetica', 'normal');
      }
    },
  });
  return (doc as any).lastAutoTable.finalY;
}
