  import { useLocation, Link, useNavigate } from "react-router-dom";
  import { Button } from "@/components/ui/button";
  import { 
    Users, 
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
    Archive,
    CreditCard,
    DollarSign,
    Award,
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
    CheckSquare
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
    SidebarResizeHandle
  } from "@/components/ui/sidebar";
  import { AppRole } from "@/types";
  import { useAuthorization } from "@/hooks/use-authorization";
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
    CheckSquare
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

    const isHidden = (url: string) => menuPrefs.hiddenItems.includes(url);
    const isPinned = (url: string) => menuPrefs.pinnedItems.includes(url);

    const groups: MenuGroup[] = [];

    const overviewItems: MenuGroup['items'] = [];
    if (!isHidden('/dashboard') && (isSuperAdmin || isAdmin || isICT || perms.dashboard)) {
      overviewItems.push({ id: 'dashboard', title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, priority: 1, isPinned: isPinned('/dashboard') });
    }
    if (!isHidden('/my-tasks')) {
      overviewItems.push({ id: 'my-tasks', title: "My Tasks", url: "/my-tasks", icon: CheckSquare, priority: 1.5, isPinned: isPinned('/my-tasks') });
    }
    if (!isHidden('/signatures') && (isSuperAdmin || isAdmin || isICT || isFOM || isCoordinator || isSupervisor || isFinancialAdmin || isAuditor)) {
      overviewItems.push({ id: 'signatures', title: "Signatures", url: "/signatures", icon: FileSignature, priority: 2, isPinned: isPinned('/signatures') });
    }
    if (overviewItems.length) groups.push({ id: 'overview', label: "Overview", order: 1, items: overviewItems });

    const communicationItems: MenuGroup['items'] = [];
    if (!isHidden('/chat')) {
      communicationItems.push({ id: 'chat', title: "Chat", url: "/chat", icon: MessageSquare, priority: 1, isPinned: isPinned('/chat') });
    }
    if (!isHidden('/calls')) {
      communicationItems.push({ id: 'calls', title: "Calls", url: "/calls", icon: Phone, priority: 2, isPinned: isPinned('/calls') });
    }
    if (!isHidden('/notifications')) {
      communicationItems.push({ id: 'notifications', title: "Notifications", url: "/notifications", icon: Bell, priority: 3, isPinned: isPinned('/notifications') });
    }
    if (communicationItems.length) groups.push({ id: 'communication', label: "Communication", order: 1.5, items: communicationItems });

    const planningItems: MenuGroup['items'] = [];
    if (!isHidden('/projects') && (isSuperAdmin || isAdmin || isICT || perms.projects)) {
      planningItems.push({ id: 'projects', title: "Projects", url: "/projects", icon: FolderKanban, priority: 1, isPinned: isPinned('/projects') });
    }
    if (!isHidden('/projects/analytics') && (isSuperAdmin || isAdmin || isFOM || perms.projects)) {
      planningItems.push({ id: 'project-analytics', title: "Project Analytics", url: "/projects/analytics", icon: BarChart3, priority: 2, isPinned: isPinned('/projects/analytics') });
    }
    if (!isHidden('/mmp') && (isSuperAdmin || isAdmin || isICT || isDataTeam || perms.mmp || isCoordinator || isSupervisor || isDataCollector || isFOM)) {
      const mmpTitle = (!isSuperAdmin && (isDataCollector || isCoordinator)) ? "My Sites Management" : "MMP Management";
      planningItems.push({ id: 'mmp-management', title: mmpTitle, url: "/mmp", icon: Database, priority: 2, isPinned: isPinned('/mmp') });
    }
    if (!isHidden('/supervisor/sites') && isSupervisor && !isCoordinator) {
      planningItems.push({ id: 'supervisor-site-management', title: "My Site Management", url: "/supervisor/sites", icon: Map, priority: 3, isPinned: isPinned('/supervisor/sites') });
    }
    if (!isHidden('/hub-operations') && (isSuperAdmin || isAdmin)) {
      planningItems.push({ id: 'hub-operations', title: "Hub Operations", url: "/hub-operations", icon: Building2, priority: 3, isPinned: isPinned('/hub-operations') });
    }
    if (!isHidden('/hub-management') && (isSuperAdmin || isAdmin)) {
      planningItems.push({ id: 'hub-management', title: "Hub Management", url: "/hub-management", icon: Building2, priority: 4, isPinned: isPinned('/hub-management') });
    }
    if (planningItems.length) groups.push({ id: 'planning', label: "Planning & Setup", order: 2, items: planningItems });

    const fieldOpsItems: MenuGroup['items'] = [];
    if (!isHidden('/site-visits') && (isSuperAdmin || isAdmin || isICT || perms.siteVisits)) {
      fieldOpsItems.push({ id: 'site-visits', title: "Site Visits", url: "/site-visits", icon: ClipboardList, priority: 1, isPinned: isPinned('/site-visits') });
    }
    if (!isHidden('/field-team') && (isSuperAdmin || ((isAdmin || perms.fieldTeam) && !isICT))) {
      fieldOpsItems.push({ id: 'field-team', title: "Field Team", url: "/field-team", icon: Activity, priority: 2, isPinned: isPinned('/field-team') });
    }
    if (!isHidden('/safety-hub') && (isSuperAdmin || isAdmin || isICT || isFOM || isCoordinator || isSupervisor || isDataCollector || isDataTeam)) {
      fieldOpsItems.push({ id: 'safety-hub', title: "Safety Hub", url: "/safety-hub", icon: Siren, priority: 4, isPinned: isPinned('/safety-hub') });
    }
    if (!isHidden('/incident-reports') && (isSuperAdmin || isAdmin || isICT || isFOM || isCoordinator || isSupervisor || isDataTeam)) {
      fieldOpsItems.push({ id: 'incident-reports', title: "Incident Reports", url: "/incident-reports", icon: AlertTriangle, priority: 5, isPinned: isPinned('/incident-reports') });
    }
    if (!isHidden('/equipment') && (isSuperAdmin || isAdmin || isFOM)) {
      fieldOpsItems.push({ id: 'equipment', title: "Equipment Tracking", url: "/equipment", icon: Package, priority: 6, isPinned: isPinned('/equipment') });
    }
    if (!isHidden('/monitoring-form') && (isSuperAdmin || isAdmin || isDataCollector || isCoordinator || isSupervisor || isFOM)) {
      fieldOpsItems.push({ id: 'monitoring-form', title: "Monitoring Form", url: "/monitoring-form", icon: ClipboardCheck, priority: 7, isPinned: isPinned('/monitoring-form') });
    }
    if (fieldOpsItems.length) groups.push({ id: 'field-ops', label: "Field Operations", order: 3, items: fieldOpsItems });

    const cycleItems: MenuGroup['items'] = [];
    if (!isHidden('/mmp/cycle-close') && (isSuperAdmin || isAdmin || isFOM || isSupervisor)) {
      cycleItems.push({ id: 'mmp-cycle-close', title: "Cycle Management", url: "/mmp/cycle-close", icon: CheckCircle, priority: 1, isPinned: isPinned('/mmp/cycle-close') });
    }
    if (!isHidden('/data-export-center') && (isSuperAdmin || isAdmin)) {
      cycleItems.push({ id: 'data-export-center', title: "Data Export Center", url: "/data-export-center", icon: BarChart3, priority: 2, isPinned: isPinned('/data-export-center') });
    }
    if (cycleItems.length) groups.push({ id: 'cycle-management', label: "Cycle Management", order: 3.5, items: cycleItems });

    const verificationItems: MenuGroup['items'] = [];
    if (!isHidden('/coordinator/sites') && (isSuperAdmin || isCoordinator || isSupervisor)) {
      verificationItems.push({ id: 'site-verification', title: "Site Verification", url: "/coordinator/sites", icon: CheckCircle, priority: 1, isPinned: isPinned('/coordinator/sites') });
    }
    if (!isHidden('/coordinator/sites-for-verification') && (isSuperAdmin || isCoordinator || isSupervisor)) {
      verificationItems.push({ id: 'sites-for-verification', title: "Sites for Verification", url: "/coordinator/sites-for-verification", icon: CheckCircle, priority: 1.1, isPinned: isPinned('/coordinator/sites-for-verification') });
    }
    if (!isHidden('/archive') && (isSuperAdmin || isAdmin || perms.archive)) {
      verificationItems.push({ id: 'archive', title: "Archive", url: "/archive", icon: Archive, priority: 2, isPinned: isPinned('/archive') });
    }
    if (verificationItems.length) groups.push({ id: 'verification', label: "Verification & Review", order: 4, items: verificationItems });

    const dataItems: MenuGroup['items'] = [];
    if (!isHidden('/data-visibility') && (isSuperAdmin || ((isAdmin || perms.dataVisibility) && !isICT))) {
      dataItems.push({ id: 'data-visibility', title: "Data Visibility", url: "/data-visibility", icon: Link2, priority: 1, isPinned: isPinned('/data-visibility') });
    }
    if (!isHidden('/reports') && (isSuperAdmin || ((isAdmin || perms.reports) && !isICT))) {
      dataItems.push({ id: 'reports', title: "Reports", url: "/reports", icon: BarChart3, priority: 2, isPinned: isPinned('/reports') });
    }
    // Hide Calendar for Data Collectors on web
    if (!isDataCollector && !isHidden('/calendar')) {
      dataItems.push({ id: 'calendar', title: "Calendar", url: "/calendar", icon: Calendar, priority: 3, isPinned: isPinned('/calendar') });
    }
    if (!isHidden('/tracker-preparation-plan') && (isSuperAdmin || isAdmin || isICT)) {
      dataItems.push({ id: 'tracker-plan', title: "Tracker Preparation", url: "/tracker-preparation-plan", icon: BarChart3, priority: 4, isPinned: isPinned('/tracker-preparation-plan') });
    }
    if (!isHidden('/documents') && (isSuperAdmin || isAdmin || isICT || isFinancialAdmin || isAuditor)) {
      dataItems.push({ id: 'documents', title: "Documents", url: "/documents", icon: FileText, priority: 5, isPinned: isPinned('/documents') });
    }
    if (!isHidden('/questionnaire-analytics') && isSuperAdmin) {
      dataItems.push({ id: 'questionnaire-analytics', title: "Questionnaire Analytics", url: "/questionnaire-analytics", icon: BarChart3, priority: 7, isPinned: isPinned('/questionnaire-analytics') });
    }
    if (!isHidden('/map') && (isSuperAdmin || isAdmin || isFOM)) {
      dataItems.push({ id: 'advanced-map', title: "Advanced Map", url: "/map", icon: Map, priority: 6, isPinned: isPinned('/map') });
    }
    if (dataItems.length) groups.push({ id: 'reports', label: "Data & Reports", order: 5, items: dataItems });

    const helpItems: MenuGroup['items'] = [];
    if (!isHidden('/documentation')) {
      helpItems.push({ id: 'documentation', title: "Documentation", url: "/documentation", icon: BookOpen, priority: 1, isPinned: isPinned('/documentation') });
    }
    if (!isHidden('/mobile-documentation')) {
      helpItems.push({ id: 'mobile-documentation', title: "Mobile User Manual", url: "/mobile-documentation", icon: Smartphone, priority: 1.5, isPinned: isPinned('/mobile-documentation') });
    }
    if (!isHidden('/mobile-support-tickets') && (isSuperAdmin || isAdmin)) {
      helpItems.push({ id: 'mobile-support-tickets', title: "Mobile Support Tickets", url: "/mobile-support-tickets", icon: Smartphone, priority: 2, isPinned: isPinned('/mobile-support-tickets') });
    }
    if (!isHidden('/helpline')) {
      helpItems.push({ id: 'helpline', title: "Helpline & Emergency Contacts", url: "/helpline", icon: HeartPulse, priority: 3, isPinned: isPinned('/helpline') });
    }
    if (helpItems.length) groups.push({ id: 'help', label: "Help & Support", order: 9, items: helpItems });

    // Payments & Finance - organized into sub-categories
    // Sub-group 1: My Money (personal wallet, cost submissions - visible to most users)
    const myMoneyItems: MenuGroup['items'] = [];
    if (!isHidden('/wallet') && (isFinancialAdmin || isAuditor || isFOM || isSupervisor || isDataCollector || isCoordinator)) {
      myMoneyItems.push({ id: 'my-wallet', title: "My Wallet", url: "/wallet", icon: CreditCard, priority: 1, isPinned: isPinned('/wallet') });
    }
    if (!isHidden('/cost-submission') && (isSuperAdmin || isAdmin || isSupervisor || isFOM || isCoordinator || isDataTeam)) {
      myMoneyItems.push({ id: 'cost-submission', title: "Cost Submission", url: "/cost-submission", icon: Receipt, priority: 2, isPinned: isPinned('/cost-submission') });
    }
    if (myMoneyItems.length) groups.push({ id: 'finance-my-money', label: "My Money", order: 5.1, items: myMoneyItems, parentGroup: 'finance' } as any);

    // Sub-group 2: Approvals (all approval workflows)
    const approvalItems: MenuGroup['items'] = [];
    if (!isHidden('/supervisor-approvals') && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor || isSupervisor || isFOM)) {
      approvalItems.push({ id: 'supervisor-approvals', title: "Tier 1 Approvals", url: "/supervisor-approvals", icon: ClipboardCheck, priority: 1, isPinned: isPinned('/supervisor-approvals') });
    }
    if (!isHidden('/withdrawal-approval') && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor)) {
      approvalItems.push({ id: 'withdrawal-approval', title: "Tier 2 Approvals", url: "/withdrawal-approval", icon: ClipboardCheck, priority: 2, isPinned: isPinned('/withdrawal-approval') });
    }
    if (!isHidden('/down-payment-approval') && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor || isSupervisor)) {
      approvalItems.push({ id: 'down-payment-approval', title: "Down-Payment Approval", url: "/down-payment-approval", icon: DollarSign, priority: 3, isPinned: isPinned('/down-payment-approval') });
    }
    if (!isHidden('/finance-approval') && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor)) {
      approvalItems.push({ id: 'finance-approval', title: "Finance Processing", url: "/finance-approval", icon: Banknote, priority: 4, isPinned: isPinned('/finance-approval') });
    }
    if (approvalItems.length) groups.push({ id: 'finance-approvals', label: "Approvals", order: 5.2, items: approvalItems, parentGroup: 'finance' } as any);

    // Sub-group 3: Financial Management (admin-level management)
    const finMgmtItems: MenuGroup['items'] = [];
    if (!isHidden('/budget') && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor)) {
      finMgmtItems.push({ id: 'budget', title: "Budget", url: "/budget", icon: DollarSign, priority: 1, isPinned: isPinned('/budget') });
    }
    if (!isHidden('/admin/wallets') && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor)) {
      finMgmtItems.push({ id: 'wallets', title: "Wallets Admin", url: "/admin/wallets", icon: CreditCard, priority: 2, isPinned: isPinned('/admin/wallets') });
    }
    if (!isHidden('/financial-operations') && (isSuperAdmin || perms.financialOperations)) {
      finMgmtItems.push({ id: 'financial-ops', title: "Financial Operations", url: "/financial-operations", icon: TrendingUp, priority: 3, isPinned: isPinned('/financial-operations') });
    }
    if (!isHidden('/retainer-management') && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor)) {
      finMgmtItems.push({ id: 'retainer-management', title: "Retainer Management", url: "/retainer-management", icon: Banknote, priority: 4, isPinned: isPinned('/retainer-management') });
    }
    if (!isHidden('/reconciliation-dashboard') && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor)) {
      finMgmtItems.push({ id: 'reconciliation-dashboard', title: "Reconciliation Dashboard", url: "/reconciliation-dashboard", icon: ClipboardCheck, priority: 5, isPinned: isPinned('/reconciliation-dashboard') });
    }
    if (finMgmtItems.length) groups.push({ id: 'finance-management', label: "Financial Management", order: 5.3, items: finMgmtItems, parentGroup: 'finance' } as any);

    // Sub-group 4: Financial Reports & Tools
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
    if (finReportItems.length) groups.push({ id: 'finance-reports', label: "Financial Reports", order: 5.4, items: finReportItems, parentGroup: 'finance' } as any);

    // Administration category - User and role management
    const adminItems: MenuGroup['items'] = [];
    if (!isHidden('/users') && (isSuperAdmin || isAdmin || isICT || perms.users)) {
      adminItems.push({ id: 'user-management', title: "User Management", url: "/users", icon: Users, priority: 1, isPinned: isPinned('/users') });
    }
    if (!isHidden('/admin/staff-profiles') && (isSuperAdmin || isAdmin || isFinancialAdmin)) {
      adminItems.push({ id: 'staff-directory', title: "Staff Directory", url: "/admin/staff-profiles", icon: Users, priority: 1.5, isPinned: isPinned('/admin/staff-profiles') });
    }
    if (!isHidden('/departments') && (isSuperAdmin || isAdmin)) {
      adminItems.push({ id: 'departments', title: "Departments", url: "/departments", icon: Building2, priority: 1.7, isPinned: isPinned('/departments') });
    }
    if (!isHidden('/task-admin') && (isSuperAdmin || isAdmin)) {
      adminItems.push({ id: 'task-admin', title: "Task Admin & Payroll", url: "/task-admin", icon: Banknote, priority: 1.9, isPinned: isPinned('/task-admin') });
    }
    if (!isHidden('/role-management') && (isSuperAdmin || isAdmin || perms.roleManagement)) {
      adminItems.push({ id: 'role-management', title: "Role Management", url: "/role-management", icon: Shield, priority: 2, isPinned: isPinned('/role-management') });
    }
    if (!isHidden('/classifications') && (isSuperAdmin || isAdmin || isFinancialAdmin || isAuditor)) {
      adminItems.push({ id: 'classifications', title: "Classifications", url: "/classifications", icon: Award, priority: 3, isPinned: isPinned('/classifications') });
    }
    if (!isHidden('/classification-fees') && (isSuperAdmin || isAdmin)) {
      adminItems.push({ id: 'classification-fees', title: "Classification Fees", url: "/classification-fees", icon: DollarSign, priority: 4, isPinned: isPinned('/classification-fees') });
    }
    if (!isHidden('/settings') && (isSuperAdmin || ((isAdmin || perms.settings) && !isDataCollector))) {
      adminItems.push({ id: 'settings', title: "Settings", url: "/settings", icon: Settings, priority: 5, isPinned: isPinned('/settings') });
    }
    // Show System Monitoring to non-super-admin users who have been explicitly granted access
    if (!isSuperAdmin && hasMonitoringAccess && !isHidden('/admin/monitoring')) {
      adminItems.push({ id: 'monitoring-dashboard', title: "System Monitoring", url: "/admin/monitoring", icon: Activity, priority: 5.5, isPinned: isPinned('/admin/monitoring') });
    }
    if (adminItems.length) groups.push({ id: 'admin', label: "Administration", order: 7, items: adminItems });

    // Super Admin category - Super admin exclusive pages
    if (isSuperAdmin) {
      const superAdminItems: MenuGroup['items'] = [];
      if (!isHidden('/super-admin-management')) {
        superAdminItems.push({ id: 'super-admin', title: "Super Admin Management", url: "/super-admin-management", icon: ShieldCheck, priority: 1, isPinned: isPinned('/super-admin-management') });
      }
      if (!isHidden('/admin/monitoring')) {
        superAdminItems.push({ id: 'monitoring-dashboard', title: "System Monitoring", url: "/admin/monitoring", icon: Activity, priority: 1.5, isPinned: isPinned('/admin/monitoring') });
      }
      if (!isHidden('/approval-dashboard')) {
        superAdminItems.push({ id: 'approval-dashboard', title: "Approval Dashboard", url: "/approval-dashboard", icon: ClipboardCheck, priority: 2, isPinned: isPinned('/approval-dashboard') });
      }
      if (!isHidden('/permissions-management')) {
        superAdminItems.push({ id: 'permissions-management', title: "User Permissions", url: "/permissions-management", icon: ShieldCheck, priority: 3, isPinned: isPinned('/permissions-management') });
      }
      if (!isHidden('/audit-logs')) {
        superAdminItems.push({ id: 'audit-logs', title: "Audit Logs", url: "/audit-logs", icon: ScrollText, priority: 4, isPinned: isPinned('/audit-logs') });
      }
      if (!isHidden('/email-tracking')) {
        superAdminItems.push({ id: 'email-tracking', title: "Email Tracking", url: "/email-tracking", icon: Mail, priority: 5, isPinned: isPinned('/email-tracking') });
      }
      if (!isHidden('/email-management')) {
        superAdminItems.push({ id: 'email-management', title: "Email Management", url: "/email-management", icon: Mail, priority: 6, isPinned: isPinned('/email-management') });
      }
      if (!isHidden('/email-preview')) {
        superAdminItems.push({ id: 'email-preview', title: "Email Preview", url: "/email-preview", icon: Eye, priority: 6.5, isPinned: isPinned('/email-preview') });
      }
      if (!isHidden('/admin/broadcast')) {
        superAdminItems.push({ id: 'admin-broadcast', title: "Broadcast Center", url: "/admin/broadcast", icon: Megaphone, priority: 7, isPinned: isPinned('/admin/broadcast') });
      }
      if (!isHidden('/admin/transaction-scanner')) {
        superAdminItems.push({ id: 'transaction-scanner', title: "Transaction Scanner", url: "/admin/transaction-scanner", icon: ScanLine, priority: 7.5, isPinned: isPinned('/admin/transaction-scanner') });
      }
      if (!isHidden('/mobile-help-articles')) {
        superAdminItems.push({ id: 'mobile-help-articles', title: "Mobile Help Articles", url: "/mobile-help-articles", icon: HelpCircle, priority: 8, isPinned: isPinned('/mobile-help-articles') });
      }
      if (!isHidden('/mobile-signatures')) {
        superAdminItems.push({ id: 'mobile-signatures', title: "Mobile Signatures", url: "/mobile-signatures", icon: PenTool, priority: 9, isPinned: isPinned('/mobile-signatures') });
      }
      if (!isHidden('/mobile-call-scheduling')) {
        superAdminItems.push({ id: 'mobile-call-scheduling', title: "Mobile Call Scheduling", url: "/mobile-call-scheduling", icon: PhoneCall, priority: 10, isPinned: isPinned('/mobile-call-scheduling') });
      }
      if (!isHidden('/mobile-document-sync')) {
        superAdminItems.push({ id: 'mobile-document-sync', title: "Mobile Document Sync", url: "/mobile-document-sync", icon: RefreshCw, priority: 11, isPinned: isPinned('/mobile-document-sync') });
      }
      if (!isHidden('/super-admin-data')) {
        superAdminItems.push({ id: 'super-admin-data', title: "Data Management", url: "/super-admin-data", icon: Database, priority: 12, isPinned: isPinned('/super-admin-data') });
      }
      if (superAdminItems.length) groups.push({ id: 'super-admin', label: "Super Admin", order: 8, items: superAdminItems });
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

    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const [isFavoritesCollapsed, setIsFavoritesCollapsed] = useState(false);

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

    const menuPrefs: MenuPreferences = useMemo(() => {
      const savedPrefs = userSettings?.settings?.menuPreferences;
      return savedPrefs ? { ...DEFAULT_MENU_PREFERENCES, ...savedPrefs } : DEFAULT_MENU_PREFERENCES;
    }, [userSettings?.settings?.menuPreferences]);

    const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
      useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const toggleFavorite = useCallback(async (url: string, title: string, iconName: string) => {
      const currentFavorites = menuPrefs.favoritePages || [];
      const isFavorite = currentFavorites.includes(url);
      
      if (isFavorite) {
        await updateMenuPreferences({
          favoritePages: currentFavorites.filter(f => f !== url)
        });
      } else {
        await updateMenuPreferences({
          favoritePages: [...currentFavorites, url]
        });
      }
    }, [menuPrefs.favoritePages, updateMenuPreferences]);

    const removeFavorite = useCallback(async (url: string) => {
      const currentFavorites = menuPrefs.favoritePages || [];
      await updateMenuPreferences({
        favoritePages: currentFavorites.filter(f => f !== url)
      });
    }, [menuPrefs.favoritePages, updateMenuPreferences]);

    const handleDragEnd = useCallback(async (event: DragEndEvent) => {
      const { active, over } = event;
      
      if (over && active.id !== over.id) {
        const currentFavorites = menuPrefs.favoritePages || [];
        const oldIndex = currentFavorites.indexOf(active.id as string);
        const newIndex = currentFavorites.indexOf(over.id as string);
        
        const newOrder = arrayMove(currentFavorites, oldIndex, newIndex);
        await updateMenuPreferences({ favoritePages: newOrder });
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
      <Sidebar collapsible="icon" className="border-r bg-white dark:bg-gray-900">

        <SidebarHeader className="border-b py-0">
          <div className="flex h-15 items-center gap-0.5 px-0.5">
            <img src={Logo} alt="PACT Logo" className="h-8 w-8 shrink-0 object-contain" />
            <SidebarTrigger className="ml-auto h-4 w-4" data-testid="button-sidebar-trigger" />
          </div>
        </SidebarHeader>

        <SidebarContent className="px-0 pt-0 pb-0">
          {favoriteItems.length > 0 && (
            <Collapsible open={!isFavoritesCollapsed} className="">
              <SidebarGroup className="pt-3 pb-1 px-0">
                <CollapsibleTrigger asChild>
                  <SidebarGroupLabel 
                    className="px-1 py-0.5 h-6 text-[13px] uppercase tracking-wide font-semibold text-amber-600 dark:text-amber-400 cursor-pointer flex items-center justify-between hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded transition-colors"
                    onClick={() => setIsFavoritesCollapsed(!isFavoritesCollapsed)}
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
                          className={`flex-1 rounded text-[13px] font-medium transition-all duration-200 
                            ${
                              pathname === item.url
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 font-semibold"
                                : ""
                            }`}
                        >
                          <Link to={item.url} className="flex items-center gap-1" data-testid={`nav-link-${item.id}`}>
                            <item.icon
                              className={`h-4 w-4 ${
                                pathname === item.url
                                  ? "text-blue-700 dark:text-blue-300"
                                  : "text-blue-600 dark:text-blue-400"
                              }`}
                            />
                            <span className="truncate flex-1">{item.title}</span>
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
                        className="px-1 py-0.5 h-6 text-[13px] uppercase tracking-wide font-semibold text-blue-600 dark:text-blue-300 cursor-pointer flex items-center justify-between hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
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

        <SidebarFooter className="border-t p-2">
          {currentUser && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 px-2 py-1.5 h-9 hover:bg-blue-50 dark:hover:bg-gray-800 rounded-lg"
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
    );
  };

  export default AppSidebar;