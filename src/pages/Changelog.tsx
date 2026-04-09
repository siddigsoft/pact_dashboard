import { useState, useMemo, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/useAuthorization';
import { getReadIds, saveReadIds, matchesRole } from '@/lib/changelog-utils';
import { format, parseISO } from 'date-fns';
import {
  Sparkles, Wrench, Shield, Zap, Bug, Search, CheckCheck,
  ChevronRight, Clock, Users, FlaskConical, BookOpen,
  Filter, Bell, ArrowRight, Star, Eye, EyeOff
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

type ChangeCategory = 'new_feature' | 'enhancement' | 'bug_fix' | 'security' | 'performance';
type AffectedRole = 'all' | 'SuperAdmin' | 'Admin' | 'Supervisor' | 'Coordinator' | 'DataCollector' | 'DataTeam' | 'Reviewer' | 'FOM' | 'Finance';

interface ChangeEntry {
  id: string;
  version: string;
  date: string;
  category: ChangeCategory;
  title: string;
  description: string;
  reason: string;
  howToTest: string[];
  affectedRoles: AffectedRole[];
  page?: string;
  pageUrl?: string;
  impactLevel: 'low' | 'medium' | 'high';
}

interface ChangeGroup {
  release: string;
  date: string;
  summary: string;
  entries: ChangeEntry[];
}

// ─── Category config ──────────────────────────────────────────────────────────

const CAT_CFG: Record<ChangeCategory, { label: string; icon: React.ElementType; bg: string; text: string; border: string }> = {
  new_feature:  { label: 'New Feature',   icon: Sparkles, bg: 'bg-blue-50 dark:bg-blue-950/40',    text: 'text-blue-700 dark:text-blue-300',    border: 'border-blue-200 dark:border-blue-800' },
  enhancement:  { label: 'Enhancement',   icon: Wrench,   bg: 'bg-purple-50 dark:bg-purple-950/40', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800' },
  bug_fix:      { label: 'Bug Fix',       icon: Bug,      bg: 'bg-green-50 dark:bg-green-950/40',   text: 'text-green-700 dark:text-green-300',   border: 'border-green-200 dark:border-green-800' },
  security:     { label: 'Security',      icon: Shield,   bg: 'bg-red-50 dark:bg-red-950/40',       text: 'text-red-700 dark:text-red-300',       border: 'border-red-200 dark:border-red-800' },
  performance:  { label: 'Performance',   icon: Zap,      bg: 'bg-amber-50 dark:bg-amber-950/40',   text: 'text-amber-700 dark:text-amber-300',   border: 'border-amber-200 dark:border-amber-800' },
};

const IMPACT_CFG = {
  low:    { label: 'Low Impact',    color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  medium: { label: 'Medium Impact', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
  high:   { label: 'High Impact',   color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
};

// ─── Changelog data ───────────────────────────────────────────────────────────

const CHANGELOG: ChangeGroup[] = [
  {
    release: 'v4.0',
    date: '2026-04-09',
    summary: 'Timesheet & Payroll Scheduling, Subscription Tracker, Month-End Finance, Google Calendar & Email Integration, Portfolio Executive Dashboard',
    entries: [
      {
        id: 'v4-timesheet',
        version: 'v4.0',
        date: '2026-04-09',
        category: 'new_feature',
        title: 'Timesheet Module & Payroll Scheduling',
        description: 'Staff can now log daily work hours from the HR Hub. Finance admins can schedule payroll runs with a full two-step approval workflow. Payslips are auto-generated and delivered via in-app + email notifications.',
        reason: 'Field teams and staff needed a structured way to record working hours for accurate payroll calculation, leave deduction, and project cost allocation. Manual tracking via spreadsheets was error-prone and caused payroll delays.',
        howToTest: [
          'Go to HR Hub → Timesheets tab',
          'Click "Add Entry" — fill in date, hours, and project reference',
          'Submit the entry — it will appear as Pending for supervisor review',
          'As Admin/Supervisor, approve the entry from the same tab',
          'Go to HR Hub → Payroll → Schedule Run, set a period and click Generate',
          'Approve the payroll run — check that wallet balances update and payslips appear',
        ],
        affectedRoles: ['all'],
        page: 'HR Hub',
        pageUrl: '/hr',
        impactLevel: 'high',
      },
      {
        id: 'v4-subscriptions',
        version: 'v4.0',
        date: '2026-04-09',
        category: 'new_feature',
        title: 'Subscription Tracker & Month-End Finance Reports',
        description: 'A new Subscription Tracker monitors all software/service subscriptions with renewal alerts 30 days in advance. Month-End Finance Reports provide automated financial close summaries with period-lock protection.',
        reason: 'PACT lacked visibility into recurring software costs and upcoming renewals, leading to unexpected budget overruns. Month-end closing was done manually with no standardized report format or audit trail.',
        howToTest: [
          'Go to Financial Operations → Subscriptions',
          'Click "Add Subscription" — fill in vendor, cost, billing cycle, and renewal date',
          'Set a renewal date 25 days from today — verify an alert appears under Notifications',
          'Go to Financial Operations → Month-End Reports',
          'Select the current month and click "Generate Report" — review the summary',
          'Click "Close Period" — verify the period becomes read-only',
        ],
        affectedRoles: ['Admin', 'SuperAdmin', 'Finance'],
        page: 'Financial Operations',
        pageUrl: '/financial-operations',
        impactLevel: 'high',
      },
      {
        id: 'v4-integrations',
        version: 'v4.0',
        date: '2026-04-09',
        category: 'new_feature',
        title: 'Integrations Settings — Google Calendar & Email Notifications',
        description: 'Each user can now connect their Google Calendar and receive PACT events (site visits, milestones, deadlines) directly in their calendar. Email notification categories are fully configurable per user, with support for a custom notification email address.',
        reason: 'Field managers repeatedly missed deadlines because PACT events were not visible in their daily calendar. Email notifications were all-or-nothing with no way to control which categories were relevant to each user.',
        howToTest: [
          'Click your avatar → select "Integrations" from the dropdown (or navigate to /integrations)',
          'Click "Connect Google Calendar" — complete the Google OAuth flow',
          'Verify your account email appears and the status badge turns green',
          'Toggle off one email category (e.g. Payroll) — trigger a payroll event and confirm no email arrives for that category',
          'Enter a custom notification email and verify notifications arrive there instead of your login email',
          'Click "Disconnect" — verify the calendar connection is removed',
        ],
        affectedRoles: ['all'],
        page: 'Integrations Settings',
        pageUrl: '/integrations',
        impactLevel: 'medium',
      },
      {
        id: 'v4-portfolio',
        version: 'v4.0',
        date: '2026-04-09',
        category: 'enhancement',
        title: 'Portfolio Dashboard — Executive Enhancements',
        description: 'The Portfolio Dashboard now includes 6 live KPI cards (active, stalled, at-risk, overdue milestones, burn rate, completed this year), a sortable/filterable Health Matrix table, a Financial tab visible only to finance roles, a Milestones tab with 30-day timeline, and a Pipeline Kanban board with stalled swimlane.',
        reason: 'Directors and senior management had no single view to assess the health of the entire project portfolio. Individual project pages required too many clicks for executive oversight. Stalled projects were not surfaced automatically.',
        howToTest: [
          'Navigate to /portfolio',
          'Verify the 6 KPI cards load with real counts at the top',
          'Click the "Health Matrix" tab — sort by any column header',
          'Filter by project type using the toolbar dropdown',
          'Switch to the "Financial" tab — verify it is only visible to Admin/Finance/SuperAdmin roles',
          'Switch to "Pipeline" tab — check stalled projects appear in the bottom swimlane',
          'Create a project with no activity for simulation and confirm it moves to "Stalled" after the threshold',
        ],
        affectedRoles: ['Admin', 'SuperAdmin', 'Supervisor', 'Coordinator', 'Reviewer'],
        page: 'Portfolio Dashboard',
        pageUrl: '/portfolio',
        impactLevel: 'high',
      },
    ],
  },
  {
    release: 'v3.5',
    date: '2026-03-15',
    summary: 'Integrations Settings Page (Email & Calendar) infrastructure, Leave entitlements panel, PDM Coverage chart improvements, Portfolio Milestone Gantt',
    entries: [
      {
        id: 'v35-leave-entitlements',
        version: 'v3.5',
        date: '2026-03-15',
        category: 'new_feature',
        title: 'Leave Entitlements Panel in HR Hub',
        description: 'A new Leave Entitlements sub-tab in HR Hub Analytics shows each staff member\'s annual, sick, emergency, maternity, paternity, and unpaid leave entitlements versus what has been taken and remaining balance.',
        reason: 'HR managers had no single view to compare what leave each staff was entitled to versus what they had actually used. This caused disputes and manual reconciliation work every month.',
        howToTest: [
          'Go to HR Hub → HR Analytics → Leave Entitlements tab (4th sub-tab)',
          'Verify a table appears showing entitlement vs taken vs remaining for each user',
          'Confirm figures match the leave_entitlements and leave_requests DB tables',
          'Export the table using the export button and verify the XLSX/PDF contains correct data',
        ],
        affectedRoles: ['Admin', 'SuperAdmin', 'Finance'],
        page: 'HR Hub',
        pageUrl: '/hr',
        impactLevel: 'medium',
      },
      {
        id: 'v35-pdm-coverage',
        version: 'v3.5',
        date: '2026-03-15',
        category: 'enhancement',
        title: 'PDM Coverage Chart — Current Cycle & All Data Toggle',
        description: 'The PDM Coverage chart now has a "Current Cycle" mode (with user-defined date pickers as the default) and an "All Data" toggle to see the historical view. The chart also guarantees a 6-month axis including zero-data months.',
        reason: 'Program teams needed to compare current cycle performance against historical data without switching between reports. The previous chart would collapse time axes when some months had no data, making trends invisible.',
        howToTest: [
          'Navigate to /dct-pdm',
          'The chart defaults to "Current Cycle" — set the date range using the date pickers',
          'Click "All Data" toggle — verify the chart expands to all historical data',
          'Ensure months with zero data still appear on the x-axis (do not disappear)',
        ],
        affectedRoles: ['Admin', 'SuperAdmin', 'DataTeam', 'Coordinator'],
        page: 'DCT PDM Dashboard',
        pageUrl: '/dct-pdm',
        impactLevel: 'medium',
      },
      {
        id: 'v35-gantt',
        version: 'v3.5',
        date: '2026-03-15',
        category: 'new_feature',
        title: 'Portfolio Milestone Gantt — Planned vs Actual Markers',
        description: 'The Portfolio Dashboard Milestones tab now includes a Gantt-style chart with planned vs actual date markers, making it easy to see schedule variance at a glance.',
        reason: 'Project managers needed a visual way to compare planned and actual milestone completion dates across the portfolio without building manual Gantt charts in Excel.',
        howToTest: [
          'Navigate to /portfolio → Milestones tab',
          'Verify planned (hollow) and actual (filled) markers appear on the timeline',
          'Hover a marker to see the date and variance in days',
          'Click a milestone to navigate to the project detail page',
        ],
        affectedRoles: ['Admin', 'SuperAdmin', 'Supervisor', 'Coordinator'],
        page: 'Portfolio Dashboard',
        pageUrl: '/portfolio',
        impactLevel: 'medium',
      },
    ],
  },
  {
    release: 'v3.0',
    date: '2026-02-10',
    summary: 'CRM Hub, HR Hub, Leave Requests, Workspace Hub, Field Operation Manager page, Project Flow Engine, Broadcast Center',
    entries: [
      {
        id: 'v3-crm',
        version: 'v3.0',
        date: '2026-02-10',
        category: 'new_feature',
        title: 'CRM Hub — 5-Page Partner & Engagement Manager',
        description: 'A full CRM module covering Partners, Contacts, Engagements, Opportunities, and a summary Dashboard. Tracks partner relationships, engagement history, and funding opportunities.',
        reason: 'PACT\'s partnerships team managed all partner data in disconnected spreadsheets. There was no way to see which partners were active, what engagements were ongoing, or what opportunities were in the pipeline.',
        howToTest: [
          'Navigate to /crm',
          'Add a new Partner with full details (name, type, country, contact person)',
          'Add a Contact linked to that partner',
          'Create an Engagement with a status and date range',
          'Create an Opportunity linked to the partner with a funding amount',
          'Return to the CRM Dashboard and verify the summary cards update',
        ],
        affectedRoles: ['Admin', 'SuperAdmin', 'Coordinator', 'Reviewer'],
        page: 'CRM Hub',
        pageUrl: '/crm',
        impactLevel: 'high',
      },
      {
        id: 'v3-workspace',
        version: 'v3.0',
        date: '2026-02-10',
        category: 'new_feature',
        title: 'Workspace Hub — 5-Level Secure File Management',
        description: 'A centralized file management system with 5 security clearance levels (Public → Internal → Confidential → Restricted → Top Secret), folder organization, version history, download controls, and granular access grants per file/folder.',
        reason: 'Files were shared via WhatsApp and email with no version control, no access restrictions, and no audit trail. Confidential HR and financial documents were not secured.',
        howToTest: [
          'Navigate to /workspace',
          'Upload a file — assign "Confidential" security level',
          'Log in as a regular user — verify the Confidential file is not visible',
          'As Admin, grant the user Viewer access to that file via Manage Access',
          'Verify the user can now see and open the file but cannot download (if Restricted+)',
        ],
        affectedRoles: ['all'],
        page: 'Workspace Hub',
        pageUrl: '/workspace',
        impactLevel: 'high',
      },
      {
        id: 'v3-leave',
        version: 'v3.0',
        date: '2026-02-10',
        category: 'new_feature',
        title: 'Leave Request System',
        description: 'Staff can submit leave requests for Annual, Sick, Emergency, Maternity, Paternity, and Unpaid leave types. Supervisors approve or reject. HR admins have a full overview with balance tracking and export.',
        reason: 'Leave requests were submitted verbally or via WhatsApp with no formal approval trail. HR had no system to track leave balances or generate leave reports for payroll.',
        howToTest: [
          'Navigate to /leave',
          'Click "New Request" — select leave type, date range, and add a reason',
          'Submit the request — verify status shows as Pending',
          'As Supervisor/Admin, go to Leave Requests and approve the request',
          'Verify the status changes and the requester receives a notification',
        ],
        affectedRoles: ['all'],
        page: 'Leave Requests',
        pageUrl: '/leave',
        impactLevel: 'high',
      },
      {
        id: 'v3-fom',
        version: 'v3.0',
        date: '2026-02-10',
        category: 'new_feature',
        title: 'Field Operation Manager Page',
        description: 'A dedicated command dashboard for Field Operation Managers showing real-time site visit status, team locations, MMP coverage, and dispatch controls from one page.',
        reason: 'FOMs were switching between 6+ different pages to get a full picture of field operations. Critical dispatch decisions were delayed because information was too fragmented.',
        howToTest: [
          'Navigate to /field-operation-manager',
          'Verify real-time site visit status cards load',
          'Check that the team location map appears',
          'Use the dispatch panel to assign an available site to a data collector',
        ],
        affectedRoles: ['FOM', 'Admin', 'SuperAdmin'],
        page: 'Field Operation Manager',
        pageUrl: '/field-operation-manager',
        impactLevel: 'high',
      },
      {
        id: 'v3-broadcast',
        version: 'v3.0',
        date: '2026-02-10',
        category: 'new_feature',
        title: 'Broadcast Center — Admin Announcements',
        description: 'Admins can broadcast system-wide announcements to all users or specific roles. Broadcasts appear as persistent banners until dismissed, and are also delivered via email.',
        reason: 'There was no reliable way to send urgent operational announcements to the whole team. Critical updates were buried in WhatsApp group chats and missed by field staff.',
        howToTest: [
          'Navigate to /admin/broadcast',
          'Create a new broadcast with a title, message, and select target roles',
          'Set an expiry date and send',
          'Log in as a target-role user and verify the broadcast banner appears at the top of the page',
        ],
        affectedRoles: ['Admin', 'SuperAdmin'],
        page: 'Admin Broadcast',
        pageUrl: '/admin/broadcast',
        impactLevel: 'medium',
      },
    ],
  },
  {
    release: 'v2.5',
    date: '2025-12-01',
    summary: 'Transaction Screenshot Scanner, Reconciliation Dashboard, MMP multi-tier recall, PDM Analytics, Data Export Center',
    entries: [
      {
        id: 'v25-scanner',
        version: 'v2.5',
        date: '2025-12-01',
        category: 'new_feature',
        title: 'AI Transaction Screenshot Scanner',
        description: 'Upload a screenshot of any bank transaction (Mobile Money, bank transfer) and the AI (Gemini 2.0 Flash / Groq fallback) automatically extracts the amount, date, reference number, and sender/receiver details.',
        reason: 'Finance staff manually re-typed transaction details from screenshots, causing data entry errors and taking 15-20 minutes per batch. The scanner reduces this to seconds.',
        howToTest: [
          'Navigate to /admin/transaction-scanner',
          'Upload a bank transfer screenshot (JPEG or PNG)',
          'Verify the extracted fields appear: amount, date, reference, parties',
          'Edit any incorrect field and save the transaction record',
        ],
        affectedRoles: ['Admin', 'SuperAdmin', 'Finance'],
        page: 'Transaction Scanner',
        pageUrl: '/admin/transaction-scanner',
        impactLevel: 'high',
      },
      {
        id: 'v25-reconciliation',
        version: 'v2.5',
        date: '2025-12-01',
        category: 'new_feature',
        title: 'Reconciliation Dashboard',
        description: 'Cross-checks wallet transactions against approved cost submissions, highlights discrepancies, and supports period-close locking with duplicate payment detection.',
        reason: 'Financial audits revealed inconsistencies between wallet records and cost submission approvals. Manual reconciliation took days and was prone to oversight.',
        howToTest: [
          'Navigate to /reconciliation',
          'Select a date range and click "Run Reconciliation"',
          'Review highlighted discrepancies in red',
          'Resolve each discrepancy and mark as reconciled',
          'Click "Close Period" to lock the period from further edits',
        ],
        affectedRoles: ['Admin', 'SuperAdmin', 'Finance'],
        page: 'Reconciliation Dashboard',
        pageUrl: '/reconciliation',
        impactLevel: 'high',
      },
      {
        id: 'v25-pdm',
        version: 'v2.5',
        date: '2025-12-01',
        category: 'new_feature',
        title: 'DCT PDM Analytics Dashboard',
        description: 'A dedicated dashboard at /dct-pdm for Post-Distribution Monitoring analytics, with coverage charts, enumerator performance, site-level breakdowns, and a public shareable report at /pdm-report.',
        reason: 'PDM data was locked in Excel files shared manually. Program teams needed real-time visibility into PDM coverage and enumerator performance without waiting for weekly reports.',
        howToTest: [
          'Navigate to /dct-pdm',
          'Verify coverage chart, site tables, and enumerator rankings load',
          'Test the public page at /pdm-report using credentials WFP-Sudan / PACT@2026',
          'Verify the public page has no login required and shows a read-only view',
        ],
        affectedRoles: ['Admin', 'SuperAdmin', 'DataTeam', 'Coordinator'],
        page: 'DCT PDM Dashboard',
        pageUrl: '/dct-pdm',
        impactLevel: 'high',
      },
    ],
  },
  {
    release: 'v2.0',
    date: '2025-09-01',
    summary: 'Multi-tier wallet system, digital signatures, cost submission with two-tier approval, MMP lifecycle automation, real-time location tracking',
    entries: [
      {
        id: 'v2-wallet',
        version: 'v2.0',
        date: '2025-09-01',
        category: 'new_feature',
        title: 'Digital Wallet System',
        description: 'Each user has a digital wallet automatically credited on site visit completion. Wallets support withdrawals, advances, and full transaction history with bank account integration.',
        reason: 'Cash payments to field teams were untracked, led to disputes, and required physical presence. The digital wallet system creates a full audit trail for every payment.',
        howToTest: [
          'Complete a site visit as a Data Collector',
          'Navigate to /wallet and verify the payment was credited',
          'Submit a withdrawal request and have an Admin approve it',
          'Check transaction history for a full audit trail',
        ],
        affectedRoles: ['all'],
        page: 'Wallet',
        pageUrl: '/wallet',
        impactLevel: 'high',
      },
      {
        id: 'v2-signatures',
        version: 'v2.0',
        date: '2025-09-01',
        category: 'new_feature',
        title: 'Digital Signatures for Approvals',
        description: 'Cost submission approvals now require a digital signature from the approver. Signatures are cryptographically stored and included in PDF approval certificates.',
        reason: 'Paper-based signature workflows were slow and created a physical bottleneck for remote approvers. Digital signatures enable approvals from the field.',
        howToTest: [
          'Submit a cost request and have an approver open it',
          'The approver should see a signature canvas — draw a signature',
          'Confirm the approval — download the PDF certificate and verify the signature is embedded',
        ],
        affectedRoles: ['Admin', 'SuperAdmin', 'Supervisor', 'FOM'],
        page: 'Signatures',
        pageUrl: '/signatures',
        impactLevel: 'high',
      },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
// getReadIds, saveReadIds, matchesRole imported from @/lib/changelog-utils

// ─── Sub-components ───────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: ChangeCategory }) {
  const cfg = CAT_CFG[category];
  const Icon = cfg.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border', cfg.bg, cfg.text, cfg.border)}>
      <Icon className="h-3 w-3" />{cfg.label}
    </span>
  );
}

function RoleBadge({ role }: { role: AffectedRole }) {
  const colors: Record<string, string> = {
    all: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    SuperAdmin: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    Admin: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    Supervisor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    Coordinator: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    DataCollector: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    DataTeam: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    Reviewer: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    FOM: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
    Finance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  };
  return (
    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', colors[role] ?? colors.all)}>
      {role === 'all' ? 'All Roles' : role}
    </span>
  );
}

function EntryCard({
  entry,
  isRead,
  onMarkRead,
  showReadBadge,
}: {
  entry: ChangeEntry;
  isRead: boolean;
  onMarkRead: (id: string) => void;
  showReadBadge: boolean;
}) {
  const navigate = useNavigate();
  const cfg = CAT_CFG[entry.category];
  const Icon = cfg.icon;

  return (
    <div
      className={cn(
        'rounded-xl border transition-all',
        isRead ? 'border-border bg-background' : 'border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/20'
      )}
      data-testid={`entry-card-${entry.id}`}
    >
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            {!isRead && showReadBadge && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">
                <Bell className="h-2.5 w-2.5" />NEW
              </span>
            )}
            <CategoryBadge category={entry.category} />
            <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', IMPACT_CFG[entry.impactLevel].color)}>
              {IMPACT_CFG[entry.impactLevel].label}
            </span>
            {entry.affectedRoles.map(r => <RoleBadge key={r} role={r} />)}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {format(parseISO(entry.date), 'MMM d, yyyy')}
            </span>
            {!isRead && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => onMarkRead(entry.id)}
                data-testid={`button-mark-read-${entry.id}`}
              >
                <Eye className="h-3 w-3 mr-1" />Mark read
              </Button>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-sm text-foreground mb-1.5">{entry.title}</h3>

        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-3">{entry.description}</p>

        {/* Accordion for details */}
        <Accordion type="single" collapsible>
          <AccordionItem value="details" className="border-0">
            <AccordionTrigger className="py-1.5 text-[12px] font-semibold text-foreground hover:no-underline">
              <span className="flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5 text-blue-500" />Why & How to Test
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-2 pb-0">
              <div className="space-y-4">
                {/* Why */}
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Why was this added?</p>
                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg px-3 py-2.5">
                    <p className="text-[12px] text-amber-900 dark:text-amber-200 leading-relaxed">{entry.reason}</p>
                  </div>
                </div>
                {/* How to test */}
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <FlaskConical className="h-3.5 w-3.5 text-green-500" />Testing Guide
                  </p>
                  <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/50 rounded-lg px-3 py-2.5 space-y-1.5">
                    {entry.howToTest.map((step, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="shrink-0 mt-0.5 h-4 w-4 rounded-full bg-green-600 text-white text-[9px] font-bold flex items-center justify-center">{i + 1}</span>
                        <p className="text-[12px] text-green-900 dark:text-green-200 leading-relaxed">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Go to page button */}
        {entry.pageUrl && (
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Page: <span className="font-medium text-foreground">{entry.page}</span></span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] gap-1"
              onClick={() => {
                onMarkRead(entry.id);
                navigate(entry.pageUrl!);
              }}
              data-testid={`button-goto-${entry.id}`}
            >
              Open & Test <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Changelog() {
  const { currentUser } = useAppContext();
  const { hasAnyRole } = useAuthorization();
  const userRole = currentUser?.role ?? '';
  const userId = currentUser?.id ?? 'anon';

  const [readIds, setReadIds] = useState<Set<string>>(() => getReadIds(userId));
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ChangeCategory | 'all'>('all');
  const [roleFilter, setRoleFilter] = useState<'mine' | 'all'>('mine');
  const [showRead, setShowRead] = useState(true);

  // Flatten all entries
  const allEntries = useMemo(() => CHANGELOG.flatMap(g => g.entries), []);

  // Count unread that are relevant to the user
  const unreadCount = useMemo(
    () => allEntries.filter(e => !readIds.has(e.id) && matchesRole(e.affectedRoles, userRole)).length,
    [allEntries, readIds, userRole]
  );

  const markRead = (id: string) => {
    setReadIds(prev => {
      const next = new Set(prev);
      next.add(id);
      saveReadIds(userId, next);
      return next;
    });
  };

  const markAllRead = () => {
    const next = new Set(allEntries.map(e => e.id));
    setReadIds(next);
    saveReadIds(userId, next);
  };

  // Filter entries
  const filteredGroups = useMemo(() => {
    return CHANGELOG.map(group => ({
      ...group,
      entries: group.entries.filter(e => {
        if (roleFilter === 'mine' && !matchesRole(e.affectedRoles, userRole)) return false;
        if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
        if (!showRead && readIds.has(e.id)) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          return e.title.toLowerCase().includes(q) ||
            e.description.toLowerCase().includes(q) ||
            e.reason.toLowerCase().includes(q) ||
            (e.page ?? '').toLowerCase().includes(q);
        }
        return true;
      }),
    })).filter(g => g.entries.length > 0);
  }, [roleFilter, categoryFilter, showRead, search, readIds, userRole]);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6" data-testid="changelog-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Star className="h-5 w-5 text-amber-500" />
            <h1 className="text-xl font-bold text-foreground">Platform Changelog</h1>
            {unreadCount > 0 && (
              <Badge className="bg-blue-600 text-white text-[10px] h-5 px-1.5" data-testid="badge-unread-count">
                {unreadCount} new
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            All platform updates, new features, and improvements — with testing guides.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5 h-8 shrink-0" onClick={markAllRead} data-testid="button-mark-all-read">
            <CheckCheck className="h-3.5 w-3.5" />Mark all as read
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search updates…"
            className="pl-8 h-8 text-sm"
            data-testid="input-changelog-search"
          />
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-1 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {(['all', 'new_feature', 'enhancement', 'bug_fix', 'security', 'performance'] as const).map(cat => (
            <Button
              key={cat}
              variant={categoryFilter === cat ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-[11px] px-2"
              onClick={() => setCategoryFilter(cat)}
              data-testid={`filter-category-${cat}`}
            >
              {cat === 'all' ? 'All' : CAT_CFG[cat].label}
            </Button>
          ))}
        </div>

        <Separator orientation="vertical" className="h-6 hidden sm:block" />

        {/* Role filter */}
        <Button
          variant={roleFilter === 'mine' ? 'default' : 'outline'}
          size="sm"
          className="h-7 text-[11px] px-2 gap-1"
          onClick={() => setRoleFilter(r => r === 'mine' ? 'all' : 'mine')}
          data-testid="filter-role-mine"
        >
          <Users className="h-3 w-3" />
          {roleFilter === 'mine' ? 'My Role Only' : 'All Roles'}
        </Button>

        {/* Show/hide read */}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[11px] px-2 gap-1"
          onClick={() => setShowRead(v => !v)}
          data-testid="filter-show-read"
        >
          {showRead ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          {showRead ? 'Showing all' : 'Unread only'}
        </Button>
      </div>

      {/* Empty state */}
      {filteredGroups.length === 0 && (
        <div className="text-center py-16 text-muted-foreground" data-testid="changelog-empty">
          <CheckCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">All caught up!</p>
          <p className="text-sm mt-1">No updates match your current filters.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => { setSearch(''); setCategoryFilter('all'); setShowRead(true); }}>
            Clear filters
          </Button>
        </div>
      )}

      {/* Changelog groups */}
      <div className="space-y-8">
        {filteredGroups.map(group => (
          <div key={group.release} data-testid={`release-group-${group.release}`}>
            {/* Release header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-foreground text-background">
                  {group.release}
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {format(parseISO(group.date), 'MMMM d, yyyy')}
                </span>
              </div>
              <Separator className="flex-1" />
              <span className="text-[11px] text-muted-foreground hidden md:block shrink-0 max-w-xs truncate">
                {group.summary}
              </span>
            </div>

            {/* Entries */}
            <div className="space-y-3">
              {group.entries.map(entry => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  isRead={readIds.has(entry.id)}
                  onMarkRead={markRead}
                  showReadBadge={true}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="text-center pt-4 pb-8 text-[11px] text-muted-foreground">
        PACT Command Center — Platform Changelog · All times are UTC · Contact the ICT team to report issues
      </div>
    </div>
  );
}

