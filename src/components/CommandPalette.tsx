import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  LayoutDashboard, CreditCard, Receipt, FolderKanban, Database,
  Building2, ClipboardList, Activity, MapPin, CheckCircle, Archive,
  Link2, Calendar, Users, Shield, ShieldCheck, Award, TrendingUp,
  DollarSign, Settings, BarChart3, BookOpen, FileSignature, Phone,
  MessageSquare, Bell, FileText, Map, ScrollText, Mail, Banknote,
  ClipboardCheck, Smartphone, HelpCircle, PenTool, PhoneCall, RefreshCw,
  Search, Briefcase, CheckSquare, CalendarOff, Megaphone, Package,
  Clock, LogOut, Handshake, Wallet, Landmark, ScanLine, Siren,
  FolderOpen, CalendarCheck, UserCog, GraduationCap, PieChart,
  ListChecks, GitBranch, FileBarChart, Layers, BookMarked,
} from 'lucide-react';

interface PageEntry {
  title: string;
  url: string;
  icon: any;
  group: string;
  keywords?: string[];
}

const ALL_PAGES: PageEntry[] = [
  // ── Overview ──────────────────────────────────────────────────────────────
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard, group: 'Overview', keywords: ['home', 'main', 'stats'] },
  { title: 'Signatures', url: '/signatures', icon: FileSignature, group: 'Overview', keywords: ['sign', 'digital'] },

  // ── My Workspace ──────────────────────────────────────────────────────────
  { title: 'My Tasks', url: '/my-tasks', icon: CheckSquare, group: 'My Workspace', keywords: ['task', 'todo', 'work', 'daily'] },
  { title: 'My Team', url: '/my-team', icon: Users, group: 'My Workspace', keywords: ['team', 'direct reports'] },
  { title: 'Team Task Monitor', url: '/team-tasks', icon: ListChecks, group: 'My Workspace', keywords: ['team', 'tasks', 'monitor', 'executive'] },
  { title: 'My Payslip', url: '/hr?tab=payroll', icon: Receipt, group: 'My Workspace', keywords: ['payslip', 'salary', 'slip', 'payroll', 'my pay'] },
  { title: 'My Advances', url: '/my-advances', icon: Wallet, group: 'My Workspace', keywords: ['advance', 'loan', 'transport'] },
  { title: 'My Expenses', url: '/my-expenses', icon: Receipt, group: 'My Workspace', keywords: ['expense', 'reimburse'] },
  { title: 'Workspace Hub', url: '/workspace', icon: FolderOpen, group: 'My Workspace', keywords: ['workspace', 'hub'] },

  // ── Communication ──────────────────────────────────────────────────────────
  { title: 'Chat', url: '/chat', icon: MessageSquare, group: 'Communication', keywords: ['message', 'talk'] },
  { title: 'Calls', url: '/calls', icon: Phone, group: 'Communication', keywords: ['phone', 'voice', 'video'] },
  { title: 'Notifications', url: '/notifications', icon: Bell, group: 'Communication', keywords: ['alerts', 'bell'] },
  { title: 'Notification History', url: '/notification-history', icon: ScrollText, group: 'Communication', keywords: ['history', 'past', 'log'] },
  { title: 'Broadcast Center', url: '/admin/broadcast', icon: Megaphone, group: 'Communication', keywords: ['broadcast', 'announce', 'push'] },
  { title: 'WhatsApp Admin', url: '/admin/whatsapp', icon: Smartphone, group: 'Communication', keywords: ['whatsapp', 'wa', 'sms'] },
  { title: 'Call Analytics', url: '/call-analytics', icon: Phone, group: 'Communication', keywords: ['call', 'analytics', 'stats'] },

  // ── Planning & Setup ───────────────────────────────────────────────────────
  { title: 'Projects', url: '/projects', icon: FolderKanban, group: 'Planning & Setup', keywords: ['project'] },
  { title: 'Create Project', url: '/projects/create', icon: FolderKanban, group: 'Planning & Setup', keywords: ['new project', 'create'] },
  { title: 'Project Analytics', url: '/projects/analytics', icon: BarChart3, group: 'Planning & Setup', keywords: ['project', 'analytics', 'cross'] },
  { title: 'Portfolio Dashboard', url: '/portfolio', icon: LayoutDashboard, group: 'Planning & Setup', keywords: ['portfolio', 'director', 'overview'] },
  { title: 'MMP Management', url: '/mmp', icon: Database, group: 'Planning & Setup', keywords: ['monthly monitoring', 'plan'] },
  { title: 'MMP Upload', url: '/mmp/upload', icon: Database, group: 'Planning & Setup', keywords: ['upload', 'csv'] },
  { title: 'Hub Operations', url: '/hub-operations', icon: Building2, group: 'Planning & Setup', keywords: ['hub'] },
  { title: 'Hub Management', url: '/hub-management', icon: Building2, group: 'Planning & Setup', keywords: ['hub'] },
  { title: 'Monitoring Plan', url: '/monitoring-plan', icon: ClipboardList, group: 'Planning & Setup', keywords: ['monitor'] },
  { title: 'Surveys', url: '/surveys', icon: ClipboardList, group: 'Planning & Setup', keywords: ['survey', 'questionnaire', 'form'] },

  // ── Field Operations ───────────────────────────────────────────────────────
  { title: 'Site Visits', url: '/site-visits', icon: ClipboardList, group: 'Field Operations', keywords: ['visit', 'field'] },
  { title: 'Create Site Visit', url: '/site-visits/create', icon: ClipboardList, group: 'Field Operations', keywords: ['new visit'] },
  { title: 'Field Team', url: '/field-team', icon: Activity, group: 'Field Operations', keywords: ['team', 'map'] },
  { title: 'Safety Hub', url: '/safety-hub', icon: Shield, group: 'Field Operations', keywords: ['safety', 'incident', 'risk'] },
  { title: 'Equipment Tracking', url: '/equipment', icon: Package, group: 'Field Operations', keywords: ['equipment', 'asset', 'device'] },

  // ── Verification ───────────────────────────────────────────────────────────
  { title: 'Site Verification', url: '/coordinator/sites', icon: CheckCircle, group: 'Verification', keywords: ['verify', 'coordinator'] },
  { title: 'Coordinator Dashboard', url: '/coordinator-dashboard', icon: CheckCircle, group: 'Verification', keywords: ['coordinator'] },
  { title: 'Archive', url: '/archive', icon: Archive, group: 'Verification', keywords: ['old', 'history'] },

  // ── Data & Reports ─────────────────────────────────────────────────────────
  { title: 'Data Visibility', url: '/data-visibility', icon: Link2, group: 'Data & Reports', keywords: ['data'] },
  { title: 'Reports', url: '/reports', icon: BarChart3, group: 'Data & Reports', keywords: ['report', 'analytics'] },
  { title: 'Calendar', url: '/calendar', icon: Calendar, group: 'Data & Reports', keywords: ['date', 'schedule'] },
  { title: 'Tracker Preparation', url: '/tracker-preparation-plan', icon: BarChart3, group: 'Data & Reports', keywords: ['tracker'] },
  { title: 'Documents', url: '/documents', icon: FileText, group: 'Data & Reports', keywords: ['file', 'doc'] },
  { title: 'Advanced Map', url: '/advanced-map', icon: Map, group: 'Data & Reports', keywords: ['map', 'geo', 'location'] },
  { title: 'Data Export Center', url: '/data-export-center', icon: FileText, group: 'Data & Reports', keywords: ['export', 'download', 'excel', 'csv'] },
  { title: 'Questionnaire Analytics', url: '/questionnaire-analytics', icon: PieChart, group: 'Data & Reports', keywords: ['survey', 'questionnaire', 'analytics'] },

  // ── My Money ───────────────────────────────────────────────────────────────
  { title: 'My Wallet', url: '/wallet', icon: CreditCard, group: 'My Money', keywords: ['wallet', 'balance', 'money'] },
  { title: 'Cost Submission', url: '/cost-submission', icon: Receipt, group: 'My Money', keywords: ['expense', 'cost', 'submit'] },
  { title: 'Cost Submission Reports', url: '/cost-submission/reports', icon: Receipt, group: 'My Money', keywords: ['expense report'] },

  // ── Approvals ──────────────────────────────────────────────────────────────
  { title: 'Tier 1 Approvals', url: '/supervisor-approvals', icon: ClipboardCheck, group: 'Approvals', keywords: ['approve', 'supervisor'] },
  { title: 'Tier 2 Approvals', url: '/withdrawal-approval', icon: ClipboardCheck, group: 'Approvals', keywords: ['approve', 'withdrawal'] },
  { title: 'Down-Payment Approval', url: '/down-payment-approval', icon: DollarSign, group: 'Approvals', keywords: ['advance', 'payment'] },
  { title: 'Finance Processing', url: '/finance-approval', icon: Banknote, group: 'Approvals', keywords: ['finance', 'process'] },
  { title: 'Approval Dashboard', url: '/approval-dashboard', icon: ClipboardCheck, group: 'Approvals', keywords: ['approve', 'overview'] },

  // ── HR & People ────────────────────────────────────────────────────────────
  { title: 'Employees', url: '/employees', icon: Users, group: 'HR & People', keywords: ['employee', 'staff', 'people', 'workforce', 'hr', 'human resources'] },
  { title: 'HR Hub', url: '/hr', icon: UserCog, group: 'HR & People', keywords: ['hr', 'human resources', 'admin', 'hub'] },
  { title: 'Payroll Admin', url: '/payroll', icon: Banknote, group: 'HR & People', keywords: ['payroll', 'salary', 'admin', 'pay', 'run payroll'] },
  { title: 'Leave Requests', url: '/leave', icon: CalendarOff, group: 'HR & People', keywords: ['leave', 'vacation', 'absence', 'time off'] },
  { title: 'Performance Reviews', url: '/performance-reviews', icon: Award, group: 'HR & People', keywords: ['performance', 'review', 'appraisal'] },
  { title: 'Salary Increments', url: '/salary-increments', icon: TrendingUp, group: 'HR & People', keywords: ['salary', 'increment', 'raise', 'increase'] },
  { title: 'Training & Certifications', url: '/training-certifications', icon: GraduationCap, group: 'HR & People', keywords: ['training', 'certification', 'course', 'learning'] },
  { title: 'Positions & Vacancies', url: '/positions', icon: Briefcase, group: 'HR & People', keywords: ['position', 'vacancy', 'job', 'recruitment', 'hiring'] },
  { title: 'Attendance', url: '/attendance', icon: Clock, group: 'HR & People', keywords: ['attendance', 'timekeeping', 'clock'] },
  { title: 'Offboarding', url: '/offboarding', icon: LogOut, group: 'HR & People', keywords: ['offboard', 'exit', 'resign', 'terminate'] },
  { title: 'Salary & Retainer Report', url: '/salary-retainer-report', icon: FileBarChart, group: 'HR & People', keywords: ['salary', 'retainer', 'report', 'payroll'] },

  // ── Financial Management ───────────────────────────────────────────────────
  { title: 'Budget', url: '/budget', icon: DollarSign, group: 'Financial Management', keywords: ['budget', 'money'] },
  { title: 'Wallets Admin', url: '/admin/wallets', icon: CreditCard, group: 'Financial Management', keywords: ['wallet', 'admin'] },
  { title: 'Financial Operations', url: '/financial-operations', icon: TrendingUp, group: 'Financial Management', keywords: ['finance', 'ops'] },
  { title: 'Retainer Management', url: '/retainer-management', icon: Banknote, group: 'Financial Management', keywords: ['retainer', 'payment'] },
  { title: 'Reconciliation Dashboard', url: '/reconciliation-dashboard', icon: ClipboardCheck, group: 'Financial Management', keywords: ['reconcile'] },

  // ── Financial Reports ──────────────────────────────────────────────────────
  { title: 'Wallet Reports', url: '/wallet-reports', icon: BarChart3, group: 'Financial Reports', keywords: ['wallet', 'report'] },
  { title: 'Transport Advance Report', url: '/advance-requests-report', icon: BarChart3, group: 'Financial Reports', keywords: ['advance', 'transport'] },
  { title: 'Cost Predictions', url: '/cost-predictions', icon: TrendingUp, group: 'Financial Reports', keywords: ['predict', 'forecast'] },
  { title: 'Exchange Rates', url: '/exchange-rates', icon: DollarSign, group: 'Financial Reports', keywords: ['currency', 'rate', 'usd', 'sdg'] },
  { title: 'Down-Payment Advance Report', url: '/down-payment-advance-report', icon: FileBarChart, group: 'Financial Reports', keywords: ['down payment', 'advance', 'report'] },
  { title: 'Month-End Summary', url: '/month-end-summary', icon: CalendarCheck, group: 'Financial Reports', keywords: ['month end', 'close', 'summary'] },

  // ── Accounting ─────────────────────────────────────────────────────────────
  { title: 'Finance Dashboard', url: '/accounting/finance-dashboard', icon: LayoutDashboard, group: 'Accounting', keywords: ['finance', 'dashboard', 'accounting'] },
  { title: 'Chart of Accounts', url: '/accounting/coa', icon: Layers, group: 'Accounting', keywords: ['coa', 'chart', 'accounts'] },
  { title: 'Journal Entries', url: '/accounting/journals', icon: BookMarked, group: 'Accounting', keywords: ['journal', 'entries', 'gl', 'posting'] },
  { title: 'Trial Balance', url: '/accounting/trial-balance', icon: TrendingUp, group: 'Accounting', keywords: ['trial', 'balance'] },
  { title: 'General Ledger', url: '/accounting/ledger', icon: BookOpen, group: 'Accounting', keywords: ['ledger', 'gl', 'general'] },
  { title: 'Financial Statements', url: '/accounting/reports', icon: FileText, group: 'Accounting', keywords: ['financial', 'statement', 'income', 'balance sheet'] },
  { title: 'Bank Reconciliation', url: '/accounting/bank-recon', icon: Landmark, group: 'Accounting', keywords: ['bank', 'reconciliation', 'recon'] },
  { title: 'Budget vs. Actual', url: '/accounting/budget-variance', icon: BarChart3, group: 'Accounting', keywords: ['budget', 'actual', 'variance'] },
  { title: 'Vendors', url: '/accounting/vendors', icon: Building2, group: 'Accounting', keywords: ['vendor', 'supplier', 'payable'] },
  { title: 'AP Aging Report', url: '/accounting/ap-aging', icon: FileBarChart, group: 'Accounting', keywords: ['ap', 'aging', 'payable'] },
  { title: 'Cash Flow Statement', url: '/accounting/cash-flow', icon: TrendingUp, group: 'Accounting', keywords: ['cash', 'flow'] },
  { title: 'Fixed Assets', url: '/accounting/fixed-assets', icon: Package, group: 'Accounting', keywords: ['fixed', 'assets', 'depreciation'] },
  { title: 'Purchase Orders', url: '/accounting/purchase-orders', icon: ClipboardList, group: 'Accounting', keywords: ['purchase', 'order', 'po', 'procurement'] },
  { title: 'GL Bridge Engine', url: '/accounting/gl-bridge', icon: GitBranch, group: 'Accounting', keywords: ['gl', 'bridge', 'engine', 'posting'] },
  { title: 'Fiscal Years & Periods', url: '/accounting/fiscal-years', icon: Calendar, group: 'Accounting', keywords: ['fiscal', 'year', 'period'] },
  { title: 'Fund Registry', url: '/accounting/funds', icon: DollarSign, group: 'Accounting', keywords: ['fund', 'registry', 'donor'] },
  { title: 'Accounting Settings', url: '/accounting/settings', icon: Settings, group: 'Accounting', keywords: ['accounting', 'settings', 'config'] },

  // ── CRM ────────────────────────────────────────────────────────────────────
  { title: 'CRM Overview', url: '/crm', icon: Handshake, group: 'CRM', keywords: ['crm', 'partner', 'donor', 'relationship'] },
  { title: 'Partners & Donors', url: '/crm/partners', icon: Building2, group: 'CRM', keywords: ['partner', 'donor', 'organisation'] },
  { title: 'Contacts', url: '/crm/contacts', icon: Users, group: 'CRM', keywords: ['contact', 'person'] },
  { title: 'Engagements', url: '/crm/engagements', icon: MessageSquare, group: 'CRM', keywords: ['engagement', 'meeting', 'activity'] },
  { title: 'Pipeline', url: '/crm/opportunities', icon: TrendingUp, group: 'CRM', keywords: ['pipeline', 'opportunity', 'deal'] },

  // ── Administration ─────────────────────────────────────────────────────────
  { title: 'User Management', url: '/users', icon: Users, group: 'Administration', keywords: ['user', 'team', 'people'] },
  { title: 'Role Management', url: '/role-management', icon: Shield, group: 'Administration', keywords: ['role', 'permission'] },
  { title: 'Departments', url: '/departments', icon: Building2, group: 'Administration', keywords: ['department', 'unit', 'division'] },
  { title: 'Classifications', url: '/classifications', icon: Award, group: 'Administration', keywords: ['class', 'grade'] },
  { title: 'Classification Fees', url: '/classification-fees', icon: DollarSign, group: 'Administration', keywords: ['fee', 'rate'] },
  { title: 'Settings', url: '/settings', icon: Settings, group: 'Administration', keywords: ['config', 'preferences'] },
  { title: 'Permissions Management', url: '/permissions-management', icon: ShieldCheck, group: 'Administration', keywords: ['access', 'permission'] },
  { title: 'Role Perspective Viewer', url: '/role-perspective', icon: ShieldCheck, group: 'Administration', keywords: ['simulate', 'perspective'] },
  { title: 'Task Admin', url: '/task-admin', icon: CheckSquare, group: 'Administration', keywords: ['task', 'admin', 'template'] },
  { title: 'Staff Directory', url: '/admin/staff-profiles', icon: Users, group: 'Administration', keywords: ['staff', 'profiles', 'directory', 'team', 'bank', 'account'] },
  { title: 'Audit & Compliance', url: '/audit-compliance', icon: Shield, group: 'Administration', keywords: ['audit', 'compliance'] },
  { title: 'Notification Analytics', url: '/notification-analytics', icon: BarChart3, group: 'Administration', keywords: ['notification', 'analytics'] },
  { title: 'Transaction Scanner', url: '/admin/transaction-scanner', icon: ScanLine, group: 'Administration', keywords: ['transaction', 'scanner', 'ocr', 'receipt'] },

  // ── Help & Support ─────────────────────────────────────────────────────────
  { title: 'Documentation', url: '/documentation', icon: BookOpen, group: 'Help & Support', keywords: ['help', 'guide', 'manual'] },
  { title: 'Mobile User Manual', url: '/mobile-documentation', icon: Smartphone, group: 'Help & Support', keywords: ['mobile', 'guide'] },
  { title: 'Support Contacts', url: '/support-contacts', icon: Phone, group: 'Help & Support', keywords: ['contact', 'help'] },

  // ── Super Admin ────────────────────────────────────────────────────────────
  { title: 'Super Admin Management', url: '/super-admin-management', icon: ShieldCheck, group: 'Super Admin', keywords: ['admin'] },
  { title: 'Data Management', url: '/super-admin-data', icon: Database, group: 'Super Admin', keywords: ['data'] },
  { title: 'Audit Logs', url: '/audit-logs', icon: ScrollText, group: 'Super Admin', keywords: ['audit', 'log'] },
  { title: 'Email Tracking', url: '/email-tracking', icon: Mail, group: 'Super Admin', keywords: ['email'] },
  { title: 'Email Management', url: '/email-management', icon: Mail, group: 'Super Admin', keywords: ['email'] },
  { title: 'Mobile Support Tickets', url: '/mobile-support-tickets', icon: Smartphone, group: 'Super Admin', keywords: ['ticket'] },
  { title: 'Mobile Help Articles', url: '/mobile-help-articles', icon: HelpCircle, group: 'Super Admin', keywords: ['article'] },
  { title: 'Mobile Signatures', url: '/mobile-signatures', icon: PenTool, group: 'Super Admin', keywords: ['sign'] },
  { title: 'Mobile Call Scheduling', url: '/mobile-call-scheduling', icon: PhoneCall, group: 'Super Admin', keywords: ['call'] },
  { title: 'Mobile Document Sync', url: '/mobile-document-sync', icon: RefreshCw, group: 'Super Admin', keywords: ['sync'] },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !isInputFocused()) {
        e.preventDefault();
        setOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const grouped = useMemo(() => {
    const map: Record<string, PageEntry[]> = {};
    ALL_PAGES.forEach((page) => {
      if (!map[page.group]) map[page.group] = [];
      map[page.group].push(page);
    });
    return map;
  }, []);

  const handleSelect = (url: string) => {
    setOpen(false);
    navigate(url);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground bg-muted/50 border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer"
        data-testid="button-command-palette"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search pages...</span>
        <kbd className="hidden md:inline-flex items-center gap-0.5 rounded border bg-background px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
          /
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a page name or / to search..." data-testid="input-command-search" />
        <CommandList>
          <CommandEmpty>No pages found.</CommandEmpty>
          {Object.entries(grouped).map(([group, pages], idx) => (
            <span key={group}>
              {idx > 0 && <CommandSeparator />}
              <CommandGroup heading={group}>
                {pages.map((page) => (
                  <CommandItem
                    key={page.url}
                    value={`${page.title} ${page.url} ${(page.keywords || []).join(' ')}`}
                    onSelect={() => handleSelect(page.url)}
                    className="cursor-pointer"
                    data-testid={`command-item-${page.url.replace(/\//g, '-').slice(1)}`}
                  >
                    <page.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{page.title}</span>
                    <span className="ml-auto text-xs text-muted-foreground font-mono">{page.url}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </span>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}
