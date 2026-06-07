import type pg from 'pg';
import {
  decryptSecret,
  encryptSecret,
  maskSecret,
} from './backupCryptoService.js';
import { createOffsiteStorageProvider } from './storage/providerFactory.js';
import type { StorageProviderConfig, StorageProviderId } from './storage/types.js';
import { STORAGE_PROVIDER_LABELS } from './storage/types.js';

export type BackupStorageSettingsRow = {
  id: string;
  provider: StorageProviderId;
  access_key_encrypted: string;
  secret_key_encrypted: string;
  bucket_name: string;
  region: string | null;
  endpoint_url: string | null;
  enabled: boolean;
  auto_upload: boolean;
  created_at: string;
  updated_at: string;
};

export type BackupStorageSettingsPublic = {
  id: string;
  provider: StorageProviderId;
  providerLabel: string;
  bucketName: string;
  region: string | null;
  endpointUrl: string | null;
  enabled: boolean;
  autoUpload: boolean;
  accessKeyMasked: string;
  secretKeyMasked: string;
  hasAccessKey: boolean;
  hasSecretKey: boolean;
  updatedAt: string;
};

export type SaveBackupStorageSettingsInput = {
  provider: StorageProviderId;
  bucketName: string;
  region?: string | null;
  endpointUrl?: string | null;
  enabled?: boolean;
  autoUpload?: boolean;
  accessKey?: string;
  secretKey?: string;
};

const SETTINGS_ID = 'default';

function rowToConfig(row: BackupStorageSettingsRow): StorageProviderConfig {
  return {
    provider: row.provider,
    accessKey: decryptSecret(row.access_key_encrypted),
    secretKey: decryptSecret(row.secret_key_encrypted),
    bucketName: row.bucket_name,
    region: row.region,
    endpointUrl: row.endpoint_url,
  };
}

export async function getStorageSettingsRow(
  client: pg.PoolClient
): Promise<BackupStorageSettingsRow | null> {
  const r = await client.query(`SELECT * FROM backup_storage_settings WHERE id = $1`, [SETTINGS_ID]);
  return r.rows[0] ? (r.rows[0] as BackupStorageSettingsRow) : null;
}

export function toPublicSettings(row: BackupStorageSettingsRow | null): BackupStorageSettingsPublic {
  if (!row) {
    return {
      id: SETTINGS_ID,
      provider: 'aws_s3',
      providerLabel: STORAGE_PROVIDER_LABELS.aws_s3,
      bucketName: '',
      region: null,
      endpointUrl: null,
      enabled: false,
      autoUpload: true,
      accessKeyMasked: '',
      secretKeyMasked: '',
      hasAccessKey: false,
      hasSecretKey: false,
      updatedAt: new Date(0).toISOString(),
    };
  }

  let accessPlain = '';
  let secretPlain = '';
  try {
    accessPlain = row.access_key_encrypted ? decryptSecret(row.access_key_encrypted) : '';
    secretPlain = row.secret_key_encrypted ? decryptSecret(row.secret_key_encrypted) : '';
  } catch {
    /* masked only */
  }

  return {
    id: row.id,
    provider: row.provider,
    providerLabel: STORAGE_PROVIDER_LABELS[row.provider],
    bucketName: row.bucket_name,
    region: row.region,
    endpointUrl: row.endpoint_url,
    enabled: row.enabled,
    autoUpload: row.auto_upload,
    accessKeyMasked: maskSecret(accessPlain),
    secretKeyMasked: maskSecret(secretPlain),
    hasAccessKey: !!row.access_key_encrypted,
    hasSecretKey: !!row.secret_key_encrypted,
    updatedAt: row.updated_at,
  };
}

export async function saveStorageSettings(
  client: pg.PoolClient,
  input: SaveBackupStorageSettingsInput
): Promise<BackupStorageSettingsPublic> {
  const existing = await getStorageSettingsRow(client);

  let accessEnc = existing?.access_key_encrypted ?? '';
  let secretEnc = existing?.secret_key_encrypted ?? '';

  if (input.accessKey !== undefined && input.accessKey.trim() !== '') {
    accessEnc = encryptSecret(input.accessKey.trim());
  }
  if (input.secretKey !== undefined && input.secretKey.trim() !== '') {
    secretEnc = encryptSecret(input.secretKey.trim());
  }

  if (existing) {
    await client.query(
      `UPDATE backup_storage_settings SET
         provider = $2,
         access_key_encrypted = $3,
         secret_key_encrypted = $4,
         bucket_name = $5,
         region = $6,
         endpoint_url = $7,
         enabled = $8,
         auto_upload = $9,
         updated_at = NOW()
       WHERE id = $1`,
      [
        SETTINGS_ID,
        input.provider,
        accessEnc,
        secretEnc,
        input.bucketName.trim(),
        input.region?.trim() || null,
        input.endpointUrl?.trim() || null,
        input.enabled ?? existing.enabled,
        input.autoUpload ?? existing.auto_upload,
      ]
    );
  } else {
    await client.query(
      `INSERT INTO backup_storage_settings (
         id, provider, access_key_encrypted, secret_key_encrypted,
         bucket_name, region, endpoint_url, enabled, auto_upload
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        SETTINGS_ID,
        input.provider,
        accessEnc,
        secretEnc,
        input.bucketName.trim(),
        input.region?.trim() || null,
        input.endpointUrl?.trim() || null,
        input.enabled ?? false,
        input.autoUpload ?? true,
      ]
    );
  }

  const row = await getStorageSettingsRow(client);
  return toPublicSettings(row);
}

export async function getConfiguredProvider(client: pg.PoolClient) {
  const row = await getStorageSettingsRow(client);
  if (!row || !row.enabled) return null;
  if (!row.bucket_name || !row.access_key_encrypted || !row.secret_key_encrypted) {
    return null;
  }
  const config = rowToConfig(row);
  return createOffsiteStorageProvider(config);
}

export async function testStorageConnection(
  client: pg.PoolClient,
  override?: SaveBackupStorageSettingsInput
): Promise<void> {
  let config: StorageProviderConfig;

  if (override) {
    const existing = await getStorageSettingsRow(client);
    config = {
      provider: override.provider,
      bucketName: override.bucketName.trim(),
      region: override.region?.trim() || null,
      endpointUrl: override.endpointUrl?.trim() || null,
      accessKey:
        override.accessKey?.trim() ||
        (existing ? decryptSecret(existing.access_key_encrypted) : ''),
      secretKey:
        override.secretKey?.trim() ||
        (existing ? decryptSecret(existing.secret_key_encrypted) : ''),
    };
  } else {
    const row = await getStorageSettingsRow(client);
    if (!row) throw new Error('Storage settings are not configured.');
    config = rowToConfig(row);
  }

  const provider = createOffsiteStorageProvider(config);
  await provider.testConnection();
}

export { rowToConfig, SETTINGS_ID };
