import { useLocation, Link, useNavigate } from "react-router-dom";
import {
  Users, UsersRound, Settings, FolderKanban, Activity, Link2, Database,
  ClipboardList, LogOut, LayoutDashboard, ChevronUp, Shield, ShieldCheck,
  Calendar, CalendarOff, Archive, CreditCard, DollarSign, Award, Briefcase,
  Receipt, TrendingUp, Building2, MapPin, CheckCircle, Pin, Eye, EyeOff,
  GripVertical, Star, BarChart3, Banknote, ClipboardCheck, BookOpen,
  FileSignature, Phone, MessageSquare, Bell, FileText, Map, ScrollText,
  Mail, Smartphone, HelpCircle, PenTool, PhoneCall, RefreshCw, Megaphone,
  ScanLine, Siren, AlertTriangle, Package, HeartPulse, Heart, ShieldAlert,
  RotateCcw, CheckSquare, Handshake, FolderOpen, Compass, Lock, Inbox,
  FileBarChart, CalendarCheck, Sparkles, FilePlus, Wallet, Clock, Landmark,
  Settings2, Zap, ShoppingCart, ArrowLeftRight, PiggyBank, Search,
  GraduationCap, ChevronLeft, ChevronRight, X, Menu,
} from "lucide-react";
import { RealtimeStatusDot } from "@/components/realtime";
import { useSiteVisitReminders } from "@/hooks/use-site-visit-reminders";
import Logo from "../assets/logo.png";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useAppContext } from "@/context/AppContext";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger,
  SidebarRail, SidebarResizeHandle, useSidebar,
} from "@/components/ui/sidebar";
import { AppRole } from "@/types";
import { useAuthorization } from "@/hooks/use-authorization";
import { canSeePath } from "@/lib/page-roles";
import { useSuperAdmin } from "@/context/superAdmin/SuperAdminContext";
import { useSettings } from "@/context/settings/SettingsContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavBadgeCountsContext } from "@/context/NavBadgeCountsContext";
import { getChangelogUnreadCount } from "@/lib/changelog-utils";
import { MenuPreferences, DEFAULT_MENU_PREFERENCES } from "@/types/user-preferences";
import { normalizeRole } from "@/utils/roleMapping";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// ─── Badge count helper ───────────────────────────────────────────────────────
function getBadgeForItem(
  id: string,
  counts: {
    approvalsHub: number; pendingReclaimCount: number; pendingCostTier1Hub: number;
    pendingDownPaymentCount: number; pendingMmpCount: number; pendingTier2CostCount: number;
    pendingFinanceCount: number; unreadNotifCount: number; openIncidentCount: number;
    pendingVerificationCount: number; pendingWalletCount: number; myTasksOverdueCount: number;
    changelogUnreadCount: number;
  }
): number {
  switch (id) {
    case "approvals-hub":          return counts.approvalsHub;
    case "advance-requests-report":
    case "reconciliation-dashboard": return counts.pendingReclaimCount;
    case "cost-submission":
    case "supervisor-approvals":   return counts.pendingCostTier1Hub;
    case "down-payment-approval":  return counts.pendingDownPaymentCount;
    case "mmp-management":         return counts.pendingMmpCount;
    case "withdrawal-approval":    return counts.pendingTier2CostCount;
    case "finance-approval":       return counts.pendingFinanceCount;
    case "notifications":          return counts.unreadNotifCount;
    case "incident-reports":
    case "safety-hub":             return counts.openIncidentCount;
    case "site-verification":
    case "sites-for-verification": return counts.pendingVerificationCount;
    case "my-wallet":              return counts.pendingWalletCount;
    case "my-tasks":               return counts.myTasksOverdueCount;
    case "changelog":              return counts.changelogUnreadCount;
    default:                       return 0;
  }
}

// ─── Menu groups builder (copied from AppSidebar) ─────────────────────────────
interface MenuGroup {
  id: string;
  label: string;
  order: number;
  parentGroup?: string;
  items: Array<{ id: string; title: string; url: string; icon: any; priority: number }>;
}

const getWorkflowMenuGroups = (
  roles: AppRole[] = [],
  defaultRole = "dataCollector",
  perms: Record<string, boolean> = {},
  isSuperAdmin = false,
  menuPrefs: MenuPreferences = DEFAULT_MENU_PREFERENCES,
  hasMonitoringAccess = false
): MenuGroup[] => {
  const normalizedDefault = normalizeRole(defaultRole);
  const normalizedRoles = roles.map((r) => normalizeRole(r)).filter(Boolean);
  const allNormalized = normalizedDefault
    ? [normalizedDefault, ...normalizedRoles]
    : normalizedRoles;
  const hasRole = (code: string) => allNormalized.includes(code as any);
  const isAdmin         = hasRole("admin");
  const isICT           = hasRole("ict");
  const isFinancialAdmin = hasRole("financialAdmin");
  const isAuditor       = hasRole("auditor");
  const isDataCollector = hasRole("dataCollector");
  const isCoordinator   = hasRole("coordinator");
  const isFOM           = hasRole("fom");
  const isSupervisor    = hasRole("supervisor");
  const isDataTeam      = hasRole("dataTeam");
  const isProjectManager = hasRole("projectManager");
  const isCountryDirector = hasRole("countryDirector");
  const isEmployee      = hasRole("employee");

  const isHidden = (url: string) => menuPrefs.hiddenItems.includes(url);
  const groups: MenuGroup[] = [];

  // 1. My Workspace
  const workspaceItems: MenuGroup["items"] = [];
  if (!isHidden("/dashboard") && (isSuperAdmin || isAdmin || isICT || isEmployee || perms.dashboard))
    workspaceItems.push({ id: "dashboard", title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, priority: 1 });
  if (!isHidden("/my-tasks"))
    workspaceItems.push({ id: "my-tasks", title: "My Tasks", url: "/my-tasks", icon: CheckSquare, priority: 2 });
  if (!isHidden("/team-tasks") && (isSuperAdmin || isAdmin || isCountryDirector || ["ceo","coo","cto","hr_manager"].includes(defaultRole.toLowerCase())))
    workspaceItems.push({ id: "team-tasks", title: "Team Monitor", url: "/team-tasks", icon: Users, priority: 3 });
  if (!isHidden("/my-team"))
    workspaceItems.push({ id: "my-team", title: "My Team", url: "/my-team", icon: Users, priority: 3 });
  if (!isDataCollector && !isHidden("/calendar"))
    workspaceItems.push({ id: "calendar", title: "Calendar", url: "/calendar", icon: Calendar, priority: 3 });
  if (!isHidden("/notifications"))
    workspaceItems.push({ id: "notifications", title: "Notifications", url: "/notifications", icon: Bell, priority: 4 });
  if (!isHidden("/workspace"))
    workspaceItems.push({ id: "workspace-hub", title: "Workspace Hub", url: "/workspace", icon: FolderOpen, priority: 5 });
  if (workspaceItems.length) groups.push({ id: "workspace", label: "My Workspace", order: 1, items: workspaceItems });

  // 2. Communication
  const communicationItems: MenuGroup["items"] = [];
  if (!isHidden("/communication-hub"))
    communicationItems.push({ id: "communication-hub", title: "Communication", url: "/communication-hub", icon: MessageSquare, priority: 1 });
  if (communicationItems.length) groups.push({ id: "communication", label: "Communication", order: 3, items: communicationItems });

  // 3. Programme Management
  const planningItems: MenuGroup["items"] = [];
  const canSeeProgrammeHub = isSuperAdmin || isAdmin || isICT || isFOM || isProjectManager || isCountryDirector || isDataTeam || perms.projects;
  if (canSeeProgrammeHub && !isHidden("/programme-hub"))
    planningItems.push({ id: "programme-hub", title: "Programme Hub", url: "/programme-hub", icon: FolderKanban, priority: 1 });
  if (!isHidden("/mmp") && (isDataCollector || isSupervisor || isCoordinator) && !(isSuperAdmin || isAdmin || isFOM || isProjectManager || isCountryDirector)) {
    const mmpTitle = (isDataCollector || isCoordinator) ? "My Sites Management" : "MMP Management";
    planningItems.push({ id: "mmp-management", title: mmpTitle, url: "/mmp", icon: Database, priority: 2 });
  }
  if (planningItems.length) groups.push({ id: "programme-management", label: "Programme Mgmt", order: 2, items: planningItems });

  // 4. Field Operations
  const fieldOpsItems: MenuGroup["items"] = [];
  if (!isHidden("/site-visits") && (isSuperAdmin || isAdmin || isICT || perms.siteVisits))
    fieldOpsItems.push({ id: "site-visits", title: "Site Visits", url: "/site-visits", icon: ClipboardList, priority: 1 });
  if (!isHidden("/monitoring-form") && (isSuperAdmin || isAdmin || isDataCollector || isCoordinator || isSupervisor || isFOM))
    fieldOpsItems.push({ id: "monitoring-form", title: "Monitoring Form", url: "/monitoring-form", icon: ClipboardCheck, priority: 2 });
  if (!isHidden("/safety-hub") && (isSuperAdmin || isAdmin || isICT || isFOM || isCoordinator || isSupervisor || isDataCollector || isDataTeam))
    fieldOpsItems.push({ id: "safety-hub", title: "Safety Hub", url: "/safety-hub", icon: Siren, priority: 3 });
  if (!isHidden("/incident-reports") && (isSuperAdmin || isAdmin || isICT || isFOM || isCoordinator || isSupervisor || isDataTeam))
    fieldOpsItems.push({ id: "incident-reports", title: "Incidents", url: "/incident-reports", icon: AlertTriangle, priority: 4 });
  if (!isHidden("/equipment") && canSeePath("/equipment", defaultRole))
    fieldOpsItems.push({ id: "equipment", title: "Equipment", url: "/equipment", icon: Package, priority: 5 });
  if (!isHidden("/field-team") && (isSuperAdmin || ((isAdmin || perms.fieldTeam) && !isICT)))
    fieldOpsItems.push({ id: "field-team", title: "Field Team", url: "/field-team", icon: Activity, priority: 6 });
  if (!isHidden("/map") && canSeePath("/map", defaultRole))
    fieldOpsItems.push({ id: "advanced-map", title: "Field Map", url: "/map", icon: Map, priority: 7 });
  if (!isHidden("/field-operation-manager") && canSeePath("/field-operation-manager", defaultRole))
    fieldOpsItems.push({ id: "field-operation-manager", title: "Field Ops Mgr", url: "/field-operation-manager", icon: Compass, priority: 8 });
  if (fieldOpsItems.length) groups.push({ id: "field-ops", label: "Field Operations", order: 4, items: fieldOpsItems });

  // 5. Coordination
  const coordinationItems: MenuGroup["items"] = [];
  if (!isHidden("/supervisor/sites") && isSupervisor && !isCoordinator)
    coordinationItems.push({ id: "supervisor-site-management", title: "My Sites", url: "/supervisor/sites", icon: Map, priority: 1 });
  if (!isHidden("/coordinator/sites") && canSeePath("/coordinator/sites", defaultRole))
    coordinationItems.push({ id: "site-verification", title: "Site Verification", url: "/coordinator/sites", icon: CheckCircle, priority: 2 });
  if (!isHidden("/coordinator/sites-for-verification") && canSeePath("/coordinator/sites", defaultRole))
    coordinationItems.push({ id: "sites-for-verification", title: "Sites for Verify", url: "/coordinator/sites-for-verification", icon: CheckCircle, priority: 3 });
  if (!isHidden("/mmp/cycle-close") && (isSuperAdmin || isAdmin || isFOM || isSupervisor))
    coordinationItems.push({ id: "mmp-cycle-close", title: "Cycle Mgmt", url: "/mmp/cycle-close", icon: CheckCircle, priority: 4 });
  if (!isHidden("/admin/staff-profiles") && (isSuperAdmin || isAdmin))
    coordinationItems.push({ id: "staff-directory", title: "Staff Directory", url: "/admin/staff-profiles", icon: UsersRound, priority: 5 });
  if (coordinationItems.length) groups.push({ id: "coordination", label: "Coordination", order: 4.5, items: coordinationItems });

  // 6. Finance sub-groups
  const myMoneyItems: MenuGroup["items"] = [];
  if (!isHidden("/wallet") && (isFinancialAdmin || isAuditor || isFOM || isSupervisor || isDataCollector || isCoordinator))
    myMoneyItems.push({ id: "my-wallet", title: "My Wallet", url: "/wallet", icon: CreditCard, priority: 1 });
  if (!isHidden("/cost-submission") && (isSuperAdmin || isAdmin || isSupervisor || isFOM || isCoordinator || isDataTeam))
    myMoneyItems.push({ id: "cost-submission", title: "Cost Submission", url: "/cost-submission", icon: Receipt, priority: 2 });
  if (myMoneyItems.length) groups.push({ id: "finance-my-money", label: "My Money", order: 5.1, parentGroup: "finance", items: myMoneyItems });

  const approvalItems: MenuGroup["items"] = [];
  if (!isHidden("/approvals") && (isSuperAdmin || isAdmin || isFinancialAdmin || isSupervisor || isFOM))
    approvalItems.push({ id: "approvals-hub", title: "Approvals Hub", url: "/approvals", icon: Inbox, priority: 0 });
  if (!isHidden("/supervisor-approvals") && canSeePath("/supervisor-approvals", defaultRole))
    approvalItems.push({ id: "supervisor-approvals", title: "Tier 1 Approvals", url: "/supervisor-approvals", icon: ClipboardCheck, priority: 1 });
  if (!isHidden("/withdrawal-approval") && canSeePath("/withdrawal-approval", defaultRole))
    approvalItems.push({ id: "withdrawal-approval", title: "Tier 2 Approvals", url: "/withdrawal-approval", icon: ClipboardCheck, priority: 2 });
  if (!isHidden("/down-payment-approval") && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor || isSupervisor))
    approvalItems.push({ id: "down-payment-approval", title: "Down-Payment", url: "/down-payment-approval", icon: DollarSign, priority: 3 });
  if (!isHidden("/finance-approval") && canSeePath("/finance-approval", defaultRole))
    approvalItems.push({ id: "finance-approval", title: "Finance Processing", url: "/finance-approval", icon: Banknote, priority: 4 });
  if (approvalItems.length) groups.push({ id: "finance-approvals", label: "Approvals", order: 5.2, parentGroup: "finance", items: approvalItems });

  const finMgmtItems: MenuGroup["items"] = [];
  if (!isHidden("/budget") && canSeePath("/budget", defaultRole))
    finMgmtItems.push({ id: "budget", title: "Budget", url: "/budget", icon: DollarSign, priority: 1 });
  if (!isHidden("/admin/wallets") && canSeePath("/admin/wallets", defaultRole))
    finMgmtItems.push({ id: "wallets", title: "Wallets Admin", url: "/admin/wallets", icon: CreditCard, priority: 2 });
  if (!isHidden("/financial-operations") && (canSeePath("/financial-operations", defaultRole) || perms.financialOperations))
    finMgmtItems.push({ id: "financial-ops", title: "Financial Ops", url: "/financial-operations", icon: TrendingUp, priority: 3 });
  if (!isHidden("/reconciliation-dashboard") && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor))
    finMgmtItems.push({ id: "reconciliation-dashboard", title: "Reconciliation", url: "/reconciliation-dashboard", icon: ClipboardCheck, priority: 5 });
  if (finMgmtItems.length) groups.push({ id: "finance-management", label: "Financial Mgmt", order: 5.3, parentGroup: "finance", items: finMgmtItems });

  // 7. Accounting
  const accountingItems: MenuGroup["items"] = [];
  if (!isHidden("/accounting/coa") && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor))
    accountingItems.push({ id: "acct-coa", title: "Chart of Accounts", url: "/accounting/coa", icon: BookOpen, priority: 1 });
  if (!isHidden("/accounting/journals") && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor))
    accountingItems.push({ id: "acct-journals", title: "Journal Entries", url: "/accounting/journals", icon: ScrollText, priority: 2 });
  if (!isHidden("/accounting/ledger") && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor))
    accountingItems.push({ id: "acct-ledger", title: "General Ledger", url: "/accounting/ledger", icon: Landmark, priority: 3 });
  if (!isHidden("/accounting/trial-balance") && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor))
    accountingItems.push({ id: "acct-trial-balance", title: "Trial Balance", url: "/accounting/trial-balance", icon: BarChart3, priority: 4 });
  if (!isHidden("/accounting/payables") && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor))
    accountingItems.push({ id: "acct-payables", title: "Payables", url: "/accounting/payables", icon: Receipt, priority: 5 });
  if (!isHidden("/accounting/intercompany") && (isSuperAdmin || isAdmin || isFinancialAdmin))
    accountingItems.push({ id: "acct-intercompany", title: "Intercompany", url: "/accounting/intercompany", icon: ArrowLeftRight, priority: 6 });
  if (accountingItems.length) groups.push({ id: "accounting", label: "Accounting", order: 5.8, items: accountingItems });

  // 8. HR & People
  const hrItems: MenuGroup["items"] = [];
  if (!isHidden("/hr/payroll") && (isSuperAdmin || isAdmin || isFinancialAdmin))
    hrItems.push({ id: "hr-payroll", title: "Payroll", url: "/hr/payroll", icon: Banknote, priority: 1 });
  if (!isHidden("/hr/retainer") && (isSuperAdmin || isAdmin || isFinancialAdmin))
    hrItems.push({ id: "hr-retainer", title: "Retainer Mgmt", url: "/hr/retainer", icon: FileText, priority: 2 });
  if (!isHidden("/hr/leave") && (isSuperAdmin || isAdmin || isFinancialAdmin || isEmployee))
    hrItems.push({ id: "hr-leave", title: "Leave Approval", url: "/hr/leave", icon: CalendarOff, priority: 3 });
  if (!isHidden("/hr/performance") && (isSuperAdmin || isAdmin))
    hrItems.push({ id: "hr-performance", title: "Performance", url: "/hr/performance", icon: TrendingUp, priority: 4 });
  if (!isHidden("/hr/eosb") && (isSuperAdmin || isAdmin || isFinancialAdmin))
    hrItems.push({ id: "hr-eosb", title: "EOSB / Gratuity", url: "/hr/eosb", icon: Award, priority: 5 });
  if (!isHidden("/hr/salary-advances") && (isSuperAdmin || isAdmin || isFinancialAdmin))
    hrItems.push({ id: "hr-salary-advances", title: "Salary Advances", url: "/hr/salary-advances", icon: PiggyBank, priority: 6 });
  if (hrItems.length) groups.push({ id: "hr-people", label: "HR & People", order: 6, items: hrItems });

  // 9. CRM
  const crmItems: MenuGroup["items"] = [];
  if (!isHidden("/crm") && (isSuperAdmin || isAdmin || isFOM || isProjectManager || isCountryDirector))
    crmItems.push({ id: "crm-hub", title: "CRM", url: "/crm", icon: Handshake, priority: 1 });
  if (crmItems.length) groups.push({ id: "crm", label: "CRM", order: 7, items: crmItems });

  // 10. Surveys
  const surveyItems: MenuGroup["items"] = [];
  if (!isHidden("/surveys") && (isSuperAdmin || isAdmin || isICT || isDataTeam || isCoordinator || isFOM))
    surveyItems.push({ id: "surveys", title: "Surveys", url: "/surveys", icon: ClipboardList, priority: 1 });
  if (surveyItems.length) groups.push({ id: "surveys", label: "Surveys", order: 8, items: surveyItems });

  // 11. Analytics & Reports
  const analyticsItems: MenuGroup["items"] = [];
  if (!isHidden("/reports") && perms.reports)
    analyticsItems.push({ id: "reports", title: "Reports", url: "/reports", icon: BarChart3, priority: 1 });
  if (!isHidden("/monitoring") && (isSuperAdmin || isAdmin || hasMonitoringAccess))
    analyticsItems.push({ id: "monitoring", title: "Monitoring", url: "/monitoring", icon: Activity, priority: 2 });
  if (analyticsItems.length) groups.push({ id: "analytics", label: "Analytics", order: 9, items: analyticsItems });

  // 12. Admin
  const adminItems: MenuGroup["items"] = [];
  if (!isHidden("/users") && perms.users)
    adminItems.push({ id: "users", title: "Users", url: "/users", icon: Users, priority: 1 });
  if (!isHidden("/admin/roles") && perms.roleManagement)
    adminItems.push({ id: "admin-roles", title: "Role Management", url: "/admin/roles", icon: Shield, priority: 2 });
  if (!isHidden("/admin/locations") && (isSuperAdmin || isAdmin))
    adminItems.push({ id: "admin-locations", title: "Locations", url: "/admin/locations", icon: MapPin, priority: 3 });
  if (!isHidden("/admin/sites") && (isSuperAdmin || isAdmin))
    adminItems.push({ id: "admin-sites", title: "Sites Registry", url: "/admin/sites", icon: Building2, priority: 4 });
  if (!isHidden("/admin/audit") && (isSuperAdmin || isAdmin || isAuditor))
    adminItems.push({ id: "admin-audit", title: "Audit Logs", url: "/admin/audit", icon: ShieldCheck, priority: 5 });
  if (!isHidden("/settings") && perms.settings)
    adminItems.push({ id: "settings", title: "Settings", url: "/settings", icon: Settings, priority: 6 });
  if (adminItems.length) groups.push({ id: "admin", label: "Admin", order: 10, items: adminItems });

  return groups;
};

// ─── Icon tile colours per group ─────────────────────────────────────────────
const GROUP_COLORS: Record<string, { icon: string; bg: string }> = {
  workspace:            { icon: "text-sky-300",    bg: "bg-sky-500/20" },
  communication:        { icon: "text-violet-300", bg: "bg-violet-500/20" },
  "programme-management": { icon: "text-teal-300", bg: "bg-teal-500/20" },
  "field-ops":          { icon: "text-amber-300",  bg: "bg-amber-500/20" },
  coordination:         { icon: "text-green-300",  bg: "bg-green-500/20" },
  "finance-my-money":   { icon: "text-emerald-300",bg: "bg-emerald-500/20" },
  "finance-approvals":  { icon: "text-rose-300",   bg: "bg-rose-500/20" },
  "finance-management": { icon: "text-orange-300", bg: "bg-orange-500/20" },
  accounting:           { icon: "text-blue-300",   bg: "bg-blue-500/20" },
  "hr-people":          { icon: "text-pink-300",   bg: "bg-pink-500/20" },
  crm:                  { icon: "text-purple-300", bg: "bg-purple-500/20" },
  surveys:              { icon: "text-cyan-300",   bg: "bg-cyan-500/20" },
  analytics:            { icon: "text-indigo-300", bg: "bg-indigo-500/20" },
  admin:                { icon: "text-red-300",    bg: "bg-red-500/20" },
};

// ─── Main component ───────────────────────────────────────────────────────────
const AppSidebarIconFirst = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { currentUser, logout, roles } = useAppContext();
  const { showDueReminders } = useSiteVisitReminders();
  const { state } = useSidebar();
  const isSidebarCollapsed = state === "collapsed";
  const { isSuperAdmin } = useSuperAdmin();
  const { userSettings, menuPreferences: contextMenuPrefs } = useSettings();

  // Selected group for the expanded panel
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  // Monitoring access RPC
  const [hasMonitoringAccess, setHasMonitoringAccess] = useState(false);
  useEffect(() => {
    if (isSuperAdmin || !currentUser?.id) return;
    supabase.rpc("check_monitoring_access").then(({ data, error }) => {
      if (!error) setHasMonitoringAccess(!!data);
    });
  }, [isSuperAdmin, currentUser?.id]);

  const { checkPermission, hasAnyRole, canManageRoles } = useAuthorization();
  const isAdmin        = hasAnyRole(["admin"]);
  const isDataCollector =
    roles?.includes("DataCollector" as AppRole) ||
    roles?.includes("dataCollector" as AppRole) ||
    currentUser?.role?.toLowerCase() === "datacollector" ||
    currentUser?.role?.toLowerCase() === "data collector";

  const roleIsCoordinator = hasAnyRole(["coordinator", "Coordinator"]);
  const roleIsSupervisor  = hasAnyRole(["supervisor", "Supervisor", "hubSupervisor", "hub_supervisor"]);
  const roleIsFomOrAdmin  = isSuperAdmin || hasAnyRole(["fom", "FOM", "admin", "Admin"]);
  const roleIsFinance     = isSuperAdmin || hasAnyRole(["fom","FOM","admin","Admin","financial_auditor","financialAdmin","financialadmin"]);
  const isStrictAdmin     = isSuperAdmin || hasAnyRole(["admin", "Admin"]);

  const { counts } = useNavBadgeCountsContext();
  const pendingReclaimCount    = counts.pendingReclaimCount;
  const pendingCostTier1Hub    = counts.pendingCostTier1Hub;
  const pendingDownPaymentCount = counts.pendingDpSupervisor;
  const pendingMmpCount        = roleIsCoordinator ? counts.pendingMmpCoordinator : counts.pendingMmpUnassigned;
  const pendingTier2CostCount  = counts.pendingTier2Cost;
  const pendingFinanceCount    = counts.pendingFinanceDp;
  const unreadNotifCount       = counts.unreadNotifications;
  const openIncidentCount      = counts.openIncidents;
  const pendingVerificationCount = counts.pendingVerification;
  const pendingWalletCount     = counts.pendingWallet;
  const myTasksOverdueCount    = counts.myTasksOverdue;
  const changelogUnreadCount   = getChangelogUnreadCount(currentUser?.id ?? "", currentUser?.role ?? "");

  const approvalsHubCount =
    ((roleIsSupervisor || roleIsFomOrAdmin) ? counts.pendingWithdrawals : 0)
    + (roleIsFinance ? counts.pendingFinanceWithdrawals : 0)
    + ((roleIsSupervisor || roleIsFomOrAdmin) ? pendingCostTier1Hub : 0)
    + (roleIsFomOrAdmin ? pendingTier2CostCount : 0)
    + ((roleIsSupervisor || roleIsFomOrAdmin) ? pendingDownPaymentCount : 0)
    + ((roleIsFomOrAdmin || roleIsFinance) ? counts.pendingDpAdmin : 0)
    + (isStrictAdmin ? counts.pendingUsers : 0)
    + (roleIsFomOrAdmin ? pendingMmpCount : 0);

  const allCounts = {
    approvalsHub: approvalsHubCount, pendingReclaimCount, pendingCostTier1Hub,
    pendingDownPaymentCount, pendingMmpCount, pendingTier2CostCount, pendingFinanceCount,
    unreadNotifCount, openIncidentCount, pendingVerificationCount, pendingWalletCount,
    myTasksOverdueCount, changelogUnreadCount,
  };

  const menuPrefs: MenuPreferences = useMemo(() => {
    const savedPrefs = userSettings?.settings?.menuPreferences;
    return savedPrefs ? { ...DEFAULT_MENU_PREFERENCES, ...savedPrefs } : DEFAULT_MENU_PREFERENCES;
  }, [userSettings?.settings?.menuPreferences]);

  const perms = {
    dashboard: true,
    projects: checkPermission("projects", "read") || isAdmin || hasAnyRole(["ict"]),
    mmp: checkPermission("mmp", "read") || isAdmin || hasAnyRole(["ict"]),
    monitoringPlan: checkPermission("mmp", "read") || isAdmin || hasAnyRole(["ict"]),
    siteVisits: checkPermission("site_visits", "read") || isAdmin || hasAnyRole(["ict"]),
    archive: checkPermission("reports", "read") || isAdmin,
    fieldTeam: checkPermission("users", "read") || isAdmin,
    fieldOpManager: checkPermission("site_visits", "update") || isAdmin || hasAnyRole(["fom"]),
    dataVisibility: checkPermission("reports", "read") || isAdmin,
    reports: checkPermission("reports", "read") || isAdmin,
    users: checkPermission("users", "read") || isAdmin || hasAnyRole(["ict"]),
    roleManagement: canManageRoles() || isAdmin,
    settings: checkPermission("settings", "read") || isAdmin,
    financialOperations:
      checkPermission("finances", "update") ||
      checkPermission("finances", "approve") ||
      isAdmin || hasAnyRole(["financialAdmin"]),
  };

  const menuGroups = currentUser
    ? getWorkflowMenuGroups(roles || [], currentUser.role, perms, isSuperAdmin, menuPrefs, hasMonitoringAccess)
    : [];

  // Flatten all items for badge-count lookups
  const allItems = useMemo(() => {
    const out: Array<{ id: string; url: string }> = [];
    menuGroups.forEach((g) => g.items.forEach((i) => out.push({ id: i.id, url: i.url })));
    return out;
  }, [menuGroups]);

  // Total badge for a whole group
  const getGroupBadge = useCallback(
    (group: MenuGroup) =>
      group.items.reduce((sum, item) => sum + getBadgeForItem(item.id, allCounts), 0),
    [allCounts]
  );

  // Is any item in a group currently active?
  const isGroupActive = useCallback(
    (group: MenuGroup) => group.items.some((i) => pathname === i.url || pathname.startsWith(i.url + "/")),
    [pathname]
  );

  const getInitials = (name: string) =>
    name.split(" ").map((p) => p[0]).join("").toUpperCase().substring(0, 2);

  const getPrimaryRole = (): string => {
    if (!currentUser) return "";
    if (isSuperAdmin) return "Super Admin";
    const norm = currentUser.role?.toLowerCase().replace(/[\s_-]/g, "");
    if (norm === "superadmin") return "Super Admin";
    if (roles?.includes("admin" as AppRole)) return "Admin";
    const map: Record<string, string> = {
      admin: "Admin", ict: "ICT", fom: "Field Ops Manager",
      financialadmin: "Financial Admin", auditor: "Financial Auditor",
      supervisor: "Supervisor", coordinator: "Coordinator",
      datacollector: "Data Collector", employee: "Employee",
    };
    return map[norm] || currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
  };

  const handleLogout = () => {
    showDueReminders();
    setTimeout(async () => {
      await logout();
      navigate("/auth");
    }, 1500);
  };

  // Close expanded panel when navigating
  useEffect(() => { setActiveGroup(null); }, [pathname]);

  const regularGroups = menuGroups.filter((g: any) => !g.parentGroup);
  const financeGroups = menuGroups.filter((g: any) => g.parentGroup === "finance");

  // Build a synthetic "Payments & Finance" group for the grid tile
  const financeGroupMeta: MenuGroup = {
    id: "finance-parent",
    label: "Payments & Finance",
    order: 5,
    items: financeGroups.flatMap((g) => g.items),
  };
  const allGridGroups = [
    ...regularGroups.filter((g) => g.order < 5).sort((a, b) => a.order - b.order),
    ...(financeGroups.length ? [financeGroupMeta] : []),
    ...regularGroups.filter((g) => g.order >= 5).sort((a, b) => a.order - b.order),
  ];

  const expandedGroup = allGridGroups.find((g) => g.id === activeGroup) ?? null;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <Sidebar
        collapsible="offcanvas"
        className="border-r-0 bg-[#1e1b4b]"
        style={{ "--sidebar-width": expandedGroup ? "560px" : "280px" } as any}
      >
        {/* ── Header ── */}
        <SidebarHeader className="border-b border-white/10 py-0">
          <div className="flex h-14 items-center gap-3 px-4">
            <div className="flex items-center gap-2 flex-1">
              <div className="w-8 h-8 rounded-xl bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/40 shrink-0">
                <img src={Logo} alt="PACT" className="w-5 h-5 object-contain" />
              </div>
              <span className="text-white font-bold text-sm group-data-[collapsible=icon]:hidden">PACT</span>
            </div>

            {/* Notification bell */}
            <Link to="/notifications" className="relative group-data-[collapsible=icon]:hidden">
              <Bell className="w-4.5 h-4.5 text-indigo-300 hover:text-white transition-colors" />
              {unreadNotifCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                  {unreadNotifCount > 9 ? "9+" : unreadNotifCount}
                </span>
              )}
            </Link>

            <SidebarTrigger
              className="h-7 w-7 text-indigo-300 hover:text-white hover:bg-white/10 rounded-lg transition-all group-data-[collapsible=icon]:hidden"
              data-testid="button-sidebar-trigger"
            />
          </div>
        </SidebarHeader>

        {/* ── Content ── */}
        <SidebarContent className="p-0 flex flex-row overflow-hidden">
          {/* Left column — icon grid (280px) */}
          <div className="w-[280px] shrink-0 flex flex-col overflow-hidden">
            <nav className="flex-1 px-3 pt-3 pb-2 overflow-y-auto">
              <div className="grid grid-cols-3 gap-2">
                {allGridGroups.map((group) => {
                  const badge     = getGroupBadge(group);
                  const active    = isGroupActive(group);
                  const expanded  = activeGroup === group.id;
                  const colors    = GROUP_COLORS[group.id] ?? { icon: "text-indigo-300", bg: "bg-white/10" };
                  // Pick a representative icon from the first item
                  const RepIcon   = group.items[0]?.icon ?? LayoutDashboard;
                  // If group has exactly 1 item, navigate directly; else expand panel
                  const handleClick = () => {
                    if (group.items.length === 1) {
                      navigate(group.items[0].url);
                    } else {
                      setActiveGroup(expanded ? null : group.id);
                    }
                  };

                  return (
                    <Tooltip key={group.id}>
                      <TooltipTrigger asChild>
                        <div
                          onClick={handleClick}
                          data-testid={`nav-group-tile-${group.id}`}
                          className={`
                            flex flex-col items-center gap-1.5 p-2.5 rounded-2xl cursor-pointer
                            transition-all relative select-none
                            ${active || expanded
                              ? "bg-indigo-600 shadow-lg shadow-indigo-500/30"
                              : "hover:bg-white/5"
                            }
                          `}
                        >
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${active || expanded ? "bg-white/20" : colors.bg}`}>
                            <RepIcon className={`w-5 h-5 ${active || expanded ? "text-white" : colors.icon}`} />
                          </div>
                          <span className={`text-[9.5px] font-semibold text-center leading-tight ${active || expanded ? "text-white" : "text-indigo-300/70"}`}>
                            {group.label.split(" ").map((w, i) => (
                              <span key={i} className="block">{w}</span>
                            ))}
                          </span>
                          {badge > 0 && (
                            <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                              {badge > 99 ? "99+" : badge}
                            </span>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs">
                        {group.label}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </nav>

            {/* User card at bottom of icon column */}
            <div className="px-3 pb-3 pt-2 border-t border-white/10">
              <div className="flex justify-around mb-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to="/settings"
                      data-testid="link-settings-tile"
                      className="flex flex-col items-center gap-1 cursor-pointer group"
                    >
                      <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-all">
                        <Settings className="w-4 h-4 text-indigo-300/60 group-hover:text-indigo-200" />
                      </div>
                      <span className="text-[9px] text-indigo-300/50">Settings</span>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">Settings</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleLogout}
                      data-testid="button-logout-tile"
                      className="flex flex-col items-center gap-1 cursor-pointer group"
                    >
                      <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-red-500/20 transition-all">
                        <LogOut className="w-4 h-4 text-indigo-300/60 group-hover:text-red-400" />
                      </div>
                      <span className="text-[9px] text-indigo-300/50">Sign Out</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Sign Out</TooltipContent>
                </Tooltip>
              </div>

              {currentUser && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="flex items-center gap-2.5 bg-white/5 rounded-2xl px-3 py-2.5 w-full hover:bg-white/10 transition-all"
                      data-testid="button-user-menu"
                    >
                      <div className="relative shrink-0">
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={currentUser.avatar} alt={currentUser.name} />
                          <AvatarFallback className="bg-gradient-to-br from-indigo-400 to-purple-500 text-white text-[10px] font-bold">
                            {getInitials(currentUser.name)}
                          </AvatarFallback>
                        </Avatar>
                        <RealtimeStatusDot className="absolute -bottom-0.5 -right-0.5" />
                      </div>
                      <div className="flex-1 text-left min-w-0 group-data-[collapsible=icon]:hidden">
                        <p className="text-white text-[11px] font-semibold truncate">{currentUser.name}</p>
                        <p className="text-indigo-300/60 text-[9.5px] truncate">{getPrimaryRole()}</p>
                      </div>
                      <ChevronUp className="w-3 h-3 text-indigo-300/40 shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="end" className="w-56">
                    <DropdownMenuLabel>
                      <p className="text-sm font-medium">{currentUser.name}</p>
                      <p className="text-xs text-muted-foreground">{currentUser.email}</p>
                    </DropdownMenuLabel>
                    {!isDataCollector && <DropdownMenuSeparator />}
                    {!isDataCollector && (
                      <DropdownMenuItem asChild>
                        <Link to="/settings" data-testid="link-settings">
                          <Settings className="mr-2 h-4 w-4" /><span>Settings</span>
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem asChild>
                      <Link to="/integrations" data-testid="link-integrations">
                        <Link2 className="mr-2 h-4 w-4" /><span>Integrations</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleLogout}
                      className="text-red-600 dark:text-red-500 cursor-pointer"
                      data-testid="button-logout"
                    >
                      <LogOut className="mr-2 h-4 w-4" /><span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Right column — expanded group items (slides in) */}
          {expandedGroup && (
            <div className="flex-1 border-l border-white/10 flex flex-col bg-[#16134a] min-w-0 overflow-hidden">
              {/* Panel header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <p className="text-white text-xs font-bold uppercase tracking-widest truncate">
                  {expandedGroup.label}
                </p>
                <button
                  onClick={() => setActiveGroup(null)}
                  className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all"
                >
                  <X className="w-3 h-3 text-indigo-300" />
                </button>
              </div>

              {/* Item list */}
              <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
                {expandedGroup.items.map((item) => {
                  const Icon    = item.icon;
                  const active  = pathname === item.url || pathname.startsWith(item.url + "/");
                  const badge   = getBadgeForItem(item.id, allCounts);
                  const colors  = GROUP_COLORS[expandedGroup.id] ?? { icon: "text-indigo-300", bg: "bg-white/10" };

                  return (
                    <Link
                      key={item.id}
                      to={item.url}
                      data-testid={`nav-link-${item.id}`}
                      className={`
                        flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all
                        ${active
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                          : "text-indigo-200/70 hover:bg-white/5 hover:text-indigo-100"
                        }
                      `}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${active ? "bg-white/20" : colors.bg}`}>
                        <Icon className={`w-3.5 h-3.5 ${active ? "text-white" : colors.icon}`} />
                      </div>
                      <span className={`text-[12px] flex-1 min-w-0 truncate ${active ? "font-semibold" : "font-medium"}`}>
                        {item.title}
                      </span>
                      {badge > 0 && (
                        <span className={`shrink-0 min-w-[18px] h-4 text-[9px] font-bold rounded-full flex items-center justify-center px-1 ${active ? "bg-white/20 text-white" : "bg-red-500 text-white"}`}>
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </SidebarContent>

        <SidebarRail />
        <SidebarResizeHandle />
      </Sidebar>

      {/* Collapsed-state re-open trigger */}
      {isSidebarCollapsed && (
        <div className="fixed left-4 top-4 z-50 hidden sm:block">
          <SidebarTrigger className="h-10 w-10 rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-gray-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-gray-500 dark:hover:bg-slate-800" />
        </div>
      )}
    </>
  );
};

export default AppSidebarIconFirst;
