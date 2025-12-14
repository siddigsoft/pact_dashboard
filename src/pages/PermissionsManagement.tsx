import { useState, useEffect, useMemo } from 'react';
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
  FolderKanban,
  Database,
  ClipboardList,
  DollarSign,
  CreditCard,
  BarChart3,
  Settings,
  MessageSquare,
  Building2,
  MapPin,
  FileText,
  Receipt,
} from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ScreenPermission {
  screenId: string;
  screenName: string;
  screenNameAr: string;
  path: string;
  icon: any;
  category: string;
  permissions: {
    read: boolean;
    write: boolean;
    open: boolean;
    create: boolean;
  };
  isVisible: boolean;
}

interface UserScreenPermissions {
  userId: string;
  screens: ScreenPermission[];
  updatedAt?: string;
  updatedBy?: string;
}

const SYSTEM_SCREENS: Omit<ScreenPermission, 'permissions' | 'isVisible'>[] = [
  { screenId: 'dashboard', screenName: 'Dashboard', screenNameAr: 'لوحة المعلومات', path: '/dashboard', icon: LayoutDashboard, category: 'Overview' },
  { screenId: 'projects', screenName: 'Projects', screenNameAr: 'المشاريع', path: '/projects', icon: FolderKanban, category: 'Planning' },
  { screenId: 'mmp', screenName: 'MMP Management', screenNameAr: 'إدارة خطط الرصد الشهرية', path: '/mmp', icon: Database, category: 'Planning' },
  { screenId: 'site-visits', screenName: 'Site Visits', screenNameAr: 'الزيارات الميدانية', path: '/site-visits', icon: ClipboardList, category: 'Field Operations' },
  { screenId: 'field-team', screenName: 'Field Team', screenNameAr: 'الفريق الميداني', path: '/field-team', icon: Users, category: 'Field Operations' },
  { screenId: 'field-operation-manager', screenName: 'Field Operation Manager', screenNameAr: 'مدير العمليات الميدانية', path: '/field-operation-manager', icon: MapPin, category: 'Field Operations' },
  { screenId: 'hub-operations', screenName: 'Hub Operations', screenNameAr: 'عمليات المحور', path: '/hub-operations', icon: Building2, category: 'Field Operations' },
  { screenId: 'hub-management', screenName: 'Hub Management', screenNameAr: 'إدارة المحاور', path: '/hub-management', icon: Building2, category: 'Field Operations' },
  { screenId: 'budget', screenName: 'Budget', screenNameAr: 'الميزانية', path: '/budget', icon: DollarSign, category: 'Finance' },
  { screenId: 'admin-wallets', screenName: 'Wallets', screenNameAr: 'المحافظ', path: '/admin/wallets', icon: CreditCard, category: 'Finance' },
  { screenId: 'cost-submission', screenName: 'Cost Submission', screenNameAr: 'تقديم التكاليف', path: '/cost-submission', icon: Receipt, category: 'Finance' },
  { screenId: 'finance-approval', screenName: 'Finance Approval', screenNameAr: 'الموافقة المالية', path: '/finance-approval', icon: DollarSign, category: 'Finance' },
  { screenId: 'withdrawal-approval', screenName: 'Withdrawal Approval', screenNameAr: 'موافقة السحب', path: '/withdrawal-approval', icon: DollarSign, category: 'Finance' },
  { screenId: 'financial-operations', screenName: 'Financial Operations', screenNameAr: 'العمليات المالية', path: '/financial-operations', icon: DollarSign, category: 'Finance' },
  { screenId: 'reports', screenName: 'Reports', screenNameAr: 'التقارير', path: '/reports', icon: BarChart3, category: 'Data & Reports' },
  { screenId: 'tracker-preparation-plan', screenName: 'Tracker Preparation', screenNameAr: 'إعداد المتتبع', path: '/tracker-preparation-plan', icon: BarChart3, category: 'Data & Reports' },
  { screenId: 'data-visibility', screenName: 'Data Visibility', screenNameAr: 'رؤية البيانات', path: '/data-visibility', icon: Eye, category: 'Data & Reports' },
  { screenId: 'users', screenName: 'User Management', screenNameAr: 'إدارة المستخدمين', path: '/users', icon: Users, category: 'Administration' },
  { screenId: 'role-management', screenName: 'Role Management', screenNameAr: 'إدارة الأدوار', path: '/role-management', icon: Shield, category: 'Administration' },
  { screenId: 'classifications', screenName: 'Classifications', screenNameAr: 'التصنيفات', path: '/classifications', icon: FileText, category: 'Administration' },
  { screenId: 'classification-fees', screenName: 'Classification Fees', screenNameAr: 'رسوم التصنيف', path: '/classification-fees', icon: DollarSign, category: 'Administration' },
  { screenId: 'settings', screenName: 'Settings', screenNameAr: 'الإعدادات', path: '/settings', icon: Settings, category: 'Administration' },
  { screenId: 'chat', screenName: 'Chat', screenNameAr: 'المحادثات', path: '/chat', icon: MessageSquare, category: 'Communication' },
  { screenId: 'notifications', screenName: 'Notifications', screenNameAr: 'الإشعارات', path: '/notifications', icon: MessageSquare, category: 'Communication' },
  { screenId: 'email-management', screenName: 'Email Management', screenNameAr: 'إدارة البريد الإلكتروني', path: '/email-management', icon: MessageSquare, category: 'Communication' },
  { screenId: 'audit-logs', screenName: 'Audit Logs', screenNameAr: 'سجلات التدقيق', path: '/audit-logs', icon: FileText, category: 'Security' },
  { screenId: 'signatures', screenName: 'Signatures', screenNameAr: 'التوقيعات', path: '/signatures', icon: FileText, category: 'Security' },
  { screenId: 'approval-dashboard', screenName: 'Approval Dashboard', screenNameAr: 'لوحة الموافقات', path: '/approval-dashboard', icon: ClipboardList, category: 'Security' },
];

const PERMISSION_LABELS = {
  read: { en: 'Read', ar: 'قراءة', abbr: 'R', description: 'View data on this screen' },
  write: { en: 'Write', ar: 'كتابة', abbr: 'W', description: 'Edit existing data' },
  open: { en: 'Open', ar: 'فتح', abbr: 'O', description: 'Access this screen' },
  create: { en: 'Create', ar: 'إنشاء', abbr: 'C', description: 'Create new records' },
};

const CATEGORIES = [
  'Overview',
  'Planning',
  'Field Operations',
  'Finance',
  'Data & Reports',
  'Administration',
  'Communication',
  'Security',
];

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

  const selectedUser = users.find(u => u.id === selectedUserId);

  useEffect(() => {
    if (!isSuperAdmin()) {
      navigate('/dashboard', { replace: true });
    }
  }, [isSuperAdmin, navigate]);

  const initializeDefaultPermissions = (): ScreenPermission[] => {
    return SYSTEM_SCREENS.map(screen => ({
      ...screen,
      permissions: {
        read: true,
        write: false,
        open: true,
        create: false,
      },
      isVisible: true,
    }));
  };

  const loadUserPermissions = async (userId: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_screen_permissions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading permissions:', error);
        toast({
          title: 'Error',
          description: 'Failed to load user permissions',
          variant: 'destructive',
        });
        return;
      }

      if (data) {
        const screensData = typeof data.screens === 'string' 
          ? JSON.parse(data.screens) 
          : data.screens;
        setUserPermissions({
          userId,
          screens: screensData,
          updatedAt: data.updated_at,
          updatedBy: data.updated_by,
        });
      } else {
        setUserPermissions({
          userId,
          screens: initializeDefaultPermissions(),
        });
      }
      setHasChanges(false);
    } catch (err) {
      console.error('Error:', err);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveUserPermissions = async () => {
    if (!userPermissions || !currentUser) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('user_screen_permissions')
        .upsert({
          user_id: userPermissions.userId,
          screens: userPermissions.screens,
          updated_at: new Date().toISOString(),
          updated_by: currentUser.id,
        }, {
          onConflict: 'user_id',
        });

      if (error) {
        console.error('Error saving permissions:', error);
        toast({
          title: 'Error',
          description: 'Failed to save permissions. The table may not exist yet.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Success',
        description: 'Permissions saved successfully',
      });
      setHasChanges(false);
    } catch (err) {
      console.error('Error:', err);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
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

  const updateVisibility = (screenId: string, isVisible: boolean) => {
    if (!userPermissions) return;

    setUserPermissions(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        screens: prev.screens.map(screen =>
          screen.screenId === screenId
            ? { ...screen, isVisible }
            : screen
        ),
      };
    });
    setHasChanges(true);
  };

  const toggleAllPermissions = (screenId: string, enable: boolean) => {
    if (!userPermissions) return;

    setUserPermissions(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        screens: prev.screens.map(screen =>
          screen.screenId === screenId
            ? {
                ...screen,
                permissions: {
                  read: enable,
                  write: enable,
                  open: enable,
                  create: enable,
                },
                isVisible: enable,
              }
            : screen
        ),
      };
    });
    setHasChanges(true);
  };

  const toggleCategoryPermissions = (category: string, enable: boolean) => {
    if (!userPermissions) return;

    setUserPermissions(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        screens: prev.screens.map(screen =>
          screen.category === category
            ? {
                ...screen,
                permissions: {
                  read: enable,
                  write: enable,
                  open: enable,
                  create: enable,
                },
                isVisible: enable,
              }
            : screen
        ),
      };
    });
    setHasChanges(true);
  };

  useEffect(() => {
    if (selectedUserId) {
      loadUserPermissions(selectedUserId);
    } else {
      setUserPermissions(null);
    }
  }, [selectedUserId]);

  const filteredScreens = useMemo(() => {
    if (!userPermissions) return [];
    
    return userPermissions.screens.filter(screen => {
      const matchesSearch = 
        screen.screenName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        screen.screenNameAr.includes(searchQuery) ||
        screen.path.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = selectedCategory === 'all' || screen.category === selectedCategory;
      
      return matchesSearch && matchesCategory;
    });
  }, [userPermissions, searchQuery, selectedCategory]);

  const groupedScreens = useMemo(() => {
    const groups: Record<string, ScreenPermission[]> = {};
    filteredScreens.forEach(screen => {
      if (!groups[screen.category]) {
        groups[screen.category] = [];
      }
      groups[screen.category].push(screen);
    });
    return groups;
  }, [filteredScreens]);

  if (!isSuperAdmin()) {
    return null;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="h-8 w-8 text-blue-600" />
            User Permissions Management
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage screen access and permissions for each user
          </p>
        </div>
        {hasChanges && (
          <Button
            onClick={saveUserPermissions}
            disabled={isSaving}
            data-testid="button-save-permissions"
          >
            {isSaving ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-5 w-5" />
            Select User
          </CardTitle>
          <CardDescription>
            Choose a user to manage their screen permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>User</Label>
              <Select
                value={selectedUserId}
                onValueChange={setSelectedUserId}
              >
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
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="h-5 w-5" />
                Filter Screens
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search screens..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-10"
                      data-testid="input-search-screens"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={selectedCategory}
                    onValueChange={setSelectedCategory}
                  >
                    <SelectTrigger data-testid="select-category">
                      <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" data-testid="dropdown-category-all">All Categories</SelectItem>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat} data-testid={`dropdown-category-${cat.toLowerCase().replace(/\s+/g, '-')}`}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">R</Badge>
                Read
              </span>
              <span className="flex items-center gap-1">
                <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300">W</Badge>
                Write
              </span>
              <span className="flex items-center gap-1">
                <Badge variant="outline" className="bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300">O</Badge>
                Open
              </span>
              <span className="flex items-center gap-1">
                <Badge variant="outline" className="bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300">C</Badge>
                Create
              </span>
            </div>
            <span className="flex items-center gap-1">
              <Eye className="h-4 w-4" /> Visible in navigation
            </span>
          </div>

          {isLoading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Loading permissions...</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {CATEGORIES.filter(cat => groupedScreens[cat]?.length > 0).map(category => (
                <Card key={category}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{category}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleCategoryPermissions(category, true)}
                          data-testid={`button-enable-all-${category}`}
                        >
                          <Unlock className="h-3 w-3 mr-1" />
                          Enable All
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleCategoryPermissions(category, false)}
                          data-testid={`button-disable-all-${category}`}
                        >
                          <Lock className="h-3 w-3 mr-1" />
                          Disable All
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[250px]">Screen</TableHead>
                          <TableHead className="w-[100px] text-center">Visible</TableHead>
                          <TableHead className="w-[80px] text-center">Read</TableHead>
                          <TableHead className="w-[80px] text-center">Write</TableHead>
                          <TableHead className="w-[80px] text-center">Open</TableHead>
                          <TableHead className="w-[80px] text-center">Create</TableHead>
                          <TableHead className="w-[120px] text-center">Quick Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupedScreens[category]?.map(screen => {
                          const IconComponent = screen.icon;
                          return (
                            <TableRow key={screen.screenId} data-testid={`row-screen-${screen.screenId}`}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <IconComponent className="h-4 w-4 text-muted-foreground" />
                                  <div>
                                    <p className="font-medium">{screen.screenName}</p>
                                    <p className="text-xs text-muted-foreground">{screen.path}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Switch
                                  checked={screen.isVisible}
                                  onCheckedChange={checked => updateVisibility(screen.screenId, checked)}
                                  data-testid={`switch-visible-${screen.screenId}`}
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <Checkbox
                                  checked={screen.permissions.read}
                                  onCheckedChange={checked => updatePermission(screen.screenId, 'read', !!checked)}
                                  data-testid={`checkbox-read-${screen.screenId}`}
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <Checkbox
                                  checked={screen.permissions.write}
                                  onCheckedChange={checked => updatePermission(screen.screenId, 'write', !!checked)}
                                  data-testid={`checkbox-write-${screen.screenId}`}
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <Checkbox
                                  checked={screen.permissions.open}
                                  onCheckedChange={checked => updatePermission(screen.screenId, 'open', !!checked)}
                                  data-testid={`checkbox-open-${screen.screenId}`}
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <Checkbox
                                  checked={screen.permissions.create}
                                  onCheckedChange={checked => updatePermission(screen.screenId, 'create', !!checked)}
                                  data-testid={`checkbox-create-${screen.screenId}`}
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => toggleAllPermissions(screen.screenId, true)}
                                    title="Grant all permissions"
                                    data-testid={`button-grant-all-${screen.screenId}`}
                                  >
                                    <Check className="h-4 w-4 text-green-600" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => toggleAllPermissions(screen.screenId, false)}
                                    title="Revoke all permissions"
                                    data-testid={`button-revoke-all-${screen.screenId}`}
                                  >
                                    <X className="h-4 w-4 text-red-600" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {hasChanges && (
            <div className="sticky bottom-4 flex justify-end">
              <Card className="shadow-lg border-2 border-primary/20">
                <CardContent className="py-3 px-4 flex items-center gap-4">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <span className="text-sm font-medium">You have unsaved changes</span>
                  <Button
                    onClick={saveUserPermissions}
                    disabled={isSaving}
                    data-testid="button-save-bottom"
                  >
                    {isSaving ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
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
            <p className="text-muted-foreground">
              Choose a user from the dropdown above to manage their screen permissions.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PermissionsManagement;
