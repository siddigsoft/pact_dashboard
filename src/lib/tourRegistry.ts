/**
 * tourRegistry.ts
 * Central registry of product tour step definitions for every major page.
 * Steps are picked up by TourButton + useTour — add new pages here and the
 * floating / header button appears automatically with no other changes needed.
 *
 * Element selectors are optional. If provided, driver.js highlights that DOM
 * element. Steps whose element isn't found on the current page are dropped
 * automatically (see TourButton.tsx). Prefer centered popovers (no element)
 * for reliability across all user configurations.
 */
import type { DriveStep } from 'driver.js';

export interface TourDef {
  slug: string;     // must match a PAGE_DEFS slug
  label: string;    // shown in auto-launch header
  steps: DriveStep[];
}

// ── Slugs that use HubLayout (inline TourButton shown in hub header) ──────────
// AdminHub has its own custom layout → NOT listed here → gets floating button
export const HUB_SLUGS = new Set([
  'super-admin-hub', 'crm', 'communication-hub',
  'analytics-hub', 'finance-hub', 'pre-funding', 'programme-hub',
  'accounting-hub', 'field-ops', 'hr-hub',
]);

// ── Tour auto-launch localStorage helpers ─────────────────────────────────────
export function tourSeenKey(slug: string, userId: string): string {
  return `pact_tour_v1_${slug}_${userId}`;
}
export function hasTourBeenSeen(slug: string, userId: string): boolean {
  return localStorage.getItem(tourSeenKey(slug, userId)) === 'true';
}
export function markTourSeen(slug: string, userId: string): void {
  localStorage.setItem(tourSeenKey(slug, userId), 'true');
}

// ─────────────────────────────────────────────────────────────────────────────
// TOUR REGISTRY
// ─────────────────────────────────────────────────────────────────────────────
export const TOUR_REGISTRY: TourDef[] = [

  // ── My Workspace ────────────────────────────────────────────────────────────
  {
    slug: 'dashboard',
    label: 'Dashboard',
    steps: [
      {
        popover: {
          title: 'Your command centre',
          description: "The Dashboard gives you a real-time snapshot of PACT operations — pending approvals, site-visit activity, wallet balances, and your personal task queue — all in one place.",
        },
      },
      {
        element: '[data-testid="dashboard-kpi"], .dashboard-kpi, [class*="kpi"], [class*="stat-card"]',
        popover: {
          title: 'KPI summary cards',
          description: "These top cards update live. Click any card to jump straight to the underlying list — for example, click the pending-approvals count to open the approvals queue.",
          side: 'bottom',
        },
      },
      {
        element: '[class*="quick-action"], [data-testid="quick-actions"]',
        popover: {
          title: 'Quick actions',
          description: "Shortcuts to the most common tasks for your role: submit a cost, check your wallet, or open a site visit — without hunting through the sidebar.",
          side: 'bottom',
        },
      },
      {
        element: '[class*="recent"], [class*="activity"]',
        popover: {
          title: 'Recent activity',
          description: "The activity feed shows the latest events across your hubs. Use it to spot submissions waiting for your approval or issues that need attention today.",
          side: 'top',
        },
      },
    ],
  },

  {
    slug: 'my-tasks',
    label: 'My Tasks',
    steps: [
      {
        popover: {
          title: 'Your personal task queue',
          description: "My Tasks shows every task assigned to you across all projects and modules — deadlines, priorities, and current status in one filtered list.",
        },
      },
      {
        element: '[role="tablist"]',
        popover: {
          title: 'Filter by status',
          description: "Switch between To Do, In Progress, and Completed tabs to focus on what needs your attention right now.",
          side: 'bottom',
        },
      },
      {
        element: 'input[placeholder*="earch" i], input[type="search"]',
        popover: {
          title: 'Search your tasks',
          description: "Type any keyword to find tasks instantly. You can also filter by due date or priority using the controls beside the search bar.",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Creating and editing tasks',
          description: "Click any task row to open its detail panel — update progress, add notes, or mark it complete. Use the + button to create a standalone task that isn't linked to a project.",
        },
      },
    ],
  },

  {
    slug: 'my-projects',
    label: 'My Projects',
    steps: [
      {
        popover: {
          title: 'Projects you\'re part of',
          description: "My Projects shows every project where you have a team role — as manager, member, or contributor. It's your personal view of the Programme portfolio.",
        },
      },
      {
        element: 'input[placeholder*="earch" i], input[type="search"]',
        popover: {
          title: 'Find a project quickly',
          description: "Search by project name, hub, or cycle code. Use the status filter to show only active or completed projects.",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Opening a project',
          description: "Click any project card to open the full Project Detail view — stages, deliverables, budget, team, and files. All updates you make here are reflected in the Programme Hub portfolio.",
        },
      },
    ],
  },

  {
    slug: 'calendar',
    label: 'Calendar',
    steps: [
      {
        popover: {
          title: 'The team calendar',
          description: "Calendar brings together leave approvals, site-visit schedules, project milestones, and team events in a single shared view.",
        },
      },
      {
        element: '[role="tablist"]',
        popover: {
          title: 'Switch views',
          description: "Toggle between Day, Week, and Month layouts. The Month view is best for planning; Day view shows the full detail of each event.",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Adding events',
          description: "Click any date cell to create a new event. Events you create are visible to your team. Leave requests appear here automatically once approved.",
        },
      },
    ],
  },

  // ── Communication ──────────────────────────────────────────────────────────
  {
    slug: 'communication-hub',
    label: 'Communication Hub',
    steps: [
      {
        popover: {
          title: 'All communication in one hub',
          description: "Communication Hub brings together Chat, Calls, WhatsApp broadcasts, and digital signatures — everything your team needs to coordinate without switching apps.",
        },
      },
      {
        element: '#tour-hub-sections',
        popover: {
          title: 'Navigate by section',
          description: "Use the section tabs along the top to switch between Chat, Calls, Broadcast, and Signatures. Each section has its own sub-tabs in the bar below.",
          side: 'bottom',
        },
      },
      {
        element: '#tour-hub-tab-bar',
        popover: {
          title: 'Pick a page within the section',
          description: "Click the dropdown bar to see all pages in the current section and jump directly to what you need.",
          side: 'bottom',
        },
      },
    ],
  },

  {
    slug: 'chat',
    label: 'Chat',
    steps: [
      {
        popover: {
          title: 'Team messaging',
          description: "Chat provides direct messages, group channels, and real-time coordination with your colleagues — all messages are logged and searchable.",
        },
      },
      {
        element: '[class*="channel"], [class*="sidebar"], [class*="thread-list"]',
        popover: {
          title: 'Channels and direct messages',
          description: "Left sidebar shows your channels and direct messages. Click any to open the conversation. Use the + button to create a new channel or start a DM.",
          side: 'right',
        },
      },
      {
        popover: {
          title: 'Sharing files',
          description: "Drag and drop any file into the message box, or click the attachment icon. Files shared in chat are accessible to all channel members.",
        },
      },
    ],
  },

  // ── Programme Management ───────────────────────────────────────────────────
  {
    slug: 'programme-hub',
    label: 'Programme Hub',
    steps: [
      {
        popover: {
          title: 'Programme management in one hub',
          description: "Programme Hub is your centre for all project work — the full project list, portfolio analytics, MMP cycle management, and project updates across all hubs.",
        },
      },
      {
        element: '#tour-hub-sections',
        popover: {
          title: 'Hub sections',
          description: "The top tabs group related pages: Projects (the list), Portfolio (cross-project analytics), MMP (site monitoring plans), and Updates. Click a section to expand its sub-pages.",
          side: 'bottom',
        },
      },
      {
        element: '#tour-hub-tab-bar',
        popover: {
          title: 'Navigate sub-pages',
          description: "This dropdown shows all pages inside the active section. Pick one to navigate directly — no need to go back to the hub overview.",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Tip: quick links',
          description: "The breadcrumb links at the top right (Dashboard · Admin Hub · My Tasks) let you jump to related hubs instantly without using the sidebar.",
        },
      },
    ],
  },

  {
    slug: 'projects',
    label: 'Projects',
    steps: [
      {
        popover: {
          title: 'All projects across PACT',
          description: "Projects shows every active, planned, and completed project. You can filter by hub, status, and date range, or search by name.",
        },
      },
      {
        element: 'input[placeholder*="earch" i], input[type="search"]',
        popover: {
          title: 'Search and filter',
          description: "Type a project name, code, or hub to find it instantly. Use the status chips to narrow to Active, Draft, or Completed projects.",
          side: 'bottom',
        },
      },
      {
        element: 'table, [class*="project-card"]',
        popover: {
          title: 'Project rows',
          description: "Click any project row to open Project Detail — stages, deliverables, budget tracking, team members, and attached files.",
          side: 'top',
        },
      },
      {
        popover: {
          title: 'Creating a project',
          description: "Click the + New Project button (top right) to open the creation wizard. You'll set the project name, hub, funding source, and initial team before it becomes active.",
        },
      },
    ],
  },

  {
    slug: 'portfolio',
    label: 'Portfolio Dashboard',
    steps: [
      {
        popover: {
          title: 'Cross-project portfolio view',
          description: "Portfolio gives senior management a bird's-eye view of all projects — budget utilisation, milestone completion rates, and risk status across the entire programme.",
        },
      },
      {
        element: '[role="tablist"]',
        popover: {
          title: 'Portfolio tabs',
          description: "Switch between Overview (summary charts), Pipeline (project stages), Budget (financial tracking), and Risk (flagged projects).",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Filtering the portfolio',
          description: "Use the hub and period filters (top right) to focus on a specific geography or reporting window. All charts update instantly.",
        },
      },
    ],
  },

  {
    slug: 'mmp',
    label: 'MMP Management',
    steps: [
      {
        popover: {
          title: 'Monitoring & Management Plans',
          description: "MMP is where site assignments, cycle schedules, and monitoring data come together. Each row is a monitoring site with its current cycle status.",
        },
      },
      {
        element: 'input[placeholder*="earch" i], input[type="search"]',
        popover: {
          title: 'Find a site',
          description: "Search by site name, hub, or code. Use the status filter to show only Active, Pending, or Completed sites for the current cycle.",
          side: 'bottom',
        },
      },
      {
        element: 'table',
        popover: {
          title: 'MMP site rows',
          description: "Click a site row to open its detail — visit history, assigned collectors, and submission status. The status badge shows where the site is in the current cycle.",
          side: 'top',
        },
      },
      {
        element: '[role="tablist"]',
        popover: {
          title: 'View by cycle',
          description: "Tabs at the top let you switch between the active cycle and historical data. The Full Report tab gives a downloadable summary of all submissions.",
          side: 'bottom',
        },
      },
    ],
  },

  {
    slug: 'project-updates',
    label: 'Project Updates',
    steps: [
      {
        popover: {
          title: 'Project status updates',
          description: "Project Updates is where team leads post progress notes, flag blockers, and mark milestones complete. Stakeholders use this to track delivery without attending meetings.",
        },
      },
      {
        element: 'input[placeholder*="earch" i], input[type="search"]',
        popover: {
          title: 'Filter updates',
          description: "Search by project name or author. Filter by date range to see what was reported in the last week or month.",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Posting an update',
          description: "Click + New Update to write a progress note for any project you manage. You can attach files, flag risks, and tag team members for follow-up.",
        },
      },
    ],
  },

  // ── Field Operations ────────────────────────────────────────────────────────
  {
    slug: 'field-ops',
    label: 'Field Ops Hub',
    steps: [
      {
        popover: {
          title: 'Field operations in one hub',
          description: "Field Ops Hub centralises everything for field teams: team management, site visits, incident reports, equipment tracking, and the live coverage map.",
        },
      },
      {
        element: '#tour-hub-sections',
        popover: {
          title: 'Section navigation',
          description: "Sections group related pages — Field Team, Site Visits, Incidents, Equipment, and Map. Click a section tab to see its pages.",
          side: 'bottom',
        },
      },
      {
        element: '#tour-hub-tab-bar',
        popover: {
          title: 'Sub-page selector',
          description: "This dropdown shows all pages in the active section. Use it to jump between, for example, Site Visits and Monitoring Form without leaving the hub.",
          side: 'bottom',
        },
      },
    ],
  },

  {
    slug: 'site-visits',
    label: 'Site Visits',
    steps: [
      {
        popover: {
          title: 'Site visit records',
          description: "Site Visits is the audit log of every data collection visit — timestamps, GPS coordinates, photos, and verification status.",
        },
      },
      {
        element: 'input[placeholder*="earch" i], input[type="search"]',
        popover: {
          title: 'Search visits',
          description: "Filter by site name, collector, date range, or verification status. Use the hub filter to narrow to your area of responsibility.",
          side: 'bottom',
        },
      },
      {
        element: 'table',
        popover: {
          title: 'Visit rows',
          description: "Click a visit to open its detail — submitted data, photos, GPS point on a map, and coordinator review status. You can verify or flag visits from here.",
          side: 'top',
        },
      },
    ],
  },

  {
    slug: 'monitoring-form',
    label: 'Monitoring Form',
    steps: [
      {
        popover: {
          title: 'Data collection form',
          description: "This is the form field teams use to record a site monitoring visit — household data, observations, and any issues found at the site.",
        },
      },
      {
        popover: {
          title: 'Finding your assigned site',
          description: "Use the site code search at the top to load your assigned site. Only sites allocated to you in the current MMP cycle will appear.",
        },
      },
      {
        popover: {
          title: 'Submitting data',
          description: "Fill in all required fields (marked with *), attach photos if needed, then tap Submit. The data is saved immediately and enters the coordinator verification queue.",
        },
      },
    ],
  },

  {
    slug: 'safety-hub',
    label: 'Safety Hub',
    steps: [
      {
        popover: {
          title: 'Safety & incident management',
          description: "Safety Hub tracks all incident reports, safety scores per hub, and corrective actions. Use it to identify recurring issues and ensure field staff safety.",
        },
      },
      {
        element: '[role="tablist"]',
        popover: {
          title: 'Safety tabs',
          description: "Switch between Incidents (the log), Safety Scores (hub rankings), and Corrective Actions (follow-up tasks from past incidents).",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Reporting an incident',
          description: "Click + New Incident to file a report. Incidents are categorised by severity and automatically notify the relevant field manager.",
        },
      },
    ],
  },

  {
    slug: 'coordinator-dashboard',
    label: 'Coordinator Dashboard',
    steps: [
      {
        popover: {
          title: 'Coordination overview',
          description: "Coordinator Dashboard gives hubs a summary of team progress — sites visited vs targets, verification backlog, and collector performance for the current cycle.",
        },
      },
      {
        popover: {
          title: 'Using the metrics',
          description: "Click any metric card to drill into the underlying list. For example, click 'Pending Verification' to jump to your site verification queue.",
        },
      },
      {
        popover: {
          title: 'Cycle progress',
          description: "The progress bar at the top tracks completion against the cycle target. When a site goes from Submitted → Verified, it moves the bar forward.",
        },
      },
    ],
  },

  {
    slug: 'coordinator-sites',
    label: 'Site Verification',
    steps: [
      {
        popover: {
          title: 'Your verification queue',
          description: "Site Verification is where coordinators review data submitted by field teams. Each site row shows the submission status and how long it's been waiting.",
        },
      },
      {
        element: 'table',
        popover: {
          title: 'Verifying a submission',
          description: "Click a site row to open the full data review panel — check the submitted values, photos, and GPS location, then click Verify or Return with a rejection reason.",
          side: 'top',
        },
      },
      {
        element: 'input[placeholder*="earch" i], input[type="search"]',
        popover: {
          title: 'Filter pending sites',
          description: "Use the Status filter to show only Pending sites. Sort by submission date to process oldest submissions first.",
          side: 'bottom',
        },
      },
    ],
  },

  {
    slug: 'supervisor-sites',
    label: 'Supervisor Sites',
    steps: [
      {
        popover: {
          title: 'Your site management view',
          description: "Supervisor Sites shows all monitoring sites under your supervision. You can see real-time visit status, assign collectors, and flag sites that need attention.",
        },
      },
      {
        element: 'table',
        popover: {
          title: 'Site list',
          description: "Each row shows the site, assigned collector, last visit date, and current status in the cycle. Red badges indicate overdue sites.",
          side: 'top',
        },
      },
      {
        popover: {
          title: 'Reassigning a site',
          description: "Click a site row → Edit Assignment to change the allocated collector. Reassignments are logged and the previous collector is notified.",
        },
      },
    ],
  },

  {
    slug: 'coverage-map',
    label: 'Coverage Map',
    steps: [
      {
        popover: {
          title: 'Geographic coverage view',
          description: "The Coverage Map shows all monitoring sites plotted on a map — colour-coded by visit status. Use it to spot geographic clusters of pending or problem sites.",
        },
      },
      {
        popover: {
          title: 'Map filters',
          description: "Use the panel on the right to filter by hub, cycle status, or date range. Hover over any pin to see site details; click to open the full record.",
        },
      },
    ],
  },

  // ── Finance ─────────────────────────────────────────────────────────────────
  {
    slug: 'finance-hub',
    label: 'Finance Hub',
    steps: [
      {
        popover: {
          title: 'Financial operations hub',
          description: "Finance Hub covers the entire payment lifecycle — budget management, wallet top-ups, cost submission review, advance requests, and financial reports.",
        },
      },
      {
        element: '#tour-hub-sections',
        popover: {
          title: 'Finance sections',
          description: "Sections group related workflows: Operations (day-to-day payments), Reports (summaries and reconciliation), and Wallets Admin. Click a section to see its pages.",
          side: 'bottom',
        },
      },
      {
        element: '#tour-hub-tab-bar',
        popover: {
          title: 'Navigate pages',
          description: "Use this dropdown to jump to any page in the active section — for example, from Budget to Reconciliation without going back to the hub.",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Tip: the payment workflow',
          description: "Field staff submit costs → Supervisors approve in Tier 1 → Finance processes in Tier 2 → Payment hits the wallet. All stages are tracked here.",
        },
      },
    ],
  },

  {
    slug: 'cost-submission',
    label: 'Cost Submission',
    steps: [
      {
        popover: {
          title: 'Submit operational costs',
          description: "Use Cost Submission to record field expenses — transport, supplies, and per-diems — for reimbursement. Upload your receipt and the system routes it for approval.",
        },
      },
      {
        element: '[role="tablist"]',
        popover: {
          title: 'Submission tabs',
          description: "My Submissions shows your history. Pending shows what's awaiting approval. Use the New Submission button to file a cost.",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'What happens after you submit',
          description: "Your submission goes to your supervisor for Tier 1 approval, then to the finance team for payment processing. You'll get a notification at each stage.",
        },
      },
    ],
  },

  {
    slug: 'tier1-approvals',
    label: 'Tier 1 Approvals',
    steps: [
      {
        popover: {
          title: 'First-level approval queue',
          description: "Tier 1 Approvals is the supervisor stage of cost approval. You see submissions from your direct reports — review the receipt, check the amount, then approve or return.",
        },
      },
      {
        element: 'table',
        popover: {
          title: 'The approval queue',
          description: "Each row shows the submitter, cost type, amount, and how long it's been pending. Oldest submissions are flagged — aim to process within 24 hours.",
          side: 'top',
        },
      },
      {
        popover: {
          title: 'Bulk actions',
          description: "Select multiple rows with the checkbox to approve or return them all at once. Useful when processing end-of-week batch submissions.",
        },
      },
    ],
  },

  {
    slug: 'tier2-approvals',
    label: 'Tier 2 Approvals',
    steps: [
      {
        popover: {
          title: 'Finance approval queue',
          description: "Tier 2 is the finance-team review step — submissions arrive here after supervisor approval. Verify amounts against budget and process payment.",
        },
      },
      {
        element: 'table',
        popover: {
          title: 'Pending submissions',
          description: "Filter by hub, cost type, or date range. Click any row to open the full submission — receipt image, GL account mapping, and supervisor comments.",
          side: 'top',
        },
      },
      {
        popover: {
          title: 'Processing payment',
          description: "After reviewing, click Process Payment to release funds to the submitter's wallet. Rejections automatically notify the submitter with your reason.",
        },
      },
    ],
  },

  {
    slug: 'finance-processing',
    label: 'Finance Processing',
    steps: [
      {
        popover: {
          title: 'Finance processing centre',
          description: "Finance Processing is where the finance team manages the full payment cycle — from approved submissions through to wallet credit and reconciliation.",
        },
      },
      {
        element: '[role="tablist"]',
        popover: {
          title: 'Processing tabs',
          description: "Pending shows submissions ready to pay. Processed shows the payment history. Use the Batch Pay button to process multiple submissions simultaneously.",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Reconciliation',
          description: "After paying, use the Reconciliation tab to match payments against bank statements and flag discrepancies for audit review.",
        },
      },
    ],
  },

  {
    slug: 'approvals',
    label: 'Approvals Hub',
    steps: [
      {
        popover: {
          title: 'Universal approvals hub',
          description: "Approvals Hub consolidates every approval type across PACT — cost submissions, leave requests, advances, and project sign-offs — so you never miss an action item.",
        },
      },
      {
        element: '[role="tablist"]',
        popover: {
          title: 'Filter by approval type',
          description: "Use the tabs to focus on a specific approval type, or stay on All to see everything pending your action.",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Priority items',
          description: "Red badges indicate overdue approvals — items that have been waiting more than the target SLA. Process these first to avoid payment delays.",
        },
      },
    ],
  },

  {
    slug: 'wallet',
    label: 'My Wallet',
    steps: [
      {
        popover: {
          title: 'Your PACT wallet',
          description: "My Wallet shows your current balance and the full history of credits (approved advances, reimbursements) and debits (costs charged against your wallet).",
        },
      },
      {
        element: '[role="tablist"]',
        popover: {
          title: 'Wallet views',
          description: "Balance shows your current funds by currency. History shows every transaction with timestamps. Statement generates a PDF for expense reporting.",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Requesting an advance',
          description: "If your wallet is low, click Request Advance to ask your supervisor for a top-up. Once approved, the funds appear in your balance immediately.",
        },
      },
    ],
  },

  {
    slug: 'down-payment-approval',
    label: 'Down Payment Approval',
    steps: [
      {
        popover: {
          title: 'Down payment review queue',
          description: "Down Payment Approval is where finance managers review advance payment requests — typically for large field operations that need pre-funding before the activity starts.",
        },
      },
      {
        element: 'table',
        popover: {
          title: 'Request rows',
          description: "Each row shows the requester, amount, purpose, and supporting documents. Click a row to review the full request and supporting evidence.",
          side: 'top',
        },
      },
      {
        popover: {
          title: 'Approval tiers',
          description: "Large requests may require multi-tier approval (Supervisor → Finance → Country Director). The tier status bar shows where each request is in the chain.",
        },
      },
    ],
  },

  {
    slug: 'pre-funding',
    label: 'Pre-Funding Hub',
    steps: [
      {
        popover: {
          title: 'Pre-funding management',
          description: "Pre-Funding manages multi-tier advance requests for large field operations — where funds need to be released before the work begins rather than reimbursed after.",
        },
      },
      {
        element: '#tour-hub-sections',
        popover: {
          title: 'Pre-funding sections',
          description: "Requests tracks submitted pre-funding requests. Allocations shows how funds were distributed. History gives an audit trail of all pre-funding activity.",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Reconciling pre-funding',
          description: "After a field activity, the holder must submit a reconciliation — attaching receipts and returning any unused funds. The reconciliation tab tracks this.",
        },
      },
    ],
  },

  // ── Accounting ──────────────────────────────────────────────────────────────
  {
    slug: 'accounting-hub',
    label: 'Accounting Hub',
    steps: [
      {
        popover: {
          title: 'Full accounting suite',
          description: "Accounting Hub is PACT's general ledger system — Chart of Accounts, journal entries, AP invoices, fixed assets, budget tracking, and donor reporting all in one place.",
        },
      },
      {
        element: '#tour-hub-sections',
        popover: {
          title: 'Accounting sections',
          description: "Sections group by workflow: Core (GL, journals, ledger), Payables (vendors, purchase orders, invoices), Budget, Fixed Assets, and Reports. Click a section to explore.",
          side: 'bottom',
        },
      },
      {
        element: '#tour-hub-tab-bar',
        popover: {
          title: 'Page navigation',
          description: "The dropdown lists all pages in the current section. For example, in Payables you can jump between Vendors, Purchase Orders, and AP Invoices.",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'The accounting workflow',
          description: "Transactions flow: Purchase Requisition → Purchase Order → Goods Receipt → AP Invoice → Journal Entry → General Ledger. Each step is tracked here.",
        },
      },
    ],
  },

  // ── HR & People ─────────────────────────────────────────────────────────────
  {
    slug: 'hr-hub',
    label: 'HR Hub',
    steps: [
      {
        popover: {
          title: 'HR operations hub',
          description: "HR Hub covers the complete employee lifecycle — payroll, leave, timesheets, recruitment, onboarding, performance reviews, and offboarding.",
        },
      },
      {
        element: '#tour-hub-sections',
        popover: {
          title: 'HR sections',
          description: "Navigate by area: Pay & Compensation (payroll, advances, EOSB), Time & Leave (timesheets, leave calendar), and Talent & Structure (employees, positions, org chart).",
          side: 'bottom',
        },
      },
      {
        element: '#tour-hub-tab-bar',
        popover: {
          title: 'Jump to any HR page',
          description: "Use the dropdown to navigate directly. Staff see their own payslip and leave; HR admins see the full employee record and payroll run controls.",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Role-based visibility',
          description: "What you see depends on your role. Regular staff see My Payslip, My Leave, and My Timesheet. HR admins see Payroll Admin, Employees, and Compliance Reports.",
        },
      },
    ],
  },

  {
    slug: 'leave',
    label: 'Leave Requests',
    steps: [
      {
        popover: {
          title: 'Submit and track leave',
          description: "Leave Requests is where all staff apply for leave — annual, sick, emergency — and where supervisors review and approve requests.",
        },
      },
      {
        element: '[role="tablist"]',
        popover: {
          title: 'Request vs manage',
          description: "My Requests shows your personal leave history and any pending applications. Manage Requests (visible to supervisors) shows your team's leave queue.",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Applying for leave',
          description: "Click + New Request. Select leave type, start and end date, and optionally a cover person. Your remaining balance is shown before you submit.",
        },
      },
    ],
  },

  {
    slug: 'attendance',
    label: 'Attendance',
    steps: [
      {
        popover: {
          title: 'Attendance records',
          description: "Attendance tracks daily clock-in/out records for all staff, calculates working hours, and flags absences. Used for payroll and compliance reporting.",
        },
      },
      {
        element: 'input[placeholder*="earch" i], input[type="search"]',
        popover: {
          title: 'Filter by staff or date',
          description: "Search by employee name or filter by date range. Export the filtered records to Excel for payroll processing.",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Correcting records',
          description: "If a clock-in was missed, click the record and select Edit to add a manual entry. All manual corrections are logged in the audit trail.",
        },
      },
    ],
  },

  {
    slug: 'employees',
    label: 'Employees',
    steps: [
      {
        popover: {
          title: 'Employee directory and records',
          description: "Employees is the master directory of all staff — personal details, contract type, salary, bank account, and employment history.",
        },
      },
      {
        element: 'input[placeholder*="earch" i], input[type="search"]',
        popover: {
          title: 'Find an employee',
          description: "Search by name, ID number, or department. Use the status filter to show Active, On Leave, or Terminated employees.",
          side: 'bottom',
        },
      },
      {
        element: 'table',
        popover: {
          title: 'Employee records',
          description: "Click any row to open the full employee profile — contract details, payslip history, leave balance, assets assigned, and performance records.",
          side: 'top',
        },
      },
      {
        popover: {
          title: 'Column visibility',
          description: "Use the Columns button to show/hide fields like salary and bank account. Sensitive columns are controlled by your admin's column-visibility settings.",
        },
      },
    ],
  },

  {
    slug: 'payroll',
    label: 'Payroll',
    steps: [
      {
        popover: {
          title: 'Monthly payroll management',
          description: "Payroll lets finance and HR run the monthly payroll — calculating salaries, deductions, EOSB accruals, and generating payslips for all staff.",
        },
      },
      {
        element: '[role="tablist"]',
        popover: {
          title: 'Payroll stages',
          description: "Tabs guide you through the payroll run: Draft → Review → Confirm → Published. Work through each stage in order each month.",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Payroll run',
          description: "Click Run Payroll to calculate this month's payroll. Review the summary for errors before confirming. Once confirmed, payslips are published and visible to all staff.",
        },
      },
    ],
  },

  {
    slug: 'offboarding',
    label: 'Offboarding',
    steps: [
      {
        popover: {
          title: 'Staff departure process',
          description: "Offboarding guides HR through every step when a staff member leaves — asset collection, system access removal, final payroll, and EOSB calculation.",
        },
      },
      {
        element: 'table',
        popover: {
          title: 'Departure checklist',
          description: "Each row is a checklist item for the departing employee. Work through items in order — incomplete items are highlighted red until resolved.",
          side: 'top',
        },
      },
      {
        popover: {
          title: 'Final settlement',
          description: "Once all checklist items are complete, use the Generate Settlement button to calculate the final pay — including pro-rata salary, EOSB, and any outstanding advances.",
        },
      },
    ],
  },

  {
    slug: 'staff-onboarding',
    label: 'Staff Onboarding',
    steps: [
      {
        popover: {
          title: 'New hire onboarding',
          description: "Staff Onboarding manages the process of getting a new employee set up — system access, equipment assignment, orientation tasks, and document collection.",
        },
      },
      {
        element: 'table',
        popover: {
          title: 'Onboarding checklist',
          description: "Each item must be completed before the new hire starts. Click an item to assign a responsible person, add notes, or mark it done.",
          side: 'top',
        },
      },
      {
        popover: {
          title: 'Document collection',
          description: "The Documents tab lets you track which contracts, IDs, and compliance forms have been collected and signed by the new employee.",
        },
      },
    ],
  },

  {
    slug: 'performance-reviews',
    label: 'Performance Reviews',
    steps: [
      {
        popover: {
          title: 'Performance review cycles',
          description: "Performance Reviews manages the bi-annual or annual appraisal cycle — self-assessments, manager reviews, goal setting, and final ratings.",
        },
      },
      {
        element: '[role="tablist"]',
        popover: {
          title: 'Review phases',
          description: "Tabs show the current phase: Self-Assessment, Manager Review, or Completed. Each phase has a deadline — staff are notified automatically.",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Completing a review',
          description: "Click a staff member's name to open their review form. Rate each competency, add comments, and set goals for the next period before submitting.",
        },
      },
    ],
  },

  // ── CRM ─────────────────────────────────────────────────────────────────────
  {
    slug: 'crm',
    label: 'CRM Hub',
    steps: [
      {
        popover: {
          title: 'Stakeholder relationship management',
          description: "CRM Hub tracks partners, donors, government contacts, and service providers — interaction history, contract status, and follow-up tasks in one place.",
        },
      },
      {
        element: '#tour-hub-sections',
        popover: {
          title: 'CRM sections',
          description: "Contacts (individuals), Organisations (partners and donors), Interactions (meeting notes and calls), and Pipeline (active partnerships in negotiation).",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Logging an interaction',
          description: "Open any contact or organisation, then click + Log Interaction. Record the meeting notes, follow-up date, and outcome. These feed into partnership reports.",
        },
      },
    ],
  },

  // ── Analytics ───────────────────────────────────────────────────────────────
  {
    slug: 'analytics-hub',
    label: 'Analytics Hub',
    steps: [
      {
        popover: {
          title: 'Reports, data, and documents',
          description: "Analytics Hub gives you access to all PACT reports, raw data exports, and document libraries — from programme analytics to donor reports and data-quality dashboards.",
        },
      },
      {
        element: '#tour-hub-sections',
        popover: {
          title: 'Analytics sections',
          description: "Sections cover Reports (pre-built and custom), Data Visibility (who sees what), Field Data (raw collector submissions), and Documents (uploaded files and templates).",
          side: 'bottom',
        },
      },
      {
        element: '#tour-hub-tab-bar',
        popover: {
          title: 'Navigate reports',
          description: "The dropdown lists every report in the active section. Most reports have date range and hub filters — set them before generating.",
          side: 'bottom',
        },
      },
    ],
  },

  {
    slug: 'data-export-center',
    label: 'Data Export Center',
    steps: [
      {
        popover: {
          title: 'Bulk data exports',
          description: "Data Export Center lets admins export raw data from any PACT module — site visits, cost submissions, payroll — into Excel or CSV for external analysis.",
        },
      },
      {
        popover: {
          title: 'Configuring an export',
          description: "Select the data module, apply date and hub filters, choose your columns, then click Export. Large exports run in the background and notify you when ready.",
        },
      },
    ],
  },

  {
    slug: 'reports',
    label: 'Reports',
    steps: [
      {
        popover: {
          title: 'Report library',
          description: "Reports gives access to all pre-built management reports — site monitoring summaries, financial reconciliations, HR headcount, and donor narrative reports.",
        },
      },
      {
        element: 'input[placeholder*="earch" i], input[type="search"]',
        popover: {
          title: 'Find a report',
          description: "Search by report name or filter by category. Click any report to open it — set your date range and hub filters before downloading.",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Scheduled reports',
          description: "Some reports can be scheduled to run and email automatically. Look for the Schedule button on any report that supports it.",
        },
      },
    ],
  },

  {
    slug: 'surveys',
    label: 'Surveys',
    steps: [
      {
        popover: {
          title: 'Survey management',
          description: "Surveys lets you create questionnaires, distribute them to field teams or external respondents, and analyse responses — used for household surveys and programme evaluations.",
        },
      },
      {
        element: 'input[placeholder*="earch" i], input[type="search"]',
        popover: {
          title: 'Survey list',
          description: "Search or filter surveys by status (Draft, Active, Closed). Click a survey to view responses and analytics.",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Creating a survey',
          description: "Click + New Survey to build a questionnaire with the drag-and-drop builder. Add questions, set response types, and configure skip logic before publishing.",
        },
      },
    ],
  },

  // ── Administration ──────────────────────────────────────────────────────────
  {
    slug: 'admin-hub',
    label: 'Admin Hub',
    steps: [
      {
        popover: {
          title: 'System administration hub',
          description: "Admin Hub is the control centre for organisational configuration — user accounts, roles and permissions, departments, settings, and compliance tools.",
        },
      },
      {
        element: '#tour-hub-sections',
        popover: {
          title: 'Admin sections',
          description: "People & Access (users, roles, page access), Organisation (departments, hubs, classifications), and System (settings, audit, monitoring).",
          side: 'bottom',
        },
      },
      {
        element: '#tour-hub-tab-bar',
        popover: {
          title: 'Navigate admin pages',
          description: "Use the dropdown to jump to any admin page. The most commonly used are User Management, Role Management, and Page Access Control.",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Access Manager shortcut',
          description: "From Role Management, open the Access Manager to give individual users custom access to specific pages, hub tabs, columns, or data scopes.",
        },
      },
    ],
  },

  {
    slug: 'super-admin-hub',
    label: 'Super Admin Hub',
    steps: [
      {
        popover: {
          title: 'Super admin control panel',
          description: "Super Admin Hub provides advanced tools for platform administrators — system health monitoring, raw data management, email configuration, and mobile app settings.",
        },
      },
      {
        element: '#tour-hub-sections',
        popover: {
          title: 'Super Admin sections',
          description: "Monitoring & Health, Permissions & Audit, Email & Comms, Mobile Config, and Data & Tools. Each section contains specialist pages not visible to regular admins.",
          side: 'bottom',
        },
      },
      {
        element: '#tour-hub-tab-bar',
        popover: {
          title: 'Navigate sections',
          description: "Use the dropdown to jump between pages within a section. For example, in Data & Tools you can switch between Transaction Scanner and Data Management.",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Data Management',
          description: "The Data Management tab (Data & Tools section) gives direct access to raw database tables — use it only when you need to correct data that can't be fixed through the normal UI.",
        },
      },
    ],
  },

  {
    slug: 'users',
    label: 'User Management',
    steps: [
      {
        popover: {
          title: 'Manage all user accounts',
          description: "User Management is where admins approve registrations, activate/deactivate accounts, change roles, and reset passwords for all PACT users.",
        },
      },
      {
        element: 'input[placeholder*="earch" i], input[type="search"]',
        popover: {
          title: 'Find a user',
          description: "Search by name, email, or role. Use the Status filter to show Pending (awaiting approval), Active, or Deactivated accounts.",
          side: 'bottom',
        },
      },
      {
        element: 'table',
        popover: {
          title: 'User rows',
          description: "Click a user row to open their profile — change role, reset password, view their login history, and adjust their page or column access.",
          side: 'top',
        },
      },
      {
        popover: {
          title: 'Approving new registrations',
          description: "Filter by Status = Pending to see new sign-ups waiting for activation. Review the registration details and click Approve (or Reject with a reason).",
        },
      },
    ],
  },

  {
    slug: 'role-management',
    label: 'Role Management',
    steps: [
      {
        popover: {
          title: 'Roles, permissions, and access',
          description: "Role Management lets you define what each role can do — which pages they can visit, which actions they can take, and which columns they can see.",
        },
      },
      {
        element: '[role="tablist"]',
        popover: {
          title: 'Management tabs',
          description: "Roles (the role list), Permissions (resource-level permissions per role), and Access Manager (per-user overrides that override the role defaults).",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Access Manager',
          description: "The Access Manager tab lets you give one specific user more or less access than their role normally allows — useful for temporary or exceptional access situations.",
        },
      },
    ],
  },

  {
    slug: 'settings',
    label: 'Settings',
    steps: [
      {
        popover: {
          title: 'Platform configuration',
          description: "Settings controls global platform behaviour — notification preferences, system defaults, appearance options, and integration configurations.",
        },
      },
      {
        element: '[role="tablist"]',
        popover: {
          title: 'Settings categories',
          description: "Settings are grouped by area: General, Notifications, Appearance, and Integrations. Your changes are saved automatically in most sections.",
          side: 'bottom',
        },
      },
    ],
  },

  // ── Audit & Security ────────────────────────────────────────────────────────
  {
    slug: 'audit-compliance',
    label: 'Audit & Compliance',
    steps: [
      {
        popover: {
          title: 'Compliance monitoring',
          description: "Audit & Compliance shows automated checks across PACT — duplicate payments, segregation-of-duties violations, and data-quality flags — so auditors can review and sign off.",
        },
      },
      {
        element: '[role="tablist"]',
        popover: {
          title: 'Compliance tabs',
          description: "Switch between Findings (flagged items requiring review), Cleared (resolved findings), and Policy Checks (automated rule results).",
          side: 'bottom',
        },
      },
    ],
  },

  {
    slug: 'audit-logs',
    label: 'System Audit Logs',
    steps: [
      {
        popover: {
          title: 'Immutable activity log',
          description: "System Audit Logs records every action performed in PACT — who did what, when, and what the data looked like before and after. Logs cannot be modified or deleted.",
        },
      },
      {
        element: 'input[placeholder*="earch" i], input[type="search"]',
        popover: {
          title: 'Searching the audit log',
          description: "Filter by user, action type, module, or date range. Click any log entry to see the before/after data snapshot for that action.",
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'Exporting for audit',
          description: "Use the Export button to download filtered logs as CSV for external auditors. Include the hash column — it lets auditors verify log integrity.",
        },
      },
    ],
  },

  {
    slug: 'login-analytics',
    label: 'Login Analytics',
    steps: [
      {
        popover: {
          title: 'Login patterns and security',
          description: "Login Analytics shows who has been accessing PACT, from which devices and locations, and flags unusual login patterns that may indicate compromised accounts.",
        },
      },
      {
        popover: {
          title: 'Investigating suspicious logins',
          description: "Click any user row to see their full login history — timestamps, IP addresses, and device fingerprints. Use the 'Flag for review' option if something looks wrong.",
        },
      },
    ],
  },

  {
    slug: 'data-visibility',
    label: 'Data Visibility',
    steps: [
      {
        popover: {
          title: 'Control what each role sees',
          description: "Data Visibility lets admins configure which columns are shown or hidden per role across different modules — for example, hiding salary columns from coordinators.",
        },
      },
      {
        popover: {
          title: 'Applying column rules',
          description: "Select a module, then toggle columns on or off for each role. Changes take effect immediately for all users in that role.",
        },
      },
    ],
  },

];
