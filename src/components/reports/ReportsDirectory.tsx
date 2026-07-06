import { type FC } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen, TrendingUp, FileBarChart, Landmark, Package, CreditCard,
  Receipt, Shield, ShieldAlert, ArrowLeftRight, Heart, Building2, Zap,
  RotateCcw, Award, Wallet, Users, CalendarCheck, ClipboardList, BarChart3,
  Activity, MapPin, LayoutDashboard, ClipboardCheck, MessageSquare, Bell,
  KeyRound, ListChecks, Download, UserCog, Network, CalendarDays, GraduationCap,
  ShieldCheck, UserPlus, LogOut, Gauge, DollarSign, FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ReportItem {
  label: string;
  description: string;
  path: string;
  icon: FC<{ className?: string }>;
  exportTypes?: string[];
}

interface ReportCategory {
  id: string;
  title: string;
  description: string;
  accent: string;
  items: ReportItem[];
}

const CATEGORIES: ReportCategory[] = [
  {
    id: "finance",
    title: "Finance & Accounting",
    description: "Full accounting system — ledger, statements, controls, P2P, and grants",
    accent: "border-l-emerald-500",
    items: [
      { label: "Chart of Accounts", description: "Account hierarchy and types", path: "/accounting?tab=coa", icon: BookOpen },
      { label: "Journal Entries", description: "Manual and system-posted journal entries", path: "/accounting?tab=journals", icon: Receipt },
      { label: "Trial Balance", description: "Debit/credit balances as of a date", path: "/accounting?tab=trial-balance", icon: TrendingUp, exportTypes: ["CSV", "PDF"] },
      { label: "General Ledger", description: "Posted transactions by account with running balances", path: "/accounting?tab=ledger", icon: BookOpen, exportTypes: ["CSV"] },
      { label: "Financial Statements", description: "Income statement (P&L) and Balance Sheet", path: "/accounting?tab=reports", icon: FileBarChart, exportTypes: ["CSV", "PDF"] },
      { label: "Cash Flow Statement", description: "Operating, investing, financing cash movements", path: "/accounting?tab=cash-flow", icon: Activity, exportTypes: ["CSV", "PDF"] },
      { label: "Cash Flow Forecast", description: "Projected liquidity based on POs, budgets, receipts", path: "/accounting?tab=cash-flow-forecast", icon: TrendingUp, exportTypes: ["CSV"] },
      { label: "Budget vs Actual", description: "Planned vs actual spend by project/department", path: "/accounting?tab=budget-variance", icon: BarChart3, exportTypes: ["CSV", "PDF"] },
      { label: "Budget Planning", description: "Approval workflows and audit logs for budgets", path: "/accounting?tab=budget-planning", icon: DollarSign },
      { label: "Budget Encumbrance", description: "Committed but unspent budget tracking", path: "/accounting?tab=budget-encumbrance", icon: Wallet },
      { label: "Grant Tracking", description: "Grant budgets, line-item expenses, milestone burn rates", path: "/accounting?tab=grants", icon: Award, exportTypes: ["CSV", "PDF"] },
      { label: "Donor Fund Reports", description: "Fund utilization by donor, grant, or restriction", path: "/accounting?tab=donor-reports", icon: Heart, exportTypes: ["CSV"] },
      { label: "Cost Allocation", description: "Weighted cost allocation with GL journal posting", path: "/accounting?tab=cost-allocation", icon: Zap },
      { label: "Fixed Assets", description: "Asset register, depreciation schedules, disposal", path: "/accounting?tab=fixed-assets", icon: Package, exportTypes: ["CSV"] },
      { label: "Depreciation Run", description: "Scheduled depreciation batch runs", path: "/accounting?tab=depreciation-run", icon: RotateCcw },
      { label: "Bank Reconciliation", description: "Bank statement vs GL matching, unreconciled items", path: "/accounting?tab=bank-recon", icon: Landmark, exportTypes: ["CSV"] },
      { label: "AP Aging", description: "Outstanding payables by age (30/60/90+ days)", path: "/accounting?tab=ap-aging", icon: Receipt, exportTypes: ["CSV"] },
      { label: "Cheque Register", description: "Issued cheque logs, clearing status, voided/stale", path: "/accounting?tab=cheque-register", icon: CreditCard, exportTypes: ["CSV"] },
      { label: "Purchase Requisitions / Orders / GRN / AP Invoices", description: "Full Procure-to-Pay cycle records", path: "/accounting?tab=purchase-requisitions", icon: Package },
      { label: "Vendor Registry", description: "Vendor master data and payment history", path: "/accounting?tab=vendors", icon: Building2 },
      { label: "Tax Management", description: "Tax liability summaries by code and transaction", path: "/accounting?tab=tax", icon: Receipt, exportTypes: ["CSV"] },
      { label: "Multi-Currency", description: "Exchange-rate exposure and revaluation", path: "/accounting?tab=multi-currency", icon: ArrowLeftRight },
      { label: "Segregation of Duties", description: "Internal control violation reports", path: "/accounting?tab=sod", icon: ShieldAlert, exportTypes: ["CSV"] },
      { label: "AML & Compliance", description: "Transaction monitoring for money-laundering flags", path: "/accounting?tab=aml", icon: Shield, exportTypes: ["CSV"] },
      { label: "GL Bridge Audit", description: "Automated posting logs from operational modules", path: "/accounting?tab=gl-audit", icon: Activity, exportTypes: ["Excel"] },
      { label: "Finance Audit Trail", description: "Immutable log of all financial record changes", path: "/accounting?tab=finance-audit-trail", icon: ShieldCheck, exportTypes: ["Excel", "PDF"] },
      { label: "Financial Consolidation", description: "Multi-entity roll-up with inter-entity eliminations", path: "/accounting?tab=consolidation", icon: Building2, exportTypes: ["CSV"] },
      { label: "Period Close", description: "Fiscal period locking and close checklist", path: "/accounting?tab=period-close", icon: KeyRound },
      { label: "Month-End Summary", description: "Consolidated payroll, receivables, subscriptions for the period", path: "/finance-hub?tab=month-end", icon: CalendarCheck, exportTypes: ["PDF", "Excel"] },
      { label: "Wallet Reports", description: "Staff field-wallet transaction histories and balances", path: "/finance-hub?tab=wallet-reports", icon: Wallet, exportTypes: ["CSV"] },
      { label: "Transport Advance Report", description: "Outstanding transport advances and recovery status", path: "/finance-hub?tab=advance-report", icon: ClipboardList, exportTypes: ["CSV"] },
      { label: "Salary & Retainer Report", description: "Consolidated staff salary vs retainer payments", path: "/finance-hub?tab=salary-retainer", icon: Users, exportTypes: ["Excel"] },
      { label: "Enumerator Fees Report", description: "MMP site-visit fees and payment status", path: "/finance-hub?tab=enumerator-fees", icon: Receipt, exportTypes: ["CSV"] },
      { label: "Exchange Rates", description: "Currency rate history used across finance modules", path: "/finance-hub?tab=exchange-rates", icon: ArrowLeftRight },
      { label: "Cost Predictions", description: "Forecasted operational cost trends", path: "/finance-hub?tab=cost-predictions", icon: TrendingUp },
    ],
  },
  {
    id: "operational",
    title: "Operational",
    description: "Field operations, projects, surveys, and system activity",
    accent: "border-l-blue-500",
    items: [
      { label: "MMP Cycle Health & Coverage", description: "Cycle health score, coverage alerts, cycle comparison", path: "/mmp", icon: Gauge, exportTypes: ["Excel", "PDF"] },
      { label: "Hub & Site Operations", description: "Site registry, GPS coverage, hub activity distribution", path: "/programme-hub?tab=hub-ops", icon: MapPin, exportTypes: ["Excel"] },
      { label: "Project Analytics", description: "Project KPIs, progress, budget burn, task completion", path: "/programme-hub?tab=analytics", icon: BarChart3, exportTypes: ["Excel"] },
      { label: "Portfolio Dashboard", description: "Cross-project health matrix, financials, milestones, pipeline", path: "/programme-hub?tab=portfolio", icon: LayoutDashboard, exportTypes: ["PDF", "CSV"] },
      { label: "Survey / Questionnaire Analytics", description: "Submission rates, enumerator performance, response quality", path: "/analytics?tab=questionnaire-analytics", icon: ClipboardCheck, exportTypes: ["CSV", "Excel"] },
      { label: "DCT / PDM Dashboard", description: "Data collection team post-distribution monitoring", path: "/analytics?tab=dct-pdm", icon: ClipboardList, exportTypes: ["Excel"] },
      { label: "WhatsApp Delivery Reports", description: "Delivery success/failure logs, provider performance", path: "/communication-hub?tab=whatsapp", icon: MessageSquare, exportTypes: ["CSV"] },
      { label: "Notification Analytics", description: "Read rates, response times, category volume", path: "/notification-analytics", icon: Bell },
      { label: "Login & System Audit Logs", description: "Login history, access patterns, data-change logs", path: "/analytics?tab=reports", icon: Shield, exportTypes: ["Excel"] },
      { label: "Login Analytics", description: "Sign-in activity and session security overview", path: "/login-analytics", icon: KeyRound },
      { label: "Team Task Monitor", description: "Team task load, efficiency, overdue counts (executive view)", path: "/team-tasks", icon: ListChecks, exportTypes: ["Excel"] },
      { label: "Data Export Center", description: "Bulk raw-data extraction across all operational domains", path: "/analytics?tab=data-export-center", icon: Download, exportTypes: ["CSV", "Excel"] },
      { label: "CRM Pipeline & Engagement", description: "Partners, engagements, contacts, opportunities", path: "/crm", icon: Network },
    ],
  },
  {
    id: "hr",
    title: "HR",
    description: "Payroll, workforce planning, leave, performance, and compliance",
    accent: "border-l-amber-500",
    items: [
      { label: "Payroll & Payslips", description: "Monthly payslips, gross/net pay, deductions", path: "/hr?tab=payroll", icon: Wallet, exportTypes: ["PDF", "CSV"] },
      { label: "Payroll Admin / Run", description: "Org-wide payroll runs, variances, bank transfer files", path: "/hr?tab=payroll-admin", icon: DollarSign, exportTypes: ["Excel"] },
      { label: "Payroll Summary Report", description: "Consolidated payroll totals by department/contract type", path: "/hr?tab=payroll-summary", icon: FileSpreadsheet, exportTypes: ["PDF"] },
      { label: "Retainer Management", description: "Retainer rates, renewal dates, payment tracking", path: "/hr?tab=retainer", icon: Users, exportTypes: ["CSV"] },
      { label: "EOSB / Gratuity Calculator", description: "End-of-service benefits per Sudan Labour Law", path: "/hr?tab=eosb", icon: Award, exportTypes: ["Excel"] },
      { label: "Salary Advances Tracker", description: "Issued advances, recovery schedules, balances", path: "/hr?tab=salary-advances", icon: CreditCard, exportTypes: ["Excel"] },
      { label: "Salary Increments", description: "Proposed salary changes and approval audit trail", path: "/hr?tab=salary-increments", icon: TrendingUp },
      { label: "Attendance", description: "Check-ins/outs, GPS/office/remote verification", path: "/hr?tab=attendance", icon: CalendarDays },
      { label: "Leave Requests & Balances", description: "Leave history, approvals, balances by type", path: "/hr?tab=leave-requests", icon: CalendarCheck },
      { label: "Leave Calendar", description: "Team coverage view of approved leave overlaps", path: "/hr?tab=leave-calendar", icon: CalendarDays },
      { label: "Org Chart", description: "Reporting hierarchy and staff directory", path: "/hr?tab=org-chart", icon: Network },
      { label: "Headcount Planning", description: "Budgeted vs actual headcount, vacancies, cost forecast", path: "/hr?tab=headcount", icon: UserCog, exportTypes: ["Excel"] },
      { label: "Positions & Vacancies", description: "Approved position register and open vacancies", path: "/hr?tab=positions", icon: UserPlus },
      { label: "Performance Reviews", description: "Objectives, check-ins, annual ratings", path: "/hr?tab=performance", icon: ClipboardCheck },
      { label: "Training & Certifications", description: "Completed courses, certification expiry", path: "/hr?tab=training", icon: GraduationCap },
      { label: "Benefits Administration", description: "Insurance, pension, and benefit enrollment", path: "/hr?tab=benefits", icon: Heart, exportTypes: ["Excel"] },
      { label: "Recruitment / ATS", description: "Applicant pipelines, interviews, hiring status", path: "/hr?tab=recruitment", icon: UserPlus, exportTypes: ["Excel"] },
      { label: "Disciplinary Tracking", description: "Case logging, investigation status, resolutions", path: "/hr?tab=disciplinary", icon: ShieldAlert, exportTypes: ["Excel"] },
      { label: "Staff Onboarding", description: "New-hire checklists and orientation progress", path: "/hr?tab=onboarding", icon: UserPlus },
      { label: "Offboarding", description: "Clearance checklists, final pay, exit interviews", path: "/hr?tab=offboarding", icon: LogOut, exportTypes: ["PDF"] },
      { label: "HR Analytics", description: "Turnover, salary distribution, contract-type trends", path: "/hr?tab=hr-analytics", icon: BarChart3 },
      { label: "My Team", description: "Manager view of direct reports and status", path: "/my-team", icon: Users },
      { label: "HR Summary Report", description: "Cross-org leave balances and certification expiry", path: "#hr_summary", icon: ClipboardList },
    ],
  },
];

interface ReportsDirectoryProps {
  onSelectInternal?: (tab: string) => void;
}

export const ReportsDirectory: FC<ReportsDirectoryProps> = ({ onSelectInternal }) => {
  const navigate = useNavigate();

  const handleClick = (path: string) => {
    if (path.startsWith("#")) {
      onSelectInternal?.(path.slice(1));
      return;
    }
    navigate(path);
  };

  return (
    <div className="space-y-6" data-testid="reports-directory">
      {CATEGORIES.map((category) => (
        <Card key={category.id} className={cn("border-l-4", category.accent)} data-testid={`category-${category.id}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{category.title}</CardTitle>
            <CardDescription>{category.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {category.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    onClick={() => handleClick(item.path)}
                    className="text-left border rounded-lg p-3 hover:border-primary hover:shadow-sm transition-all bg-white dark:bg-slate-900 flex flex-col gap-1.5"
                    data-testid={`report-link-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  >
                    <div className="flex items-start gap-2">
                      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium leading-tight">{item.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">{item.description}</p>
                    {item.exportTypes && (
                      <div className="flex gap-1 flex-wrap mt-0.5">
                        {item.exportTypes.map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">{t}</Badge>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default ReportsDirectory;
