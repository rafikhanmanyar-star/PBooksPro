import { useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';

import { useAuth } from '../context/AuthContext';

import {

  type Permission,

  permissionsForRole,

  resolveEnterpriseRole,

  roleHasPermission,

  permissionSetHas,

  roleCanWriteProjectSelling,

  roleCanReadProjectSellingCatalog,

  roleCanWriteProjectSellingCatalog,

  roleCanViewAllMarketingPlans,

  roleCanApproveMarketingPlans,

  ENTERPRISE_ROLE_LABELS,

} from '../shared/rbac/permissions';

import { permissionsApi } from '../services/api/permissionsApi';



export function usePermissions() {

  const { user, isAuthenticated } = useAuth();



  const role = useMemo(() => {

    if (user?.role) return user.role;

    return 'Read Only User';

  }, [user?.role]);



  const resolvedQuery = useQuery({

    queryKey: ['permissions', 'me', user?.id, user?.tenantId],

    queryFn: () => permissionsApi.getMyPermissions(),

    enabled: isAuthenticated && !!user?.id,

    staleTime: 60_000,

  });



  const resolvedPermissions = resolvedQuery.data?.permissions;



  return useMemo(() => {

    const enterpriseRole = resolveEnterpriseRole(

      resolvedQuery.data?.enterpriseRole ?? role

    );

    const staticPermissions = permissionsForRole(role);

    const permissions =

      resolvedPermissions && resolvedPermissions.length > 0

        ? resolvedPermissions

        : staticPermissions;

    const has = (permission: Permission) => {

      if (resolvedPermissions && resolvedPermissions.length > 0) {

        return permissionSetHas(resolvedPermissions, permission);

      }

      return roleHasPermission(role, permission);

    };

    return {

      role,

      enterpriseRole,

      enterpriseRoleLabel: ENTERPRISE_ROLE_LABELS[enterpriseRole],

      permissions,

      has,

      permissionsLoading: resolvedQuery.isLoading,

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

      canReadProjectSellingCatalog:
        has('financial.write') ||
        has('project_selling.read') ||
        has('project_selling.catalog.write') ||
        has('project_selling.marketing_plans.write') ||
        has('project_selling.agreements.write') ||
        roleCanReadProjectSellingCatalog(role),

      canWriteProjectSellingCatalog:
        has('financial.write') ||
        has('project_selling.catalog.write') ||
        has('project_selling.marketing_plans.write') ||
        has('project_selling.agreements.write') ||
        roleCanWriteProjectSellingCatalog(role),

      canWriteProjectSellingMarketingPlans:

        has('project_selling.marketing_plans.write') || has('financial.write'),

      canWriteProjectSellingAgreements:

        has('project_selling.agreements.write') || has('financial.write'),

      canWriteProjectSellingInvoices:

        has('project_selling.invoices.write') || has('financial.write'),

      canReceiveProjectSellingPayments:

        has('project_selling.payments.receive') || has('financial.write'),

      canWriteProjectSelling: roleCanWriteProjectSelling(role),

      canViewAllMarketingPlans: roleCanViewAllMarketingPlans(role) || has('financial.write'),

      canApproveMarketingPlans: roleCanApproveMarketingPlans(role) || has('financial.write'),

      canReadPermissions: has('permissions.read') || has('permissions.view'),

      canViewPermissionCatalog: has('permissions.view') || has('permissions.read'),

      canManagePermissions: has('permissions.manage'),

      canViewRoles: has('roles.view') || has('permissions.manage'),

      canManageRoles: has('roles.manage') || has('permissions.manage'),

      canAssignUserRoles: has('users.role.assign') || has('users.manage') || has('permissions.manage'),

      canReadBackups: has('backups.read'),

      canManageBackups: has('backups.manage'),

      canReadPeV: has('pev.read'),

      canCreatePeV: has('pev.create'),

      canApprovePeV: has('pev.approve'),

      canPostPeV: has('pev.post'),

      canCompareQuotations: has('procurement.quotations.compare'),

      canCreateQuotation: has('procurement.quotations.create'),

      canEditQuotation: has('procurement.quotations.edit'),

      canSelectQuotation: has('procurement.quotations.select'),

      canApproveQuotation: has('procurement.quotations.approve'),

      canViewPurchaseOrders: has('purchase_order.view'),

      canCreatePurchaseOrder: has('purchase_order.create'),

      canEditPurchaseOrder: has('purchase_order.edit'),

      canApprovePurchaseOrder: has('purchase_order.approve'),

      canCancelPurchaseOrder: has('purchase_order.cancel'),

      canViewWorkflow: has('workflow.view'),

      canApproveWorkflow: has('workflow.approve'),

      canManageWorkflow: has('workflow.manage'),

      canAdminWorkflow: has('workflow.admin'),

      canViewGoodsReceipt: has('goods_receipt.view'),

      canCreateGoodsReceipt: has('goods_receipt.create'),

      canEditGoodsReceipt: has('goods_receipt.edit'),

      canPostGoodsReceipt: has('goods_receipt.post'),

      canCloseGoodsReceipt: has('goods_receipt.close'),

    };

  }, [role, resolvedPermissions, resolvedQuery.data?.enterpriseRole, resolvedQuery.isLoading]);

}


