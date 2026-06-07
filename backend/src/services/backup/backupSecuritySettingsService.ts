/**
 * Backup security settings and key management metadata.
 */

import type pg from 'pg';

export type BackupSecuritySettings = {
  id: string;
  encrypt_at_rest: boolean;
  encrypt_before_upload: boolean;
  require_restore_authorization: boolean;
  min_backup_password_length: number;
  key_version: number;
  key_rotated_at: string | null;
  updated_at: string;
};

export type BackupSecurityStatus = {
  settings: BackupSecuritySettings;
  serverKeyConfigured: boolean;
  storageMasterKeyConfigured: boolean;
  encryptionAlgorithm: 'AES-256-GCM';
  formats: string[];
};

function mapRow(row: pg.QueryResultRow): BackupSecuritySettings {
  return {
    id: row.id,
    encrypt_at_rest: row.encrypt_at_rest,
    encrypt_before_upload: row.encrypt_before_upload,
    require_restore_authorization: row.require_restore_authorization,
    min_backup_password_length: row.min_backup_password_length,
    key_version: row.key_version,
    key_rotated_at: row.key_rotated_at,
    updated_at: row.updated_at,
  };
}

export async function getBackupSecuritySettings(
  client: pg.PoolClient
): Promise<BackupSecuritySettings> {
  const { rows } = await client.query(`SELECT * FROM backup_security_settings WHERE id = 'default'`);
  if (rows.length === 0) {
    return {
      id: 'default',
      encrypt_at_rest: true,
      encrypt_before_upload: true,
      require_restore_authorization: true,
      min_backup_password_length: 8,
      key_version: 1,
      key_rotated_at: null,
      updated_at: new Date().toISOString(),
    };
  }
  return mapRow(rows[0]);
}

export async function updateBackupSecuritySettings(
  client: pg.PoolClient,
  patch: Partial<
    Pick<
      BackupSecuritySettings,
      | 'encrypt_at_rest'
      | 'encrypt_before_upload'
      | 'require_restore_authorization'
      | 'min_backup_password_length'
    >
  >
): Promise<BackupSecuritySettings> {
  const current = await getBackupSecuritySettings(client);
  await client.query(
    `UPDATE backup_security_settings SET
       encrypt_at_rest = $1,
       encrypt_before_upload = $2,
       require_restore_authorization = $3,
       min_backup_password_length = $4,
       updated_at = NOW()
     WHERE id = 'default'`,
    [
      patch.encrypt_at_rest ?? current.encrypt_at_rest,
      patch.encrypt_before_upload ?? current.encrypt_before_upload,
      patch.require_restore_authorization ?? current.require_restore_authorization,
      patch.min_backup_password_length ?? current.min_backup_password_length,
    ]
  );
  return getBackupSecuritySettings(client);
}

export async function rotateBackupKeyVersion(client: pg.PoolClient): Promise<BackupSecuritySettings> {
  await client.query(
    `UPDATE backup_security_settings SET
       key_version = key_version + 1,
       key_rotated_at = NOW(),
       updated_at = NOW()
     WHERE id = 'default'`
  );
  return getBackupSecuritySettings(client);
}

export function isServerBackupKeyConfigured(): boolean {
  return !!(process.env.BACKUP_ENCRYPTION_KEY?.trim() || process.env.JWT_SECRET?.trim());
}

export function isStorageMasterKeyConfigured(): boolean {
  return !!(process.env.BACKUP_STORAGE_MASTER_KEY?.trim() || process.env.JWT_SECRET?.trim());
}

export async function getBackupSecurityStatus(
  client: pg.PoolClient
): Promise<BackupSecurityStatus> {
  const settings = await getBackupSecuritySettings(client);
  return {
    settings,
    serverKeyConfigured: isServerBackupKeyConfigured(),
    storageMasterKeyConfigured: isStorageMasterKeyConfigured(),
    encryptionAlgorithm: 'AES-256-GCM',
    formats: ['PBKENC1 (server key)', 'PBKENC2 (backup password)'],
  };
}
