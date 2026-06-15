/**
 * In-memory presence per tenant (LAN/single-node API). Heartbeats and presence GETs
 * refresh last-seen; stale entries are dropped on read.
 */
export type PresenceProfile = {
  username?: string;
  name?: string;
  role?: string;
};

type PresenceEntry = PresenceProfile & {
  lastSeen: number;
};

const tenantPresence = new Map<string, Map<string, PresenceEntry>>();

/** Slightly above 2× client heartbeat interval (1 min) so a missed ping still counts. */
export const PRESENCE_TTL_MS = 3 * 60 * 1000;

export function recordPresence(
  tenantId: string,
  userId: string,
  profile?: PresenceProfile
): void {
  if (!tenantId || !userId) return;
  let m = tenantPresence.get(tenantId);
  if (!m) {
    m = new Map();
    tenantPresence.set(tenantId, m);
  }
  const prev = m.get(userId);
  m.set(userId, {
    lastSeen: Date.now(),
    username: profile?.username ?? prev?.username,
    name: profile?.name ?? prev?.name,
    role: profile?.role ?? prev?.role,
  });
}

function pruneTenantPresence(tenantId: string, now: number): Map<string, PresenceEntry> | null {
  const m = tenantPresence.get(tenantId);
  if (!m) return null;
  for (const [uid, entry] of m) {
    if (now - entry.lastSeen > PRESENCE_TTL_MS) {
      m.delete(uid);
    }
  }
  if (m.size === 0) {
    tenantPresence.delete(tenantId);
    return null;
  }
  return m;
}

export function getOnlineUserIds(tenantId: string): string[] {
  const now = Date.now();
  const m = pruneTenantPresence(tenantId, now);
  if (!m) return [];
  return [...m.keys()];
}

export type OnlineUserPresence = {
  id: string;
  username: string;
  name: string;
  role: string;
};

/** Online users from in-memory presence (no DB). */
export function getOnlineUsersFromPresence(tenantId: string): OnlineUserPresence[] {
  const now = Date.now();
  const m = pruneTenantPresence(tenantId, now);
  if (!m) return [];
  return [...m.entries()]
    .map(([id, entry]) => ({
      id,
      username: entry.username ?? id,
      name: entry.name ?? 'User',
      role: entry.role ?? '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/** Count users with a recent heartbeat across all tenants (same API process). */
export function getGlobalOnlineUserCount(): number {
  const now = Date.now();
  let total = 0;
  for (const tenantId of [...tenantPresence.keys()]) {
    const m = pruneTenantPresence(tenantId, now);
    if (m) total += m.size;
  }
  return total;
}
