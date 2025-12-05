import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home, Map, FileText, Users, MessageSquare, Receipt,
  DollarSign, Wallet, BarChart, Calendar, Settings,
  Archive, FolderOpen, CheckCircle, Banknote, CreditCard,
  TrendingUp, MapPin, Bell, Search, User, X,
  LogOut, Shield, ClipboardList, ChevronRight, Building2,
  FileCheck, UserCog, PenTool, HelpCircle, Phone, Eye,
  Globe, Lock, Database, Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { useUser } from '@/context/user/UserContext';
import { AppRole } from '@/types';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MobileMoreMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MenuItem {
  id: string;
  icon: React.ElementType;
  label: string;
  path: string;
  description?: string;
  roles?: AppRole[];
}

interface MenuSection {
  id: string;
  title: string;
  items: MenuItem[];
  roles?: AppRole[];
}

const allRoles: AppRole[] = [
  'SuperAdmin', 'Admin', 'ICT', 'Field Operation Manager (FOM)', 
  'FinancialAdmin', 'ProjectManager', 'SeniorOperationsLead', 
  'Supervisor', 'Coordinator', 'DataCollector', 'Reviewer'
];

const menuSections: MenuSection[] = [
  {
    id: 'core',
    title: 'Core Features',
    items: [
      { id: 'dashboard', icon: Home, label: 'Dashboard', path: '/dashboard', description: 'Overview and stats' },
      { id: 'site-visits', icon: MapPin, label: 'Site Visits', path: '/site-visits', description: 'Manage field visits' },
      { id: 'field-team', icon: Map, label: 'Field Team Map', path: '/field-team', description: 'Live team locations' },
      { id: 'chat', icon: MessageSquare, label: 'Team Chat', path: '/chat', description: 'Messages and calls' },
      { id: 'notifications', icon: Bell, label: 'Notifications', path: '/notifications', description: 'All alerts' },
      { id: 'search', icon: Search, label: 'Global Search', path: '/search', description: 'Find anything' },
    ]
  },
  {
    id: 'documents',
    title: 'Documents',
    items: [
      { id: 'mmp', icon: FileText, label: 'MMP Files', path: '/mmp', description: 'Monitoring plans' },
      { id: 'projects', icon: FolderOpen, label: 'Projects', path: '/projects', description: 'Project management',
        roles: ['SuperAdmin', 'Admin', 'ICT', 'Field Operation Manager (FOM)', 'ProjectManager', 'SeniorOperationsLead', 'Supervisor'] },
      { id: 'archive', icon: Archive, label: 'Archive', path: '/archive', description: 'Archived items', 
        roles: ['SuperAdmin', 'Admin', 'ICT', 'Field Operation Manager (FOM)', 'Supervisor'] },
    ]
  },
  {
    id: 'finance',
    title: 'Finance & Wallet',
    items: [
      { id: 'wallet', icon: Wallet, label: 'My Wallet', path: '/wallet', description: 'Balance and transactions' },
      { id: 'cost-submission', icon: Receipt, label: 'Submit Costs', path: '/cost-submission', description: 'Expense submissions',
        roles: ['SuperAdmin', 'Admin', 'DataCollector', 'Coordinator', 'Supervisor'] },
      { id: 'finance', icon: DollarSign, label: 'Finance Overview', path: '/finance', description: 'Financial dashboard',
        roles: ['SuperAdmin', 'Admin', 'FinancialAdmin', 'Field Operation Manager (FOM)', 'ProjectManager', 'SeniorOperationsLead'] },
      { id: 'financial-ops', icon: TrendingUp, label: 'Financial Operations', path: '/financial-operations', description: 'Advanced finance',
        roles: ['SuperAdmin', 'Admin', 'FinancialAdmin', 'Field Operation Manager (FOM)'] },
      { id: 'budget', icon: Banknote, label: 'Budget', path: '/budget', description: 'Budget tracking',
        roles: ['SuperAdmin', 'Admin', 'FinancialAdmin', 'Field Operation Manager (FOM)', 'ProjectManager', 'SeniorOperationsLead'] },
      { id: 'admin-wallets', icon: CreditCard, label: 'Admin Wallets', path: '/admin/wallets', description: 'Manage all wallets',
        roles: ['SuperAdmin', 'Admin', 'FinancialAdmin'] },
    ]
  },
  {
    id: 'approvals',
    title: 'Approvals',
    roles: ['SuperAdmin', 'Admin', 'FinancialAdmin', 'Field Operation Manager (FOM)', 'Supervisor', 'ProjectManager', 'SeniorOperationsLead'],
    items: [
      { id: 'withdrawal-approval', icon: CheckCircle, label: 'Supervisor Approval', path: '/withdrawal-approval', description: 'Approve withdrawals',
        roles: ['SuperAdmin', 'Admin', 'FinancialAdmin', 'Field Operation Manager (FOM)', 'Supervisor', 'ProjectManager', 'SeniorOperationsLead'] },
      { id: 'finance-approval', icon: CreditCard, label: 'Finance Approval', path: '/finance-approval', description: 'Financial approvals',
        roles: ['SuperAdmin', 'Admin', 'FinancialAdmin'] },
      { id: 'down-payment', icon: Banknote, label: 'Down Payment Approval', path: '/down-payment-approval', description: 'Down payment requests',
        roles: ['SuperAdmin', 'Admin', 'FinancialAdmin', 'Field Operation Manager (FOM)', 'SeniorOperationsLead'] },
    ]
  },
  {
    id: 'team',
    title: 'Team Management',
    roles: ['SuperAdmin', 'Admin', 'ICT', 'Field Operation Manager (FOM)', 'ProjectManager', 'SeniorOperationsLead', 'Supervisor'],
    items: [
      { id: 'users', icon: Users, label: 'Team Members', path: '/users', description: 'View team' },
      { id: 'role-management', icon: UserCog, label: 'Role Management', path: '/role-management', description: 'Manage roles',
        roles: ['SuperAdmin', 'Admin', 'ICT'] },
      { id: 'hub-operations', icon: Building2, label: 'Hub Operations', path: '/hub-operations', description: 'Hub management',
        roles: ['SuperAdmin', 'Admin', 'Field Operation Manager (FOM)'] },
      { id: 'data-visibility', icon: Eye, label: 'Data Visibility', path: '/data-visibility', description: 'Access controls',
        roles: ['SuperAdmin', 'Admin'] },
    ]
  },
  {
    id: 'reports',
    title: 'Reports & Analytics',
    roles: ['SuperAdmin', 'Admin', 'ICT', 'FinancialAdmin', 'Field Operation Manager (FOM)', 'ProjectManager', 'SeniorOperationsLead', 'Supervisor', 'Reviewer'],
    items: [
      { id: 'reports', icon: BarChart, label: 'Reports', path: '/reports', description: 'Analytics dashboard' },
      { id: 'wallet-reports', icon: ClipboardList, label: 'Wallet Reports', path: '/wallet-reports', description: 'Financial reports',
        roles: ['SuperAdmin', 'Admin', 'FinancialAdmin'] },
      { id: 'tracker-plan', icon: FileCheck, label: 'Tracker Plan', path: '/tracker-preparation-plan', description: 'Preparation tracking',
        roles: ['SuperAdmin', 'Admin', 'Field Operation Manager (FOM)', 'Coordinator', 'ProjectManager'] },
      { id: 'login-analytics', icon: Activity, label: 'Login Analytics', path: '/login-analytics', description: 'User activity',
        roles: ['SuperAdmin', 'Admin', 'ICT'] },
    ]
  },
  {
    id: 'tools',
    title: 'Tools',
    items: [
      { id: 'calendar', icon: Calendar, label: 'Calendar', path: '/calendar', description: 'Schedule' },
      { id: 'signatures', icon: PenTool, label: 'Signatures', path: '/signatures', description: 'Digital signatures' },
      { id: 'calls', icon: Phone, label: 'Calls', path: '/calls', description: 'Call history' },
      { id: 'advanced-map', icon: Globe, label: 'Advanced Map', path: '/advanced-map', description: 'Full-screen map' },
    ]
  },
  {
    id: 'admin',
    title: 'Administration',
    roles: ['SuperAdmin', 'Admin', 'ICT'],
    items: [
      { id: 'classifications', icon: Database, label: 'Classifications', path: '/classifications', description: 'Data classifications',
        roles: ['SuperAdmin', 'Admin'] },
      { id: 'audit', icon: Shield, label: 'Audit & Compliance', path: '/audit-compliance', description: 'System audit',
        roles: ['SuperAdmin', 'Admin'] },
    ]
  },
  {
    id: 'settings',
    title: 'Settings',
    items: [
      { id: 'settings', icon: Settings, label: 'Settings', path: '/settings', description: 'App settings' },
      { id: 'documentation', icon: HelpCircle, label: 'Help & Docs', path: '/documentation', description: 'User guide' },
    ]
  },
];

export function MobileMoreMenu({ isOpen, onClose }: MobileMoreMenuProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, roles, hasRole, logout } = useUser();

  const handleNavigate = (path: string) => {
    hapticPresets.buttonPress();
    navigate(path);
    onClose();
  };

  const handleLogout = async () => {
    hapticPresets.buttonPress();
    await logout();
    onClose();
    navigate('/login');
  };

  const isItemVisible = (item: MenuItem): boolean => {
    if (!item.roles || item.roles.length === 0) return true;
    return item.roles.some(role => hasRole(role as AppRole));
  };

  const isSectionVisible = (section: MenuSection): boolean => {
    if (!section.roles || section.roles.length === 0) return true;
    return section.roles.some(role => hasRole(role as AppRole));
  };

  const getVisibleItems = (section: MenuSection): MenuItem[] => {
    return section.items.filter(isItemVisible);
  };

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const getRoleDisplayName = (): string => {
    if (roles.length === 0) return 'No role assigned';
    const role = roles[0];
    if (role === 'Field Operation Manager (FOM)') return 'FOM';
    if (role === 'SeniorOperationsLead') return 'Senior Ops Lead';
    return role;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50"
            onClick={onClose}
            data-testid="overlay-menu-backdrop"
            aria-label="Close menu"
          />
          
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-[85%] max-w-sm bg-white dark:bg-black z-50 shadow-xl"
            data-testid="drawer-mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <div className="flex flex-col h-full safe-area-top safe-area-bottom">
              <div className="flex items-center justify-between p-4 border-b border-black/10 dark:border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-black dark:bg-white flex items-center justify-center">
                    <User className="w-5 h-5 text-white dark:text-black" />
                  </div>
                  <div>
                    <p 
                      className="font-semibold text-black dark:text-white text-sm"
                      data-testid="text-user-name"
                    >
                      {currentUser?.name || 'User'}
                    </p>
                    <p 
                      className="text-xs text-black/50 dark:text-white/50"
                      data-testid="text-user-role"
                    >
                      {getRoleDisplayName()}
                    </p>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onClose}
                  className="rounded-full"
                  data-testid="button-close-menu"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-4 space-y-6">
                  {menuSections.map((section) => {
                    if (!isSectionVisible(section)) return null;
                    const visibleItems = getVisibleItems(section);
                    if (visibleItems.length === 0) return null;

                    return (
                      <div key={section.id} data-testid={`section-${section.id}`}>
                        <h3 className="text-xs font-semibold text-black/40 dark:text-white/40 uppercase tracking-wider mb-2 px-1">
                          {section.title}
                        </h3>
                        <div className="space-y-1">
                          {visibleItems.map((item) => {
                            const Icon = item.icon;
                            const active = isActive(item.path);

                            return (
                              <button
                                key={item.id}
                                onClick={() => handleNavigate(item.path)}
                                className={cn(
                                  "w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all",
                                  active
                                    ? "bg-black dark:bg-white text-white dark:text-black"
                                    : "text-black dark:text-white active:bg-black/10 dark:active:bg-white/10"
                                )}
                                data-testid={`menu-item-${item.id}`}
                                aria-label={`Navigate to ${item.label}`}
                                aria-current={active ? 'page' : undefined}
                              >
                                <div className={cn(
                                  "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0",
                                  active
                                    ? "bg-white/20 dark:bg-black/20"
                                    : "bg-black/5 dark:bg-white/5"
                                )}>
                                  <Icon className="w-4 h-4" />
                                </div>
                                <div className="flex-1 text-left">
                                  <p className="font-medium text-sm">{item.label}</p>
                                  {item.description && (
                                    <p className={cn(
                                      "text-xs",
                                      active ? "text-white/70 dark:text-black/70" : "text-black/50 dark:text-white/50"
                                    )}>
                                      {item.description}
                                    </p>
                                  )}
                                </div>
                                <ChevronRight className={cn(
                                  "w-4 h-4 flex-shrink-0",
                                  active ? "text-white/50 dark:text-black/50" : "text-black/30 dark:text-white/30"
                                )} />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              <div className="p-4 border-t border-black/10 dark:border-white/10">
                <Button
                  variant="outline"
                  onClick={handleLogout}
                  className="w-full h-12 rounded-full !border-black/20 dark:!border-white/20 !text-black dark:!text-white font-medium gap-2 !bg-transparent"
                  data-testid="button-logout"
                  aria-label="Sign out of your account"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
