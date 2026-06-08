/** In-memory mock checkout sessions (dev / no Paddle API key). */

const pendingMockSessions = new Map<
  string,
  {
    tenantId: string;
    planCode: string;
    billingCycle: 'monthly' | 'annual';
    amount: number;
    currency: string;
    expiresAt: number;
  }
>();

export function storeMockCheckoutSession(
  transactionId: string,
  session: {
    tenantId: string;
    planCode: string;
    billingCycle: 'monthly' | 'annual';
    amount: number;
    currency: string;
  }
): void {
  pendingMockSessions.set(transactionId, {
    ...session,
    expiresAt: Date.now() + 30 * 60_000,
  });
}

export function takeMockCheckoutSession(transactionId: string): {
  tenantId: string;
  planCode: string;
  billingCycle: 'monthly' | 'annual';
  amount: number;
  currency: string;
} | null {
  const session = pendingMockSessions.get(transactionId);
  if (!session || session.expiresAt <= Date.now()) {
    pendingMockSessions.delete(transactionId);
    return null;
  }
  pendingMockSessions.delete(transactionId);
  return session;
}

export function getMockCheckoutSession(transactionId: string) {
  const session = pendingMockSessions.get(transactionId);
  if (!session || session.expiresAt <= Date.now()) return null;
  return session;
}
