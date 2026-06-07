import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCompanyOptional } from '../context/CompanyContext';
import { isLocalOnlyMode } from '../config/apiUrl';
import {
  type Permission,
  permissionsForRole,
  resolveEnterpriseRole,
  roleHasPermission,
  ENTERPRISE_ROLE_LABELS,
} from '../shared/rbac/permissions';

export function usePermissions() {
  const { user } = useAuth();
  const companyCtx = useCompanyOptional();

  const role = useMemo(() => {
    if (user?.role) return user.role;
    if (isLocalOnlyMode() && companyCtx?.authenticatedUser?.role) {
      return companyCtx.authenticatedUser.role;
    }
    return 'Read Only User';
  }, [user?.role, companyCtx?.authenticatedUser?.role]);

  return useMemo(() => {
    const enterpriseRole = resolveEnterpriseRole(role);
    const permissions = permissionsForRole(role);
    const has = (permission: Permission) => roleHasPermission(role, permission);
    return {
      role,
      enterpriseRole,
      enterpriseRoleLabel: ENTERPRISE_ROLE_LABELS[enterpriseRole],
      permissions,
      has,
      canReadTrialBalance: has('reports.trial_balance.read'),
      canReadBalanceSheet: has('reports.balance_sheet.read'),
      canReadProfitLoss: has('reports.profit_loss.read'),
      canReadCashFlow: has('reports.cash_flow.read'),
      canReadPayroll: has('payroll.read'),
      canWritePayroll: has('payroll.write'),
      canReadUsers: has('users.read'),
      canManageUsers: has('users.manage'),
      canReadBilling: has('billing.read'),
      canManageBilling: has('billing.manage'),
      canReadAuditLogs: has('audit_logs.read'),
      canWriteFinancial: has('financial.write'),
      canReadPermissions: has('permissions.read'),
      canReadBackups: has('backups.read'),
      canManageBackups: has('backups.manage'),
    };
  }, [role]);
}
