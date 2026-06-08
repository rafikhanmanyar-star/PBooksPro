/**
 * Encrypt MFA TOTP secrets at rest (AES-256-GCM).
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'MFASEC1:';

function keyBytes(): Buffer {
  const raw = process.env.MFA_ENCRYPTION_KEY?.trim() || process.env.JWT_SECRET?.trim() || '';
  if (raw.length < 16) {
    throw new Error('MFA_ENCRYPTION_KEY or JWT_SECRET (≥16 chars) required for MFA');
  }
  return createHash('sha256').update(raw, 'utf8').digest();
}

export function encryptMfaSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}.${enc.toString('base64url')}.${tag.toString('base64url')}`;
}

export function decryptMfaSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const body = stored.slice(PREFIX.length);
  const [ivB64, dataB64, tagB64] = body.split('.');
  if (!ivB64 || !dataB64 || !tagB64) throw new Error('Invalid MFA secret blob');
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}
