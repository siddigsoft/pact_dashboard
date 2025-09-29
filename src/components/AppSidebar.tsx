
import { useLocation, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  Home, 
  Users, 
  Settings, 
  FileText, 
  Map, 
  Phone, 
  MessageSquare, 
  FolderKanban, 
  BarChart3, 
  ArrowLeftRight,
  Wallet,
  UserCheck,
  MapPin,
  Archive,
  Menu,
  X,
  ChevronDown,
  ChevronUp,
  Gauge,
  ClipboardList,
  DollarSign,
  Activity,
  Link2,
  Calendar,
  Database,
  LogOut
} from "lucide-react";
import { useViewMode } from "@/context/ViewModeContext";
import { useSiteVisitReminders } from "@/hooks/use-site-visit-reminders";
import Logo from "../assets/logo.svg";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useAppContext } from "@/context/AppContext";
import { useState } from "react";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
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
  SidebarTrigger 
} from "@/components/ui/sidebar";
import { AppRole } from "@/types";

const getMenuItems = (roles: AppRole[] = [], defaultRole: string = 'dataCollector') => {
  // Debug roles
  console.log("AppSidebar: roles array:", roles);
  console.log("AppSidebar: defaultRole:", defaultRole);
  
  // Check if user has admin role (check both arrays and string role)
  const isAdmin = roles.includes('admin' as AppRole) || defaultRole === 'admin';
  const isICT = roles.includes('ict' as AppRole) || defaultRole === 'ict';
  const isFOM = roles.includes('fom' as AppRole) || defaultRole === 'fom';
  const isFinancialAdmin = roles.includes('financialAdmin' as AppRole) || defaultRole === 'financialAdmin';
  const isSupervisor = roles.includes('supervisor' as AppRole) || defaultRole === 'supervisor';
  
  // Log role checks for debugging
  console.log("AppSidebar role checks:", { isAdmin, isICT, isFOM, isFinancialAdmin, isSupervisor });
  
  const mmpManagement = {
    title: "MMP Management",
    url: "/mmp",
    icon: Database,
  };

  const projectManagement = {
    title: "Projects",
    url: "/projects",
    icon: FolderKanban,
  };

  const common = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: Home,
    },
    projectManagement,
    mmpManagement,
    {
      title: "Site Visits",
      url: "/site-visits",
      icon: ClipboardList,
    },
    {
      title: "Field Team",
      url: "/field-team",
      icon: Activity,
    },
    // {
    //   title: "Archive",
    //   url: "/archive",
    //   icon: Archive,
    // },
  ];

  const financialData = [
    // {
    //   title: "Finance",
    //   url: "/finance",
    //   icon: DollarSign,
    // },
    {
      title: "Data Visibility",
      url: "/data-visibility",
      icon: Link2,
    },
    // {
    //   title: "Wallet",
    //   url: "/wallet",
    //   icon: Wallet,
    // },
  ];

  const management = [
    {
      title: "User Management",
      url: "/users",
      icon: Users,
    },
    // {
    //   title: "Reports",
    //   url: "/reports",
    //   icon: Calendar,
    // },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings,
    }
  ];

  if (isAdmin || isICT) {
    return [...common, ...financialData, ...management];
  }
  
  if (isFOM) {
    return [...common, ...financialData, ...management.filter(item => item.title !== "User Management")];
  }
  
  if (isFinancialAdmin) {
    return [...common.filter(item => !item.url.includes("field-team")), ...financialData, ...management.filter(item => item.title !== "User Management")];
  }
  
  if (isSupervisor) {
    return [...common, {title: "Settings", url: "/settings", icon: Settings}];
  }
  
  return [...common, {title: "Settings", url: "/settings", icon: Settings}];
};

const AppSidebar = () => {
  const { pathname } = useLocation();
  const { currentUser, logout, roles } = useAppContext();
  const { showDueReminders } = useSiteVisitReminders();
  const { viewMode } = useViewMode();
  
  // Log roles information for debugging
  console.log("AppSidebar - Current User:", currentUser);
  console.log("AppSidebar - Roles Array:", roles);
  
  // Use both roles array and role property for menu generation
  const menuItems = currentUser ? getMenuItems(roles || [], currentUser.role) : [];

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };
  
  // Get the primary role to display in the sidebar
  const getPrimaryRole = (): string => {
    if (!currentUser) return '';
    
    // If roles array exists and has items, prioritize admin or use the first role
    if (roles && roles.length > 0) {
      if (roles.includes('admin' as AppRole)) return 'Admin';
      return roles[0].charAt(0).toUpperCase() + roles[0].slice(1);
    }
    
    // Fallback to the role property
    return currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
  };
  
  const handleLogout = () => {
    showDueReminders();
    setTimeout(() => {
      logout();
    }, 1500);
  };

  return (
    <Sidebar>
      <SidebarHeader className="flex items-center p-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
            <span className="text-white font-bold text-sm">TPM</span>
          </div>
          <span className="font-bold text-lg">PACT Consultancy</span>
        </div>
        <SidebarTrigger className="ml-auto"/>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={pathname === item.url}
                    tooltip={item.title}
                  >
                    <Link to={item.url}>
                      <item.icon className="h-5 w-5" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-4">
        <div className="text-xs text-gray-500 mb-2">
          PACT Consultancy v1.0
        </div>
        {currentUser && (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={currentUser.avatar} alt={currentUser.name} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {getInitials(currentUser.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="font-medium text-sm truncate max-w-[120px]">
                  {currentUser.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {getPrimaryRole()}
                </span>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-muted-foreground hover:text-destructive"
              onClick={handleLogout}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
};

export default AppSidebar;
