  import { useLocation, Link, useNavigate } from "react-router-dom";
  import { Button } from "@/components/ui/button";
  import { 
    Users,
    UsersRound,
    Settings, 
    FolderKanban, 
    Activity,
    Link2,
    Database,
    ClipboardList,
    LogOut,
    LayoutDashboard,
    ChevronUp,
    Shield,
    ShieldCheck,
    Calendar,
    CalendarOff,
    Archive,
    CreditCard,
    DollarSign,
    Award,
    Briefcase,
    Receipt,
    TrendingUp,
    Building2,
    MapPin,
    CheckCircle,
    Pin,
    Eye,
    EyeOff,
    GripVertical,
    Star,
    BarChart3,
    Banknote,
    ClipboardCheck,
    BookOpen,
    FileSignature,
    Phone,
    MessageSquare,
    Bell,
    FileText,
    Map,
    ScrollText,
    Mail,
    Smartphone,
    HelpCircle,
    PenTool,
    PhoneCall,
    RefreshCw,
    Megaphone,
    ScanLine,
    Siren,
    AlertTriangle,
    Package,
    HeartPulse,
    CheckSquare,
    Handshake,
    FolderOpen,
    Compass,
    Lock,
    Inbox,
    FileBarChart,
    CalendarCheck,
    Sparkles,
    FilePlus,
    Wallet,
    Clock,
    Landmark,
    Settings2,
    Zap,
  } from "lucide-react";
  import { RealtimeStatusDot } from '@/components/realtime';
  import { useSiteVisitReminders } from "@/hooks/use-site-visit-reminders";
  import Logo from "../assets/logo.png";
  import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
  import { useAppContext } from "@/context/AppContext";
  import { supabase } from "@/lib/supabase";
  import { 
    Sidebar, 
    SidebarContent, 
    SidebarFooter, 
    SidebarGroup, 
    SidebarGroupContent, 
    SidebarGroupLabel, 
    SidebarHeader, 
    SidebarMenu, 
    SidebarMenuItem, 
    SidebarMenuButton, 
    SidebarTrigger,
    SidebarRail,
    SidebarResizeHandle,
    useSidebar
  } from "@/components/ui/sidebar";
  import { AppRole } from "@/types";
  import { useAuthorization } from "@/hooks/use-authorization";
  import { canSeePath } from "@/lib/page-roles";
  import { useSuperAdmin } from "@/context/superAdmin/SuperAdminContext";
  import { useSettings } from "@/context/settings/SettingsContext";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "@/components/ui/dropdown-menu";
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
  import { ChevronDown } from "lucide-react";
  import { useState, useMemo, useCallback, useEffect } from "react";
  import { useNavBadgeCountsContext } from "@/context/NavBadgeCountsContext";
  import { getChangelogUnreadCount } from "@/lib/changelog-utils";
  import { MenuPreferences, DEFAULT_MENU_PREFERENCES } from "@/types/user-preferences";
  import { normalizeRole } from "@/utils/roleMapping";
  import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
  import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
  import { CSS } from '@dnd-kit/utilities';
  import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

  const ICON_MAP: Record<string, any> = {
    LayoutDashboard,
    CreditCard,
    Receipt,
    FolderKanban,
    Database,
    Building2,
    ClipboardList,
    Activity,
    MapPin,
    CheckCircle,
    Archive,
    Link2,
    Calendar,
    Users,
    Shield,
    ShieldCheck,
    Award,
    Briefcase,
    TrendingUp,
    DollarSign,
    Settings,
    BarChart3,
    Star,
    Pin,
    Eye,
    EyeOff,
    BookOpen,
    FileSignature,
    Phone,
    MessageSquare,
    Bell,
    FileText,
    Map,
    ScrollText,
    Mail,
    Banknote,
    CheckSquare,
    FolderOpen,
    Compass
  };

  interface FavoriteItem {
    id: string;
    title: string;
    url: string;
    icon: any;
  }

  interface SortableFavoriteItemProps {
    item: FavoriteItem;
    isActive: boolean;
    onRemove: (url: string) => void;
  }

  const SortableFavoriteItem = ({ item, isActive, onRemove }: SortableFavoriteItemProps) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: item.url });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <SidebarMenuItem ref={setNodeRef} style={style} className="py-0 group/fav">
        <div className="flex items-center w-full gap-0.5">
          {/* Drag handle — zero width when not hovered so it doesn't push text right */}
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing shrink-0 w-0 overflow-hidden opacity-0 group-hover/fav:w-4 group-hover/fav:opacity-100 transition-all duration-150 flex items-center justify-center"
            aria-label="Drag to reorder"
            data-testid={`drag-handle-${item.id}`}
          >
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </button>

          <SidebarMenuButton
            asChild
            isActive={isActive}
            tooltip={item.title}
            className={`flex-1 min-w-0 rounded text-[13px] font-medium transition-all duration-200
              ${isActive
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 font-semibold"
                : ""
              }`}
          >
            <Link to={item.url} className="flex items-center gap-1.5 w-full" data-testid={`nav-favorite-${item.id}`}>
              <item.icon
                className={`h-4 w-4 shrink-0 ${isActive
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-amber-600 dark:text-amber-400"
                }`}
              />
              <span className="truncate flex-1 min-w-0">{item.title}</span>
            </Link>
          </SidebarMenuButton>

          {/* Remove button — zero width when not hovered */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(item.url); }}
                className="shrink-0 w-0 overflow-hidden opacity-0 group-hover/fav:w-5 group-hover/fav:opacity-100 transition-all duration-150 flex items-center justify-center rounded hover:bg-amber-50 dark:hover:bg-amber-900/20"
                aria-label="Remove from favorites"
                data-testid={`button-unfavorite-${item.id}`}
              >
                <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Remove from favorites</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </SidebarMenuItem>
    );
  };


  

  interface MenuGroup {
    id: string;
    label: string;
    order: number;
    items: Array<{
      id: string;
      title: string;
      url: string;
      icon: any;
      priority: number;
      isPinned?: boolean;
    }>;
  }

  const getWorkflowMenuGroups = (
    roles: AppRole[] = [], 
    defaultRole: string = 'dataCollector',
    perms: Record<string, boolean> = {},
    isSuperAdmin: boolean = false,
    menuPrefs: MenuPreferences = DEFAULT_MENU_PREFERENCES,
    hasMonitoringAccess: boolean = false
  ): MenuGroup[] => {
    const normalizedDefault = normalizeRole(defaultRole);
    const normalizedRoles = roles.map(r => normalizeRole(r)).filter(Boolean);
    const allNormalized = normalizedDefault ? [normalizedDefault, ...normalizedRoles] : normalizedRoles;
    const hasRole = (code: string) => allNormalized.includes(code as any);
    const isAdmin = hasRole('admin');
    const isICT = hasRole('ict');
    const isFinancialAdmin = hasRole('financialAdmin');
    const isAuditor = hasRole('auditor');
    const isDataCollector = hasRole('dataCollector');
    const isCoordinator = hasRole('coordinator');
    const isFOM = hasRole('fom');
    const isSupervisor = hasRole('supervisor');
    const isDataTeam = hasRole('dataTeam');
    const isProjectManager = hasRole('projectManager');
    const isCountryDirector = hasRole('countryDirector');
    const isEmployee = hasRole('employee');

    const isHidden = (url: string) => menuPrefs.hiddenItems.includes(url);
    const isPinned = (url: string) => menuPrefs.pinnedItems.includes(url);

    const groups: MenuGroup[] = [];

    // ── 1. My Workspace ───────────────────────────────────────────────────────
    const workspaceItems: MenuGroup['items'] = [];
    if (!isHidden('/dashboard') && (isSuperAdmin || isAdmin || isICT || isEmployee || perms.dashboard)) {
      workspaceItems.push({ id: 'dashboard', title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, priority: 1, isPinned: isPinned('/dashboard') });
    }
    if (!isHidden('/my-tasks')) {
      workspaceItems.push({ id: 'my-tasks', title: "My Tasks", url: "/my-tasks", icon: CheckSquare, priority: 2, isPinned: isPinned('/my-tasks') });
    }
    if (!isHidden('/team-tasks') && (isSuperAdmin || isAdmin || isCountryDirector || ['ceo','coo','cto','hr_manager'].includes(defaultRole.toLowerCase()))) {
      workspaceItems.push({ id: 'team-tasks', title: "Team Monitor", url: "/team-tasks", icon: Users, priority: 3, isPinned: isPinned('/team-tasks') });
    }
    if (!isHidden('/my-team')) {
      workspaceItems.push({ id: 'my-team', title: "My Team", url: "/my-team", icon: Users, priority: 3, isPinned: isPinned('/my-team') });
    }
    if (!isDataCollector && !isHidden('/calendar')) {
      workspaceItems.push({ id: 'calendar', title: "Calendar", url: "/calendar", icon: Calendar, priority: 3, isPinned: isPinned('/calendar') });
    }
    if (!isHidden('/notifications')) {
      workspaceItems.push({ id: 'notifications', title: "Notifications", url: "/notifications", icon: Bell, priority: 4, isPinned: isPinned('/notifications') });
    }
    if (!isHidden('/workspace')) {
      workspaceItems.push({ id: 'workspace-hub', title: "Workspace Hub", url: "/workspace", icon: FolderOpen, priority: 5, isPinned: isPinned('/workspace') });
    }
    if (workspaceItems.length) groups.push({ id: 'workspace', label: "My Workspace", order: 1, items: workspaceItems });

    // ── 2. Communication ──────────────────────────────────────────────────────
    const communicationItems: MenuGroup['items'] = [];
    if (!isHidden('/chat')) {
      communicationItems.push({ id: 'chat', title: "Chat", url: "/chat", icon: MessageSquare, priority: 1, isPinned: isPinned('/chat') });
    }
    if (!isHidden('/calls')) {
      communicationItems.push({ id: 'calls', title: "Calls", url: "/calls", icon: Phone, priority: 2, isPinned: isPinned('/calls') });
    }
    if (!isHidden('/signatures')) {
      communicationItems.push({ id: 'signatures', title: "Signatures", url: "/signatures", icon: FileSignature, priority: 3, isPinned: isPinned('/signatures') });
    }
    if (!isHidden('/admin/broadcast') && canSeePath('/admin/broadcast', defaultRole)) {
      communicationItems.push({ id: 'admin-broadcast', title: "Broadcast Center", url: "/admin/broadcast", icon: Megaphone, priority: 4, isPinned: isPinned('/admin/broadcast') });
    }
    if (!isHidden('/admin/whatsapp') && canSeePath('/admin/whatsapp', defaultRole)) {
      communicationItems.push({ id: 'admin-whatsapp', title: "WhatsApp Admin", url: "/admin/whatsapp", icon: Smartphone, priority: 5, isPinned: isPinned('/admin/whatsapp') });
    }
    if (communicationItems.length) groups.push({ id: 'communication', label: "Communication", order: 3, items: communicationItems });

    // ── 2. Programme Management ───────────────────────────────────────────────
    const planningItems: MenuGroup['items'] = [];
    if (!isHidden('/projects') && canSeePath('/projects', defaultRole)) {
      planningItems.push({ id: 'projects', title: "Projects", url: "/projects", icon: FolderKanban, priority: 1, isPinned: isPinned('/projects') });
    }
    if (!isHidden('/projects/analytics') && (isSuperAdmin || isAdmin || isFOM || perms.projects)) {
      planningItems.push({ id: 'project-analytics', title: "Project Analytics", url: "/projects/analytics", icon: BarChart3, priority: 2, isPinned: isPinned('/projects/analytics') });
    }
    if (!isHidden('/portfolio') && (isSuperAdmin || isAdmin || isFOM || perms.projects)) {
      planningItems.push({ id: 'portfolio', title: "Portfolio Dashboard", url: "/portfolio", icon: LayoutDashboard, priority: 3, isPinned: isPinned('/portfolio') });
    }
    if (!isHidden('/mmp') && (isSuperAdmin || isAdmin || isICT || isDataTeam || perms.mmp || isCoordinator || isSupervisor || isDataCollector || isFOM)) {
      const mmpTitle = (!isSuperAdmin && (isDataCollector || isCoordinator)) ? "My Sites Management" : "MMP Management";
      planningItems.push({ id: 'mmp-management', title: mmpTitle, url: "/mmp", icon: Database, priority: 4, isPinned: isPinned('/mmp') });
    }
    if (!isHidden('/hub-operations') && canSeePath('/hub-operations', defaultRole)) {
      planningItems.push({ id: 'hub-operations', title: "Hub Operations", url: "/hub-operations", icon: Building2, priority: 4, isPinned: isPinned('/hub-operations') });
    }
    if (!isHidden('/tracker-preparation-plan') && (isSuperAdmin || isAdmin || isICT || isFOM || isProjectManager)) {
      planningItems.push({ id: 'tracker-plan', title: "Tracker Preparation", url: "/tracker-preparation-plan", icon: ClipboardList, priority: 5, isPinned: isPinned('/tracker-preparation-plan') });
    }
    if (planningItems.length) groups.push({ id: 'programme-management', label: "Programme Management", order: 2, items: planningItems });

    // ── 4. Field Operations ───────────────────────────────────────────────────
    const fieldOpsItems: MenuGroup['items'] = [];
    if (!isHidden('/site-visits') && (isSuperAdmin || isAdmin || isICT || perms.siteVisits)) {
      fieldOpsItems.push({ id: 'site-visits', title: "Site Visits", url: "/site-visits", icon: ClipboardList, priority: 1, isPinned: isPinned('/site-visits') });
    }
    if (!isHidden('/monitoring-form') && (isSuperAdmin || isAdmin || isDataCollector || isCoordinator || isSupervisor || isFOM)) {
      fieldOpsItems.push({ id: 'monitoring-form', title: "Monitoring Form", url: "/monitoring-form", icon: ClipboardCheck, priority: 2, isPinned: isPinned('/monitoring-form') });
    }
    if (!isHidden('/safety-hub') && (isSuperAdmin || isAdmin || isICT || isFOM || isCoordinator || isSupervisor || isDataCollector || isDataTeam)) {
      fieldOpsItems.push({ id: 'safety-hub', title: "Safety Hub", url: "/safety-hub", icon: Siren, priority: 3, isPinned: isPinned('/safety-hub') });
    }
    if (!isHidden('/incident-reports') && (isSuperAdmin || isAdmin || isICT || isFOM || isCoordinator || isSupervisor || isDataTeam)) {
      fieldOpsItems.push({ id: 'incident-reports', title: "Incident Reports", url: "/incident-reports", icon: AlertTriangle, priority: 4, isPinned: isPinned('/incident-reports') });
    }
    if (!isHidden('/equipment') && canSeePath('/equipment', defaultRole)) {
      fieldOpsItems.push({ id: 'equipment', title: "Equipment Tracking", url: "/equipment", icon: Package, priority: 5, isPinned: isPinned('/equipment') });
    }
    if (!isHidden('/field-team') && (isSuperAdmin || ((isAdmin || perms.fieldTeam) && !isICT))) {
      fieldOpsItems.push({ id: 'field-team', title: "Field Team", url: "/field-team", icon: Activity, priority: 6, isPinned: isPinned('/field-team') });
    }
    if (!isHidden('/map') && canSeePath('/map', defaultRole)) {
      fieldOpsItems.push({ id: 'advanced-map', title: "Field Map", url: "/map", icon: Map, priority: 7, isPinned: isPinned('/map') });
    }
    if (!isHidden('/field-operation-manager') && canSeePath('/field-operation-manager', defaultRole)) {
      fieldOpsItems.push({ id: 'field-operation-manager', title: "Field Operation Manager", url: "/field-operation-manager", icon: Compass, priority: 8, isPinned: isPinned('/field-operation-manager') });
    }
    if (fieldOpsItems.length) groups.push({ id: 'field-ops', label: "Field Operations", order: 4, items: fieldOpsItems });

    // ── 5. Coordination & Oversight ───────────────────────────────────────────
    const coordinationItems: MenuGroup['items'] = [];
    if (!isHidden('/supervisor/sites') && isSupervisor && !isCoordinator) {
      coordinationItems.push({ id: 'supervisor-site-management', title: "My Site Management", url: "/supervisor/sites", icon: Map, priority: 1, isPinned: isPinned('/supervisor/sites') });
    }
    if (!isHidden('/coordinator/sites') && canSeePath('/coordinator/sites', defaultRole)) {
      coordinationItems.push({ id: 'site-verification', title: "Site Verification", url: "/coordinator/sites", icon: CheckCircle, priority: 2, isPinned: isPinned('/coordinator/sites') });
    }
    if (!isHidden('/coordinator/sites-for-verification') && canSeePath('/coordinator/sites', defaultRole)) {
      coordinationItems.push({ id: 'sites-for-verification', title: "Sites for Verification", url: "/coordinator/sites-for-verification", icon: CheckCircle, priority: 3, isPinned: isPinned('/coordinator/sites-for-verification') });
    }
    if (!isHidden('/admin/staff-profiles') && (isSuperAdmin || isAdmin)) {
      coordinationItems.push({ id: 'staff-directory', title: "Staff Directory", url: "/admin/staff-profiles", icon: UsersRound, priority: 5, isPinned: isPinned('/admin/staff-profiles') });
    }
    if (coordinationItems.length) groups.push({ id: 'coordination', label: "Coordination & Oversight", order: 4.5, items: coordinationItems });

    // ── 6. Payments & Finance (sub-groups) ────────────────────────────────────
    const myMoneyItems: MenuGroup['items'] = [];
    if (!isHidden('/wallet') && (isFinancialAdmin || isAuditor || isFOM || isSupervisor || isDataCollector || isCoordinator)) {
      myMoneyItems.push({ id: 'my-wallet', title: "My Wallet", url: "/wallet", icon: CreditCard, priority: 1, isPinned: isPinned('/wallet') });
    }
    if (!isHidden('/cost-submission') && (isSuperAdmin || isAdmin || isSupervisor || isFOM || isCoordinator || isDataTeam)) {
      myMoneyItems.push({ id: 'cost-submission', title: "Cost Submission", url: "/cost-submission", icon: Receipt, priority: 2, isPinned: isPinned('/cost-submission') });
    }
    if (myMoneyItems.length) groups.push({ id: 'finance-my-money', label: "My Money", order: 5.1, items: myMoneyItems, parentGroup: 'finance' } as any);

    const approvalItems: MenuGroup['items'] = [];
    if (!isHidden('/approvals') && (isSuperAdmin || isAdmin || isFinancialAdmin || isSupervisor || isFOM)) {
      approvalItems.push({ id: 'approvals-hub', title: "Approvals Hub", url: "/approvals", icon: Inbox, priority: 0, isPinned: isPinned('/approvals') });
    }
    if (!isHidden('/supervisor-approvals') && canSeePath('/supervisor-approvals', defaultRole)) {
      approvalItems.push({ id: 'supervisor-approvals', title: "Tier 1 Approvals", url: "/supervisor-approvals", icon: ClipboardCheck, priority: 1, isPinned: isPinned('/supervisor-approvals') });
    }
    if (!isHidden('/withdrawal-approval') && canSeePath('/withdrawal-approval', defaultRole)) {
      approvalItems.push({ id: 'withdrawal-approval', title: "Tier 2 Approvals", url: "/withdrawal-approval", icon: ClipboardCheck, priority: 2, isPinned: isPinned('/withdrawal-approval') });
    }
    if (!isHidden('/down-payment-approval') && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor || isSupervisor)) {
      approvalItems.push({ id: 'down-payment-approval', title: "Down-Payment Approval", url: "/down-payment-approval", icon: DollarSign, priority: 3, isPinned: isPinned('/down-payment-approval') });
    }
    if (!isHidden('/finance-approval') && canSeePath('/finance-approval', defaultRole)) {
      approvalItems.push({ id: 'finance-approval', title: "Finance Processing", url: "/finance-approval", icon: Banknote, priority: 4, isPinned: isPinned('/finance-approval') });
    }
    if (approvalItems.length) groups.push({ id: 'finance-approvals', label: "Approvals", order: 5.2, items: approvalItems, parentGroup: 'finance' } as any);

    const finMgmtItems: MenuGroup['items'] = [];
    if (!isHidden('/budget') && canSeePath('/budget', defaultRole)) {
      finMgmtItems.push({ id: 'budget', title: "Budget", url: "/budget", icon: DollarSign, priority: 1, isPinned: isPinned('/budget') });
    }
    if (!isHidden('/admin/wallets') && canSeePath('/admin/wallets', defaultRole)) {
      finMgmtItems.push({ id: 'wallets', title: "Wallets Admin", url: "/admin/wallets", icon: CreditCard, priority: 2, isPinned: isPinned('/admin/wallets') });
    }
    if (!isHidden('/financial-operations') && (canSeePath('/financial-operations', defaultRole) || perms.financialOperations)) {
      finMgmtItems.push({ id: 'financial-ops', title: "Financial Operations", url: "/financial-operations", icon: TrendingUp, priority: 3, isPinned: isPinned('/financial-operations') });
    }
    if (!isHidden('/reconciliation-dashboard') && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor)) {
      finMgmtItems.push({ id: 'reconciliation-dashboard', title: "Reconciliation Dashboard", url: "/reconciliation-dashboard", icon: ClipboardCheck, priority: 5, isPinned: isPinned('/reconciliation-dashboard') });
    }
    if (!isHidden('/subscriptions') && (isSuperAdmin || isAdmin || isFinancialAdmin || isCountryDirector)) {
      finMgmtItems.push({ id: 'subscriptions', title: "Subscriptions", url: "/subscriptions", icon: CreditCard, priority: 6, isPinned: isPinned('/subscriptions') });
    }
    if (finMgmtItems.length) groups.push({ id: 'finance-management', label: "Financial Management", order: 5.3, items: finMgmtItems, parentGroup: 'finance' } as any);

    const finReportItems: MenuGroup['items'] = [];
    if (!isHidden('/wallet-reports') && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor)) {
      finReportItems.push({ id: 'wallet-reports', title: "Wallet Reports", url: "/wallet-reports", icon: BarChart3, priority: 1, isPinned: isPinned('/wallet-reports') });
    }
    if (!isHidden('/advance-requests-report') && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor || isSupervisor || isFOM)) {
      finReportItems.push({ id: 'advance-requests-report', title: "Transport Advance Report", url: "/advance-requests-report", icon: BarChart3, priority: 2, isPinned: isPinned('/advance-requests-report') });
    }
    if (!isHidden('/cost-predictions') && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor)) {
      finReportItems.push({ id: 'cost-predictions', title: "Cost Predictions", url: "/cost-predictions", icon: TrendingUp, priority: 3, isPinned: isPinned('/cost-predictions') });
    }
    if (!isHidden('/exchange-rates') && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor)) {
      finReportItems.push({ id: 'exchange-rates', title: "Exchange Rates", url: "/exchange-rates", icon: DollarSign, priority: 4, isPinned: isPinned('/exchange-rates') });
    }
    if (!isHidden('/salary-retainer-report') && (isSuperAdmin || isAdmin || isFinancialAdmin || isCountryDirector)) {
      finReportItems.push({ id: 'salary-retainer-report', title: "Salary & Retainer Report", url: "/salary-retainer-report", icon: Users, priority: 5, isPinned: isPinned('/salary-retainer-report') });
    }
    if (!isHidden('/month-end-summary') && (isSuperAdmin || isAdmin || isFinancialAdmin || isCountryDirector)) {
      finReportItems.push({ id: 'month-end-summary', title: "Month-End Summary", url: "/month-end-summary", icon: CalendarCheck, priority: 6, isPinned: isPinned('/month-end-summary') });
    }
    if (finReportItems.length) groups.push({ id: 'finance-reports', label: "Financial Reports", order: 5.4, items: finReportItems, parentGroup: 'finance' } as any);

    // ── Accounting module: Super Admin only ──────────────────────────────────
    // All accounting pages are restricted to super_admin until the module is
    // ready for wider rollout. Change isSuperAdmin → the desired role set
    // when you are ready to open access.
    const acctItems: MenuGroup['items'] = [];
    if (isSuperAdmin) {
      if (!isHidden('/accounting/finance-dashboard')) acctItems.push({ id: 'accounting-finance-dashboard', title: 'Finance Dashboard', url: '/accounting/finance-dashboard', icon: LayoutDashboard, priority: 0.5, isPinned: isPinned('/accounting/finance-dashboard') });
      if (!isHidden('/accounting/coa')) acctItems.push({ id: 'accounting-coa', title: 'Chart of Accounts', url: '/accounting/coa', icon: BarChart3, priority: 1, isPinned: isPinned('/accounting/coa') });
      if (!isHidden('/accounting/journals')) acctItems.push({ id: 'accounting-journals', title: 'Journal Entries', url: '/accounting/journals', icon: Receipt, priority: 2, isPinned: isPinned('/accounting/journals') });
      if (!isHidden('/accounting/trial-balance')) acctItems.push({ id: 'accounting-trial-balance', title: 'Trial Balance', url: '/accounting/trial-balance', icon: TrendingUp, priority: 3, isPinned: isPinned('/accounting/trial-balance') });
      if (!isHidden('/accounting/ledger')) acctItems.push({ id: 'accounting-ledger', title: 'General Ledger', url: '/accounting/ledger', icon: BookOpen, priority: 3.5, isPinned: isPinned('/accounting/ledger') });
      if (!isHidden('/accounting/reports')) acctItems.push({ id: 'accounting-reports', title: 'Financial Statements', url: '/accounting/reports', icon: FileText, priority: 3.6, isPinned: isPinned('/accounting/reports') });
      if (!isHidden('/accounting/bank-recon')) acctItems.push({ id: 'accounting-bank-recon', title: 'Bank Reconciliation', url: '/accounting/bank-recon', icon: Landmark, priority: 3.7, isPinned: isPinned('/accounting/bank-recon') });
      if (!isHidden('/accounting/budget-variance')) acctItems.push({ id: 'accounting-budget-variance', title: 'Budget vs. Actual', url: '/accounting/budget-variance', icon: BarChart3, priority: 3.8, isPinned: isPinned('/accounting/budget-variance') });
      if (!isHidden('/accounting/vendors')) acctItems.push({ id: 'accounting-vendors', title: 'Vendor Registry', url: '/accounting/vendors', icon: Building2, priority: 3.9, isPinned: isPinned('/accounting/vendors') });
      if (!isHidden('/accounting/purchase-orders')) acctItems.push({ id: 'accounting-purchase-orders', title: 'Purchase Orders', url: '/accounting/purchase-orders', icon: ClipboardList, priority: 3.905, isPinned: isPinned('/accounting/purchase-orders') });
      if (!isHidden('/accounting/ap-aging')) acctItems.push({ id: 'accounting-ap-aging', title: 'AP Aging', url: '/accounting/ap-aging', icon: Clock, priority: 3.91, isPinned: isPinned('/accounting/ap-aging') });
      if (!isHidden('/accounting/cash-flow')) acctItems.push({ id: 'accounting-cash-flow', title: 'Cash Flow', url: '/accounting/cash-flow', icon: Activity, priority: 3.92, isPinned: isPinned('/accounting/cash-flow') });
      if (!isHidden('/accounting/fixed-assets')) acctItems.push({ id: 'accounting-fixed-assets', title: 'Fixed Assets', url: '/accounting/fixed-assets', icon: Package, priority: 3.93, isPinned: isPinned('/accounting/fixed-assets') });
      if (!isHidden('/accounting/gl-bridge')) acctItems.push({ id: 'accounting-gl-bridge', title: 'GL Bridge Engine', url: '/accounting/gl-bridge', icon: Zap, priority: 3.94, isPinned: isPinned('/accounting/gl-bridge') });
      if (!isHidden('/finance/audit-trail')) acctItems.push({ id: 'finance-audit-trail', title: 'Finance Audit Trail', url: '/finance/audit-trail', icon: BarChart3, priority: 4, isPinned: isPinned('/finance/audit-trail') });
      if (!isHidden('/accounting/fiscal-years')) acctItems.push({ id: 'accounting-fiscal-years', title: 'Fiscal Years & Periods', url: '/accounting/fiscal-years', icon: Calendar, priority: 5, isPinned: isPinned('/accounting/fiscal-years') });
      if (!isHidden('/accounting/funds')) acctItems.push({ id: 'accounting-funds', title: 'Funds', url: '/accounting/funds', icon: Landmark, priority: 6, isPinned: isPinned('/accounting/funds') });
      if (!isHidden('/accounting/settings')) acctItems.push({ id: 'accounting-settings', title: 'Accounting Settings', url: '/accounting/settings', icon: Settings2, priority: 7, isPinned: isPinned('/accounting/settings') });
    }
    if (acctItems.length) groups.push({ id: 'finance-accounting', label: 'Accounting', order: 5.5, items: acctItems, parentGroup: 'finance' } as any);

    // ── 7. HR & People — logical flow: Employees → Payroll → Retainer → Leave → Analytics → My Payslip ──
    const hrItems: MenuGroup['items'] = [];
    // 1. Employees — admin & super admin only; data shows all except coordinators & data collectors
    const hrAdminAccess = isSuperAdmin || isAdmin || isFinancialAdmin;
    const hrStrictAccess = isSuperAdmin || isAdmin;
    if (!isHidden('/employees') && hrStrictAccess) {
      hrItems.push({ id: 'employees', title: "Employees", url: "/employees", icon: Users, priority: 1, isPinned: isPinned('/employees') });
    }
    // 2. Payroll — salary setup, run payroll, payslips, reports (admin only)
    if (!isHidden('/hr') && hrAdminAccess) {
      hrItems.push({ id: 'payroll-admin', title: "Payroll", url: "/hr?tab=payroll-admin", icon: Banknote, priority: 2, isPinned: false });
    }
    // 3. Retainer Payments — admin & super admin only; data shows coordinator-role users only
    if (!isHidden('/retainer-management') && hrStrictAccess) {
      hrItems.push({ id: 'retainer-hr', title: "Retainer Payments", url: "/retainer-management", icon: CreditCard, priority: 3, isPinned: isPinned('/retainer-management') });
    }
    // 4. Leave Requests — all staff submit; admins approve
    if (!isHidden('/leave')) {
      hrItems.push({ id: 'leave-requests', title: "Leave Requests", url: "/leave", icon: CalendarOff, priority: 4, isPinned: isPinned('/leave') });
    }
    // 5. HR Analytics — staff cost projections, org chart, budget vs actual (admin only)
    if (!isHidden('/hr') && hrAdminAccess) {
      hrItems.push({ id: 'hr-analytics', title: "HR Analytics", url: "/hr?tab=hr-tools", icon: TrendingUp, priority: 5, isPinned: false });
    }
    // 6. Timesheet — daily work log for all staff
    if (!isHidden('/hr')) {
      hrItems.push({ id: 'timesheet', title: "Timesheet", url: "/hr?tab=timesheet", icon: ClipboardCheck, priority: 6, isPinned: false });
    }
    // 7. Performance Reviews — admin-managed annual/quarterly reviews
    if (!isHidden('/hr') && hrAdminAccess) {
      hrItems.push({ id: 'performance-reviews', title: "Performance Reviews", url: "/hr?tab=performance", icon: Activity, priority: 7, isPinned: false });
    }
    // 8. Salary Increments — merit-based increment management
    if (!isHidden('/hr') && hrAdminAccess) {
      hrItems.push({ id: 'salary-increments', title: "Salary Increments", url: "/hr?tab=salary-increments", icon: Award, priority: 8, isPinned: false });
    }
    // 9. My Payslip — personal payslip for every staff member
    if (!isHidden('/hr')) {
      hrItems.push({ id: 'my-payslip', title: "My Payslip", url: "/hr?tab=payroll", icon: Receipt, priority: 9, isPinned: isPinned('/hr') });
    }
    // 10. Positions / Vacancies — visible to everyone, edit-restricted via RLS
    if (!isHidden('/positions')) {
      hrItems.push({ id: 'positions', title: "Positions & Vacancies", url: "/positions", icon: Briefcase, priority: 10, isPinned: isPinned('/positions') });
    }
    // 11. Training & Certifications — every staff sees their own; admins see all
    if (!isHidden('/training-certifications')) {
      hrItems.push({ id: 'training-certifications', title: "Training & Certifications", url: "/training-certifications", icon: Award, priority: 11, isPinned: isPinned('/training-certifications') });
    }
    // 12. Hierarchy Audit Log — admin & super admin only
    if (!isHidden('/hierarchy-audit') && (isSuperAdmin || isAdmin)) {
      hrItems.push({ id: 'hierarchy-audit', title: "Hierarchy Audit Log", url: "/hierarchy-audit", icon: ScrollText, priority: 12, isPinned: isPinned('/hierarchy-audit') });
    }
    // 13–16. HR audit gaps H2-H5 self-service pages
    if (!isHidden('/my-advances')) {
      hrItems.push({ id: 'my-advances', title: "My Advances", url: "/my-advances", icon: Wallet, priority: 13, isPinned: isPinned('/my-advances') });
    }
    if (!isHidden('/my-expenses')) {
      hrItems.push({ id: 'my-expenses', title: "My Expenses", url: "/my-expenses", icon: Receipt, priority: 14, isPinned: isPinned('/my-expenses') });
    }
    if (!isHidden('/attendance')) {
      hrItems.push({ id: 'attendance', title: "Attendance", url: "/attendance", icon: Clock, priority: 15, isPinned: isPinned('/attendance') });
    }
    if (!isHidden('/offboarding') && (isSuperAdmin || isAdmin || ['hr','hr_manager','financialadmin','financial_admin','finance'].includes(defaultRole.toLowerCase()))) {
      hrItems.push({ id: 'offboarding', title: "Offboarding", url: "/offboarding", icon: LogOut, priority: 16, isPinned: isPinned('/offboarding') });
    }
    if (hrItems.length) groups.push({ id: 'hr-people', label: "HR & People", order: 5.6, items: hrItems });

    // ── 8. CRM ────────────────────────────────────────────────────────────────
    const crmItems: MenuGroup['items'] = [];
    const hasCrmAccess = isSuperAdmin || isAdmin || isFOM || isProjectManager || isCountryDirector;
    if (hasCrmAccess) {
      if (!isHidden('/crm')) {
        crmItems.push({ id: 'crm-overview', title: 'CRM Overview', url: '/crm', icon: Handshake, priority: 1, isPinned: isPinned('/crm') });
      }
      if (!isHidden('/crm/partners')) {
        crmItems.push({ id: 'crm-partners', title: 'Partners & Donors', url: '/crm/partners', icon: Building2, priority: 2, isPinned: isPinned('/crm/partners') });
      }
      if (!isHidden('/crm/contacts')) {
        crmItems.push({ id: 'crm-contacts', title: 'Contacts', url: '/crm/contacts', icon: Users, priority: 3, isPinned: isPinned('/crm/contacts') });
      }
      if (!isHidden('/crm/engagements')) {
        crmItems.push({ id: 'crm-engagements', title: 'Engagements', url: '/crm/engagements', icon: MessageSquare, priority: 4, isPinned: isPinned('/crm/engagements') });
      }
      if (!isHidden('/crm/opportunities')) {
        crmItems.push({ id: 'crm-opportunities', title: 'Pipeline', url: '/crm/opportunities', icon: TrendingUp, priority: 5, isPinned: isPinned('/crm/opportunities') });
      }
    }
    if (crmItems.length) groups.push({ id: 'crm', label: 'CRM', order: 5.8, items: crmItems });

    // ── Surveys ───────────────────────────────────────────────────────────────
    const hasSurveyAccess = isSuperAdmin || isAdmin || isFOM || isCountryDirector || isProjectManager;
    if (hasSurveyAccess && !isHidden('/surveys')) {
      groups.push({
        id: 'surveys',
        label: 'Surveys',
        order: 5.9,
        items: [
          { id: 'surveys', title: 'Surveys', url: '/surveys', icon: ClipboardList, priority: 1, isPinned: isPinned('/surveys') },
        ],
      });
    }

    // ── 9. Analytics & Reports ────────────────────────────────────────────────
    const analyticsItems: MenuGroup['items'] = [];
    if (!isHidden('/data-export-center') && (isSuperAdmin || isAdmin)) {
      analyticsItems.push({ id: 'data-export-center', title: "Data Export Center", url: "/data-export-center", icon: BarChart3, priority: 1, isPinned: isPinned('/data-export-center') });
    }
    if (!isHidden('/data-visibility') && (isSuperAdmin || ((isAdmin || perms.dataVisibility) && !isICT))) {
      analyticsItems.push({ id: 'data-visibility', title: "Data Visibility", url: "/data-visibility", icon: Link2, priority: 2, isPinned: isPinned('/data-visibility') });
    }
    if (!isHidden('/reports') && (isSuperAdmin || ((isAdmin || perms.reports) && !isICT))) {
      analyticsItems.push({ id: 'reports', title: "Reports", url: "/reports", icon: BarChart3, priority: 3, isPinned: isPinned('/reports') });
    }
    if (!isHidden('/documents') && (isSuperAdmin || isAdmin || isICT || isFinancialAdmin || isAuditor)) {
      analyticsItems.push({ id: 'documents', title: "Documents", url: "/documents", icon: FileText, priority: 4, isPinned: isPinned('/documents') });
    }
    if (!isHidden('/archive') && (isSuperAdmin || isAdmin || perms.archive)) {
      analyticsItems.push({ id: 'archive', title: "Archive", url: "/archive", icon: Archive, priority: 5, isPinned: isPinned('/archive') });
    }
    if (!isHidden('/questionnaire-analytics') && (isSuperAdmin || isAdmin || isDataTeam || isFOM || isCountryDirector)) {
      analyticsItems.push({ id: 'questionnaire-analytics', title: "Questionnaire Analytics", url: "/questionnaire-analytics", icon: BarChart3, priority: 6, isPinned: isPinned('/questionnaire-analytics') });
    }
    if (!isHidden('/dct-pdm') && (isSuperAdmin || isAdmin || isICT)) {
      analyticsItems.push({ id: 'dct-pdm', title: "DCT PDM Dashboard", url: "/dct-pdm", icon: BarChart3, priority: 8, isPinned: isPinned('/dct-pdm') });
    }
    if (analyticsItems.length) groups.push({ id: 'analytics', label: "Analytics & Reports", order: 6, items: analyticsItems });

    // ── 10. Administration ────────────────────────────────────────────────────
    const adminItems: MenuGroup['items'] = [];
    if (!isHidden('/users') && (canSeePath('/users', defaultRole) || perms.users)) {
      adminItems.push({ id: 'user-management', title: "User Management", url: "/users", icon: Users, priority: 1, isPinned: isPinned('/users') });
    }
    if (!isHidden('/audit-compliance') && (isSuperAdmin || isAdmin || isICT)) {
      adminItems.push({ id: 'audit-compliance', title: "Audit & Compliance", url: "/audit-compliance", icon: Shield, priority: 2, isPinned: isPinned('/audit-compliance') });
    }
    if (!isHidden('/hub-management') && (isSuperAdmin || isAdmin || isICT)) {
      adminItems.push({ id: 'hub-management', title: "Hub Management", url: "/hub-management", icon: Building2, priority: 3, isPinned: isPinned('/hub-management') });
    }
    if (!isHidden('/departments') && canSeePath('/departments', defaultRole)) {
      adminItems.push({ id: 'departments', title: "Departments", url: "/departments", icon: Building2, priority: 4, isPinned: isPinned('/departments') });
    }
    if (!isHidden('/role-management') && (canSeePath('/role-management', defaultRole) || perms.roleManagement)) {
      adminItems.push({ id: 'role-management', title: "Role Management", url: "/role-management", icon: Shield, priority: 4, isPinned: isPinned('/role-management') });
    }
    if (!isHidden('/page-access') && isSuperAdmin) {
      adminItems.push({ id: 'page-access', title: "Page Access Control", url: "/page-access", icon: Lock, priority: 5, isPinned: isPinned('/page-access') });
    }
    if (!isHidden('/classifications') && canSeePath('/classifications', defaultRole)) {
      adminItems.push({ id: 'classifications', title: "Classifications", url: "/classifications", icon: Award, priority: 5, isPinned: isPinned('/classifications') });
    }
    if (!isHidden('/classification-fees') && canSeePath('/classification-fees', defaultRole)) {
      adminItems.push({ id: 'classification-fees', title: "Classification Fees", url: "/classification-fees", icon: DollarSign, priority: 6, isPinned: isPinned('/classification-fees') });
    }
    if (!isHidden('/task-admin') && canSeePath('/task-admin', defaultRole)) {
      adminItems.push({ id: 'task-admin', title: "Task Admin", url: "/task-admin", icon: CheckSquare, priority: 7, isPinned: isPinned('/task-admin') });
    }
    if (!isHidden('/admin/project-flow-stages') && (isSuperAdmin || isAdmin)) {
      adminItems.push({ id: 'admin-project-flow-stages', title: "Project Flow Stages", url: "/admin/project-flow-stages", icon: ClipboardList, priority: 7, isPinned: isPinned('/admin/project-flow-stages') });
    }
    if (!isHidden('/settings') && (isSuperAdmin || ((isAdmin || perms.settings) && !isDataCollector))) {
      adminItems.push({ id: 'settings', title: "Settings", url: "/settings", icon: Settings, priority: 8, isPinned: isPinned('/settings') });
    }
    if (!isSuperAdmin && hasMonitoringAccess && !isHidden('/admin/monitoring')) {
      adminItems.push({ id: 'monitoring-dashboard', title: "System Monitoring", url: "/admin/monitoring", icon: Activity, priority: 8, isPinned: isPinned('/admin/monitoring') });
    }
    if (adminItems.length) groups.push({ id: 'admin', label: "Administration", order: 7, items: adminItems });

    // ── 11. Help & Support ────────────────────────────────────────────────────
    const helpItems: MenuGroup['items'] = [];
    if (!isHidden('/changelog')) {
      helpItems.push({ id: 'changelog', title: "What's New", url: "/changelog", icon: Sparkles, priority: 0, isPinned: isPinned('/changelog') });
    }
    if (!isHidden('/documentation')) {
      helpItems.push({ id: 'documentation', title: "Documentation", url: "/documentation", icon: BookOpen, priority: 1, isPinned: isPinned('/documentation') });
    }
    if (!isHidden('/mobile-documentation')) {
      helpItems.push({ id: 'mobile-documentation', title: "Mobile User Manual", url: "/mobile-documentation", icon: Smartphone, priority: 2, isPinned: isPinned('/mobile-documentation') });
    }
    if (!isHidden('/helpline')) {
      helpItems.push({ id: 'helpline', title: "Helpline & Emergency Contacts", url: "/helpline", icon: HeartPulse, priority: 3, isPinned: isPinned('/helpline') });
    }
    if (!isHidden('/mobile-support-tickets') && (isSuperAdmin || isAdmin)) {
      helpItems.push({ id: 'mobile-support-tickets', title: "Mobile Support Tickets", url: "/mobile-support-tickets", icon: Smartphone, priority: 4, isPinned: isPinned('/mobile-support-tickets') });
    }
    if (helpItems.length) groups.push({ id: 'help', label: "Help & Support", order: 8, items: helpItems });

    // ── 12. Super Admin ───────────────────────────────────────────────────────
    if (isSuperAdmin) {
      const superAdminItems: MenuGroup['items'] = [];
      if (!isHidden('/super-admin-management')) {
        superAdminItems.push({ id: 'super-admin', title: "Super Admin Management", url: "/super-admin-management", icon: ShieldCheck, priority: 1, isPinned: isPinned('/super-admin-management') });
      }
      if (!isHidden('/admin/monitoring')) {
        superAdminItems.push({ id: 'monitoring-dashboard', title: "System Monitoring", url: "/admin/monitoring", icon: Activity, priority: 2, isPinned: isPinned('/admin/monitoring') });
      }
      if (!isHidden('/admin/cycle-health')) {
        superAdminItems.push({ id: 'cycle-health', title: "Cycle Health Dashboard", url: "/admin/cycle-health", icon: HeartPulse, priority: 3, isPinned: isPinned('/admin/cycle-health') });
      }
      if (!isHidden('/approval-dashboard')) {
        superAdminItems.push({ id: 'approval-dashboard', title: "Approval Dashboard", url: "/approval-dashboard", icon: ClipboardCheck, priority: 3, isPinned: isPinned('/approval-dashboard') });
      }
      if (!isHidden('/permissions-management')) {
        superAdminItems.push({ id: 'permissions-management', title: "User Permissions", url: "/permissions-management", icon: ShieldCheck, priority: 4, isPinned: isPinned('/permissions-management') });
      }
      if (!isHidden('/audit-logs')) {
        superAdminItems.push({ id: 'audit-logs', title: "Audit Logs", url: "/audit-logs", icon: ScrollText, priority: 5, isPinned: isPinned('/audit-logs') });
      }
      if (!isHidden('/email-tracking')) {
        superAdminItems.push({ id: 'email-tracking', title: "Email Tracking", url: "/email-tracking", icon: Mail, priority: 6, isPinned: isPinned('/email-tracking') });
      }
      if (!isHidden('/email-management')) {
        superAdminItems.push({ id: 'email-management', title: "Email Management", url: "/email-management", icon: Mail, priority: 7, isPinned: isPinned('/email-management') });
      }
      if (!isHidden('/email-preview')) {
        superAdminItems.push({ id: 'email-preview', title: "Email Preview", url: "/email-preview", icon: Eye, priority: 8, isPinned: isPinned('/email-preview') });
      }
      if (!isHidden('/admin/transaction-scanner')) {
        superAdminItems.push({ id: 'transaction-scanner', title: "Transaction Scanner", url: "/admin/transaction-scanner", icon: ScanLine, priority: 9, isPinned: isPinned('/admin/transaction-scanner') });
      }
      if (!isHidden('/mobile-help-articles')) {
        superAdminItems.push({ id: 'mobile-help-articles', title: "Mobile Help Articles", url: "/mobile-help-articles", icon: HelpCircle, priority: 10, isPinned: isPinned('/mobile-help-articles') });
      }
      if (!isHidden('/mobile-signatures')) {
        superAdminItems.push({ id: 'mobile-signatures', title: "Mobile Signatures", url: "/mobile-signatures", icon: PenTool, priority: 11, isPinned: isPinned('/mobile-signatures') });
      }
      if (!isHidden('/mobile-call-scheduling')) {
        superAdminItems.push({ id: 'mobile-call-scheduling', title: "Mobile Call Scheduling", url: "/mobile-call-scheduling", icon: PhoneCall, priority: 12, isPinned: isPinned('/mobile-call-scheduling') });
      }
      if (!isHidden('/mobile-document-sync')) {
        superAdminItems.push({ id: 'mobile-document-sync', title: "Mobile Document Sync", url: "/mobile-document-sync", icon: RefreshCw, priority: 13, isPinned: isPinned('/mobile-document-sync') });
      }
      if (!isHidden('/super-admin-data')) {
        superAdminItems.push({ id: 'super-admin-data', title: "Data Management", url: "/super-admin-data", icon: Database, priority: 14, isPinned: isPinned('/super-admin-data') });
      }
      if (superAdminItems.length) groups.push({ id: 'super-admin', label: "Super Admin", order: 9, items: superAdminItems });
    }

    groups.forEach(group => {
      group.items.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return a.priority - b.priority;
      });
    });

    return groups;
  };

  const AppSidebar = () => {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const { currentUser, logout, roles } = useAppContext();
    const { showDueReminders } = useSiteVisitReminders();
    const { state } = useSidebar();
    const isSidebarCollapsed = state === 'collapsed';
    const { isSuperAdmin } = useSuperAdmin();
    const { userSettings, updateMenuPreferences, menuPreferences: contextMenuPrefs } = useSettings();

    // Check if non-super-admin user has been explicitly granted monitoring page access
    // Uses a SECURITY DEFINER RPC to bypass RLS (direct table query blocked for non-admins)
    const [hasMonitoringAccess, setHasMonitoringAccess] = useState(false);
    useEffect(() => {
      if (isSuperAdmin || !currentUser?.id) return;
      supabase
        .rpc('check_monitoring_access')
        .then(({ data, error }) => {
          if (!error) setHasMonitoringAccess(!!data);
        });
    }, [isSuperAdmin, currentUser?.id]);
    
    const { checkPermission, hasAnyRole, canManageRoles } = useAuthorization();
    const isAdmin = hasAnyRole(['admin']);
    const isDataCollector = roles?.includes('DataCollector' as AppRole) || 
                            roles?.includes('dataCollector' as AppRole) || 
                            currentUser?.role?.toLowerCase() === 'datacollector' ||
                            currentUser?.role?.toLowerCase() === 'data collector';

    // Pre-compute stable role booleans so they can be used as useEffect deps
    // (the hasAnyRole function reference changes every render — never put it in deps)
    const roleIsCoordinator = hasAnyRole(['coordinator', 'Coordinator']);
    const roleIsSupervisor   = hasAnyRole(['supervisor', 'Supervisor', 'hubSupervisor', 'hub_supervisor']);
    const roleIsFomOrAdmin   = isSuperAdmin || hasAnyRole(['fom', 'FOM', 'admin', 'Admin']);
    const roleIsFinance      = isSuperAdmin || hasAnyRole(['fom', 'FOM', 'admin', 'Admin', 'financial_auditor', 'financialAdmin', 'financialadmin']);
    const roleCanSeeIncident = isSuperAdmin || hasAnyRole(['admin', 'Admin', 'fom', 'FOM', 'supervisor', 'Supervisor', 'hubSupervisor', 'hub_supervisor']);

    const ALL_GROUP_IDS = ['workspace','communication','programme-management','field-ops','coordination','finance-parent','hr-people','crm','surveys','analytics','admin','help','super-admin'];
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
      try {
        const stored = localStorage.getItem('pact-sidebar-collapsed');
        if (stored !== null) {
          const parsed: string[] = JSON.parse(stored);
          // If the stored value was the old "everything collapsed" default, ignore it
          if (parsed.length >= ALL_GROUP_IDS.length) return new Set();
          return new Set(parsed);
        }
      } catch {}
      return new Set(); // default: all groups open
    });
    const [isFavoritesCollapsed, setIsFavoritesCollapsed] = useState(() => {
      try {
        const stored = localStorage.getItem('pact-favorites-collapsed');
        if (stored !== null) return stored === 'true';
      } catch {}
      return true;
    });

    const { counts } = useNavBadgeCountsContext();
    const pendingReclaimCount = counts.pendingReclaimCount;
    const pendingCostApprovalCount = counts.pendingCostTier1Hub;
    const pendingDownPaymentCount = counts.pendingDpSupervisor;
    const pendingMmpCount = roleIsCoordinator
      ? counts.pendingMmpCoordinator
      : counts.pendingMmpUnassigned;
    const pendingTier2CostCount = counts.pendingTier2Cost;
    const pendingFinanceCount = counts.pendingFinanceDp;
    const unreadNotifCount = counts.unreadNotifications;
    const openIncidentCount = counts.openIncidents;
    const pendingVerificationCount = counts.pendingVerification;
    const pendingWalletCount = counts.pendingWallet;
    const myTasksOverdueCount = counts.myTasksOverdue;
    const changelogUnreadCount = getChangelogUnreadCount(currentUser?.id ?? '', currentUser?.role ?? '');

    // Aggregate approvals hub badge — mirrors useApprovalsData status-scope exactly.
    // Uses the same role gates and status filters as the useApprovalsData hook sections:
    // §1 withdrawal pending (supervisor): supervisor/FOM/admin
    // §2 withdrawal supervisor_approved (finance): financialAdmin/FOM/admin
    // §3 cost tier-1 pending: supervisor/FOM/admin
    // §4 cost tier-2 pending: FOM/admin
    // §5 DP pending_supervisor: supervisor/FOM/admin
    // §6 DP pending_admin: admin/FOM/financialAdmin (pendingDpAdmin now fetched for all these roles)
    // §7 pending users: admin only
    // §8 MMP unassigned: FOM/admin
    const isStrictAdmin = isSuperAdmin || hasAnyRole(['admin', 'Admin']);
    const approvalsHubCount =
      ((roleIsSupervisor || roleIsFomOrAdmin) ? counts.pendingWithdrawals : 0)        // §1
      + (roleIsFinance ? counts.pendingFinanceWithdrawals : 0)                         // §2
      + ((roleIsSupervisor || roleIsFomOrAdmin) ? pendingCostApprovalCount : 0)        // §3
      + (roleIsFomOrAdmin ? pendingTier2CostCount : 0)                                 // §4
      + ((roleIsSupervisor || roleIsFomOrAdmin) ? pendingDownPaymentCount : 0)         // §5
      + ((roleIsFomOrAdmin || roleIsFinance) ? counts.pendingDpAdmin : 0)              // §6
      + (isStrictAdmin ? counts.pendingUsers : 0)                                      // §7
      + (roleIsFomOrAdmin ? pendingMmpCount : 0);                                      // §8

    const menuPrefs: MenuPreferences = useMemo(() => {
      const savedPrefs = userSettings?.settings?.menuPreferences;
      return savedPrefs ? { ...DEFAULT_MENU_PREFERENCES, ...savedPrefs } : DEFAULT_MENU_PREFERENCES;
    }, [userSettings?.settings?.menuPreferences]);

    const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
      useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // T33 — surface persistence errors so users notice when favourites silently fail to save.
    const toggleFavorite = useCallback(async (url: string, title: string, iconName: string) => {
      const currentFavorites = menuPrefs.favoritePages || [];
      const isFavorite = currentFavorites.includes(url);
      try {
        if (isFavorite) {
          await updateMenuPreferences({
            favoritePages: currentFavorites.filter(f => f !== url)
          });
        } else {
          await updateMenuPreferences({
            favoritePages: [...currentFavorites, url]
          });
        }
      } catch (err) {
        console.error('[Sidebar] Failed to toggle favourite', err);
        toast({
          title: 'Could not save favourite',
          description: err instanceof Error ? err.message : 'Please try again.',
          variant: 'destructive',
        });
      }
    }, [menuPrefs.favoritePages, updateMenuPreferences]);

    const removeFavorite = useCallback(async (url: string) => {
      const currentFavorites = menuPrefs.favoritePages || [];
      try {
        await updateMenuPreferences({
          favoritePages: currentFavorites.filter(f => f !== url)
        });
      } catch (err) {
        console.error('[Sidebar] Failed to remove favourite', err);
        toast({
          title: 'Could not remove favourite',
          description: err instanceof Error ? err.message : 'Please try again.',
          variant: 'destructive',
        });
      }
    }, [menuPrefs.favoritePages, updateMenuPreferences]);

    const handleDragEnd = useCallback(async (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const currentFavorites = menuPrefs.favoritePages || [];
        const oldIndex = currentFavorites.indexOf(active.id as string);
        const newIndex = currentFavorites.indexOf(over.id as string);

        const newOrder = arrayMove(currentFavorites, oldIndex, newIndex);
        try {
          await updateMenuPreferences({ favoritePages: newOrder });
        } catch (err) {
          console.error('[Sidebar] Failed to reorder favourites', err);
          toast({
            title: 'Could not save new order',
            description: err instanceof Error ? err.message : 'Please try again.',
            variant: 'destructive',
          });
        }
      }
    }, [menuPrefs.favoritePages, updateMenuPreferences]);

    const perms = {
      // Dashboard isn't a permission ResourceType; keep visible by default.
      dashboard: true,
      projects: checkPermission('projects', 'read') || isAdmin || hasAnyRole(['ict']),
      mmp: checkPermission('mmp', 'read') || isAdmin || hasAnyRole(['ict']),
      monitoringPlan: checkPermission('mmp', 'read') || isAdmin || hasAnyRole(['ict']),
      siteVisits: checkPermission('site_visits', 'read') || isAdmin || hasAnyRole(['ict']),
      archive: checkPermission('reports', 'read') || isAdmin,
      fieldTeam: checkPermission('users', 'read') || isAdmin,
      fieldOpManager: checkPermission('site_visits', 'update') || isAdmin || hasAnyRole(['fom']),
      dataVisibility: checkPermission('reports', 'read') || isAdmin,
      reports: checkPermission('reports', 'read') || isAdmin,
      users: checkPermission('users', 'read') || isAdmin || hasAnyRole(['ict']),
      roleManagement: canManageRoles() || isAdmin,
      settings: checkPermission('settings', 'read') || isAdmin,
      financialOperations: checkPermission('finances', 'update') || checkPermission('finances', 'approve') || isAdmin || hasAnyRole(['financialAdmin']),
    };

    const menuGroups = currentUser ? getWorkflowMenuGroups(roles || [], currentUser.role, perms, isSuperAdmin, menuPrefs, hasMonitoringAccess) : [];

    const toggleGroupCollapse = (groupId: string) => {
      setCollapsedGroups(prev => {
        const next = new Set(prev);
        if (next.has(groupId)) {
          next.delete(groupId);
        } else {
          next.add(groupId);
        }
        try { localStorage.setItem('pact-sidebar-collapsed', JSON.stringify([...next])); } catch {}
        return next;
      });
    };

    const getInitials = (name: string) =>
      name.split(" ").map((part) => part[0]).join("").toUpperCase().substring(0, 2);

    const getPrimaryRole = (): string => {
      if (!currentUser) return "";
      // isSuperAdmin from context (may still be loading async)
      if (isSuperAdmin) return "Super Admin";
      // Guard: if profile role itself says superAdmin, trust it even if context hasn't resolved yet
      const profileRoleNorm = currentUser.role?.toLowerCase().replace(/[\s_-]/g, '');
      if (profileRoleNorm === 'superadmin') return "Super Admin";
      if (roles && roles.length > 0) {
        if (roles.includes("admin" as AppRole)) return "Admin";
        const roleMap: Record<string, string> = {
          admin: "Admin",
          ict: "ICT",
          fom: "Field Ops Manager",
          financialAdmin: "Financial Admin",
          auditor: "Financial Auditor",
          supervisor: "Supervisor",
          coordinator: "Coordinator",
          dataCollector: "Data Collector",
        };
        return roleMap[roles[0]] || roles[0].charAt(0).toUpperCase() + roles[0].slice(1);
      }
      const fallbackRoleMap: Record<string, string> = {
        superadmin: "Super Admin",
        admin: "Admin",
        ict: "ICT",
        fom: "Field Ops Manager",
        financialadmin: "Financial Admin",
        auditor: "Financial Auditor",
        supervisor: "Supervisor",
        coordinator: "Coordinator",
        datacollector: "Data Collector",
      };
      return fallbackRoleMap[profileRoleNorm] || currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
    };

    const handleLogout = () => {
      showDueReminders();
      setTimeout(async () => {
        await logout();
        navigate('/auth');
      }, 1500);
    };

    const allMenuItems = useMemo(() => {
      const items: Array<{ id: string; title: string; url: string; icon: any }> = [];
      menuGroups.forEach(group => {
        group.items.forEach(item => {
          items.push({ id: item.id, title: item.title, url: item.url, icon: item.icon });
        });
      });
      return items;
    }, [menuGroups]);

    const favoriteItems: FavoriteItem[] = useMemo(() => {
      const favorites = menuPrefs.favoritePages || [];
      return favorites
        .map(url => allMenuItems.find(item => item.url === url))
        .filter((item): item is FavoriteItem => !!item);
    }, [menuPrefs.favoritePages, allMenuItems]);

    const isFavorite = useCallback((url: string) => {
      return (menuPrefs.favoritePages || []).includes(url);
    }, [menuPrefs.favoritePages]);

    return (
      <>
        <Sidebar collapsible="offcanvas" className="border-r border-slate-200/80 bg-slate-50 dark:border-gray-800 dark:bg-gray-900">

        <SidebarHeader className="border-b border-slate-200/70 py-1">
          <div className="flex h-14 items-center gap-1 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <img src={Logo} alt="PACT Logo" className="h-8 w-8 shrink-0 object-contain" />
            <SidebarTrigger className="ml-auto h-4 w-4 group-data-[collapsible=icon]:hidden" data-testid="button-sidebar-trigger" />
          </div>
        </SidebarHeader>

        <SidebarContent className="px-1 pt-2 pb-1">
          {favoriteItems.length > 0 && (
            <Collapsible open={!isFavoritesCollapsed} className="">
              <SidebarGroup className="pt-3 pb-1 px-0">
                <CollapsibleTrigger asChild>
                  <SidebarGroupLabel 
                    className="px-1 py-0.5 h-6 text-[13px] uppercase tracking-wide font-semibold text-amber-600 dark:text-amber-400 cursor-pointer flex items-center justify-between hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded transition-colors"
                    onClick={() => { const next = !isFavoritesCollapsed; setIsFavoritesCollapsed(next); try { localStorage.setItem('pact-favorites-collapsed', String(next)); } catch {} }}
                    data-testid="group-label-favorites"
                  >
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                      Favorites
                    </span>
                    <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${isFavoritesCollapsed ? '-rotate-90' : ''}`} />
                  </SidebarGroupLabel>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={favoriteItems.map(item => item.url)}
                        strategy={verticalListSortingStrategy}
                      >
                        <SidebarMenu className="space-y-0">
                          {favoriteItems.map((item) => (
                            <SortableFavoriteItem
                              key={item.url}
                              item={item}
                              isActive={pathname === item.url}
                              onRemove={removeFavorite}
                            />
                          ))}
                        </SidebarMenu>
                      </SortableContext>
                    </DndContext>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          )}

          {(() => {
            const financeSubGroups = menuGroups.filter((g: any) => g.parentGroup === 'finance');
            const regularGroups = menuGroups.filter((g: any) => !g.parentGroup);
            const allGroupsSorted = [...regularGroups].sort((a, b) => a.order - b.order);

            const renderMenuItems = (items: MenuGroup['items']) => (
              <SidebarMenu className="space-y-0">
                {items.map((item, itemIndex) => {
                  const isItemFavorite = isFavorite(item.url);
                  return (
                    <SidebarMenuItem key={item.id} index={itemIndex} className="py-0 group/item">
                      <div className="flex items-center w-full">
                        <SidebarMenuButton
                          asChild
                          isActive={pathname === item.url}
                          tooltip={item.title}
                          className={`flex-1 rounded-md text-[13px] font-medium transition-all duration-200 h-8 
                            ${
                              pathname === item.url
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/70 dark:text-blue-300 font-semibold"
                                : ""
                            }`}
                        >
                          <Link to={item.url} className="flex items-center gap-2" data-testid={`nav-link-${item.id}`}>
                            <item.icon
                              className={`h-3.5 w-3.5 ${
                                pathname === item.url
                                  ? "text-blue-700 dark:text-blue-300"
                                  : "text-slate-500 dark:text-slate-400"
                              }`}
                            />
                            <span className="truncate flex-1">{item.title}</span>
                            {item.id === 'approvals-hub' && approvalsHubCount > 0 && (
                              <span className="ml-auto shrink-0 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none" data-testid="badge-approvals-hub-count">
                                {approvalsHubCount > 99 ? '99+' : approvalsHubCount}
                              </span>
                            )}
                            {item.id === 'advance-requests-report' && pendingReclaimCount > 0 && (
                              <span className="ml-auto shrink-0 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-orange-500 text-white text-[9px] font-bold leading-none" data-testid="badge-reconciliation-count">
                                {pendingReclaimCount > 99 ? '99+' : pendingReclaimCount}
                              </span>
                            )}
                            {item.id === 'cost-submission' && pendingCostApprovalCount > 0 && (
                              <span className="ml-auto shrink-0 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none" data-testid="badge-cost-approval-count">
                                {pendingCostApprovalCount > 99 ? '99+' : pendingCostApprovalCount}
                              </span>
                            )}
                            {item.id === 'supervisor-approvals' && pendingCostApprovalCount > 0 && (
                              <span className="ml-auto shrink-0 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none" data-testid="badge-tier1-approval-count">
                                {pendingCostApprovalCount > 99 ? '99+' : pendingCostApprovalCount}
                              </span>
                            )}
                            {item.id === 'down-payment-approval' && pendingDownPaymentCount > 0 && (
                              <span className="ml-auto shrink-0 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold leading-none" data-testid="badge-down-payment-count">
                                {pendingDownPaymentCount > 99 ? '99+' : pendingDownPaymentCount}
                              </span>
                            )}
                            {item.id === 'mmp-management' && pendingMmpCount > 0 && (
                              <span className="ml-auto shrink-0 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-blue-600 text-white text-[9px] font-bold leading-none" data-testid="badge-mmp-count">
                                {pendingMmpCount > 99 ? '99+' : pendingMmpCount}
                              </span>
                            )}
                            {(item.id === 'site-verification' || item.id === 'sites-for-verification') && pendingVerificationCount > 0 && (
                              <span className="ml-auto shrink-0 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none" data-testid="badge-site-verification-count">
                                {pendingVerificationCount > 99 ? '99+' : pendingVerificationCount}
                              </span>
                            )}
                            {item.id === 'withdrawal-approval' && pendingTier2CostCount > 0 && (
                              <span className="ml-auto shrink-0 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-amber-600 text-white text-[9px] font-bold leading-none" data-testid="badge-tier2-approval-count">
                                {pendingTier2CostCount > 99 ? '99+' : pendingTier2CostCount}
                              </span>
                            )}
                            {item.id === 'finance-approval' && pendingFinanceCount > 0 && (
                              <span className="ml-auto shrink-0 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-indigo-500 text-white text-[9px] font-bold leading-none" data-testid="badge-finance-approval-count">
                                {pendingFinanceCount > 99 ? '99+' : pendingFinanceCount}
                              </span>
                            )}
                            {item.id === 'notifications' && unreadNotifCount > 0 && (
                              <span className="ml-auto shrink-0 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-blue-500 text-white text-[9px] font-bold leading-none" data-testid="badge-notifications-unread-count">
                                {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                              </span>
                            )}
                            {(item.id === 'incident-reports' || item.id === 'safety-hub') && openIncidentCount > 0 && (
                              <span className="ml-auto shrink-0 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-red-600 text-white text-[9px] font-bold leading-none" data-testid="badge-incident-count">
                                {openIncidentCount > 99 ? '99+' : openIncidentCount}
                              </span>
                            )}
                            {item.id === 'reconciliation-dashboard' && pendingReclaimCount > 0 && (
                              <span className="ml-auto shrink-0 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-orange-500 text-white text-[9px] font-bold leading-none" data-testid="badge-reconciliation-dashboard-count">
                                {pendingReclaimCount > 99 ? '99+' : pendingReclaimCount}
                              </span>
                            )}
                            {item.id === 'my-wallet' && pendingWalletCount > 0 && (
                              <span className="ml-auto shrink-0 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-green-600 text-white text-[9px] font-bold leading-none" data-testid="badge-wallet-pending-count">
                                {pendingWalletCount > 99 ? '99+' : pendingWalletCount}
                              </span>
                            )}
                            {item.id === 'my-tasks' && myTasksOverdueCount > 0 && (
                              <span className="ml-auto shrink-0 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none" data-testid="badge-my-tasks-overdue-count">
                                {myTasksOverdueCount > 99 ? '99+' : myTasksOverdueCount}
                              </span>
                            )}
                            {item.id === 'changelog' && changelogUnreadCount > 0 && (
                              <span className="ml-auto shrink-0 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-blue-600 text-white text-[9px] font-bold leading-none" data-testid="badge-changelog-unread-count">
                                {changelogUnreadCount > 99 ? '99+' : changelogUnreadCount}
                              </span>
                            )}
                          </Link>
                        </SidebarMenuButton>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                toggleFavorite(item.url, item.title, item.icon?.name || 'Star'); 
                              }}
                              className={`transition-opacity shrink-0 ${
                                isItemFavorite 
                                  ? 'opacity-100' 
                                  : 'opacity-0 group-hover/item:opacity-100'
                              }`}
                              aria-label={isItemFavorite ? 'Remove from favorites' : 'Add to favorites'}
                              data-testid={`button-favorite-${item.id}`}
                            >
                              <Star 
                                className={`h-3 w-3 ${
                                  isItemFavorite 
                                    ? 'text-amber-500 fill-amber-500' 
                                    : 'text-muted-foreground'
                                }`} 
                              />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            <p>{isItemFavorite ? 'Remove from favorites' : 'Add to favorites'}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            );

            const rendered: JSX.Element[] = [];
            let financeInserted = false;

            for (const group of allGroupsSorted) {
              if (!financeInserted && group.order > 5 && financeSubGroups.length > 0) {
                financeInserted = true;
                const isFinanceCollapsed = collapsedGroups.has('finance-parent');
                rendered.push(
                  <Collapsible key="finance-parent" open={!isFinanceCollapsed}>
                    <SidebarGroup className="py-0 px-0">
                      <CollapsibleTrigger asChild>
                        <SidebarGroupLabel 
                          className="px-1 py-0.5 h-6 text-[13px] uppercase tracking-wide font-semibold text-green-600 dark:text-green-300 cursor-pointer flex items-center justify-between hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors"
                          onClick={() => toggleGroupCollapse('finance-parent')}
                          data-testid="group-label-finance-parent"
                        >
                          <span className="flex items-center gap-1">
                            <Banknote className="h-3 w-3" />
                            Payments & Finance
                          </span>
                          <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${isFinanceCollapsed ? '-rotate-90' : ''}`} />
                        </SidebarGroupLabel>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarGroupContent>
                          {financeSubGroups.sort((a, b) => a.order - b.order).map(subGroup => {
                            const isSubCollapsed = collapsedGroups.has(subGroup.id);
                            return (
                              <Collapsible key={subGroup.id} open={!isSubCollapsed}>
                                <div className="pl-1">
                                  <CollapsibleTrigger asChild>
                                    <div 
                                      className="px-1 py-0.5 h-5 text-[11px] uppercase tracking-wide font-semibold text-muted-foreground cursor-pointer flex items-center justify-between hover:bg-muted/50 rounded transition-colors"
                                      onClick={() => toggleGroupCollapse(subGroup.id)}
                                      data-testid={`group-label-${subGroup.id}`}
                                    >
                                      <span>{subGroup.label}</span>
                                      <ChevronDown className={`h-2.5 w-2.5 transition-transform duration-200 ${isSubCollapsed ? '-rotate-90' : ''}`} />
                                    </div>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent>
                                    {renderMenuItems(subGroup.items)}
                                  </CollapsibleContent>
                                </div>
                              </Collapsible>
                            );
                          })}
                        </SidebarGroupContent>
                      </CollapsibleContent>
                    </SidebarGroup>
                  </Collapsible>
                );
              }

              const isCollapsed = collapsedGroups.has(group.id);
              rendered.push(
                <Collapsible key={group.id} open={!isCollapsed}>
                  <SidebarGroup className="py-0 px-0">
                    <CollapsibleTrigger asChild>
                      <SidebarGroupLabel 
                        className="px-2 py-0.5 h-6 text-[11px] uppercase tracking-[0.14em] font-semibold text-slate-500 dark:text-slate-400 cursor-pointer flex items-center justify-between hover:bg-slate-200/50 dark:hover:bg-gray-800 rounded transition-colors"
                        onClick={() => toggleGroupCollapse(group.id)}
                        data-testid={`group-label-${group.id}`}
                      >
                        <span>{group.label}</span>
                        <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                      </SidebarGroupLabel>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarGroupContent>
                        {renderMenuItems(group.items)}
                      </SidebarGroupContent>
                    </CollapsibleContent>
                  </SidebarGroup>
                </Collapsible>
              );
            }

            if (!financeInserted && financeSubGroups.length > 0) {
              const isFinanceCollapsed = collapsedGroups.has('finance-parent');
              rendered.push(
                <Collapsible key="finance-parent" open={!isFinanceCollapsed}>
                  <SidebarGroup className="py-0 px-0">
                    <CollapsibleTrigger asChild>
                      <SidebarGroupLabel 
                        className="px-1 py-0.5 h-6 text-[13px] uppercase tracking-wide font-semibold text-green-600 dark:text-green-300 cursor-pointer flex items-center justify-between hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors"
                        onClick={() => toggleGroupCollapse('finance-parent')}
                        data-testid="group-label-finance-parent-end"
                      >
                        <span className="flex items-center gap-1">
                          <Banknote className="h-3 w-3" />
                          Payments & Finance
                        </span>
                        <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${isFinanceCollapsed ? '-rotate-90' : ''}`} />
                      </SidebarGroupLabel>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarGroupContent>
                        {financeSubGroups.sort((a, b) => a.order - b.order).map(subGroup => {
                          const isSubCollapsed = collapsedGroups.has(subGroup.id);
                          return (
                            <Collapsible key={subGroup.id} open={!isSubCollapsed}>
                              <div className="pl-1">
                                <CollapsibleTrigger asChild>
                                  <div 
                                    className="px-1 py-0.5 h-5 text-[11px] uppercase tracking-wide font-semibold text-muted-foreground cursor-pointer flex items-center justify-between hover:bg-muted/50 rounded transition-colors"
                                    onClick={() => toggleGroupCollapse(subGroup.id)}
                                    data-testid={`group-label-${subGroup.id}`}
                                  >
                                    <span>{subGroup.label}</span>
                                    <ChevronDown className={`h-2.5 w-2.5 transition-transform duration-200 ${isSubCollapsed ? '-rotate-90' : ''}`} />
                                  </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  {renderMenuItems(subGroup.items)}
                                </CollapsibleContent>
                              </div>
                            </Collapsible>
                          );
                        })}
                      </SidebarGroupContent>
                    </CollapsibleContent>
                  </SidebarGroup>
                </Collapsible>
              );
            }

            return rendered;
          })()}
        </SidebarContent>

        <SidebarFooter className="border-t border-slate-200/70 p-2">
          {currentUser && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 px-2 py-1.5 h-9 hover:bg-blue-50 dark:hover:bg-gray-800 rounded-lg group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
                  data-testid="button-user-menu"
                >
                  <div className="relative shrink-0">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={currentUser.avatar} alt={currentUser.name} />
                      <AvatarFallback className="bg-blue-600 text-white text-[9px]">
                        {getInitials(currentUser.name)}
                      </AvatarFallback>
                    </Avatar>
                    <RealtimeStatusDot className="absolute -bottom-0.5 -right-0.5" />
                  </div>
                  <div className="flex flex-col items-start text-left leading-tight group-data-[collapsible=icon]:hidden min-w-0 flex-1">
                    <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate w-full">{currentUser.name}</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate w-full">{getPrimaryRole()}</span>
                  </div>
                  <ChevronUp className="ml-auto h-3 w-3 text-muted-foreground group-data-[collapsible=icon]:hidden shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{currentUser.name}</p>
                    <p className="text-xs text-muted-foreground">{currentUser.email}</p>
                  </div>
                </DropdownMenuLabel>
                {!isDataCollector && <DropdownMenuSeparator />}
                {!isDataCollector && (
                  <DropdownMenuItem asChild>
                    <Link to="/settings" data-testid="link-settings">
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link to="/integrations" data-testid="link-integrations">
                    <Link2 className="mr-2 h-4 w-4" />
                    <span>Integrations</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-red-600 dark:text-red-500 cursor-pointer"
                  data-testid="button-logout"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </SidebarFooter>

        <SidebarRail />
        <SidebarResizeHandle />
      </Sidebar>

      {isSidebarCollapsed && (
        <div className="fixed left-4 top-4 z-50 hidden sm:block">
          <SidebarTrigger className="h-10 w-10 rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-gray-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-gray-500 dark:hover:bg-slate-800" />
        </div>
      )}
      </>
    );
  };

  export default AppSidebar;