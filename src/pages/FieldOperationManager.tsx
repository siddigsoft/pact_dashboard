import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { MMPStatus } from '@/types';
import jsPDF from 'jspdf'; // npm install jspdf
import autoTable from 'jspdf-autotable'; // npm install jspdf-autotable

const FIELD_OP_ROLE = 'fieldOpManager'; // Adjust if your AppRole uses a different value

const CATEGORY_LABELS = [
  { key: 'all', label: 'All' },
  { key: 'approved', label: 'Approved' },
  { key: 'pending', label: 'Pending' },
  { key: 'archived', label: 'Archived' },
];

// --- Fixes and checklist for fetching MMP data from Supabase ---

// 1. Make sure SUPABASE_URL and SUPABASE_ANON_KEY are set to your real project values (not placeholders).
// 2. Confirm your table name is "mmp_files" and you have data in it.
// 3. Ensure Row Level Security (RLS) is disabled or you have a SELECT policy for anon/public users.
// 4. Use the correct Supabase client (do not create a new client if you already have one in your project).
// 5. Log errors and data for debugging.

import { supabase } from '@/integrations/supabase/client'; // Use your shared client, not createClient()

const FieldOperationManagerPage = () => {
  const { roles } = useAppContext();
  const navigate = useNavigate();
  const [mmpFiles, setMmpFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'approved' | 'pending' | 'archived'>('all');
  const [search, setSearch] = useState('');
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedReportHubs, setSelectedReportHubs] = useState<string[]>([]);
  const [selectedReportMMPs, setSelectedReportMMPs] = useState<string[]>([]);
  const [reportPeriod, setReportPeriod] = useState<string[]>([]);

  // Add state for download format
  const [downloadFormat, setDownloadFormat] = useState<'pdf' | 'docx' | 'excel'>('pdf');

  // Extract unique months from mmpFiles (format: 'YYYY-MM')
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    (mmpFiles || []).forEach(mmp => {
      // Try to get month and year, fallback to uploadedAt
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
    // Sort descending (latest first)
    return Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
  }, [mmpFiles]);

  // Helper to check if a record matches selected months
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

  const allowed = roles?.includes('admin') || roles?.includes(FIELD_OP_ROLE as any);
  if (!allowed) {
    return (
      <div className="max-w-xl mx-auto mt-20 p-8 bg-white rounded-xl shadow text-center">
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-gray-600">You do not have permission to view this page.</p>
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

  // Compute per-MMP summaries for the selected category (approved/pending/archived)
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

  // Compute per-MMP summaries for all categories (for "All" tab)
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

  // Helper to normalize status for comparison
  const normalizeStatus = (status: MMPStatus) =>
    status?.replace(/_/g, '').toLowerCase();

  // Filtered per-MMP summaries for selected category and search
  const filteredMmpSummaries = useMemo(() => {
    if (selectedCategory === 'all') return [];
    return mmpSummaries.filter(summary => {
      // Find the original mmp record to check month/year
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

  // Filtered allMmpSummaries for "All" tab, search, and months
  const filteredAllMmpSummaries = useMemo(() => {
    if (selectedCategory !== 'all') return [];
    return allMmpSummaries.filter(summary => {
      // Find the original mmp record to check month/year
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

  // Get all unique hubs and MMPs for filter options
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

  // Filtered data for report based on selected features
  const reportData = useMemo(() => {
    return Object.entries(sitesPerHub)
      .filter(([hub]) => selectedReportHubs.length === 0 || selectedReportHubs.includes(hub))
      .map(([hub, totalSites]) => {
        // Find MMPs for this hub and period
        const mmpList = (mmpFiles || []).filter(mmp => {
          const mmpHub = (mmp as any).hub || (mmp as any).projectHub || (mmp as any).location?.hub;
          const mmpName = (mmp as any).projectName || mmp.name || mmp.mmpId || mmp.id;
          // Period filter
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
            mmpHub === hub &&
            (selectedReportMMPs.length === 0 || selectedReportMMPs.includes(mmpName)) &&
            (reportPeriod.length === 0 || reportPeriod.includes(mm))
          );
        });
        return {
          hub,
          totalSites,
          mmpList,
        };
      });
  }, [sitesPerHub, mmpFiles, selectedReportHubs, selectedReportMMPs, reportPeriod]);

  // Helper to get user info for report
  const getUserInfo = () => {
    // Try to get the latest uploader from the MMPs list (if available)
    let userName = 'Unknown User';
    let userRole = 'Unknown Role';

    // Find the most recent MMP with an uploader
    const latestMMP = (mmpFiles || []).find(
      (mmp: any) => mmp.uploadedBy && (typeof mmp.uploadedBy === 'object' || typeof mmp.uploadedBy === 'string')
    );

    if (latestMMP) {
      if (typeof latestMMP.uploadedBy === 'object' && latestMMP.uploadedBy !== null) {
        userName =
          latestMMP.uploadedBy.name ||
          latestMMP.uploadedBy.fullName ||
          latestMMP.uploadedBy.email ||
          userName;
        userRole = latestMMP.uploadedBy.role || userRole;
      } else if (typeof latestMMP.uploadedBy === 'string') {
        userName = latestMMP.uploadedBy;
        // Role may not be available if uploadedBy is a string
      }
    } else if (roles && roles.length > 0) {
      userRole = roles.join(', ');
      userName = roles.includes('admin') ? 'admin' : roles[0];
    }

    return { userName, userRole };
  };

  // Generate PDF report
  const handleGeneratePDF = () => {
    const doc = new jsPDF();
    const now = new Date();
    const { userName, userRole } = getUserInfo();

    // Compose period string
    const periodStr =
      reportPeriod.length === 0
        ? 'All Periods'
        : reportPeriod.length === 1
          ? reportPeriod[0]
          : `${reportPeriod[0]} to ${reportPeriod[reportPeriod.length - 1]}`;

    // Header
    doc.setFontSize(16);
    doc.text('MMP Sites Report', 14, 16);
    doc.setFontSize(10);
    doc.text(`Generated by: ${userName}`, 14, 24);
    doc.text(`Account type: ${userRole}`, 14, 30);
    doc.text(`Period: ${periodStr}`, 14, 36);
    doc.text(`Generated on: ${now.toLocaleString()}`, 14, 42);

    // For each MMP, show summary
    let y = 50;
    let grandTotal = 0;
    let grandCovered = 0;
    let grandNotCovered = 0;

    // Filter MMPs based on selected report filters
    const filteredMMPs = (mmpFiles || []).filter(mmp => {
      const mmpName = (mmp as any).projectName || mmp.name || mmp.mmpId || mmp.id;
      // Period filter
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
      // Get status
      let status: string = (mmp.status || '').toLowerCase();
      if (status === 'archived' || status === 'deleted') status = 'archived';
      else if (status === 'approved') status = 'approved';
      else if (status === 'pending' || status === 'pendingreview') status = 'pending';
      else status = status || 'pending';

      // Sites
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

      // MMP Section
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
        didDrawPage: (data) => {},
      });
      // Use autoTable.previous.finalY instead of doc.lastAutoTable.finalY
      // @ts-ignore
      y = (doc as any).lastAutoTable?.finalY
        // fallback for some versions of jspdf-autotable
        ?? ((autoTable as any).previous && (autoTable as any).previous.finalY)
        ?? (y + 20);
      y += 8;
    });

    // Grand Total
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

  // Replace handleGenerateDocx with dynamic import (works with Vite for non-ESM packages)
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

      // Filter MMPs based on selected report filters
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
        new Paragraph({
          children: [
            new TextRun({ text: `Generated by: ${userName}`, size: 20 }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `Account type: ${userRole}`, size: 20 }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `Period: ${periodStr}`, size: 20 }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `Generated on: ${now.toLocaleString()}`, size: 20 }),
          ],
          spacing: { after: 200 },
        }),
      ];

      filteredMMPs.forEach((mmp, idx) => {
        const mmpName = (mmp as any).projectName || mmp.name || mmp.mmpId || mmp.id;
        const mmpId = mmp.mmpId || mmp.id || '';
        const uploadDate = mmp.uploadedAt
          ? new Date(mmp.uploadedAt).toLocaleDateString()
          : '-';
        // Get status
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

        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${idx + 1}. MMP: ${mmpName} (${mmpId})`, bold: true, size: 26 }),
            ],
            spacing: { after: 80 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Status: ${status.charAt(0).toUpperCase() + status.slice(1)}`, size: 20 }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Upload Date: ${uploadDate}`, size: 20 }),
            ],
            spacing: { after: 40 },
          }),
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph('Covered')] }),
                  new TableCell({ children: [new Paragraph('Not Covered')] }),
                  new TableCell({ children: [new Paragraph('Total')] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph(covered.toString())] }),
                  new TableCell({ children: [new Paragraph(notCovered.toString())] }),
                  new TableCell({ children: [new Paragraph(total.toString())] }),
                ],
              }),
            ],
          }),
          new Paragraph({ children: [], spacing: { after: 120 } })
        );
      });

      // Grand Total
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'Grand Total (All MMPs):', bold: true, size: 24 })],
          spacing: { after: 40 },
        }),
        new Table({
          rows: [
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph('Covered')] }),
                new TableCell({ children: [new Paragraph('Not Covered')] }),
                new TableCell({ children: [new Paragraph('Total')] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph(grandCovered.toString())] }),
                new TableCell({ children: [new Paragraph(grandNotCovered.toString())] }),
                new TableCell({ children: [new Paragraph(grandTotal.toString())] }),
              ],
            }),
          ],
        })
      );

      const doc = new Document({
        sections: [
          {
            children,
          },
        ],
      });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, 'mmp-sites-report.docx');
    } catch (err) {
      alert('DOCX export requires the \"docx\" and \"file-saver\" packages. Please install them with:\\nnpm install docx file-saver');
    }
  };

  // Add Excel export (simple CSV)
  const handleGenerateExcel = () => {
    // Filter MMPs based on selected report filters (same as PDF/DOCX)
    const filteredMMPs = (mmpFiles || []).filter(mmp => {
      const mmpName = (mmp as any).projectName || mmp.name || mmp.mmpId || mmp.id;
      // Period filter
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
    const periodStr =
      reportPeriod.length === 0
        ? 'All Periods'
        : reportPeriod.length === 1
          ? reportPeriod[0]
          : `${reportPeriod[0]} to ${reportPeriod[reportPeriod.length - 1]}`;

    let csv =
      `MMP Sites Report\n` +
      `Generated by:,${userName}\n` +
      `Account type:,${userRole}\n` +
      `Period:,${periodStr}\n` +
      `Generated on:,${new Date().toLocaleString()}\n\n` +
      'MMP Name,MMP ID,Status,Upload Date,Covered,Not Covered,Total\n';
    let grandTotal = 0, grandCovered = 0, grandNotCovered = 0;

    filteredMMPs.forEach(mmp => {
      const mmpName = (mmp as any).projectName || mmp.name || mmp.mmpId || mmp.id;
      const mmpId = mmp.mmpId || mmp.id || '';
      // Get status
      let status: string = (mmp.status || '').toLowerCase();
      if (status === 'archived' || status === 'deleted') status = 'archived';
      else if (status === 'approved') status = 'approved';
      else if (status === 'pending' || status === 'pendingreview') status = 'pending';
      else status = status || 'pending';

      const uploadDate = mmp.uploadedAt
        ? new Date(mmp.uploadedAt).toLocaleDateString()
        : '-';

      // Calculate covered, notCovered, total for this MMP
      const sites: any[] =
        Array.isArray((mmp as any).sites)
          ? (mmp as any).sites
          : Array.isArray((mmp as any).siteEntries)
            ? (mmp as any).siteEntries
            : [];
      let covered = 0, notCovered = 0;
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

      csv += `"${mmpName}","${mmpId}","${status}","${uploadDate}",${covered},${notCovered},${total}\n`;
    });
    // Add grand total
    csv += `"Grand Total","","",${grandCovered},${grandNotCovered},${grandTotal}\n`;

    // Download as .csv
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

  // Add a reusable MultiSelectDropdown component for checkboxes in dropdowns
  const MultiSelectDropdown = ({
    label,
    options,
    selected,
    setSelected,
    allLabel = 'All',
  }: {
    label: string;
    options: string[];
    selected: string[];
    setSelected: (v: string[]) => void;
    allLabel?: string;
  }) => {
    const [open, setOpen] = useState(false);
    const allChecked = options.length > 0 && selected.length === options.length;
    const toggleAll = () => {
      setSelected(allChecked ? [] : options);
    };
    const toggleOption = (opt: string) => {
      setSelected(selected.includes(opt) ? selected.filter(o => o !== opt) : [...selected, opt]);
    };
    return (
      <div className="relative w-full">
        <button
          type="button"
          className="w-full px-3 py-2 rounded border border-blue-200 dark:border-blue-800 bg-white dark:bg-blue-950 text-blue-900 dark:text-blue-100 flex items-center justify-between"
          onClick={() => setOpen(v => !v)}
        >
          <span>
            {selected.length === 0
              ? `Select ${label}`
              : allChecked
                ? `${allLabel} (${options.length})`
                : selected.join(', ')}
          </span>
          <span className="ml-2">{open ? '▲' : '▼'}</span>
        </button>
        {open && (
          <div className="absolute z-10 mt-1 w-full max-h-60 overflow-auto bg-white dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg shadow-lg">
            <label className="flex items-center px-4 py-2 hover:bg-blue-50 dark:hover:bg-blue-900 cursor-pointer font-semibold">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={toggleAll}
                className="mr-2"
              />
              <span>{allLabel}</span>
            </label>
            {options.map(opt => (
              <label
                key={opt}
                className="flex items-center px-4 py-2 hover:bg-blue-50 dark:hover:bg-blue-900 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggleOption(opt)}
                  className="mr-2"
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    );
  };

  React.useEffect(() => {
    setLoading(true);
    supabase
      .from('mmp_files')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error('Supabase error:', error);
          setLoading(false);
          return;
        }
        if (!data || data.length === 0) {
          console.warn('No MMP data returned from Supabase');
        } else {
          console.log('Fetched MMP data:', data);
        }
        // Map DB fields to frontend fields
        const mapped = (data || []).map((mmp: any) => ({
          ...mmp,
          sites: Array.isArray(mmp.site_entries) ? mmp.site_entries : [],
          uploadedAt: mmp.uploaded_at,
          uploadedBy: mmp.uploaded_by || 'Unknown',
          projectName: mmp.name,
          mmpId: mmp.mmp_id || mmp.id,
          status: mmp.status,
          siteCount: typeof mmp.entries === 'number' ? mmp.entries : (Array.isArray(mmp.site_entries) ? mmp.site_entries.length : 0),
          logs: mmp.workflow?.logs || [],
        }));
        setMmpFiles(mapped);
        setLoading(false);
      });
  }, [
    // add dependencies if you want to refetch on filter changes
  ]);

  return (
    <div className="min-h-screen py-10 px-2 md:px-8 bg-gradient-to-br from-slate-50 via-blue-50 to-blue-100 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900 space-y-10">
      <div className="max-w-5xl mx-auto">
        <div className="bg-gradient-to-r from-blue-700/90 to-blue-500/80 dark:from-blue-900 dark:to-blue-700 p-8 rounded-2xl shadow-xl border border-blue-100 dark:border-blue-900 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-white to-blue-200 dark:from-blue-200 dark:to-blue-400 bg-clip-text text-transparent tracking-tight mb-2">
              Field Operation Manager
            </h1>
            <p className="text-blue-100 dark:text-blue-200/80 font-medium">
              Review and forward MMPs to related hubs before site-level execution.
            </p>
          </div>
        </div>
      </div>
      <div className="max-w-5xl mx-auto">
        <Card className="mb-10 p-8 bg-white/90 dark:bg-gray-900/90 rounded-2xl shadow-lg border border-blue-100 dark:border-blue-900">
          <h2 className="text-2xl font-semibold mb-6 text-blue-800 dark:text-blue-200">Uploaded MMPs</h2>
          <div className="overflow-x-auto rounded-lg">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-blue-50 dark:bg-blue-950 text-blue-900 dark:text-blue-100">
                  <th className="px-4 py-3 text-left font-semibold">MMP Name</th>
                  <th className="px-4 py-3 text-left font-semibold">Upload Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Uploaded By</th>
                  <th className="px-4 py-3 text-left font-semibold">Role</th>
                  <th className="px-4 py-3 text-left font-semibold">Hub</th>
                  <th className="px-4 py-3 text-left font-semibold">Total Sites</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Logs</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {(mmpFiles || []).map(mmp => {
                  // Extract real information with proper fallbacks
                  const uploadedBy = (mmp as any).uploadedBy;
                  let uploadedByName = '-';
                  let uploadedByRole = '-';
                  if (typeof uploadedBy === 'object' && uploadedBy !== null) {
                    uploadedByName = uploadedBy.name || uploadedBy.fullName || uploadedBy.email || '-';
                    uploadedByRole = uploadedBy.role || '-';
                  } else if (typeof uploadedBy === 'string') {
                    uploadedByName = uploadedBy;
                  }

                  // Fix: define hub and siteCount before using them
                  const hub = (mmp as any).hub || (mmp as any).projectHub || (mmp as any).location?.hub || '-';
                  let siteCount = 0;
                  if (Array.isArray((mmp as any).sites)) siteCount = (mmp as any).sites.length;
                  else if (Array.isArray((mmp as any).siteEntries)) siteCount = (mmp as any).siteEntries.length;
                  else if (typeof (mmp as any).entries === 'number') siteCount = (mmp as any).entries;
                  else if (typeof (mmp as any).processedEntries === 'number') siteCount = (mmp as any).processedEntries;
                  else if (typeof (mmp as any).siteCount === 'number') siteCount = (mmp as any).siteCount;

                  // Try to get logs from .logs, .modificationHistory, or .modification_history
                  const logs = (mmp as any).logs
                    || (mmp as any).modificationHistory
                    || (mmp as any).modification_history
                    || [];

                  // Fix: use only camelCase 'uploadedAt'
                  const uploadDate = mmp.uploadedAt
                    ? new Date(mmp.uploadedAt).toLocaleDateString()
                    : '-';

                  // Fix: status is always MMPStatus or undefined, never '-'
                  const status: MMPStatus | undefined = mmp.status;

                  return (
                    <tr key={mmp.id} className="border-b last:border-0 hover:bg-blue-50/40 dark:hover:bg-blue-900/40 transition">
                      <td className="px-4 py-3 font-medium">{(mmp as any).projectName || mmp.name || mmp.mmpId || mmp.id}</td>
                      <td className="px-4 py-3">{uploadDate}</td>
                      <td className="px-4 py-3">{uploadedByName}</td>
                      <td className="px-4 py-3">
                        <Badge variant={uploadedByRole === 'admin' ? 'default' : 'outline'}>
                          {uploadedByRole}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{hub}</td>
                      <td className="px-4 py-3">{siteCount}</td>
                      <td className="px-4 py-3">
                        <Badge variant={
                          status && normalizeStatus(status) === 'pendingreview' ? 'outline' :
                          status && normalizeStatus(status) === 'reviewed' ? 'default' :
                          status && normalizeStatus(status) === 'approved' ? 'success' : 'secondary'
                        }>
                          {status
                            ? status.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toUpperCase()
                            : ''}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <ul className="text-xs space-y-1">
                          {(logs?.slice(-2) || []).map((log: any, idx: number) => (
                            <li key={idx}>
                              {log.action || log.type || 'Updated'}
                              {log.by ? ` by ${log.by}` : ''}
                              {log.date ? ` on ${new Date(log.date).toLocaleDateString()}` : ''}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          className="text-blue-700 dark:text-blue-300 hover:underline text-xs font-semibold"
                          onClick={() => navigate(`/mmp/${mmp.id}`)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {(!mmpFiles || mmpFiles.length === 0) && (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-muted-foreground">
                      No MMPs uploaded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="p-8 bg-white/90 dark:bg-gray-900/90 rounded-2xl shadow-lg border border-blue-100 dark:border-blue-900">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
            <h2 className="text-2xl font-semibold text-blue-800 dark:text-blue-200">
              Total Sites Per Hub
            </h2>
            {/* Search and Month Filter beside the title */}
            <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto relative">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by MMP name, ID, or status..."
                className="w-full md:w-80 px-4 py-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-blue-950 text-blue-900 dark:text-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <div className="relative">
                <button
                  type="button"
                  className="w-full md:w-56 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-blue-950 text-blue-900 dark:text-blue-100 flex items-center justify-between"
                  onClick={() => setShowMonthDropdown(v => !v)}
                >
                  {selectedMonths.length === 0
                    ? 'Filter by Month'
                    : selectedMonths.map(m => m).join(', ')}
                  <span className="ml-2">{showMonthDropdown ? '▲' : '▼'}</span>
                </button>
                {showMonthDropdown && (
                  <div className="absolute z-10 mt-1 w-full max-h-60 overflow-auto bg-white dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg shadow-lg">
                    {availableMonths.length === 0 && (
                      <div className="px-4 py-2 text-sm text-muted-foreground">No months</div>
                    )}
                    {availableMonths.map(month => (
                      <label
                        key={month}
                        className="flex items-center px-4 py-2 hover:bg-blue-50 dark:hover:bg-blue-900 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedMonths.includes(month)}
                          onChange={e => {
                            setSelectedMonths(prev =>
                              e.target.checked
                                ? [...prev, month]
                                : prev.filter(m => m !== month)
                            );
                          }}
                          className="mr-2"
                        />
                        <span>{month}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Category Tabs */}
          <div className="flex gap-2 mb-6">
            {CATEGORY_LABELS.map(cat => (
              <button
                key={cat.key}
                className={`px-4 py-2 rounded-full font-semibold transition-all duration-150
                  ${selectedCategory === cat.key
                    ? 'bg-blue-700 text-white shadow'
                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:hover:bg-blue-900'}
                `}
                onClick={() => setSelectedCategory(cat.key as any)}
              >
                {cat.label}
              </button>
            ))}
            {/* Report Button */}
            <button
              className="ml-auto px-4 py-2 rounded-full bg-blue-700 text-white font-semibold shadow hover:bg-blue-800"
              onClick={() => setReportModalOpen(true)}
              type="button"
            >
              Generate Report
            </button>
          </div>
          {/* Show per-MMP summary for selected category */}
          {selectedCategory !== 'all' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {filteredMmpSummaries.length > 0 ? (
                filteredMmpSummaries.map((summary, idx) => (
                  <div key={summary.mmpId + idx} className="bg-blue-100 dark:bg-blue-950 rounded-xl p-6 flex flex-col items-center shadow border border-blue-200 dark:border-blue-800">
                    <div className="text-base font-semibold text-blue-900 dark:text-blue-200 mb-1">{summary.mmpName}</div>
                    <div className="text-xs text-muted-foreground mb-2">{summary.mmpId}</div>
                    <div className="flex flex-col gap-1 w-full">
                      <div className="flex justify-between w-full">
                        <span className="text-xs text-muted-foreground">Covered</span>
                        <span className="text-xl font-bold text-green-700">{summary.covered}</span>
                      </div>
                      <div className="flex justify-between w-full">
                        <span className="text-xs text-muted-foreground">Not Covered</span>
                        <span className="text-xl font-bold text-amber-700">{summary.notCovered}</span>
                      </div>
                      <div className="flex justify-between w-full mt-2 border-t pt-2 border-blue-200 dark:border-blue-800">
                        <span className="text-xs font-semibold">Total</span>
                        <span className="text-lg font-extrabold text-blue-700 dark:text-blue-400">
                          {summary.total}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground col-span-full">No data available.</div>
              )}
            </div>
          ) : (
            // ALL: show all MMPs with their status, MMP name, and MMP ID
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {filteredAllMmpSummaries.length > 0 ? (
                filteredAllMmpSummaries.map((summary, idx) => (
                  <div key={summary.mmpId + summary.status + idx} className="bg-blue-100 dark:bg-blue-950 rounded-xl p-6 flex flex-col items-center shadow border border-blue-200 dark:border-blue-800">
                    <div className="text-base font-semibold text-blue-900 dark:text-blue-200 mb-1">{summary.mmpName}</div>
                    <div className="text-xs text-muted-foreground mb-1">{summary.mmpId}</div>
                    <div className="text-xs mb-1">
                      <span className={`px-2 py-0.5 rounded-full font-semibold
                        ${summary.status === 'approved'
                          ? 'bg-green-100 text-green-700'
                          : summary.status === 'pending'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-200 text-gray-700'}
                      `}>
                        {summary.status.charAt(0).toUpperCase() + summary.status.slice(1)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 w-full">
                      <div className="flex justify-between w-full">
                        <span className="text-xs text-muted-foreground">Covered</span>
                        <span className="text-xl font-bold text-green-700">{summary.covered}</span>
                      </div>
                      <div className="flex justify-between w-full">
                        <span className="text-xs text-muted-foreground">Not Covered</span>
                        <span className="text-xl font-bold text-amber-700">{summary.notCovered}</span>
                      </div>
                      <div className="flex justify-between w-full mt-2 border-t pt-2 border-blue-200 dark:border-blue-800">
                        <span className="text-xs font-semibold">Total</span>
                        <span className="text-lg font-extrabold text-blue-700 dark:text-blue-400">
                          {summary.total}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground col-span-full">No data available.</div>
              )}
            </div>
          )}
        </Card>
        {/* Report Modal */}
        {reportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-8 max-w-lg w-full relative">
              <button
                className="absolute top-2 right-2 text-xl text-gray-400 hover:text-gray-700"
                onClick={() => setReportModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
              <h3 className="text-xl font-bold mb-4">Generate Report</h3>
              <div className="mb-4">
                <label className="block font-semibold mb-1">Period (Months)</label>
                <MultiSelectDropdown
                  label="Months"
                  options={availableMonths}
                  selected={reportPeriod}
                  setSelected={setReportPeriod}
                  allLabel="All Months"
                />
              </div>
              <div className="mb-4">
                <label className="block font-semibold mb-1">Hubs</label>
                <MultiSelectDropdown
                  label="Hubs"
                  options={allHubs}
                  selected={selectedReportHubs}
                  setSelected={setSelectedReportHubs}
                  allLabel="All Hubs"
                />
              </div>
              <div className="mb-4">
                <label className="block font-semibold mb-1">MMPs</label>
                <MultiSelectDropdown
                  label="MMPs"
                  options={allMMPs}
                  selected={selectedReportMMPs}
                  setSelected={setSelectedReportMMPs}
                  allLabel="All MMPs"
                />
              </div>
              <div className="mb-4">
                <label className="block font-semibold mb-1">Download Format</label>
                <select
                  value={downloadFormat}
                  onChange={e => setDownloadFormat(e.target.value as 'pdf' | 'docx' | 'excel')}
                  className="w-full px-3 py-2 rounded border border-blue-200 dark:border-blue-800 bg-white dark:bg-blue-950"
                >
                  <option value="pdf">PDF</option>
                  <option value="docx">DOCX</option>
                  <option value="excel">Excel (CSV)</option>
                </select>
              </div>
              <div className="flex gap-4 mt-6">
                <button
                  className="flex-1 px-4 py-2 rounded bg-blue-700 text-white font-semibold shadow hover:bg-blue-800"
                  onClick={() => {
                    if (downloadFormat === 'pdf') handleGeneratePDF();
                    else if (downloadFormat === 'docx') handleGenerateDocx();
                    else if (downloadFormat === 'excel') handleGenerateExcel();
                  }}
                >
                  Download
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FieldOperationManagerPage;


