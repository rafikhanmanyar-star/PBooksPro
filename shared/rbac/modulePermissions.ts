/**
 * Central module permission registry — single source of truth for which permission
 * key gates each UI module/section.
 *
 * Rules:
 * - Menus, route guards, and PermissionGuard must reference these constants.
 * - Do NOT scatter raw permission strings across component files.
 * - One permission per module; compound checks (OR logic) belong in usePermissions.ts.
 */
import type { Permission } from './permissions';

export const MODULE_PERMISSIONS = {
  // ── Core modules ────────────────────────────────────────────────────────────
  dashboard: 'dashboard.read' as Permission,
  generalLedger: 'accounting.read' as Permission,
  accounting: 'accounting.read' as Permission,
  budgetPlanner: 'accounting.read' as Permission,
  payroll: 'payroll.read' as Permission,
  procurement: 'procurement.read' as Permission,
  projectConstruction: 'construction.read' as Permission,
  projectSelling: 'project_selling.read' as Permission,
  rental: 'rental.read' as Permission,
  reportsFinancial: 'reports.financial.read' as Permission,

  // ── Administration (Settings page sections) ─────────────────────────────────
  users: 'users.read' as Permission,
  roles: 'roles.view' as Permission,
  securityRoles: 'roles.manage' as Permission,
  permissionCatalog: 'permissions.view' as Permission,
  permissionMatrix: 'permissions.manage' as Permission,
  auditTrail: 'audit_logs.read' as Permission,
  backups: 'backups.read' as Permission,
  billing: 'billing.read' as Permission,

  // ── Platform-only (never visible to tenant users) ────────────────────────────
  subscriptionAdmin: 'platform.admin' as Permission,
  systemHealthCenter: 'platform.admin' as Permission,
  referralAdmin: 'platform.admin' as Permission,
} as const;

export type ModuleKey = keyof typeof MODULE_PERMISSIONS;
