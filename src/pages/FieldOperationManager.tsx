import { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '@/context/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MMPStatus } from '@/types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuthorization } from '@/hooks/use-authorization';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useMMP } from '@/context/mmp/MMPContext';
import { cn } from '@/lib/utils';
import {
  FileText,
  Users,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Search,
  Filter,
  Download,
  X,
  Calendar,
  Building2,
  Activity,
  TrendingUp,
  Eye,
  Loader2
} from 'lucide-react';

const FIELD_OP_ROLE: import('@/types/roles').AppRole = 'Field Operation Manager (FOM)';

const CATEGORY_LABELS = [
  { key: 'all', label: 'All' },
  { key: 'approved', label: 'Approved' },
  { key: 'pending', label: 'Pending' },
  { key: 'archived', label: 'Archived' },
];

const FieldOperationManagerPage = () => {
  const { roles } = useAppContext();
  const { currentUser } = useUser();
  const { hasAnyRole } = useAuthorization();
  const navigate = useNavigate();
  const { mmpFiles: contextMmpFiles, loading: contextLoading, refreshMMPFiles } = useMMP();
  const [mmpFiles, setMmpFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [forwardedLoading, setForwardedLoading] = useState(false);
  const [forwardedMmpFiles, setForwardedMmpFiles] = useState<any[]>([]);
  
  // Sync context data to local state for transformation
  useEffect(() => {
    if (contextMmpFiles && contextMmpFiles.length > 0) {
      const mapped = contextMmpFiles.map((mmp: any) => ({
        ...mmp,
        sites: Array.isArray(mmp.siteEntries) ? mmp.siteEntries : [],
        uploadedAt: mmp.uploadedAt || mmp.uploaded_at,
        uploadedBy: mmp.uploadedBy || mmp.uploaded_by || 'Unknown',
        hub: mmp.hub,
        month: mmp.month,
        projectId: mmp.projectId || mmp.project_id,
        projectName: mmp.projectName || mmp.project?.name || mmp.project_name,
        mmpId: mmp.mmpId || mmp.mmp_id || mmp.id,
        status: mmp.status,
        siteCount: typeof mmp.entries === 'number' ? mmp.entries : (Array.isArray(mmp.siteEntries) ? mmp.siteEntries.length : 0),
        logs: mmp.workflow?.logs || [],
      }));
      setMmpFiles(mapped);
      setLoading(contextLoading);
    } else if (!contextLoading) {
      setMmpFiles([]);
      setLoading(false);
    }
  }, [contextMmpFiles, contextLoading]);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'approved' | 'pending' | 'archived'>('all');
  const [search, setSearch] = useState('');
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedReportHubs, setSelectedReportHubs] = useState<string[]>([]);
  const [selectedReportMMPs, setSelectedReportMMPs] = useState<string[]>([]);
  const [reportPeriod, setReportPeriod] = useState<string[]>([]);
  const [downloadFormat, setDownloadFormat] = useState<'pdf' | 'docx' | 'excel'>('pdf');
  const [activeView, setActiveView] = useState<'forwarded' | 'all' | 'sites'>('forwarded');

  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    (mmpFiles || []).forEach(mmp => {
      let month = (mmp as any).month;
      let year = (mmp as any).year;
      if (!month || !year) {
        const dateStr = (mmp as any).uploadedAt || (mmp as any).uploaded_at;
        if (dateStr) {
          const d = new Date(dateStr);
          month = d.getMonth() + 1;
          year = d.getFullYear();
        }
      }
      if (month && year) {
        const mm = month.toString().padStart(2, '0');
        monthsSet.add(`${year}-${mm}`);
      }
    });
    return Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
  }, [mmpFiles]);

  const matchesSelectedMonths = (mmp: any) => {
    if (!selectedMonths.length) return true;
    let month = mmp.month;
    let year = mmp.year;
    if (!month || !year) {
      const dateStr = mmp.uploadedAt || mmp.uploaded_at;
      if (dateStr) {
        const d = new Date(dateStr);
        month = d.getMonth() + 1;
        year = d.getFullYear();
      }
    }
    if (month && year) {
      const mm = month.toString().padStart(2, '0');
      return selectedMonths.includes(`${year}-${mm}`);
    }
    return false;
  };

  const allowed = hasAnyRole(['admin', 'Admin']) || hasAnyRole(['fom', 'Field Operation Manager (FOM)', FIELD_OP_ROLE]);
  
  if (!allowed) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center p-4">
        <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-8 text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-black/40 dark:text-white/40 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-black dark:text-white mb-2">Access Denied</h2>
          <p className="text-black/60 dark:text-white/60">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  const sitesPerHub = useMemo(() => {
    const map: Record<string, number> = {};
    (mmpFiles || []).forEach(mmp => {
      const hub = (mmp as any).hub || (mmp as any).projectHub || 'Unknown';
      const siteCount =
        Array.isArray((mmp as any).sites)
          ? (mmp as any).sites.length
          : typeof (mmp as any).siteCount === 'number'
            ? (mmp as any).siteCount
            : 0;
      map[hub] = (map[hub] || 0) + siteCount;
    });
    return map;
  }, [mmpFiles]);

  const stats = useMemo(() => {
    const total = mmpFiles.length;
    const approved = mmpFiles.filter(m => (m.status || '').toLowerCase() === 'approved').length;
    const pending = mmpFiles.filter(m => {
      const s = (m.status || '').toLowerCase();
      return s === 'pending' || s === 'pendingreview' || s === 'pending_review';
    }).length;
    const totalSites = mmpFiles.reduce((acc, mmp) => {
      const count = Array.isArray((mmp as any).sites)
        ? (mmp as any).sites.length
        : typeof (mmp as any).siteCount === 'number'
          ? (mmp as any).siteCount
          : 0;
      return acc + count;
    }, 0);
    const uniqueHubs = Object.keys(sitesPerHub).length;
    return { total, approved, pending, totalSites, uniqueHubs };
  }, [mmpFiles, sitesPerHub]);

  const mmpSummaries = useMemo(() => {
    if (selectedCategory === 'all') return [];
    const summaries: Array<{
      mmpName: string;
      mmpId: string;
      covered: number;
      notCovered: number;
      total: number;
    }> = [];
    (mmpFiles || []).forEach(mmp => {
      let status: 'approved' | 'pending' | 'archived' = 'pending';
      const normStatus = (mmp.status || '').toLowerCase();
      if (normStatus === 'approved') status = 'approved';
      else if (normStatus === 'archived' || normStatus === 'deleted') status = 'archived';
      if (status !== selectedCategory) return;

      const mmpName = (mmp as any).projectName || mmp.name || 'Unnamed MMP';
      const mmpId = mmp.mmpId || 'N/A';

      const sites: any[] =
        Array.isArray((mmp as any).sites)
          ? (mmp as any).sites
          : Array.isArray((mmp as any).siteEntries)
            ? (mmp as any).siteEntries
            : [];

      let covered = 0;
      let notCovered = 0;
      sites.forEach(site => {
        const isCovered =
          (typeof site.status === 'string' && site.status.toLowerCase() === 'covered') ||
          site.covered === true;
        if (isCovered) covered += 1;
        else notCovered += 1;
      });
      summaries.push({
        mmpName,
        mmpId,
        covered,
        notCovered,
        total: sites.length,
      });
    });
    return summaries;
  }, [mmpFiles, selectedCategory]);

  const allMmpSummaries = useMemo(() => {
    const summaries: Array<{
      mmpName: string;
      mmpId: string;
      status: string;
      covered: number;
      notCovered: number;
      total: number;
    }> = [];
    (mmpFiles || []).forEach(mmp => {
      let status: 'approved' | 'pending' | 'archived' = 'pending';
      const normStatus = (mmp.status || '').toLowerCase();
      if (normStatus === 'approved') status = 'approved';
      else if (normStatus === 'archived' || normStatus === 'deleted') status = 'archived';

      const mmpName = (mmp as any).projectName || mmp.name || 'Unnamed MMP';
      const mmpId = mmp.mmpId || 'N/A';

      const sites: any[] =
        Array.isArray((mmp as any).sites)
          ? (mmp as any).sites
          : Array.isArray((mmp as any).siteEntries)
            ? (mmp as any).siteEntries
            : [];

      let covered = 0;
      let notCovered = 0;
      sites.forEach(site => {
        const isCovered =
          (typeof site.status === 'string' && site.status.toLowerCase() === 'covered') ||
          site.covered === true;
        if (isCovered) covered += 1;
        else notCovered += 1;
      });
      summaries.push({
        mmpName,
        mmpId,
        status,
        covered,
        notCovered,
        total: sites.length,
      });
    });
    return summaries;
  }, [mmpFiles]);

  const normalizeStatus = (status: MMPStatus) =>
    status?.replace(/_/g, '').toLowerCase();

  const filteredMmpSummaries = useMemo(() => {
    if (selectedCategory === 'all') return [];
    return mmpSummaries.filter(summary => {
      const mmp = (mmpFiles || []).find(m =>
        (m.projectName || m.name || 'Unnamed MMP') === summary.mmpName &&
        (m.mmpId || 'N/A') === summary.mmpId
      );
      if (!mmp || !matchesSelectedMonths(mmp)) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        (summary.mmpName && summary.mmpName.toLowerCase().includes(q)) ||
        (summary.mmpId && summary.mmpId.toLowerCase().includes(q)) ||
        (summary.covered?.toString().includes(q)) ||
        (summary.notCovered?.toString().includes(q)) ||
        (summary.total?.toString().includes(q))
      );
    });
  }, [mmpSummaries, search, selectedCategory, selectedMonths, mmpFiles]);

  const filteredAllMmpSummaries = useMemo(() => {
    if (selectedCategory !== 'all') return [];
    return allMmpSummaries.filter(summary => {
      const mmp = (mmpFiles || []).find(m =>
        (m.projectName || m.name || 'Unnamed MMP') === summary.mmpName &&
        (m.mmpId || 'N/A') === summary.mmpId
      );
      if (!mmp || !matchesSelectedMonths(mmp)) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        (summary.mmpName && summary.mmpName.toLowerCase().includes(q)) ||
        (summary.mmpId && summary.mmpId.toLowerCase().includes(q)) ||
        (summary.status && summary.status.toLowerCase().includes(q)) ||
        (summary.covered?.toString().includes(q)) ||
        (summary.notCovered?.toString().includes(q)) ||
        (summary.total?.toString().includes(q))
      );
    });
  }, [allMmpSummaries, search, selectedCategory, selectedMonths, mmpFiles]);

  const allHubs = useMemo(() => {
    const set = new Set<string>();
    (mmpFiles || []).forEach(mmp => {
      const hub = (mmp as any).hub || (mmp as any).projectHub || (mmp as any).location?.hub;
      if (hub) set.add(hub);
    });
    return Array.from(set);
  }, [mmpFiles]);

  const allMMPs = useMemo(() => {
    const set = new Set<string>();
    (mmpFiles || []).forEach(mmp => {
      const name = (mmp as any).projectName || mmp.name || mmp.mmpId || mmp.id;
      if (name) set.add(name);
    });
    return Array.from(set);
  }, [mmpFiles]);

  const getUserInfo = () => {
    let userName = 'Unknown User';
    let userRole = 'Unknown Role';
    const latestMMP = (mmpFiles || []).find(
      (mmp: any) => mmp.uploadedBy && (typeof mmp.uploadedBy === 'object' || typeof mmp.uploadedBy === 'string')
    );
    if (latestMMP) {
      if (typeof latestMMP.uploadedBy === 'object' && latestMMP.uploadedBy !== null) {
        userName = latestMMP.uploadedBy.name || latestMMP.uploadedBy.fullName || latestMMP.uploadedBy.email || userName;
        userRole = latestMMP.uploadedBy.role || userRole;
      } else if (typeof latestMMP.uploadedBy === 'string') {
        userName = latestMMP.uploadedBy;
      }
    } else if (roles && roles.length > 0) {
      userRole = roles.join(', ');
      userName = roles.includes('Admin') ? 'Admin' : roles[0];
    }
    return { userName, userRole };
  };

  const handleGeneratePDF = () => {
    const doc = new jsPDF();
    const now = new Date();
    const { userName, userRole } = getUserInfo();
    const periodStr =
      reportPeriod.length === 0
        ? 'All Periods'
        : reportPeriod.length === 1
          ? reportPeriod[0]
          : `${reportPeriod[0]} to ${reportPeriod[reportPeriod.length - 1]}`;

    doc.setFontSize(16);
    doc.text('MMP Sites Report', 14, 16);
    doc.setFontSize(10);
    doc.text(`Generated by: ${userName}`, 14, 24);
    doc.text(`Account type: ${userRole}`, 14, 30);
    doc.text(`Period: ${periodStr}`, 14, 36);
    doc.text(`Generated on: ${now.toLocaleString()}`, 14, 42);

    let y = 50;
    let grandTotal = 0;
    let grandCovered = 0;
    let grandNotCovered = 0;

    const filteredMMPs = (mmpFiles || []).filter(mmp => {
      const mmpName = (mmp as any).projectName || mmp.name || mmp.mmpId || mmp.id;
      let month = (mmp as any).month;
      let year = (mmp as any).year;
      if (!month || !year) {
        const dateStr = mmp.uploadedAt;
        if (dateStr) {
          const d = new Date(dateStr);
          month = d.getMonth() + 1;
          year = d.getFullYear();
        }
      }
      const mm = month && year ? `${year}-${month.toString().padStart(2, '0')}` : '';
      return (
        (selectedReportMMPs.length === 0 || selectedReportMMPs.includes(mmpName)) &&
        (reportPeriod.length === 0 || reportPeriod.includes(mm)) &&
        (
          selectedReportHubs.length === 0 ||
          selectedReportHubs.includes((mmp as any).hub || (mmp as any).projectHub || (mmp as any).location?.hub)
        )
      );
    });

    filteredMMPs.forEach((mmp, idx) => {
      const mmpName = (mmp as any).projectName || mmp.name || mmp.mmpId || mmp.id;
      const mmpId = mmp.mmpId || mmp.id || '';
      const uploadDate = mmp.uploadedAt
        ? new Date(mmp.uploadedAt).toLocaleDateString()
        : '-';
      let status: string = (mmp.status || '').toLowerCase();
      if (status === 'archived' || status === 'deleted') status = 'archived';
      else if (status === 'approved') status = 'approved';
      else if (status === 'pending' || status === 'pendingreview') status = 'pending';
      else status = status || 'pending';

      const sites: any[] =
        Array.isArray((mmp as any).sites)
          ? (mmp as any).sites
          : Array.isArray((mmp as any).siteEntries)
            ? (mmp as any).siteEntries
            : [];

      let covered = 0;
      let notCovered = 0;
      sites.forEach(site => {
        const isCovered =
          (typeof site.status === 'string' && site.status.toLowerCase() === 'covered') ||
          site.covered === true;
        if (isCovered) covered += 1;
        else notCovered += 1;
      });
      const total = sites.length;

      grandTotal += total;
      grandCovered += covered;
      grandNotCovered += notCovered;

      doc.setFontSize(13);
      doc.text(`${idx + 1}. MMP: ${mmpName} (${mmpId})`, 14, y);
      y += 6;
      doc.setFontSize(10);
      doc.text(`Status: ${status.charAt(0).toUpperCase() + status.slice(1)}`, 14, y);
      y += 6;
      doc.text(`Upload Date: ${uploadDate}`, 14, y);
      y += 6;
      autoTable(doc, {
        head: [['Covered', 'Not Covered', 'Total']],
        body: [[covered, notCovered, total]],
        startY: y,
        theme: 'grid',
        styles: { fontSize: 10 },
      });
      // @ts-ignore
      y = (doc as any).lastAutoTable?.finalY ?? ((autoTable as any).previous && (autoTable as any).previous.finalY) ?? (y + 20);
      y += 8;
    });

    doc.setFontSize(12);
    doc.text('Grand Total (All MMPs):', 14, y);
    y += 4;
    autoTable(doc, {
      head: [['Covered', 'Not Covered', 'Total']],
      body: [[grandCovered, grandNotCovered, grandTotal]],
      startY: y,
      theme: 'grid',
      styles: { fontSize: 11, fontStyle: 'bold' },
    });

    doc.save('mmp-sites-report.pdf');
  };

  const handleGenerateDocx = async () => {
    try {
      const docx = await import('docx');
      const fileSaver = await import('file-saver');
      const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun } = docx;
      const { saveAs } = fileSaver;
      const now = new Date();
      const { userName, userRole } = getUserInfo();

      const periodStr =
        reportPeriod.length === 0
          ? 'All Periods'
          : reportPeriod.length === 1
            ? reportPeriod[0]
            : `${reportPeriod[0]} to ${reportPeriod[reportPeriod.length - 1]}`;

      const filteredMMPs = (mmpFiles || []).filter(mmp => {
        const mmpName = (mmp as any).projectName || mmp.name || mmp.mmpId || mmp.id;
        let month = (mmp as any).month;
        let year = (mmp as any).year;
        if (!month || !year) {
          const dateStr = mmp.uploadedAt;
          if (dateStr) {
            const d = new Date(dateStr);
            month = d.getMonth() + 1;
            year = d.getFullYear();
          }
        }
        const mm = month && year ? `${year}-${month.toString().padStart(2, '0')}` : '';
        return (
          (selectedReportMMPs.length === 0 || selectedReportMMPs.includes(mmpName)) &&
          (reportPeriod.length === 0 || reportPeriod.includes(mm)) &&
          (
            selectedReportHubs.length === 0 ||
            selectedReportHubs.includes((mmp as any).hub || (mmp as any).projectHub || (mmp as any).location?.hub)
          )
        );
      });

      let grandTotal = 0;
      let grandCovered = 0;
      let grandNotCovered = 0;

      const children: any[] = [
        new Paragraph({
          children: [new TextRun({ text: 'MMP Sites Report', bold: true, size: 32 })],
          spacing: { after: 200 },
        }),
        new Paragraph({ children: [new TextRun({ text: `Generated by: ${userName}`, size: 20 })] }),
        new Paragraph({ children: [new TextRun({ text: `Account type: ${userRole}`, size: 20 })] }),
        new Paragraph({ children: [new TextRun({ text: `Period: ${periodStr}`, size: 20 })] }),
        new Paragraph({ children: [new TextRun({ text: `Generated on: ${now.toLocaleString()}`, size: 20 })], spacing: { after: 200 } }),
      ];

      filteredMMPs.forEach((mmp, idx) => {
        const mmpName = (mmp as any).projectName || mmp.name || mmp.mmpId || mmp.id;
        const mmpId = mmp.mmpId || mmp.id || '';
        const uploadDate = mmp.uploadedAt ? new Date(mmp.uploadedAt).toLocaleDateString() : '-';
        let status: string = (mmp.status || '').toLowerCase();
        if (status === 'archived' || status === 'deleted') status = 'archived';
        else if (status === 'approved') status = 'approved';
        else status = 'pending';

        const sites: any[] = Array.isArray((mmp as any).sites) ? (mmp as any).sites : Array.isArray((mmp as any).siteEntries) ? (mmp as any).siteEntries : [];
        let covered = 0;
        let notCovered = 0;
        sites.forEach(site => {
          const isCovered = (typeof site.status === 'string' && site.status.toLowerCase() === 'covered') || site.covered === true;
          if (isCovered) covered += 1;
          else notCovered += 1;
        });
        const total = sites.length;
        grandTotal += total;
        grandCovered += covered;
        grandNotCovered += notCovered;

        children.push(
          new Paragraph({ children: [new TextRun({ text: `${idx + 1}. MMP: ${mmpName} (${mmpId})`, bold: true, size: 26 })], spacing: { after: 80 } }),
          new Paragraph({ children: [new TextRun({ text: `Status: ${status.charAt(0).toUpperCase() + status.slice(1)}`, size: 20 })] }),
          new Paragraph({ children: [new TextRun({ text: `Upload Date: ${uploadDate}`, size: 20 })], spacing: { after: 40 } }),
          new Table({
            rows: [
              new TableRow({ children: [new TableCell({ children: [new Paragraph('Covered')] }), new TableCell({ children: [new Paragraph('Not Covered')] }), new TableCell({ children: [new Paragraph('Total')] })] }),
              new TableRow({ children: [new TableCell({ children: [new Paragraph(covered.toString())] }), new TableCell({ children: [new Paragraph(notCovered.toString())] }), new TableCell({ children: [new Paragraph(total.toString())] })] }),
            ],
          }),
          new Paragraph({ children: [], spacing: { after: 200 } })
        );
      });

      children.push(
        new Paragraph({ children: [new TextRun({ text: 'Grand Total (All MMPs)', bold: true, size: 24 })], spacing: { before: 200, after: 80 } }),
        new Table({
          rows: [
            new TableRow({ children: [new TableCell({ children: [new Paragraph('Covered')] }), new TableCell({ children: [new Paragraph('Not Covered')] }), new TableCell({ children: [new Paragraph('Total')] })] }),
            new TableRow({ children: [new TableCell({ children: [new Paragraph(grandCovered.toString())] }), new TableCell({ children: [new Paragraph(grandNotCovered.toString())] }), new TableCell({ children: [new Paragraph(grandTotal.toString())] })] }),
          ],
        })
      );

      const doc = new Document({ sections: [{ children }] });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, 'mmp-sites-report.docx');
    } catch (error) {
      console.error('Error generating DOCX:', error);
    }
  };

  const handleGenerateExcel = () => {
    const filteredMMPs = (mmpFiles || []).filter(mmp => {
      const mmpName = (mmp as any).projectName || mmp.name || mmp.mmpId || mmp.id;
      let month = (mmp as any).month;
      let year = (mmp as any).year;
      if (!month || !year) {
        const dateStr = mmp.uploadedAt;
        if (dateStr) {
          const d = new Date(dateStr);
          month = d.getMonth() + 1;
          year = d.getFullYear();
        }
      }
      const mm = month && year ? `${year}-${month.toString().padStart(2, '0')}` : '';
      return (
        (selectedReportMMPs.length === 0 || selectedReportMMPs.includes(mmpName)) &&
        (reportPeriod.length === 0 || reportPeriod.includes(mm)) &&
        (
          selectedReportHubs.length === 0 ||
          selectedReportHubs.includes((mmp as any).hub || (mmp as any).projectHub || (mmp as any).location?.hub)
        )
      );
    });

    const { userName, userRole } = getUserInfo();
    const periodStr = reportPeriod.length === 0 ? 'All Periods' : reportPeriod.length === 1 ? reportPeriod[0] : `${reportPeriod[0]} to ${reportPeriod[reportPeriod.length - 1]}`;

    let csv = `MMP Sites Report\nGenerated by:,${userName}\nAccount type:,${userRole}\nPeriod:,${periodStr}\nGenerated on:,${new Date().toLocaleString()}\n\nMMP Name,MMP ID,Status,Upload Date,Covered,Not Covered,Total\n`;
    let grandTotal = 0, grandCovered = 0, grandNotCovered = 0;

    filteredMMPs.forEach(mmp => {
      const mmpName = (mmp as any).projectName || mmp.name || mmp.mmpId || mmp.id;
      const mmpId = mmp.mmpId || mmp.id || '';
      let status: string = (mmp.status || '').toLowerCase();
      if (status === 'archived' || status === 'deleted') status = 'archived';
      else if (status === 'approved') status = 'approved';
      else status = 'pending';
      const uploadDate = mmp.uploadedAt ? new Date(mmp.uploadedAt).toLocaleDateString() : '-';
      const sites: any[] = Array.isArray((mmp as any).sites) ? (mmp as any).sites : Array.isArray((mmp as any).siteEntries) ? (mmp as any).siteEntries : [];
      let covered = 0, notCovered = 0;
      sites.forEach(site => {
        const isCovered = (typeof site.status === 'string' && site.status.toLowerCase() === 'covered') || site.covered === true;
        if (isCovered) covered += 1;
        else notCovered += 1;
      });
      const total = sites.length;
      grandTotal += total;
      grandCovered += covered;
      grandNotCovered += notCovered;
      csv += `"${mmpName}","${mmpId}","${status}","${uploadDate}",${covered},${notCovered},${total}\n`;
    });
    csv += `"Grand Total","","","",${grandCovered},${grandNotCovered},${grandTotal}\n`;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mmp-sites-report.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Initial load - context handles this, but we can trigger a refresh if needed
  useEffect(() => {
    if (contextMmpFiles.length === 0 && !contextLoading) {
      refreshMMPFiles();
    }
  }, [contextMmpFiles.length, contextLoading, refreshMMPFiles]);

  // Filter forwarded files from context data
  useEffect(() => {
    if (!currentUser?.id) {
      setForwardedMmpFiles([]);
      return;
    }
    
    setForwardedLoading(true);
    const forwarded = mmpFiles.filter((mmp: any) => {
      const workflow = mmp.workflow || {};
      const forwardedIds = workflow.forwardedToFomIds || [];
      return Array.isArray(forwardedIds) && forwardedIds.includes(currentUser.id);
    });
    
    setForwardedMmpFiles(forwarded);
    setForwardedLoading(false);
  }, [mmpFiles, currentUser?.id]);

  const StatCard = ({ icon: Icon, label, value, subtext }: { icon: any; label: string; value: number | string; subtext?: string }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 md:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs md:text-sm text-black/60 dark:text-white/60 mb-1">{label}</p>
          <p className="text-2xl md:text-3xl font-bold text-black dark:text-white" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>{value}</p>
          {subtext && <p className="text-xs text-black/40 dark:text-white/40 mt-1">{subtext}</p>}
        </div>
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-black dark:bg-white flex items-center justify-center flex-shrink-0">
          <Icon className="h-5 w-5 md:h-6 md:w-6 text-white dark:text-black" />
        </div>
      </div>
    </motion.div>
  );

  const MMPCard = ({ mmp, isForwarded = false }: { mmp: any; isForwarded?: boolean }) => {
    const project = (mmp as any).projectName || (mmp as any).project?.name || '-';
    const hub = (mmp as any).hub || (mmp as any).projectHub || '-';
    const status: MMPStatus | undefined = mmp.status;
    const siteCount = Array.isArray((mmp as any).sites) ? (mmp as any).sites.length : (mmp as any).siteCount || 0;
    const uploadDate = mmp.uploadedAt ? new Date(mmp.uploadedAt).toLocaleDateString() : '-';
    const forwardedAt = (mmp as any).workflow?.forwardedAt ? new Date((mmp as any).workflow.forwardedAt).toLocaleDateString() : null;

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 hover-elevate active-elevate-2 cursor-pointer touch-manipulation"
        onClick={() => navigate(`/mmp/${mmp.id}`)}
        data-testid={`card-mmp-${mmp.id}`}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-black dark:text-white truncate text-sm md:text-base">
              {mmp.name || mmp.mmpId || mmp.id}
            </h3>
            <p className="text-xs text-black/60 dark:text-white/60 truncate">{project}</p>
          </div>
          <Badge
            variant={
              status && normalizeStatus(status) === 'approved' ? 'default' :
              status && (normalizeStatus(status) === 'pendingreview' || normalizeStatus(status) === 'pending') ? 'secondary' :
              'outline'
            }
            className={cn(
              "text-xs flex-shrink-0",
              status && normalizeStatus(status) === 'approved' && "bg-black dark:bg-white text-white dark:text-black"
            )}
          >
            {status ? status.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim() : 'Unknown'}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-black/60 dark:text-white/60">
            <Building2 className="h-3.5 w-3.5" />
            <span className="truncate">{hub}</span>
          </div>
          <div className="flex items-center gap-1.5 text-black/60 dark:text-white/60">
            <MapPin className="h-3.5 w-3.5" />
            <span>{siteCount} sites</span>
          </div>
          <div className="flex items-center gap-1.5 text-black/60 dark:text-white/60">
            <Calendar className="h-3.5 w-3.5" />
            <span>{isForwarded && forwardedAt ? forwardedAt : uploadDate}</span>
          </div>
          <div className="flex items-center justify-end">
            <ChevronRight className="h-4 w-4 text-black/40 dark:text-white/40" />
          </div>
        </div>
      </motion.div>
    );
  };

  const SiteSummaryCard = ({ summary }: { summary: any }) => (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-black/5 dark:bg-white/5 rounded-2xl p-4"
    >
      <div className="mb-3">
        <h3 className="font-semibold text-black dark:text-white text-sm truncate">{summary.mmpName}</h3>
        <p className="text-xs text-black/40 dark:text-white/40">{summary.mmpId}</p>
        {summary.status && (
          <Badge
            variant="outline"
            className={cn(
              "mt-2 text-xs",
              summary.status === 'approved' && "border-black/20 dark:border-white/20 text-black dark:text-white",
              summary.status === 'pending' && "border-black/20 dark:border-white/20 text-black/70 dark:text-white/70"
            )}
          >
            {summary.status.charAt(0).toUpperCase() + summary.status.slice(1)}
          </Badge>
        )}
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-black/60 dark:text-white/60">Covered</span>
          <span className="text-lg font-bold text-black dark:text-white">{summary.covered}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-black/60 dark:text-white/60">Not Covered</span>
          <span className="text-lg font-bold text-black/70 dark:text-white/70">{summary.notCovered}</span>
        </div>
        <div className="h-px bg-black/10 dark:bg-white/10 my-2" />
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-black dark:text-white">Total</span>
          <span className="text-xl font-bold text-black dark:text-white">{summary.total}</span>
        </div>
      </div>
    </motion.div>
  );

  const viewTabs = [
    { key: 'forwarded', label: 'Forwarded', icon: FileText, count: forwardedMmpFiles.length },
    { key: 'all', label: 'All MMPs', icon: Users, count: mmpFiles.length },
    { key: 'sites', label: 'Site Coverage', icon: MapPin, count: null },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-black safe-area-top safe-area-bottom">
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-10">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 md:mb-8"
        >
          <h1 className="text-2xl md:text-4xl font-bold text-black dark:text-white mb-1">
            Field Operations
          </h1>
          <p className="text-sm md:text-base text-black/60 dark:text-white/60">
            Manage MMPs and monitor field team progress
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
          <StatCard icon={FileText} label="Total MMPs" value={stats.total} />
          <StatCard icon={CheckCircle2} label="Approved" value={stats.approved} />
          <StatCard icon={Clock} label="Pending" value={stats.pending} />
          <StatCard icon={MapPin} label="Total Sites" value={stats.totalSites} subtext={`${stats.uniqueHubs} hubs`} />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4 md:mb-6 scrollbar-hide">
          {viewTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveView(tab.key as any)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-full font-medium text-sm whitespace-nowrap transition-all min-h-[44px] touch-manipulation",
                activeView === tab.key
                  ? "bg-black dark:bg-white text-white dark:text-black"
                  : "bg-black/5 dark:bg-white/5 text-black/70 dark:text-white/70"
              )}
              data-testid={`tab-${tab.key}`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {tab.count !== null && (
                <span className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full",
                  activeView === tab.key
                    ? "bg-white/20 dark:bg-black/20"
                    : "bg-black/10 dark:bg-white/10"
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeView === 'forwarded' && (
            <motion.div
              key="forwarded"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg md:text-xl font-semibold text-black dark:text-white">
                  Forwarded to You
                </h2>
              </div>
              
              {forwardedLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-black/40 dark:text-white/40" />
                </div>
              ) : forwardedMmpFiles.length === 0 ? (
                <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-8 text-center">
                  <FileText className="h-12 w-12 text-black/20 dark:text-white/20 mx-auto mb-3" />
                  <p className="text-black/60 dark:text-white/60">No MMPs forwarded to you yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                  {forwardedMmpFiles.map(mmp => (
                    <MMPCard key={mmp.id} mmp={mmp} isForwarded />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeView === 'all' && (
            <motion.div
              key="all"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                <h2 className="text-lg md:text-xl font-semibold text-black dark:text-white">
                  All MMPs
                </h2>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black/40 dark:text-white/40" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search MMPs..."
                    className="w-full md:w-64 pl-9 pr-4 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40 border-0 focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20 text-sm min-h-[44px]"
                    data-testid="input-search-mmps"
                  />
                </div>
              </div>
              
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-black/40 dark:text-white/40" />
                </div>
              ) : mmpFiles.length === 0 ? (
                <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-8 text-center">
                  <FileText className="h-12 w-12 text-black/20 dark:text-white/20 mx-auto mb-3" />
                  <p className="text-black/60 dark:text-white/60">No MMPs uploaded yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                  {mmpFiles
                    .filter(mmp => {
                      if (!search.trim()) return true;
                      const q = search.toLowerCase();
                      const name = (mmp.name || mmp.mmpId || '').toLowerCase();
                      const project = ((mmp as any).projectName || '').toLowerCase();
                      return name.includes(q) || project.includes(q);
                    })
                    .map(mmp => (
                      <MMPCard key={mmp.id} mmp={mmp} />
                    ))}
                </div>
              )}
            </motion.div>
          )}

          {activeView === 'sites' && (
            <motion.div
              key="sites"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                <h2 className="text-lg md:text-xl font-semibold text-black dark:text-white">
                  Site Coverage
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black/40 dark:text-white/40" />
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search..."
                      className="w-full md:w-48 pl-9 pr-4 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40 border-0 focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20 text-sm min-h-[44px]"
                      data-testid="input-search-sites"
                    />
                  </div>
                  <Button
                    onClick={() => setReportModalOpen(true)}
                    className="bg-black dark:bg-white text-white dark:text-black rounded-xl min-h-[44px]"
                    data-testid="button-generate-report"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Report
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide">
                {CATEGORY_LABELS.map(cat => (
                  <button
                    key={cat.key}
                    onClick={() => setSelectedCategory(cat.key as any)}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all min-h-[40px] touch-manipulation",
                      selectedCategory === cat.key
                        ? "bg-black dark:bg-white text-white dark:text-black"
                        : "bg-black/5 dark:bg-white/5 text-black/70 dark:text-white/70"
                    )}
                    data-testid={`category-${cat.key}`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {selectedCategory !== 'all' ? (
                  filteredMmpSummaries.length > 0 ? (
                    filteredMmpSummaries.map((summary, idx) => (
                      <SiteSummaryCard key={summary.mmpId + idx} summary={summary} />
                    ))
                  ) : (
                    <div className="col-span-full bg-black/5 dark:bg-white/5 rounded-2xl p-8 text-center">
                      <Activity className="h-12 w-12 text-black/20 dark:text-white/20 mx-auto mb-3" />
                      <p className="text-black/60 dark:text-white/60">No data available for this category</p>
                    </div>
                  )
                ) : (
                  filteredAllMmpSummaries.length > 0 ? (
                    filteredAllMmpSummaries.map((summary, idx) => (
                      <SiteSummaryCard key={summary.mmpId + summary.status + idx} summary={summary} />
                    ))
                  ) : (
                    <div className="col-span-full bg-black/5 dark:bg-white/5 rounded-2xl p-8 text-center">
                      <Activity className="h-12 w-12 text-black/20 dark:text-white/20 mx-auto mb-3" />
                      <p className="text-black/60 dark:text-white/60">No data available</p>
                    </div>
                  )
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {reportModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm p-4 safe-area-bottom"
            onClick={() => setReportModalOpen(false)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-white dark:bg-black p-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
                <h3 className="text-lg font-bold text-black dark:text-white">Generate Report</h3>
                <button
                  onClick={() => setReportModalOpen(false)}
                  className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center"
                  data-testid="button-close-modal"
                >
                  <X className="h-5 w-5 text-black/60 dark:text-white/60" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-black dark:text-white mb-2">Period (Months)</label>
                  <div className="flex flex-wrap gap-2">
                    {availableMonths.length === 0 ? (
                      <p className="text-sm text-black/40 dark:text-white/40">No months available</p>
                    ) : (
                      availableMonths.map(month => (
                        <button
                          key={month}
                          onClick={() => setReportPeriod(prev => prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month])}
                          className={cn(
                            "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                            reportPeriod.includes(month)
                              ? "bg-black dark:bg-white text-white dark:text-black"
                              : "bg-black/5 dark:bg-white/5 text-black/70 dark:text-white/70"
                          )}
                        >
                          {month}
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-black dark:text-white mb-2">Hubs</label>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                    {allHubs.length === 0 ? (
                      <p className="text-sm text-black/40 dark:text-white/40">No hubs available</p>
                    ) : (
                      allHubs.map(hub => (
                        <button
                          key={hub}
                          onClick={() => setSelectedReportHubs(prev => prev.includes(hub) ? prev.filter(h => h !== hub) : [...prev, hub])}
                          className={cn(
                            "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                            selectedReportHubs.includes(hub)
                              ? "bg-black dark:bg-white text-white dark:text-black"
                              : "bg-black/5 dark:bg-white/5 text-black/70 dark:text-white/70"
                          )}
                        >
                          {hub}
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-black dark:text-white mb-2">Format</label>
                  <div className="flex gap-2">
                    {(['pdf', 'docx', 'excel'] as const).map(format => (
                      <button
                        key={format}
                        onClick={() => setDownloadFormat(format)}
                        className={cn(
                          "flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                          downloadFormat === format
                            ? "bg-black dark:bg-white text-white dark:text-black"
                            : "bg-black/5 dark:bg-white/5 text-black/70 dark:text-white/70"
                        )}
                        data-testid={`format-${format}`}
                      >
                        {format.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={() => {
                    if (downloadFormat === 'pdf') handleGeneratePDF();
                    else if (downloadFormat === 'docx') handleGenerateDocx();
                    else if (downloadFormat === 'excel') handleGenerateExcel();
                    setReportModalOpen(false);
                  }}
                  className="w-full bg-black dark:bg-white text-white dark:text-black rounded-xl py-6 text-base font-semibold min-h-[52px]"
                  data-testid="button-download-report"
                >
                  <Download className="h-5 w-5 mr-2" />
                  Download Report
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FieldOperationManagerPage;
