/**
 * Read backup files from disk — decrypt PBKENC1 / PBKENC2 as needed.
 */

import fs from 'node:fs/promises';
import {
  decryptBackupFile,
  isEncryptedBackupPayload,
  isPasswordEncryptedBackup,
} from './backupCryptoService.js';

export async function readBackupPlaintextFromPath(
  filePath: string,
  opts?: { password?: string }
): Promise<Buffer> {
  const raw = await fs.readFile(filePath);
  if (isEncryptedBackupPayload(raw) || isPasswordEncryptedBackup(raw)) {
    return decryptBackupFile(raw, opts);
  }
  return raw;
}

export async function readBackupPlaintextFromBuffer(
  raw: Buffer,
  opts?: { password?: string }
): Promise<Buffer> {
  if (isEncryptedBackupPayload(raw) || isPasswordEncryptedBackup(raw)) {
    return decryptBackupFile(raw, opts);
  }
  return raw;
}
