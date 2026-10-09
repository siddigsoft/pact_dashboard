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
    LogOut,
    LayoutDashboard,
    ChevronUp,
    Shield,
    ShieldCheck,
    Network,
    Calendar,
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
    Map as MapIcon,
    ScrollText,
    Mail,
    Smartphone,
    HelpCircle,
    AlertTriangle,
    HeartPulse,
    RotateCcw,
    CheckSquare,
    Handshake,
    FolderOpen,
    Compass,
    Inbox,
    Sparkles,
    Wallet,
    ArrowLeftRight,
    Settings2,
    Layers,
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
    SidebarSeparator,
    SidebarTrigger,
    useSidebar
  } from "@/components/ui/sidebar";
  import { AppRole } from "@/types";
  import { useAuthorization } from "@/hooks/use-authorization";
  import { canSeePage, canSeePath, resolveRoutePermission, resolveSlug } from "@/lib/page-roles";
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
  import { PAGE_DEFS, getPageDefinition, getPageNavigationGroup } from "@/lib/access-registry";
  import { MenuPreferences, DEFAULT_MENU_PREFERENCES } from "@/types/user-preferences";
  import { normalizeRole } from "@/utils/roleMapping";
  import { getMmpDisplayLabel } from "@/lib/mmp-display";
  import { useViewAs } from "@/context/ViewAsContext";
  import { useCurrentUserAccessManifest } from "@/hooks/useCurrentUserAccessManifest";
  import { evaluateManifestPageAccess, manifestHasPermission, getManifestNavigationPages, isHubTabNavigationPath } from "@/lib/current-user-access";
  import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
  import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
  import { CSS } from '@dnd-kit/utilities';
  import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
  import { toast } from "@/hooks/use-toast";
  import { cn } from "@/lib/utils";

  /** All top-level sections start collapsed; the active route section auto-expands. */
  const DENSE_COLLAPSED_BY_DEFAULT = new Set([
    'workspace-parent', 'programme-parent', 'incentives-parent', 'comms-parent',
    'fieldops-parent', 'coordination-parent', 'finance-parent', 'accounting-parent',
    'hr-parent', 'crm-parent', 'surveys-parent', 'analytics-parent', 'admin-parent',
    'help-parent', 'superadmin-parent',
    'super-admin', 'finance-reports', 'finance-management', 'admin', 'hr-people',
    'analytics',
  ]);

  const SIDEBAR_COLLAPSE_STORAGE_KEY = 'pact-sidebar-collapsed-v2';

  const SIDEBAR_GROUP_SHELL = "py-0.5 px-1.5";
  const SIDEBAR_GROUP_LABEL =
    "min-h-7 h-auto py-1.5 px-2 text-[11px] leading-none tracking-wide font-semibold uppercase cursor-pointer flex items-center gap-2 rounded-md transition-colors duration-150";
  const SIDEBAR_SECTION_LABEL =
    "text-foreground/65 hover:text-foreground hover:bg-muted/70";
  const SIDEBAR_NAV_ITEM =
    "min-h-8 h-auto py-1.5 rounded-md text-[13px] font-medium leading-snug transition-colors duration-150";
  const SIDEBAR_ICON_MUTED = "text-foreground/50";
  const SIDEBAR_ICON_ACTIVE = "text-primary";

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
    Map: MapIcon,
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
            isActive
              ? "bg-primary/10 text-primary font-semibold"
              : "text-foreground/85 hover:bg-muted/80",
          )}
        >
          <Link to={item.url} className="flex items-center gap-2.5 pl-4" data-testid={`nav-favorite-${item.id}`}>
            <item.icon
              className={cn(
                "h-4 w-4 shrink-0",
                isActive ? "text-primary" : "text-amber-600 dark:text-amber-400",
              )}
            />
            <span className="flex-1 min-w-0 truncate">{item.title}</span>
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
    const isFinance = hasRole('finance');
    const isAccountant = hasRole('accountant');
    const isAuditor = hasRole('auditor');
    const isDataCollector = hasRole('dataCollector');
    const isCoordinator = hasRole('coordinator');
    const isFOM = hasRole('fom');
    const isSupervisor = hasRole('supervisor');
    const isDataTeam = hasRole('dataTeam');
    const isProjectManager = hasRole('projectManager');
    const isCountryDirector = hasRole('countryDirector');
    const isSeniorManagement = hasRole('seniorManagement');
    const isEmployee = hasRole('employee');
    const isSMT =
      /^(smt)$/i.test(defaultRole.trim()) ||
      roles.some(r => /^(smt)$/i.test(String(r)));

    const isHidden = (url: string) => menuPrefs.hiddenItems.includes(url);
    const isPinned = (url: string) => menuPrefs.pinnedItems.includes(url);

    // SMT: hard allowlist — project pages only (no other hubs)
    if (isSMT) {
      const groups: MenuGroup[] = [];
      const personal: MenuGroup['items'] = [];
      if (!isHidden('/dashboard'))
        personal.push({ id: 'dashboard', title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard, priority: 1, isPinned: isPinned('/dashboard') });
      if (!isHidden('/my-tasks'))
        personal.push({ id: 'my-tasks', title: 'My Tasks', url: '/my-tasks', icon: CheckSquare, priority: 2, isPinned: isPinned('/my-tasks') });
      if (!isHidden('/my-projects'))
        personal.push({ id: 'my-projects', title: 'My Projects', url: '/my-projects', icon: FolderKanban, priority: 3, isPinned: isPinned('/my-projects') });
      if (personal.length)
        groups.push({ id: 'workspace-personal', label: 'Personal', order: 1.1, items: personal, parentGroup: 'workspace' } as any);

      const tools: MenuGroup['items'] = [];
      if (!isHidden('/calendar'))
        tools.push({ id: 'calendar', title: 'Calendar', url: '/calendar', icon: Calendar, priority: 1, isPinned: isPinned('/calendar') });
      if (!isHidden('/notifications'))
        tools.push({ id: 'notifications', title: 'Notifications', url: '/notifications', icon: Bell, priority: 2, isPinned: isPinned('/notifications') });
      if (tools.length)
        groups.push({ id: 'workspace-tools', label: 'Tools', order: 1.3, items: tools, parentGroup: 'workspace' } as any);

      const programme: MenuGroup['items'] = [];
      if (!isHidden('/programme-hub'))
        programme.push({ id: 'programme-hub', title: 'Programme Hub', url: '/programme-hub', icon: FolderKanban, priority: 1, isPinned: isPinned('/programme-hub') });
      if (!isHidden('/projects'))
        programme.push({ id: 'projects', title: 'Projects', url: '/projects', icon: FolderOpen, priority: 2, isPinned: isPinned('/projects') });
      if (programme.length)
        groups.push({ id: 'programme-planning', label: 'Planning', order: 2.1, items: programme, parentGroup: 'programme' } as any);

      return groups;
    }

    const groups: MenuGroup[] = [];

    // â”€â”€ 1. My Workspace â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const workspaceItems: MenuGroup['items'] = [];
    if (!isHidden('/dashboard') && (isSuperAdmin || isAdmin || isICT || isEmployee || isSeniorManagement || perms.dashboard)) {
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
    const wsPersonal = workspaceItems.filter(i => ['dashboard','my-tasks','my-projects'].includes(i.id));
    const wsTeam     = workspaceItems.filter(i => ['team-tasks','my-team'].includes(i.id));
    const wsTools    = workspaceItems.filter(i => ['calendar','notifications','workspace-hub'].includes(i.id));
    if (wsPersonal.length) groups.push({ id: 'workspace-personal', label: 'Personal',  order: 1.1, items: wsPersonal, parentGroup: 'workspace' } as any);
    if (wsTeam.length)     groups.push({ id: 'workspace-team',     label: 'Team',       order: 1.2, items: wsTeam,     parentGroup: 'workspace' } as any);
    if (wsTools.length)    groups.push({ id: 'workspace-tools',    label: 'Tools',      order: 1.3, items: wsTools,    parentGroup: 'workspace' } as any);

    // â”€â”€ 2. Communication â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const communicationItems: MenuGroup['items'] = [];
    if (!isHidden('/communication-hub')) {
      communicationItems.push({ id: 'communication-hub', title: "Communication", url: "/communication-hub", icon: MessageSquare, priority: 1, isPinned: isPinned('/communication-hub') });
    }
    if (communicationItems.length) groups.push({ id: 'comms-channels', label: 'Channels', order: 3.1, items: communicationItems, parentGroup: 'comms' } as any);

    // â”€â”€ 2. Programme Management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const planningItems: MenuGroup['items'] = [];
    const canSeeProgrammeHub = isSuperAdmin || isAdmin || isICT || isFOM || isProjectManager || isCountryDirector || isSeniorManagement || isDataTeam || perms.projects;
    if (canSeeProgrammeHub && !isHidden('/programme-hub')) {
      planningItems.push({ id: 'programme-hub', title: "Programme Hub", url: "/programme-hub", icon: FolderKanban, priority: 1, isPinned: isPinned('/programme-hub') });
    }
    if (!isHidden('/mmp') && (isSuperAdmin || isAdmin || isICT || perms.mmp || isCoordinator || isSupervisor || isDataCollector || isFOM || isCountryDirector || isProjectManager || isSeniorManagement)) {
      const mmpTitle = getMmpDisplayLabel(defaultRole, roles, isSuperAdmin);
      planningItems.push({ id: 'mmp-management', title: mmpTitle, url: "/mmp", icon: Database, priority: 2, isPinned: isPinned('/mmp') });
    }
    const canSeeFieldDataHub = isSuperAdmin || isAdmin || isICT || isFOM || isDataTeam || isProjectManager || isCountryDirector || isSeniorManagement;
    if (canSeeFieldDataHub && !isHidden('/field-data')) {
      planningItems.push({ id: 'field-data-hub', title: "Field Data Hub", url: "/field-data", icon: Layers, priority: 3, isPinned: isPinned('/field-data') });
    }
    if (planningItems.length) groups.push({ id: 'programme-planning', label: 'Planning', order: 2.1, items: planningItems, parentGroup: 'programme' } as any);

    // ── Incentive Bonuses section ────────────────────────────────────────────
    // Temporary restriction: the complete Bonuses area is Super Admin only.
    const canSeeIncentives = isSuperAdmin;
    const incentiveItems: MenuGroup['items'] = [];
    if (canSeeIncentives && !isHidden('/incentives')) {
      incentiveItems.push({ id: 'incentive-overview', title: 'Incentive Overview', url: '/incentives', icon: Award, priority: 1, isPinned: isPinned('/incentives') });
    }
    if (isSuperAdmin && !isHidden('/mmp/incentive-settings')) {
      incentiveItems.push({ id: 'incentive-settings', title: 'Incentive Settings', url: '/mmp/incentive-settings', icon: Settings2 as any, priority: 2, isPinned: isPinned('/mmp/incentive-settings') });
    }
    if (incentiveItems.length) groups.push({ id: 'incentives-main', label: 'Bonuses', order: 2.15, items: incentiveItems, parentGroup: 'incentives' } as any);

    // â”€â”€ 4. Field Operations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // ── Field Ops Hub (replaces 9 flat items) ─────────────────────────────────
    const fieldOpsItems: MenuGroup['items'] = [];
    const canSeeFieldOps = isSuperAdmin || isAdmin || isICT || isFOM || isCoordinator || isSupervisor || isDataCollector || isDataTeam || perms.siteVisits || perms.fieldTeam;
    if (canSeeFieldOps && !isHidden('/field-ops')) {
      fieldOpsItems.push({ id: 'field-ops-hub', title: "Field Ops Hub", url: "/field-ops", icon: Compass, priority: 1, isPinned: isPinned('/field-ops') });
    }
    if (fieldOpsItems.length) groups.push({ id: 'fieldops-ops', label: 'Operations', order: 4.1, items: fieldOpsItems, parentGroup: 'fieldops' } as any);

    // â”€â”€ 5. Coordination & Oversight â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const coordinationItems: MenuGroup['items'] = [];
    if (!isHidden('/supervisor/sites') && isSupervisor && !isCoordinator) {
      coordinationItems.push({ id: 'supervisor-site-management', title: "My Site Management", url: "/supervisor/sites", icon: MapIcon, priority: 1, isPinned: isPinned('/supervisor/sites') });
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
    const coordSiteItems  = coordinationItems.filter(i => ['supervisor-site-management','site-verification','sites-for-verification','mmp-cycle-close'].includes(i.id));
    const coordAdminItems = coordinationItems.filter(i => ['staff-directory'].includes(i.id));
    if (coordSiteItems.length)  groups.push({ id: 'coord-sites', label: 'Site Management', order: 4.51, items: coordSiteItems,  parentGroup: 'coordination' } as any);
    if (coordAdminItems.length) groups.push({ id: 'coord-admin', label: 'Administration',  order: 4.52, items: coordAdminItems, parentGroup: 'coordination' } as any);

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
    // Prefer Approvals Hub as the single door; keep standalone trackers that are not hub tabs.
    const canSeeApprovalsHub = isSuperAdmin || isAdmin || isFinancialAdmin || isSupervisor || isFOM || isCountryDirector || isSeniorManagement;
    if (!isHidden('/approvals') && canSeeApprovalsHub) {
      approvalItems.push({ id: 'approvals-hub', title: "Approvals Hub", url: "/approvals", icon: Inbox, priority: 0, isPinned: isPinned('/approvals') });
    } else {
      if (!isHidden('/supervisor-approvals') && canSeePath('/supervisor-approvals', defaultRole)) {
        approvalItems.push({ id: 'supervisor-approvals', title: "Tier 1 Approvals", url: "/supervisor-approvals", icon: ClipboardCheck, priority: 1, isPinned: isPinned('/supervisor-approvals') });
      }
      if (!isHidden('/withdrawal-approval') && canSeePath('/withdrawal-approval', defaultRole)) {
        approvalItems.push({ id: 'withdrawal-approval', title: "Tier 2 Approvals", url: "/withdrawal-approval", icon: ClipboardCheck, priority: 2, isPinned: isPinned('/withdrawal-approval') });
      }
      if (!isHidden('/finance-approval') && canSeePath('/finance-approval', defaultRole)) {
        approvalItems.push({ id: 'finance-approval', title: "Finance Processing", url: "/finance-approval", icon: Banknote, priority: 4, isPinned: isPinned('/finance-approval') });
      }
    }
    if (!isHidden('/down-payment-approval') && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor || isSupervisor || isCountryDirector || isSeniorManagement)) {
      approvalItems.push({ id: 'down-payment-approval', title: "Down-Payment Tracker", url: "/down-payment-approval", icon: DollarSign, priority: 3, isPinned: isPinned('/down-payment-approval') });
    }
    if (!isHidden('/field-payments') && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor)) {
      approvalItems.push({ id: 'field-payments', title: "Field Payments Centre", url: "/field-payments", icon: Receipt, priority: 3.5, isPinned: isPinned('/field-payments') });
    }
    if (approvalItems.length) groups.push({ id: 'finance-approvals', label: "Approvals", order: 5.2, items: approvalItems, parentGroup: 'finance' } as any);

    // ── Finance Hub — single door; tabs live inside the hub ──────────────────
    const finHubAccess = isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor || isSupervisor || isFOM || isCountryDirector || isSeniorManagement;
    if (finHubAccess && !isHidden('/finance-hub')) {
      groups.push({
        id: 'finance-hub-group',
        label: 'Finance Hub',
        order: 5.3,
        items: [{ id: 'finance-hub-home', title: 'Finance Hub', url: '/finance-hub', icon: LayoutDashboard, priority: 1, isPinned: isPinned('/finance-hub') }],
        parentGroup: 'finance',
      } as any);
    }

    // ── Pre-Funding — single door; tabs live inside the hub ──────────────────
    const canSeePreFunding =
      isSuperAdmin || isAdmin || isFinancialAdmin || isCountryDirector ||
      isCoordinator || isSupervisor || isFOM || isFundHolder || isAuditor;
    if (canSeePreFunding && !isHidden('/pre-funding')) {
      groups.push({
        id: 'finance-prefunding',
        label: 'Pre-Funding',
        order: 5.45,
        items: [{ id: 'pre-funding', title: 'Pre-Funding', url: '/pre-funding', icon: Banknote, priority: 1, isPinned: isPinned('/pre-funding') }],
        parentGroup: 'finance',
      } as any);
    }

    // ── Accounting — single door; tabs live inside the hub ───────────────────
    const acctAccess = isSuperAdmin || isAdmin || isFinance || isFinancialAdmin || isAccountant || isAuditor;
    if (acctAccess && !isHidden('/accounting')) {
      groups.push({
        id: 'finance-accounting',
        label: 'Accounting',
        order: 5.50,
        items: [{ id: 'accounting-hub', title: 'Accounting', url: '/accounting', icon: BookOpen, priority: 1, isPinned: isPinned('/accounting') }],
        parentGroup: 'accounting',
      } as any);
    }

    // ── HR & People — Employees (standalone) + HR Hub (tabs inside hub) ──────
    const hrItems: MenuGroup['items'] = [];
    const hrStrictAccess = isSuperAdmin || isAdmin;
    if (!isHidden('/employees') && hrStrictAccess) {
      hrItems.push({ id: 'employees', title: "Employees", url: "/employees", icon: Users, priority: 1, isPinned: isPinned('/employees') });
    }
    // One HR entry for anyone who can open /hr (self-service tabs live in the hub)
    if (!isHidden('/hr')) {
      hrItems.push({ id: 'hr-hub', title: "HR Hub", url: "/hr", icon: Briefcase, priority: 2, isPinned: isPinned('/hr') });
    }
    if (hrItems.length) groups.push({ id: 'hr-admin', label: 'People', order: 5.61, items: hrItems, parentGroup: 'hr' } as any);

    // â”€â”€ 8. CRM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const crmItems: MenuGroup['items'] = [];
    const hasCrmAccess = isSuperAdmin || isAdmin || isFOM || isProjectManager || isCountryDirector || isSeniorManagement;
    if (hasCrmAccess && !isHidden('/crm')) {
      crmItems.push({ id: 'crm-hub', title: 'CRM', url: '/crm', icon: Handshake, priority: 1, isPinned: isPinned('/crm') });
    }
    if (crmItems.length) groups.push({ id: 'crm-hub-group', label: 'Hub', order: 5.81, items: crmItems, parentGroup: 'crm' } as any);

    // â”€â”€ Surveys â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (!isHidden('/surveys')) {
      const surveyItems: MenuGroup['items'] = [
        { id: 'surveys', title: 'Surveys', url: '/surveys', icon: ClipboardList, priority: 1, isPinned: isPinned('/surveys') },
      ];
      if (isSuperAdmin || isAdmin)
        surveyItems.push({ id: 'data-quality', title: 'Data Quality Control', url: '/data-quality', icon: ShieldCheck, priority: 2, isPinned: isPinned('/data-quality') });
      groups.push({ id: 'surveys-hub-group', label: 'Data Collection', order: 5.91, items: surveyItems, parentGroup: 'surveys' } as any);
    }

    // â”€â”€ 9. Analytics & Reports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // ── Analytics Hub (replaces 8 flat items) ─────────────────────────────────
    const analyticsItems: MenuGroup['items'] = [];
    const canSeeAnalytics = isSuperAdmin || isAdmin || isICT || isFinancialAdmin || isAuditor || isDataTeam || isFOM || isCountryDirector || isSeniorManagement || perms.reports || perms.dataVisibility || perms.archive;
    if (canSeeAnalytics && !isHidden('/analytics')) {
      analyticsItems.push({ id: 'analytics-hub', title: "Analytics Hub", url: "/analytics", icon: BarChart3, priority: 1, isPinned: isPinned('/analytics') });
    }
    if (analyticsItems.length) groups.push({ id: 'analytics-hub-group', label: 'Analytics', order: 6.1, items: analyticsItems, parentGroup: 'analytics' } as any);

    // â”€â”€ 10. Administration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // ── Admin Hub (replaces 12 flat items) ────────────────────────────────────
    const adminItems: MenuGroup['items'] = [];
    const canSeeAdmin = isSuperAdmin || isAdmin || isICT || canSeePath('/users', defaultRole) || canSeePath('/departments', defaultRole) || canSeePath('/role-management', defaultRole) || canSeePath('/classifications', defaultRole) || canSeePath('/task-admin', defaultRole) || perms.users || perms.roleManagement || perms.settings || hasMonitoringAccess;
    if (canSeeAdmin && !isHidden('/admin-hub')) {
      adminItems.push({ id: 'admin-hub', title: "Admin Hub", url: "/admin-hub", icon: LayoutDashboard, priority: 1, isPinned: isPinned('/admin-hub') });
    }
    if (adminItems.length) groups.push({ id: 'admin-hub-group', label: 'Hub', order: 7.1, items: adminItems, parentGroup: 'admin' } as any);

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
    const helpDocItems     = helpItems.filter(i => ['changelog','documentation','mobile-documentation'].includes(i.id));
    const helpSupportItems = helpItems.filter(i => ['helpline','mobile-support-tickets'].includes(i.id));
    if (helpDocItems.length)     groups.push({ id: 'help-docs',    label: 'Documentation', order: 8.1, items: helpDocItems,     parentGroup: 'help' } as any);
    if (helpSupportItems.length) groups.push({ id: 'help-support', label: 'Support',       order: 8.2, items: helpSupportItems, parentGroup: 'help' } as any);

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
      if (superAdminItems.length) groups.push({ id: 'superadmin-hub-group', label: 'System', order: 9.1, items: superAdminItems, parentGroup: 'superadmin' } as any);
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

    const effectiveAccessUserId = viewAs?.mode === 'user' ? viewAs.userId : (viewAs ? undefined : currentUser?.id);
    // For the signed-in user, access inputs arrive from one server-derived
    // endpoint. View As intentionally retains the admin-only fallback queries:
    // a preview must never pretend to be another user's authenticated session.
    const { data: currentAccessManifest } = useCurrentUserAccessManifest(
      !!currentUser?.id && !viewAs && !isSuperAdmin,
    );

    // Fetch this user's page_access_overrides so that manually granted pages
    // appear in the sidebar even when the role-based check would deny them.
    const { data: myPageOverrides = [] } = useQuery({
      queryKey: ['sidebar-page-overrides', effectiveAccessUserId],
      queryFn: async () => {
        if (!effectiveAccessUserId) return [];
        const { data } = await supabase
          .from('page_access_overrides')
          .select('page_slug, is_blocked')
          .eq('user_id', effectiveAccessUserId);
        return (data ?? []) as { page_slug: string; is_blocked: boolean }[];
      },
      enabled: !!effectiveAccessUserId && !isSuperAdmin && !!viewAs,
      staleTime: 30_000,
    });

    const { data: queriedRoleConfigs = {} } = useQuery<Record<string, string[]>>({
      queryKey: ['sidebar-page-role-configs'],
      queryFn: async () => {
        const { data, error } = await supabase.from('page_role_configs').select('page_slug, roles');
        if (error) throw error;
        return Object.fromEntries((data ?? []).map((row: any) => [row.page_slug, row.roles ?? []]));
      },
      enabled: !!viewAs,
      staleTime: 30_000,
    });

    const sidebarRoleConfigs = currentAccessManifest?.page_role_configs ?? queriedRoleConfigs;

    // slug â†’ is_blocked  (false = granted, true = blocked)
    const pageOverrideMap = useMemo(() => {
      const m: Record<string, boolean> = {};
      if (currentAccessManifest) {
        Object.entries(currentAccessManifest.page_overrides).forEach(([slug, override]) => {
          m[slug] = override.is_blocked;
        });
      } else {
        myPageOverrides.forEach(o => { m[o.page_slug] = o.is_blocked; });
      }
      return m;
    }, [currentAccessManifest, myPageOverrides]);
    
    const { checkPermission, hasAnyRole, canManageRoles } = useAuthorization();
    // The signed-in user's navigation decisions use only the server-derived
    // manifest. View As is deliberately separate: it previews a role/user and
    // is not an authenticated session for that target.
    const sidebarRoles = viewAs ? [viewAs.role] : (currentAccessManifest?.roles ?? []);
    const sidebarHasAnyRole = (candidateRoles: string[]) => viewAs
      ? hasAnyRole(candidateRoles)
      : sidebarRoles.some(role => candidateRoles.some(candidate =>
          normalizeRole(role) === normalizeRole(candidate),
        ));
    const sidebarHasPermission = (resource: string, action: string) => currentAccessManifest
      ? manifestHasPermission(currentAccessManifest, resource, action)
      : checkPermission(resource as any, action as any);
    const isAdmin = sidebarHasAnyRole(['admin']);
    const isDataCollector = sidebarHasAnyRole(['datacollector', 'data_collector', 'data collector']);

    // Pre-compute stable role booleans so they can be used as useEffect deps
    // (the hasAnyRole function reference changes every render â€” never put it in deps)
    const roleIsCoordinator = sidebarHasAnyRole(['coordinator', 'Coordinator']);
    const roleIsSupervisor   = sidebarHasAnyRole(['supervisor', 'Supervisor', 'hubSupervisor', 'hub_supervisor']);
    const roleIsFomOrAdmin   = isSuperAdmin || sidebarHasAnyRole(['fom', 'FOM', 'admin', 'Admin']);
    const roleIsFinance      = isSuperAdmin || sidebarHasAnyRole(['fom', 'FOM', 'admin', 'Admin', 'financial_auditor', 'financialAdmin', 'financialadmin']);
    const roleCanSeeIncident = isSuperAdmin || sidebarHasAnyRole(['admin', 'Admin', 'fom', 'FOM', 'supervisor', 'Supervisor', 'hubSupervisor', 'hub_supervisor']);

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
      : sidebarHasAnyRole(FINANCE_ADMIN_ROLES);
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
        const stored = localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY);
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
    const { data: unresolvedGlBridgeErrors = [] } = useQuery({
      queryKey: ['sidebar-unresolved-gl-bridge-errors'],
      queryFn: async () => {
        const { data, error } = await (supabase as any).rpc('get_unresolved_gl_bridge_errors', { p_limit: 100 });
        if (error) {
          console.warn('[Sidebar] unresolved GL bridge error count:', error.message);
          return [];
        }
        return Array.isArray(data) ? data : [];
      },
      enabled: !!currentUser?.id && (isSuperAdmin || roleIsFinance),
      staleTime: 60_000,
      refetchInterval: 60_000,
    });
    const unresolvedGlBridgeErrorCount = unresolvedGlBridgeErrors.length;
    const pendingReclaimCount = counts.pendingReclaimCount;
    const pendingCostApprovalCount = counts.pendingCostTier1Hub;
    const pendingDownPaymentCount = counts.pendingDpSupervisor;
    const pendingMmpCount = roleIsCoordinator
      ? counts.pendingMmpCoordinator
      : counts.pendingMmpUnassigned;
    const pendingTier2CostCount = counts.pendingTier2Cost;
    const pendingFinanceCount = counts.pendingFinanceDp;
    const unreadNotifCount = counts.unreadNotifications;
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
    const isStrictAdmin = isSuperAdmin || sidebarHasAnyRole(['admin', 'Admin']);
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
      projects: sidebarHasPermission('projects', 'read') || isAdmin || sidebarHasAnyRole(['ict']),
      mmp: sidebarHasPermission('mmp', 'read') || isAdmin || sidebarHasAnyRole(['ict']),
      monitoringPlan: sidebarHasPermission('mmp', 'read') || isAdmin || sidebarHasAnyRole(['ict']),
      siteVisits: sidebarHasPermission('site_visits', 'read') || isAdmin || sidebarHasAnyRole(['ict']),
      archive: sidebarHasPermission('reports', 'read') || isAdmin,
      fieldTeam: sidebarHasPermission('users', 'read') || isAdmin,
      fieldOpManager: sidebarHasPermission('site_visits', 'update') || isAdmin || sidebarHasAnyRole(['fom']),
      dataVisibility: sidebarHasPermission('reports', 'read') || isAdmin,
      reports: sidebarHasPermission('reports', 'read') || isAdmin,
      users: sidebarHasPermission('users', 'read') || isAdmin || sidebarHasAnyRole(['ict']),
      roleManagement: (currentAccessManifest
        ? ['create', 'update', 'delete'].some(action => sidebarHasPermission('roles', action))
        : canManageRoles()) || isAdmin,
      settings: sidebarHasPermission('settings', 'read') || isAdmin,
      financialOperations: sidebarHasPermission('finances', 'update') || sidebarHasPermission('finances', 'approve') || isAdmin || sidebarHasAnyRole(['financialAdmin']),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [isSuperAdmin, isAdmin, currentAccessManifest, viewAs, sidebarRoles.join('|')]);

    // Apply page_access_overrides: granted overrides add items even if the role
    // check denied them; blocked overrides remove items even if the role check
    // would have shown them.
    // rawMenuGroups is intentionally computed inside this useMemo so the result
    // is stable — computing it inline (outside useMemo) caused a new array
    // reference every render, making menuGroups and the useEffect(menuGroups)
    // fire on every render, creating a continuous sidebar flicker.
    const menuGroups = useMemo(() => {
      // Signed-in navigation has one registry/evaluator. Workflow role checks
      // below are retained solely for the separate administrator preview.
      if (!viewAs && !isSuperAdmin) {
        if (!currentAccessManifest) return [];
        const groups: Array<MenuGroup & { parentGroup: string }> = [];
        for (const page of getManifestNavigationPages(currentAccessManifest)) {
          if (menuPrefs.hiddenItems.includes(page.path)) continue;
          const navigation = getPageNavigationGroup(page.group);
          if (!navigation) continue;
          let group = groups.find(candidate => candidate.id === navigation.id);
          if (!group) {
            // parentGroup is required for the SECTION_CFG renderer; without it
            // granted pages land in __ungrouped__ and the sidebar stays blank.
            group = {
              id: navigation.id,
              label: navigation.label,
              order: navigation.order,
              parentGroup: navigation.parentGroup,
              items: [],
            };
            groups.push(group);
          }
          group.items.push({ id: page.slug, title: page.label, url: page.path, icon: page.icon,
            priority: group.items.length + 1, isPinned: menuPrefs.pinnedItems.includes(page.path) });
        }
        return groups.sort((left, right) => left.order - right.order);
      }

      const effectiveRole = viewAs ? viewAs.role : sidebarRoles[0];
      const smtCandidates = [
        ...sidebarRoles,
      ];
      const isSMTUser = smtCandidates.some(r => /^(smt)$/i.test(String(r ?? '').trim()));
      const SMT_ALLOW = new Set([
        '/dashboard', '/my-tasks', '/my-projects', '/calendar', '/notifications',
        '/programme-hub', '/projects', '/portfolio',
      ]);
      const isSmtAllowedUrl = (url: string) =>
        SMT_ALLOW.has(url) || SMT_ALLOW.has(url.split('?')[0]);

      const rawMenuGroups = currentUser
        ? getWorkflowMenuGroups(
            sidebarRoles as AppRole[],
            effectiveRole ?? 'dataCollector',
            perms,
            isSuperAdmin,
            menuPrefs,
            hasMonitoringAccess,
            isFundHolder
          )
        : [];

      // Deep-clone so we never mutate the cached builder result.
      let groups: typeof rawMenuGroups = rawMenuGroups.map(g => ({ ...g, items: [...g.items] }));

      // Helper: find or create a group by id.
      const getOrCreateGroup = (groupId: string, label: string, order: number, parentGroup?: string) => {
        let g = groups.find(x => x.id === groupId) as (MenuGroup & { parentGroup?: string }) | undefined;
        if (!g) {
          g = { id: groupId, label, order, items: [], ...(parentGroup ? { parentGroup } : {}) };
          groups.push(g);
        } else if (parentGroup && !(g as { parentGroup?: string }).parentGroup) {
          (g as { parentGroup?: string }).parentGroup = parentGroup;
        }
        return g;
      };

      const accessRoles = viewAs
        ? [viewAs.role]
        : sidebarRoles;

      const isAllowedPage = (slug: string, path: string) => {
        if (currentAccessManifest) {
          const [pathWithQuery, hash = ''] = path.split('#', 2);
          const [pathname, query = ''] = pathWithQuery.split('?', 2);
          return evaluateManifestPageAccess(
            currentAccessManifest,
            slug,
            resolveRoutePermission(pathname, query ? `?${query}` : '', hash ? `#${hash}` : ''),
          ).allowed;
        }
        const configuredRoles = sidebarRoleConfigs[slug];
        return accessRoles.some(role => canSeePage(slug, role, configuredRoles));
      };

      // A configured page-role row is authoritative for that page. Apply it to
      // existing navigation items and add configured grants the legacy builder
      // did not know how to surface (especially custom roles).
      if (!isSuperAdmin && Object.keys(sidebarRoleConfigs).length > 0) {
        groups = groups.map(group => ({
          ...group,
          items: group.items.filter(item => {
            const slug = resolveSlug(item.url);
            return !slug || isAllowedPage(slug, item.url);
          }),
        }));

        for (const [slug, configuredRoles] of Object.entries(sidebarRoleConfigs)) {
          const pageDef = getPageDefinition(slug);
          if (!pageDef || !isAllowedPage(slug, pageDef.path)) continue;
          if (isHubTabNavigationPath(pageDef.path)) continue;
          if (isSMTUser && !isSmtAllowedUrl(pageDef.path)) continue;
          const alreadyExists = groups.some(group => group.items.some(item => item.url === pageDef.path));
          if (!alreadyExists) {
            const navigationGroup = getPageNavigationGroup(pageDef.group);
            if (!navigationGroup) continue;
            getOrCreateGroup(navigationGroup.id, navigationGroup.label, navigationGroup.order, navigationGroup.parentGroup).items.push({
              id: pageDef.slug,
              title: pageDef.label,
              url: pageDef.path,
              icon: pageDef.icon,
              priority: 99,
            });
          }
        }
      }

      if (Object.keys(pageOverrideMap).length > 0) {
        for (const [slug, isBlocked] of Object.entries(pageOverrideMap)) {
          const pageDef = getPageDefinition(slug);
          if (!pageDef) continue;
          // SMT: never inject pages outside the project allowlist
          if (isSMTUser && !isBlocked && !isSmtAllowedUrl(pageDef.path)) continue;

          if (isBlocked) {
            // Remove this item from whichever group contains it
            groups.forEach(g => { g.items = g.items.filter(item => item.url !== pageDef.path); });
          } else if (isHubTabNavigationPath(pageDef.path)) {
            // Hub tabs stay inside HubLayout — do not inject as sidebar leaves
            continue;
          } else {
            // Ensure this item exists in its group (add if missing)
            const navigationGroup = getPageNavigationGroup(pageDef.group);
            if (!navigationGroup) continue;
            const alreadyExists = groups.some(g => g.items.some(item => item.url === pageDef.path));
            if (!alreadyExists) {
            const group = getOrCreateGroup(
              navigationGroup.id,
              navigationGroup.label,
              navigationGroup.order,
              navigationGroup.parentGroup,
            );
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

      }

      // The workflow builder is now presentation-only for signed-in users.
      // Its legacy role checks may suggest candidates, but the manifest is the
      // final decision for every registered navigation target.
      if (currentAccessManifest) {
        groups = groups.map(group => ({
          ...group,
          items: group.items.filter(item => {
            const slug = resolveSlug(item.url);
            return !slug || isAllowedPage(slug, item.url);
          }),
        }));
      }

      // Re-sort after configured-role and per-user override injections.
      groups.sort((a, b) => a.order - b.order);
      groups.forEach(g => g.items.sort((a, b) => a.priority - b.priority));

      // SMT final hard filter — only the allowlisted project pages, no leaks
      if (isSMTUser) {
        groups = groups
          .map(g => ({ ...g, items: g.items.filter(item => isSmtAllowedUrl(item.url)) }))
          .filter(g => g.items.length > 0);
      }

      return groups.filter(g => g.items.length > 0);
    // viewAs MUST be in the dep array — switching between two non-SA roles doesn't
    // change isSuperAdmin (stays false), so without viewAs the sidebar never re-renders.
    }, [currentUser, sidebarRoles, perms, isSuperAdmin, menuPrefs, hasMonitoringAccess, isFundHolder, pageOverrideMap, sidebarRoleConfigs, currentAccessManifest, viewAs]);

    const toggleGroupCollapse = (groupId: string) => {
      setCollapsedGroups(prev => {
        const next = new Set(prev);
        if (next.has(groupId)) {
          next.delete(groupId);
        } else {
          next.add(groupId);
        }
        try { localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, JSON.stringify([...next])); } catch {}
        return next;
      });
    };

    // Keep only the section for the current page expanded
    useEffect(() => {
      if (!menuGroups.length) return;
      const toExpand = new Set<string>();
      menuGroups.forEach((group: MenuGroup & { parentGroup?: string }) => {
        if (group.items.some(item => isNavPathActive(pathname, search, item.url))) {
          toExpand.add(group.id);
          if ((group as { parentGroup?: string }).parentGroup) {
            toExpand.add(`${(group as { parentGroup?: string }).parentGroup!}-parent`);
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
        try { localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, JSON.stringify([...next])); } catch {}
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
        fieldassistant:      "Field Assistant",
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
      // Primary display role is profiles.role (currentUser.role). Do not prefer
      // roles[0] from legacy user_roles — that leftover list still shows
      // "Data Collector" after Make primary sets Field Assistant.
      const profileRoleNorm = currentUser.role?.toLowerCase().replace(/[\s_-]/g, '');
      if (profileRoleNorm === 'superadmin') return "Super Admin";
      if (profileRoleNorm) {
        return ROLE_LABEL[profileRoleNorm]
          || (currentUser.role ?? '').charAt(0).toUpperCase() + (currentUser.role ?? '').slice(1);
      }
      if (roles && roles.length > 0) {
        if (roles.includes("admin" as AppRole)) return "Admin";
        const norm0 = (roles[0] as string).toLowerCase().replace(/[\s_-]/g, '');
        return ROLE_LABEL[norm0] || (roles[0] as string).charAt(0).toUpperCase() + (roles[0] as string).slice(1);
      }
      return "";
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
        <Sidebar collapsible="offcanvas" className="border-r border-border bg-card dark:bg-slate-950">

        {/* h-14 matches the Navbar so the logo sits on the header's baseline. */}
        <SidebarHeader className="px-3 py-0">
          <div className="flex h-14 items-center gap-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <img src={Logo} alt="PACT Logo" className="h-8 w-8 shrink-0 object-contain" />
            <span className="text-sm font-semibold tracking-tight text-foreground truncate group-data-[collapsible=icon]:hidden">
              PACT
            </span>
            <SidebarTrigger
              className="ml-auto h-7 w-7 shrink-0 rounded-md text-foreground/55 hover:text-foreground group-data-[collapsible=icon]:hidden"
              data-testid="button-sidebar-trigger"
            />
          </div>
        </SidebarHeader>

        <SidebarContent className="px-2 pt-2 pb-2 gap-0">
          {favoriteItems.length > 0 && (
            <Collapsible open={!isFavoritesCollapsed}>
              <SidebarGroup className={cn(SIDEBAR_GROUP_SHELL, "pb-1")}>
                <CollapsibleTrigger asChild>
                  <SidebarGroupLabel
                    className={cn(SIDEBAR_GROUP_LABEL, SIDEBAR_SECTION_LABEL)}
                    onClick={() => {
                      const next = !isFavoritesCollapsed;
                      setIsFavoritesCollapsed(next);
                      try { localStorage.setItem('pact-favorites-collapsed', String(next)); } catch {}
                    }}
                    data-testid="group-label-favorites"
                  >
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-transform duration-150",
                        isFavoritesCollapsed && "-rotate-90"
                      )}
                    />
                    <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500 shrink-0" />
                    <span className="flex-1 truncate normal-case tracking-normal">Favorites</span>
                    <span className="text-[10px] font-normal tabular-nums text-foreground/40">{favoriteItems.length}</span>
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
            // Section accents: one quiet hue each for wayfinding, not decoration
            type SectionCfg = { label: string; Icon: React.ElementType; iconColor: string };
            const SECTION_CFG: Record<string, SectionCfg> = {
              'workspace':     { label: 'Workspace',      Icon: LayoutDashboard, iconColor: 'text-sky-600 dark:text-sky-400' },
              'programme':     { label: 'Programme',      Icon: FolderKanban,    iconColor: 'text-blue-600 dark:text-blue-400' },
              'incentives':    { label: 'Bonuses',        Icon: Award,           iconColor: 'text-amber-600 dark:text-amber-400' },
              'comms':         { label: 'Communication',  Icon: MessageSquare,   iconColor: 'text-emerald-600 dark:text-emerald-400' },
              'fieldops':      { label: 'Field Ops',      Icon: Activity,        iconColor: 'text-orange-600 dark:text-orange-400' },
              'coordination':  { label: 'Coordination',   Icon: Network,         iconColor: 'text-violet-600 dark:text-violet-400' },
              'finance':       { label: 'Finance',        Icon: Banknote,        iconColor: 'text-green-700 dark:text-green-400' },
              'accounting':    { label: 'Accounting',     Icon: BookOpen,        iconColor: 'text-teal-700 dark:text-teal-400' },
              'hr':            { label: 'HR & People',    Icon: Users,           iconColor: 'text-rose-600 dark:text-rose-400' },
              'crm':           { label: 'CRM',            Icon: Handshake,       iconColor: 'text-indigo-600 dark:text-indigo-400' },
              'surveys':       { label: 'Surveys',        Icon: ClipboardList,   iconColor: 'text-cyan-700 dark:text-cyan-400' },
              'analytics':     { label: 'Analytics',      Icon: BarChart3,       iconColor: 'text-fuchsia-700 dark:text-fuchsia-400' },
              'admin':         { label: 'Administration', Icon: Settings,        iconColor: 'text-slate-600 dark:text-slate-300' },
              'help':          { label: 'Help',           Icon: HelpCircle,      iconColor: 'text-slate-500 dark:text-slate-400' },
              'superadmin':    { label: 'Super Admin',    Icon: ShieldCheck,     iconColor: 'text-red-600 dark:text-red-400' },
            };

            // Group sub-groups by parentGroup; track min order for sorting sections
            type SubGroup = MenuGroup & { parentGroup?: string };
            const sectionMap = new Map<string, SubGroup[]>();
            (menuGroups as SubGroup[]).forEach(g => {
              const pg = g.parentGroup ?? '__ungrouped__';
              if (!sectionMap.has(pg)) sectionMap.set(pg, []);
              sectionMap.get(pg)!.push(g);
            });
            const minOrder = (sgs: SubGroup[]) => Math.min(...sgs.map(g => g.order));
            const sortedSections = Array.from(sectionMap.entries())
              .filter(([key]) => key !== '__ungrouped__')
              .sort(([, a], [, b]) => minOrder(a) - minOrder(b));

            const NavCountBadge = ({ count, className, testId }: { count: number; className: string; testId: string }) =>
              count > 0 ? (
                <span
                  className={cn(
                    "ml-auto shrink-0 inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-md text-[10px] font-semibold tabular-nums leading-none",
                    className
                  )}
                  data-testid={testId}
                >
                  {count > 99 ? '99+' : count}
                </span>
              ) : null;

            // Action queue vs informational unread
            const BADGE_ACTION = "bg-red-500 text-white";
            const BADGE_INFO = "bg-sky-600 text-white";
            const renderItemBadge = (itemId: string) => {
              switch (itemId) {
                case 'approvals-hub':
                  return <NavCountBadge count={approvalsHubCount} className={BADGE_ACTION} testId="badge-approvals-hub-count" />;
                case 'advance-requests-report':
                case 'reconciliation-dashboard':
                  return <NavCountBadge count={pendingReclaimCount} className={BADGE_ACTION} testId={`badge-${itemId}-count`} />;
                case 'cost-submission':
                case 'supervisor-approvals':
                  return <NavCountBadge count={pendingCostApprovalCount} className={BADGE_ACTION} testId={`badge-${itemId}-count`} />;
                case 'down-payment-approval':
                  return <NavCountBadge count={pendingDownPaymentCount} className={BADGE_ACTION} testId="badge-down-payment-count" />;
                case 'mmp-management':
                  return <NavCountBadge count={pendingMmpCount} className={BADGE_ACTION} testId="badge-mmp-count" />;
                case 'accounting-gl-bridge':
                  return <NavCountBadge count={unresolvedGlBridgeErrorCount} className={BADGE_ACTION} testId="badge-gl-bridge-errors-count" />;
                case 'site-verification':
                case 'sites-for-verification':
                  return <NavCountBadge count={pendingVerificationCount} className={BADGE_ACTION} testId="badge-site-verification-count" />;
                case 'withdrawal-approval':
                  return <NavCountBadge count={pendingTier2CostCount} className={BADGE_ACTION} testId="badge-tier2-approval-count" />;
                case 'finance-approval':
                  return <NavCountBadge count={pendingFinanceCount} className={BADGE_ACTION} testId="badge-finance-approval-count" />;
                case 'notifications':
                  return <NavCountBadge count={unreadNotifCount} className={BADGE_INFO} testId="badge-notifications-unread-count" />;
                case 'my-wallet':
                  return <NavCountBadge count={pendingWalletCount} className={BADGE_ACTION} testId="badge-wallet-pending-count" />;
                case 'my-tasks':
                  return <NavCountBadge count={myTasksOverdueCount} className={BADGE_ACTION} testId="badge-my-tasks-overdue-count" />;
                case 'changelog':
                  return <NavCountBadge count={changelogUnreadCount} className={BADGE_INFO} testId="badge-changelog-unread-count" />;
                default:
                  return null;
              }
            };

            // Flat list under each section — no nested Personal/Team/Tools accordions
            const renderMenuItems = (items: MenuGroup['items'], sectionIconColor = SIDEBAR_ICON_MUTED) => (
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
                          isActive
                            ? "bg-primary/10 text-primary font-semibold"
                            : "text-foreground/85 hover:bg-muted/80 hover:text-foreground",
                        )}
                      >
                        <Link to={item.url} className="flex items-center gap-2.5" data-testid={`nav-link-${item.id}`}>
                          <item.icon
                            className={cn(
                              "h-4 w-4 shrink-0",
                              isActive ? SIDEBAR_ICON_ACTIVE : sectionIconColor,
                            )}
                          />
                          <span className="flex-1 truncate">{item.title}</span>
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

            const flattenSectionItems = (subGroups: SubGroup[]): MenuGroup['items'] => {
              const seen = new Set<string>();
              const flat: MenuGroup['items'] = [];
              [...subGroups].sort((a, b) => a.order - b.order).forEach(sg => {
                [...sg.items].sort((a, b) => a.priority - b.priority).forEach(item => {
                  if (seen.has(item.url)) return;
                  seen.add(item.url);
                  flat.push(item);
                });
              });
              return flat;
            };

            const renderSection = (parentGroupId: string, subGroups: SubGroup[], keySuffix = '') => {
              const cfg = SECTION_CFG[parentGroupId];
              if (!cfg || subGroups.length === 0) return null;
              const parentKey = `${parentGroupId}-parent`;
              const isCollapsed = collapsedGroups.has(parentKey);
              const { label, Icon, iconColor } = cfg;
              const items = flattenSectionItems(subGroups);
              if (items.length === 0) return null;
              return (
                <Collapsible key={`${parentKey}${keySuffix}`} open={!isCollapsed}>
                  <SidebarGroup className={SIDEBAR_GROUP_SHELL}>
                    <CollapsibleTrigger asChild>
                      <SidebarGroupLabel
                        className={cn(SIDEBAR_GROUP_LABEL, SIDEBAR_SECTION_LABEL)}
                        onClick={() => toggleGroupCollapse(parentKey)}
                        data-testid={`group-label-${parentKey}${keySuffix}`}
                      >
                        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-150", isCollapsed && "-rotate-90")} />
                        <Icon className={cn("h-3.5 w-3.5 shrink-0", iconColor)} />
                        <span className="flex-1 truncate">{label}</span>
                        <span className="text-[10px] font-normal normal-case tracking-normal tabular-nums text-foreground/40">
                          {items.length}
                        </span>
                      </SidebarGroupLabel>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarGroupContent className="pt-0.5 pb-1">
                        {renderMenuItems(items, iconColor)}
                      </SidebarGroupContent>
                    </CollapsibleContent>
                  </SidebarGroup>
                </Collapsible>
              );
            };

            // ── Render all sections in order ────────────────────────────────────
            return sortedSections.map(([parentGroupId, subGroups]) =>
              renderSection(parentGroupId, subGroups)
            ).filter(Boolean);
          })()}
        </SidebarContent>

        <SidebarFooter className="border-t border-border px-3 py-3">
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
                  className="w-full justify-start gap-2.5 px-2.5 py-2 h-11 hover:bg-primary/5 rounded-lg group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
                  data-testid="button-user-menu"
                >
                  <div className="relative shrink-0">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={currentUser.avatar} alt={currentUser.fullName || currentUser.name} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">
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
