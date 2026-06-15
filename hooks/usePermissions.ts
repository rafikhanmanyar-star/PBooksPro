import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  type Permission,
  permissionsForRole,
  resolveEnterpriseRole,
  roleHasPermission,
  roleCanWriteProjectSelling,
  ENTERPRISE_ROLE_LABELS,
} from '../shared/rbac/permissions';

export function usePermissions() {
  const { user } = useAuth();

  const role = useMemo(() => {
    if (user?.role) return user.role;
    return 'Read Only User';
  }, [user?.role]);

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
      /** Matches backend requireBillingRead() — billing.read or users.read */
      canAccessBillingPortal: has('billing.read') || has('users.read'),
      canReadAuditLogs: has('audit_logs.read'),
      canWriteFinancial: has('financial.write'),
      canReadProjectSelling: has('project_selling.read') || has('financial.write'),
      canWriteProjectSellingMarketingPlans:
        has('project_selling.marketing_plans.write') || has('financial.write'),
      canWriteProjectSellingAgreements:
        has('project_selling.agreements.write') || has('financial.write'),
      canWriteProjectSellingInvoices:
        has('project_selling.invoices.write') || has('financial.write'),
      canReceiveProjectSellingPayments:
        has('project_selling.payments.receive') || has('financial.write'),
      canWriteProjectSelling: roleCanWriteProjectSelling(role),
      canReadPermissions: has('permissions.read'),
      canReadBackups: has('backups.read'),
      canManageBackups: has('backups.manage'),
      canReadPeV: has('pev.read'),
      canCreatePeV: has('pev.create'),
      canApprovePeV: has('pev.approve'),
      canPostPeV: has('pev.post'),
    };
  }, [role]);
}
