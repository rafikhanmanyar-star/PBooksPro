import jwt from 'jsonwebtoken';

export type JwtPayload = {
  sub: string;
  tenantId: string;
  role: string;
};

export function getJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error('JWT_SECRET must be set to a string of at least 16 characters');
  }
  return s;
}

export function signAccessToken(userId: string, tenantId: string, role: string): string {
  return jwt.sign({ sub: userId, tenantId, role }, getJwtSecret(), { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload & {
    tenantId?: string;
    role?: string;
  };
  const userId = decoded.sub;
  if (!userId || !decoded.tenantId || !decoded.role) {
    throw new Error('Invalid token payload');
  }
  return { sub: userId, tenantId: decoded.tenantId, role: decoded.role };
}
