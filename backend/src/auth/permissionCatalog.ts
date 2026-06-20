/**
 * AUTO-GENERATED — do not edit. Source: shared/rbac/permissionCatalog.ts
 * Regenerate: node scripts/ensure-shared-financial-cores.mjs
 */

/**
 * RBAC 2.0 — permission catalog registry (Phase 1 metadata only).
 * Registers v1 runtime keys and v2 hierarchical keys (feature / page / action).
 */

import {
  ALL_PERMISSIONS,
  PERMISSION_LABELS,
  type Permission,
} from './permissions.js';
import {
  BUNDLE_REGISTRY,
  FINANCIAL_WRITE_BUNDLE,
  PERSONAL_FINANCE_STANDALONE,
  PROJECT_MANAGER_FINANCIAL_BUNDLE,
} from './permissionBundles.js';
import { ALL_SOD_PAIRS, collectSodReferencedKeys } from './sodPairs.js';
import type {
  PermissionCatalogEntry,
  PermissionLayer,
  PermissionRiskLevel,
  SecurityCatalogPayload,
} from './permissionTypes.js';

const FEATURE_LABELS: Record<string, string> = {
  reports: 'Reports',
  payroll: 'Payroll',
  users: 'Users',
  billing: 'Billing',
  audit_logs: 'Audit logs',
  financial: 'Financial (legacy bundle)',
  permissions: 'Permissions',
  roles: 'Roles',
  backups: 'Backups',
  pev: 'Project expense vouchers',
  contracts: 'Contracts',
  project_selling: 'Project selling',
  procurement: 'Procurement',
  purchase_order: 'Purchase orders (v1)',
  workflow: 'Workflow',
  goods_receipt: 'Goods receipts',
  accounting: 'Accounting',
  property: 'Property',
  rental: 'Rental',
  projects: 'Projects',
  customers: 'Customers',
  administration: 'Administration',
  personal: 'Personal finance',
  approve: 'Payment approvals',
};

/** v2 keys from PRIVILEGE_CEILING.md restricted registry (catalog only). */
const PRIVILEGE_CEILING_V2_KEYS = [
  'permissions.delegate',
  'administration.roles.edit',
  'administration.scopes.edit',
  'administration.scopes.delegate',
  'administration.backups.restore',
  'administration.audit.export',
  'audit_logs.rbac.read',
  'roles.assign.temporary',
  'roles.template.create',
  'roles.template.manage',
  'administration.approvals.final',
] as const;

/** SoD and approval keys not in FINANCIAL_WRITE_BUNDLE (explicit approve permissions). */
const SOD_SUPPLEMENTAL_V2_KEYS = [
  'payroll.runs.create',
  'payroll.runs.approve',
  'payroll.runs.view',
  'payroll.access',
  'procurement.purchase_orders.create',
  'procurement.purchase_orders.approve',
  'procurement.purchase_orders.view',
  'procurement.bills.approve',
  'accounting.journals.approve',
  'approve.payments',
  'rental.agreements.approve',
  'project_selling.agreements.create',
  'project_selling.agreements.approve',
] as const;

function titleCase(segment: string): string {
  return segment
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function parseKeySegments(key: string): { feature: string; page?: string; action?: string } {
  const parts = key.split('.');
  if (parts.length === 1) {
    return { feature: parts[0]! };
  }
  if (parts.length === 2) {
    const [feature, second] = parts;
    if (second === 'access') {
      return { feature: feature!, page: undefined, action: 'access' };
    }
    if (second === 'read' || second === 'write' || second === 'manage' || second === 'view') {
      return { feature: feature!, page: second, action: second };
    }
    return { feature: feature!, page: second };
  }
  const [feature, page, ...rest] = parts;
  return { feature: feature!, page, action: rest.join('.') || undefined };
}

function inferLayer(key: string, segments: ReturnType<typeof parseKeySegments>): PermissionLayer {
  if (key.endsWith('.access')) return 'feature';
  if (segments.action === 'access') return 'feature';
  if (key.endsWith('.view') || key.endsWith('.read')) return 'page';
  if (segments.page === 'read' || segments.page === 'write' || segments.page === 'manage') {
    return 'page';
  }
  return 'action';
}

function inferRiskLevel(key: string): PermissionRiskLevel {
  if (
    key.includes('.approve') ||
    key.startsWith('approve.') ||
    key.includes('.manage') ||
    key.includes('.delegate') ||
    key.includes('.restore') ||
    key.includes('permissions.manage') ||
    key.includes('roles.manage') ||
    key.includes('users.role.assign') ||
    key.includes('.reverse') ||
    key.includes('periods.close') ||
    key.includes('break_glass')
  ) {
    return 'critical';
  }
  if (key.includes('.delete') || key.includes('.create') || key.includes('.edit') || key.includes('.write')) {
    return 'high';
  }
  if (key.includes('.view') || key.includes('.read')) {
    return 'low';
  }
  return 'medium';
}

function labelFromKey(key: string, segments: ReturnType<typeof parseKeySegments>): string {
  const v1Label = PERMISSION_LABELS[key as Permission];
  if (v1Label) return v1Label;

  const featureLabel = FEATURE_LABELS[segments.feature] ?? titleCase(segments.feature);
  if (segments.action === 'access') {
    return `${featureLabel} (access)`;
  }
  if (!segments.page) {
    return titleCase(key.replace(/\./g, ' '));
  }
  const pageLabel = titleCase(segments.page);
  if (!segments.action || segments.action === segments.page) {
    return `${featureLabel} — ${pageLabel}`;
  }
  return `${featureLabel} — ${pageLabel} (${segments.action})`;
}

function buildEntry(
  key: string,
  overrides: Partial<PermissionCatalogEntry> = {}
): PermissionCatalogEntry {
  const segments = parseKeySegments(key);
  const layer = overrides.layer ?? inferLayer(key, segments);
  return {
    key,
    label: overrides.label ?? labelFromKey(key, segments),
    layer,
    feature: overrides.feature ?? segments.feature,
    page: overrides.page ?? segments.page,
    action: overrides.action ?? (layer === 'action' ? segments.action : undefined),
    riskLevel: overrides.riskLevel ?? inferRiskLevel(key),
    ...overrides,
  };
}

function buildV1Entries(): PermissionCatalogEntry[] {
  return ALL_PERMISSIONS.map((key) => {
    const segments = parseKeySegments(key);
    const layer: PermissionLayer =
      key === 'financial.write' ? 'feature' : inferLayer(key, segments);
    const entry = buildEntry(key, {
      layer,
      runtimeV1: true,
      riskLevel: key === 'financial.write' ? 'high' : inferRiskLevel(key),
    });
    if (key === 'financial.write') {
      return {
        ...entry,
        aliasOf: undefined,
        impliedBy: [...FINANCIAL_WRITE_BUNDLE],
        notes: 'v1 bundle alias — expands via permissionBundles.ts (Phase 3+). Excludes personal.finance.* and approve keys.',
        deprecated: false,
      };
    }
    return entry;
  });
}

function buildFinancialWriteBundleEntries(): PermissionCatalogEntry[] {
  return FINANCIAL_WRITE_BUNDLE.map((key) =>
    buildEntry(key, {
      impliedBy: ['financial.write'],
      notes: 'Included in FINANCIAL_WRITE_BUNDLE (§2).',
    })
  );
}

function buildPersonalFinanceEntries(): PermissionCatalogEntry[] {
  return PERSONAL_FINANCE_STANDALONE.map((key) =>
    buildEntry(key, {
      notes: 'Standalone — excluded from FINANCIAL_WRITE_BUNDLE (§12). Default grant: company_admin only.',
      riskLevel: 'medium',
    })
  );
}

function buildSupplementalV2Entries(existing: Set<string>): PermissionCatalogEntry[] {
  const entries: PermissionCatalogEntry[] = [];
  const addIfMissing = (key: string, overrides?: Partial<PermissionCatalogEntry>) => {
    if (existing.has(key)) return;
    existing.add(key);
    entries.push(buildEntry(key, overrides));
  };

  for (const key of SOD_SUPPLEMENTAL_V2_KEYS) {
    addIfMissing(key, {
      notes: 'Registered for SoD matrix / approval flows — not in FINANCIAL_WRITE_BUNDLE.',
      riskLevel: key.includes('approve') || key.startsWith('approve.') ? 'critical' : inferRiskLevel(key),
    });
  }

  for (const key of PRIVILEGE_CEILING_V2_KEYS) {
    addIfMissing(key, {
      notes: 'Restricted permission — privilege ceiling registry (PRIVILEGE_CEILING.md).',
      riskLevel: 'critical',
    });
  }

  return entries;
}

function mergeCatalogEntries(): PermissionCatalogEntry[] {
  const byKey = new Map<string, PermissionCatalogEntry>();

  const add = (entry: PermissionCatalogEntry) => {
    const prev = byKey.get(entry.key);
    if (!prev) {
      byKey.set(entry.key, entry);
      return;
    }
    byKey.set(entry.key, { ...prev, ...entry, notes: [prev.notes, entry.notes].filter(Boolean).join(' ') });
  };

  for (const entry of buildV1Entries()) add(entry);
  for (const entry of buildFinancialWriteBundleEntries()) add(entry);
  for (const entry of buildPersonalFinanceEntries()) add(entry);

  const keySet = new Set(byKey.keys());
  for (const entry of buildSupplementalV2Entries(keySet)) add(entry);

  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export const PERMISSION_CATALOG: readonly PermissionCatalogEntry[] = mergeCatalogEntries();

export const CATALOG_KEY_SET: ReadonlySet<string> = new Set(PERMISSION_CATALOG.map((e) => e.key));

export function getCatalogEntry(key: string): PermissionCatalogEntry | undefined {
  return PERMISSION_CATALOG.find((e) => e.key === key);
}

export function buildFeatureTree(
  permissions: readonly PermissionCatalogEntry[] = PERMISSION_CATALOG
): SecurityCatalogPayload['features'] {
  const features: SecurityCatalogPayload['features'] = {};

  for (const entry of permissions) {
    const featureKey = entry.feature;
    if (!features[featureKey]) {
      features[featureKey] = {
        label: FEATURE_LABELS[featureKey] ?? titleCase(featureKey),
        pages: {},
      };
    }
    const featureNode = features[featureKey]!;

    if (entry.layer === 'feature') {
      featureNode.featureAccess = entry;
      continue;
    }

    const pageKey = entry.page ?? '_root';
    if (!featureNode.pages[pageKey]) {
      featureNode.pages[pageKey] = {
        label: pageKey === '_root' ? featureNode.label : titleCase(pageKey),
        permissions: [],
      };
    }
    featureNode.pages[pageKey]!.permissions.push(entry);
  }

  return features;
}

export function buildSecurityCatalogPayload(): SecurityCatalogPayload {
  return {
    version: '2.0',
    generatedAt: new Date().toISOString(),
    counts: {
      permissions: PERMISSION_CATALOG.length,
      bundles: BUNDLE_REGISTRY.length,
      sodPairs: ALL_SOD_PAIRS.length,
    },
    permissions: [...PERMISSION_CATALOG],
    features: buildFeatureTree(),
    bundles: BUNDLE_REGISTRY.map((b) => ({
      ...b,
      keys: [...b.keys],
    })),
    sodPairs: [...ALL_SOD_PAIRS],
  };
}

/** Keys referenced by SoD pairs that must exist in catalog. */
export function getMissingSodCatalogKeys(): string[] {
  const sodKeys = collectSodReferencedKeys();
  return [...sodKeys].filter((k) => !CATALOG_KEY_SET.has(k)).sort();
}

/** project_manager bundle keys that should appear in catalog. */
export function getMissingProjectManagerCatalogKeys(): string[] {
  return PROJECT_MANAGER_FINANCIAL_BUNDLE.filter((k) => !CATALOG_KEY_SET.has(k));
}

export { FEATURE_LABELS };
