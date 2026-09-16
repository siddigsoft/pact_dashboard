/** Canonical static page and navigation access definitions. No runtime/database imports. */
import type React from 'react';
import {
  LayoutDashboard, CheckSquare, FolderOpen, FolderKanban, Compass,
  Users, Shield, Handshake, CalendarOff, Activity, Building2,
  BarChart3, MessageSquare, Calendar, Bell, Search, UserX, UserCheck,
  ChevronRight, Info, Lock, Unlock, Loader2, CreditCard, Banknote,
  FileText, Archive, Map, ClipboardList, Database, ClipboardCheck,
  TrendingUp, Receipt, DollarSign, Siren, AlertTriangle, Package,
  ScrollText, Award,
  Phone, Mail, Calculator, Landmark, Briefcase, GraduationCap,
  CalendarCheck, PieChart, LineChart, Target, Globe, RefreshCcw,
  Coins, ListChecks, Plug, History, HeartHandshake, Zap, Smartphone,
  BookOpen, Building, UserCog, Layers, GitBranch, BarChart2,
  ScanLine, Eye, Key, PlugZap, Megaphone, ClipboardEdit,
  Pencil, X, Check, Filter, LayoutList,
} from 'lucide-react';

// ── Role code constants (matching normalizeRole() output exactly) ─────────────
//  superAdmin | admin | ict | fom | financialAdmin | auditor | supervisor
//  coordinator | dataCollector | dataTeam | reviewer | projectManager | countryDirector

export interface PageDef {
  slug: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
  roles: string[];   // 'all' | '!dataCollector' | RoleCode strings
  note?: string;
}

export const PAGE_DEFS: PageDef[] = [
  { slug: 'incentives', label: 'My Incentives', path: '/incentives', icon: Award, group: 'My Workspace', roles: ['all'] },
  { slug: 'field-payments', label: 'Field Payments', path: '/field-payments', icon: Banknote, group: 'Finance', roles: ['superAdmin', 'admin', 'financialAdmin', 'auditor', 'fom', 'supervisor'] },
  { slug: 'cost-approval', label: 'Cost Approval', path: '/cost-approval', icon: ClipboardCheck, group: 'Finance', roles: ['superAdmin', 'admin', 'fom', 'supervisor', 'financialAdmin', 'countryDirector'] },
  { slug: 'cycle-exception-rollover', label: 'Cycle Exception Rollover', path: '/cycle-exceptions/rollover', icon: RefreshCcw, group: 'Finance', roles: ['superAdmin', 'admin', 'financialAdmin'] },
  { slug: 'cycle-exception-resolution', label: 'Cycle Exception Resolution', path: '/cycle-exceptions/resolution', icon: ClipboardCheck, group: 'Finance', roles: ['superAdmin', 'admin', 'financialAdmin'] },
  // ── My Workspace ──────────────────────────────────────────────────────────
  { slug:'dashboard',           label:'Dashboard',              path:'/dashboard',              icon:LayoutDashboard, group:'My Workspace',
    roles:['all', 'SMT'] },
  { slug:'my-tasks',            label:'My Tasks',               path:'/my-tasks',               icon:CheckSquare, group:'My Workspace',
    roles:['all', 'SMT'] },
  { slug:'my-projects',         label:'My Projects',            path:'/my-projects',            icon:FolderOpen, group:'My Workspace',
    roles:['all', 'SMT'], note:'Personal project list. Opening a project uses Projects (/projects/:id) — grants cascade together.' },
  { slug:'notification-preferences', label:'Notification Preferences', path:'/notification-preferences', icon:Bell, group:'My Workspace',
    roles:['all'] },
  { slug:'notification-history',label:'Notification History',   path:'/notification-history',   icon:History, group:'My Workspace',
    roles:['all'] },
  { slug:'calendar',            label:'Calendar',               path:'/calendar',               icon:Calendar, group:'My Workspace',
    roles:['!dataCollector', 'SMT'] },
  { slug:'notifications',       label:'Notifications',          path:'/notifications',          icon:Bell, group:'My Workspace',
    roles:['all', 'SMT'] },
  { slug:'workspace',           label:'Workspace Hub',          path:'/workspace',              icon:FolderOpen, group:'My Workspace',
    roles:['all'] },
  { slug:'search',              label:'Global Search',          path:'/search',                 icon:Search, group:'My Workspace',
    roles:['all'] },

  // ── Communication ─────────────────────────────────────────────────────────
  { slug:'communication-hub',   label:'Communication Hub',      path:'/communication-hub',      icon:MessageSquare, group:'Communication',
    roles:['all'], note:'Unified hub for Chat, Calls, and WebRTC' },
  { slug:'call-analytics',      label:'Call Analytics',         path:'/call-analytics',         icon:Phone, group:'Communication',
    roles:['superAdmin','admin','ict'] },
  { slug:'chat',                label:'Chat',                   path:'/chat',                   icon:MessageSquare, group:'Communication',
    roles:['all'] },
  { slug:'signatures',          label:'Signatures',             path:'/signatures',             icon:ScrollText, group:'Communication',
    roles:['superAdmin','admin','ict','fom','coordinator','supervisor','financialAdmin','auditor'] },
  { slug:'broadcast',           label:'Broadcast Center',       path:'/admin/broadcast',        icon:Megaphone, group:'Communication',
    roles:['superAdmin','admin'] },
  { slug:'whatsapp-admin',      label:'WhatsApp Settings',      path:'/admin/whatsapp',         icon:MessageSquare, group:'Communication',
    roles:['superAdmin'] },

  // ── Programme Management ──────────────────────────────────────────────────
  { slug:'programme-hub',       label:'Programme Hub',          path:'/programme-hub',          icon:FolderKanban, group:'Programme Management',
    roles:['superAdmin','admin','fom','projectManager','countryDirector','seniorOperationsLead','SMT'], note:'Unified hub for Projects, Portfolio & Analytics' },
  { slug:'projects',            label:'Projects',               path:'/projects',               icon:FolderOpen, group:'Programme Management',
    roles:['all', 'SMT'], note:'Project list + /projects/:id detail. Linked with My Projects — grants/blocks cascade together. Edit/write still guarded in-page.' },
  { slug:'portfolio',           label:'Portfolio Dashboard',    path:'/portfolio',              icon:LayoutDashboard, group:'Programme Management',
    roles:['superAdmin','admin','fom','countryDirector','projectManager','seniorOperationsLead','SMT'] },
  { slug:'mmp',                 label:'MMP Management',         path:'/mmp',                    icon:Database, group:'Programme Management',
    roles:['superAdmin','admin','ict','dataTeam','fom','coordinator','supervisor','dataCollector','countryDirector','projectManager','seniorOperationsLead'] },
  { slug:'mmp-full-report',     label:'MMP Full Report',        path:'/mmp#full-report',        icon:BarChart2, group:'Programme Management',
    roles:['superAdmin','countryDirector','supervisor'], note:'Supervisors receive a secured report limited to their assigned hubs' },
  { slug:'project-updates',     label:'Project Updates',        path:'/project-updates',        icon:ClipboardList, group:'Programme Management',
    roles:['superAdmin','admin','fom','projectManager','coordinator','supervisor','countryDirector','seniorOperationsLead'] },
  { slug:'hub-operations',      label:'Hub Operations',         path:'/hub-operations',         icon:Building2, group:'Programme Management',
    roles:['superAdmin','admin'] },

  // ── Field Operations ──────────────────────────────────────────────────────
  { slug:'field-ops',           label:'Field Ops Hub',          path:'/field-ops',              icon:Compass, group:'Field Operations',
    roles:['superAdmin','admin','fom','supervisor','coordinator','dataTeam','seniorOperationsLead'], note:'Unified hub: Field Team, Incidents, Equipment, Map' },
  { slug:'site-visits',         label:'Site Visits',            path:'/site-visits',            icon:ClipboardList, group:'Field Operations',
    roles:['superAdmin','admin','ict','fom','coordinator','supervisor','dataCollector','dataTeam','seniorOperationsLead'] },
  { slug:'monitoring-form',     label:'Monitoring Form',        path:'/monitoring-form',        icon:ClipboardCheck, group:'Field Operations',
    roles:['superAdmin','admin','dataCollector','coordinator','supervisor','fom'] },
  { slug:'safety-hub',          label:'Safety Hub',             path:'/safety-hub',             icon:Siren, group:'Field Operations',
    roles:['superAdmin','admin','ict','fom','coordinator','supervisor','dataCollector','dataTeam'] },
  { slug:'incident-reports',    label:'Incident Reports',       path:'/incident-reports',       icon:AlertTriangle, group:'Field Operations',
    roles:['superAdmin','admin','ict','fom','coordinator','supervisor','dataTeam'] },
  { slug:'equipment',           label:'Equipment Tracking',     path:'/equipment',              icon:Package, group:'Field Operations',
    roles:['superAdmin','admin','fom'] },
  { slug:'field-operation-manager', label:'Field Operation Manager', path:'/field-operation-manager', icon:Compass, group:'Field Operations',
    roles:['superAdmin','admin','fom'] },
  { slug:'coverage-map',        label:'Coverage Map',           path:'/coverage-map',           icon:Map, group:'Field Operations',
    roles:['superAdmin','admin','fom','countryDirector','projectManager','seniorOperationsLead'] },

  // ── Coordination & Oversight ──────────────────────────────────────────────
  { slug:'coordinator-sites',   label:'Site Verification',      path:'/coordinator/sites',      icon:CheckSquare, group:'Coordination',
    roles:['superAdmin','coordinator','supervisor'] },
  { slug:'sites-for-verification', label:'Sites for Verification', path:'/coordinator/sites-for-verification', icon:ClipboardCheck, group:'Coordination',
    roles:['superAdmin','admin','coordinator','supervisor'] },
  { slug:'supervisor-sites',    label:'Supervisor Sites',       path:'/supervisor/sites',       icon:Map, group:'Coordination',
    roles:['superAdmin','admin','supervisor','fom'] },
  { slug:'coordinator-dashboard', label:'Coordinator Dashboard', path:'/coordinator-dashboard', icon:LayoutDashboard, group:'Coordination',
    roles:['superAdmin','admin','fom','coordinator','supervisor'] },
  { slug:'monitoring-plan',     label:'Monitoring Plan',        path:'/monitoring-plan',        icon:ClipboardList, group:'Coordination',
    roles:['superAdmin','admin','fom','coordinator','supervisor'] },
  { slug:'tracker-preparation', label:'Tracker Preparation Plan', path:'/tracker-preparation-plan', icon:Target, group:'Coordination',
    roles:['superAdmin','admin','fom','coordinator'] },
  { slug:'mmp-management',      label:'MMP Management Admin',   path:'/mmp-management',         icon:Database, group:'Coordination',
    roles:['superAdmin','admin','ict'] },
  // ── Finance ───────────────────────────────────────────────────────────────
  { slug:'finance-hub',         label:'Finance Hub',            path:'/finance-hub',            icon:Landmark, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor','fom','countryDirector','seniorOperationsLead'], note:'Unified hub: financial ops, wallets admin, advances report' },
  { slug:'finance-subscriptions', label:'Subscriptions',         path:'/finance-hub?tab=subscriptions', icon:CreditCard, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'finance',             label:'Finance (Legacy)',        path:'/finance',                icon:Banknote, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'], note:'Legacy finance page; most functionality moved to Finance Hub' },
  { slug:'mobile-cost-submission', label:'Mobile Cost Submission', path:'/mobile-cost-submission', icon:Smartphone, group:'Finance',
    roles:['superAdmin','admin','supervisor','fom','coordinator','dataCollector'] },
  { slug:'budget-requests',     label:'Budget Requests',        path:'/budget-requests',        icon:DollarSign, group:'Finance',
    roles:['superAdmin','admin','fom','financialAdmin','countryDirector','seniorOperationsLead'] },
  { slug:'wallet',              label:'My Wallet',              path:'/wallet',                 icon:CreditCard, group:'Finance',
    roles:['financialAdmin','auditor','fom','supervisor','dataCollector','coordinator'] },
  { slug:'cost-submission',     label:'Cost Submission',        path:'/cost-submission',        icon:Receipt, group:'Finance',
    roles:['superAdmin','admin','supervisor','fom','coordinator','dataTeam','countryDirector'] },
  { slug:'tier1-approvals',     label:'Tier 1 Approvals',       path:'/supervisor-approvals',   icon:ClipboardCheck, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor','supervisor','fom'] },
  { slug:'tier2-approvals',     label:'Tier 2 Approvals',       path:'/withdrawal-approval',    icon:ClipboardCheck, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'finance-processing',  label:'Finance Processing',     path:'/finance-approval',       icon:Banknote, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'approvals',           label:'Approvals Hub',          path:'/approvals',              icon:ListChecks, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor','supervisor','fom','countryDirector','seniorOperationsLead','projectManager'] },
  { slug:'approval-dashboard',  label:'Approval Dashboard',     path:'/approval-dashboard',     icon:ClipboardCheck, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','supervisor','fom'], note:'Redirects to Super Admin → Approval Dashboard. Linked with sa-approval-dashboard — grants cascade together.' },
  { slug:'down-payment-approval', label:'Down Payment Approval', path:'/down-payment-approval', icon:ClipboardCheck, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor','countryDirector','fom','supervisor','hubsupervisor'] },
  { slug:'cost-submission-reports', label:'Cost Submission Reports', path:'/cost-submission/reports', icon:BarChart3, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'wallet-reports',      label:'Wallet Reports',         path:'/wallet-reports',         icon:CreditCard, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'advance-requests-report', label:'Advance Requests Report', path:'/advance-requests-report', icon:BarChart3, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'down-payment-advance-report', label:'Down Payment Report', path:'/down-payment-advance-report', icon:Receipt, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'enumerator-fees-report', label:'Enumerator Fees Report', path:'/enumerator-fees-report', icon:Receipt, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'month-end-summary',   label:'Month-End Summary',      path:'/month-end-summary',      icon:BarChart3, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'exchange-rates',      label:'Exchange Rates',         path:'/exchange-rates',         icon:Coins, group:'Finance',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'cost-predictions',    label:'Cost Predictions',       path:'/cost-predictions',       icon:LineChart, group:'Finance',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'reconciliation-dashboard', label:'Reconciliation Dashboard', path:'/reconciliation-dashboard', icon:RefreshCcw, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },

  // ── Accounting ────────────────────────────────────────────────────────────
  { slug:'accounting-hub',      label:'Accounting Hub',         path:'/accounting',             icon:BookOpen, group:'Accounting',
    roles:['superAdmin','admin','finance','financialAdmin','accountant','auditor'], note:'Full GL, AP, Fixed Assets, Budget, P2P cycle' },
  { slug:'accounting-coa',      label:'Chart of Accounts',      path:'/accounting?tab=coa',     icon:Layers, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'accounting-journals', label:'Journal Entries',        path:'/accounting?tab=journals',icon:ScrollText, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'accounting-ledger',   label:'General Ledger',         path:'/accounting?tab=ledger',  icon:BookOpen, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'accounting-trial-balance', label:'Trial Balance',     path:'/accounting?tab=trial-balance', icon:BarChart2, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'accounting-bank-recon', label:'Bank Reconciliation',  path:'/accounting?tab=bank-recon', icon:RefreshCcw, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'accounting-fiscal-years', label:'Fiscal Years & Periods', path:'/accounting?tab=fiscal-years', icon:Calendar, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'accounting-funds',    label:'Fund Registry',          path:'/accounting?tab=funds',   icon:Coins, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'accounting-budget',   label:'Budget Planning',        path:'/accounting?tab=budget-planning', icon:DollarSign, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'accounting-budget-variance', label:'Budget vs Actuals', path:'/accounting?tab=budget-variance', icon:BarChart2, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'accounting-budget-encumbrance', label:'Budget Encumbrance', path:'/accounting?tab=budget-encumbrance', icon:Lock, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'accounting-vendors',  label:'Vendors',                path:'/accounting?tab=vendors', icon:Building2, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'accounting-purchase-req', label:'Purchase Requisitions', path:'/accounting?tab=purchase-requisitions', icon:ClipboardList, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'accounting-purchase-orders', label:'Purchase Orders', path:'/accounting?tab=purchase-orders', icon:Package, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'accounting-grn',      label:'Goods Receipt Notes',    path:'/accounting?tab=grn',     icon:Package, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'accounting-ap-invoices', label:'AP Invoices',         path:'/accounting?tab=ap-invoices', icon:Receipt, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'accounting-ap-aging', label:'AP Aging Report',        path:'/accounting?tab=ap-aging',icon:BarChart3, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'accounting-cheque-register', label:'Cheque Register', path:'/accounting?tab=cheque-register', icon:CreditCard, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'accounting-fixed-assets', label:'Fixed Assets',       path:'/accounting?tab=fixed-assets', icon:Building, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'accounting-depreciation', label:'Depreciation Run',   path:'/accounting?tab=depreciation-run', icon:TrendingUp, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'accounting-grants',   label:'Grant Tracking',         path:'/accounting?tab=grants',  icon:HeartHandshake, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'accounting-cost-allocation', label:'Cost Allocation', path:'/accounting?tab=cost-allocation', icon:PieChart, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'accounting-cash-flow',label:'Cash Flow',              path:'/accounting?tab=cash-flow',icon:LineChart, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'accounting-cash-flow-forecast', label:'Cash Flow Forecast', path:'/accounting?tab=cash-flow-forecast', icon:TrendingUp, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'accounting-multi-currency', label:'Multi-Currency',   path:'/accounting?tab=multi-currency', icon:Globe, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'accounting-tax',      label:'Tax Management',         path:'/accounting?tab=tax',     icon:Calculator, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'accounting-period-close', label:'Period Close',       path:'/accounting?tab=period-close', icon:Lock, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'accounting-donor-reports', label:'Donor Fund Reports', path:'/accounting?tab=donor-reports', icon:FileText, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'accounting-sod',      label:'Segregation of Duties',  path:'/accounting?tab=sod',     icon:Shield, group:'Accounting',
    roles:['superAdmin','admin','auditor'] },
  { slug:'accounting-gl-bridge',label:'GL Bridge Engine',       path:'/accounting?tab=gl-bridge',icon:Zap, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'accounting-consolidation', label:'Financial Consolidation', path:'/accounting?tab=consolidation', icon:Layers, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'accounting-gl-audit', label:'GL Audit Trail',         path:'/accounting?tab=gl-audit',icon:ScrollText, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'accounting-aml',      label:'AML Monitoring',         path:'/accounting?tab=aml',     icon:Siren, group:'Accounting',
    roles:['superAdmin','admin','auditor'] },
  { slug:'accounting-intercompany', label:'Intercompany',       path:'/accounting?tab=intercompany', icon:Globe, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'accounting-finance-dashboard', label:'Finance Dashboard (Acct)', path:'/accounting?tab=finance-dashboard', icon:LayoutDashboard, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin','auditor'] },

  // ── Pre-Funding ───────────────────────────────────────────────────────────
  { slug:'pre-funding',         label:'Pre-Funding Hub',        path:'/pre-funding',            icon:Banknote, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor','countryDirector'] },

  // ── HR & People ───────────────────────────────────────────────────────────
  { slug:'hr-hub',              label:'HR Hub',                 path:'/hr',                     icon:Briefcase, group:'HR & People',
    roles:['all'], note:'All staff see their own payslip/leave/timesheet; admin-only tabs are gated in-page' },
  { slug:'hr-timesheet',        label:'Timesheet',              path:'/hr?tab=timesheet',       icon:ClipboardCheck, group:'HR & People',
    roles:['all'] },
  { slug:'hr-payslip',          label:'My Payslip',             path:'/hr?tab=payroll',         icon:Receipt, group:'HR & People',
    roles:['all'] },
  { slug:'leave',               label:'Leave Requests',         path:'/leave',                  icon:CalendarOff, group:'HR & People',
    roles:['all'] },
  { slug:'daily-work',          label:'Daily Work',             path:'/daily-work',             icon:ListChecks, group:'HR & People',
    roles:['all'] },
  { slug:'team-tasks',          label:'Team Task Monitor',      path:'/team-tasks',             icon:CheckSquare, group:'HR & People',
    roles:['superAdmin','admin','fom','supervisor'] },
  { slug:'my-team',             label:'My Team',                path:'/my-team',                icon:Users, group:'HR & People',
    roles:['all'] },
  { slug:'my-advances',         label:'My Advances',            path:'/my-advances',            icon:Receipt, group:'HR & People',
    roles:['all'] },
  { slug:'my-expenses',         label:'My Expenses',            path:'/my-expenses',            icon:Receipt, group:'HR & People',
    roles:['all'] },
  { slug:'employees',           label:'Employees',              path:'/employees',              icon:Briefcase, group:'HR & People',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'attendance',          label:'Attendance',             path:'/attendance',             icon:CalendarCheck, group:'HR & People',
    roles:['superAdmin','admin','supervisor','fom'] },
  { slug:'offboarding',         label:'Offboarding',            path:'/offboarding',            icon:UserX, group:'HR & People',
    roles:['superAdmin','admin'] },
  { slug:'staff-onboarding',    label:'Staff Onboarding',       path:'/staff-onboarding',       icon:UserCheck, group:'HR & People',
    roles:['superAdmin','admin'] },
  { slug:'performance-reviews', label:'Performance Reviews',    path:'/performance-reviews',    icon:UserCog, group:'HR & People',
    roles:['superAdmin','admin','supervisor','fom'] },
  { slug:'salary-increments',   label:'Salary Increments',      path:'/salary-increments',      icon:TrendingUp, group:'HR & People',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'training-certifications', label:'Training & Certifications', path:'/training-certifications', icon:GraduationCap, group:'HR & People',
    roles:['superAdmin','admin','supervisor','fom'] },
  { slug:'retainer-management', label:'Retainer Management',    path:'/retainer-management',    icon:ScrollText, group:'HR & People',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'payroll',             label:'Payroll',                path:'/payroll',                icon:Banknote, group:'HR & People',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'positions',           label:'Positions & Vacancies',  path:'/positions',              icon:Briefcase, group:'HR & People',
    roles:['superAdmin','admin'] },
  { slug:'salary-retainer-report', label:'Salary & Retainer Report', path:'/salary-retainer-report', icon:BarChart3, group:'HR & People',
    roles:['superAdmin','admin','financialAdmin'] },

  // ── CRM ───────────────────────────────────────────────────────────────────
  { slug:'crm',                 label:'CRM Hub',                path:'/crm',                    icon:Handshake, group:'CRM',
    roles:['superAdmin','admin','fom','projectManager','countryDirector','seniorOperationsLead'] },

  // ── Analytics & Reports ───────────────────────────────────────────────────
  { slug:'analytics-hub',       label:'Analytics Hub',          path:'/analytics',              icon:BarChart3, group:'Analytics',
    roles:['superAdmin','admin','fom','countryDirector','projectManager','seniorOperationsLead'], note:'Unified hub: Data Visibility, Reports, Documents' },
  { slug:'notification-analytics', label:'Notification Analytics', path:'/notification-analytics', icon:BarChart2, group:'Analytics',
    roles:['superAdmin','admin','ict'] },
  { slug:'data-export-center',  label:'Data Export Center',     path:'/data-export-center',     icon:BarChart3, group:'Analytics',
    roles:['superAdmin','admin'] },
  { slug:'data-visibility',     label:'Data Visibility',        path:'/data-visibility',        icon:Eye, group:'Analytics',
    roles:['superAdmin','admin'] },
  { slug:'reports',             label:'Reports',                path:'/reports',                icon:BarChart3, group:'Analytics',
    roles:['superAdmin','admin'] },
  { slug:'documents',           label:'Documents',              path:'/documents',              icon:FileText, group:'Analytics',
    roles:['superAdmin','admin','ict','financialAdmin','auditor'] },
  { slug:'archive',             label:'Archive',                path:'/archive',                icon:Archive, group:'Analytics',
    roles:['superAdmin','admin'] },
  { slug:'dct-pdm',             label:'DCT PDM Dashboard',      path:'/dct-pdm',                icon:BarChart3, group:'Analytics',
    roles:['superAdmin','admin','ict'] },
  { slug:'field-data',          label:'Field Data Hub',         path:'/field-data',             icon:Database, group:'Analytics',
    roles:['superAdmin','admin','fom','dataTeam'] },
  { slug:'executive',           label:'Executive Dashboard',    path:'/executive',              icon:BarChart2, group:'Analytics',
    roles:['superAdmin','countryDirector'] },

  // ── Surveys ───────────────────────────────────────────────────────────────
  { slug:'surveys',             label:'Surveys',                path:'/surveys',                icon:ClipboardEdit, group:'Surveys',
    roles:['all'] },
  { slug:'data-quality',        label:'Data Quality Control',   path:'/data-quality',           icon:PieChart, group:'Surveys',
    roles:['superAdmin','admin'] },
  { slug:'questionnaire-analytics', label:'Questionnaire Analytics', path:'/questionnaire-analytics', icon:PieChart, group:'Surveys',
    roles:['superAdmin','admin','fom','dataTeam'] },

  // ── Administration ────────────────────────────────────────────────────────
  { slug:'admin-hub',           label:'Admin Hub',              path:'/admin-hub',              icon:LayoutDashboard, group:'Administration',
    roles:['superAdmin','admin','ict'], note:'Unified admin interface' },
  { slug:'users',               label:'User Management',        path:'/users',                  icon:Users, group:'Administration',
    roles:['superAdmin','admin','ict'] },
  { slug:'departments',         label:'Departments',            path:'/departments',            icon:Building2, group:'Administration',
    roles:['superAdmin'] },
  { slug:'role-management',     label:'Role Management',        path:'/role-management',        icon:Shield, group:'Administration',
    roles:['superAdmin','admin'] },
  { slug:'classifications',     label:'Classifications',        path:'/classifications',        icon:Award, group:'Administration',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'classification-fees', label:'Classification Fees',    path:'/classification-fees',    icon:DollarSign, group:'Administration',
    roles:['superAdmin','admin'] },
  { slug:'task-admin',          label:'Task Admin',             path:'/task-admin',             icon:CheckSquare, group:'Administration',
    roles:['superAdmin','admin'] },
  { slug:'settings',            label:'Settings',               path:'/settings',               icon:BarChart3, group:'Administration',
    roles:['superAdmin','admin'] },
  { slug:'hub-management',      label:'Hub Management',         path:'/hub-management',         icon:Building, group:'Administration',
    roles:['superAdmin','admin'] },
  { slug:'integrations',        label:'Integrations',           path:'/integrations',           icon:PlugZap, group:'Administration',
    roles:['superAdmin','admin','ict'] },
  { slug:'permissions-management', label:'Permissions Management', path:'/permissions-management', icon:Key, group:'Administration',
    roles:['superAdmin'] },
  { slug:'role-perspective',    label:'Role Perspective',       path:'/role-perspective',       icon:Eye, group:'Administration',
    roles:['superAdmin','admin'] },
  { slug:'documentation',       label:'Documentation',          path:'/documentation',          icon:BookOpen, group:'Administration',
    roles:['all'] },
  { slug:'mobile-documentation',label:'Mobile Documentation',   path:'/mobile-documentation',   icon:Smartphone, group:'Administration',
    roles:['all'] },
  { slug:'public-documentation',label:'Public Documentation',   path:'/public-documentation',   icon:Globe, group:'Administration',
    roles:['superAdmin','admin','ict'] },
  { slug:'changelog',           label:'Changelog',              path:'/changelog',              icon:History, group:'Administration',
    roles:['superAdmin','admin','ict'] },
  { slug:'page-access',         label:'Page Access Control',    path:'/page-access',            icon:Lock, group:'Administration',
    roles:['superAdmin'] },
  { slug:'system-diagrams',     label:'System Diagrams',        path:'/system-diagrams',        icon:GitBranch, group:'Administration',
    roles:['superAdmin'] },
  { slug:'helpline',            label:'Helpline',               path:'/helpline',               icon:Phone, group:'Administration',
    roles:['superAdmin','admin'] },
  { slug:'support-contacts',    label:'Support Contacts',       path:'/support-contacts',       icon:Phone, group:'Administration',
    roles:['superAdmin','admin','ict'] },
  { slug:'mobile-support-tickets', label:'Mobile Support Tickets', path:'/mobile-support-tickets', icon:Smartphone, group:'Administration',
    roles:['superAdmin','admin','ict'] },
  { slug:'staff-directory',     label:'Staff Directory',        path:'/admin/staff-profiles',   icon:Users, group:'Administration',
    roles:['superAdmin','admin'] },

  // ── Super Admin Hub & Tabs ────────────────────────────────────────────────
  // Hub page itself
  { slug:'super-admin-hub',     label:'Super Admin Hub',        path:'/super-admin-hub',        icon:Shield, group:'Super Admin',
    roles:['superAdmin'], note:'The hub — grants page-level entry; individual tabs are managed via Tab Access or Page Grants' },

  // Monitoring & Health section
  { slug:'sa-console',          label:'Super Admin Console',    path:'/super-admin-hub?tab=super-admin', icon:Shield, group:'Super Admin',
    roles:['superAdmin'] },
  { slug:'admin-monitoring',    label:'System Monitoring',      path:'/super-admin-hub?tab=system-monitoring', icon:Activity, group:'Super Admin',
    roles:['superAdmin'] },
  { slug:'cycle-health',        label:'Cycle Health Dashboard', path:'/super-admin-hub?tab=cycle-health', icon:Activity, group:'Super Admin',
    roles:['superAdmin','admin'] },
  { slug:'sa-approval-dashboard', label:'Approval Dashboard (SA Hub)', path:'/super-admin-hub?tab=approval-dashboard', icon:ClipboardCheck, group:'Super Admin',
    roles:['superAdmin','admin'], note:'Live URL for Approval Dashboard. Linked with Finance Approval Dashboard — grants cascade together.' },

  // Permissions & Audit section
  { slug:'sa-permissions-mgmt', label:'User Access (SA)',       path:'/super-admin-hub?tab=user-access', icon:Lock, group:'Super Admin',
    roles:['superAdmin'], note:'Canonical Users workspace. Legacy Screen Permissions and Page Grants URLs redirect here.' },
  { slug:'sa-audit-logs',       label:'System Audit Logs (SA)', path:'/super-admin-hub?tab=audit-logs', icon:ScrollText, group:'Super Admin',
    roles:['superAdmin','admin'] },
  { slug:'sa-button-registry',  label:'Button Registry',        path:'/super-admin-hub?tab=button-registry', icon:LayoutList, group:'Super Admin',
    roles:['superAdmin'] },

  // Email & Comms section
  { slug:'sa-email-tracking',   label:'Email Tracking (SA)',    path:'/super-admin-hub?tab=email-tracking', icon:Mail, group:'Super Admin',
    roles:['superAdmin','admin'] },
  { slug:'sa-email-management', label:'Email Management',       path:'/super-admin-hub?tab=email-management', icon:Mail, group:'Super Admin',
    roles:['superAdmin'] },
  { slug:'sa-email-preview',    label:'Email Preview',          path:'/super-admin-hub?tab=email-preview', icon:Eye, group:'Super Admin',
    roles:['superAdmin'] },

  // Mobile Config section
  { slug:'sa-mobile-help',      label:'Mobile Help Articles',   path:'/super-admin-hub?tab=mobile-help-articles', icon:Smartphone, group:'Super Admin',
    roles:['superAdmin'] },
  { slug:'sa-mobile-signatures',label:'Mobile Signatures (SA)', path:'/super-admin-hub?tab=mobile-signatures', icon:Smartphone, group:'Super Admin',
    roles:['superAdmin'] },
  { slug:'sa-call-scheduling',  label:'Call Scheduling (SA)',   path:'/super-admin-hub?tab=mobile-call-scheduling', icon:Smartphone, group:'Super Admin',
    roles:['superAdmin'] },
  { slug:'sa-doc-sync',         label:'Document Sync (SA)',     path:'/super-admin-hub?tab=mobile-document-sync', icon:Smartphone, group:'Super Admin',
    roles:['superAdmin'] },

  // Data & Tools section
  { slug:'transaction-scanner', label:'Transaction Scanner',    path:'/super-admin-hub?tab=transaction-scanner', icon:ScanLine, group:'Super Admin',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'data-management',    label:'Data Management',         path:'/super-admin-hub?tab=data-management', icon:Database, group:'Super Admin',
    roles:['superAdmin'], note:'Raw data console — bulk imports, corrections, table-level ops inside Super Admin Hub' },

  // Standalone super admin pages (not hub tabs)
  { slug:'recycle-bin',         label:'Recycle Bin',            path:'/recycle-bin',            icon:Archive, group:'Super Admin',
    roles:['superAdmin'] },
  { slug:'project-flow-stages', label:'Project Flow Stages',    path:'/admin/project-flow-stages', icon:GitBranch, group:'Super Admin',
    roles:['superAdmin'] },

  // ── Audit & Security ──────────────────────────────────────────────────────
  { slug:'hierarchy-audit',     label:'Hierarchy Audit',        path:'/hierarchy-audit',        icon:History, group:'Audit & Security',
    roles:['superAdmin','admin'] },
  { slug:'audit-compliance',    label:'Audit & Compliance',     path:'/audit-compliance',       icon:ClipboardCheck, group:'Audit & Security',
    roles:['superAdmin','admin','auditor'] },
  { slug:'audit-logs',          label:'System Audit Logs',      path:'/audit-logs',             icon:ScrollText, group:'Audit & Security',
    roles:['superAdmin','admin','auditor'] },
  { slug:'login-analytics',     label:'Login Analytics',        path:'/login-analytics',        icon:BarChart2, group:'Audit & Security',
    roles:['superAdmin','admin'] },
];

// ── PAGE_GROUPS (ordered sidebar groups) ─────────────────────────────────────
export const PAGE_GROUPS = [
  'My Workspace', 'Communication', 'Programme Management', 'Field Operations',
  'Coordination', 'Finance', 'Accounting', 'HR & People', 'CRM', 'Analytics',
  'Surveys', 'Administration', 'Super Admin', 'Audit & Security',
];

/**
 * Presentation metadata for navigation targets.  This deliberately lives next
 * to PAGE_DEFS: a page's access group must not need a second, divergent map in
 * the sidebar before it can be surfaced for an explicit grant.
 */
export const PAGE_NAVIGATION_GROUPS: Record<string, { id: string; label: string; order: number }> = {
  'My Workspace': { id: 'workspace-parent', label: 'My Workspace', order: 1 },
  'Communication': { id: 'comms-parent', label: 'Communication', order: 3 },
  'Programme Management': { id: 'programme-parent', label: 'Programme Management', order: 2 },
  'Field Operations': { id: 'fieldops-parent', label: 'Field Operations', order: 4 },
  'Coordination': { id: 'coordination-parent', label: 'Coordination', order: 5 },
  'Finance': { id: 'finance-parent', label: 'Finance', order: 6 },
  'Accounting': { id: 'accounting-parent', label: 'Accounting', order: 7 },
  'HR & People': { id: 'hr-parent', label: 'HR & People', order: 8 },
  'CRM': { id: 'crm-parent', label: 'CRM', order: 9 },
  'Analytics': { id: 'analytics-parent', label: 'Analytics', order: 10 },
  'Surveys': { id: 'surveys-parent', label: 'Surveys', order: 11 },
  'Administration': { id: 'admin-parent', label: 'Administration', order: 12 },
  'Super Admin': { id: 'superadmin-parent', label: 'Super Admin', order: 13 },
  // Audit pages remain inside the administrative shell until the sidebar gets
  // its own audit parent; keeping that decision here prevents a hidden fallback.
  'Audit & Security': { id: 'admin-parent', label: 'Audit & Security', order: 14 },
};

export function getPageDefinition(slug: string): PageDef | undefined {
  return PAGE_DEFS.find(page => page.slug === slug);
}

export function getPageNavigationGroup(group: string) {
  return PAGE_NAVIGATION_GROUPS[group];
}

export interface PageRegistryIssue {
  type: 'duplicate_slug' | 'duplicate_target' | 'missing_navigation_group';
  value: string;
  slugs: string[];
}

function normalizedPageTarget(path: string): string {
  const [pathname, query = ''] = path.split('?', 2);
  if (!query) return pathname;
  const params = [...new URLSearchParams(query).entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
    );
  return `${pathname}?${new URLSearchParams(params).toString()}`;
}

/**
 * Registry validation is pure so it can run in CI without rendering the page.
 * It catches the two ambiguous states that previously degraded silently:
 * duplicate slugs and semantically identical query-string navigation targets.
 */
export function getPageRegistryIssues(definitions: readonly PageDef[] = PAGE_DEFS): PageRegistryIssue[] {
  const issues: PageRegistryIssue[] = [];
  const collectDuplicates = (values: Array<{ key: string; slug: string }>, type: PageRegistryIssue['type']) => {
    // `Map` is also imported above as a Lucide icon. Use the global explicitly
    // so registry validation is safe in the browser and in the test runner.
    const grouped = new globalThis.Map<string, string[]>();
    for (const { key, slug } of values) grouped.set(key, [...(grouped.get(key) ?? []), slug]);
    for (const [value, slugs] of grouped) {
      if (slugs.length > 1) issues.push({ type, value, slugs });
    }
  };

  collectDuplicates(definitions.map(page => ({ key: page.slug, slug: page.slug })), 'duplicate_slug');
  collectDuplicates(definitions.map(page => ({ key: normalizedPageTarget(page.path), slug: page.slug })), 'duplicate_target');

  for (const page of definitions) {
    if (!PAGE_NAVIGATION_GROUPS[page.group]) {
      issues.push({ type: 'missing_navigation_group', value: page.group, slugs: [page.slug] });
    }
  }
  return issues;
}

export const PAGE_ROLE_ALL_OPTIONS = [
  'all', 'superAdmin', 'admin', 'ict', 'fom', 'financialAdmin', 'auditor',
  'supervisor', 'coordinator', 'dataCollector', 'dataTeam', 'reviewer',
  'projectManager', 'countryDirector', 'seniorOperationsLead', '!dataCollector',
];

