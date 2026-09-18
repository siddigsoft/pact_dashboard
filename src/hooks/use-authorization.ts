import { useMemo } from 'react';
import { useAppContext } from '@/context/AppContext';
import { useRoleManagement } from '@/context/role-management/RoleManagementContext';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { ResourceType, ActionType } from '@/types/roles';
import { normalizeRole } from '@/utils/roleMapping';
import { useViewAs } from '@/context/ViewAsContext';
import { useCurrentUserAccessManifest } from '@/hooks/useCurrentUserAccessManifest';
import { legacySurveyActionAllowed, manifestHasExplicitActionGrant, manifestHasPermission } from '@/lib/current-user-access';

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

  let viewAsRoleRaw: string | null = null;
  let viewAsModeRaw: 'role' | 'user' | null = null;
  let viewAsUserIdRaw: string | null = null;
  try {
    const viewAsCtx = useViewAs();
    viewAsRoleRaw = viewAsCtx?.viewAs?.role ?? null;
    viewAsModeRaw = viewAsCtx?.viewAs?.mode ?? null;
    viewAsUserIdRaw = viewAsCtx?.viewAs?.userId ?? null;
  } catch {
    viewAsRoleRaw = null;
    viewAsModeRaw = null;
    viewAsUserIdRaw = null;
  }

  // The signed-in user's permissions and multi-role union come from one
  // server-derived source. View As deliberately remains a preview path; it
  // must not impersonate the target user's authenticated access context.
  const { data: manifestData, isError: manifestError, isLoading: manifestLoading } = useCurrentUserAccessManifest(
    !!currentUser?.id,
  );

  const currentAccessManifest = !manifestError && manifestData?.user_id === currentUser?.id ? manifestData : undefined;

  // Everything below is memoized so every returned function keeps a stable
  // identity between renders. Without this, `hasAnyRole` etc. get a new
  // reference on every render, and any useEffect that lists them in its deps
  // re-fires on every render (OperationsZone previously looped infinitely,
  // flooding the DB with hundreds of thousands of queries).
  return useMemo(() => {
  let viewAsRole = viewAsRoleRaw;
  let viewAsMode = viewAsModeRaw;
  let viewAsUserId = viewAsUserIdRaw;

  // SECURITY GUARD: viewAs must only be honoured for real SuperAdmins.
  // If a previous SA session left 'pact-view-as' in sessionStorage, a non-SA
  // user who opens the app would inherit the wrong role and lose visibility of
  // their own data (e.g. FOM seeing 0 cost submissions).
  // Validate against the REAL profile roles — never through viewAs itself.
  if (viewAsRole && currentUser) {
    const realRoles = currentAccessManifest?.roles ?? [];
    const isRealSA =
      realRoles.some(r => normalizeRole(r) === 'superAdmin') || isSuperAdminUser;
    if (!isRealSA) {
      viewAsRole = null;
      viewAsMode = null;
      viewAsUserId = null;
    }
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
    const roles = currentAccessManifest?.roles ?? [];
    return roles.some(r => {
      const normalized = normalizeRole(r);
      return normalized === 'superAdmin';
    });
  };

  /**
   * Check if the current user has a specific permission.
   * SuperAdmin bypasses all permission checks.
   *
   * During "View As" preview the real user's DB permission overrides must NOT
   * leak through, otherwise SA-level overrides appear on screen even when the
   * UI is supposedly showing a lower role.
   *
   * Rules when viewAs is active:
   *  • Previewing as a specific USER  → check that user's DB overrides only.
   *  • Previewing as a generic ROLE   → return false (simulated roles have no
   *    individual DB overrides; role-based access is handled by hasAnyRole /
   *    isSuperAdmin already).
   */
  const checkPermission = (resource: ResourceType, action: ActionType): boolean => {
    if (!currentUser) return false;
    if (isSuperAdmin()) return true;
    if (viewAsRole) {
      if (viewAsMode === 'user' && viewAsUserId) {
        return hasPermission(viewAsUserId, resource, action);
      }
      return false;
    }
    if (!currentAccessManifest) return false;
    // Legacy survey managers predate the role-permission registry. Preserve
    // their four lifecycle capabilities, but let an active user-level deny
    // remain authoritative over this compatibility grant.
    if (resource === 'surveys' && ['create', 'update', 'delete', 'status'].includes(action)) {
      if (legacySurveyActionAllowed(currentAccessManifest, action)) return true;
    }
    return manifestHasPermission(currentAccessManifest, resource, action);
  };

  /** Active user override grant only — excludes role-default permissions. */
  const hasExplicitActionGrant = (resource: ResourceType, action: ActionType): boolean => {
    if (!currentUser || viewAsRole) return false;
    return currentAccessManifest
      ? manifestHasExplicitActionGrant(currentAccessManifest, resource, action)
      : false;
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
    const userRoles = currentAccessManifest?.roles ?? [];
    const normalizedUserRoles = userRoles.map(r => normalizeRole(r)).filter(Boolean);
    const normalizedCheckRoles = roles.map(r => normalizeRole(r)).filter(Boolean);
    return normalizedCheckRoles.some(checkRole => normalizedUserRoles.includes(checkRole));
  };

  /**
   * Check if the current user has all of the specified roles
   * Uses role normalization to handle different naming conventions
   */
  const hasAllRoles = (roles: string[]): boolean => {
    if (!currentUser || (!viewAsRole && !currentAccessManifest)) return false;
    const userRoles = viewAsRole ? [viewAsRole] : currentAccessManifest?.roles ?? [];
    const normalizedUserRoles = userRoles.map(r => normalizeRole(r)).filter(Boolean);
    const normalizedCheckRoles = roles.map(r => normalizeRole(r)).filter(Boolean);
    return normalizedCheckRoles.every(checkRole => normalizedUserRoles.includes(checkRole));
  };

  /**
   * Get all permissions for the current user
   */
  const getCurrentUserPermissions = () => {
    if (!currentUser) return [];
    if (viewAsRole) return viewAsMode === 'user' && viewAsUserId ? getUserPermissions(viewAsUserId) : [];
    return (currentAccessManifest?.role_permissions ?? []).filter(permission =>
      manifestHasPermission(currentAccessManifest!, permission.resource, permission.action));
  };

  /**
   * Check if user can manage roles (super_admin/admin/ict only)
   */
  const canManageRoles = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('roles', 'create') || 
           checkPermission('roles', 'update') || 
           checkPermission('roles', 'delete');
  };

  /**
   * Check if user can manage users
   */
  const canManageUsers = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('users', 'create') || 
           checkPermission('users', 'update') || 
           checkPermission('users', 'delete');
  };

  /**
   * Check if user can approve MMP files
   */
  const canApproveMMP = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('mmp', 'approve');
  };

  /**
   * Check if user can manage finances
   */
  const canManageFinances = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('finances', 'update') ||
           checkPermission('finances', 'approve');
  };

  /**
   * Check if user can view all site visits
   */
  const canViewAllSiteVisits = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('site_visits', 'read');
  };

  /**
   * Check if user can create projects
   */
  const canCreateProjects = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('projects', 'create');
  };

  /**
   * Check if user can edit fee structures (super_admin/admin/ICT only)
   */
  const canEditFeeStructures = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('finances', 'update');
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
           checkPermission('cost_submissions', 'create');
  };

  const canApproveCostSubmission = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('cost_submissions', 'approve');
  };

  const canMarkCostPaid = (): boolean => {
    if (isSuperAdmin()) return true;
    // Payment is a separate financial capability. Do not fall back to role
    // names here: an explicit block in the access manifest must win.
    return checkPermission('cost_submissions', 'mark_paid') &&
           checkPermission('pre_funding', 'use_for_payment');
  };

  const canExportCostSubmissions = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('cost_submissions', 'export');
  };

  // ── Down Payments ───────────────────────────────────────────────────────
  const canSubmitDownPayment = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('down_payments', 'submit') ||
           checkPermission('down_payments', 'create');
  };

  const canApproveDownPayment = (): boolean => {
    if (isSuperAdmin()) return true;
    // checkPermission applies per-user grants/blocks before role defaults.
    // Do not append a role fallback here, otherwise an explicit button block
    // is bypassed by the user's role and the Access Control Workspace lies.
    return checkPermission('down_payments', 'approve');
  };

  /** Recording a disbursement is deliberately separate from tier approval. */
  const canMarkDownPaymentPaid = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('down_payments', 'mark_paid') &&
           checkPermission('pre_funding', 'use_for_payment');
  };

  // ── HR / Payroll / Leave ────────────────────────────────────────────────
  const canManageHR = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('hr', 'read') || checkPermission('hr', 'update');
  };

  const canManagePayroll = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('payroll', 'read') || checkPermission('payroll', 'approve');
  };

  const canApproveLeave = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('leave', 'approve');
  };

  // ── Accounting ──────────────────────────────────────────────────────────
  const canManageAccounting = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('accounting', 'read') || checkPermission('accounting', 'create');
  };

  const canWriteAccounting = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('accounting', 'create') || checkPermission('accounting', 'update');
  };

  // ── Surveys ─────────────────────────────────────────────────────────────
  const canManageSurveys = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('surveys', 'create') || checkPermission('surveys', 'update');
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
    return checkPermission('portfolio', 'read');
  };

  const canViewAnalytics = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('analytics', 'read');
  };

  // ── Notifications & Communication ───────────────────────────────────────
  const canBroadcast = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('broadcast', 'create');
  };

  const canManageWhatsApp = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('whatsapp', 'update');
  };

  // ── CRM ─────────────────────────────────────────────────────────────────
  const canManageCRM = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('crm', 'create') || checkPermission('crm', 'update');
  };

  // ── Safety & Incidents ──────────────────────────────────────────────────
  const canReportIncident = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('incidents', 'create');
  };

  // ── Tasks ───────────────────────────────────────────────────────────────
  const canAssignTasks = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('tasks', 'assign');
  };

  // ── Integrations ────────────────────────────────────────────────────────
  const canManageIntegrations = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('integrations', 'update');
  };

  // ── HR — Benefits, Succession, Pulse Surveys, HR Analytics ─────────────
  const canManageBenefits = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('benefits', 'update') || checkPermission('benefits', 'approve');
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
    return checkPermission('succession', 'update') || checkPermission('succession', 'create');
  };

  const canViewSuccession = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('succession', 'read') || canManageSuccession();
  };

  const canApproveSuccession = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('succession', 'approve');
  };

  const canManagePulseSurveys = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('pulse_surveys', 'create') || checkPermission('pulse_surveys', 'update');
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
    return checkPermission('hr_analytics', 'read');
  };

  // ── Finance — Pre-Funding, Procurement, Fixed Assets ────────────────────
  const canManagePreFunding = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('pre_funding', 'create') || checkPermission('pre_funding', 'approve');
  };

  const canViewPreFunding = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('pre_funding', 'read') || canManagePreFunding();
  };

  const canManageProcurement = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('procurement', 'create') || checkPermission('procurement', 'update');
  };

  const canApproveProcurement = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('procurement', 'approve');
  };

  const canManageFixedAssets = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('fixed_assets', 'create') || checkPermission('fixed_assets', 'update');
  };

  const canExportFixedAssets = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('fixed_assets', 'export');
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
    hasExplicitActionGrant,
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
    canMarkDownPaymentPaid,
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

    // Effective role: viewAs role when preview is active, otherwise the real user's role.
    // Use this for display labels and action-gate checks (show/hide logic).
    // Never use for DB writes — those should always record the real user's role.
    effectiveRole: (viewAsRole ?? currentUser?.role ?? null) as string | null,
    accessManifestLoading: manifestLoading,
    accessManifestError: manifestError,
  };
  }, [currentUser, hasPermission, getUserPermissions, isSuperAdminUser, viewAsRoleRaw, viewAsModeRaw, viewAsUserIdRaw, currentAccessManifest, manifestLoading, manifestError]);
};
