import type pg from 'pg';
import { randomUUID } from 'crypto';
import { S3CompatibleStorageProvider } from '../../../services/backup/storage/s3CompatibleProvider.js';
import type { StorageProviderConfig } from '../../../services/backup/storage/types.js';
import { DocumentRepository } from '../repositories/DocumentRepository.js';
import type { DocumentEntityType } from '../types/index.js';

function r2ConfigFromEnv(): StorageProviderConfig | null {
  const bucket = process.env.R2_BUCKET?.trim();
  const accessKey = process.env.R2_ACCESS_KEY?.trim();
  const secretKey = process.env.R2_SECRET_KEY?.trim();
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  if (!bucket || !accessKey || !secretKey) return null;
  const endpoint =
    process.env.R2_ENDPOINT_URL?.trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  return {
    provider: 'cloudflare_r2',
    bucketName: bucket,
    accessKey,
    secretKey,
    endpointUrl: endpoint,
    region: 'auto',
  };
}

export class DocumentStorageService {
  private readonly tenantId: string;
  private readonly repo: DocumentRepository;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
    this.repo = new DocumentRepository(tenantId);
  }

  private storage(): S3CompatibleStorageProvider | null {
    const cfg = r2ConfigFromEnv();
    if (!cfg) return null;
    return new S3CompatibleStorageProvider('cloudflare_r2', cfg);
  }

  async uploadDocument(
    client: pg.PoolClient,
    input: {
      entityType: DocumentEntityType | string;
      entityId?: string | null;
      fileName: string;
      mimeType?: string | null;
      body: Buffer;
      uploadedBy?: string | null;
    }
  ): Promise<{ id: string; storageKey: string }> {
    const id = randomUUID();
    const storageKey = `${this.tenantId}/${input.entityType}/${id}/${input.fileName}`;
    const provider = this.storage();

    if (provider) {
      await provider.upload({
        key: storageKey,
        body: input.body,
        metadata: {
          tenant_id: this.tenantId,
          entity_type: input.entityType,
          entity_id: input.entityId ?? '',
        },
      });
    }

    await this.repo.insertMetadata(client, {
      id,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      file_name: input.fileName,
      storage_key: provider ? storageKey : `inline:${id}`,
      mime_type: input.mimeType ?? null,
      file_size: input.body.length,
      uploaded_by: input.uploadedBy ?? null,
    });

    return { id, storageKey };
  }

  async downloadDocument(client: pg.PoolClient, documentId: string): Promise<Buffer | null> {
    const meta = await this.repo.getById(client, documentId);
    if (!meta) return null;
    if (meta.storage_key.startsWith('inline:')) return null;
    const provider = this.storage();
    if (!provider) return null;
    return provider.download(meta.storage_key);
  }
}
