/**
 * Fine-grained report builder ACL — delegates to enterprise permission matrix.
 */
import { roleHasPermission } from '../../../auth/permissions.js';

export type ReportCapability = {
  canCreateTemplates: boolean;
  canExportFiles: boolean;
  canPublishPublicTemplates: boolean;
};

export function getReportCapability(role: string | undefined): ReportCapability {
  const financeRead = roleHasPermission(role, 'reports.profit_loss.read');
  const adminLike =
    roleHasPermission(role, 'users.manage') || roleHasPermission(role, 'permissions.manage');
  return {
    canCreateTemplates: financeRead && roleHasPermission(role, 'financial.write'),
    canExportFiles: financeRead,
    canPublishPublicTemplates: adminLike,
  };
}
