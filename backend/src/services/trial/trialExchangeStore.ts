import { randomBytes } from 'node:crypto';

type ExchangeEntry = {
  token: string;
  tenantId: string;
  exp: number;
};

const TTL_MS = 5 * 60 * 1000;
const store = new Map<string, ExchangeEntry>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [code, entry] of store) {
    if (entry.exp <= now) store.delete(code);
  }
}

/** Issue a single-use code for secure app handoff (avoids JWT in query strings). */
export function issueTrialExchangeCode(token: string, tenantId: string): string {
  pruneExpired();
  const code = randomBytes(24).toString('base64url');
  store.set(code, { token, tenantId, exp: Date.now() + TTL_MS });
  return code;
}

export function consumeTrialExchangeCode(code: string): { token: string; tenantId: string } | null {
  pruneExpired();
  const entry = store.get(code);
  if (!entry) return null;
  store.delete(code);
  if (Date.now() > entry.exp) return null;
  return { token: entry.token, tenantId: entry.tenantId };
}
