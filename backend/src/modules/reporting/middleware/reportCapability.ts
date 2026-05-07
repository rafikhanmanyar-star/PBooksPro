/** Fine-grained report builder ACL (role-based today; maps to JWT `role`). Extensible via `feature_permissions` DB column later. */

export type ReportCapability = {
  canCreateTemplates: boolean;
  canExportFiles: boolean;
  canPublishPublicTemplates: boolean;
};

export function getReportCapability(role: string | undefined): ReportCapability {
  const r = (role ?? '').toLowerCase();
  const adminLike = r === 'admin' || r === 'super_admin';
  const finance = adminLike || r === 'accountant' || r === 'accounts';
  return {
    canCreateTemplates: finance,
    canExportFiles: finance,
    canPublishPublicTemplates: adminLike,
  };
}
