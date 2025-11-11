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
  Calendar,
  Archive
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
  SidebarRail
} from "@/components/ui/sidebar";
import { AppRole } from "@/types";
import { useAuthorization } from "@/hooks/use-authorization";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MenuGroup {
  label: string;
  items: Array<{
    title: string;
    url: string;
    icon: any;
  }>;
}

const getMenuGroups = (
  roles: AppRole[] = [], 
  defaultRole: string = 'dataCollector',
  perms: Record<string, boolean> = {}
): MenuGroup[] => {
  const isAdmin = roles.includes('admin' as AppRole) || defaultRole === 'admin';
  const isICT = roles.includes('ict' as AppRole) || defaultRole === 'ict';
  // Build items per permission, allowing admin bypass
  const mainItems = [] as MenuGroup['items'];
  if (isAdmin || isICT || perms.dashboard) mainItems.push({ title: "Dashboard", url: "/dashboard", icon: LayoutDashboard });

  const projectItems = [] as MenuGroup['items'];
  if (isAdmin || isICT || perms.projects) projectItems.push({ title: "Projects", url: "/projects", icon: FolderKanban });
  if (isAdmin || isICT || perms.mmp) projectItems.push({ title: "MMP Management", url: "/mmp", icon: Database });
  if (isAdmin || isICT || perms.siteVisits) projectItems.push({ title: "Site Visits", url: "/site-visits", icon: ClipboardList });
  if (isAdmin || perms.fieldOpManager) projectItems.push({ title: "Field Operation Manager", url: "/field-operation-manager", icon: ClipboardList });
  if (isAdmin || perms.archive) projectItems.push({ title: "Archive", url: "/archive", icon: Archive });

  // ICT should NOT have access to Team or Data & Reports
  const teamItems = [] as MenuGroup['items'];
  if ((isAdmin || perms.fieldTeam) && !isICT) teamItems.push({ title: "Field Team", url: "/field-team", icon: Activity });

  const dataItems = [] as MenuGroup['items'];
  if ((isAdmin || perms.dataVisibility) && !isICT) dataItems.push({ title: "Data Visibility", url: "/data-visibility", icon: Link2 });
  if ((isAdmin || perms.reports) && !isICT) dataItems.push({ title: "Reports", url: "/reports", icon: Calendar });

  const adminItems = [] as MenuGroup['items'];
  if (isAdmin || isICT || perms.users) adminItems.push({ title: "User Management", url: "/users", icon: Users });
  if (isAdmin || perms.roleManagement) adminItems.push({ title: "Role Management", url: "/role-management", icon: Shield });
  if (isAdmin || perms.settings) adminItems.push({ title: "Settings", url: "/settings", icon: Settings });

  // Compose groups only if they have items
  const groups: MenuGroup[] = [];
  if (mainItems.length) groups.push({ label: "Overview", items: mainItems });
  if (projectItems.length) groups.push({ label: "Projects", items: projectItems });
  if (teamItems.length) groups.push({ label: "Team", items: teamItems });
  if (dataItems.length) groups.push({ label: "Data & Reports", items: dataItems });
  if (adminItems.length) groups.push({ label: "Administration", items: adminItems });

  return groups;
};

const AppSidebar = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { currentUser, logout, roles } = useAppContext();
  const { showDueReminders } = useSiteVisitReminders();
  
  const { checkPermission, hasAnyRole, canManageRoles } = useAuthorization();
  const isAdmin = hasAnyRole(['admin']);
  const perms = {
    dashboard: true,
    projects: checkPermission('projects', 'read') || isAdmin || hasAnyRole(['ict']),
    mmp: checkPermission('mmp', 'read') || isAdmin || hasAnyRole(['ict']),
    monitoringPlan: checkPermission('mmp', 'read') || isAdmin || hasAnyRole(['ict']),
    siteVisits: checkPermission('site_visits', 'read') || isAdmin || hasAnyRole(['ict']),
    archive: checkPermission('reports', 'read') || isAdmin,
    fieldTeam: checkPermission('users', 'read') || isAdmin,
    dataVisibility: checkPermission('reports', 'read') || isAdmin,
    reports: checkPermission('reports', 'read') || isAdmin,
    users: checkPermission('users', 'read') || isAdmin || hasAnyRole(['ict']),
    roleManagement: canManageRoles() || isAdmin,
    settings: checkPermission('settings', 'read') || isAdmin,
  };
  const menuGroups = currentUser ? getMenuGroups(roles || [], currentUser.role, perms) : [];

  const getInitials = (name: string) =>
    name.split(" ").map((part) => part[0]).join("").toUpperCase().substring(0, 2);

  const getPrimaryRole = (): string => {
    if (!currentUser) return "";
    if (roles && roles.length > 0) {
      if (roles.includes("admin" as AppRole)) return "Admin";
      const roleMap: Record<string, string> = {
        admin: "Admin",
        ict: "ICT",
        fom: "Field Ops Manager",
        financialAdmin: "Financial Admin",
        supervisor: "Supervisor",
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
      {/* Header */}
      <SidebarHeader className="border-b">
        <div className="flex h-16 items-center gap-3 px-4">
          <img src={Logo} alt="PACT Logo" className="h-14 w-14 shrink-0 object-contain" />
          <SidebarTrigger className="ml-auto" />
        </div>
      </SidebarHeader>

      {/* Content */}
      <SidebarContent className="px-3 py-4">
        {menuGroups.map((group, index) => (
          <SidebarGroup key={group.label} className={index > 0 ? "mt-1" : ""}>
            <SidebarGroupLabel className="px-2 text-[11px] uppercase tracking-wide font-semibold text-blue-600 dark:text-blue-300">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.url}
                      tooltip={item.title}
                      className={`h-7 px-3 rounded-lg text-sm font-medium transition-all duration-200 
                        ${
                          pathname === item.url
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 font-semibold"
                            : "hover:bg-blue-50 dark:hover:bg-blue-800"
                        }`}
                    >
                      <Link to={item.url} className="flex items-center gap-3">
                        <item.icon
                          className={`h-5 w-5 ${
                            pathname === item.url
                              ? "text-blue-700 dark:text-blue-300"
                              : "text-blue-600 dark:text-blue-400"
                          }`}
                        />
                        <span className="truncate">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="border-t p-3">
        {currentUser && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 px-2 py-2 hover:bg-blue-50 dark:hover:bg-gray-800"
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={currentUser.avatar} alt={currentUser.name} />
                  <AvatarFallback className="bg-blue-600 text-white text-xs">
                    {getInitials(currentUser.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{currentUser.name}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{getPrimaryRole()}</span>
                </div>
                <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{currentUser.name}</p>
                  <p className="text-xs text-muted-foreground">{currentUser.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-red-600 dark:text-red-500 cursor-pointer"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
};

export default AppSidebar;
