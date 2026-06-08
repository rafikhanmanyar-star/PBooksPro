import jwt, { type SignOptions } from 'jsonwebtoken';

export type JwtPayload = {
  sub: string;
  tenantId: string;
  role: string;
};

export type MfaTokenPurpose = 'mfa_challenge' | 'mfa_setup';

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

export function signAccessToken(userId: string, tenantId: string, role: string): string {
  const signOptions: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN?.trim() || '7d') as SignOptions['expiresIn'],
  };
  return jwt.sign({ sub: userId, tenantId, role }, getJwtSecret(), signOptions);
}

export function verifyAccessToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload & {
    tenantId?: string;
    role?: string;
    purpose?: string;
  };
  if (decoded.purpose) {
    throw new Error('Invalid token type');
  }
  const userId = decoded.sub;
  if (!userId || !decoded.tenantId || !decoded.role) {
    throw new Error('Invalid token payload');
  }
  return { sub: userId, tenantId: decoded.tenantId, role: decoded.role };
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
