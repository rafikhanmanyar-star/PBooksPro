/**
 * In-memory presence per tenant (LAN/single-node API). Heartbeats and presence GETs
 * refresh last-seen; stale entries are dropped on read.
 */
const tenantPresence = new Map<string, Map<string, number>>();

/** Slightly above 2× client heartbeat interval (1 min) so a missed ping still counts. */
export const PRESENCE_TTL_MS = 3 * 60 * 1000;

export function recordPresence(tenantId: string, userId: string): void {
  if (!tenantId || !userId) return;
  let m = tenantPresence.get(tenantId);
  if (!m) {
    m = new Map();
    tenantPresence.set(tenantId, m);
  }
  m.set(userId, Date.now());
}

export function getOnlineUserIds(tenantId: string): string[] {
  const now = Date.now();
  const m = tenantPresence.get(tenantId);
  if (!m) return [];
  const online: string[] = [];
  for (const [uid, ts] of m) {
    if (now - ts <= PRESENCE_TTL_MS) {
      online.push(uid);
    } else {
      m.delete(uid);
    }
  }
  if (m.size === 0) tenantPresence.delete(tenantId);
  return online;
}
