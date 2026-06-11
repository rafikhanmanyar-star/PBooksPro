import type pg from 'pg';
import {
  decryptSecret,
  encryptSecret,
  maskSecret,
} from './backupCryptoService.js';
import { createOffsiteStorageProvider } from './storage/providerFactory.js';
import type { StorageProviderConfig, StorageProviderId } from './storage/types.js';
import { STORAGE_PROVIDER_LABELS } from './storage/types.js';
import {
  BackupStorageSettingsRepository,
  BACKUP_STORAGE_SETTINGS_ID,
  type BackupStorageSettingsRow,
} from '../../modules/backup/repositories/BackupSettingsRepository.js';

export type { BackupStorageSettingsRow };
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

const storageRepo = new BackupStorageSettingsRepository();

function rowToConfig(row: BackupStorageSettingsRow): StorageProviderConfig {
  return {
    provider: row.provider as StorageProviderId,
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
  return storageRepo.getRow(client);
}

export function toPublicSettings(row: BackupStorageSettingsRow | null): BackupStorageSettingsPublic {
  if (!row) {
    return {
      id: BACKUP_STORAGE_SETTINGS_ID,
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
    provider: row.provider as StorageProviderId,
    providerLabel: STORAGE_PROVIDER_LABELS[row.provider as StorageProviderId],
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

  const payload = {
    provider: input.provider,
    accessEnc,
    secretEnc,
    bucketName: input.bucketName.trim(),
    region: input.region?.trim() || null,
    endpointUrl: input.endpointUrl?.trim() || null,
    enabled: input.enabled ?? existing?.enabled ?? false,
    autoUpload: input.autoUpload ?? existing?.auto_upload ?? true,
  };

  if (existing) {
    await storageRepo.update(client, payload);
  } else {
    await storageRepo.insert(client, payload);
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
  return await createOffsiteStorageProvider(config);
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

  const provider = await createOffsiteStorageProvider(config);
  await provider.testConnection();
}

export { rowToConfig, BACKUP_STORAGE_SETTINGS_ID as SETTINGS_ID };
