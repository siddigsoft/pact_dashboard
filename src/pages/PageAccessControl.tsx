import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { normalizeRole } from '@/utils/roleMapping';
import {
  LayoutDashboard, CheckSquare, FolderOpen, FolderKanban, Compass,
  Users, Shield, Handshake, CalendarOff, Activity, Building2,
  BarChart3, MessageSquare, Calendar, Bell, Search, UserX, UserCheck,
  ChevronRight, Info, Lock, Unlock, Loader2, CreditCard, Banknote,
  FileText, Archive, Map, ClipboardList, Database, ClipboardCheck,
  TrendingUp, Receipt, DollarSign, Siren, AlertTriangle, Package,
  ScrollText, Award,
  // Additional icons for extended page coverage
  Phone, Mail, Calculator, Landmark, Briefcase, GraduationCap,
  CalendarCheck, PieChart, LineChart, Target, Globe, RefreshCcw,
  Coins, ListChecks, Plug, History, HeartHandshake, Zap, Smartphone,
  BookOpen, Building, UserCog, Layers, GitBranch, BarChart2,
  ScanLine, Eye, Key, PlugZap, Megaphone, ClipboardEdit,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ── Role code constants (matching normalizeRole() output exactly) ─────────────
//  superAdmin | admin | ict | fom | financialAdmin | auditor | supervisor
//  coordinator | dataCollector | dataTeam | reviewer | projectManager | countryDirector

interface PageDef {
  slug: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
  roles: string[];   // 'all' | '!dataCollector' | RoleCode strings
  note?: string;
}

export const PAGE_DEFS: PageDef[] = [
  // ── My Workspace ──────────────────────────────────────────────────────────
  { slug:'dashboard',           label:'Dashboard',              path:'/dashboard',              icon:LayoutDashboard, group:'My Workspace',
    roles:['superAdmin','admin','ict'], note:'Also accessible via custom "dashboard" permission' },
  { slug:'my-tasks',            label:'My Tasks',               path:'/my-tasks',               icon:CheckSquare, group:'My Workspace',
    roles:['all'] },
  { slug:'calendar',            label:'Calendar',               path:'/calendar',               icon:Calendar, group:'My Workspace',
    roles:['!dataCollector'], note:'All roles except Data Collector' },
  { slug:'notifications',       label:'Notifications',          path:'/notifications',          icon:Bell, group:'My Workspace',
    roles:['all'] },
  { slug:'workspace',           label:'Workspace Hub',          path:'/workspace',              icon:FolderOpen, group:'My Workspace',
    roles:['all'], note:'Sidebar visible to all, but entry requires explicit Workspace Access Grant' },

  // ── Communication ─────────────────────────────────────────────────────────
  { slug:'chat',                label:'Chat',                   path:'/chat',                   icon:MessageSquare, group:'Communication',
    roles:['all'] },
  { slug:'signatures',          label:'Signatures',             path:'/signatures',             icon:ScrollText, group:'Communication',
    roles:['superAdmin','admin','ict','fom','coordinator','supervisor','financialAdmin','auditor'] },
  { slug:'broadcast',           label:'Broadcast Center',       path:'/admin/broadcast',        icon:Bell, group:'Communication',
    roles:['superAdmin','admin'] },
  { slug:'whatsapp-admin',      label:'WhatsApp Settings',      path:'/admin/whatsapp',         icon:MessageSquare, group:'Communication',
    roles:['superAdmin'] },

  // ── Programme Management ──────────────────────────────────────────────────
  { slug:'projects',            label:'Projects',               path:'/projects',               icon:FolderKanban, group:'Programme Management',
    roles:['superAdmin'], note:'Super Admin only' },
  { slug:'portfolio',           label:'Portfolio Dashboard',    path:'/portfolio',              icon:LayoutDashboard, group:'Programme Management',
    roles:['superAdmin','admin','fom'], note:'Also via custom "projects" permission' },
  { slug:'mmp',                 label:'MMP Management',         path:'/mmp',                    icon:Database, group:'Programme Management',
    roles:['superAdmin','admin','ict','dataTeam','fom','coordinator','supervisor','dataCollector'], note:'Also via custom "mmp" permission' },
  { slug:'hub-operations',      label:'Hub Operations',         path:'/hub-operations',         icon:Building2, group:'Programme Management',
    roles:['superAdmin','admin'] },

  // ── Field Operations ──────────────────────────────────────────────────────
  { slug:'site-visits',         label:'Site Visits',            path:'/site-visits',            icon:ClipboardList, group:'Field Operations',
    roles:['superAdmin','admin','ict'], note:'Also via custom "siteVisits" permission' },
  { slug:'monitoring-form',     label:'Monitoring Form',        path:'/monitoring-form',        icon:ClipboardCheck, group:'Field Operations',
    roles:['superAdmin','admin','dataCollector','coordinator','supervisor','fom'] },
  { slug:'safety-hub',          label:'Safety Hub',             path:'/safety-hub',             icon:Siren, group:'Field Operations',
    roles:['superAdmin','admin','ict','fom','coordinator','supervisor','dataCollector','dataTeam'] },
  { slug:'incident-reports',    label:'Incident Reports',       path:'/incident-reports',       icon:AlertTriangle, group:'Field Operations',
    roles:['superAdmin','admin','ict','fom','coordinator','supervisor','dataTeam'] },
  { slug:'equipment',           label:'Equipment Tracking',     path:'/equipment',              icon:Package, group:'Field Operations',
    roles:['superAdmin','admin','fom'] },
  { slug:'field-team',          label:'Field Team',             path:'/field-team',             icon:Users, group:'Field Operations',
    roles:['superAdmin','admin'], note:'Admin excludes ICT. Also via custom "fieldTeam" permission' },
  { slug:'map',                 label:'Field Map',              path:'/map',                    icon:Map, group:'Field Operations',
    roles:['superAdmin','admin','fom'] },
  { slug:'field-operation-manager', label:'Field Operation Manager', path:'/field-operation-manager', icon:Compass, group:'Field Operations',
    roles:['superAdmin','admin','fom'] },

  // ── Coordination & Oversight ──────────────────────────────────────────────
  { slug:'coordinator-sites',   label:'Site Verification',      path:'/coordinator/sites',      icon:CheckSquare, group:'Coordination',
    roles:['superAdmin','coordinator','supervisor'] },
  { slug:'cycle-management',    label:'Cycle Management',       path:'/mmp/cycle-close',        icon:Activity, group:'Coordination',
    roles:['superAdmin','admin','fom','supervisor'] },
  { slug:'staff-directory',     label:'Staff Directory',        path:'/admin/staff-profiles',   icon:Users, group:'Coordination',
    roles:['superAdmin','admin'] },

  // ── Payments & Finance ────────────────────────────────────────────────────
  { slug:'wallet',              label:'My Wallet',              path:'/wallet',                 icon:CreditCard, group:'Finance',
    roles:['financialAdmin','auditor','fom','supervisor','dataCollector','coordinator'] },
  { slug:'cost-submission',     label:'Cost Submission',        path:'/cost-submission',        icon:Receipt, group:'Finance',
    roles:['superAdmin','admin','supervisor','fom','coordinator','dataTeam'] },
  { slug:'tier1-approvals',     label:'Tier 1 Approvals',       path:'/supervisor-approvals',   icon:ClipboardCheck, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor','supervisor','fom'] },
  { slug:'tier2-approvals',     label:'Tier 2 Approvals',       path:'/withdrawal-approval',    icon:ClipboardCheck, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'finance-processing',  label:'Finance Processing',     path:'/finance-approval',       icon:Banknote, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'budget',              label:'Budget',                 path:'/budget',                 icon:DollarSign, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'wallets-admin',       label:'Wallets Admin',          path:'/admin/wallets',          icon:CreditCard, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'financial-operations',label:'Financial Operations',   path:'/financial-operations',   icon:TrendingUp, group:'Finance',
    roles:['superAdmin'], note:'Also via custom "financialOperations" permission' },

  // ── HR & People ───────────────────────────────────────────────────────────
  { slug:'hr-admin',            label:'HR Hub (Payroll/Admin)', path:'/hr',                     icon:Users, group:'HR & People',
    roles:['superAdmin','admin','financialAdmin'], note:'Payroll, Retainer, Performance & Salary tabs' },
  { slug:'hr-timesheet',        label:'Timesheet',              path:'/hr?tab=timesheet',       icon:ClipboardCheck, group:'HR & People',
    roles:['all'] },
  { slug:'hr-payslip',          label:'My Payslip',             path:'/hr?tab=payroll',         icon:Receipt, group:'HR & People',
    roles:['all'] },
  { slug:'leave',               label:'Leave Requests',         path:'/leave',                  icon:CalendarOff, group:'HR & People',
    roles:['all'] },

  // ── CRM ───────────────────────────────────────────────────────────────────
  { slug:'crm',                 label:'CRM Hub',                path:'/crm',                    icon:Handshake, group:'CRM',
    roles:['superAdmin','admin','fom','projectManager','countryDirector'] },

  // ── Analytics & Reports ───────────────────────────────────────────────────
  { slug:'data-export-center',  label:'Data Export Center',     path:'/data-export-center',     icon:BarChart3, group:'Analytics',
    roles:['superAdmin','admin'] },
  { slug:'data-visibility',     label:'Data Visibility',        path:'/data-visibility',        icon:BarChart3, group:'Analytics',
    roles:['superAdmin','admin'], note:'Admin excludes ICT. Also via custom "dataVisibility" permission' },
  { slug:'reports',             label:'Reports',                path:'/reports',                icon:BarChart3, group:'Analytics',
    roles:['superAdmin','admin'], note:'Admin excludes ICT. Also via custom "reports" permission' },
  { slug:'documents',           label:'Documents',              path:'/documents',              icon:FileText, group:'Analytics',
    roles:['superAdmin','admin','ict','financialAdmin','auditor'] },
  { slug:'archive',             label:'Archive',                path:'/archive',                icon:Archive, group:'Analytics',
    roles:['superAdmin','admin'], note:'Also via custom "archive" permission' },
  { slug:'dct-pdm',             label:'DCT PDM Dashboard',      path:'/dct-pdm',                icon:BarChart3, group:'Analytics',
    roles:['superAdmin','admin','ict'] },

  // ── Administration ────────────────────────────────────────────────────────
  { slug:'users',               label:'User Management',        path:'/users',                  icon:Users, group:'Administration',
    roles:['superAdmin','admin','ict'], note:'Also via custom "users" permission' },
  { slug:'departments',         label:'Departments',            path:'/departments',            icon:Building2, group:'Administration',
    roles:['superAdmin'] },
  { slug:'role-management',     label:'Role Management',        path:'/role-management',        icon:Shield, group:'Administration',
    roles:['superAdmin','admin'], note:'Also via custom "roleManagement" permission' },
  { slug:'classifications',     label:'Classifications',        path:'/classifications',        icon:Award, group:'Administration',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'classification-fees', label:'Classification Fees',    path:'/classification-fees',    icon:DollarSign, group:'Administration',
    roles:['superAdmin','admin'] },
  { slug:'task-admin',          label:'Task Admin',             path:'/task-admin',             icon:CheckSquare, group:'Administration',
    roles:['superAdmin','admin'] },
  { slug:'settings',            label:'Settings',               path:'/settings',               icon:BarChart3, group:'Administration',
    roles:['superAdmin','admin'], note:'Admin excludes Data Collector. Also via custom "settings" permission' },
  { slug:'hub-management',      label:'Hub Management',         path:'/hub-management',         icon:Building, group:'Administration',
    roles:['superAdmin','admin'] },
  { slug:'integrations',        label:'Integrations',           path:'/integrations',           icon:PlugZap, group:'Administration',
    roles:['superAdmin','admin','ict'] },
  { slug:'permissions-management', label:'Permissions Management', path:'/permissions-management', icon:Key, group:'Administration',
    roles:['superAdmin'] },
  { slug:'role-perspective',    label:'Role Perspective',       path:'/role-perspective',       icon:Eye, group:'Administration',
    roles:['superAdmin','admin'] },
  { slug:'super-admin-data',    label:'Super Admin Data',       path:'/super-admin-data',       icon:Database, group:'Administration',
    roles:['superAdmin'] },
  { slug:'super-admin-management', label:'Super Admin Management', path:'/super-admin-management', icon:Shield, group:'Administration',
    roles:['superAdmin'] },
  { slug:'subscriptions',       label:'Subscriptions',          path:'/subscriptions',          icon:CreditCard, group:'Administration',
    roles:['superAdmin'] },
  { slug:'changelog',           label:'Changelog',              path:'/changelog',              icon:History, group:'Administration',
    roles:['superAdmin','admin','ict'] },
  { slug:'page-access',         label:'Page Access Control',    path:'/page-access',            icon:Lock, group:'Administration',
    roles:['superAdmin'] },
  { slug:'search',              label:'Global Search',          path:'/search',                 icon:Search, group:'Administration',
    roles:['all'] },

  // ── Super Admin Pages ─────────────────────────────────────────────────────
  { slug:'cycle-health',        label:'Cycle Health Dashboard', path:'/admin/cycle-health',     icon:Activity, group:'Super Admin',
    roles:['superAdmin','admin'] },
  { slug:'admin-monitoring',    label:'System Monitoring',      path:'/admin/monitoring',       icon:BarChart3, group:'Super Admin',
    roles:['superAdmin'] },
  { slug:'project-flow-stages', label:'Project Flow Stages',    path:'/admin/project-flow-stages', icon:GitBranch, group:'Super Admin',
    roles:['superAdmin'] },
  { slug:'transaction-scanner', label:'Transaction Scanner',    path:'/admin/transaction-scanner', icon:ScanLine, group:'Super Admin',
    roles:['superAdmin','admin','financialAdmin'] },

  // ── Audit & Security ──────────────────────────────────────────────────────
  { slug:'hierarchy-audit',     label:'Hierarchy Audit',        path:'/hierarchy-audit',        icon:History, group:'Audit & Security',
    roles:['superAdmin','admin'] },
  { slug:'audit-compliance',    label:'Audit & Compliance',     path:'/audit-compliance',       icon:ClipboardCheck, group:'Audit & Security',
    roles:['superAdmin','admin','auditor'] },
  { slug:'audit-logs',          label:'System Audit Logs',      path:'/audit-logs',             icon:ScrollText, group:'Audit & Security',
    roles:['superAdmin','admin','auditor'] },
  { slug:'login-analytics',     label:'Login Analytics',        path:'/login-analytics',        icon:BarChart2, group:'Audit & Security',
    roles:['superAdmin','admin'] },

  // ── Surveys ───────────────────────────────────────────────────────────────
  { slug:'surveys',             label:'Surveys',                path:'/surveys',                icon:ClipboardEdit, group:'Surveys',
    roles:['superAdmin','admin','ict','fom','coordinator','supervisor','dataCollector','dataTeam'] },
  { slug:'questionnaire-analytics', label:'Questionnaire Analytics', path:'/questionnaire-analytics', icon:PieChart, group:'Surveys',
    roles:['superAdmin','admin','fom','dataTeam'] },

  // ── Daily Work & Team Tasks ────────────────────────────────────────────────
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

  // ── Field Operations additions ─────────────────────────────────────────────
  { slug:'coordinator-dashboard', label:'Coordinator Dashboard', path:'/coordinator-dashboard', icon:LayoutDashboard, group:'Field Operations',
    roles:['superAdmin','admin','fom','coordinator','supervisor'] },
  { slug:'sites-for-verification', label:'Sites for Verification', path:'/coordinator/sites-for-verification', icon:ClipboardCheck, group:'Field Operations',
    roles:['superAdmin','admin','coordinator','supervisor'] },
  { slug:'supervisor-sites',    label:'Supervisor Sites',       path:'/supervisor/sites',       icon:Map, group:'Field Operations',
    roles:['superAdmin','admin','supervisor','fom'] },
  { slug:'monitoring-plan',     label:'Monitoring Plan',        path:'/monitoring-plan',        icon:ClipboardList, group:'Field Operations',
    roles:['superAdmin','admin','fom','coordinator','supervisor'] },
  { slug:'tracker-preparation', label:'Tracker Preparation Plan', path:'/tracker-preparation-plan', icon:Target, group:'Field Operations',
    roles:['superAdmin','admin','fom','coordinator'] },
  { slug:'advanced-map',        label:'Advanced Map',           path:'/advanced-map',           icon:Map, group:'Field Operations',
    roles:['superAdmin','admin','fom'] },
  { slug:'mmp-management',      label:'MMP Management Admin',   path:'/mmp-management',         icon:Database, group:'Field Operations',
    roles:['superAdmin','admin','ict'] },

  // ── Finance & Approvals additions ─────────────────────────────────────────
  { slug:'finance-dashboard',   label:'Finance Dashboard',      path:'/finance',                icon:TrendingUp, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'finance-audit-trail', label:'Finance Audit Trail',    path:'/finance/audit-trail',    icon:ScrollText, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'approval-dashboard',  label:'Approval Dashboard',     path:'/approval-dashboard',     icon:ClipboardCheck, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','supervisor','fom'] },
  { slug:'approvals',           label:'Approvals',              path:'/approvals',              icon:ListChecks, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','supervisor','fom'] },
  { slug:'reconciliation-dashboard', label:'Reconciliation Dashboard', path:'/reconciliation-dashboard', icon:RefreshCcw, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'advance-requests-report', label:'Advance Requests Report', path:'/advance-requests-report', icon:BarChart3, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'down-payment-advance-report', label:'Down Payment Report', path:'/down-payment-advance-report', icon:Receipt, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'down-payment-approval', label:'Down Payment Approval', path:'/down-payment-approval', icon:ClipboardCheck, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'cost-approval',       label:'Cost Approval',          path:'/cost-approval',          icon:ClipboardCheck, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'cost-predictions',    label:'Cost Predictions',       path:'/cost-predictions',       icon:LineChart, group:'Finance',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'cost-submission-reports', label:'Cost Submission Reports', path:'/cost-submission/reports', icon:BarChart3, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'enumerator-fees-report', label:'Enumerator Fees Report', path:'/enumerator-fees-report', icon:Receipt, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'month-end-summary',   label:'Month-End Summary',      path:'/month-end-summary',      icon:BarChart3, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'wallet-reports',      label:'Wallet Reports',         path:'/wallet-reports',         icon:CreditCard, group:'Finance',
    roles:['superAdmin','admin','financialAdmin','auditor'] },
  { slug:'exchange-rates',      label:'Exchange Rates',         path:'/exchange-rates',         icon:Coins, group:'Finance',
    roles:['superAdmin','admin','financialAdmin'] },
  { slug:'pdm-report',          label:'PDM Report',             path:'/pdm-report',             icon:BarChart3, group:'Finance',
    roles:['superAdmin','admin','fom','dataTeam'] },

  // ── Accounting Module ──────────────────────────────────────────────────────
  { slug:'acct-dashboard',      label:'Accounting Dashboard',   path:'/accounting/finance-dashboard', icon:Landmark, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-coa',            label:'Chart of Accounts',      path:'/accounting/coa',         icon:Layers, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-journals',       label:'Journal Entries',        path:'/accounting/journals',    icon:BookOpen, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-ledger',         label:'General Ledger',         path:'/accounting/ledger',      icon:ScrollText, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-trial-balance',  label:'Trial Balance',          path:'/accounting/trial-balance', icon:BarChart2, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-reports',        label:'Financial Statements',   path:'/accounting/reports',     icon:FileText, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-bank-recon',     label:'Bank Reconciliation',    path:'/accounting/bank-recon',  icon:RefreshCcw, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-budget-planning',label:'Budget Planning',        path:'/accounting/budget-planning', icon:Calculator, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-budget-variance',label:'Budget Variance',        path:'/accounting/budget-variance', icon:TrendingUp, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-budget-enc',     label:'Budget Encumbrance',     path:'/accounting/budget-encumbrance', icon:DollarSign, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-fixed-assets',   label:'Fixed Assets',          path:'/accounting/fixed-assets', icon:Building2, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-depreciation',   label:'Depreciation Run',       path:'/accounting/depreciation-run', icon:TrendingUp, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-pr',             label:'Purchase Requisitions',  path:'/accounting/purchase-requisitions', icon:ClipboardList, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin','auditor','fom'] },
  { slug:'acct-po',             label:'Purchase Orders',        path:'/accounting/purchase-orders', icon:Package, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin','auditor','fom'] },
  { slug:'acct-grn',            label:'Goods Receipt Notes',    path:'/accounting/grn',         icon:Package, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin','auditor','fom'] },
  { slug:'acct-ap-invoices',    label:'AP Invoices',            path:'/accounting/ap-invoices', icon:Receipt, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-ap-aging',       label:'AP Aging Report',        path:'/accounting/ap-aging',    icon:BarChart3, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-cheque',         label:'Cheque Register',        path:'/accounting/cheque-register', icon:ScrollText, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-vendors',        label:'Vendors',                path:'/accounting/vendors',     icon:Briefcase, group:'Accounting',
    roles:['superAdmin','admin','financialAdmin','auditor','fom'] },
  { slug:'acct-funds',          label:'Fund Registry',          path:'/accounting/funds',       icon:Landmark, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-gl-bridge',      label:'GL Bridge Engine',       path:'/accounting/gl-bridge',   icon:Zap, group:'Accounting',
    roles:['superAdmin','financialAdmin'] },
  { slug:'acct-period-close',   label:'Period Close',           path:'/accounting/period-close', icon:Lock, group:'Accounting',
    roles:['superAdmin','financialAdmin'] },
  { slug:'acct-tax',            label:'Tax Management',         path:'/accounting/tax',         icon:Calculator, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-multi-currency', label:'Multi-Currency',         path:'/accounting/multi-currency', icon:Globe, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-cost-allocation',label:'Cost Allocation',        path:'/accounting/cost-allocation', icon:Layers, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-donor-reports',  label:'Donor Reports',          path:'/accounting/donor-reports', icon:BarChart3, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-grants',         label:'Grant Tracking',         path:'/accounting/grants',      icon:Award, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-consolidation',  label:'Financial Consolidation', path:'/accounting/consolidation', icon:Layers, group:'Accounting',
    roles:['superAdmin','financialAdmin'] },
  { slug:'acct-intercompany',   label:'Intercompany',           path:'/accounting/intercompany', icon:GitBranch, group:'Accounting',
    roles:['superAdmin','financialAdmin'] },
  { slug:'acct-sod',            label:'Segregation of Duties',  path:'/accounting/sod',         icon:Shield, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-cash-flow',      label:'Cash Flow',              path:'/accounting/cash-flow',   icon:TrendingUp, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-cash-forecast',  label:'Cash Flow Forecast',     path:'/accounting/cash-flow-forecast', icon:LineChart, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-gl-audit',       label:'GL Audit',               path:'/accounting/gl-audit',    icon:ScrollText, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-aml',            label:'AML',                    path:'/accounting/aml',         icon:AlertTriangle, group:'Accounting',
    roles:['superAdmin','financialAdmin','auditor'] },
  { slug:'acct-fiscal-years',   label:'Fiscal Years & Periods', path:'/accounting/fiscal-years', icon:Calendar, group:'Accounting',
    roles:['superAdmin','financialAdmin'] },
  { slug:'acct-settings',       label:'Accounting Settings',    path:'/accounting/settings',    icon:BarChart3, group:'Accounting',
    roles:['superAdmin','financialAdmin'] },

  // ── Communication additions ────────────────────────────────────────────────
  { slug:'email-management',    label:'Email Management',       path:'/email-management',       icon:Mail, group:'Communication',
    roles:['superAdmin','admin'] },
  { slug:'email-tracking',      label:'Email Tracking',         path:'/email-tracking',         icon:Mail, group:'Communication',
    roles:['superAdmin','admin'] },
  { slug:'email-preview',       label:'Email Preview',          path:'/email-preview',          icon:Mail, group:'Communication',
    roles:['superAdmin','admin'] },
  { slug:'helpline',            label:'Helpline',               path:'/helpline',               icon:HeartHandshake, group:'Communication',
    roles:['superAdmin','admin','ict','fom','coordinator','supervisor'] },
  { slug:'calls',               label:'Calls',                  path:'/calls',                  icon:Phone, group:'Communication',
    roles:['superAdmin','admin','fom','coordinator','supervisor'] },
  { slug:'call-analytics',      label:'Call Analytics',         path:'/call-analytics',         icon:PieChart, group:'Communication',
    roles:['superAdmin','admin','fom'] },
  { slug:'support-contacts',    label:'Support Contacts',       path:'/support-contacts',       icon:Phone, group:'Communication',
    roles:['all'] },
  { slug:'mobile-support',      label:'Mobile Support Tickets', path:'/mobile-support-tickets', icon:Smartphone, group:'Communication',
    roles:['superAdmin','admin','ict'] },
  { slug:'notification-analytics', label:'Notification Analytics', path:'/notification-analytics', icon:Bell, group:'Communication',
    roles:['superAdmin','admin'] },
  { slug:'notification-history',label:'Notification History',   path:'/notification-history',   icon:Bell, group:'Communication',
    roles:['superAdmin','admin'] },
  { slug:'notification-preferences', label:'Notification Preferences', path:'/notification-preferences', icon:Bell, group:'Communication',
    roles:['all'] },

  // ── Analytics & Projects additions ────────────────────────────────────────
  { slug:'project-analytics',   label:'Project Analytics',      path:'/projects/analytics',     icon:BarChart3, group:'Analytics',
    roles:['superAdmin','admin','fom','projectManager','countryDirector'] },
  { slug:'documentation',       label:'Documentation',          path:'/documentation',          icon:BookOpen, group:'Analytics',
    roles:['all'] },

  // ── Mobile Pages ─────────────────────────────────────────────────────────
  { slug:'mobile-cost-submission', label:'Mobile Cost Submission', path:'/mobile-cost-submission', icon:Smartphone, group:'Mobile',
    roles:['superAdmin','admin','dataCollector','coordinator','supervisor'] },
  { slug:'mobile-signatures',   label:'Mobile Signatures',      path:'/mobile-signatures',      icon:Smartphone, group:'Mobile',
    roles:['superAdmin','admin','dataCollector','coordinator','supervisor'] },
  { slug:'mobile-documentation',label:'Mobile Documentation',   path:'/mobile-documentation',   icon:Smartphone, group:'Mobile',
    roles:['all'] },
  { slug:'mobile-help-articles',label:'Mobile Help Articles',   path:'/mobile-help-articles',   icon:Smartphone, group:'Mobile',
    roles:['all'] },
  { slug:'mobile-call-scheduling', label:'Mobile Call Scheduling', path:'/mobile-call-scheduling', icon:Smartphone, group:'Mobile',
    roles:['superAdmin','admin','fom','coordinator','supervisor'] },
];

const PAGE_GROUPS = Array.from(new Set(PAGE_DEFS.map(p => p.group)));

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Profile {
  id: string;
  full_name: string | null;
  role: string | null;
}
export interface PageOverride {
  id: string;
  page_slug: string;
  user_id: string;
  is_blocked: boolean;
  notes: string | null;
  created_at: string;
}

// ── Role display ──────────────────────────────────────────────────────────────
const ROLE_COLORS: Record<string, string> = {
  superAdmin:             'bg-violet-100 text-violet-700',
  admin:                  'bg-[#1D3461]/10 text-[#1D3461]',
  financialAdmin:         'bg-emerald-100 text-emerald-700',
  fom:                    'bg-orange-100 text-orange-700',
  dataTeam:               'bg-cyan-100 text-cyan-700',
  coordinator:            'bg-blue-100 text-blue-700',
  supervisor:             'bg-indigo-100 text-indigo-700',
  dataCollector:          'bg-slate-100 text-slate-600',
  auditor:                'bg-amber-100 text-amber-700',
  ict:                    'bg-teal-100 text-teal-700',
  projectManager:         'bg-pink-100 text-pink-700',
  countryDirector:        'bg-rose-100 text-rose-700',
  reviewer:               'bg-gray-100 text-gray-600',
};

const ROLE_LABELS: Record<string, string> = {
  superAdmin: 'Super Admin', admin: 'Admin', financialAdmin: 'Financial Admin',
  fom: 'FOM', dataTeam: 'Data Team', coordinator: 'Coordinator',
  supervisor: 'Supervisor', dataCollector: 'Data Collector', auditor: 'Auditor',
  ict: 'ICT', projectManager: 'Project Manager', countryDirector: 'Country Director',
  reviewer: 'Reviewer',
};

function getRoleCode(rawRole: string | null): string | null {
  if (!rawRole) return null;
  return normalizeRole(rawRole) ?? null;
}

function roleCls(rawRole: string | null) {
  const code = getRoleCode(rawRole);
  return ROLE_COLORS[code ?? ''] ?? 'bg-slate-100 text-slate-500';
}

function roleLabel(rawRole: string | null) {
  const code = getRoleCode(rawRole);
  return ROLE_LABELS[code ?? ''] ?? (rawRole ?? 'Unknown');
}

export function hasDefaultAccess(page: PageDef, rawRole: string | null): boolean {
  if (!rawRole) return false;
  const code = getRoleCode(rawRole);
  if (!code) return false;
  if (code === 'superAdmin') return true;
  if (page.roles.includes('all')) return true;
  if (page.roles.includes('!dataCollector')) return code !== 'dataCollector';
  return page.roles.includes(code);
}

function initials(name: string | null) {
  return (name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

const STATUS_UI = {
  granted: { label: 'Explicitly Granted', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-400', icon: UserCheck },
  blocked: { label: 'Explicitly Blocked', cls: 'bg-red-100 text-red-700',     dot: 'bg-red-400',     icon: Lock     },
  role:    { label: 'Role Access',         cls: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-400',    icon: Shield   },
  denied:  { label: 'No Access',           cls: 'bg-slate-100 text-slate-500',  dot: 'bg-slate-300',   icon: UserX    },
};

export type AccessStatus = keyof typeof STATUS_UI;
const STATUS_ORDER: Record<AccessStatus, number> = { blocked: 0, granted: 1, role: 2, denied: 3 };

export function getAccessStatus(
  page: PageDef,
  profile: Profile,
  overrideMap: Record<string, PageOverride>
): AccessStatus {
  const ov = overrideMap[profile.id];
  if (ov) return ov.is_blocked ? 'blocked' : 'granted';
  return hasDefaultAccess(page, profile.role) ? 'role' : 'denied';
}

// ── UserAccessRow (shared between page and modal) ─────────────────────────────
export function UserAccessRow({
  profile,
  status,
  override,
  isSaving,
  pageLabel,
  onGrant,
  onBlock,
  onReset,
}: {
  profile: Profile;
  status: AccessStatus;
  override?: PageOverride;
  isSaving: boolean;
  pageLabel: string;
  onGrant: () => void;
  onBlock: () => void;
  onReset: () => void;
}) {
  const ui = STATUS_UI[status];
  const Icon = ui.icon;
  return (
    <div className={cn(
      'flex items-center gap-3 p-3 rounded-xl border transition-colors group',
      status === 'blocked' ? 'bg-red-50/50 dark:bg-red-900/5 border-red-200/60' :
      status === 'granted' ? 'bg-emerald-50/50 dark:bg-emerald-900/5 border-emerald-200/60' :
      status === 'role'    ? 'bg-blue-50/20 border-blue-100/40' :
      'bg-card border-transparent hover:border-border'
    )}>
      <div className={cn(
        'w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0',
        status === 'denied' || status === 'blocked'
          ? 'bg-slate-200 dark:bg-slate-700 text-slate-500'
          : 'bg-[#0F2041]/10 text-[#0F2041]'
      )}>
        {initials(profile.full_name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{profile.full_name ?? 'Unknown'}</p>
        <span className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded-full capitalize inline-block mt-0.5', roleCls(profile.role))}>
          {roleLabel(profile.role)}
        </span>
      </div>
      <span className={cn('text-[10px] font-medium px-2 py-1 rounded-full flex items-center gap-1 shrink-0 whitespace-nowrap', ui.cls)}>
        <Icon className="h-3 w-3" />{ui.label}
      </span>
      <div className="flex items-center gap-1 shrink-0 min-w-[120px] justify-end">
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <>
            {(status === 'denied' || status === 'blocked') && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost"
                    className="opacity-0 group-hover:opacity-100 h-7 px-2 text-xs text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-opacity"
                    onClick={onGrant}>
                    <Unlock className="h-3 w-3 mr-1" />Grant
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Give this user access to {pageLabel}</TooltipContent>
              </Tooltip>
            )}
            {(status === 'role' || status === 'granted') && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost"
                    className="opacity-0 group-hover:opacity-100 h-7 px-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-opacity"
                    onClick={onBlock}>
                    <Lock className="h-3 w-3 mr-1" />Block
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Block {profile.full_name?.split(' ')[0]} from {pageLabel}</TooltipContent>
              </Tooltip>
            )}
            {override && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost"
                    className="opacity-0 group-hover:opacity-100 h-7 px-2 text-xs text-muted-foreground hover:bg-muted transition-opacity"
                    onClick={onReset}>
                    Reset
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Remove override — revert to role-based access</TooltipContent>
              </Tooltip>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────────────────
export default function PageAccessControl() {
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isSuperAdmin = normalizeRole(currentUser?.role ?? '') === 'superAdmin';

  // All hooks must come before any conditional return
  const [selectedPage, setSelectedPage] = useState<PageDef>(PAGE_DEFS[0]);
  const [userSearch, setUserSearch] = useState('');
  const [pageSearch, setPageSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['My Workspace']));

  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['pac-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, role').order('full_name');
      return (data ?? []) as Profile[];
    },
    staleTime: 60_000,
    enabled: isSuperAdmin,
  });

  const { data: overrides = [], refetch } = useQuery<PageOverride[]>({
    queryKey: ['pac-overrides'],
    queryFn: async () => {
      const { data } = await supabase.from('page_access_overrides').select('*');
      return (data ?? []) as PageOverride[];
    },
    staleTime: 15_000,
    enabled: isSuperAdmin,
  });

  const overrideMap = useMemo(() => {
    const m: Record<string, Record<string, PageOverride>> = {};
    overrides.forEach(o => {
      if (!m[o.page_slug]) m[o.page_slug] = {};
      m[o.page_slug][o.user_id] = o;
    });
    return m;
  }, [overrides]);

  // Guard — after all hooks
  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-3 text-center px-6">
        <div className="h-14 w-14 rounded-2xl bg-red-100 flex items-center justify-center">
          <Lock className="h-6 w-6 text-red-500" />
        </div>
        <h2 className="text-lg font-bold">Super Admin Only</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          This page is restricted to Super Admins. You do not have permission to view or modify page access settings.
        </p>
      </div>
    );
  }

  async function applyOverride(userId: string, isBlocked: boolean, existingId?: string) {
    setSavingId(userId);
    try {
      if (existingId) {
        await supabase.from('page_access_overrides').update({ is_blocked: isBlocked, granted_by: currentUser?.id }).eq('id', existingId);
      } else {
        await supabase.from('page_access_overrides').insert({ page_slug: selectedPage.slug, user_id: userId, is_blocked: isBlocked, granted_by: currentUser?.id });
      }
      const name = profiles.find(p => p.id === userId)?.full_name ?? 'User';
      toast({ title: isBlocked ? 'Access blocked' : 'Access granted', description: `${name} → ${selectedPage.label}` });
      refetch();
      qc.invalidateQueries({ queryKey: ['pac-overrides'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSavingId(null); }
  }

  async function removeOverride(id: string, userId: string) {
    setSavingId(userId);
    try {
      await supabase.from('page_access_overrides').delete().eq('id', id);
      toast({ title: 'Override removed', description: 'User reverts to role-based access.' });
      refetch();
      qc.invalidateQueries({ queryKey: ['pac-overrides'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSavingId(null); }
  }

  const nonSuperProfiles = profiles.filter(p => getRoleCode(p.role) !== 'superAdmin');
  const pageOverrideMap = overrideMap[selectedPage.slug] ?? {};

  const filteredUsers = nonSuperProfiles.filter(p =>
    (p.full_name ?? '').toLowerCase().includes(userSearch.toLowerCase()) ||
    roleLabel(p.role).toLowerCase().includes(userSearch.toLowerCase())
  );

  const sortedUsers = [...filteredUsers].sort((a, b) =>
    STATUS_ORDER[getAccessStatus(selectedPage, a, pageOverrideMap)] -
    STATUS_ORDER[getAccessStatus(selectedPage, b, pageOverrideMap)]
  );

  const counts = { blocked: 0, granted: 0, role: 0, denied: 0 };
  nonSuperProfiles.forEach(p => { counts[getAccessStatus(selectedPage, p, pageOverrideMap)]++; });

  const ovCountForPage = (slug: string) => Object.keys(overrideMap[slug] ?? {}).length;

  const filteredPages = PAGE_DEFS.filter(p =>
    p.label.toLowerCase().includes(pageSearch.toLowerCase()) ||
    p.group.toLowerCase().includes(pageSearch.toLowerCase())
  );
  const groupedPages = PAGE_GROUPS.map(g => ({ group: g, pages: filteredPages.filter(p => p.group === g) })).filter(g => g.pages.length);

  function toggleGroup(g: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-background overflow-hidden">

        {/* Left: page tree */}
        <div className="w-64 flex-shrink-0 border-r flex flex-col bg-card">
          <div className="p-4 border-b">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-[#0F2041] to-[#1D3461] flex items-center justify-center shrink-0">
                <Shield className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#0F2041]">Page Access Control</h2>
                <p className="text-[10px] text-muted-foreground">{PAGE_DEFS.length} pages · Super Admin only</p>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={pageSearch} onChange={e => setPageSearch(e.target.value)}
                placeholder="Search pages…" className="pl-8 h-8 text-xs" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {groupedPages.map(({ group, pages }) => (
              <div key={group}>
                <button onClick={() => toggleGroup(group)}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronRight className={cn('h-3 w-3 transition-transform', expandedGroups.has(group) && 'rotate-90')} />
                  {group}
                </button>
                {expandedGroups.has(group) && pages.map(page => {
                  const Icon = page.icon;
                  const isSelected = page.slug === selectedPage.slug;
                  const ovCount = ovCountForPage(page.slug);
                  return (
                    <button key={page.slug} onClick={() => { setSelectedPage(page); setUserSearch(''); }}
                      className={cn('w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all group ml-2',
                        isSelected ? 'bg-[#1D3461] text-white' : 'hover:bg-muted/50 text-foreground')}>
                      <Icon className={cn('h-3.5 w-3.5 shrink-0', isSelected ? 'text-white/80' : 'text-muted-foreground')} />
                      <span className="flex-1 text-xs font-medium truncate">{page.label}</span>
                      {ovCount > 0 && (
                        <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0',
                          isSelected ? 'bg-white/20 text-white' : 'bg-[#1D3461]/10 text-[#1D3461]')}>{ovCount}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Right: user panel */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b bg-card flex-shrink-0">
            <div className="flex items-start gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold">{selectedPage.label}</h3>
                  {selectedPage.note && (
                    <Tooltip>
                      <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent className="text-xs max-w-[220px]">{selectedPage.note}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground font-mono">{selectedPage.path}</p>
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-1 flex-wrap justify-end max-w-[420px]">
                <span className="text-[10px] text-muted-foreground mr-1 shrink-0">Default access:</span>
                {selectedPage.roles.map(r => (
                  <span key={r} className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded-full capitalize',
                    r === 'all' ? 'bg-blue-100 text-blue-700' :
                    r === '!dataCollector' ? 'bg-orange-100 text-orange-700' :
                    ROLE_COLORS[r] ?? 'bg-slate-100 text-slate-500')}>
                    {r === 'all' ? 'Everyone' : r === '!dataCollector' ? 'All except Data Collector' : ROLE_LABELS[r] ?? r}
                  </span>
                ))}
              </div>
            </div>
            {/* Counts */}
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              {(Object.entries(STATUS_UI) as [AccessStatus, typeof STATUS_UI[AccessStatus]][]).map(([key, ui]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className={cn('w-2 h-2 rounded-full inline-block', ui.dot)} />
                  <span className="text-[11px] text-muted-foreground">{ui.label}:</span>
                  <span className="text-[11px] font-bold">{counts[key]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="px-6 py-3 border-b flex-shrink-0 bg-muted/20">
            <div className="relative max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={userSearch} onChange={e => setUserSearch(e.target.value)}
                placeholder="Search users by name or role…" className="pl-8 h-8 text-xs" />
            </div>
          </div>

          {/* User list */}
          <div className="flex-1 overflow-y-auto px-6 py-3">
            <div className="space-y-1 max-w-3xl">
              {sortedUsers.map(profile => {
                const status = getAccessStatus(selectedPage, profile, pageOverrideMap);
                const ov = pageOverrideMap[profile.id];
                return (
                  <UserAccessRow
                    key={profile.id}
                    profile={profile}
                    status={status}
                    override={ov}
                    isSaving={savingId === profile.id}
                    pageLabel={selectedPage.label}
                    onGrant={() => applyOverride(profile.id, false, ov?.id)}
                    onBlock={() => applyOverride(profile.id, true, ov?.id)}
                    onReset={() => removeOverride(ov!.id, profile.id)}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
