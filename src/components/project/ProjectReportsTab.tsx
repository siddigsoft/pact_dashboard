/**
 * ProjectReportsTab — Per-project operational + financial reports.
 * Generates formatted reports based on project type, stage, flow, and team.
 * Exports to formatted Excel (ExcelJS) or PDF (jsPDF).
 */
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  FileDown, FileSpreadsheet, FileText, Loader2, RefreshCw,
  DollarSign, Users, Target, BarChart2, Layers, Clock, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { exportFormattedExcel } from '@/utils/formattedExcelExport';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Project } from '@/types/project';
import type { ProjectBudget } from '@/types/budget';
import { calcMemberTotalCost } from '@/types/project';

interface BudgetSummary {
  total?: number | null;
  currency?: string;
  expenseCurrency?: string;
}

interface ProjectReportsTabProps {
  project: Project;
  projectBudget?: ProjectBudget | null;
  budgetSummary?: BudgetSummary | null;
  flow?: {
    activeStages: { id: string; label: string; status?: string; startDate?: string; endDate?: string }[];
    currentStage?: { label: string } | null;
    currentStageIndex: number;
    stageHistory?: { stageId?: string; stageLabel?: string; advancedAt?: string }[];
  };
}

interface OpsCost {
  id: string;
  expense_category: string;
  amount_cents: number;
  currency: string;
  status: string;
  expense_date: string;
  description?: string;
  created_by_name?: string;
}
interface Advance {
  id: string;
  status: string;
  total_paid_amount: number;
  requested_amount: number;
  site_name?: string;
  created_at: string;
}
interface PreFundRow {
  id: string;
  name: string;
  amount: number;
  currency: string;
  paid_amount: number;
  status: string;
}

const fmt = (n: number, cur = 'SDG') =>
  `${cur} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d?: string) => d ? format(new Date(d), 'dd MMM yyyy') : '—';

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  current:   'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  upcoming:  'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  skipped:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  active:    'bg-green-100 text-green-800',
  approved:  'bg-emerald-100 text-emerald-800',
  pending:   'bg-yellow-100 text-yellow-800',
  rejected:  'bg-red-100 text-red-800',
};

export function ProjectReportsTab({ project, projectBudget, budgetSummary, flow }: ProjectReportsTabProps) {
  const [opsCosts, setOpsCosts] = useState<OpsCost[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [preFunds, setPreFunds] = useState<PreFundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const currency = budgetSummary?.currency || project.budget?.currency || 'SDG';
  const totalBudget = projectBudget ? projectBudget.totalBudgetCents / 100 : (budgetSummary?.total || 0);

  useEffect(() => {
    loadData();
  }, [project.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [costsRes, advsRes, pfRes] = await Promise.all([
        supabase.from('operational_cost_submissions')
          .select('id, expense_category, amount_cents, currency, status, tier1_status, tier2_status, expense_date, description')
          .eq('project_id', project.id)
          .order('expense_date', { ascending: false }),
        supabase.from('advance_requests')
          .select('id, status, total_paid_amount, requested_amount, site_name, created_at')
          .eq('project_id', project.id)
          .order('created_at', { ascending: false }),
        supabase.from('pre_fund_requests')
          .select('id, name, amount, currency, paid_amount, status')
          .eq('project_id', project.id)
          .order('created_at', { ascending: false }),
      ]);
      setOpsCosts((costsRes.data || []) as OpsCost[]);
      setAdvances((advsRes.data || []) as Advance[]);
      setPreFunds((pfRes.data || []) as PreFundRow[]);
    } catch (e) {
      console.error('ProjectReportsTab loadData error:', e);
    } finally {
      setLoading(false);
    }
  };

  // ── Computed metrics ────────────────────────────────────────────────────────
  const approvedOps = opsCosts.filter(c =>
    c.status === 'approved' || c.tier1_status === 'approved' || c.tier2_status === 'approved'
  );
  const opsTotalCents = approvedOps.reduce((s, c) => s + c.amount_cents, 0);
  const advTotal = advances.reduce((s, a) => s + (a.total_paid_amount || 0), 0);
  const pfPaid = preFunds.reduce((s, p) => s + (p.paid_amount || 0), 0);
  const totalSpent = opsTotalCents / 100 + advTotal + pfPaid;
  const utilPct = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0;

  const teamMembers = project.team?.teamComposition || [];
  const membersWithFees = teamMembers.filter(m => m.feeType);
  const totalFees = membersWithFees.reduce((s, m) => s + calcMemberTotalCost(m, project.budget?.total), 0);

  const stagesTotal = flow?.activeStages.length || 0;
  const stagesCompleted = flow?.activeStages.filter(s => s.status === 'completed').length || 0;
  const stagePct = stagesTotal > 0 ? Math.round((stagesCompleted / stagesTotal) * 100) : 0;

  // ── Cost by category ────────────────────────────────────────────────────────
  const costByCategory = opsCosts.reduce<Record<string, number>>((acc, c) => {
    const k = c.expense_category || 'Other';
    acc[k] = (acc[k] || 0) + c.amount_cents / 100;
    return acc;
  }, {});

  // ── Excel export ────────────────────────────────────────────────────────────
  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const now = format(new Date(), 'MMMM d, yyyy HH:mm');
      await exportFormattedExcel({
        reportTitle:   `PACT Command Center — ${project.name} Full Project Report`,
        subtitleLine:  `Type: ${project.type || '—'} | Status: ${project.status || '—'} | Stage: ${flow?.currentStage?.label || '—'} | Generated: ${now}`,
        metaLine:      `Budget: ${fmt(totalBudget, currency)} | Spent: ${fmt(totalSpent, currency)} | Utilization: ${utilPct.toFixed(1)}% | Team: ${teamMembers.length} members`,
        filenamePrefix: `${project.name.replace(/\s+/g, '_')}_Report`,

        mainSheet: {
          sheetName: 'Operational Costs',
          headers: ['Date', 'Category', 'Description', `Amount (${currency})`, 'Status'],
          rows: opsCosts.map(c => [
            fmtDate(c.expense_date),
            c.expense_category || '—',
            (c.description || '').slice(0, 60),
            c.amount_cents / 100,
            c.status,
          ]),
          totalsRow: ['', '', 'TOTAL', opsTotalCents / 100, ''],
          colWidths: [14, 22, 40, 18, 14],
        },

        summarySheet: {
          title: `${project.name} — Report Summary`,
          rows: [
            ['Field', 'Value'],
            ['Project Name', project.name],
            ['Project Type', project.type || '—'],
            ['Status', project.status || '—'],
            ['Current Stage', flow?.currentStage?.label || '—'],
            ['Stage Progress', `${stagesCompleted} / ${stagesTotal} (${stagePct}%)`],
            ['', ''],
            ['FINANCIAL SUMMARY', ''],
            ['Total Budget', fmt(totalBudget, currency)],
            ['Operational Costs', fmt(opsTotalCents / 100, currency)],
            ['Advances Paid', fmt(advTotal, currency)],
            ['Pre-Fund Disbursed', fmt(pfPaid, currency)],
            ['Total Spent', fmt(totalSpent, currency)],
            ['Remaining', fmt(Math.max(0, totalBudget - totalSpent), currency)],
            ['Utilization %', `${utilPct.toFixed(1)}%`],
            ['', ''],
            ['TEAM SUMMARY', ''],
            ['Total Members', teamMembers.length],
            ['Members with Fees', membersWithFees.length],
            ['Total Professional Fees', fmt(totalFees, currency)],
          ],
          colWidths: [32, 26],
        },

        breakdownSheets: [
          {
            title: `${project.name} — Cost by Category`,
            sheetName: 'By Category',
            headers: ['Category', `Amount (${currency})`, '% of Total Costs'],
            rows: Object.entries(costByCategory).map(([cat, amt]) => [
              cat,
              amt,
              opsTotalCents > 0 ? `${((amt / (opsTotalCents / 100)) * 100).toFixed(1)}%` : '0%',
            ]),
            colWidths: [28, 20, 18],
          },
          ...(teamMembers.length > 0 ? [{
            title: `${project.name} — Team Composition`,
            sheetName: 'Team',
            headers: ['Name', 'Role', 'Type', 'Fee Type', `Fee (${currency})`, 'Payment Status'],
            rows: teamMembers.map(m => [
              m.name,
              m.role,
              m.memberType || 'internal',
              m.feeType || 'No fee',
              m.feeType ? calcMemberTotalCost(m, project.budget?.total) : '—',
              m.paymentStatus || '—',
            ]),
            colWidths: [30, 20, 14, 18, 18, 16],
          }] : []),
          ...(flow?.activeStages.length ? [{
            title: `${project.name} — Stage Progress`,
            sheetName: 'Stages',
            headers: ['Stage', 'Status', 'Started', 'Completed'],
            rows: flow.activeStages.map(s => {
              const hist = flow.stageHistory?.find(h => h.stageId === s.id || h.stageLabel === s.label);
              return [
                s.label,
                s.status || '—',
                fmtDate(hist?.advancedAt),
                '',
              ];
            }),
            colWidths: [32, 16, 18, 18],
          }] : []),
          ...(advances.length > 0 ? [{
            title: `${project.name} — Advances`,
            sheetName: 'Advances',
            headers: ['Site / Reference', 'Requested', 'Paid', 'Status', 'Date'],
            rows: advances.map(a => [
              a.site_name || '—',
              a.requested_amount,
              a.total_paid_amount || 0,
              a.status,
              fmtDate(a.created_at),
            ]),
            colWidths: [30, 16, 16, 14, 14],
          }] : []),
          ...(preFunds.length > 0 ? [{
            title: `${project.name} — Pre-Fund Requests`,
            sheetName: 'Pre-Fund',
            headers: ['Name', `Amount (${currency})`, `Paid (${currency})`, 'Status'],
            rows: preFunds.map(p => [p.name, p.amount, p.paid_amount, p.status]),
            colWidths: [32, 18, 18, 14],
          }] : []),
        ],
      });
    } finally {
      setExporting(false);
    }
  };

  // ── PDF export ──────────────────────────────────────────────────────────────
  const handleExportPDF = () => {
    setExportingPdf(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const navy = [30, 58, 95] as [number, number, number];
      const teal = [8, 145, 178] as [number, number, number];
      let y = 15;

      // ── Header ──
      doc.setFillColor(...navy);
      doc.rect(0, 0, 210, 28, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`${project.name}`, 14, 11);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Type: ${project.type || '—'}  |  Status: ${project.status || '—'}  |  Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 14, 18);
      doc.text(`Current Stage: ${flow?.currentStage?.label || '—'}  |  Stage ${stagesCompleted}/${stagesTotal}`, 14, 24);
      y = 36;

      // ── KPI row ──
      doc.setTextColor(30, 58, 95);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      const kpis = [
        { label: 'Total Budget', value: fmt(totalBudget, currency) },
        { label: 'Total Spent', value: fmt(totalSpent, currency) },
        { label: 'Utilization', value: `${utilPct.toFixed(1)}%` },
        { label: 'Team Members', value: String(teamMembers.length) },
      ];
      kpis.forEach((kpi, i) => {
        const x = 14 + i * 46;
        doc.setFillColor(240, 249, 255);
        doc.roundedRect(x, y, 42, 14, 2, 2, 'F');
        doc.setTextColor(...teal);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.text(kpi.label, x + 3, y + 5);
        doc.setTextColor(30, 58, 95);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(kpi.value.slice(0, 16), x + 3, y + 11);
      });
      y += 20;

      // ── Operational Costs ──
      doc.setTextColor(...navy);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Operational Costs', 14, y);
      y += 3;
      autoTable(doc, {
        startY: y,
        head: [['Date', 'Category', 'Description', `Amount (${currency})`, 'Status']],
        body: opsCosts.slice(0, 30).map(c => [
          fmtDate(c.expense_date),
          c.expense_category || '—',
          (c.description || '').slice(0, 35),
          fmt(c.amount_cents / 100, currency),
          c.status,
        ]),
        foot: [['', '', 'TOTAL', fmt(opsTotalCents / 100, currency), '']],
        headStyles: { fillColor: teal, textColor: [255, 255, 255], fontSize: 7 },
        footStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
        bodyStyles: { fontSize: 7 },
        alternateRowStyles: { fillColor: [240, 249, 255] },
        columnStyles: { 3: { halign: 'right' } },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 8;

      // ── New page for Financial ──
      if (y > 220) { doc.addPage(); y = 15; }

      // ── Cost by Category ──
      doc.setTextColor(...navy);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Cost Breakdown by Category', 14, y);
      y += 3;
      autoTable(doc, {
        startY: y,
        head: [['Category', `Amount (${currency})`, '% of Total']],
        body: Object.entries(costByCategory).map(([cat, amt]) => [
          cat,
          fmt(amt, currency),
          opsTotalCents > 0 ? `${((amt / (opsTotalCents / 100)) * 100).toFixed(1)}%` : '0%',
        ]),
        headStyles: { fillColor: teal, textColor: [255, 255, 255], fontSize: 7 },
        bodyStyles: { fontSize: 7 },
        alternateRowStyles: { fillColor: [240, 249, 255] },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 8;

      // ── Team ──
      if (teamMembers.length > 0) {
        if (y > 220) { doc.addPage(); y = 15; }
        doc.setTextColor(...navy);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Team Composition & Fees', 14, y);
        y += 3;
        autoTable(doc, {
          startY: y,
          head: [['Name', 'Role', 'Type', 'Fee Type', `Fee (${currency})`, 'Payment']],
          body: teamMembers.map(m => [
            m.name,
            m.role,
            m.memberType || 'internal',
            m.feeType || 'No fee',
            m.feeType ? fmt(calcMemberTotalCost(m, project.budget?.total), currency) : '—',
            m.paymentStatus || '—',
          ]),
          headStyles: { fillColor: teal, textColor: [255, 255, 255], fontSize: 7 },
          bodyStyles: { fontSize: 7 },
          alternateRowStyles: { fillColor: [240, 249, 255] },
          margin: { left: 14, right: 14 },
        });
        y = (doc as any).lastAutoTable.finalY + 8;
      }

      // ── Stages ──
      if (flow?.activeStages.length) {
        if (y > 220) { doc.addPage(); y = 15; }
        doc.setTextColor(...navy);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Stage Progress', 14, y);
        y += 3;
        autoTable(doc, {
          startY: y,
          head: [['Stage', 'Status', 'Started', 'Completed']],
          body: flow.activeStages.map(s => {
            const hist = flow.stageHistory?.find(h => h.stageId === s.id || h.stageLabel === s.label);
            return [s.label, s.status || '—', fmtDate(hist?.advancedAt), ''];
          }),
          headStyles: { fillColor: teal, textColor: [255, 255, 255], fontSize: 7 },
          bodyStyles: { fontSize: 7 },
          alternateRowStyles: { fillColor: [240, 249, 255] },
          margin: { left: 14, right: 14 },
        });
      }

      // Footer on each page
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(6);
        doc.setTextColor(150, 150, 150);
        doc.text(`PACT Command Center — Confidential  |  Page ${i} of ${pageCount}`, 14, 292);
        doc.text(format(new Date(), 'dd MMM yyyy'), 160, 292);
      }

      doc.save(`${project.name.replace(/\s+/g, '_')}_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    } finally {
      setExportingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Project Reports
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {project.type ? `${project.type} · ` : ''}{project.status} ·{' '}
            Stage {stagesCompleted}/{stagesTotal} ({stagePct}% complete)
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={loadData} data-testid="button-refresh-reports">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportExcel} disabled={exporting}
            data-testid="button-export-excel-report">
            {exporting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />}
            Export Excel
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportPDF} disabled={exportingPdf}
            data-testid="button-export-pdf-report">
            {exportingPdf ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5 mr-1.5" />}
            Export PDF
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: DollarSign, label: 'Total Budget',   value: fmt(totalBudget, currency),     color: 'text-blue-600' },
          { icon: BarChart2,  label: 'Total Spent',    value: fmt(totalSpent, currency),       color: 'text-red-500' },
          { icon: Target,     label: 'Budget Used',    value: `${utilPct.toFixed(1)}%`,        color: utilPct > 85 ? 'text-red-600' : utilPct > 60 ? 'text-amber-600' : 'text-emerald-600' },
          { icon: Users,      label: 'Team Members',   value: String(teamMembers.length),      color: 'text-violet-600' },
        ].map(({ icon: Icon, label, value, color }) => (
          <Card key={label} className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-4 w-4 ${color}`} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              <p className={`text-lg font-bold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Utilization bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Budget Utilization</span>
          <span>{utilPct.toFixed(1)}% used</span>
        </div>
        <Progress value={utilPct} className={`h-2 ${utilPct > 85 ? '[&>div]:bg-red-500' : utilPct > 60 ? '[&>div]:bg-amber-500' : '[&>div]:bg-emerald-500'}`} />
      </div>

      {/* ── Sub-tabs ── */}
      <Tabs defaultValue="operational">
        <TabsList className="w-full justify-start gap-1 h-9 bg-muted/40 p-1">
          <TabsTrigger value="operational" className="text-xs h-7 px-3">Operational</TabsTrigger>
          <TabsTrigger value="financial"   className="text-xs h-7 px-3">Financial</TabsTrigger>
          <TabsTrigger value="team"        className="text-xs h-7 px-3">Team & Fees</TabsTrigger>
          <TabsTrigger value="stages"      className="text-xs h-7 px-3">By Stage</TabsTrigger>
        </TabsList>

        {/* ── Operational tab ── */}
        <TabsContent value="operational" className="mt-4 space-y-4">
          {/* Stage progress */}
          {flow?.activeStages.length ? (
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" /> Stage Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2">
                {flow.activeStages.map((stage, i) => {
                  const hist = flow.stageHistory?.find(h => h.stageId === stage.id || h.stageLabel === stage.label);
                  const status = stage.status || 'upcoming';
                  const badgeCls = STATUS_COLORS[status] || STATUS_COLORS.upcoming;
                  return (
                    <div key={i} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                      <div className="w-5 h-5 rounded-full border-2 border-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                        {i + 1}
                      </div>
                      <span className="flex-1 text-sm">{stage.label}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeCls}`}>
                        {status}
                      </span>
                      <span className="text-[11px] text-muted-foreground w-28 text-right">
                        {hist?.advancedAt ? `Advanced ${fmtDate(hist.advancedAt)}` : '—'}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No stage data available for this project.</p>
          )}

          {/* Advances summary */}
          {advances.length > 0 && (
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" /> Advances ({advances.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference / Site</TableHead>
                      <TableHead className="text-right">Requested</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {advances.slice(0, 20).map(a => (
                      <TableRow key={a.id}>
                        <TableCell className="text-sm">{a.site_name || '—'}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(a.requested_amount, currency)}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(a.total_paid_amount || 0, currency)}</TableCell>
                        <TableCell>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[a.status] || ''}`}>
                            {a.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">{fmtDate(a.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Financial tab ── */}
        <TabsContent value="financial" className="mt-4 space-y-4">
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Ops Costs',    value: fmt(opsTotalCents / 100, currency), sub: `${opsCosts.length} records` },
              { label: 'Advances',     value: fmt(advTotal, currency),             sub: `${advances.length} requests` },
              { label: 'Pre-Fund',     value: fmt(pfPaid, currency),               sub: `${preFunds.length} requests disbursed` },
            ].map(({ label, value, sub }) => (
              <Card key={label} className="shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-base font-bold mt-0.5">{value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Ops costs table */}
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" /> Operational Costs by Category
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {Object.keys(costByCategory).length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(costByCategory)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cat, amt]) => (
                        <TableRow key={cat}>
                          <TableCell className="text-sm">{cat}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{fmt(amt, currency)}</TableCell>
                          <TableCell className="w-40">
                            <div className="flex items-center gap-2">
                              <Progress value={opsTotalCents > 0 ? (amt / (opsTotalCents / 100)) * 100 : 0} className="h-1.5 flex-1" />
                              <span className="text-[11px] text-muted-foreground w-10 text-right">
                                {opsTotalCents > 0 ? `${((amt / (opsTotalCents / 100)) * 100).toFixed(0)}%` : '0%'}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    <TableRow className="font-semibold bg-muted/30">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{fmt(opsTotalCents / 100, currency)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No operational costs recorded yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Full ops cost list */}
          {opsCosts.length > 0 && (
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-semibold">All Operational Costs ({opsCosts.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {opsCosts.slice(0, 50).map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="text-xs">{fmtDate(c.expense_date)}</TableCell>
                        <TableCell className="text-xs">{c.expense_category || '—'}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate">{c.description || '—'}</TableCell>
                        <TableCell className="text-right text-xs font-medium">{fmt(c.amount_cents / 100, c.currency || currency)}</TableCell>
                        <TableCell>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[c.status] || ''}`}>
                            {c.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Team & Fees tab ── */}
        <TabsContent value="team" className="mt-4 space-y-4">
          {teamMembers.length > 0 ? (
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Team Composition — {teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''}
                  {membersWithFees.length > 0 && (
                    <Badge variant="outline" className="ml-2 text-violet-700 border-violet-300">
                      Fees: {fmt(totalFees, currency)}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Fee Type</TableHead>
                      <TableHead className="text-right">Fee Amount</TableHead>
                      <TableHead>Payment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.map(m => (
                      <TableRow key={m.userId}>
                        <TableCell className="text-sm font-medium">{m.name}</TableCell>
                        <TableCell className="text-sm">{m.role}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${m.memberType === 'external' ? 'text-violet-700 border-violet-300' : 'text-blue-700 border-blue-300'}`}>
                            {m.memberType === 'external' ? 'External' : 'Internal'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{m.feeType ? { per_hour: 'Per Hour', fixed_fee: 'Fixed Fee', percent_budget: '% Budget' }[m.feeType] : 'No fee'}</TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {m.feeType ? fmt(calcMemberTotalCost(m, project.budget?.total), m.currency || currency) : '—'}
                        </TableCell>
                        <TableCell>
                          {m.paymentStatus ? (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              m.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                              m.paymentStatus === 'partially_paid' ? 'bg-amber-100 text-amber-800' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {m.paymentStatus.replace('_', ' ')}
                            </span>
                          ) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                    {membersWithFees.length > 0 && (
                      <TableRow className="bg-muted/30 font-semibold">
                        <TableCell colSpan={4}>Total Professional Fees</TableCell>
                        <TableCell className="text-right">{fmt(totalFees, currency)}</TableCell>
                        <TableCell />
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No team members assigned.</p>
          )}

          {/* Pre-fund */}
          {preFunds.length > 0 && (
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-semibold">Pre-Fund Requests</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preFunds.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm">{p.name}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(p.amount, p.currency || currency)}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(p.paid_amount, p.currency || currency)}</TableCell>
                        <TableCell>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] || ''}`}>
                            {p.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── By Stage tab ── */}
        <TabsContent value="stages" className="mt-4 space-y-4">
          {flow?.activeStages.length ? (
            flow.activeStages.map((stage, i) => {
              const hist = flow.stageHistory?.find(h => h.stageId === stage.id || h.stageLabel === stage.label);
              const status = stage.status || 'upcoming';
              const badgeCls = STATUS_COLORS[status] || STATUS_COLORS.upcoming;
              const isCompleted = status === 'completed';
              const isCurrent  = status === 'current';
              return (
                <Card key={i} className={isCurrent ? 'border-blue-300 dark:border-blue-700' : ''}>
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                      {stage.label}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${badgeCls}`}>{status}</span>
                      {isCompleted && <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-auto" />}
                      {isCurrent  && <AlertCircle   className="h-4 w-4 text-blue-500 ml-auto" />}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 text-sm">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-muted-foreground">
                      {hist?.advancedAt && (
                        <span>Advanced on: <strong className="text-foreground">{fmtDate(hist.advancedAt)}</strong></span>
                      )}
                      {stage.startDate && <span>Planned Start: <strong className="text-foreground">{fmtDate(stage.startDate)}</strong></span>}
                      {stage.endDate   && <span>Planned End: <strong className="text-foreground">{fmtDate(stage.endDate)}</strong></span>}
                      {!hist?.advancedAt && !stage.startDate && !stage.endDate && (
                        <span className="col-span-2 text-muted-foreground/60">No timeline data recorded</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No stage breakdown available.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
