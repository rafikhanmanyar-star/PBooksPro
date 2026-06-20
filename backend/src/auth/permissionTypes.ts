/**
 * AUTO-GENERATED — do not edit. Source: shared/rbac/permissionTypes.ts
 * Regenerate: node scripts/ensure-shared-financial-cores.mjs
 */

/**
 * RBAC 2.0 — permission catalog type definitions (Phase 1 metadata only).
 */

/** Hierarchical permission layer per RBAC 2.0 architecture. */
export type PermissionLayer = 'feature' | 'page' | 'action';

/** Risk classification for catalog display and future policy (metadata only in Phase 1). */
export type PermissionRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type PermissionCatalogEntry = {
  /** Unique permission key (v1 runtime key or v2 catalog key). */
  key: string;
  /** Human-readable label. */
  label: string;
  layer: PermissionLayer;
  /** Top-level feature namespace (e.g. accounting, procurement). */
  feature: string;
  /** Page/resource segment when applicable. */
  page?: string;
  /** Action verb when layer is action. */
  action?: string;
  riskLevel: PermissionRiskLevel;
  /** v1 bundle alias this key expands from (metadata only). */
  aliasOf?: string;
  /** Keys implied when alias expands (metadata only). */
  impliedBy?: readonly string[];
  /** v1 key superseded by this v2 key. */
  supersedes?: string;
  /** Present in runtime ALL_PERMISSIONS (v1). */
  runtimeV1?: boolean;
  /** Deprecated — retained for migration visibility. */
  deprecated?: boolean;
  /** Free-form notes (bundle exclusion, SoD, etc.). */
  notes?: string;
};

export type PermissionBundleDefinition = {
  id: string;
  aliasKey: string;
  label: string;
  description: string;
  keys: readonly string[];
  /** Enterprise role slug when expansion differs (e.g. project_manager subset). */
  enterpriseRole?: string;
};

export type SodPairCategory = 'mandatory' | 'extended';

export type SodPairDefinition = {
  permissionA: string;
  permissionB: string;
  category: SodPairCategory;
  domain: string;
  rationale: string;
};

export type SecurityCatalogPayload = {
  version: '2.0';
  generatedAt: string;
  counts: {
    permissions: number;
    bundles: number;
    sodPairs: number;
  };
  permissions: PermissionCatalogEntry[];
  features: Record<
    string,
    {
      label: string;
      pages: Record<string, { label: string; permissions: PermissionCatalogEntry[] }>;
      featureAccess?: PermissionCatalogEntry;
    }
  >;
  bundles: PermissionBundleDefinition[];
  sodPairs: SodPairDefinition[];
};
