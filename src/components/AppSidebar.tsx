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
    Network,
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
    Heart,
    ShieldAlert,
    RotateCcw,
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
    ShoppingCart,
    ArrowLeftRight,
    PiggyBank,
    Search,
    GraduationCap,
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
    SidebarMenuAction,
    SidebarMenuSub,
    SidebarMenuSubItem,
    SidebarMenuSubButton,
    SidebarSeparator,
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
  import { useQuery } from "@tanstack/react-query";
  import { useNavBadgeCountsContext } from "@/context/NavBadgeCountsContext";
  import { getChangelogUnreadCount } from "@/lib/changelog-utils";
  import { PAGE_DEFS } from "@/pages/PageAccessControl";
  import { MenuPreferences, DEFAULT_MENU_PREFERENCES } from "@/types/user-preferences";
  import { normalizeRole } from "@/utils/roleMapping";
  import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
  import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
  import { CSS } from '@dnd-kit/utilities';
  import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
  import { toast } from "@/hooks/use-toast";
  import { cn } from "@/lib/utils";

  /** Groups with many links â€” collapsed by default to reduce visual clutter */
  const DENSE_COLLAPSED_BY_DEFAULT = new Set([
    'super-admin',
    'finance-accounting',
    'finance-reports',
    'finance-management',
    'admin',
    'hr-people',
    'analytics',
    'finance-parent',
  ]);

  const SIDEBAR_GROUP_SHELL = "py-1 px-2";
  const SIDEBAR_GROUP_LABEL =
    "h-8 px-2.5 text-[11px] tracking-wide font-semibold cursor-pointer flex items-center gap-2 rounded-lg transition-colors";
  const SIDEBAR_NAV_ITEM =
    "h-9 rounded-lg text-[13px] font-medium transition-all duration-200";
  const SIDEBAR_NAV_SUB_ITEM =
    "h-8 rounded-md text-[12px] font-medium transition-all duration-200";

  const isNavPathActive = (pathname: string, url: string) => {
    const base = url.split('?')[0];
    if (pathname === base) return true;
    if (base !== '/' && pathname.startsWith(base + '/')) return true;
    return false;
  };

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

  /** Maps PAGE_DEFS group label â†’ AppSidebar MenuGroup id */
  const PAGEDEF_GROUP_TO_SIDEBAR: Record<string, string> = {
    'My Workspace':          'workspace',
    'Communication':         'communication',
    'Programme Management':  'programme-management',
    'Field Operations':      'field-ops',
    'Coordination':          'coordination',
    'Finance':               'finance-parent',
    'HR & People':           'hr-people',
    'Surveys':               'surveys',
    'Analytics & Reports':   'analytics',
    'Accounting':            'accounting',
    'Administration':        'admin',
    'Super Admin':           'super-admin',
    'Audit & Security':      'admin',
    'CRM':                   'crm',
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
      <SidebarMenuItem ref={setNodeRef} style={style} className="group/fav">
        <button
          {...attributes}
          {...listeners}
          className="absolute left-0.5 top-1/2 -translate-y-1/2 z-10 cursor-grab active:cursor-grabbing opacity-0 group-hover/fav:opacity-100 transition-opacity flex items-center justify-center p-0.5"
          aria-label="Drag to reorder"
          data-testid={`drag-handle-${item.id}`}
        >
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </button>
        <SidebarMenuButton
          asChild
          isActive={isActive}
          tooltip={item.title}
          className={cn(
            SIDEBAR_NAV_ITEM,
            isActive &&
              "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 font-semibold"
          )}
        >
          <Link to={item.url} className="flex items-center gap-2.5 pl-4" data-testid={`nav-favorite-${item.id}`}>
            <item.icon
              className={cn(
                "h-4 w-4 shrink-0",
                isActive
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-amber-600 dark:text-amber-400"
              )}
            />
            <span className="truncate flex-1 min-w-0">{item.title}</span>
          </Link>
        </SidebarMenuButton>
        <SidebarMenuAction
          showOnHover
          onClick={(e) => { e.stopPropagation(); onRemove(item.url); }}
          aria-label="Remove from favorites"
          data-testid={`button-unfavorite-${item.id}`}
        >
          <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
        </SidebarMenuAction>
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

    // â”€â”€ 1. My Workspace â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const workspaceItems: MenuGroup['items'] = [];
    if (!isHidden('/dashboard') && (isSuperAdmin || isAdmin || isICT || isEmployee || perms.dashboard)) {
      workspaceItems.push({ id: 'dashboard', title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, priority: 1, isPinned: isPinned('/dashboard') });
    }
    if (!isHidden('/my-tasks')) {
      workspaceItems.push({ id: 'my-tasks', title: "My Tasks", url: "/my-tasks", icon: CheckSquare, priority: 2, isPinned: isPinned('/my-tasks') });
    }
    if (!isHidden('/team-tasks') && (isSuperAdmin || isAdmin || ['ceo','coo','cto','hr_manager'].includes(defaultRole.toLowerCase()))) {
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

    // â”€â”€ 2. Communication â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const communicationItems: MenuGroup['items'] = [];
    if (!isHidden('/communication-hub')) {
      communicationItems.push({ id: 'communication-hub', title: "Communication", url: "/communication-hub", icon: MessageSquare, priority: 1, isPinned: isPinned('/communication-hub') });
    }
    if (communicationItems.length) groups.push({ id: 'communication', label: "Communication", order: 3, items: communicationItems });

    // â”€â”€ 2. Programme Management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const planningItems: MenuGroup['items'] = [];
    const canSeeProgrammeHub = isSuperAdmin || isAdmin || isICT || isFOM || isProjectManager || isCountryDirector || isDataTeam || perms.projects;
    if (canSeeProgrammeHub && !isHidden('/programme-hub')) {
      planningItems.push({ id: 'programme-hub', title: "Programme Hub", url: "/programme-hub", icon: FolderKanban, priority: 1, isPinned: isPinned('/programme-hub') });
    }
    if (!isHidden('/mmp') && (isSuperAdmin || isAdmin || isICT || perms.mmp || isCoordinator || isSupervisor || isDataCollector || isFOM || isCountryDirector || isProjectManager)) {
      const mmpTitle = (isDataCollector || isCoordinator || isSupervisor) ? "My Sites Management" : "MMP Management";
      planningItems.push({ id: 'mmp-management', title: mmpTitle, url: "/mmp", icon: Database, priority: 2, isPinned: isPinned('/mmp') });
    }
    if (planningItems.length) groups.push({ id: 'programme-management', label: "Programme Management", order: 2, items: planningItems });

    // â”€â”€ 4. Field Operations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // ── Field Ops Hub (replaces 9 flat items) ─────────────────────────────────
    const fieldOpsItems: MenuGroup['items'] = [];
    const canSeeFieldOps = isSuperAdmin || isAdmin || isICT || isFOM || isCoordinator || isSupervisor || isDataCollector || isDataTeam || perms.siteVisits || perms.fieldTeam;
    if (canSeeFieldOps && !isHidden('/field-ops')) {
      fieldOpsItems.push({ id: 'field-ops-hub', title: "Field Ops Hub", url: "/field-ops", icon: Compass, priority: 1, isPinned: isPinned('/field-ops') });
    }
    if (fieldOpsItems.length) groups.push({ id: 'field-ops', label: "Field Operations", order: 4, items: fieldOpsItems });

    // â”€â”€ 5. Coordination & Oversight â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    if (!isHidden('/mmp/cycle-close') && (isSuperAdmin || isAdmin || isFOM || isSupervisor)) {
      coordinationItems.push({ id: 'mmp-cycle-close', title: "Cycle Management", url: "/mmp/cycle-close", icon: CheckCircle, priority: 4, isPinned: isPinned('/mmp/cycle-close') });
    }
    if (!isHidden('/admin/staff-profiles') && (isSuperAdmin || isAdmin)) {
      coordinationItems.push({ id: 'staff-directory', title: "Staff Directory", url: "/admin/staff-profiles", icon: UsersRound, priority: 5, isPinned: isPinned('/admin/staff-profiles') });
    }
    if (coordinationItems.length) groups.push({ id: 'coordination', label: "Coordination & Oversight", order: 4.5, items: coordinationItems });

    // â”€â”€ 6. Payments & Finance (sub-groups) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const myMoneyItems: MenuGroup['items'] = [];
    if (!isHidden('/wallet') && (isFinancialAdmin || isAuditor || isFOM || isSupervisor || isDataCollector || isCoordinator)) {
      myMoneyItems.push({ id: 'my-wallet', title: "My Wallet", url: "/wallet", icon: CreditCard, priority: 1, isPinned: isPinned('/wallet') });
    }
    if (!isHidden('/cost-submission') && (isSuperAdmin || isAdmin || isSupervisor || isFOM || isCoordinator || isDataTeam || isCountryDirector)) {
      myMoneyItems.push({ id: 'cost-submission', title: "Cost Submission", url: "/cost-submission", icon: Receipt, priority: 2, isPinned: isPinned('/cost-submission') });
    }
    if (!isHidden('/my-advances')) {
      myMoneyItems.push({ id: 'my-advances', title: "My Advances", url: "/my-advances", icon: Wallet, priority: 3, isPinned: isPinned('/my-advances') });
    }
    if (!isHidden('/my-expenses')) {
      myMoneyItems.push({ id: 'my-expenses', title: "My Expenses", url: "/my-expenses", icon: Receipt, priority: 4, isPinned: isPinned('/my-expenses') });
    }
    if (myMoneyItems.length) groups.push({ id: 'finance-my-money', label: "My Money", order: 5.1, items: myMoneyItems, parentGroup: 'finance' } as any);

    const approvalItems: MenuGroup['items'] = [];
    if (!isHidden('/approvals') && (isSuperAdmin || isAdmin || isFinancialAdmin || isSupervisor || isFOM || isCountryDirector)) {
      approvalItems.push({ id: 'approvals-hub', title: "Approvals Hub", url: "/approvals", icon: Inbox, priority: 0, isPinned: isPinned('/approvals') });
    }
    if (!isHidden('/supervisor-approvals') && canSeePath('/supervisor-approvals', defaultRole)) {
      approvalItems.push({ id: 'supervisor-approvals', title: "Tier 1 Approvals", url: "/supervisor-approvals", icon: ClipboardCheck, priority: 1, isPinned: isPinned('/supervisor-approvals') });
    }
    if (!isHidden('/withdrawal-approval') && canSeePath('/withdrawal-approval', defaultRole)) {
      approvalItems.push({ id: 'withdrawal-approval', title: "Tier 2 Approvals", url: "/withdrawal-approval", icon: ClipboardCheck, priority: 2, isPinned: isPinned('/withdrawal-approval') });
    }
    if (!isHidden('/down-payment-approval') && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor || isSupervisor || isCountryDirector)) {
      approvalItems.push({ id: 'down-payment-approval', title: "Down-Payment Tracker", url: "/down-payment-approval", icon: DollarSign, priority: 3, isPinned: isPinned('/down-payment-approval') });
    }
    if (!isHidden('/finance-approval') && canSeePath('/finance-approval', defaultRole)) {
      approvalItems.push({ id: 'finance-approval', title: "Finance Processing", url: "/finance-approval", icon: Banknote, priority: 4, isPinned: isPinned('/finance-approval') });
    }
    if (approvalItems.length) groups.push({ id: 'finance-approvals', label: "Approvals", order: 5.2, items: approvalItems, parentGroup: 'finance' } as any);

    // ── Finance Hub (replaces Financial Management + Financial Reports) ──────
    const finHubItems: MenuGroup['items'] = [];
    if (!isHidden('/finance-hub') && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor || isSupervisor || isFOM || isCountryDirector)) {
      finHubItems.push({ id: 'finance-hub', title: "Finance Hub", url: "/finance-hub", icon: LayoutDashboard, priority: 1, isPinned: isPinned('/finance-hub') });
    }
    if (finHubItems.length) groups.push({ id: 'finance-management', label: "Finance Hub", order: 5.3, items: finHubItems, parentGroup: 'finance' } as any);

    // ── Pre-Funding module ────────────────────────────────────────────
    const preFundItems: MenuGroup['items'] = [];
    if (!isHidden('/pre-funding') && (isSuperAdmin || isAdmin || isFinancialAdmin)) {
      preFundItems.push({ id: 'pre-funding', title: 'Pre-Funding', url: '/pre-funding', icon: Banknote, priority: 1, isPinned: isPinned('/pre-funding') });
    }
    if (preFundItems.length) groups.push({ id: 'finance-prefunding', label: 'Pre-Funding', order: 5.45, items: preFundItems, parentGroup: 'finance' } as any);

    // ── Accounting module ────────────────────────────────────────────
    const acctItems: MenuGroup['items'] = [];
    if (isSuperAdmin) {
      if (!isHidden('/accounting')) acctItems.push({ id: 'accounting-hub', title: 'Accounting Hub', url: '/accounting', icon: LayoutDashboard, priority: 1, isPinned: isPinned('/accounting') });
      if (!isHidden('/accounting/journals')) acctItems.push({ id: 'accounting-journals', title: 'Journal Entries', url: '/accounting/journals', icon: Receipt, priority: 2, isPinned: isPinned('/accounting/journals') });
      if (!isHidden('/accounting/bank-recon')) acctItems.push({ id: 'accounting-bank-recon', title: 'Bank Reconciliation', url: '/accounting/bank-recon', icon: Landmark, priority: 3, isPinned: isPinned('/accounting/bank-recon') });
      if (!isHidden('/accounting/search')) acctItems.push({ id: 'accounting-search', title: 'Quick Search', url: '/accounting/search', icon: Search, priority: 4, isPinned: isPinned('/accounting/search') });
    }
    if (acctItems.length) groups.push({ id: 'finance-accounting', label: 'Accounting', order: 5.5, items: acctItems, parentGroup: 'finance' } as any);

    // â”€â”€ 7. HR & People â€” logical flow: Employees â†’ Payroll â†’ Retainer â†’ Leave â†’ Analytics â†’ My Payslip â”€â”€
    const hrItems: MenuGroup['items'] = [];
    const hrAdminAccess = isSuperAdmin || isAdmin || isFinancialAdmin;
    const hrStrictAccess = isSuperAdmin || isAdmin;
    // 1. Employees — admin & super admin only
    if (!isHidden('/employees') && hrStrictAccess) {
      hrItems.push({ id: 'employees', title: "Employees", url: "/employees", icon: Users, priority: 1, isPinned: isPinned('/employees') });
    }
    // 2. HR Hub — full hub with all sections (admin only)
    if (!isHidden('/hr') && hrAdminAccess) {
      hrItems.push({ id: 'hr-hub', title: "HR Hub", url: "/hr", icon: Briefcase, priority: 2, isPinned: isPinned('/hr') });
    }
    // 3. My Payslip — personal payslip for every staff member
    if (!isHidden('/hr')) {
      hrItems.push({ id: 'my-payslip', title: "My Payslip", url: "/hr?tab=payroll", icon: Receipt, priority: 3, isPinned: false });
    }
    // 4. Leave Requests — all staff submit; admins approve
    if (!isHidden('/hr')) {
      hrItems.push({ id: 'leave-requests', title: "Leave Requests", url: "/hr?tab=leave-requests", icon: CalendarOff, priority: 4, isPinned: false });
    }
    // 5. Timesheet — daily work log for all staff
    if (!isHidden('/hr')) {
      hrItems.push({ id: 'timesheet', title: "Timesheet", url: "/hr?tab=timesheet", icon: ClipboardCheck, priority: 5, isPinned: false });
    }
    if (hrItems.length) groups.push({ id: 'hr-people', label: "HR & People", order: 5.6, items: hrItems });

    // â”€â”€ 8. CRM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const crmItems: MenuGroup['items'] = [];
    const hasCrmAccess = isSuperAdmin || isAdmin || isFOM || isProjectManager || isCountryDirector;
    if (hasCrmAccess && !isHidden('/crm')) {
      crmItems.push({ id: 'crm-hub', title: 'CRM', url: '/crm', icon: Handshake, priority: 1, isPinned: isPinned('/crm') });
    }
    if (crmItems.length) groups.push({ id: 'crm', label: 'CRM', order: 5.8, items: crmItems });

    // â”€â”€ Surveys â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (!isHidden('/surveys')) {
      groups.push({
        id: 'surveys',
        label: 'Surveys',
        order: 5.9,
        items: [
          { id: 'surveys', title: 'Surveys', url: '/surveys', icon: ClipboardList, priority: 1, isPinned: isPinned('/surveys') },
        ],
      });
    }

    // â”€â”€ 9. Analytics & Reports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // ── Analytics Hub (replaces 8 flat items) ─────────────────────────────────
    const analyticsItems: MenuGroup['items'] = [];
    const canSeeAnalytics = isSuperAdmin || isAdmin || isICT || isFinancialAdmin || isAuditor || isDataTeam || isFOM || isCountryDirector || perms.reports || perms.dataVisibility || perms.archive;
    if (canSeeAnalytics && !isHidden('/analytics')) {
      analyticsItems.push({ id: 'analytics-hub', title: "Analytics Hub", url: "/analytics", icon: BarChart3, priority: 1, isPinned: isPinned('/analytics') });
    }
    if (analyticsItems.length) groups.push({ id: 'analytics', label: "Analytics & Reports", order: 6, items: analyticsItems });

    // â”€â”€ 10. Administration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // ── Admin Hub (replaces 12 flat items) ────────────────────────────────────
    const adminItems: MenuGroup['items'] = [];
    const canSeeAdmin = isSuperAdmin || isAdmin || isICT || canSeePath('/users', defaultRole) || canSeePath('/departments', defaultRole) || canSeePath('/role-management', defaultRole) || canSeePath('/classifications', defaultRole) || canSeePath('/task-admin', defaultRole) || perms.users || perms.roleManagement || perms.settings || hasMonitoringAccess;
    if (canSeeAdmin && !isHidden('/admin-hub')) {
      adminItems.push({ id: 'admin-hub', title: "Admin Hub", url: "/admin-hub", icon: LayoutDashboard, priority: 1, isPinned: isPinned('/admin-hub') });
    }
    if (adminItems.length) groups.push({ id: 'admin', label: "Administration", order: 7, items: adminItems });

    // â”€â”€ 11. Help & Support â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ 12. Super Admin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // ── Super Admin Hub (replaces 14 flat items) ──────────────────────────────
    if (isSuperAdmin) {
      const superAdminItems: MenuGroup['items'] = [];
      if (!isHidden('/super-admin-hub')) {
        superAdminItems.push({ id: 'super-admin-hub', title: "Super Admin Hub", url: "/super-admin-hub", icon: ShieldCheck, priority: 1, isPinned: isPinned('/super-admin-hub') });
      }
      if (!isHidden('/system-diagrams')) {
        superAdminItems.push({ id: 'system-diagrams', title: "System Diagrams", url: "/system-diagrams", icon: Network, priority: 2, isPinned: isPinned('/system-diagrams') });
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

    // Fetch this user's page_access_overrides so that manually granted pages
    // appear in the sidebar even when the role-based check would deny them.
    const { data: myPageOverrides = [] } = useQuery({
      queryKey: ['sidebar-page-overrides', currentUser?.id],
      queryFn: async () => {
        if (!currentUser?.id) return [];
        const { data } = await supabase
          .from('page_access_overrides')
          .select('page_slug, is_blocked')
          .eq('user_id', currentUser.id);
        return (data ?? []) as { page_slug: string; is_blocked: boolean }[];
      },
      enabled: !!currentUser?.id && !isSuperAdmin,
      staleTime: 30_000,
    });

    // slug â†’ is_blocked  (false = granted, true = blocked)
    const pageOverrideMap = useMemo(() => {
      const m: Record<string, boolean> = {};
      myPageOverrides.forEach(o => { m[o.page_slug] = o.is_blocked; });
      return m;
    }, [myPageOverrides]);
    
    const { checkPermission, hasAnyRole, canManageRoles } = useAuthorization();
    const isAdmin = hasAnyRole(['admin']);
    const isDataCollector = roles?.includes('DataCollector' as AppRole) || 
                            roles?.includes('dataCollector' as AppRole) || 
                            currentUser?.role?.toLowerCase() === 'datacollector' ||
                            currentUser?.role?.toLowerCase() === 'data collector';

    // Pre-compute stable role booleans so they can be used as useEffect deps
    // (the hasAnyRole function reference changes every render â€” never put it in deps)
    const roleIsCoordinator = hasAnyRole(['coordinator', 'Coordinator']);
    const roleIsSupervisor   = hasAnyRole(['supervisor', 'Supervisor', 'hubSupervisor', 'hub_supervisor']);
    const roleIsFomOrAdmin   = isSuperAdmin || hasAnyRole(['fom', 'FOM', 'admin', 'Admin']);
    const roleIsFinance      = isSuperAdmin || hasAnyRole(['fom', 'FOM', 'admin', 'Admin', 'financial_auditor', 'financialAdmin', 'financialadmin']);
    const roleCanSeeIncident = isSuperAdmin || hasAnyRole(['admin', 'Admin', 'fom', 'FOM', 'supervisor', 'Supervisor', 'hubSupervisor', 'hub_supervisor']);

    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
      try {
        const stored = localStorage.getItem('pact-sidebar-collapsed');
        if (stored !== null) {
          const parsed: string[] = JSON.parse(stored);
          return new Set(parsed);
        }
      } catch {}
      return new Set(DENSE_COLLAPSED_BY_DEFAULT);
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

    // Aggregate approvals hub badge â€” mirrors useApprovalsData status-scope exactly.
    // Uses the same role gates and status filters as the useApprovalsData hook sections:
    // Â§1 withdrawal pending (supervisor): supervisor/FOM/admin
    // Â§2 withdrawal supervisor_approved (finance): financialAdmin/FOM/admin
    // Â§3 cost tier-1 pending: supervisor/FOM/admin
    // Â§4 cost tier-2 pending: FOM/admin
    // Â§5 DP pending_supervisor: supervisor/FOM/admin
    // Â§6 DP pending_admin: admin/FOM/financialAdmin (pendingDpAdmin now fetched for all these roles)
    // Â§7 pending users: admin only
    // Â§8 MMP unassigned: FOM/admin
    const isStrictAdmin = isSuperAdmin || hasAnyRole(['admin', 'Admin']);
    const approvalsHubCount =
      ((roleIsSupervisor || roleIsFomOrAdmin) ? counts.pendingWithdrawals : 0)        // Â§1
      + (roleIsFinance ? counts.pendingFinanceWithdrawals : 0)                         // Â§2
      + ((roleIsSupervisor || roleIsFomOrAdmin) ? pendingCostApprovalCount : 0)        // Â§3
      + (roleIsFomOrAdmin ? pendingTier2CostCount : 0)                                 // Â§4
      + ((roleIsSupervisor || roleIsFomOrAdmin) ? pendingDownPaymentCount : 0)         // Â§5
      + ((roleIsFomOrAdmin || roleIsFinance) ? counts.pendingDpAdmin : 0)              // Â§6
      + (isStrictAdmin ? counts.pendingUsers : 0)                                      // Â§7
      + (roleIsFomOrAdmin ? pendingMmpCount : 0);                                      // Â§8

    const menuPrefs: MenuPreferences = useMemo(() => {
      const savedPrefs = userSettings?.settings?.menuPreferences;
      return savedPrefs ? { ...DEFAULT_MENU_PREFERENCES, ...savedPrefs } : DEFAULT_MENU_PREFERENCES;
    }, [userSettings?.settings?.menuPreferences]);

    const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
      useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // T33 â€” surface persistence errors so users notice when favourites silently fail to save.
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

    const rawMenuGroups = currentUser ? getWorkflowMenuGroups(roles || [], currentUser.role, perms, isSuperAdmin, menuPrefs, hasMonitoringAccess) : [];

    // Apply page_access_overrides: granted overrides add items even if the role
    // check denied them; blocked overrides remove items even if the role check
    // would have shown them.
    const menuGroups = useMemo(() => {
      if (Object.keys(pageOverrideMap).length === 0) return rawMenuGroups;

      // Deep-clone the groups array so we don't mutate the cached result.
      const groups: typeof rawMenuGroups = rawMenuGroups.map(g => ({ ...g, items: [...g.items] }));

      // Helper: find or create a group by id
      const getOrCreateGroup = (groupId: string, label: string, order: number) => {
        let g = groups.find(x => x.id === groupId);
        if (!g) { g = { id: groupId, label, order, items: [] }; groups.push(g); }
        return g;
      };

      for (const [slug, isBlocked] of Object.entries(pageOverrideMap)) {
        const pageDef = PAGE_DEFS.find(p => p.slug === slug);
        if (!pageDef) continue;

        if (isBlocked) {
          // Remove this item from whichever group contains it
          groups.forEach(g => { g.items = g.items.filter(item => item.url !== pageDef.path); });
        } else {
          // Ensure this item exists in its group (add if missing)
          const sidebarGroupId = PAGEDEF_GROUP_TO_SIDEBAR[pageDef.group] ?? 'admin';
          const alreadyExists = groups.some(g => g.items.some(item => item.url === pageDef.path));
          if (!alreadyExists) {
            const group = getOrCreateGroup(sidebarGroupId, pageDef.group, 99);
            group.items.push({
              id: pageDef.slug,
              title: pageDef.label,
              url: pageDef.path,
              icon: pageDef.icon,
              priority: 99,
            });
          }
        }
      }

      // Re-sort groups and items by order/priority
      groups.sort((a, b) => a.order - b.order);
      groups.forEach(g => g.items.sort((a, b) => a.priority - b.priority));
      return groups.filter(g => g.items.length > 0);
    }, [rawMenuGroups, pageOverrideMap]);

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

    // Keep the section for the current page expanded
    useEffect(() => {
      if (!menuGroups.length) return;
      const toExpand = new Set<string>();
      menuGroups.forEach((group: MenuGroup & { parentGroup?: string }) => {
        if (group.items.some(item => isNavPathActive(pathname, item.url))) {
          toExpand.add(group.id);
          if ((group as { parentGroup?: string }).parentGroup) {
            toExpand.add((group as { parentGroup?: string }).parentGroup!);
          }
        }
      });
      if (toExpand.size === 0) return;
      setCollapsedGroups(prev => {
        const next = new Set(prev);
        let changed = false;
        toExpand.forEach(id => {
          if (next.has(id)) { next.delete(id); changed = true; }
        });
        if (!changed) return prev;
        try { localStorage.setItem('pact-sidebar-collapsed', JSON.stringify([...next])); } catch {}
        return next;
      });
    }, [pathname, menuGroups]);

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

        <SidebarHeader className="border-b border-slate-200/70 px-3 py-3">
          <div className="flex h-10 items-center gap-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <img src={Logo} alt="PACT Logo" className="h-8 w-8 shrink-0 object-contain" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate group-data-[collapsible=icon]:hidden">
              PACT
            </span>
            <SidebarTrigger
              className="ml-auto h-7 w-7 shrink-0 rounded-md group-data-[collapsible=icon]:hidden"
              data-testid="button-sidebar-trigger"
            />
          </div>
        </SidebarHeader>

        <SidebarContent className="px-2 pt-3 pb-2 gap-0.5">
          {favoriteItems.length > 0 && (
            <Collapsible open={!isFavoritesCollapsed}>
              <SidebarGroup className={cn(SIDEBAR_GROUP_SHELL, "pb-2")}>
                <CollapsibleTrigger asChild>
                  <SidebarGroupLabel
                    className={cn(
                      SIDEBAR_GROUP_LABEL,
                      "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30"
                    )}
                    onClick={() => {
                      const next = !isFavoritesCollapsed;
                      setIsFavoritesCollapsed(next);
                      try { localStorage.setItem('pact-favorites-collapsed', String(next)); } catch {}
                    }}
                    data-testid="group-label-favorites"
                  >
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                        isFavoritesCollapsed && "-rotate-90"
                      )}
                    />
                    <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500 shrink-0" />
                    <span className="flex-1 truncate">Favorites</span>
                    <span className="text-[10px] font-normal tabular-nums opacity-60">{favoriteItems.length}</span>
                  </SidebarGroupLabel>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarGroupContent className="pt-0.5">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext
                        items={favoriteItems.map(item => item.url)}
                        strategy={verticalListSortingStrategy}
                      >
                        <SidebarMenu className="gap-0.5">
                          {favoriteItems.map((item) => (
                            <SortableFavoriteItem
                              key={item.url}
                              item={item}
                              isActive={isNavPathActive(pathname, item.url)}
                              onRemove={removeFavorite}
                            />
                          ))}
                        </SidebarMenu>
                      </SortableContext>
                    </DndContext>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
              <SidebarSeparator className="mx-2 mb-1" />
            </Collapsible>
          )}

          {(() => {
            const financeSubGroups = menuGroups.filter((g: MenuGroup & { parentGroup?: string }) => g.parentGroup === 'finance');
            const regularGroups = menuGroups.filter((g: MenuGroup & { parentGroup?: string }) => !g.parentGroup);
            const allGroupsSorted = [...regularGroups].sort((a, b) => a.order - b.order);

            const NavCountBadge = ({ count, className, testId }: { count: number; className: string; testId: string }) =>
              count > 0 ? (
                <span
                  className={cn(
                    "ml-auto shrink-0 inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full text-white text-[9px] font-bold leading-none",
                    className
                  )}
                  data-testid={testId}
                >
                  {count > 99 ? '99+' : count}
                </span>
              ) : null;

            const renderItemBadge = (itemId: string) => {
              switch (itemId) {
                case 'approvals-hub':
                  return <NavCountBadge count={approvalsHubCount} className="bg-red-500" testId="badge-approvals-hub-count" />;
                case 'advance-requests-report':
                case 'reconciliation-dashboard':
                  return <NavCountBadge count={pendingReclaimCount} className="bg-orange-500" testId={`badge-${itemId}-count`} />;
                case 'cost-submission':
                case 'supervisor-approvals':
                  return <NavCountBadge count={pendingCostApprovalCount} className="bg-red-500" testId={`badge-${itemId}-count`} />;
                case 'down-payment-approval':
                  return <NavCountBadge count={pendingDownPaymentCount} className="bg-amber-500" testId="badge-down-payment-count" />;
                case 'mmp-management':
                  return <NavCountBadge count={pendingMmpCount} className="bg-blue-600" testId="badge-mmp-count" />;
                case 'site-verification':
                case 'sites-for-verification':
                  return <NavCountBadge count={pendingVerificationCount} className="bg-red-500" testId="badge-site-verification-count" />;
                case 'withdrawal-approval':
                  return <NavCountBadge count={pendingTier2CostCount} className="bg-amber-600" testId="badge-tier2-approval-count" />;
                case 'finance-approval':
                  return <NavCountBadge count={pendingFinanceCount} className="bg-indigo-500" testId="badge-finance-approval-count" />;
                case 'notifications':
                  return <NavCountBadge count={unreadNotifCount} className="bg-blue-500" testId="badge-notifications-unread-count" />;
                case 'incident-reports':
                case 'safety-hub':
                  return <NavCountBadge count={openIncidentCount} className="bg-red-600" testId="badge-incident-count" />;
                case 'my-wallet':
                  return <NavCountBadge count={pendingWalletCount} className="bg-green-600" testId="badge-wallet-pending-count" />;
                case 'my-tasks':
                  return <NavCountBadge count={myTasksOverdueCount} className="bg-red-500" testId="badge-my-tasks-overdue-count" />;
                case 'changelog':
                  return <NavCountBadge count={changelogUnreadCount} className="bg-blue-600" testId="badge-changelog-unread-count" />;
                default:
                  return null;
              }
            };

            const renderMenuItems = (items: MenuGroup['items'], nested = false) => {
              if (nested) {
                return (
                  <SidebarMenuSub className="mx-2 gap-0.5 border-l border-slate-200/80 dark:border-gray-700">
                    {items.map((item) => {
                      const isActive = isNavPathActive(pathname, item.url);
                      return (
                        <SidebarMenuSubItem key={item.id}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={isActive}
                            className={cn(
                              SIDEBAR_NAV_SUB_ITEM,
                              isActive &&
                                "bg-blue-100 text-blue-700 dark:bg-blue-900/70 dark:text-blue-300 font-semibold"
                            )}
                          >
                            <Link to={item.url} className="flex items-center gap-2" data-testid={`nav-link-${item.id}`}>
                              <item.icon
                                className={cn(
                                  "h-3.5 w-3.5 shrink-0",
                                  isActive
                                    ? "text-blue-700 dark:text-blue-300"
                                    : "text-slate-500 dark:text-slate-400"
                                )}
                              />
                              <span className="truncate flex-1">{item.title}</span>
                              {renderItemBadge(item.id)}
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                );
              }

              return (
                <SidebarMenu className="gap-0.5 px-0.5">
                  {items.map((item, itemIndex) => {
                    const isActive = isNavPathActive(pathname, item.url);
                    const isItemFavorite = isFavorite(item.url);
                    return (
                      <SidebarMenuItem key={item.id} index={itemIndex}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.title}
                          className={cn(
                            SIDEBAR_NAV_ITEM,
                            isActive &&
                              "bg-blue-100 text-blue-700 dark:bg-blue-900/70 dark:text-blue-300 font-semibold shadow-sm border border-blue-200/60 dark:border-blue-800/50"
                          )}
                        >
                          <Link to={item.url} className="flex items-center gap-2.5" data-testid={`nav-link-${item.id}`}>
                            <item.icon
                              className={cn(
                                "h-4 w-4 shrink-0",
                                isActive
                                  ? "text-blue-700 dark:text-blue-300"
                                  : "text-slate-500 dark:text-slate-400"
                              )}
                            />
                            <span className="truncate flex-1">{item.title}</span>
                            {renderItemBadge(item.id)}
                          </Link>
                        </SidebarMenuButton>
                        <SidebarMenuAction
                          showOnHover={!isItemFavorite}
                          className={isItemFavorite ? "opacity-100" : undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(item.url, item.title, item.icon?.name || 'Star');
                          }}
                          aria-label={isItemFavorite ? 'Remove from favorites' : 'Add to favorites'}
                          data-testid={`button-favorite-${item.id}`}
                        >
                          <Star
                            className={cn(
                              "h-3.5 w-3.5",
                              isItemFavorite
                                ? "text-amber-500 fill-amber-500"
                                : "text-muted-foreground"
                            )}
                          />
                        </SidebarMenuAction>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              );
            };

            const renderFinanceSection = (testIdSuffix = '') => {
              const isFinanceCollapsed = collapsedGroups.has('finance-parent');
              return (
                <Collapsible key={`finance-parent${testIdSuffix}`} open={!isFinanceCollapsed}>
                  <SidebarGroup className={SIDEBAR_GROUP_SHELL}>
                    <CollapsibleTrigger asChild>
                      <SidebarGroupLabel
                        className={cn(
                          SIDEBAR_GROUP_LABEL,
                          "text-green-600 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/30"
                        )}
                        onClick={() => toggleGroupCollapse('finance-parent')}
                        data-testid={`group-label-finance-parent${testIdSuffix}`}
                      >
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                            isFinanceCollapsed && "-rotate-90"
                          )}
                        />
                        <Banknote className="h-3.5 w-3.5 shrink-0" />
                        <span className="flex-1 truncate">Payments & Finance</span>
                      </SidebarGroupLabel>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarGroupContent className="space-y-1 pt-0.5">
                        {financeSubGroups.sort((a, b) => a.order - b.order).map(subGroup => {
                          const isSubCollapsed = collapsedGroups.has(subGroup.id);
                          return (
                            <Collapsible key={subGroup.id} open={!isSubCollapsed}>
                              <CollapsibleTrigger asChild>
                                <button
                                  type="button"
                                  className="w-full h-7 px-3 text-[11px] font-medium text-muted-foreground cursor-pointer flex items-center gap-2 rounded-md hover:bg-muted/50 transition-colors"
                                  onClick={() => toggleGroupCollapse(subGroup.id)}
                                  data-testid={`group-label-${subGroup.id}`}
                                >
                                  <ChevronDown
                                    className={cn(
                                      "h-3 w-3 shrink-0 transition-transform duration-200",
                                      isSubCollapsed && "-rotate-90"
                                    )}
                                  />
                                  <span className="flex-1 truncate text-left">{subGroup.label}</span>
                                  <span className="text-[10px] tabular-nums opacity-50">{subGroup.items.length}</span>
                                </button>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                {renderMenuItems(subGroup.items, true)}
                              </CollapsibleContent>
                            </Collapsible>
                          );
                        })}
                      </SidebarGroupContent>
                    </CollapsibleContent>
                  </SidebarGroup>
                </Collapsible>
              );
            };

            const rendered: JSX.Element[] = [];
            let financeInserted = false;

            for (const group of allGroupsSorted) {
              if (!financeInserted && group.order > 5 && financeSubGroups.length > 0) {
                financeInserted = true;
                rendered.push(renderFinanceSection());
              }

              const isCollapsed = collapsedGroups.has(group.id);
              const hasActiveItem = group.items.some(item => isNavPathActive(pathname, item.url));

              rendered.push(
                <Collapsible key={group.id} open={!isCollapsed}>
                  <SidebarGroup className={SIDEBAR_GROUP_SHELL}>
                    <CollapsibleTrigger asChild>
                      <SidebarGroupLabel
                        className={cn(
                          SIDEBAR_GROUP_LABEL,
                          "text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-gray-800",
                          hasActiveItem && "text-slate-700 dark:text-slate-200"
                        )}
                        onClick={() => toggleGroupCollapse(group.id)}
                        data-testid={`group-label-${group.id}`}
                      >
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                            isCollapsed && "-rotate-90"
                          )}
                        />
                        <span className="flex-1 truncate">{group.label}</span>
                        <span className="text-[10px] font-normal tabular-nums opacity-50">{group.items.length}</span>
                      </SidebarGroupLabel>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarGroupContent className="pt-0.5 pb-1">
                        {renderMenuItems(group.items)}
                      </SidebarGroupContent>
                    </CollapsibleContent>
                  </SidebarGroup>
                </Collapsible>
              );
            }

            if (!financeInserted && financeSubGroups.length > 0) {
              rendered.push(renderFinanceSection('-end'));
            }

            return rendered;
          })()}
        </SidebarContent>

        <SidebarFooter className="border-t border-slate-200/70 px-3 py-3">
          {currentUser && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2.5 px-2.5 py-2 h-11 hover:bg-blue-50 dark:hover:bg-gray-800 rounded-xl group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
                  data-testid="button-user-menu"
                >
                  <div className="relative shrink-0">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={currentUser.avatar} alt={currentUser.name} />
                      <AvatarFallback className="bg-blue-600 text-white text-[10px]">
                        {getInitials(currentUser.name)}
                      </AvatarFallback>
                    </Avatar>
                    <RealtimeStatusDot className="absolute -bottom-0.5 -right-0.5" />
                  </div>
                  <div className="flex flex-col items-start text-left leading-tight group-data-[collapsible=icon]:hidden min-w-0 flex-1">
                    <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate w-full">{currentUser.name}</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate w-full">{getPrimaryRole()}</span>
                  </div>
                  <ChevronUp className="ml-auto h-3.5 w-3.5 text-muted-foreground group-data-[collapsible=icon]:hidden shrink-0" />
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

  export default AppSidebar;
