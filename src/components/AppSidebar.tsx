  import { useLocation, Link, useNavigate } from "react-router-dom";
  import { Button } from "@/components/ui/button";
  import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";
  import { 
    Users,
    UsersRound,
    Settings, 
    FolderKanban, 
    Activity,
    Link2,
    Database,
    ClipboardList,
    Copy,
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
    Shuffle,
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
    Layers,
    FileDown,
    Languages,
    Webhook,
    X as XIcon,
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
  import { useViewAs } from "@/context/ViewAsContext";
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
    'finance-accounting-core',
    'finance-accounting-ops',
    'finance-accounting-p2p',
    'finance-accounting-controls',
    'finance-accounting-advanced',
    'finance-hub-operations',
    'finance-hub-reports',
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

  const isNavPathActive = (pathname: string, search: string, url: string) => {
    const [base, query] = url.split('?');
    const itemTab  = new URLSearchParams(query ?? '').get('tab');
    const currentTab = new URLSearchParams(search).get('tab');

    if (pathname === base) {
      if (itemTab) {
        // Tab-specific item: only active when the current ?tab matches exactly
        return currentTab === itemTab;
      } else {
        // Base-path item (no tab): active only when no tab is in the URL
        return !currentTab;
      }
    }
    // Child-route match (e.g. /hr/employee/123)
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
    hasMonitoringAccess: boolean = false,
    isFundHolder: boolean = false
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
    if (!isHidden('/my-projects')) {
      workspaceItems.push({ id: 'my-projects', title: "My Projects", url: "/my-projects", icon: FolderKanban, priority: 2.5, isPinned: isPinned('/my-projects') });
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
    const canSeeFieldDataHub = isSuperAdmin || isAdmin || isICT || isFOM || isDataTeam || isProjectManager || isCountryDirector;
    if (canSeeFieldDataHub && !isHidden('/field-data')) {
      planningItems.push({ id: 'field-data-hub', title: "Field Data Hub", url: "/field-data", icon: Layers, priority: 3, isPinned: isPinned('/field-data') });
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
    if (!isHidden('/budget-requests')) {
      myMoneyItems.push({ id: 'budget-requests', title: 'Budget Requests', url: '/budget-requests', icon: ClipboardList, priority: 5, isPinned: isPinned('/budget-requests') });
    }
    const myMoneyLabel =
      (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor)
        ? 'Submissions & Requests'
        : 'My Submissions';
    if (myMoneyItems.length) groups.push({ id: 'finance-my-money', label: myMoneyLabel, order: 5.1, items: myMoneyItems, parentGroup: 'finance' } as any);

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
    if (!isHidden('/enumerator-fees-report') && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor)) {
      approvalItems.push({ id: 'enumerator-fees-report', title: "Enumerator Fees Report", url: "/enumerator-fees-report", icon: Receipt, priority: 3.5, isPinned: isPinned('/enumerator-fees-report') });
    }
    if (!isHidden('/finance-approval') && canSeePath('/finance-approval', defaultRole)) {
      approvalItems.push({ id: 'finance-approval', title: "Finance Processing", url: "/finance-approval", icon: Banknote, priority: 4, isPinned: isPinned('/finance-approval') });
    }
    if (approvalItems.length) groups.push({ id: 'finance-approvals', label: "Approvals", order: 5.2, items: approvalItems, parentGroup: 'finance' } as any);

    // ── Finance Hub — 2 sections mirroring FinanceHub page ───────────────────
    const finHubAccess = isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor || isSupervisor || isFOM || isCountryDirector;
    if (finHubAccess && !isHidden('/finance-hub')) {
      // ── 1. Operations ─────────────────────────────────────────────────────
      const fhOpsItems: MenuGroup['items'] = [];
      fhOpsItems.push({ id: 'finance-hub-home',         title: 'Finance Hub',          url: '/finance-hub',                        icon: LayoutDashboard, priority: 1, isPinned: isPinned('/finance-hub') });
      fhOpsItems.push({ id: 'finance-hub-budget',       title: 'Budget',               url: '/finance-hub?tab=budget',             icon: DollarSign,      priority: 2, isPinned: isPinned('/finance-hub?tab=budget') });
      fhOpsItems.push({ id: 'finance-hub-fin-ops',      title: 'Financial Operations', url: '/finance-hub?tab=financial-ops',      icon: Activity,        priority: 3, isPinned: isPinned('/finance-hub?tab=financial-ops') });
      fhOpsItems.push({ id: 'finance-hub-wallets',      title: 'Wallets Admin',        url: '/finance-hub?tab=admin-wallets',      icon: CreditCard,      priority: 4, isPinned: isPinned('/finance-hub?tab=admin-wallets') });
      fhOpsItems.push({ id: 'finance-hub-recon',        title: 'Reconciliation',       url: '/finance-hub?tab=reconciliation',     icon: RefreshCw,       priority: 5, isPinned: isPinned('/finance-hub?tab=reconciliation') });
      fhOpsItems.push({ id: 'finance-hub-subscriptions',title: 'Subscriptions',        url: '/finance-hub?tab=subscriptions',      icon: Layers,          priority: 6, isPinned: isPinned('/finance-hub?tab=subscriptions') });
      groups.push({ id: 'finance-hub-operations', label: 'Finance Hub', order: 5.3, items: fhOpsItems, parentGroup: 'finance' } as any);

      // ── 2. Reports ────────────────────────────────────────────────────────
      const fhReportItems: MenuGroup['items'] = [];
      fhReportItems.push({ id: 'finance-hub-wallet-rpt',    title: 'Wallet Reports',            url: '/finance-hub?tab=wallet-reports',      icon: BarChart3,     priority: 1, isPinned: isPinned('/finance-hub?tab=wallet-reports') });
      fhReportItems.push({ id: 'finance-hub-advance-rpt',   title: 'Transport Advance Report',  url: '/finance-hub?tab=advance-report',      icon: ClipboardList, priority: 2, isPinned: isPinned('/finance-hub?tab=advance-report') });
      fhReportItems.push({ id: 'finance-hub-dup-payments',  title: 'Duplicate Payments',        url: '/finance-hub?tab=duplicate-payments',  icon: Copy,          priority: 3, isPinned: isPinned('/finance-hub?tab=duplicate-payments') });
      fhReportItems.push({ id: 'finance-hub-cost-pred',     title: 'Cost Predictions',          url: '/finance-hub?tab=cost-predictions',    icon: TrendingUp,    priority: 4, isPinned: isPinned('/finance-hub?tab=cost-predictions') });
      fhReportItems.push({ id: 'finance-hub-fx',            title: 'Exchange Rates',            url: '/finance-hub?tab=exchange-rates',      icon: ArrowLeftRight,priority: 5, isPinned: isPinned('/finance-hub?tab=exchange-rates') });
      fhReportItems.push({ id: 'finance-hub-salary-rpt',    title: 'Salary & Retainer Report',  url: '/finance-hub?tab=salary-retainer',     icon: Users,         priority: 6, isPinned: isPinned('/finance-hub?tab=salary-retainer') });
      fhReportItems.push({ id: 'finance-hub-month-end',     title: 'Month-End Summary',         url: '/finance-hub?tab=month-end',           icon: CalendarCheck, priority: 7, isPinned: isPinned('/finance-hub?tab=month-end') });
      fhReportItems.push({ id: 'finance-hub-enum-fees',     title: 'Enumerator Fees Report',    url: '/finance-hub?tab=enumerator-fees',     icon: Receipt,       priority: 8, isPinned: isPinned('/finance-hub?tab=enumerator-fees') });
      groups.push({ id: 'finance-hub-reports', label: 'Finance Reports', order: 5.31, items: fhReportItems, parentGroup: 'finance' } as any);
    }

    // ── Pre-Funding module ────────────────────────────────────────────
    const preFundItems: MenuGroup['items'] = [];
    if (isSuperAdmin || isAdmin || isFinancialAdmin) {
      if (!isHidden('/pre-funding'))               preFundItems.push({ id: 'pre-funding-overview',  title: 'Overview',       url: '/pre-funding',               icon: Banknote,    priority: 1, isPinned: isPinned('/pre-funding') });
      if (!isHidden('/pre-funding/registry'))      preFundItems.push({ id: 'pre-funding-registry',  title: 'Fund Registry',  url: '/pre-funding/registry',      icon: FileText,    priority: 2, isPinned: isPinned('/pre-funding/registry') });
      if (!isHidden('/pre-funding/approvals'))     preFundItems.push({ id: 'pre-funding-approvals', title: 'Approval Flow',  url: '/pre-funding/approvals',     icon: CheckSquare, priority: 3, isPinned: isPinned('/pre-funding/approvals') });
      if (!isHidden('/pre-funding/reconciliation'))preFundItems.push({ id: 'pre-funding-recon',     title: 'Reconciliation', url: '/pre-funding/reconciliation', icon: Landmark,    priority: 4, isPinned: isPinned('/pre-funding/reconciliation') });
      if (!isHidden('/pre-funding/settings'))      preFundItems.push({ id: 'pre-funding-settings',  title: 'Settings',       url: '/pre-funding/settings',      icon: Settings,    priority: 5, isPinned: isPinned('/pre-funding/settings') });
    } else if (isCountryDirector || isAuditor || isFundHolder) {
      // CD and Auditor are in PAGE_DEFS for pre-funding; show the link immediately
      // without waiting for the async isFundHolder DB check.
      // PreFundingRoute handles the holder-only gate for non-holders.
      // isFundHolder covers other roles (FOM, etc.) granted via page override.
      if (!isHidden('/pre-funding')) preFundItems.push({ id: 'pre-funding-overview', title: 'Pre-Funding', url: '/pre-funding', icon: Banknote, priority: 1, isPinned: isPinned('/pre-funding') });
    }
    if (preFundItems.length) groups.push({ id: 'finance-prefunding', label: 'Pre-Funding', order: 5.45, items: preFundItems, parentGroup: 'finance' } as any);

    // ── Accounting module — 5 sections mirroring AccountingHub ───────────────
    const acctAccess = isSuperAdmin || isAdmin;
    const acctAuditAccess = acctAccess;

    if (acctAccess) {
      // ── 1. Core Ledger ──────────────────────────────────────────────────────
      const coreItems: MenuGroup['items'] = [];
      if (!isHidden('/accounting'))                    coreItems.push({ id: 'accounting-hub',         title: 'Accounting Hub',       url: '/accounting',                          icon: LayoutDashboard, priority: 1,  isPinned: isPinned('/accounting') });
      if (!isHidden('/accounting/journals'))           coreItems.push({ id: 'accounting-journals',    title: 'Journal Entries',      url: '/accounting?tab=journals',             icon: Receipt,         priority: 2,  isPinned: isPinned('/accounting?tab=journals') });
      if (!isHidden('/accounting/coa'))                coreItems.push({ id: 'accounting-coa',         title: 'Chart of Accounts',    url: '/accounting?tab=coa',                  icon: BarChart3,       priority: 3,  isPinned: isPinned('/accounting?tab=coa') });
      if (!isHidden('/accounting/trial-balance'))      coreItems.push({ id: 'accounting-trial-bal',   title: 'Trial Balance',        url: '/accounting?tab=trial-balance',        icon: TrendingUp,      priority: 4,  isPinned: isPinned('/accounting?tab=trial-balance') });
      if (!isHidden('/accounting/ledger'))             coreItems.push({ id: 'accounting-ledger',      title: 'General Ledger',       url: '/accounting?tab=ledger',               icon: BookOpen,        priority: 5,  isPinned: isPinned('/accounting?tab=ledger') });
      if (!isHidden('/accounting/reports'))            coreItems.push({ id: 'accounting-reports',     title: 'Financial Statements', url: '/accounting?tab=reports',              icon: FileText,        priority: 6,  isPinned: isPinned('/accounting?tab=reports') });
      if (!isHidden('/accounting/fiscal-years'))       coreItems.push({ id: 'accounting-fiscal-yrs',  title: 'Fiscal Years',         url: '/accounting?tab=fiscal-years',         icon: Calendar,        priority: 7,  isPinned: isPinned('/accounting?tab=fiscal-years') });
      if (!isHidden('/accounting/search'))             coreItems.push({ id: 'accounting-search',      title: 'Quick Search',         url: '/accounting?tab=search',               icon: Search,          priority: 8,  isPinned: isPinned('/accounting?tab=search') });
      if (coreItems.length) groups.push({ id: 'finance-accounting-core', label: 'Core Ledger', order: 5.50, items: coreItems, parentGroup: 'accounting' } as any);

      // ── 2. Financial Operations ─────────────────────────────────────────────
      const finOpsItems: MenuGroup['items'] = [];
      if (!isHidden('/accounting/bank-recon'))         finOpsItems.push({ id: 'accounting-bank-recon',    title: 'Bank Reconciliation',  url: '/accounting?tab=bank-recon',           icon: Landmark,    priority: 1,  isPinned: isPinned('/accounting?tab=bank-recon') });
      if (!isHidden('/accounting/budget-planning'))    finOpsItems.push({ id: 'accounting-budget-plan',   title: 'Budget Planning',      url: '/accounting?tab=budget-planning',      icon: PiggyBank,   priority: 2,  isPinned: isPinned('/accounting?tab=budget-planning') });
      if (!isHidden('/accounting/budget-variance'))    finOpsItems.push({ id: 'accounting-budget-var',    title: 'Budget vs Actual',     url: '/accounting?tab=budget-variance',      icon: BarChart3,   priority: 3,  isPinned: isPinned('/accounting?tab=budget-variance') });
      if (!isHidden('/accounting/annual-budget'))      finOpsItems.push({ id: 'accounting-annual-bud',    title: 'Annual Budget',        url: '/accounting?tab=annual-budget',        icon: PiggyBank,   priority: 4,  isPinned: isPinned('/accounting?tab=annual-budget') });
      if (!isHidden('/accounting/cash-flow'))          finOpsItems.push({ id: 'accounting-cash-flow',     title: 'Cash Flow',            url: '/accounting?tab=cash-flow',            icon: TrendingUp,  priority: 5,  isPinned: isPinned('/accounting?tab=cash-flow') });
      if (!isHidden('/accounting/cash-flow-forecast')) finOpsItems.push({ id: 'accounting-cashflow-fc',  title: 'Cash Flow Forecast',   url: '/accounting?tab=cash-flow-forecast',   icon: TrendingUp,  priority: 6,  isPinned: isPinned('/accounting?tab=cash-flow-forecast') });
      if (!isHidden('/accounting/fixed-assets'))       finOpsItems.push({ id: 'accounting-fixed-assets',  title: 'Fixed Assets',         url: '/accounting?tab=fixed-assets',         icon: Package,     priority: 7,  isPinned: isPinned('/accounting?tab=fixed-assets') });
      if (!isHidden('/accounting/gl-bridge'))          finOpsItems.push({ id: 'accounting-gl-bridge',     title: 'GL Bridge Engine',     url: '/accounting?tab=gl-bridge',            icon: Zap,         priority: 8,  isPinned: isPinned('/accounting?tab=gl-bridge') });
      if (!isHidden('/accounting/bank-statement-import')) finOpsItems.push({ id: 'accounting-bank-import', title: 'Bank Statement Import', url: '/accounting?tab=bank-statement-import', icon: Landmark,  priority: 9,  isPinned: isPinned('/accounting?tab=bank-statement-import') });
      if (finOpsItems.length) groups.push({ id: 'finance-accounting-ops', label: 'Financial Operations', order: 5.51, items: finOpsItems, parentGroup: 'accounting' } as any);

      // ── 3. Procurement & P2P ────────────────────────────────────────────────
      const p2pItems: MenuGroup['items'] = [];
      if (!isHidden('/accounting/vendors'))                 p2pItems.push({ id: 'accounting-vendors',      title: 'Vendor Registry',         url: '/accounting?tab=vendors',               icon: Building2,    priority: 1, isPinned: isPinned('/accounting?tab=vendors') });
      if (!isHidden('/accounting/purchase-requisitions'))   p2pItems.push({ id: 'accounting-pr',           title: 'Purchase Requisitions',   url: '/accounting?tab=purchase-requisitions', icon: Receipt,      priority: 2, isPinned: isPinned('/accounting?tab=purchase-requisitions') });
      if (!isHidden('/accounting/purchase-orders'))         p2pItems.push({ id: 'accounting-po',           title: 'Purchase Orders',         url: '/accounting?tab=purchase-orders',       icon: ShoppingCart, priority: 3, isPinned: isPinned('/accounting?tab=purchase-orders') });
      if (!isHidden('/accounting/grn'))                     p2pItems.push({ id: 'accounting-grn',          title: 'Goods Receipt Notes',     url: '/accounting?tab=grn',                   icon: Package,      priority: 4, isPinned: isPinned('/accounting?tab=grn') });
      if (!isHidden('/accounting/ap-invoices'))              p2pItems.push({ id: 'accounting-ap-inv',       title: 'AP Invoices',             url: '/accounting?tab=ap-invoices',           icon: FileText,     priority: 5, isPinned: isPinned('/accounting?tab=ap-invoices') });
      if (!isHidden('/accounting/cheque-register'))          p2pItems.push({ id: 'accounting-cheque',       title: 'Cheque Register',         url: '/accounting?tab=cheque-register',       icon: CreditCard,   priority: 6, isPinned: isPinned('/accounting?tab=cheque-register') });
      if (!isHidden('/accounting/ap-aging'))                 p2pItems.push({ id: 'accounting-ap-aging',     title: 'AP Aging',                url: '/accounting?tab=ap-aging',              icon: Clock,        priority: 7, isPinned: isPinned('/accounting?tab=ap-aging') });
      if (!isHidden('/accounting/expense-reports'))          p2pItems.push({ id: 'accounting-exp-reports',  title: 'Expense Reports',         url: '/accounting?tab=expense-reports',       icon: Receipt,      priority: 8, isPinned: isPinned('/accounting?tab=expense-reports') });
      if (p2pItems.length) groups.push({ id: 'finance-accounting-p2p', label: 'Procurement & P2P', order: 5.52, items: p2pItems, parentGroup: 'accounting' } as any);

      // ── 4. Controls & Compliance ────────────────────────────────────────────
      const controlsItems: MenuGroup['items'] = [];
      if (!isHidden('/accounting/period-close'))        controlsItems.push({ id: 'accounting-period-close', title: 'Period Close',         url: '/accounting?tab=period-close',         icon: Lock,           priority: 1, isPinned: isPinned('/accounting?tab=period-close') });
      if (!isHidden('/accounting/budget-encumbrance'))  controlsItems.push({ id: 'accounting-encumbrance',  title: 'Budget Encumbrance',   url: '/accounting?tab=budget-encumbrance',   icon: Wallet,         priority: 2, isPinned: isPinned('/accounting?tab=budget-encumbrance') });
      if (!isHidden('/accounting/funds'))               controlsItems.push({ id: 'accounting-funds',         title: 'Funds',                url: '/accounting?tab=funds',                icon: Landmark,       priority: 3, isPinned: isPinned('/accounting?tab=funds') });
      if (!isHidden('/accounting/multi-currency'))      controlsItems.push({ id: 'accounting-multi-curr',   title: 'Multi-Currency',        url: '/accounting?tab=multi-currency',       icon: ArrowLeftRight, priority: 4, isPinned: isPinned('/accounting?tab=multi-currency') });
      if (!isHidden('/accounting/tax'))                 controlsItems.push({ id: 'accounting-tax',           title: 'Tax Management',       url: '/accounting?tab=tax',                  icon: Receipt,        priority: 5, isPinned: isPinned('/accounting?tab=tax') });
      if (!isHidden('/accounting/analytic-plans'))      controlsItems.push({ id: 'accounting-analytic',      title: 'Analytic Plans',       url: '/accounting?tab=analytic-plans',       icon: BarChart3,      priority: 6, isPinned: isPinned('/accounting?tab=analytic-plans') });
      if (acctAuditAccess && !isHidden('/accounting/donor-reports')) controlsItems.push({ id: 'accounting-donor', title: 'Donor Fund Reports', url: '/accounting?tab=donor-reports',  icon: Heart,          priority: 7, isPinned: isPinned('/accounting?tab=donor-reports') });
      if (!isHidden('/accounting/sod'))                 controlsItems.push({ id: 'accounting-sod',           title: 'Segregation of Duties',url: '/accounting?tab=sod',                  icon: ShieldCheck,    priority: 8, isPinned: isPinned('/accounting?tab=sod') });
      if (!isHidden('/accounting/aml'))                 controlsItems.push({ id: 'accounting-aml',           title: 'AML & Compliance',     url: '/accounting?tab=aml',                  icon: ShieldAlert,    priority: 9, isPinned: isPinned('/accounting?tab=aml') });
      if (controlsItems.length) groups.push({ id: 'finance-accounting-controls', label: 'Controls & Compliance', order: 5.53, items: controlsItems, parentGroup: 'accounting' } as any);

      // ── 5. Advanced & Reporting ─────────────────────────────────────────────
      const advancedItems: MenuGroup['items'] = [];
      if (!isHidden('/accounting/grants'))             advancedItems.push({ id: 'accounting-grants',       title: 'Grant Tracking',       url: '/accounting?tab=grants',               icon: Award,       priority: 1, isPinned: isPinned('/accounting?tab=grants') });
      if (!isHidden('/accounting/cost-allocation'))    advancedItems.push({ id: 'accounting-cost-alloc',  title: 'Cost Allocation',      url: '/accounting?tab=cost-allocation',      icon: Zap,         priority: 2, isPinned: isPinned('/accounting?tab=cost-allocation') });
      if (!isHidden('/accounting/consolidation'))      advancedItems.push({ id: 'accounting-consolidate', title: 'Consolidation',        url: '/accounting?tab=consolidation',        icon: Building2,   priority: 3, isPinned: isPinned('/accounting?tab=consolidation') });
      if (!isHidden('/accounting/gl-audit'))           advancedItems.push({ id: 'accounting-gl-audit',    title: 'GL Bridge Audit',      url: '/accounting?tab=gl-audit',             icon: Activity,    priority: 4, isPinned: isPinned('/accounting?tab=gl-audit') });
      if (!isHidden('/accounting/finance-audit-trail'))advancedItems.push({ id: 'accounting-audit-trail', title: 'Finance Audit Trail',  url: '/accounting?tab=finance-audit-trail',  icon: ScrollText,  priority: 5, isPinned: isPinned('/accounting?tab=finance-audit-trail') });
      if (!isHidden('/accounting/intercompany'))       advancedItems.push({ id: 'accounting-intercompany',title: 'Intercompany',         url: '/accounting?tab=intercompany',         icon: ArrowLeftRight, priority: 6, isPinned: isPinned('/accounting?tab=intercompany') });
      if (!isHidden('/accounting/settings'))           advancedItems.push({ id: 'accounting-settings',    title: 'Accounting Settings',  url: '/accounting?tab=settings',             icon: Settings,    priority: 7, isPinned: isPinned('/accounting?tab=settings') });
      if (advancedItems.length) groups.push({ id: 'finance-accounting-advanced', label: 'Advanced & Reporting', order: 5.54, items: advancedItems, parentGroup: 'accounting' } as any);
    }

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
      const surveyItems: MenuGroup['items'] = [
        { id: 'surveys', title: 'Surveys', url: '/surveys', icon: ClipboardList, priority: 1, isPinned: isPinned('/surveys') },
      ];
      if (isSuperAdmin || isAdmin)
        surveyItems.push({ id: 'data-quality', title: 'Data Quality Control', url: '/data-quality', icon: ShieldCheck, priority: 2, isPinned: isPinned('/data-quality') });
      groups.push({ id: 'surveys', label: 'Surveys', order: 5.9, items: surveyItems });
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
      if (!isHidden('/recycle-bin')) {
        superAdminItems.push({ id: 'recycle-bin', title: "Recycle Bin", url: "/recycle-bin", icon: Archive, priority: 2, isPinned: isPinned('/recycle-bin') });
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
    const { pathname, search } = useLocation();
    const navigate = useNavigate();
    const { currentUser, logout, roles } = useAppContext();
    const { showDueReminders } = useSiteVisitReminders();
    const { state } = useSidebar();
    const isSidebarCollapsed = state === 'collapsed';
    const { isSuperAdmin: realIsSuperAdmin } = useSuperAdmin();
    const { viewAs, setViewAs, clearViewAs, openPickerRequest, clearOpenPickerRequest } = useViewAs();
    // When in view-as mode, override SA flag and treat current roles as the viewed role only
    const isSuperAdmin = viewAs ? (viewAs.role === 'superAdmin' || viewAs.role === 'super_admin') : realIsSuperAdmin;
    const { userSettings, updateMenuPreferences, menuPreferences: contextMenuPrefs } = useSettings();

    // View As picker state
    const [viewAsOpen, setViewAsOpen] = useState(false);
    const [viewAsTab, setViewAsTab] = useState<'role' | 'user'>('role');
    const [viewAsRoleSelected, setViewAsRoleSelected] = useState('');
    const [viewAsUserSearch, setViewAsUserSearch] = useState('');
    const [viewAsUserSelected, setViewAsUserSelected] = useState<{ id: string; full_name: string; role: string } | null>(null);
    const [viewAsUsers, setViewAsUsers] = useState<{ id: string; full_name: string; email: string; role: string }[]>([]);
    const [viewAsUsersLoading, setViewAsUsersLoading] = useState(false);

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

    // Open picker dialog when the banner's "Switch" button fires requestOpenPicker()
    const openViewAsDialog = async () => {
      setViewAsOpen(true);
      setViewAsUsersLoading(true);
      const { data } = await supabase.from('profiles').select('id, full_name, email, role').order('full_name');
      if (data) setViewAsUsers(data.filter(u => u.id !== currentUser?.id));
      setViewAsUsersLoading(false);
    };
    useEffect(() => {
      if (!openPickerRequest) return;
      clearOpenPickerRequest();
      openViewAsDialog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openPickerRequest]);

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
    // isDataCollector must use user_roles (via `roles`) as the authoritative source.
    // Falling back to currentUser.role is only correct when NO roles have been
    // loaded yet — because profiles.role can be stale (e.g. 'dataCollector')
    // even after an admin assigned a higher role via user_roles only.
    // Using currentUser.role unconditionally caused the sidebar to flip to
    // data-collector mode on any profiles UPDATE realtime event.
    // When viewAs is active, determine isDataCollector purely from the previewed role
    const effectiveRoleForSidebar = viewAs?.role ?? currentUser?.role ?? '';
    const isDataCollector = viewAs
      ? (effectiveRoleForSidebar.toLowerCase() === 'datacollector' || effectiveRoleForSidebar.toLowerCase() === 'data_collector' || effectiveRoleForSidebar.toLowerCase() === 'data collector')
      : (roles?.includes('DataCollector' as AppRole) || 
         roles?.includes('dataCollector' as AppRole) || 
         ((!roles || roles.length === 0) && (
           currentUser?.role?.toLowerCase() === 'datacollector' ||
           currentUser?.role?.toLowerCase() === 'data collector'
         )));

    // Pre-compute stable role booleans so they can be used as useEffect deps
    // (the hasAnyRole function reference changes every render â€” never put it in deps)
    const roleIsCoordinator = hasAnyRole(['coordinator', 'Coordinator']);
    const roleIsSupervisor   = hasAnyRole(['supervisor', 'Supervisor', 'hubSupervisor', 'hub_supervisor']);
    const roleIsFomOrAdmin   = isSuperAdmin || hasAnyRole(['fom', 'FOM', 'admin', 'Admin']);
    const roleIsFinance      = isSuperAdmin || hasAnyRole(['fom', 'FOM', 'admin', 'Admin', 'financial_auditor', 'financialAdmin', 'financialadmin']);
    const roleCanSeeIncident = isSuperAdmin || hasAnyRole(['admin', 'Admin', 'fom', 'FOM', 'supervisor', 'Supervisor', 'hubSupervisor', 'hub_supervisor']);

    // Check if the current user (or the ViewAs-previewed user) is a fund holder.
    // Fund holders get a "My Fund" sidebar entry and can access /pre-funding even
    // without a finance admin role.
    // IMPORTANT: declared here, AFTER hasAnyRole is available — accessing hasAnyRole
    // before this line would trigger a temporal dead zone crash in the minified bundle.
    //
    // When ViewAs is active in "user" mode, we check the previewed user's fund holder
    // status so the sidebar accurately reflects what that user would see.
    const FINANCE_ADMIN_ROLES = ['super_admin', 'admin', 'financialAdmin'];
    const isFinanceAdminRole = viewAs
      ? FINANCE_ADMIN_ROLES.includes(viewAs.role)
      : hasAnyRole(FINANCE_ADMIN_ROLES);
    // The user ID to check fund holder status for — uses previewed user when ViewAs active
    const effectiveHolderCheckId = (viewAs?.mode === 'user' ? viewAs.userId : undefined) ?? currentUser?.id;
    const { data: isFundHolder = false } = useQuery({
      queryKey: ['sidebar-fund-holder', effectiveHolderCheckId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('pre_fund_requests')
          .select('id')
          .eq('holder_user_id', effectiveHolderCheckId!)
          .limit(1);
        if (error) console.warn('[Sidebar] fund-holder check:', error.message);
        return (data?.length ?? 0) > 0;
      },
      enabled: !isFinanceAdminRole && !!effectiveHolderCheckId,
      staleTime: 60_000,
      select: (v) => v,
    });

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
    const changelogUnreadCount = getChangelogUnreadCount(currentUser?.id ?? '', (viewAs?.role ?? currentUser?.role) ?? '');

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

    // Memoize perms — each field is a boolean, so deps are the stable booleans
    // that gate them. Recalculating this inline every render creates a new object
    // reference which makes menuGroups recompute and useEffect(menuGroups) fire
    // on every single render.
    const perms = useMemo(() => ({
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [isSuperAdmin, isAdmin, currentUser?.id, currentUser?.role]);

    // Memoize extraRoles — spread/map creates a new array reference every render
    const extraRoles: AppRole[] = useMemo(
      () => Array.isArray(currentUser?.additionalRoles)
        ? (currentUser!.additionalRoles as any[]).map((r: any) => r?.role as AppRole).filter(Boolean)
        : [],
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [currentUser?.id, currentUser?.additionalRoles]
    );

    // Apply page_access_overrides: granted overrides add items even if the role
    // check denied them; blocked overrides remove items even if the role check
    // would have shown them.
    // rawMenuGroups is intentionally computed inside this useMemo so the result
    // is stable — computing it inline (outside useMemo) caused a new array
    // reference every render, making menuGroups and the useEffect(menuGroups)
    // fire on every render, creating a continuous sidebar flicker.
    const menuGroups = useMemo(() => {
      const rawMenuGroups = currentUser
        ? getWorkflowMenuGroups(
            viewAs ? [viewAs.role as AppRole] : [...(roles || []), ...extraRoles],
            viewAs ? viewAs.role : currentUser.role,
            perms,
            isSuperAdmin,
            menuPrefs,
            hasMonitoringAccess,
            isFundHolder
          )
        : [];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // viewAs MUST be in the dep array — switching between two non-SA roles doesn't
    // change isSuperAdmin (stays false), so without viewAs the sidebar never re-renders.
    }, [currentUser?.id, currentUser?.role, roles, extraRoles, perms, isSuperAdmin, menuPrefs, hasMonitoringAccess, isFundHolder, pageOverrideMap, viewAs]);

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
        if (group.items.some(item => isNavPathActive(pathname, search, item.url))) {
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
      // Canonical role label map (keys are normalised: lowercase, no spaces/underscores/dashes)
      const ROLE_LABEL: Record<string, string> = {
        superadmin:          "Super Admin",
        admin:               "Admin",
        ict:                 "ICT",
        fom:                 "Field Ops Manager",
        financialadmin:      "Financial Admin",
        financialauditor:    "Financial Auditor",
        auditor:             "Financial Auditor",
        supervisor:          "Supervisor",
        hubsupervisor:       "Hub Supervisor",
        coordinator:         "Coordinator",
        datacollector:       "Data Collector",
        datateam:            "Data Team",
        countrydirector:     "Country Director",
        projectmanager:      "Project Manager",
        senioroperationslead:"Senior Ops Lead",
        reviewer:            "Reviewer",
        employee:            "Employee",
        hr:                  "HR",
        hrmanager:           "HR Manager",
      };
      // When viewAs is active, show the previewed role — ignore SA's own role/roles array
      if (viewAs?.role) {
        const viewAsNorm = viewAs.role.toLowerCase().replace(/[\s_-]/g, '');
        return ROLE_LABEL[viewAsNorm] || viewAs.role.charAt(0).toUpperCase() + viewAs.role.slice(1);
      }
      // Guard: if profile role itself says superAdmin, trust it even if context hasn't resolved yet
      const profileRoleNorm = currentUser.role?.toLowerCase().replace(/[\s_-]/g, '');
      if (profileRoleNorm === 'superadmin') return "Super Admin";
      if (roles && roles.length > 0) {
        if (roles.includes("admin" as AppRole)) return "Admin";
        const norm0 = (roles[0] as string).toLowerCase().replace(/[\s_-]/g, '');
        return ROLE_LABEL[norm0] || (roles[0] as string).charAt(0).toUpperCase() + (roles[0] as string).slice(1);
      }
      return ROLE_LABEL[profileRoleNorm ?? ''] || (currentUser.role ?? '').charAt(0).toUpperCase() + (currentUser.role ?? '').slice(1);
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
                              isActive={isNavPathActive(pathname, search, item.url)}
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
            const accountingSubGroups = menuGroups.filter((g: MenuGroup & { parentGroup?: string }) => g.parentGroup === 'accounting');
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
                      const isActive = isNavPathActive(pathname, search, item.url);
                      const isItemFavorite = isFavorite(item.url);
                      return (
                        <SidebarMenuSubItem key={item.id} className="group/subitem relative">
                          <SidebarMenuSubButton
                            asChild
                            isActive={isActive}
                            className={cn(
                              SIDEBAR_NAV_SUB_ITEM,
                              isActive &&
                                "bg-blue-100 text-blue-700 dark:bg-blue-900/70 dark:text-blue-300 font-semibold"
                            )}
                          >
                            <Link to={item.url} className="flex items-center gap-2 pr-6" data-testid={`nav-link-${item.id}`}>
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
                          <button
                            className={cn(
                              "absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded transition-opacity",
                              isItemFavorite
                                ? "opacity-100"
                                : "opacity-0 group-hover/subitem:opacity-100"
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              toggleFavorite(item.url, item.title, item.icon?.name || 'Star');
                            }}
                            aria-label={isItemFavorite ? 'Remove from favorites' : 'Add to favorites'}
                            data-testid={`button-favorite-${item.id}`}
                          >
                            <Star
                              className={cn(
                                "h-3 w-3",
                                isItemFavorite
                                  ? "text-amber-500 fill-amber-500"
                                  : "text-muted-foreground"
                              )}
                            />
                          </button>
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                );
              }

              return (
                <SidebarMenu className="gap-0.5 px-0.5">
                  {items.map((item, itemIndex) => {
                    const isActive = isNavPathActive(pathname, search, item.url);
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

            const renderSubGroups = (subGroups: typeof financeSubGroups) =>
              subGroups.sort((a, b) => a.order - b.order).map(subGroup => {
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
              });

            const renderFinanceSection = (testIdSuffix = '') => {
              const isFinanceCollapsed = collapsedGroups.has('finance-parent');
              return (
                <Collapsible key={`finance-parent${testIdSuffix}`} open={!isFinanceCollapsed}>
                  <SidebarGroup className={SIDEBAR_GROUP_SHELL}>
                    <CollapsibleTrigger asChild>
                      <SidebarGroupLabel
                        className={cn(SIDEBAR_GROUP_LABEL, "text-green-600 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/30")}
                        onClick={() => toggleGroupCollapse('finance-parent')}
                        data-testid={`group-label-finance-parent${testIdSuffix}`}
                      >
                        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", isFinanceCollapsed && "-rotate-90")} />
                        <Banknote className="h-3.5 w-3.5 shrink-0" />
                        <span className="flex-1 truncate">Payments & Finance</span>
                      </SidebarGroupLabel>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarGroupContent className="space-y-1 pt-0.5">
                        {renderSubGroups(financeSubGroups)}
                      </SidebarGroupContent>
                    </CollapsibleContent>
                  </SidebarGroup>
                </Collapsible>
              );
            };

            const renderAccountingSection = (testIdSuffix = '') => {
              const isAcctCollapsed = collapsedGroups.has('accounting-parent');
              return (
                <Collapsible key={`accounting-parent${testIdSuffix}`} open={!isAcctCollapsed}>
                  <SidebarGroup className={SIDEBAR_GROUP_SHELL}>
                    <CollapsibleTrigger asChild>
                      <SidebarGroupLabel
                        className={cn(SIDEBAR_GROUP_LABEL, "text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30")}
                        onClick={() => toggleGroupCollapse('accounting-parent')}
                        data-testid={`group-label-accounting-parent${testIdSuffix}`}
                      >
                        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", isAcctCollapsed && "-rotate-90")} />
                        <BookOpen className="h-3.5 w-3.5 shrink-0" />
                        <span className="flex-1 truncate">Accounting</span>
                      </SidebarGroupLabel>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarGroupContent className="space-y-1 pt-0.5">
                        {renderSubGroups(accountingSubGroups)}
                      </SidebarGroupContent>
                    </CollapsibleContent>
                  </SidebarGroup>
                </Collapsible>
              );
            };

            const GROUP_ICONS: Record<string, React.ElementType> = {
              'workspace':            LayoutDashboard,
              'programme-management': FolderKanban,
              'communication':        MessageSquare,
              'field-ops':            Activity,
              'coordination':         Network,
              'hr-people':            Users,
              'crm':                  Handshake,
              'surveys':              ClipboardList,
              'analytics':            BarChart3,
              'admin':                Settings,
              'help':                 HelpCircle,
              'super-admin':          ShieldCheck,
            };

            const rendered: JSX.Element[] = [];
            let financeInserted = false;
            let accountingInserted = false;

            for (const group of allGroupsSorted) {
              if (!financeInserted && group.order > 5 && financeSubGroups.length > 0) {
                financeInserted = true;
                rendered.push(renderFinanceSection());
              }
              if (financeInserted && !accountingInserted && accountingSubGroups.length > 0) {
                accountingInserted = true;
                rendered.push(renderAccountingSection());
              }

              const isCollapsed = collapsedGroups.has(group.id);
              const hasActiveItem = group.items.some(item => isNavPathActive(pathname, search, item.url));

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
                        {GROUP_ICONS[group.id] && (() => { const Icon = GROUP_ICONS[group.id]; return <Icon className="h-3.5 w-3.5 shrink-0" />; })()}
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
            if (!accountingInserted && accountingSubGroups.length > 0) {
              rendered.push(renderAccountingSection('-end'));
            }

            return rendered;
          })()}
        </SidebarContent>

        <SidebarFooter className="border-t border-slate-200/70 px-3 py-3">
          {/* View As picker — Super Admins only; always uses real SA status */}
          {realIsSuperAdmin && (
            <div className="mb-2 group-data-[collapsible=icon]:hidden">
              {viewAs ? (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-2.5 py-1.5 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
                    <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-300 truncate flex-1">
                      Viewing as <strong>{viewAs.displayName}</strong>
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={openViewAsDialog}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded bg-amber-200/60 dark:bg-amber-800/40 text-amber-900 dark:text-amber-200 text-[10px] font-semibold hover:bg-amber-200 dark:hover:bg-amber-700/60 transition-colors"
                      data-testid="button-change-view-as-sidebar"
                    >
                      <ArrowLeftRight className="h-2.5 w-2.5" />
                      Change
                    </button>
                    <button
                      onClick={clearViewAs}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 text-[10px] font-medium hover:bg-amber-200 dark:hover:bg-amber-800/40 transition-colors"
                      data-testid="button-exit-view-as-sidebar"
                    >
                      <XIcon className="h-2.5 w-2.5" />
                      Exit
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={openViewAsDialog}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-gray-600 text-slate-500 dark:text-gray-400 text-xs font-medium hover:border-primary hover:text-primary transition-colors"
                  data-testid="button-open-view-as"
                >
                  <Eye className="h-3.5 w-3.5 shrink-0" />
                  <span>Preview as Role / User</span>
                </button>
              )}
            </div>
          )}
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
                      <AvatarImage src={currentUser.avatar} alt={currentUser.fullName || currentUser.name} />
                      <AvatarFallback className="bg-blue-600 text-white text-[10px]">
                        {getInitials(currentUser.fullName || currentUser.name)}
                      </AvatarFallback>
                    </Avatar>
                    <RealtimeStatusDot className="absolute -bottom-0.5 -right-0.5" />
                  </div>
                  <div className="flex flex-col items-start text-left leading-tight group-data-[collapsible=icon]:hidden min-w-0 flex-1">
                    <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate w-full">{currentUser.fullName || currentUser.name}</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate w-full">{getPrimaryRole()}</span>
                  </div>
                  <ChevronUp className="ml-auto h-3.5 w-3.5 text-muted-foreground group-data-[collapsible=icon]:hidden shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{currentUser.fullName || currentUser.name}</p>
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
        <div className="fixed left-4 top-4 z-50">
          <SidebarTrigger className="h-10 w-10 rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-gray-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-gray-500 dark:hover:bg-slate-800" />
        </div>
      )}

      {/* ── View As Picker Dialog ─────────────────────────────────────────── */}
      {realIsSuperAdmin && (() => {
        const VIEW_AS_ROLE_GROUPS = [
          {
            label: 'Field Operations',
            color: 'text-blue-700 dark:text-blue-400',
            roles: [
              { value: 'dataCollector',  label: 'Data Collector',     desc: 'Fills forms, collects field data' },
              { value: 'coordinator',    label: 'Coordinator',         desc: 'Manages site visits & reports' },
              { value: 'supervisor',     label: 'Supervisor',          desc: 'Oversees coordinators & hubs' },
              { value: 'fom',            label: 'Field Ops Manager',   desc: 'Leads field operations' },
            ],
          },
          {
            label: 'Management',
            color: 'text-violet-700 dark:text-violet-400',
            roles: [
              { value: 'countryDirector', label: 'Country Director',  desc: 'Country-level oversight' },
              { value: 'projectManager',  label: 'Project Manager',   desc: 'Manages project lifecycle' },
              { value: 'admin',           label: 'Admin',             desc: 'System administration' },
            ],
          },
          {
            label: 'Finance',
            color: 'text-emerald-700 dark:text-emerald-400',
            roles: [
              { value: 'financialAdmin', label: 'Financial Admin',    desc: 'Finance operations & approvals' },
              { value: 'auditor',        label: 'Financial Auditor',  desc: 'Audit & compliance view' },
            ],
          },
          {
            label: 'Technical & Staff',
            color: 'text-teal-700 dark:text-teal-400',
            roles: [
              { value: 'dataTeam',  label: 'Data Team',  desc: 'Analytics & data management' },
              { value: 'ict',       label: 'ICT',         desc: 'Technical support & integrations' },
              { value: 'employee',  label: 'Employee',    desc: 'Basic staff access' },
            ],
          },
        ];

        const ROLE_BADGE_COLOR: Record<string, string> = {
          datacollector: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
          coordinator:   'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
          supervisor:    'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
          fom:           'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
          countrydirector: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
          projectmanager:  'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
          admin:           'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
          financialadmin:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
          auditor:         'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
          datateam:        'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
          ict:             'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
          employee:        'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
        };
        const roleBadgeClass = (role: string) =>
          ROLE_BADGE_COLOR[role.toLowerCase().replace(/[\s_-]/g, '')] ?? 'bg-slate-100 text-slate-600';

        const filteredUsers = viewAsUsers.filter(u =>
          !viewAsUserSearch.trim() ||
          u.full_name?.toLowerCase().includes(viewAsUserSearch.toLowerCase()) ||
          u.email?.toLowerCase().includes(viewAsUserSearch.toLowerCase())
        );

        return (
          <Dialog open={viewAsOpen} onOpenChange={o => { if (!o) setViewAsOpen(false); }}>
            <DialogContent className="max-w-lg p-0 overflow-hidden">
              <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Eye className="h-4 w-4 text-primary" />
                  Preview as Role or User
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  The sidebar and page controls reflect the selected role. Your session and data access are unchanged.
                </p>
              </DialogHeader>

              {/* Tab switcher */}
              <div className="flex border-b border-border">
                {(['role', 'user'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setViewAsTab(tab)}
                    className={cn(
                      'flex-1 py-2.5 text-xs font-semibold capitalize transition-colors',
                      viewAsTab === tab
                        ? 'border-b-2 border-primary text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    data-testid={`tab-view-as-${tab}`}
                  >
                    By {tab === 'role' ? 'Role' : 'Specific User'}
                  </button>
                ))}
              </div>

              <div className="px-5 py-4 space-y-4 max-h-[420px] overflow-y-auto">
                {viewAsTab === 'role' ? (
                  VIEW_AS_ROLE_GROUPS.map(group => (
                    <div key={group.label}>
                      <p className={cn('text-[10px] font-bold uppercase tracking-wider mb-2', group.color)}>{group.label}</p>
                      <div className="space-y-1">
                        {group.roles.map(r => (
                          <button
                            key={r.value}
                            onClick={() => setViewAsRoleSelected(r.value)}
                            className={cn(
                              'w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-all',
                              viewAsRoleSelected === r.value
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/40 hover:bg-muted/40'
                            )}
                            data-testid={`btn-role-${r.value}`}
                          >
                            <div className={cn('shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold', roleBadgeClass(r.value))}>
                              {r.label.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={cn('text-xs font-semibold', viewAsRoleSelected === r.value ? 'text-primary' : 'text-foreground')}>
                                {r.label}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate">{r.desc}</p>
                            </div>
                            {viewAsRoleSelected === r.value && <CheckCircle className="h-3.5 w-3.5 shrink-0 text-primary" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <>
                    <div>
                      <Label className="text-xs text-muted-foreground">Search staff member</Label>
                      <Input
                        placeholder="Name or email…"
                        value={viewAsUserSearch}
                        onChange={e => setViewAsUserSearch(e.target.value)}
                        className="h-8 text-xs mt-1.5"
                        data-testid="input-view-as-user-search"
                      />
                    </div>
                    <div className="border border-border rounded-lg overflow-hidden">
                      {viewAsUsersLoading ? (
                        <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                          <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs">Loading staff…</span>
                        </div>
                      ) : filteredUsers.length === 0 ? (
                        <p className="text-center text-xs text-muted-foreground py-6">
                          {viewAsUsers.length === 0 ? 'No staff loaded' : 'No matching staff'}
                        </p>
                      ) : (
                        <div className="divide-y divide-border max-h-60 overflow-y-auto">
                          {filteredUsers.map(u => (
                            <button
                              key={u.id}
                              onClick={() => setViewAsUserSelected({ id: u.id, full_name: u.full_name, role: u.role })}
                              className={cn(
                                'w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs hover:bg-muted/50 transition-colors',
                                viewAsUserSelected?.id === u.id && 'bg-primary/5'
                              )}
                              data-testid={`btn-user-${u.id}`}
                            >
                              <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px] shrink-0">
                                {u.full_name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={cn('truncate font-semibold text-xs', viewAsUserSelected?.id === u.id ? 'text-primary' : '')}>
                                  {u.full_name || u.email}
                                </p>
                                <span className={cn('inline-block text-[9px] font-semibold px-1.5 py-0 rounded mt-0.5', roleBadgeClass(u.role))}>
                                  {u.role}
                                </span>
                              </div>
                              {viewAsUserSelected?.id === u.id && <CheckCircle className="h-3.5 w-3.5 shrink-0 text-primary" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {filteredUsers.length > 0 && (
                      <p className="text-[10px] text-muted-foreground text-right">
                        {filteredUsers.length} of {viewAsUsers.length} staff shown
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 px-5 pb-5 pt-2 border-t border-border">
                {viewAs && (
                  <button
                    onClick={() => { clearViewAs(); setViewAsOpen(false); }}
                    className="text-[11px] text-rose-600 hover:text-rose-700 font-medium"
                  >
                    Exit current preview
                  </button>
                )}
                <div className={cn('flex items-center gap-2', viewAs ? '' : 'ml-auto')}>
                  <Button variant="outline" size="sm" onClick={() => setViewAsOpen(false)} data-testid="button-cancel-view-as">
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={viewAsTab === 'role' ? !viewAsRoleSelected : !viewAsUserSelected}
                    onClick={() => {
                      if (viewAsTab === 'role' && viewAsRoleSelected) {
                        const label = {
                          dataCollector: 'Data Collector', coordinator: 'Coordinator', supervisor: 'Supervisor',
                          fom: 'Field Ops Manager', countryDirector: 'Country Director', dataTeam: 'Data Team',
                          financialAdmin: 'Financial Admin', auditor: 'Financial Auditor',
                          projectManager: 'Project Manager', admin: 'Admin', ict: 'ICT', employee: 'Employee',
                        }[viewAsRoleSelected] ?? viewAsRoleSelected;
                        setViewAs({ mode: 'role', role: viewAsRoleSelected, displayName: label });
                      } else if (viewAsTab === 'user' && viewAsUserSelected) {
                        setViewAs({ mode: 'user', role: viewAsUserSelected.role, userId: viewAsUserSelected.id, displayName: viewAsUserSelected.full_name });
                      }
                      setViewAsOpen(false);
                      setViewAsRoleSelected('');
                      setViewAsUserSelected(null);
                      setViewAsUserSearch('');
                    }}
                    data-testid="button-confirm-view-as"
                  >
                    Start Preview
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
      </>
    );
  };

  export default AppSidebar;
