import jwt, { type SignOptions } from 'jsonwebtoken';

export type SessionType = 'standard' | 'break_glass';

export type JwtPayload = {
  sub: string;
  tenantId: string;
  role: string;
};

export type VerifiedAccessToken = JwtPayload & {
  sessionType: SessionType;
  breakGlassSessionId?: string;
  breakGlassAccessHash?: string;
  /** Composite access version hash at issue time (Phase 3). */
  av?: string;
};

export type MfaTokenPurpose = 'mfa_challenge' | 'mfa_setup';

export type TenantSelectionAccount = {
  userId: string;
  tenantId: string;
};

export type TenantSelectionPayload = {
  sub: string;
  purpose: 'tenant_selection';
  accounts: TenantSelectionAccount[];
  loginEventId?: string;
};

export type MfaTokenPayload = JwtPayload & {
  purpose: MfaTokenPurpose;
  loginEventId?: string;
};

export function getJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error('JWT_SECRET must be set to a string of at least 16 characters');
  }
  return s;
}

export function signAccessToken(
  userId: string,
  tenantId: string,
  role: string,
  options?: { av?: string }
): string {
  const signOptions: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN?.trim() || '7d') as SignOptions['expiresIn'],
  };
  const payload: Record<string, unknown> = { sub: userId, tenantId, role, sessionType: 'standard' };
  if (options?.av) payload.av = options.av;
  return jwt.sign(payload, getJwtSecret(), signOptions);
}

export function signBreakGlassAccessToken(input: {
  userId: string;
  tenantId: string;
  role: string;
  sessionId: string;
  expiresAt: Date;
  accessHash: string;
  av?: string;
}): string {
  const ttlSec = Math.max(60, Math.floor((input.expiresAt.getTime() - Date.now()) / 1000));
  const payload: Record<string, unknown> = {
    sub: input.userId,
    tenantId: input.tenantId,
    role: input.role,
    sessionType: 'break_glass',
    breakGlassSessionId: input.sessionId,
    breakGlassAccessHash: input.accessHash,
  };
  if (input.av) payload.av = input.av;
  return jwt.sign(payload, getJwtSecret(), { expiresIn: ttlSec });
}

export function verifyAccessToken(token: string): VerifiedAccessToken {
  const decoded = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload & {
    tenantId?: string;
    role?: string;
    purpose?: string;
    sessionType?: SessionType;
    breakGlassSessionId?: string;
    breakGlassAccessHash?: string;
    av?: string;
  };
  if (decoded.purpose) {
    throw new Error('Invalid token type');
  }
  const userId = decoded.sub;
  if (!userId || !decoded.tenantId || !decoded.role) {
    throw new Error('Invalid token payload');
  }
  const sessionType = decoded.sessionType === 'break_glass' ? 'break_glass' : 'standard';
  return {
    sub: userId,
    tenantId: decoded.tenantId,
    role: decoded.role,
    sessionType,
    breakGlassSessionId: decoded.breakGlassSessionId,
    breakGlassAccessHash: decoded.breakGlassAccessHash,
    av: decoded.av,
  };
}

export function signMfaToken(
  userId: string,
  tenantId: string,
  role: string,
  purpose: MfaTokenPurpose,
  loginEventId?: string
): string {
  return jwt.sign(
    { sub: userId, tenantId, role, purpose, loginEventId },
    getJwtSecret(),
    { expiresIn: '60m' }
  );
}

export function signTenantSelectionToken(
  accounts: TenantSelectionAccount[],
  loginEventId?: string
): string {
  const sessionId = `ts_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return jwt.sign(
    { sub: sessionId, purpose: 'tenant_selection', accounts, loginEventId },
    getJwtSecret(),
    { expiresIn: '15m' }
  );
}

export function verifyTenantSelectionToken(token: string): TenantSelectionPayload {
  const decoded = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload & {
    purpose?: string;
    accounts?: TenantSelectionAccount[];
    loginEventId?: string;
  };
  if (decoded.purpose !== 'tenant_selection' || !decoded.sub || !Array.isArray(decoded.accounts)) {
    throw new Error('Invalid tenant selection token');
  }
  if (decoded.accounts.length === 0) {
    throw new Error('Invalid tenant selection token');
  }
  for (const account of decoded.accounts) {
    if (!account?.userId || !account?.tenantId) {
      throw new Error('Invalid tenant selection token');
    }
  }
  return {
    sub: decoded.sub,
    purpose: 'tenant_selection',
    accounts: decoded.accounts,
    loginEventId: decoded.loginEventId,
  };
}

export function verifyMfaToken(token: string, expectedPurpose: MfaTokenPurpose): MfaTokenPayload {
  const decoded = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload & {
    tenantId?: string;
    role?: string;
    purpose?: MfaTokenPurpose;
    loginEventId?: string;
  };
  const userId = decoded.sub;
  if (!userId || !decoded.tenantId || !decoded.role || decoded.purpose !== expectedPurpose) {
    throw new Error('Invalid MFA token');
  }
  return {
    sub: userId,
    tenantId: decoded.tenantId,
    role: decoded.role,
    purpose: expectedPurpose,
    loginEventId: decoded.loginEventId,
  };
}
