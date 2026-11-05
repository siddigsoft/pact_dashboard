import { useAuthorization } from '@/hooks/use-authorization';

/**
 * Org-wide Pre-Funding catalogue visibility.
 * pre_funding:create (the finance team) or an explicit pre_funding:read grant
 * unlocks the org-wide lists — role-default read does not. Mirrors RLS.
 */
export function usePreFundOrgAccess() {
  const { checkPermission, hasExplicitActionGrant } = useAuthorization();
  const isFinanceAdmin = checkPermission('pre_funding', 'create');
  const hasGrantedOrgPreFundView = hasExplicitActionGrant('pre_funding', 'read');
  const canViewOrgPreFunds = isFinanceAdmin || hasGrantedOrgPreFundView;
  return { isFinanceAdmin, hasGrantedOrgPreFundView, canViewOrgPreFunds };
}
