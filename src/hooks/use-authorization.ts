import { useAppContext } from '@/context/AppContext';
import { useRoleManagement } from '@/context/role-management/RoleManagementContext';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { ResourceType, ActionType } from '@/types/roles';
import { normalizeRole } from '@/utils/roleMapping';
import { useViewAs } from '@/context/ViewAsContext';

export const useAuthorization = () => {
  const { currentUser } = useAppContext();
  const { hasPermission, getUserPermissions } = useRoleManagement();
  
  let isSuperAdminUser = false;
  try {
    const superAdminContext = useSuperAdmin();
    isSuperAdminUser = superAdminContext?.isSuperAdmin ?? false;
  } catch {
    isSuperAdminUser = false;
  }

  let viewAsRole: string | null = null;
  try {
    const viewAsCtx = useViewAs();
    viewAsRole = viewAsCtx?.viewAs?.role ?? null;
  } catch {
    viewAsRole = null;
  }

  /**
   * Check if the current user is a SuperAdmin (highest role with all permissions)
   * Supports all variants: superAdmin, SuperAdmin, super_admin.
   * When "View As" is active for a non-SA role, this returns false so that
   * all canXxx() helpers correctly reflect the previewed role's capabilities
   * instead of silently granting all SA permissions.
   */
  const isSuperAdmin = (): boolean => {
    if (!currentUser) return false;
    // When previewing as another role, check if the VIEWED role is superAdmin —
    // NOT the real user. This stops the SA bypass from leaking into previews.
    if (viewAsRole) {
      const normalized = normalizeRole(viewAsRole);
      return normalized === 'superAdmin';
    }
    if (isSuperAdminUser) return true;
    const roles = [currentUser.role, ...(Array.isArray(currentUser.roles) ? currentUser.roles : [])];
    return roles.some(r => {
      const normalized = normalizeRole(r);
      return normalized === 'superAdmin';
    });
  };

  /**
   * Check if the current user has a specific permission
   * SuperAdmin bypasses all permission checks
   */
  const checkPermission = (resource: ResourceType, action: ActionType): boolean => {
    if (!currentUser) return false;
    if (isSuperAdmin()) return true;
    return hasPermission(currentUser.id, resource, action);
  };

  /**
   * Check if the current user has any of the specified roles
   * Uses role normalization to handle different naming conventions
   */
  const hasAnyRole = (roles: string[]): boolean => {
    if (!currentUser) return false;
    // When previewing as another role, check against the viewAs role only
    if (viewAsRole) {
      const normalizedViewAs = normalizeRole(viewAsRole);
      const normalizedCheckRoles = roles.map(r => normalizeRole(r)).filter(Boolean);
      return normalizedCheckRoles.some(r => r === normalizedViewAs);
    }
    // Include primary role + user_roles table entries + additional JSONB roles from profiles
    const additionalRoleStrings = Array.isArray(currentUser.additionalRoles)
      ? currentUser.additionalRoles.map((r: any) => r?.role).filter(Boolean)
      : [];
    const userRoles = [
      currentUser.role,
      ...(Array.isArray(currentUser.roles) ? currentUser.roles : []),
      ...additionalRoleStrings,
    ];
    const normalizedUserRoles = userRoles.map(r => normalizeRole(r)).filter(Boolean);
    const normalizedCheckRoles = roles.map(r => normalizeRole(r)).filter(Boolean);
    return normalizedCheckRoles.some(checkRole => normalizedUserRoles.includes(checkRole));
  };

  /**
   * Check if the current user has all of the specified roles
   * Uses role normalization to handle different naming conventions
   */
  const hasAllRoles = (roles: string[]): boolean => {
    if (!currentUser) return false;
    const additionalRoleStrings = Array.isArray(currentUser.additionalRoles)
      ? currentUser.additionalRoles.map((r: any) => r?.role).filter(Boolean)
      : [];
    const userRoles = [
      currentUser.role,
      ...(Array.isArray(currentUser.roles) ? currentUser.roles : []),
      ...additionalRoleStrings,
    ];
    const normalizedUserRoles = userRoles.map(r => normalizeRole(r)).filter(Boolean);
    const normalizedCheckRoles = roles.map(r => normalizeRole(r)).filter(Boolean);
    return normalizedCheckRoles.every(checkRole => normalizedUserRoles.includes(checkRole));
  };

  /**
   * Get all permissions for the current user
   */
  const getCurrentUserPermissions = () => {
    if (!currentUser) return [];
    return getUserPermissions(currentUser.id);
  };

  /**
   * Check if user can manage roles (super_admin/admin/ict only)
   */
  const canManageRoles = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('roles', 'create') || 
           checkPermission('roles', 'update') || 
           checkPermission('roles', 'delete') ||
           hasAnyRole(['admin']);
  };

  /**
   * Check if user can manage users
   */
  const canManageUsers = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('users', 'create') || 
           checkPermission('users', 'update') || 
           checkPermission('users', 'delete') ||
           hasAnyRole(['admin']);
  };

  /**
   * Check if user can approve MMP files
   */
  const canApproveMMP = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('mmp', 'approve') ||
           hasAnyRole(['admin']);
  };

  /**
   * Check if user can manage finances
   */
  const canManageFinances = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('finances', 'update') ||
           checkPermission('finances', 'approve') ||
           hasAnyRole(['admin']);
  };

  /**
   * Check if user can view all site visits
   */
  const canViewAllSiteVisits = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('site_visits', 'read') ||
           hasAnyRole(['admin']);
  };

  /**
   * Check if user can create projects
   */
  const canCreateProjects = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('projects', 'create') ||
           hasAnyRole(['admin']);
  };

  /**
   * Check if user can edit fee structures (super_admin/admin/ICT only)
   */
  const canEditFeeStructures = (): boolean => {
    if (isSuperAdmin()) return true;
    return hasAnyRole(['admin', 'Admin', 'ict', 'ICT', 'SuperAdmin', 'super_admin']);
  };

  /**
   * Check if user can manage super admins (super_admin only)
   */
  const canManageSuperAdmins = (): boolean => {
    return isSuperAdmin();
  };

  /**
   * Check if user can view audit logs
   */
  const canViewAuditLogs = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('audit_logs', 'read');
  };

  /**
   * Check if user can restore deleted records
   */
  const canRestoreRecords = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('audit_logs', 'restore');
  };

  /**
   * Check if user can override system actions
   */
  const canOverrideSystem = (): boolean => {
    return isSuperAdmin();
  };

  /**
   * Check if user can manage all wallets
   */
  const canManageAllWallets = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('wallets', 'update') || checkPermission('wallets', 'approve');
  };

  // ── Cost Submissions ────────────────────────────────────────────────────
  const canSubmitCostRequest = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('cost_submissions', 'submit') ||
           checkPermission('cost_submissions', 'create') ||
           hasAnyRole(['admin', 'supervisor', 'coordinator', 'fom', 'dataCollector', 'dataTeam', 'countryDirector',
                       'Field Operation Manager (FOM)', 'DataCollector', 'DataTeam']);
  };

  const canApproveCostSubmission = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('cost_submissions', 'approve') ||
           hasAnyRole(['admin', 'fom', 'supervisor', 'countryDirector',
                       'Field Operation Manager (FOM)', 'SeniorOperationsLead']);
  };

  const canMarkCostPaid = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('cost_submissions', 'approve') &&
           hasAnyRole(['admin', 'financialAdmin', 'FinancialAdmin']);
  };

  const canExportCostSubmissions = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('cost_submissions', 'export') ||
           hasAnyRole(['admin', 'financialAdmin', 'auditor', 'fom', 'supervisor', 'countryDirector']);
  };

  // ── Down Payments ───────────────────────────────────────────────────────
  const canSubmitDownPayment = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('down_payments', 'submit') ||
           checkPermission('down_payments', 'create') ||
           hasAnyRole(['admin', 'fom', 'supervisor', 'coordinator',
                       'Field Operation Manager (FOM)']);
  };

  const canApproveDownPayment = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('down_payments', 'approve') ||
           hasAnyRole(['admin', 'financialAdmin', 'countryDirector',
                       'FinancialAdmin', 'CountryDirector']);
  };

  // ── HR / Payroll / Leave ────────────────────────────────────────────────
  const canManageHR = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('hr', 'read') || checkPermission('hr', 'update') ||
           hasAnyRole(['admin', 'Admin']);
  };

  const canManagePayroll = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('payroll', 'read') || checkPermission('payroll', 'approve') ||
           hasAnyRole(['admin', 'financialAdmin', 'Admin', 'FinancialAdmin']);
  };

  const canApproveLeave = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('leave', 'approve') ||
           hasAnyRole(['admin', 'supervisor', 'Admin', 'Supervisor']);
  };

  // ── Accounting ──────────────────────────────────────────────────────────
  const canManageAccounting = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('accounting', 'read') || checkPermission('accounting', 'create') ||
           hasAnyRole(['admin', 'financialAdmin', 'auditor', 'Admin', 'FinancialAdmin', 'Auditor']);
  };

  const canWriteAccounting = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('accounting', 'create') || checkPermission('accounting', 'update') ||
           hasAnyRole(['admin', 'financialAdmin', 'Admin', 'FinancialAdmin']);
  };

  // ── Surveys ─────────────────────────────────────────────────────────────
  const canManageSurveys = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('surveys', 'create') || checkPermission('surveys', 'update') ||
           hasAnyRole(['admin', 'ict', 'dataTeam', 'projectManager',
                       'Admin', 'ICT', 'DataTeam', 'ProjectManager']);
  };

  const canViewSurveys = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('surveys', 'read') || canManageSurveys();
  };

  const canSubmitSurveyResponse = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('surveys', 'submit') || checkPermission('surveys', 'read');
  };

  // ── Portfolio & Analytics ───────────────────────────────────────────────
  const canViewPortfolio = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('portfolio', 'read') ||
           hasAnyRole(['admin', 'fom', 'countryDirector', 'projectManager',
                       'Field Operation Manager (FOM)', 'CountryDirector', 'ProjectManager']);
  };

  const canViewAnalytics = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('analytics', 'read') ||
           hasAnyRole(['admin', 'fom', 'countryDirector', 'projectManager', 'dataTeam',
                       'Field Operation Manager (FOM)', 'SeniorOperationsLead']);
  };

  // ── Notifications & Communication ───────────────────────────────────────
  const canBroadcast = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('broadcast', 'create') ||
           hasAnyRole(['admin', 'Admin']);
  };

  const canManageWhatsApp = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('whatsapp', 'update') ||
           hasAnyRole(['admin', 'ict', 'Admin', 'ICT']);
  };

  // ── CRM ─────────────────────────────────────────────────────────────────
  const canManageCRM = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('crm', 'create') || checkPermission('crm', 'update') ||
           hasAnyRole(['admin', 'fom', 'projectManager', 'countryDirector',
                       'Admin', 'Field Operation Manager (FOM)', 'ProjectManager']);
  };

  // ── Safety & Incidents ──────────────────────────────────────────────────
  const canReportIncident = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('incidents', 'create') ||
           hasAnyRole(['admin', 'fom', 'supervisor', 'coordinator', 'dataCollector',
                       'Field Operation Manager (FOM)', 'Supervisor', 'Coordinator', 'DataCollector']);
  };

  // ── Tasks ───────────────────────────────────────────────────────────────
  const canAssignTasks = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('tasks', 'assign') ||
           hasAnyRole(['admin', 'fom', 'projectManager', 'countryDirector',
                       'Admin', 'Field Operation Manager (FOM)', 'ProjectManager']);
  };

  // ── Integrations ────────────────────────────────────────────────────────
  const canManageIntegrations = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('integrations', 'update') ||
           hasAnyRole(['admin', 'ict', 'Admin', 'ICT']);
  };

  // ── HR — Benefits, Succession, Pulse Surveys, HR Analytics ─────────────
  const canManageBenefits = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('benefits', 'update') || checkPermission('benefits', 'approve') ||
           hasAnyRole(['admin', 'Admin']);
  };

  const canViewBenefits = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('benefits', 'read') || canManageBenefits();
  };

  const canEnrollBenefits = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('benefits', 'submit') || checkPermission('benefits', 'read');
  };

  const canManageSuccession = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('succession', 'update') || checkPermission('succession', 'create') ||
           hasAnyRole(['admin', 'Admin', 'seniorOperationsLead', 'SeniorOperationsLead']);
  };

  const canViewSuccession = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('succession', 'read') || canManageSuccession();
  };

  const canApproveSuccession = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('succession', 'approve') ||
           hasAnyRole(['admin', 'countryDirector', 'Admin', 'CountryDirector']);
  };

  const canManagePulseSurveys = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('pulse_surveys', 'create') || checkPermission('pulse_surveys', 'update') ||
           hasAnyRole(['admin', 'ict', 'Admin', 'ICT']);
  };

  const canViewPulseSurveys = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('pulse_surveys', 'read') || canManagePulseSurveys();
  };

  const canRespondToPulseSurvey = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('pulse_surveys', 'submit') || checkPermission('pulse_surveys', 'read');
  };

  const canViewHRAnalytics = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('hr_analytics', 'read') ||
           hasAnyRole(['admin', 'countryDirector', 'Admin', 'CountryDirector']);
  };

  // ── Finance — Pre-Funding, Procurement, Fixed Assets ────────────────────
  const canManagePreFunding = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('pre_funding', 'create') || checkPermission('pre_funding', 'approve') ||
           hasAnyRole(['admin', 'financialAdmin', 'Admin', 'FinancialAdmin']);
  };

  const canViewPreFunding = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('pre_funding', 'read') || canManagePreFunding();
  };

  const canManageProcurement = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('procurement', 'create') || checkPermission('procurement', 'update') ||
           hasAnyRole(['admin', 'financialAdmin', 'Admin', 'FinancialAdmin']);
  };

  const canApproveProcurement = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('procurement', 'approve') ||
           hasAnyRole(['admin', 'financialAdmin', 'countryDirector',
                       'Admin', 'FinancialAdmin', 'CountryDirector']);
  };

  const canManageFixedAssets = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('fixed_assets', 'create') || checkPermission('fixed_assets', 'update') ||
           hasAnyRole(['admin', 'financialAdmin', 'Admin', 'FinancialAdmin']);
  };

  const canExportFixedAssets = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('fixed_assets', 'export') ||
           hasAnyRole(['admin', 'financialAdmin', 'auditor', 'Admin', 'FinancialAdmin', 'Auditor']);
  };

  /**
   * Higher-order component for conditional rendering based on permissions
   */
  const withPermission = (
    resource: ResourceType, 
    action: ActionType, 
    fallback?: React.ReactNode
  ) => {
    return (component: React.ReactNode) => {
      return checkPermission(resource, action) ? component : (fallback || null);
    };
  };

  /**
   * Higher-order component for conditional rendering based on roles
   */
  const withRole = (
    roles: string[], 
    fallback?: React.ReactNode
  ) => {
    return (component: React.ReactNode) => {
      return hasAnyRole(roles) ? component : (fallback || null);
    };
  };

  return {
    // Core permission checks
    checkPermission,
    hasAnyRole,
    hasAllRoles,
    getCurrentUserPermissions,
    isSuperAdmin,

    // Administration
    canManageRoles,
    canManageUsers,
    canManageSuperAdmins,
    canViewAuditLogs,
    canRestoreRecords,
    canOverrideSystem,
    canEditFeeStructures,
    canManageIntegrations,

    // Programme & Projects
    canApproveMMP,
    canCreateProjects,
    canViewPortfolio,
    canViewAnalytics,

    // Finance
    canManageFinances,
    canManageAllWallets,
    canSubmitCostRequest,
    canApproveCostSubmission,
    canMarkCostPaid,
    canExportCostSubmissions,
    canSubmitDownPayment,
    canApproveDownPayment,
    canManageAccounting,
    canWriteAccounting,
    canManagePreFunding,
    canViewPreFunding,
    canManageProcurement,
    canApproveProcurement,
    canManageFixedAssets,
    canExportFixedAssets,

    // Field ops
    canViewAllSiteVisits,
    canReportIncident,

    // HR
    canManageHR,
    canManagePayroll,
    canApproveLeave,
    canManageBenefits,
    canViewBenefits,
    canEnrollBenefits,
    canManageSuccession,
    canViewSuccession,
    canApproveSuccession,
    canManagePulseSurveys,
    canViewPulseSurveys,
    canRespondToPulseSurvey,
    canViewHRAnalytics,

    // Tools & communication
    canManageSurveys,
    canViewSurveys,
    canSubmitSurveyResponse,
    canBroadcast,
    canManageWhatsApp,
    canManageCRM,
    canAssignTasks,

    // HOCs for conditional rendering
    withPermission,
    withRole,

    // User info
    currentUser,
    isAuthenticated: !!currentUser,
  };
};