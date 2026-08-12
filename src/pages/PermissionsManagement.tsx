import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Shield,
  ShieldCheck,
  User,
  Users,
  Save,
  RefreshCw,
  Search,
  Eye,
  Lock,
  Unlock,
  Check,
  X,
  AlertTriangle,
  LayoutDashboard,
  ChevronDown,
  ChevronRight,
  Layers,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PAGE_DEFS, hasDefaultAccess } from '@/pages/PageAccessControl';

// ── Permission interfaces ─────────────────────────────────────────────────────

interface TabPermission {
  tabId: string;
  tabName: string;
  tabNameAr: string;
  permissions: {
    read: boolean;
    write: boolean;
    open: boolean;
    create: boolean;
    delete: boolean;
  };
}

interface ScreenPermission {
  screenId: string;
  screenName: string;
  screenNameAr: string;
  path: string;
  category: string;
  permissions: {
    read: boolean;
    write: boolean;
    open: boolean;
    create: boolean;
    delete: boolean;
  };
  isVisible: boolean;
  tabs?: TabPermission[];
}

interface UserScreenPermissions {
  userId: string;
  screens: ScreenPermission[];
  updatedAt?: string;
  updatedBy?: string;
}

interface SystemScreen {
  screenId: string;
  screenName: string;
  screenNameAr: string;
  path: string;
  icon: any;
  category: string;
  tabs?: { tabId: string; tabName: string; tabNameAr: string }[];
}

// ── Category mapping (PAGE_DEFS group → local category) ──────────────────────

const GROUP_TO_CATEGORY: Record<string, string> = {
  'My Workspace':        'Overview',
  'Communication':       'Communication',
  'Programme Management':'Planning',
  'Field Operations':    'Field Operations',
  'Coordination':        'Field Operations',
  'Finance':             'Finance',
  'Accounting':          'Finance',
  'HR & People':         'HR & People',
  'CRM':                 'Administration',
  'Analytics':           'Data & Reports',
  'Administration':      'Administration',
  'Super Admin':         'Super Admin',
  'Audit & Security':    'Super Admin',
  'Surveys':             'Data & Reports',
};

export const CATEGORIES = [
  'Overview',
  'Communication',
  'Planning',
  'Field Operations',
  'Data & Reports',
  'Finance',
  'HR & People',
  'Administration',
  'Super Admin',
];

// ── Legacy tab definitions keyed by path ─────────────────────────────────────
// Preserve tab metadata for pages that had them in the old hardcoded list.

const LEGACY_TABS_BY_PATH: Record<string, { tabId: string; tabName: string; tabNameAr: string }[]> = {
  '/wallet': [
    { tabId: 'wallet-all',     tabName: 'All Transactions', tabNameAr: 'كل المعاملات' },
    { tabId: 'wallet-pending', tabName: 'Pending',          tabNameAr: 'قيد الانتظار' },
    { tabId: 'wallet-approved',tabName: 'Approved',         tabNameAr: 'موافق عليها' },
    { tabId: 'wallet-rejected',tabName: 'Rejected',         tabNameAr: 'مرفوضة' },
  ],
  '/cost-submission/reports': [
    { tabId: 'csr-outstanding', tabName: 'Outstanding Advances', tabNameAr: 'السلف المعلقة' },
  ],
  '/mmp': [
    { tabId: 'mmp-enumerator', tabName: 'Enumerator View', tabNameAr: 'عرض الباحث' },
    { tabId: 'mmp-new',        tabName: 'New MMPs',        tabNameAr: 'خطط جديدة' },
    { tabId: 'mmp-forwarded',  tabName: 'Forwarded',       tabNameAr: 'محالة' },
    { tabId: 'mmp-approved',   tabName: 'Approved',        tabNameAr: 'موافق عليها' },
    { tabId: 'mmp-dispatched', tabName: 'Dispatched',      tabNameAr: 'مرسلة' },
    { tabId: 'mmp-completed',  tabName: 'Completed',       tabNameAr: 'مكتملة' },
    { tabId: 'mmp-archived',   tabName: 'Archived',        tabNameAr: 'مؤرشفة' },
  ],
  '/hub-operations': [
    { tabId: 'hubops-overview', tabName: 'Overview', tabNameAr: 'نظرة عامة' },
    { tabId: 'hubops-hubs',     tabName: 'Hubs',     tabNameAr: 'المحاور' },
    { tabId: 'hubops-states',   tabName: 'States',   tabNameAr: 'الولايات' },
    { tabId: 'hubops-sites',    tabName: 'Sites',    tabNameAr: 'المواقع' },
  ],
  '/hub-management': [
    { tabId: 'hubmgmt-hubs',       tabName: 'Hubs',       tabNameAr: 'المحاور' },
    { tabId: 'hubmgmt-states',     tabName: 'States',     tabNameAr: 'الولايات' },
    { tabId: 'hubmgmt-localities', tabName: 'Localities', tabNameAr: 'المحليات' },
  ],
  '/archive': [
    { tabId: 'archive-mmps',      tabName: 'MMP Files',    tabNameAr: 'ملفات الخطط' },
    { tabId: 'archive-visits',    tabName: 'Site Visits',  tabNameAr: 'الزيارات' },
    { tabId: 'archive-documents', tabName: 'Documents',    tabNameAr: 'المستندات' },
  ],
  '/data-visibility': [
    { tabId: 'dv-integrated', tabName: 'Integrated View', tabNameAr: 'العرض المتكامل' },
    { tabId: 'dv-reporting',  tabName: 'Reporting',       tabNameAr: 'التقارير' },
    { tabId: 'dv-compliance', tabName: 'Compliance',      tabNameAr: 'الامتثال' },
  ],
  '/reports': [
    { tabId: 'reports-analytics',    tabName: 'Analytics',    tabNameAr: 'التحليلات' },
    { tabId: 'reports-project-costs',tabName: 'Project Costs',tabNameAr: 'تكاليف المشروع' },
    { tabId: 'reports-documents',    tabName: 'Documents',    tabNameAr: 'المستندات' },
    { tabId: 'reports-receipts',     tabName: 'Receipts',     tabNameAr: 'الإيصالات' },
    { tabId: 'reports-signatures',   tabName: 'Signatures',   tabNameAr: 'التوقيعات' },
    { tabId: 'reports-auditing',     tabName: 'Auditing',     tabNameAr: 'التدقيق' },
    { tabId: 'reports-templates',    tabName: 'Templates',    tabNameAr: 'القوالب' },
  ],
  '/calendar': [
    { tabId: 'cal-daily', tabName: 'Daily View',  tabNameAr: 'العرض اليومي' },
    { tabId: 'cal-range', tabName: 'Date Range',  tabNameAr: 'نطاق التاريخ' },
  ],
  '/finance': [
    { tabId: 'fin-tracking',  tabName: 'Financial Tracking', tabNameAr: 'التتبع المالي' },
    { tabId: 'fin-dashboard', tabName: 'Dashboard',          tabNameAr: 'لوحة المعلومات' },
    { tabId: 'fin-budget',    tabName: 'Budget',             tabNameAr: 'الميزانية' },
    { tabId: 'fin-payments',  tabName: 'Payments',           tabNameAr: 'المدفوعات' },
    { tabId: 'fin-reports',   tabName: 'Reports',            tabNameAr: 'التقارير' },
  ],
  '/wallet-reports': [
    { tabId: 'wr-month',        tabName: 'This Month',          tabNameAr: 'هذا الشهر' },
    { tabId: 'wr-all',          tabName: 'All Time',            tabNameAr: 'كل الأوقات' },
    { tabId: 'wr-userwallets',  tabName: 'User Wallets',        tabNameAr: 'محافظ المستخدمين' },
    { tabId: 'wr-transactions', tabName: 'Recent Transactions', tabNameAr: 'المعاملات الأخيرة' },
    { tabId: 'wr-withdrawals',  tabName: 'Withdrawal Requests', tabNameAr: 'طلبات السحب' },
  ],
  '/financial-operations': [
    { tabId: 'finops-consolidated',    tabName: 'Consolidated',    tabNameAr: 'موحد' },
    { tabId: 'finops-overview',        tabName: 'Overview',        tabNameAr: 'نظرة عامة' },
    { tabId: 'finops-workflow',        tabName: 'Workflow',        tabNameAr: 'سير العمل' },
    { tabId: 'finops-classifications', tabName: 'Classifications', tabNameAr: 'التصنيفات' },
    { tabId: 'finops-budget',          tabName: 'Budget',          tabNameAr: 'الميزانية' },
    { tabId: 'finops-payments',        tabName: 'Payments',        tabNameAr: 'المدفوعات' },
  ],
  '/advance-requests-report': [
    { tabId: 'arr-overview',   tabName: 'Overview',   tabNameAr: 'نظرة عامة' },
    { tabId: 'arr-byTeam',     tabName: 'By Team',    tabNameAr: 'حسب الفريق' },
    { tabId: 'arr-byHub',      tabName: 'By Hub',     tabNameAr: 'حسب المحور' },
    { tabId: 'arr-byStatus',   tabName: 'By Status',  tabNameAr: 'حسب الحالة' },
    { tabId: 'arr-byState',    tabName: 'By State',   tabNameAr: 'حسب الولاية' },
    { tabId: 'arr-byProject',  tabName: 'By Project', tabNameAr: 'حسب المشروع' },
  ],
  '/exchange-rates': [
    { tabId: 'er-add',     tabName: 'Add Rate',    tabNameAr: 'إضافة سعر' },
    { tabId: 'er-history', tabName: 'Rate History',tabNameAr: 'سجل الأسعار' },
  ],
  '/retainer-management': [
    { tabId: 'ret-overview', tabName: 'Overview',       tabNameAr: 'نظرة عامة' },
    { tabId: 'ret-history',  tabName: 'Payment History',tabNameAr: 'سجل المدفوعات' },
    { tabId: 'ret-tracking', tabName: 'Tracking Grid',  tabNameAr: 'شبكة التتبع' },
    { tabId: 'ret-eligible', tabName: 'Eligible Users', tabNameAr: 'المستخدمون المؤهلون' },
    { tabId: 'ret-audit',    tabName: 'Audit Trail',    tabNameAr: 'مسار التدقيق' },
    { tabId: 'ret-process',  tabName: 'Review & Process',tabNameAr: 'مراجعة ومعالجة' },
  ],
  '/users': [
    { tabId: 'users-all',      tabName: 'All Users', tabNameAr: 'كل المستخدمين' },
    { tabId: 'users-approved', tabName: 'Approved',  tabNameAr: 'موافق عليهم' },
    { tabId: 'users-pending',  tabName: 'Pending',   tabNameAr: 'قيد الانتظار' },
    { tabId: 'users-admins',   tabName: 'Admins',    tabNameAr: 'المشرفون' },
  ],
  '/approval-dashboard': [
    { tabId: 'ad-pending',  tabName: 'Pending',  tabNameAr: 'قيد الانتظار' },
    { tabId: 'ad-approved', tabName: 'Approved', tabNameAr: 'موافق عليها' },
    { tabId: 'ad-rejected', tabName: 'Rejected', tabNameAr: 'مرفوضة' },
    { tabId: 'ad-all',      tabName: 'All',      tabNameAr: 'الكل' },
  ],
  '/audit-logs': [
    { tabId: 'al-timeline', tabName: 'Timeline',         tabNameAr: 'الجدول الزمني' },
    { tabId: 'al-users',    tabName: 'Users',            tabNameAr: 'المستخدمون' },
    { tabId: 'al-workflows',tabName: 'Workflows',        tabNameAr: 'سير العمل' },
    { tabId: 'al-table',    tabName: 'Table View',       tabNameAr: 'عرض الجدول' },
    { tabId: 'al-stats',    tabName: 'Statistics',       tabNameAr: 'الإحصائيات' },
    { tabId: 'al-activity', tabName: 'Activity Tracking',tabNameAr: 'تتبع النشاط' },
  ],
  '/audit-compliance': [
    { tabId: 'ac-logs',       tabName: 'Audit Logs', tabNameAr: 'سجلات التدقيق' },
    { tabId: 'ac-compliance', tabName: 'Compliance', tabNameAr: 'الامتثال' },
  ],
  '/login-analytics': [
    { tabId: 'la-history', tabName: 'Login History',   tabNameAr: 'سجل الدخول' },
    { tabId: 'la-active',  tabName: 'Active Sessions', tabNameAr: 'الجلسات النشطة' },
  ],
};

// ── Derive SYSTEM_SCREENS from PAGE_DEFS ─────────────────────────────────────

function buildSystemScreens(): SystemScreen[] {
  const seen = new Set<string>();
  const screens: SystemScreen[] = [];
  for (const page of PAGE_DEFS) {
    // Deduplicate by slug (unique key), NOT by path — multiple pages can share a path (tabs)
    if (seen.has(page.slug)) continue;
    seen.add(page.slug);
    const category = GROUP_TO_CATEGORY[page.group] ?? 'Administration';
    screens.push({
      screenId: page.slug,
      screenName: page.label,
      screenNameAr: page.label,
      path: page.path,
      icon: page.icon,
      category,
      tabs: LEGACY_TABS_BY_PATH[page.path] ?? undefined,
    });
  }
  return screens;
}

const SYSTEM_SCREENS: SystemScreen[] = buildSystemScreens();

const DEFAULT_PERMISSIONS = { read: true, write: false, open: true, create: false, delete: false };

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS public.user_screen_permissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  screens jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Each screen entry shape:
  -- { screenId, screenName, screenNameAr, path, category, isVisible,
  --   permissions: { read, write, open, create, delete },
  --   tabs?: [{ tabId, tabName, tabNameAr, permissions: { read, write, open, create, delete } }] }
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.user_screen_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all permissions" ON public.user_screen_permissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "Users can read own permissions" ON public.user_screen_permissions
  FOR SELECT USING (user_id = auth.uid());`;

const PermissionsManagement = () => {
  const navigate = useNavigate();
  const { currentUser, users } = useAppContext();
  const { isSuperAdmin } = useAuthorization();
  const { toast } = useToast();

  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [userPermissions, setUserPermissions] = useState<UserScreenPermissions | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [hasChanges, setHasChanges] = useState(false);
  const [expandedScreens, setExpandedScreens] = useState<Set<string>>(new Set());
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [tableExists, setTableExists] = useState(true);
  const [showSqlHelp, setShowSqlHelp] = useState(false);

  const selectedUser = users.find(u => u.id === selectedUserId);
  const selectedUserRole = selectedUser?.role ?? null;

  useEffect(() => {
    if (!isSuperAdmin()) {
      navigate('/dashboard', { replace: true });
    }
  }, [isSuperAdmin, navigate]);

  const initializeDefaultPermissions = useCallback((): ScreenPermission[] => {
    return SYSTEM_SCREENS.map(screen => ({
      screenId: screen.screenId,
      screenName: screen.screenName,
      screenNameAr: screen.screenNameAr,
      path: screen.path,
      category: screen.category,
      permissions: { ...DEFAULT_PERMISSIONS },
      isVisible: true,
      tabs: screen.tabs?.map(tab => ({
        tabId: tab.tabId,
        tabName: tab.tabName,
        tabNameAr: tab.tabNameAr,
        permissions: { ...DEFAULT_PERMISSIONS },
      })),
    }));
  }, []);

  const loadUserPermissions = async (userId: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_screen_permissions' as any)
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        if (error.message?.includes('schema cache') || error.message?.includes('does not exist') || error.code === '42P01') {
          setTableExists(false);
        }
        setUserPermissions({
          userId,
          screens: initializeDefaultPermissions(),
        });
      } else if (data) {
        setTableExists(true);
        const screensData = typeof (data as any).screens === 'string'
          ? JSON.parse((data as any).screens)
          : (data as any).screens;
        const mergedScreens = SYSTEM_SCREENS.map(systemScreen => {
          const existingScreen = screensData?.find((s: any) => s.screenId === systemScreen.screenId);
          if (existingScreen) {
            const mergedTabs = systemScreen.tabs?.map(sysTab => {
              const existingTab = existingScreen.tabs?.find((t: any) => t.tabId === sysTab.tabId);
              return existingTab
                ? { ...sysTab, permissions: { ...DEFAULT_PERMISSIONS, ...existingTab.permissions } }
                : { ...sysTab, permissions: { ...DEFAULT_PERMISSIONS } };
            });
            return {
              screenId: systemScreen.screenId,
              screenName: systemScreen.screenName,
              screenNameAr: systemScreen.screenNameAr,
              path: systemScreen.path,
              category: systemScreen.category,
              permissions: { ...DEFAULT_PERMISSIONS, ...existingScreen.permissions },
              isVisible: existingScreen.isVisible !== undefined ? existingScreen.isVisible : true,
              tabs: mergedTabs,
            };
          }
          return {
            screenId: systemScreen.screenId,
            screenName: systemScreen.screenName,
            screenNameAr: systemScreen.screenNameAr,
            path: systemScreen.path,
            category: systemScreen.category,
            permissions: { ...DEFAULT_PERMISSIONS },
            isVisible: true,
            tabs: systemScreen.tabs?.map(tab => ({
              ...tab,
              permissions: { ...DEFAULT_PERMISSIONS },
            })),
          };
        });
        setUserPermissions({
          userId,
          screens: mergedScreens,
          updatedAt: (data as any).updated_at,
          updatedBy: (data as any).updated_by,
        });
      } else {
        setTableExists(true);
        setUserPermissions({
          userId,
          screens: initializeDefaultPermissions(),
        });
      }
      setHasChanges(false);
    } catch (err) {
      setUserPermissions({
        userId,
        screens: initializeDefaultPermissions(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveUserPermissions = async () => {
    if (!userPermissions || !currentUser) return;

    setIsSaving(true);
    try {
      const { data: existing } = await supabase
        .from('user_screen_permissions' as any)
        .select('id')
        .eq('user_id', userPermissions.userId)
        .maybeSingle();

      // Strip any screen entries whose screenId is no longer in PAGE_DEFS.
      // This prevents orphan slugs from accumulating in the DB whenever a page
      // is removed from PAGE_DEFS (the UI already shows only SYSTEM_SCREENS, but
      // an in-memory race or stale state could otherwise slip stale IDs through).
      const validSlugSet = new Set(SYSTEM_SCREENS.map(s => s.screenId));
      const cleanedScreens = userPermissions.screens.filter(s => validSlugSet.has(s.screenId));

      let error;
      const payload = {
        screens: cleanedScreens,
        updated_at: new Date().toISOString(),
        updated_by: currentUser.id,
      };

      if (existing) {
        const result = await supabase
          .from('user_screen_permissions' as any)
          .update(payload)
          .eq('user_id', userPermissions.userId);
        error = result.error;
      } else {
        const result = await supabase
          .from('user_screen_permissions' as any)
          .insert({ user_id: userPermissions.userId, ...payload });
        error = result.error;
      }

      if (error) {
        if (error.message?.includes('schema cache') || error.message?.includes('does not exist')) {
          setTableExists(false);
          setShowSqlHelp(true);
          toast({
            title: 'Table not found',
            description: 'The permissions table needs to be created first. See the setup instructions below.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Error',
            description: `Failed to save: ${error.message || 'Unknown error'}`,
            variant: 'destructive',
          });
        }
        return;
      }

      setTableExists(true);
      toast({ title: 'Success', description: 'Permissions saved successfully' });
      setHasChanges(false);
    } catch (err) {
      toast({ title: 'Error', description: 'An unexpected error occurred', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const updatePermission = (screenId: string, permissionType: keyof ScreenPermission['permissions'], value: boolean) => {
    if (!userPermissions) return;
    setUserPermissions(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        screens: prev.screens.map(screen =>
          screen.screenId === screenId
            ? { ...screen, permissions: { ...screen.permissions, [permissionType]: value } }
            : screen
        ),
      };
    });
    setHasChanges(true);
  };

  const updateTabPermission = (screenId: string, tabId: string, permissionType: keyof TabPermission['permissions'], value: boolean) => {
    if (!userPermissions) return;
    setUserPermissions(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        screens: prev.screens.map(screen =>
          screen.screenId === screenId
            ? {
                ...screen,
                tabs: screen.tabs?.map(tab =>
                  tab.tabId === tabId
                    ? { ...tab, permissions: { ...tab.permissions, [permissionType]: value } }
                    : tab
                ),
              }
            : screen
        ),
      };
    });
    setHasChanges(true);
  };

  const updateVisibility = (screenId: string, isVisible: boolean) => {
    if (!userPermissions) return;
    setUserPermissions(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        screens: prev.screens.map(screen =>
          screen.screenId === screenId ? { ...screen, isVisible } : screen
        ),
      };
    });
    setHasChanges(true);
  };

  const FULL_PERMS = { read: true, write: true, open: true, create: true, delete: true };
  const NO_PERMS   = { read: false, write: false, open: false, create: false, delete: false };

  const toggleAllPermissions = (screenId: string, enable: boolean) => {
    if (!userPermissions) return;
    const perms = enable ? FULL_PERMS : NO_PERMS;
    setUserPermissions(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        screens: prev.screens.map(screen =>
          screen.screenId === screenId
            ? { ...screen, permissions: { ...perms }, isVisible: enable, tabs: screen.tabs?.map(tab => ({ ...tab, permissions: { ...perms } })) }
            : screen
        ),
      };
    });
    setHasChanges(true);
  };

  const toggleAllTabPermissions = (screenId: string, tabId: string, enable: boolean) => {
    if (!userPermissions) return;
    const perms = enable ? FULL_PERMS : NO_PERMS;
    setUserPermissions(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        screens: prev.screens.map(screen =>
          screen.screenId === screenId
            ? { ...screen, tabs: screen.tabs?.map(tab => tab.tabId === tabId ? { ...tab, permissions: { ...perms } } : tab) }
            : screen
        ),
      };
    });
    setHasChanges(true);
  };

  const toggleCategoryPermissions = (category: string, enable: boolean) => {
    if (!userPermissions) return;
    const perms = enable ? FULL_PERMS : NO_PERMS;
    setUserPermissions(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        screens: prev.screens.map(screen =>
          screen.category === category
            ? { ...screen, permissions: { ...perms }, isVisible: enable, tabs: screen.tabs?.map(tab => ({ ...tab, permissions: { ...perms } })) }
            : screen
        ),
      };
    });
    setHasChanges(true);
  };

  const toggleScreenExpanded = (screenId: string) => {
    setExpandedScreens(prev => {
      const next = new Set(prev);
      if (next.has(screenId)) next.delete(screenId); else next.add(screenId);
      return next;
    });
  };

  const toggleCategoryCollapsed = (category: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category); else next.add(category);
      return next;
    });
  };

  const collapseAllCategories = () => setCollapsedCategories(new Set(CATEGORIES));
  const expandAllCategories   = () => setCollapsedCategories(new Set());

  useEffect(() => {
    if (selectedUserId) loadUserPermissions(selectedUserId);
    else setUserPermissions(null);
  }, [selectedUserId]);

  const filteredScreens = useMemo(() => {
    if (!userPermissions) return [];
    return userPermissions.screens.filter(screen => {
      const matchesSearch =
        screen.screenName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        screen.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
        screen.tabs?.some(t => t.tabName.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = selectedCategory === 'all' || screen.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [userPermissions, searchQuery, selectedCategory]);

  const groupedScreens = useMemo(() => {
    const groups: Record<string, ScreenPermission[]> = {};
    filteredScreens.forEach(screen => {
      if (!groups[screen.category]) groups[screen.category] = [];
      groups[screen.category].push(screen);
    });
    return groups;
  }, [filteredScreens]);

  const stats = useMemo(() => {
    if (!userPermissions) return { visible: 0, read: 0, write: 0, total: 0, tabs: 0 };
    const screens = userPermissions.screens;
    return {
      visible: screens.filter(s => s.isVisible).length,
      read: screens.filter(s => s.permissions.read).length,
      write: screens.filter(s => s.permissions.write).length,
      total: screens.length,
      tabs: screens.reduce((sum, s) => sum + (s.tabs?.length || 0), 0),
    };
  }, [userPermissions]);

  if (!isSuperAdmin()) return null;

  const iconMap: Record<string, any> = {};
  SYSTEM_SCREENS.forEach(s => { iconMap[s.screenId] = s.icon; });

  return (
    <TooltipProvider>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <ShieldCheck className="h-8 w-8 text-blue-600" />
              User Permissions Management
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage page and tab-level access for each user. {stats.total} pages, {stats.tabs} tabs available.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => { if (selectedUserId) loadUserPermissions(selectedUserId); }}
              data-testid="button-refresh"
            >
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            {hasChanges && (
              <Button onClick={saveUserPermissions} disabled={isSaving} data-testid="button-save-permissions">
                {isSaving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Changes
              </Button>
            )}
          </div>
        </div>

        {!tableExists && (
          <Card className="border-amber-300 dark:border-amber-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-5 w-5" /> Database Setup Required
              </CardTitle>
              <CardDescription>
                The permissions table does not exist yet. Run the following SQL in your Supabase SQL Editor to create it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Collapsible open={showSqlHelp} onOpenChange={setShowSqlHelp}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-show-sql">
                    {showSqlHelp ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
                    {showSqlHelp ? 'Hide SQL' : 'Show SQL'}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-3 p-4 bg-muted rounded-md text-xs overflow-x-auto whitespace-pre-wrap font-mono" data-testid="text-sql-script">
                    {CREATE_TABLE_SQL}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-5 w-5" /> Select User
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>User</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger data-testid="select-user">
                    <SelectValue placeholder="Select a user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map(user => (
                      <SelectItem key={user.id} value={user.id} data-testid={`dropdown-user-${user.id}`}>
                        {user.name} ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedUser && (
                <>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <div className="flex items-center h-10">
                      <Badge variant="outline">{selectedUser.role}</Badge>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <div className="flex items-center h-10">
                      <Badge variant={selectedUser.status === 'active' ? 'default' : 'secondary'}>
                        {selectedUser.status || 'Active'}
                      </Badge>
                    </div>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {selectedUserId && userPermissions && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: 'Visible', value: stats.visible, color: 'text-green-600', icon: Eye },
                { label: 'Read',    value: stats.read,    color: 'text-blue-600',  icon: Shield },
                { label: 'Write',   value: stats.write,   color: 'text-orange-600',icon: Lock },
                { label: 'Pages',   value: stats.total,   color: '',               icon: LayoutDashboard },
                { label: 'Tabs',    value: stats.tabs,    color: 'text-purple-600',icon: Layers },
              ].map(({ label, value, color, icon: Icon }) => (
                <Card key={label}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className={`text-2xl font-bold ${color}`} data-testid={`text-stat-${label.toLowerCase()}`}>{value}</p>
                        <p className="text-xs text-muted-foreground">{label}</p>
                      </div>
                      <Icon className="h-6 w-6 text-muted-foreground/20" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Quick Presets */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-5 w-5" /> Quick Presets
                  </CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="outline" size="sm" data-testid="button-preset-full-access"
                      onClick={() => {
                        setUserPermissions(prev => {
                          if (!prev) return prev;
                          return { ...prev, screens: prev.screens.map(s => ({ ...s, isVisible: true, permissions: { ...FULL_PERMS }, tabs: s.tabs?.map(t => ({ ...t, permissions: { ...FULL_PERMS } })) })) };
                        });
                        setHasChanges(true);
                      }}>
                      <Unlock className="h-3 w-3 mr-1" /> Full Access
                    </Button>
                    <Button variant="outline" size="sm" data-testid="button-preset-read-only"
                      onClick={() => {
                        setUserPermissions(prev => {
                          if (!prev) return prev;
                          const p = { read: true, write: false, open: true, create: false, delete: false };
                          return { ...prev, screens: prev.screens.map(s => ({ ...s, isVisible: true, permissions: { ...p }, tabs: s.tabs?.map(t => ({ ...t, permissions: { ...p } })) })) };
                        });
                        setHasChanges(true);
                      }}>
                      <Eye className="h-3 w-3 mr-1" /> Read Only
                    </Button>
                    <Button variant="outline" size="sm" data-testid="button-preset-no-access"
                      onClick={() => {
                        setUserPermissions(prev => {
                          if (!prev) return prev;
                          return { ...prev, screens: prev.screens.map(s => ({ ...s, isVisible: false, permissions: { ...NO_PERMS }, tabs: s.tabs?.map(t => ({ ...t, permissions: { ...NO_PERMS } })) })) };
                        });
                        setHasChanges(true);
                      }}>
                      <Lock className="h-3 w-3 mr-1" /> No Access
                    </Button>
                    <Button variant="outline" size="sm" data-testid="button-preset-field-worker"
                      onClick={() => {
                        const fieldScreens = ['dashboard', 'site-visits', 'cost-submission', 'signatures', 'chat', 'notifications', 'mmp', 'wallet'];
                        setUserPermissions(prev => {
                          if (!prev) return prev;
                          return {
                            ...prev,
                            screens: prev.screens.map(s => ({
                              ...s,
                              isVisible: fieldScreens.includes(s.screenId),
                              permissions: {
                                read: fieldScreens.includes(s.screenId),
                                write: s.screenId === 'cost-submission' || s.screenId === 'signatures',
                                open: fieldScreens.includes(s.screenId),
                                create: s.screenId === 'cost-submission',
                                delete: false,
                              },
                              tabs: s.tabs?.map(t => ({
                                ...t,
                                permissions: { read: fieldScreens.includes(s.screenId), write: false, open: fieldScreens.includes(s.screenId), create: false, delete: false },
                              })),
                            }))
                          };
                        });
                        setHasChanges(true);
                      }}>
                      <MapPin className="h-3 w-3 mr-1" /> Field Worker
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Filters */}
            <Card>
              <CardContent className="py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Search Pages & Tabs</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Search pages or tabs..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" data-testid="input-search-screens" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger data-testid="select-category">
                        <SelectValue placeholder="All categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {CATEGORIES.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Legend + collapse controls */}
            <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1"><Badge variant="outline" className="text-xs">R</Badge> Read</span>
                <span className="flex items-center gap-1"><Badge variant="outline" className="text-xs">W</Badge> Write</span>
                <span className="flex items-center gap-1"><Badge variant="outline" className="text-xs">O</Badge> Open</span>
                <span className="flex items-center gap-1"><Badge variant="outline" className="text-xs">C</Badge> Create</span>
                <span className="flex items-center gap-1"><Badge variant="outline" className="text-xs text-red-600 border-red-300">D</Badge> Delete</span>
                <span className="flex items-center gap-1">
                  <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100">Role Default</Badge>
                  = role grants access
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-xs">
                  <Layers className="h-4 w-4" /> Click page rows with tabs to expand
                </span>
                <Button variant="outline" size="sm" onClick={expandAllCategories} className="h-7 text-xs px-2">
                  <ChevronDown className="h-3 w-3 mr-1" /> Expand All
                </Button>
                <Button variant="outline" size="sm" onClick={collapseAllCategories} className="h-7 text-xs px-2">
                  <ChevronRight className="h-3 w-3 mr-1" /> Collapse All
                </Button>
              </div>
            </div>

            {isLoading ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Loading permissions...</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {CATEGORIES.filter(cat => groupedScreens[cat]?.length > 0).map(category => {
                  const isCollapsed = collapsedCategories.has(category);
                  const count = groupedScreens[category]?.length ?? 0;
                  return (
                    <Card key={category}>
                      {/* Clickable header — toggles collapse */}
                      <CardHeader
                        className="pb-3 cursor-pointer select-none"
                        onClick={() => toggleCategoryCollapsed(category)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {isCollapsed
                              ? <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                              : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                            }
                            <CardTitle className="text-base">{category}</CardTitle>
                            <Badge variant="secondary" className="text-xs">{count}</Badge>
                          </div>
                          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                            <Button variant="outline" size="sm" onClick={() => toggleCategoryPermissions(category, true)} data-testid={`button-enable-all-${category}`}>
                              <Unlock className="h-3 w-3 mr-1" /> Enable All
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => toggleCategoryPermissions(category, false)} data-testid={`button-disable-all-${category}`}>
                              <Lock className="h-3 w-3 mr-1" /> Disable All
                            </Button>
                          </div>
                        </div>
                      </CardHeader>

                      {!isCollapsed && (
                        <CardContent className="pt-0">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[280px]">Page / Tab</TableHead>
                                <TableHead className="w-[80px] text-center">Visible</TableHead>
                                <TableHead className="w-[60px] text-center">Read</TableHead>
                                <TableHead className="w-[60px] text-center">Write</TableHead>
                                <TableHead className="w-[60px] text-center">Open</TableHead>
                                <TableHead className="w-[60px] text-center">Create</TableHead>
                                <TableHead className="w-[60px] text-center text-red-600">Delete</TableHead>
                                <TableHead className="w-[90px] text-center">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {groupedScreens[category]?.map(screen => {
                                const IconComponent = iconMap[screen.screenId] || LayoutDashboard;
                                const hasTabs = screen.tabs && screen.tabs.length > 0;
                                const isExpanded = expandedScreens.has(screen.screenId);
                                const pageDef = PAGE_DEFS.find(p => p.slug === screen.screenId);
                                const hasRoleDefault = pageDef ? hasDefaultAccess(pageDef, selectedUserRole) : false;

                                return (
                                  <ScreenRow
                                    key={screen.screenId}
                                    screen={screen}
                                    IconComponent={IconComponent}
                                    hasTabs={hasTabs || false}
                                    isExpanded={isExpanded}
                                    hasRoleDefault={hasRoleDefault}
                                    onToggleExpand={() => toggleScreenExpanded(screen.screenId)}
                                    onUpdateVisibility={(v) => updateVisibility(screen.screenId, v)}
                                    onUpdatePermission={(p, v) => updatePermission(screen.screenId, p, v)}
                                    onToggleAll={(e) => toggleAllPermissions(screen.screenId, e)}
                                    onUpdateTabPermission={(tabId, p, v) => updateTabPermission(screen.screenId, tabId, p, v)}
                                    onToggleAllTab={(tabId, e) => toggleAllTabPermissions(screen.screenId, tabId, e)}
                                  />
                                );
                              })}
                            </TableBody>
                          </Table>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}

            {hasChanges && (
              <div className="sticky bottom-4 flex justify-end">
                <Card className="shadow-lg border-2 border-primary/20">
                  <CardContent className="py-3 px-4 flex items-center gap-4">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    <span className="text-sm font-medium">You have unsaved changes</span>
                    <Button onClick={saveUserPermissions} disabled={isSaving} data-testid="button-save-bottom">
                      {isSaving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                      Save Changes
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}

        {!selectedUserId && (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Select a User</h3>
              <p className="text-muted-foreground">Choose a user from the dropdown above to manage their page and tab permissions.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
};

// ── ScreenRow component ───────────────────────────────────────────────────────

interface ScreenRowProps {
  screen: ScreenPermission;
  IconComponent: any;
  hasTabs: boolean;
  isExpanded: boolean;
  hasRoleDefault: boolean;
  onToggleExpand: () => void;
  onUpdateVisibility: (v: boolean) => void;
  onUpdatePermission: (p: keyof ScreenPermission['permissions'], v: boolean) => void;
  onToggleAll: (enable: boolean) => void;
  onUpdateTabPermission: (tabId: string, p: keyof TabPermission['permissions'], v: boolean) => void;
  onToggleAllTab: (tabId: string, enable: boolean) => void;
}

const ScreenRow = ({
  screen, IconComponent, hasTabs, isExpanded, hasRoleDefault,
  onToggleExpand, onUpdateVisibility, onUpdatePermission,
  onToggleAll, onUpdateTabPermission, onToggleAllTab,
}: ScreenRowProps) => {
  return (
    <>
      <TableRow
        data-testid={`row-screen-${screen.screenId}`}
        className={hasTabs ? 'cursor-pointer' : ''}
        onClick={hasTabs ? onToggleExpand : undefined}
      >
        <TableCell>
          <div className="flex items-center gap-2">
            {hasTabs ? (
              isExpanded
                ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <div className="w-4" />
            )}
            <IconComponent className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="font-medium text-sm">{screen.screenName}</p>
                {hasRoleDefault && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge className="text-[10px] px-1.5 py-0 h-4 bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-help font-medium">
                        Role Default
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      This user's role grants default access to this page
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{screen.path}</p>
            </div>
            {hasTabs && (
              <Badge variant="secondary" className="text-xs ml-1">{screen.tabs?.length} tabs</Badge>
            )}
          </div>
        </TableCell>
        <TableCell className="text-center" onClick={e => e.stopPropagation()}>
          <Switch checked={screen.isVisible} onCheckedChange={onUpdateVisibility} data-testid={`switch-visible-${screen.screenId}`} />
        </TableCell>
        <TableCell className="text-center" onClick={e => e.stopPropagation()}>
          <Checkbox checked={screen.permissions.read} onCheckedChange={checked => onUpdatePermission('read', !!checked)} data-testid={`checkbox-read-${screen.screenId}`} />
        </TableCell>
        <TableCell className="text-center" onClick={e => e.stopPropagation()}>
          <Checkbox checked={screen.permissions.write} onCheckedChange={checked => onUpdatePermission('write', !!checked)} data-testid={`checkbox-write-${screen.screenId}`} />
        </TableCell>
        <TableCell className="text-center" onClick={e => e.stopPropagation()}>
          <Checkbox checked={screen.permissions.open} onCheckedChange={checked => onUpdatePermission('open', !!checked)} data-testid={`checkbox-open-${screen.screenId}`} />
        </TableCell>
        <TableCell className="text-center" onClick={e => e.stopPropagation()}>
          <Checkbox checked={screen.permissions.create} onCheckedChange={checked => onUpdatePermission('create', !!checked)} data-testid={`checkbox-create-${screen.screenId}`} />
        </TableCell>
        <TableCell className="text-center" onClick={e => e.stopPropagation()}>
          <Checkbox
            checked={screen.permissions.delete}
            onCheckedChange={checked => onUpdatePermission('delete', !!checked)}
            data-testid={`checkbox-delete-${screen.screenId}`}
            className="border-red-300 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
          />
        </TableCell>
        <TableCell className="text-center" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => onToggleAll(true)} title="Grant all" data-testid={`button-grant-all-${screen.screenId}`}>
              <Check className="h-4 w-4 text-green-600" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onToggleAll(false)} title="Revoke all" data-testid={`button-revoke-all-${screen.screenId}`}>
              <X className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {hasTabs && isExpanded && screen.tabs?.map(tab => (
        <TableRow key={tab.tabId} className="bg-muted/30" data-testid={`row-tab-${tab.tabId}`}>
          <TableCell>
            <div className="flex items-center gap-2 pl-10">
              <Layers className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-sm">{tab.tabName}</p>
                <p className="text-xs text-muted-foreground">{tab.tabNameAr}</p>
              </div>
            </div>
          </TableCell>
          <TableCell />
          <TableCell className="text-center">
            <Checkbox checked={tab.permissions.read} onCheckedChange={checked => onUpdateTabPermission(tab.tabId, 'read', !!checked)} data-testid={`checkbox-read-${tab.tabId}`} />
          </TableCell>
          <TableCell className="text-center">
            <Checkbox checked={tab.permissions.write} onCheckedChange={checked => onUpdateTabPermission(tab.tabId, 'write', !!checked)} data-testid={`checkbox-write-${tab.tabId}`} />
          </TableCell>
          <TableCell className="text-center">
            <Checkbox checked={tab.permissions.open} onCheckedChange={checked => onUpdateTabPermission(tab.tabId, 'open', !!checked)} data-testid={`checkbox-open-${tab.tabId}`} />
          </TableCell>
          <TableCell className="text-center">
            <Checkbox checked={tab.permissions.create} onCheckedChange={checked => onUpdateTabPermission(tab.tabId, 'create', !!checked)} data-testid={`checkbox-create-${tab.tabId}`} />
          </TableCell>
          <TableCell className="text-center">
            <Checkbox
              checked={tab.permissions.delete}
              onCheckedChange={checked => onUpdateTabPermission(tab.tabId, 'delete', !!checked)}
              data-testid={`checkbox-delete-${tab.tabId}`}
              className="border-red-300 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
            />
          </TableCell>
          <TableCell className="text-center">
            <div className="flex items-center justify-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => onToggleAllTab(tab.tabId, true)} title="Grant all" data-testid={`button-grant-tab-${tab.tabId}`}>
                <Check className="h-4 w-4 text-green-600" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onToggleAllTab(tab.tabId, false)} title="Revoke all" data-testid={`button-revoke-tab-${tab.tabId}`}>
                <X className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
};

export default PermissionsManagement;
