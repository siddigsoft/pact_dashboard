
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
  LogOut,
  LayoutDashboard,
  Building2
} from "lucide-react";
import { useViewMode } from "@/context/ViewModeContext";
import { useSiteVisitReminders } from "@/hooks/use-site-visit-reminders";
import Logo from "../assets/logo.png";
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
  SidebarTrigger,
  SidebarRail,
  SidebarSeparator
} from "@/components/ui/sidebar";
import { AppRole } from "@/types";
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

const getMenuGroups = (roles: AppRole[] = [], defaultRole: string = 'dataCollector'): MenuGroup[] => {
  // Check if user has admin role (check both arrays and string role)
  const isAdmin = roles.includes('admin' as AppRole) || defaultRole === 'admin';
  const isICT = roles.includes('ict' as AppRole) || defaultRole === 'ict';
  const isFOM = roles.includes('fom' as AppRole) || defaultRole === 'fom';
  const isFinancialAdmin = roles.includes('financialAdmin' as AppRole) || defaultRole === 'financialAdmin';
  const isSupervisor = roles.includes('supervisor' as AppRole) || defaultRole === 'supervisor';
  
  const mainItems = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboard,
    },
  ];

  const projectItems = [
    {
      title: "Projects",
      url: "/projects",
      icon: FolderKanban,
    },
    {
      title: "MMP Management",
      url: "/mmp",
      icon: Database,
    },
    {
      title: "Site Visits",
      url: "/site-visits",
      icon: ClipboardList,
    },
  ];

  const teamItems = [
    {
      title: "Field Team",
      url: "/field-team",
      icon: Activity,
    },
  ];

  const dataItems = [
    {
      title: "Data Visibility",
      url: "/data-visibility",
      icon: Link2,
    },
  ];

  const adminItems = [
    {
      title: "User Management",
      url: "/users",
      icon: Users,
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings,
    }
  ];

  const settingsOnly = [
    {
      title: "Settings",
      url: "/settings",
      icon: Settings,
    }
  ];

  // Build menu groups based on role
  const groups: MenuGroup[] = [
    { label: "Overview", items: mainItems },
    { label: "Projects", items: projectItems },
  ];

  // Add team section for roles that can see it
  if (!isFinancialAdmin) {
    groups.push({ label: "Team", items: teamItems });
  }

  // Add data section for elevated roles
  if (isAdmin || isICT || isFOM || isFinancialAdmin) {
    groups.push({ label: "Data & Reports", items: dataItems });
  }

  // Add admin section
  if (isAdmin || isICT) {
    groups.push({ label: "Administration", items: adminItems });
  } else if (isFOM || isFinancialAdmin) {
    groups.push({ label: "Administration", items: settingsOnly });
  } else {
    groups.push({ label: "Administration", items: settingsOnly });
  }

  return groups;
};

const AppSidebar = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { currentUser, logout, roles } = useAppContext();
  const { showDueReminders } = useSiteVisitReminders();
  
  // Use both roles array and role property for menu generation
  const menuGroups = currentUser ? getMenuGroups(roles || [], currentUser.role) : [];

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
      const roleMap: Record<string, string> = {
        'admin': 'Admin',
        'ict': 'ICT',
        'fom': 'Field Operations Manager',
        'financialAdmin': 'Financial Admin',
        'supervisor': 'Supervisor',
        'dataCollector': 'Data Collector'
      };
      return roleMap[roles[0]] || roles[0].charAt(0).toUpperCase() + roles[0].slice(1);
    }
    
    // Fallback to the role property
    return currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
  };
  
  const handleLogout = async () => {
    showDueReminders();
    setTimeout(async () => {
      await logout();
      navigate('/auth');
    }, 1500);
  };

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b">
        <div className="flex h-16 items-center gap-3 px-4">
          <img 
            src={Logo} 
            alt="PACT Logo" 
            className="h-20 w-20 shrink-0 object-contain"
          />
          <SidebarTrigger className="ml-auto" />
        </div>
      </SidebarHeader>
      
      <SidebarContent className="px-2">
        {menuGroups.map((group, index) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="px-2 text-xs font-semibold text-sidebar-foreground/70">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={pathname === item.url}
                      tooltip={item.title}
                      className="h-10"
                    >
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      
      <SidebarFooter className="border-t p-2">
        {currentUser && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                className="w-full justify-start gap-2 px-2 h-12 hover:bg-sidebar-accent"
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={currentUser.avatar} alt={currentUser.name} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {getInitials(currentUser.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-1 flex-col items-start text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-semibold">{currentUser.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{getPrimaryRole()}</span>
                </div>
                <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              side="top" 
              align="end" 
              className="w-56"
            >
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{currentUser.name}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {currentUser.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings" className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={handleLogout}
                className="cursor-pointer text-destructive focus:text-destructive"
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
