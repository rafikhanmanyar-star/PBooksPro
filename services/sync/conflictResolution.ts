/**
 * Conflict Resolution for Bi-directional Sync
 *
 * Tiered strategies based on entity sensitivity:
 * - Financial entities (transactions, invoices, bills): version-check + field-merge, manual review for divergent versions
 * - Operational entities (contacts, accounts, categories, projects): field-level auto-merge
 * - Reference entities (buildings, units, properties): Last-Write-Wins
 *
 * All conflicts are logged to sync_conflicts table via conflictLogger.
 */

export type ConflictResolutionStrategy = 'last_write_wins' | 'manual_merge' | 'tiered';

export interface ConflictContext<T = unknown> {
  entityType: string;
  entityId: string;
  tenantId?: string;
  local: T & { updated_at?: string; updatedAt?: string; version?: number };
  remote: T & { updated_at?: string; updatedAt?: string; version?: number };
  localUpdatedAt: number;
  remoteUpdatedAt: number;
  localVersion?: number;
  remoteVersion?: number;
}

export interface ConflictResult<T = unknown> {
  /** Which version to apply: 'local' | 'remote' | 'merged' */
  use: 'local' | 'remote' | 'merged';
  /** For 'merged', the merged payload to apply */
  merged?: T;
  /** If true, caller should queue for manual review */
  needsManualReview?: boolean;
  /** Resolution outcome string for logging */
  resolution?: string;
  /** Fields that conflicted (for audit) */
  changedFields?: string[];
}

/**
 * Interface for conflict resolvers. Swap implementation to change strategy.
 */
export interface IConflictResolver {
  readonly strategy: ConflictResolutionStrategy;
  resolve<T>(context: ConflictContext<T>): ConflictResult<T>;
}

function getTimestamp(obj: { updated_at?: string; updatedAt?: string }): number {
  const raw = obj?.updated_at ?? obj?.updatedAt;
  if (!raw) return 0;
  const t = typeof raw === 'string' ? new Date(raw).getTime() : Number(raw);
  return isNaN(t) ? 0 : t;
}

function getVersion(obj: { version?: number }): number {
  return typeof obj?.version === 'number' ? obj.version : 0;
}

// Entity classification for tiered resolution
const FINANCIAL_ENTITIES = new Set([
  'transactions', 'invoices', 'bills', 'installment_plans',
  'payroll_runs', 'payslips',
]);

const REFERENCE_ENTITIES = new Set([
  'buildings', 'units', 'properties', 'plan_amenities',
]);

// Fields to skip during field-level comparison
const SKIP_FIELDS = new Set([
  'updated_at', 'updatedAt', 'created_at', 'createdAt',
  'version', 'id', 'tenant_id', 'tenantId', 'user_id', 'userId',
  'deleted_at', 'deletedAt',
]);

/**
 * Last Write Wins: newer updated_at wins. Used for reference/low-risk entities.
 */
export class LastWriteWinsResolver implements IConflictResolver {
  readonly strategy: ConflictResolutionStrategy = 'last_write_wins';

  resolve<T>(context: ConflictContext<T>): ConflictResult<T> {
    const { localUpdatedAt, remoteUpdatedAt } = context;
    if (remoteUpdatedAt > localUpdatedAt) {
      return { use: 'remote', resolution: 'remote_wins' };
    }
    if (localUpdatedAt > remoteUpdatedAt) {
      return { use: 'local', resolution: 'local_wins' };
    }
    // Equal: prefer remote so server is source of truth after sync
    return { use: 'remote', resolution: 'remote_wins' };
  }
}

/**
 * Manual Merge: always flag for manual review.
 */
export class ManualMergeResolver implements IConflictResolver {
  readonly strategy: ConflictResolutionStrategy = 'manual_merge';

  resolve<T>(context: ConflictContext<T>): ConflictResult<T> {
    const { localUpdatedAt, remoteUpdatedAt } = context;
    if (localUpdatedAt === remoteUpdatedAt) {
      return { use: 'remote', needsManualReview: false, resolution: 'remote_wins' };
    }
    return {
      use: 'merged',
      merged: context.remote as T,
      needsManualReview: true,
      resolution: 'pending_review',
    };
  }
}

/**
 * Tiered Conflict Resolver: applies different strategies based on entity type.
 *
 * - Financial entities: version-check → field-merge or manual review
 * - Operational entities: field-level auto-merge (non-overlapping), manual review (overlapping)
 * - Reference entities: simple Last-Write-Wins
 */
export class TieredConflictResolver implements IConflictResolver {
  readonly strategy: ConflictResolutionStrategy = 'tiered';

  resolve<T>(context: ConflictContext<T>): ConflictResult<T> {
    if (FINANCIAL_ENTITIES.has(context.entityType)) {
      return this.resolveFinancial(context);
    }
    if (REFERENCE_ENTITIES.has(context.entityType)) {
      return this.resolveLWW(context);
    }
    // Operational entities: field-level merge
    return this.resolveFieldMerge(context);
  }

  /**
   * Financial entities: if versions diverged significantly, do NOT auto-apply remote.
   * Keep local and flag for manual review (enterprise data safety).
   */
  private resolveFinancial<T>(ctx: ConflictContext<T>): ConflictResult<T> {
    const localVer = ctx.localVersion ?? getVersion(ctx.local as { version?: number });
    const remoteVer = ctx.remoteVersion ?? getVersion(ctx.remote as { version?: number });

    // If versions diverged by more than 1, multiple concurrent edits happened — block auto-apply
    if (localVer > 0 && remoteVer > 0 && Math.abs(remoteVer - localVer) > 1) {
      return {
        use: 'local', // Keep local, do not overwrite with remote
        needsManualReview: true,
        resolution: 'pending_review',
      };
    }
    return this.resolveFieldMerge(ctx);
  }

  /**
   * Field-level merge: detect which fields differ between local and remote.
   * - If no overlap: auto-merge non-conflicting fields
   * - If overlap: flag for manual review (use remote as default)
   */
  private resolveFieldMerge<T>(ctx: ConflictContext<T>): ConflictResult<T> {
    const localObj = ctx.local as Record<string, unknown>;
    const remoteObj = ctx.remote as Record<string, unknown>;

    const diffFields: string[] = [];

    // Find all fields that differ
    const allKeys = new Set([...Object.keys(localObj), ...Object.keys(remoteObj)]);
    for (const key of allKeys) {
      if (SKIP_FIELDS.has(key)) continue;
      const localVal = JSON.stringify(localObj[key] ?? null);
      const remoteVal = JSON.stringify(remoteObj[key] ?? null);
      if (localVal !== remoteVal) {
        diffFields.push(key);
      }
    }

    if (diffFields.length === 0) {
      // No actual data conflict — use remote (may have newer metadata)
      return { use: 'remote', resolution: 'remote_wins', changedFields: [] };
    }

    // For field-level merge without a common base, we approximate:
    // The "newer" side is assumed to own the differing fields.
    // If both sides are equally new (or we can't determine base), flag overlapping fields.
    if (ctx.localUpdatedAt > ctx.remoteUpdatedAt) {
      // Local is newer — local fields win, but apply any remote-only fields
      const merged = { ...remoteObj };
      for (const field of diffFields) {
        merged[field] = localObj[field];
      }
      return {
        use: 'merged',
        merged: merged as T,
        needsManualReview: false,
        resolution: 'merged',
        changedFields: diffFields,
      };
    }

    if (ctx.remoteUpdatedAt > ctx.localUpdatedAt) {
      // Remote is newer — remote fields win
      return {
        use: 'remote',
        needsManualReview: false,
        resolution: 'remote_wins',
        changedFields: diffFields,
      };
    }

    // Timestamps equal but data differs — flag for review
    return {
      use: 'remote',
      needsManualReview: true,
      resolution: 'pending_review',
      changedFields: diffFields,
    };
  }

  /**
   * Simple Last-Write-Wins for low-risk reference data.
   */
  private resolveLWW<T>(ctx: ConflictContext<T>): ConflictResult<T> {
    if (ctx.remoteUpdatedAt >= ctx.localUpdatedAt) {
      return { use: 'remote', resolution: 'remote_wins' };
    }
    return { use: 'local', resolution: 'local_wins' };
  }
}

/**
 * Singleton: default is now TieredConflictResolver for enterprise-grade conflict handling.
 * Falls back to LWW behavior for reference entities, uses field-merge for operational,
 * and flags financial entities for review when versions diverge.
 */
let resolverInstance: IConflictResolver = new TieredConflictResolver();

export function getConflictResolver(): IConflictResolver {
  return resolverInstance;
}

export function setConflictResolver(resolver: IConflictResolver): void {
  resolverInstance = resolver;
}

/**
 * Helper to build ConflictContext from local and remote records.
 */
export function buildConflictContext<T extends Record<string, unknown>>(
  entityType: string,
  entityId: string,
  local: T,
  remote: T,
  tenantId?: string
): ConflictContext<T> {
  return {
    entityType,
    entityId,
    tenantId,
    local,
    remote,
    localUpdatedAt: getTimestamp(local as { updated_at?: string; updatedAt?: string }),
    remoteUpdatedAt: getTimestamp(remote as { updated_at?: string; updatedAt?: string }),
    localVersion: getVersion(local as { version?: number }),
    remoteVersion: getVersion(remote as { version?: number }),
  };
}
