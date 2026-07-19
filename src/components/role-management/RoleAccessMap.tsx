import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppContext } from '@/context/AppContext';
import { toDisplayLabel, normalizeRole } from '@/utils/roleMapping';
import { cn } from '@/lib/utils';
import {
  CheckCircle2, MinusCircle, XCircle, Eye, PenLine, BadgeCheck,
  Users, BarChart3, Map, Grid3X3, Info,
} from 'lucide-react';

type AccessLevel = 'full' | 'read' | 'submit' | 'approve' | 'none';

interface Module {
  name: string;
  nameAr: string;
  icon: string;
  category: string;
  access: Partial<Record<string, AccessLevel>>;
}

const ROLES = [
  'SuperAdmin',
  'Admin',
  'CountryDirector',
  'Field Operation Manager (FOM)',
  'FinancialAdmin',
  'ICT',
  'ProjectManager',
  'SeniorOperationsLead',
  'Supervisor',
  'Coordinator',
  'DataTeam',
  'DataCollector',
  'Reviewer',
  'Auditor',
] as const;

const ROLE_SHORT: Record<string, string> = {
  'SuperAdmin': 'SA',
  'Admin': 'Ad',
  'CountryDirector': 'CD',
  'Field Operation Manager (FOM)': 'FOM',
  'FinancialAdmin': 'FA',
  'ICT': 'ICT',
  'ProjectManager': 'PM',
  'SeniorOperationsLead': 'SOL',
  'Supervisor': 'Sup',
  'Coordinator': 'Crd',
  'DataTeam': 'DT',
  'DataCollector': 'DC',
  'Reviewer': 'Rev',
  'Auditor': 'Aud',
};

const ROLE_COLOR: Record<string, string> = {
  'SuperAdmin': 'bg-red-600',
  'Admin': 'bg-orange-500',
  'CountryDirector': 'bg-blue-600',
  'Field Operation Manager (FOM)': 'bg-teal-600',
  'FinancialAdmin': 'bg-green-600',
  'ICT': 'bg-violet-600',
  'ProjectManager': 'bg-cyan-600',
  'SeniorOperationsLead': 'bg-indigo-600',
  'Supervisor': 'bg-amber-600',
  'Coordinator': 'bg-lime-600',
  'DataTeam': 'bg-pink-600',
  'DataCollector': 'bg-sky-600',
  'Reviewer': 'bg-gray-500',
  'Auditor': 'bg-slate-600',
};

const MODULES: Module[] = [
  {
    name: 'Dashboard', nameAr: 'لوحة التحكم', icon: '📊', category: 'General',
    access: { SuperAdmin: 'full', Admin: 'full', CountryDirector: 'full', 'Field Operation Manager (FOM)': 'full', FinancialAdmin: 'read', ICT: 'full', ProjectManager: 'full', SeniorOperationsLead: 'full', Supervisor: 'read', Coordinator: 'read', DataTeam: 'read', DataCollector: 'read', Reviewer: 'read', Auditor: 'read' },
  },
  {
    name: 'MMP Management', nameAr: 'إدارة خطط الرصد', icon: '📋', category: 'Field Operations',
    access: { SuperAdmin: 'full', Admin: 'full', CountryDirector: 'read', 'Field Operation Manager (FOM)': 'full', FinancialAdmin: 'none', ICT: 'full', ProjectManager: 'full', SeniorOperationsLead: 'approve', Supervisor: 'read', Coordinator: 'read', DataTeam: 'read', DataCollector: 'read', Reviewer: 'read', Auditor: 'none' },
  },
  {
    name: 'Site Visits', nameAr: 'الزيارات الميدانية', icon: '🗺️', category: 'Field Operations',
    access: { SuperAdmin: 'full', Admin: 'full', CountryDirector: 'read', 'Field Operation Manager (FOM)': 'full', FinancialAdmin: 'read', ICT: 'full', ProjectManager: 'full', SeniorOperationsLead: 'approve', Supervisor: 'submit', Coordinator: 'submit', DataTeam: 'read', DataCollector: 'submit', Reviewer: 'read', Auditor: 'none' },
  },
  {
    name: 'Submit Cost Request', nameAr: 'تقديم طلب مصروف', icon: '💰', category: 'Finance',
    access: { SuperAdmin: 'full', Admin: 'full', CountryDirector: 'submit', 'Field Operation Manager (FOM)': 'submit', FinancialAdmin: 'none', ICT: 'none', ProjectManager: 'none', SeniorOperationsLead: 'none', Supervisor: 'submit', Coordinator: 'submit', DataTeam: 'submit', DataCollector: 'submit', Reviewer: 'none', Auditor: 'none' },
  },
  {
    name: 'Approve Cost (T1–T4)', nameAr: 'موافقة المصروفات (المراحل)', icon: '✅', category: 'Finance',
    access: { SuperAdmin: 'full', Admin: 'approve', CountryDirector: 'approve', 'Field Operation Manager (FOM)': 'approve', FinancialAdmin: 'none', ICT: 'none', ProjectManager: 'none', SeniorOperationsLead: 'none', Supervisor: 'approve', Coordinator: 'none', DataTeam: 'none', DataCollector: 'none', Reviewer: 'none', Auditor: 'none' },
  },
  {
    name: 'Mark Cost as Paid', nameAr: 'تحديد المصروف كمدفوع', icon: '🏦', category: 'Finance',
    access: { SuperAdmin: 'full', Admin: 'full', CountryDirector: 'none', 'Field Operation Manager (FOM)': 'none', FinancialAdmin: 'full', ICT: 'none', ProjectManager: 'none', SeniorOperationsLead: 'none', Supervisor: 'none', Coordinator: 'none', DataTeam: 'none', DataCollector: 'none', Reviewer: 'none', Auditor: 'none' },
  },
  {
    name: 'Down Payments', nameAr: 'الدفعات المقدمة', icon: '💳', category: 'Finance',
    access: { SuperAdmin: 'full', Admin: 'full', CountryDirector: 'read', 'Field Operation Manager (FOM)': 'submit', FinancialAdmin: 'full', ICT: 'none', ProjectManager: 'read', SeniorOperationsLead: 'read', Supervisor: 'submit', Coordinator: 'submit', DataTeam: 'read', DataCollector: 'none', Reviewer: 'none', Auditor: 'read' },
  },
  {
    name: 'Finance Hub (Reports)', nameAr: 'التقارير المالية', icon: '📈', category: 'Finance',
    access: { SuperAdmin: 'full', Admin: 'full', CountryDirector: 'read', 'Field Operation Manager (FOM)': 'read', FinancialAdmin: 'full', ICT: 'read', ProjectManager: 'full', SeniorOperationsLead: 'full', Supervisor: 'none', Coordinator: 'none', DataTeam: 'read', DataCollector: 'none', Reviewer: 'none', Auditor: 'read' },
  },
  {
    name: 'Project Flow', nameAr: 'تدفق المشاريع', icon: '🔄', category: 'Projects',
    access: { SuperAdmin: 'full', Admin: 'full', CountryDirector: 'read', 'Field Operation Manager (FOM)': 'submit', FinancialAdmin: 'none', ICT: 'full', ProjectManager: 'full', SeniorOperationsLead: 'approve', Supervisor: 'none', Coordinator: 'none', DataTeam: 'read', DataCollector: 'none', Reviewer: 'none', Auditor: 'read' },
  },
  {
    name: 'CRM (Partners)', nameAr: 'إدارة الشركاء', icon: '🤝', category: 'Projects',
    access: { SuperAdmin: 'full', Admin: 'full', CountryDirector: 'read', 'Field Operation Manager (FOM)': 'full', FinancialAdmin: 'read', ICT: 'read', ProjectManager: 'full', SeniorOperationsLead: 'read', Supervisor: 'none', Coordinator: 'none', DataTeam: 'read', DataCollector: 'none', Reviewer: 'none', Auditor: 'read' },
  },
  {
    name: 'HR & Finance Hub', nameAr: 'الموارد البشرية', icon: '👥', category: 'HR',
    access: { SuperAdmin: 'full', Admin: 'full', CountryDirector: 'none', 'Field Operation Manager (FOM)': 'none', FinancialAdmin: 'read', ICT: 'none', ProjectManager: 'none', SeniorOperationsLead: 'none', Supervisor: 'none', Coordinator: 'none', DataTeam: 'none', DataCollector: 'none', Reviewer: 'none', Auditor: 'read' },
  },
  {
    name: 'Survey Builder', nameAr: 'بناء الاستبيانات', icon: '📝', category: 'Tools',
    access: { SuperAdmin: 'full', Admin: 'full', CountryDirector: 'read', 'Field Operation Manager (FOM)': 'read', FinancialAdmin: 'none', ICT: 'full', ProjectManager: 'full', SeniorOperationsLead: 'read', Supervisor: 'read', Coordinator: 'read', DataTeam: 'full', DataCollector: 'read', Reviewer: 'read', Auditor: 'none' },
  },
  {
    name: 'Staff Directory', nameAr: 'دليل الموظفين', icon: '📔', category: 'Tools',
    access: { SuperAdmin: 'full', Admin: 'full', CountryDirector: 'read', 'Field Operation Manager (FOM)': 'read', FinancialAdmin: 'read', ICT: 'full', ProjectManager: 'read', SeniorOperationsLead: 'read', Supervisor: 'read', Coordinator: 'read', DataTeam: 'read', DataCollector: 'none', Reviewer: 'none', Auditor: 'read' },
  },
  {
    name: 'Audit & Logs', nameAr: 'سجلات التدقيق', icon: '🔍', category: 'Admin',
    access: { SuperAdmin: 'full', Admin: 'full', CountryDirector: 'none', 'Field Operation Manager (FOM)': 'none', FinancialAdmin: 'none', ICT: 'none', ProjectManager: 'read', SeniorOperationsLead: 'read', Supervisor: 'none', Coordinator: 'none', DataTeam: 'read', DataCollector: 'none', Reviewer: 'none', Auditor: 'read' },
  },
  {
    name: 'Role Management', nameAr: 'إدارة الصلاحيات', icon: '🛡️', category: 'Admin',
    access: { SuperAdmin: 'full', Admin: 'full', CountryDirector: 'none', 'Field Operation Manager (FOM)': 'none', FinancialAdmin: 'none', ICT: 'full', ProjectManager: 'none', SeniorOperationsLead: 'none', Supervisor: 'none', Coordinator: 'none', DataTeam: 'none', DataCollector: 'none', Reviewer: 'none', Auditor: 'none' },
  },
  {
    name: 'System Settings', nameAr: 'إعدادات النظام', icon: '⚙️', category: 'Admin',
    access: { SuperAdmin: 'full', Admin: 'full', CountryDirector: 'none', 'Field Operation Manager (FOM)': 'none', FinancialAdmin: 'none', ICT: 'full', ProjectManager: 'read', SeniorOperationsLead: 'read', Supervisor: 'none', Coordinator: 'none', DataTeam: 'none', DataCollector: 'none', Reviewer: 'none', Auditor: 'read' },
  },
];

// Cost Submission button-level defaults
const CS_BUTTONS: { label: string; labelAr: string; roles: string[] }[] = [
  {
    label: 'Submit Request', labelAr: 'تقديم طلب',
    roles: ['SuperAdmin', 'Admin', 'CountryDirector', 'Field Operation Manager (FOM)', 'Supervisor', 'Coordinator', 'DataTeam', 'DataCollector'],
  },
  {
    label: 'Approve T1', labelAr: 'موافقة م1',
    roles: ['SuperAdmin', 'Admin', 'CountryDirector', 'Field Operation Manager (FOM)', 'Supervisor'],
  },
  {
    label: 'Approve T2', labelAr: 'موافقة م2',
    roles: ['SuperAdmin', 'Admin', 'CountryDirector', 'Field Operation Manager (FOM)'],
  },
  {
    label: 'Approve T3', labelAr: 'موافقة م3',
    roles: ['SuperAdmin', 'Admin', 'CountryDirector'],
  },
  {
    label: 'Approve T4', labelAr: 'موافقة م4',
    roles: ['SuperAdmin', 'Admin'],
  },
  {
    label: 'Mark Paid', labelAr: 'تحديد كمدفوع',
    roles: ['SuperAdmin', 'Admin', 'FinancialAdmin'],
  },
  {
    label: 'Reconcile', labelAr: 'مطابقة',
    roles: ['SuperAdmin', 'Admin', 'FinancialAdmin'],
  },
  {
    label: 'Send to Finance', labelAr: 'إرسال للمالية',
    roles: ['SuperAdmin', 'Admin'],
  },
  {
    label: 'Recall Submission', labelAr: 'سحب الطلب',
    roles: ['SuperAdmin', 'Admin'],
  },
  {
    label: 'Revert Tier', labelAr: 'إرجاع مرحلة',
    roles: ['SuperAdmin', 'Admin'],
  },
  {
    label: 'Edit (any status)', labelAr: 'تعديل (أي حالة)',
    roles: ['SuperAdmin'],
  },
  {
    label: 'Revert Paid', labelAr: 'إرجاع دفعة',
    roles: ['SuperAdmin', 'Admin'],
  },
  {
    label: 'Delete', labelAr: 'حذف',
    roles: ['SuperAdmin'],
  },
];

const ACCESS_CONFIG: Record<AccessLevel, { label: string; icon: any; cell: string; badge: string }> = {
  full:    { label: 'Full Access',  icon: CheckCircle2, cell: 'bg-emerald-50 dark:bg-emerald-950/30',  badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  read:    { label: 'Read Only',   icon: Eye,           cell: 'bg-blue-50 dark:bg-blue-950/30',        badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  submit:  { label: 'Submit/Edit', icon: PenLine,       cell: 'bg-amber-50 dark:bg-amber-950/30',      badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  approve: { label: 'Approve',     icon: BadgeCheck,    cell: 'bg-purple-50 dark:bg-purple-950/30',    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  none:    { label: 'No Access',   icon: XCircle,       cell: 'bg-gray-50/40 dark:bg-gray-900/20',     badge: 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500' },
};

function AccessCell({ level }: { level: AccessLevel }) {
  const cfg = ACCESS_CONFIG[level];
  const Icon = cfg.icon;
  return (
    <div className={cn('w-full h-full flex items-center justify-center py-2', cfg.cell)}>
      <Icon className={cn(
        'h-4 w-4',
        level === 'full'    && 'text-emerald-600 dark:text-emerald-400',
        level === 'read'    && 'text-blue-500 dark:text-blue-400',
        level === 'submit'  && 'text-amber-500 dark:text-amber-400',
        level === 'approve' && 'text-purple-500 dark:text-purple-400',
        level === 'none'    && 'text-gray-300 dark:text-gray-600',
      )} />
    </div>
  );
}

export function RoleAccessMap() {
  const { users } = useAppContext();
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  // Count users per role
  const userCountByRole = ROLES.reduce((acc, role) => {
    const normalRole = normalizeRole(role) ?? '';
    acc[role] = users.filter(u => {
      const ur = normalizeRole(u.role || '') ?? '';
      return ur === normalRole;
    }).length;
    return acc;
  }, {} as Record<string, number>);

  const categories = Array.from(new Set(MODULES.map(m => m.category)));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Grid3X3 className="h-5 w-5 text-blue-500" />
          Role Access Map
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Complete view of what every role can see and do across all modules.
        </p>
      </div>

      <Tabs defaultValue="matrix">
        <TabsList>
          <TabsTrigger value="matrix" className="gap-2">
            <Grid3X3 className="h-4 w-4" />
            Permission Matrix
          </TabsTrigger>
          <TabsTrigger value="cost-buttons" className="gap-2">
            <BadgeCheck className="h-4 w-4" />
            Cost Submission Buttons
          </TabsTrigger>
          <TabsTrigger value="by-role" className="gap-2">
            <Map className="h-4 w-4" />
            By Role
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            User Distribution
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Full permission matrix ── */}
        <TabsContent value="matrix" className="pt-4">
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mb-4">
            {(Object.entries(ACCESS_CONFIG) as [AccessLevel, typeof ACCESS_CONFIG[AccessLevel]][]).map(([level, cfg]) => {
              const Icon = cfg.icon;
              return (
                <div key={level} className="flex items-center gap-1.5 text-xs">
                  <Icon className={cn(
                    'h-3.5 w-3.5',
                    level === 'full'    && 'text-emerald-600',
                    level === 'read'    && 'text-blue-500',
                    level === 'submit'  && 'text-amber-500',
                    level === 'approve' && 'text-purple-500',
                    level === 'none'    && 'text-gray-300',
                  )} />
                  <span className="text-muted-foreground">{cfg.label}</span>
                </div>
              );
            })}
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="sticky left-0 z-10 bg-muted/80 backdrop-blur px-3 py-2 text-left font-semibold min-w-[180px] border-r">
                    Module / Feature
                  </th>
                  {ROLES.map(role => (
                    <th
                      key={role}
                      className="px-1 py-2 text-center font-semibold min-w-[40px] border-r last:border-r-0 cursor-pointer hover:bg-primary/5"
                      onClick={() => setSelectedRole(selectedRole === role ? null : role)}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[10px]', ROLE_COLOR[role])}>
                          {ROLE_SHORT[role]}
                        </div>
                        {userCountByRole[role] > 0 && (
                          <span className="text-[9px] text-muted-foreground">{userCountByRole[role]}u</span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map(cat => (
                  <>
                    <tr key={`cat-${cat}`} className="border-b bg-muted/30">
                      <td colSpan={ROLES.length + 1} className="sticky left-0 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/30">
                        {cat}
                      </td>
                    </tr>
                    {MODULES.filter(m => m.category === cat).map((mod, i) => (
                      <tr key={mod.name} className={cn('border-b hover:bg-muted/20 transition-colors', i % 2 === 0 ? '' : 'bg-muted/10')}>
                        <td className="sticky left-0 z-10 bg-background px-3 py-1.5 border-r">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base leading-none">{mod.icon}</span>
                            <div>
                              <p className="font-medium leading-tight">{mod.name}</p>
                              <p className="text-[10px] text-muted-foreground/60 leading-tight">{mod.nameAr}</p>
                            </div>
                          </div>
                        </td>
                        {ROLES.map(role => {
                          const level = (mod.access[role] ?? 'none') as AccessLevel;
                          return (
                            <td
                              key={role}
                              className={cn(
                                'border-r last:border-r-0 text-center p-0',
                                selectedRole === role && 'ring-2 ring-inset ring-primary/30',
                              )}
                            >
                              <AccessCell level={level} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
            <Info className="h-3 w-3" />
            Click a role header to highlight its column. "Submit/Edit" means the role can create or update (but not approve). Additional access can be granted via per-user overrides.
          </p>
        </TabsContent>

        {/* ── Tab 2: Cost Submission buttons per role ── */}
        <TabsContent value="cost-buttons" className="pt-4">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="sticky left-0 z-10 bg-muted/80 backdrop-blur px-3 py-2 text-left font-semibold min-w-[200px] border-r">
                    Action Button
                  </th>
                  {ROLES.map(role => (
                    <th key={role} className="px-1 py-2 text-center font-semibold min-w-[40px] border-r last:border-r-0">
                      <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[10px] mx-auto', ROLE_COLOR[role])}>
                        {ROLE_SHORT[role]}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CS_BUTTONS.map((btn, i) => (
                  <tr key={btn.label} className={cn('border-b hover:bg-muted/20 transition-colors', i % 2 === 0 ? '' : 'bg-muted/10')}>
                    <td className="sticky left-0 z-10 bg-background px-3 py-2 border-r">
                      <p className="font-medium">{btn.label}</p>
                      <p className="text-[10px] text-muted-foreground/60">{btn.labelAr}</p>
                    </td>
                    {ROLES.map(role => {
                      const has = btn.roles.includes(role);
                      return (
                        <td key={role} className={cn('border-r last:border-r-0 text-center p-0', has ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-gray-50/40 dark:bg-gray-900/20')}>
                          <div className="flex items-center justify-center py-2">
                            {has
                              ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                              : <MinusCircle className="h-3.5 w-3.5 text-gray-200 dark:text-gray-700" />
                            }
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
            <Info className="h-3 w-3" />
            These are the default role-based permissions. Use the "Cost Submission Access" tab to grant extra button access to specific users.
          </p>
        </TabsContent>

        {/* ── Tab 3: By Role (card per role) ── */}
        <TabsContent value="by-role" className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {ROLES.map(role => {
              const accessible = MODULES.filter(m => (m.access[role] ?? 'none') !== 'none');
              const noAccess   = MODULES.filter(m => (m.access[role] ?? 'none') === 'none');
              const userCount  = userCountByRole[role] ?? 0;
              return (
                <Card key={role} className="overflow-hidden">
                  <CardHeader className="pb-2 pt-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0', ROLE_COLOR[role])}>
                          {ROLE_SHORT[role]}
                        </div>
                        <div>
                          <CardTitle className="text-sm leading-tight">{toDisplayLabel(role)}</CardTitle>
                          <p className="text-[11px] text-muted-foreground">{userCount} user{userCount !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {accessible.length}/{MODULES.length} modules
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-3 space-y-2">
                    <div className="space-y-1">
                      {accessible.map(mod => {
                        const level = (mod.access[role] ?? 'none') as AccessLevel;
                        const cfg = ACCESS_CONFIG[level];
                        return (
                          <div key={mod.name} className="flex items-center justify-between gap-2">
                            <span className="text-xs flex items-center gap-1">
                              <span className="text-sm">{mod.icon}</span>
                              {mod.name}
                            </span>
                            <Badge className={cn('text-[9px] px-1.5 py-0', cfg.badge)}>
                              {cfg.label}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                    {noAccess.length > 0 && (
                      <details className="group">
                        <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                          + {noAccess.length} restricted module{noAccess.length !== 1 ? 's' : ''}
                        </summary>
                        <div className="mt-1 space-y-0.5">
                          {noAccess.map(mod => (
                            <div key={mod.name} className="text-[11px] text-muted-foreground/60 flex items-center gap-1">
                              <XCircle className="h-2.5 w-2.5" />{mod.icon} {mod.name}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ── Tab 4: User Distribution ── */}
        <TabsContent value="users" className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Bar chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  Users per Role
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  {ROLES.map(role => {
                    const count = userCountByRole[role] ?? 0;
                    const maxCount = Math.max(...Object.values(userCountByRole), 1);
                    const pct = Math.round((count / maxCount) * 100);
                    return (
                      <div key={role} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <div className={cn('w-4 h-4 rounded-full shrink-0', ROLE_COLOR[role])} />
                            <span className="font-medium">{toDisplayLabel(role)}</span>
                          </div>
                          <span className="font-semibold tabular-nums">{count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all', ROLE_COLOR[role])}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Summary stats */}
            <div className="space-y-3">
              <Card>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <p className="text-3xl font-bold">{users.length}</p>
                      <p className="text-xs text-muted-foreground">Total Users</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold">{ROLES.length}</p>
                      <p className="text-xs text-muted-foreground">System Roles</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold">
                        {ROLES.filter(r => (userCountByRole[r] ?? 0) > 0).length}
                      </p>
                      <p className="text-xs text-muted-foreground">Populated Roles</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold">
                        {users.filter(u => {
                          const r = normalizeRole(u.role || '');
                          return !r;
                        }).length}
                      </p>
                      <p className="text-xs text-muted-foreground">Unassigned</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Role Coverage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {ROLES.filter(r => (userCountByRole[r] ?? 0) > 0)
                      .sort((a, b) => (userCountByRole[b] ?? 0) - (userCountByRole[a] ?? 0))
                      .map(role => (
                        <div key={role} className="flex items-center gap-2">
                          <div className={cn('w-3 h-3 rounded-full shrink-0', ROLE_COLOR[role])} />
                          <span className="text-xs flex-1">{toDisplayLabel(role)}</span>
                          <Badge variant="secondary" className="text-xs px-1.5">
                            {userCountByRole[role]}
                          </Badge>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
