import { useAuthorization } from '@/hooks/use-authorization';

/**
 * Org-wide Pre-Funding catalogue visibility.
 * Explicit Access Control pre_funding:read (page grant) unlocks the same
 * org-wide lists finance admins see — not role-default permissions.
 */
export function usePreFundOrgAccess() {
  const { hasAnyRole, hasExplicitActionGrant } = useAuthorization();
  const isFinanceAdmin = hasAnyRole(['super_admin', 'admin', 'financialAdmin']);
  const hasGrantedOrgPreFundView = hasExplicitActionGrant('pre_funding', 'read');
  const canViewOrgPreFunds = isFinanceAdmin || hasGrantedOrgPreFundView;
  return { isFinanceAdmin, hasGrantedOrgPreFundView, canViewOrgPreFunds };
}
