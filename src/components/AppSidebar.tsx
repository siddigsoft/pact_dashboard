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
    Bell
  } from "lucide-react";
  import { useSiteVisitReminders } from "@/hooks/use-site-visit-reminders";
  import Logo from "../assets/logo.png";
  import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
  import { useAppContext } from "@/context/AppContext";
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
  import { useState, useMemo } from "react";
  import { MenuPreferences, DEFAULT_MENU_PREFERENCES } from "@/types/user-preferences";

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
    Bell
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
    menuPrefs: MenuPreferences = DEFAULT_MENU_PREFERENCES
  ): MenuGroup[] => {
    const isAdmin = roles.includes('admin' as AppRole) || defaultRole === 'admin';
    const isICT = roles.includes('ict' as AppRole) || defaultRole === 'ict';
    const isFinancialAdmin = roles.includes('financialAdmin' as AppRole) || defaultRole === 'financialAdmin';
    const isDataCollector = roles.includes('DataCollector' as AppRole) || roles.includes('dataCollector' as AppRole) || defaultRole === 'dataCollector' || defaultRole === 'DataCollector';
    const isCoordinator = roles.includes('Coordinator' as AppRole) || roles.includes('coordinator' as AppRole) || defaultRole === 'coordinator' || defaultRole === 'Coordinator';
    const isFOM = roles.includes('fom' as AppRole) || defaultRole === 'fom';
    const isSupervisor = roles.includes('supervisor' as AppRole) || defaultRole === 'supervisor';

    const isHidden = (url: string) => menuPrefs.hiddenItems.includes(url);
    const isPinned = (url: string) => menuPrefs.pinnedItems.includes(url);

    const groups: MenuGroup[] = [];

    const overviewItems: MenuGroup['items'] = [];
    if (!isHidden('/dashboard') && (isAdmin || isICT || perms.dashboard)) {
      overviewItems.push({ id: 'dashboard', title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, priority: 1, isPinned: isPinned('/dashboard') });
    }
    if (!isHidden('/wallet') && isDataCollector) {
      overviewItems.push({ id: 'my-wallet', title: "My Wallet", url: "/wallet", icon: CreditCard, priority: 2, isPinned: isPinned('/wallet') });
    }
    if (!isHidden('/cost-submission') && (isDataCollector || isAdmin || isCoordinator)) {
      overviewItems.push({ id: 'cost-submission', title: "Cost Submission", url: "/cost-submission", icon: Receipt, priority: 3, isPinned: isPinned('/cost-submission') });
    }
    if (!isHidden('/signatures')) {
      overviewItems.push({ id: 'signatures', title: "Signatures", url: "/signatures", icon: FileSignature, priority: 4, isPinned: isPinned('/signatures') });
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
    if (!isHidden('/projects') && (isAdmin || isICT || perms.projects)) {
      planningItems.push({ id: 'projects', title: "Projects", url: "/projects", icon: FolderKanban, priority: 1, isPinned: isPinned('/projects') });
    }
    if (!isHidden('/mmp') && (isAdmin || isICT || perms.mmp || isCoordinator)) {
      const mmpTitle = (isDataCollector || isCoordinator) ? "My Sites Management" : "MMP Management";
      planningItems.push({ id: 'mmp-management', title: mmpTitle, url: "/mmp", icon: Database, priority: 2, isPinned: isPinned('/mmp') });
    }
    if (!isHidden('/hub-operations') && (isAdmin || isSuperAdmin)) {
      planningItems.push({ id: 'hub-operations', title: "Hub Operations", url: "/hub-operations", icon: Building2, priority: 3, isPinned: isPinned('/hub-operations') });
    }
    if (planningItems.length) groups.push({ id: 'planning', label: "Planning & Setup", order: 2, items: planningItems });

    const fieldOpsItems: MenuGroup['items'] = [];
    if (!isHidden('/site-visits') && (isAdmin || isICT || perms.siteVisits)) {
      fieldOpsItems.push({ id: 'site-visits', title: "Site Visits", url: "/site-visits", icon: ClipboardList, priority: 1, isPinned: isPinned('/site-visits') });
    }
    if (!isHidden('/field-team') && ((isAdmin || perms.fieldTeam) && !isICT)) {
      fieldOpsItems.push({ id: 'field-team', title: "Field Team", url: "/field-team", icon: Activity, priority: 2, isPinned: isPinned('/field-team') });
    }
    if (!isHidden('/field-operation-manager') && (isAdmin || isFOM || perms.fieldOpManager) && !isCoordinator) {
      fieldOpsItems.push({ id: 'field-op-manager', title: "Field Operation Manager", url: "/field-operation-manager", icon: MapPin, priority: 3, isPinned: isPinned('/field-operation-manager') });
    }
    if (fieldOpsItems.length) groups.push({ id: 'field-ops', label: "Field Operations", order: 3, items: fieldOpsItems });

    const verificationItems: MenuGroup['items'] = [];
    if (!isHidden('/coordinator/sites') && isCoordinator) {
      verificationItems.push({ id: 'site-verification', title: "Site Verification", url: "/coordinator/sites", icon: CheckCircle, priority: 1, isPinned: isPinned('/coordinator/sites') });
    }
    if (!isHidden('/archive') && (isAdmin || perms.archive)) {
      verificationItems.push({ id: 'archive', title: "Archive", url: "/archive", icon: Archive, priority: 2, isPinned: isPinned('/archive') });
    }
    if (verificationItems.length) groups.push({ id: 'verification', label: "Verification & Review", order: 4, items: verificationItems });

    const dataItems: MenuGroup['items'] = [];
    if (!isHidden('/data-visibility') && ((isAdmin || perms.dataVisibility) && !isICT)) {
      dataItems.push({ id: 'data-visibility', title: "Data Visibility", url: "/data-visibility", icon: Link2, priority: 1, isPinned: isPinned('/data-visibility') });
    }
    if (!isHidden('/reports') && ((isAdmin || perms.reports) && !isICT)) {
      dataItems.push({ id: 'reports', title: "Reports", url: "/reports", icon: BarChart3, priority: 2, isPinned: isPinned('/reports') });
    }
    if (!isHidden('/calendar')) {
      dataItems.push({ id: 'calendar', title: "Calendar", url: "/calendar", icon: Calendar, priority: 3, isPinned: isPinned('/calendar') });
    }
    if (!isHidden('/tracker-preparation-plan') && (isAdmin || isICT)) {
      dataItems.push({ id: 'tracker-plan', title: "Tracker Preparation", url: "/tracker-preparation-plan", icon: BarChart3, priority: 4, isPinned: isPinned('/tracker-preparation-plan') });
    }
    if (dataItems.length) groups.push({ id: 'reports', label: "Data & Reports", order: 5, items: dataItems });

    const helpItems: MenuGroup['items'] = [];
    if (!isHidden('/documentation')) {
      helpItems.push({ id: 'documentation', title: "Documentation", url: "/documentation", icon: BookOpen, priority: 1, isPinned: isPinned('/documentation') });
    }
    if (helpItems.length) groups.push({ id: 'help', label: "Help & Support", order: 7, items: helpItems });

    const adminItems: MenuGroup['items'] = [];
    if (!isHidden('/users') && (isAdmin || isICT || perms.users)) {
      adminItems.push({ id: 'user-management', title: "User Management", url: "/users", icon: Users, priority: 1, isPinned: isPinned('/users') });
    }
    if (!isHidden('/role-management') && (isAdmin || perms.roleManagement)) {
      adminItems.push({ id: 'role-management', title: "Role Management", url: "/role-management", icon: Shield, priority: 2, isPinned: isPinned('/role-management') });
    }
    if (!isHidden('/super-admin-management') && isSuperAdmin) {
      adminItems.push({ id: 'super-admin', title: "Super Admin", url: "/super-admin-management", icon: ShieldCheck, priority: 3, isPinned: isPinned('/super-admin-management') });
    }
    if (!isHidden('/classifications') && (isAdmin || isFinancialAdmin)) {
      adminItems.push({ id: 'classifications', title: "Classifications", url: "/classifications", icon: Award, priority: 4, isPinned: isPinned('/classifications') });
    }
    if (!isHidden('/classification-fees') && isAdmin) {
      adminItems.push({ id: 'classification-fees', title: "Classification Fees", url: "/classification-fees", icon: DollarSign, priority: 5, isPinned: isPinned('/classification-fees') });
    }
    if (!isHidden('/financial-operations') && perms.financialOperations) {
      adminItems.push({ id: 'financial-ops', title: "Financial Operations", url: "/financial-operations", icon: TrendingUp, priority: 5, isPinned: isPinned('/financial-operations') });
    }
    if (!isHidden('/budget') && (isAdmin || isFinancialAdmin)) {
      adminItems.push({ id: 'budget', title: "Budget", url: "/budget", icon: DollarSign, priority: 6, isPinned: isPinned('/budget') });
    }
    if (!isHidden('/admin/wallets') && (isAdmin || isFinancialAdmin)) {
      adminItems.push({ id: 'wallets', title: "Wallets", url: "/admin/wallets", icon: CreditCard, priority: 7, isPinned: isPinned('/admin/wallets') });
    }
    if (!isHidden('/withdrawal-approval') && (isAdmin || isFinancialAdmin || isSupervisor || isFOM)) {
      adminItems.push({ id: 'withdrawal-approval', title: "Withdrawal Approval", url: "/withdrawal-approval", icon: ClipboardCheck, priority: 8, isPinned: isPinned('/withdrawal-approval') });
    }
    if (!isHidden('/down-payment-approval') && (isAdmin || isFinancialAdmin || isSupervisor)) {
      adminItems.push({ id: 'down-payment-approval', title: "Down-Payment Approval", url: "/down-payment-approval", icon: DollarSign, priority: 8.5, isPinned: isPinned('/down-payment-approval') });
    }
    if (!isHidden('/finance-approval') && (isAdmin || isFinancialAdmin)) {
      adminItems.push({ id: 'finance-approval', title: "Finance Approval", url: "/finance-approval", icon: Banknote, priority: 9, isPinned: isPinned('/finance-approval') });
    }
    if (!isHidden('/settings') && ((isAdmin || perms.settings) && !isDataCollector)) {
      adminItems.push({ id: 'settings', title: "Settings", url: "/settings", icon: Settings, priority: 10, isPinned: isPinned('/settings') });
    }
    if (adminItems.length) groups.push({ id: 'admin', label: "Administration", order: 6, items: adminItems });

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
    const { userSettings } = useSettings();
    
    const { checkPermission, hasAnyRole, canManageRoles } = useAuthorization();
    const isAdmin = hasAnyRole(['admin']);
    const isDataCollector = roles?.includes('DataCollector' as AppRole) || 
                            roles?.includes('dataCollector' as AppRole) || 
                            currentUser?.role?.toLowerCase() === 'datacollector' ||
                            currentUser?.role?.toLowerCase() === 'data collector';

    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

    const menuPrefs: MenuPreferences = useMemo(() => {
      const savedPrefs = userSettings?.settings?.menuPreferences;
      return savedPrefs ? { ...DEFAULT_MENU_PREFERENCES, ...savedPrefs } : DEFAULT_MENU_PREFERENCES;
    }, [userSettings?.settings?.menuPreferences]);

    const perms = {
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

    const menuGroups = currentUser ? getWorkflowMenuGroups(roles || [], currentUser.role, perms, isSuperAdmin, menuPrefs) : [];

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
      if (isSuperAdmin) return "Super Admin";
      if (roles && roles.length > 0) {
        if (roles.includes("admin" as AppRole)) return "Admin";
        const roleMap: Record<string, string> = {
          admin: "Admin",
          ict: "ICT",
          fom: "Field Ops Manager",
          financialAdmin: "Financial Admin",
          supervisor: "Supervisor",
          coordinator: "Coordinator",
          dataCollector: "Data Collector",
        };
        return roleMap[roles[0]] || roles[0].charAt(0).toUpperCase() + roles[0].slice(1);
      }
      return currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
    };

    const handleLogout = () => {
      showDueReminders();
      setTimeout(async () => {
        await logout();
        navigate('/auth');
      }, 1500);
    };

    return (
      <Sidebar collapsible="icon" className="border-r bg-white dark:bg-gray-900">
        <SidebarHeader className="border-b py-0.5">
          <div className="flex h-6 items-center gap-1 px-1">
            <img src={Logo} alt="PACT Logo" className="h-5 w-5 shrink-0 object-contain" />
            <SidebarTrigger className="ml-auto h-5 w-5" data-testid="button-sidebar-trigger" />
          </div>
        </SidebarHeader>

        <SidebarContent className="px-0.5 py-0.5">
          {menuGroups.map((group, index) => {
            const isCollapsed = collapsedGroups.has(group.id);
            
            return (
              <Collapsible key={group.id} open={!isCollapsed} className="">
                <SidebarGroup className="py-0">
                  <CollapsibleTrigger asChild>
                    <SidebarGroupLabel 
                      className="px-1.5 py-1 h-8 text-[17px] uppercase tracking-wide font-semibold text-blue-600 dark:text-blue-300 cursor-pointer flex items-center justify-between hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                      onClick={() => toggleGroupCollapse(group.id)}
                      data-testid={`group-label-${group.id}`}
                    >
                      <span>{group.label}</span>
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                    </SidebarGroupLabel>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarGroupContent>
                      <SidebarMenu className="space-y-1 mt-0.5">
                        {group.items.map((item) => (
                          <SidebarMenuItem key={item.id}>
                            <SidebarMenuButton
                              asChild
                              isActive={pathname === item.url}
                              tooltip={item.title}
                              className={`h-10 px-1.5 rounded text-[19px] font-medium transition-all duration-200 
                                ${
                                  pathname === item.url
                                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 font-semibold"
                                    : "hover:bg-blue-50 dark:hover:bg-blue-800"
                                }`}
                            >
                              <Link to={item.url} className="flex items-center gap-1.5" data-testid={`nav-link-${item.id}`}>
                                <item.icon
                                  className={`h-5 w-5 ${
                                    pathname === item.url
                                      ? "text-blue-700 dark:text-blue-300"
                                      : "text-blue-600 dark:text-blue-400"
                                  }`}
                                />
                                <span className="truncate flex-1">{item.title}</span>
                                {item.isPinned && (
                                  <Pin className="h-2 w-2 text-amber-500" />
                                )}
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </CollapsibleContent>
                </SidebarGroup>
              </Collapsible>
            );
          })}
        </SidebarContent>

        <SidebarFooter className="border-t p-0.5">
          {currentUser && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-1.5 px-1 py-0.5 h-auto hover:bg-blue-50 dark:hover:bg-gray-800"
                  data-testid="button-user-menu"
                >
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={currentUser.avatar} alt={currentUser.name} />
                    <AvatarFallback className="bg-blue-600 text-white text-[8px]">
                      {getInitials(currentUser.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start text-left text-[18px] leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{currentUser.name}</span>
                    <span className="text-[17px] text-gray-500 dark:text-gray-400">{getPrimaryRole()}</span>
                  </div>
                  <ChevronUp className="ml-auto h-2.5 w-2.5 text-muted-foreground group-data-[collapsible=icon]:hidden" />
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