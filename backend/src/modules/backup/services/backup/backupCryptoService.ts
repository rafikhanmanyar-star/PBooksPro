/**
 * AES-256-GCM encryption for backup payloads and credential storage at rest.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from 'node:crypto';

const BACKUP_MAGIC = Buffer.from('PBKENC1\0', 'ascii');
const BACKUP_VERSION = 1;
const PASSWORD_MAGIC = Buffer.from('PBKENC2\0', 'ascii');
const PASSWORD_VERSION = 1;

function requireSecret(envKeys: string[], purpose: string): string {
  for (const key of envKeys) {
    const v = process.env[key]?.trim();
    if (v) return v;
  }
  throw new Error(
    `${purpose}: set one of ${envKeys.join(', ')} in the API server environment.`
  );
}

function backupFileKey(): Buffer {
  const secret = requireSecret(['BACKUP_ENCRYPTION_KEY', 'JWT_SECRET'], 'Backup file encryption');
  return scryptSync(secret, 'pbooks-backup-file-v1', 32);
}

function storageMasterKey(): Buffer {
  const secret = requireSecret(
    ['BACKUP_STORAGE_MASTER_KEY', 'JWT_SECRET'],
    'Storage credential encryption'
  );
  return scryptSync(secret, 'pbooks-storage-secret-v1', 32);
}

export function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Encrypt pg_dump bytes before offsite upload (PBKENC1 format). */
export function encryptBackupPayload(plaintext: Buffer): Buffer {
  const key = backupFileKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([BACKUP_MAGIC, Buffer.from([BACKUP_VERSION]), iv, tag, ciphertext]);
}

/** Decrypt PBKENC1 backup payload after download from cloud. */
export function decryptBackupPayload(payload: Buffer): Buffer {
  if (payload.length < BACKUP_MAGIC.length + 1 + 12 + 16) {
    throw new Error('Encrypted backup file is too small or corrupt.');
  }
  const magic = payload.subarray(0, BACKUP_MAGIC.length);
  if (!magic.equals(BACKUP_MAGIC)) {
    throw new Error('Not a PBooks encrypted backup (missing PBKENC1 header).');
  }
  const version = payload[BACKUP_MAGIC.length];
  if (version !== BACKUP_VERSION) {
    throw new Error(`Unsupported encrypted backup version: ${version}`);
  }
  let offset = BACKUP_MAGIC.length + 1;
  const iv = payload.subarray(offset, offset + 12);
  offset += 12;
  const tag = payload.subarray(offset, offset + 16);
  offset += 16;
  const ciphertext = payload.subarray(offset);

  const key = backupFileKey();
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function isEncryptedBackupPayload(payload: Buffer): boolean {
  return payload.length >= BACKUP_MAGIC.length && payload.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC);
}

export function isPasswordEncryptedBackup(payload: Buffer): boolean {
  return (
    payload.length >= PASSWORD_MAGIC.length &&
    payload.subarray(0, PASSWORD_MAGIC.length).equals(PASSWORD_MAGIC)
  );
}

/** AES-256-GCM with scrypt-derived key from user backup password (PBKENC2). */
export function encryptBackupWithPassword(plaintext: Buffer, password: string): Buffer {
  const trimmed = password.trim();
  if (trimmed.length < 8) {
    throw new Error('Backup password must be at least 8 characters.');
  }
  const salt = randomBytes(16);
  const key = scryptSync(trimmed, salt, 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([PASSWORD_MAGIC, Buffer.from([PASSWORD_VERSION]), salt, iv, tag, ciphertext]);
}

export function decryptBackupWithPassword(payload: Buffer, password: string): Buffer {
  if (!isPasswordEncryptedBackup(payload)) {
    throw new Error('Not a password-encrypted backup (missing PBKENC2 header).');
  }
  const version = payload[PASSWORD_MAGIC.length];
  if (version !== PASSWORD_VERSION) {
    throw new Error(`Unsupported password backup version: ${version}`);
  }
  let offset = PASSWORD_MAGIC.length + 1;
  const salt = payload.subarray(offset, offset + 16);
  offset += 16;
  const iv = payload.subarray(offset, offset + 12);
  offset += 12;
  const tag = payload.subarray(offset, offset + 16);
  offset += 16;
  const ciphertext = payload.subarray(offset);

  const key = scryptSync(password.trim(), salt, 32);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Encrypt for local storage / server-managed backups (PBKENC1). */
export function encryptBackupForStorage(plaintext: Buffer): Buffer {
  return encryptBackupPayload(plaintext);
}

/**
 * Encrypt for download — optional password layer (PBKENC2) then server wrap (PBKENC1)
 * when no password; password-only file when password provided (portable offline backup).
 */
export function encryptBackupForDownload(plaintext: Buffer, password?: string): Buffer {
  if (password?.trim()) {
    return encryptBackupWithPassword(plaintext, password);
  }
  return encryptBackupPayload(plaintext);
}

/**
 * Decrypt backup bytes — handles PBKENC1 (server), PBKENC2 (password), or nested server→password.
 */
export function decryptBackupFile(payload: Buffer, opts?: { password?: string }): Buffer {
  let data = payload;

  if (isEncryptedBackupPayload(data)) {
    data = decryptBackupPayload(data);
  }

  if (isPasswordEncryptedBackup(data)) {
    if (!opts?.password?.trim()) {
      throw new Error('This backup is protected with a password. Provide the backup password.');
    }
    return decryptBackupWithPassword(data, opts.password);
  }

  if (isPasswordEncryptedBackup(payload) && !isEncryptedBackupPayload(payload)) {
    if (!opts?.password?.trim()) {
      throw new Error('This backup is protected with a password. Provide the backup password.');
    }
    return decryptBackupWithPassword(payload, opts.password);
  }

  return data;
}

/** Encrypt API keys/secrets for persistence in backup_storage_settings. */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return '';
  const key = storageMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(stored: string): string {
  if (!stored) return '';
  const buf = Buffer.from(stored, 'base64');
  if (buf.length < 12 + 16) {
    throw new Error('Stored secret is corrupt.');
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const key = storageMasterKey();
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function maskSecret(value: string | null | undefined): string {
  if (!value) return '';
  if (value.length <= 4) return '****';
  return `${'*'.repeat(Math.min(value.length - 4, 12))}${value.slice(-4)}`;
}
