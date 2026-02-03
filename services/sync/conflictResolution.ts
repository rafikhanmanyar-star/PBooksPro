/**
 * Conflict Resolution for Bi-directional Sync
 *
 * Pluggable strategies: Last Write Wins (default), Manual Merge (future).
 * Compare using updated_at timestamps for LWW.
 */

export type ConflictResolutionStrategy = 'last_write_wins' | 'manual_merge';

export interface ConflictContext<T = unknown> {
  entityType: string;
  entityId: string;
  local: T & { updated_at?: string; updatedAt?: string };
  remote: T & { updated_at?: string; updatedAt?: string };
  localUpdatedAt: number;
  remoteUpdatedAt: number;
}

export interface ConflictResult<T = unknown> {
  /** Which version to apply: 'local' | 'remote' | 'merged' */
  use: 'local' | 'remote' | 'merged';
  /** For 'merged', the merged payload to apply */
  merged?: T;
  /** If true, caller should queue for manual review (for manual_merge strategy) */
  needsManualReview?: boolean;
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

/**
 * Last Write Wins: newer updated_at wins. Default production strategy.
 */
export class LastWriteWinsResolver implements IConflictResolver {
  readonly strategy: ConflictResolutionStrategy = 'last_write_wins';

  resolve<T>(context: ConflictContext<T>): ConflictResult<T> {
    const { localUpdatedAt, remoteUpdatedAt, remote, local } = context;
    if (remoteUpdatedAt > localUpdatedAt) {
      return { use: 'remote' };
    }
    if (localUpdatedAt > remoteUpdatedAt) {
      return { use: 'local' };
    }
    // Equal: prefer remote so server is source of truth after sync
    return { use: 'remote' };
  }
}

/**
 * Manual Merge: always flag for manual review. Use when you want to swap to manual merge later.
 */
export class ManualMergeResolver implements IConflictResolver {
  readonly strategy: ConflictResolutionStrategy = 'manual_merge';

  resolve<T>(context: ConflictContext<T>): ConflictResult<T> {
    const { localUpdatedAt, remoteUpdatedAt } = context;
    if (localUpdatedAt === remoteUpdatedAt) {
      return { use: 'remote', needsManualReview: false };
    }
    return {
      use: 'merged',
      merged: context.remote as T,
      needsManualReview: true,
    };
  }
}

/**
 * Singleton: default LWW. Replace with ManualMergeResolver when needed.
 */
let resolverInstance: IConflictResolver = new LastWriteWinsResolver();

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
  remote: T
): ConflictContext<T> {
  return {
    entityType,
    entityId,
    local,
    remote,
    localUpdatedAt: getTimestamp(local as { updated_at?: string; updatedAt?: string }),
    remoteUpdatedAt: getTimestamp(remote as { updated_at?: string; updatedAt?: string }),
  };
}
