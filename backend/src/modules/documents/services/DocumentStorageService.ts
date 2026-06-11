import type pg from 'pg';
import { S3CompatibleStorageProvider } from '../../../services/backup/storage/s3CompatibleProvider.js';
import type { StorageProviderConfig } from '../../../services/backup/storage/types.js';
import { DocumentRepository } from '../repositories/DocumentRepository.js';
import type { DocumentMetadataRow } from '../types/index.js';

export function r2ConfigFromEnv(): StorageProviderConfig | null {
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

export function isR2Configured(): boolean {
  return r2ConfigFromEnv() != null;
}

export class DocumentStorageService {
  private readonly tenantId: string;
  readonly repo: DocumentRepository;

  constructor(tenantId: string, client?: pg.PoolClient) {
    this.tenantId = tenantId;
    this.repo = new DocumentRepository(tenantId, client);
  }

  private storage(): S3CompatibleStorageProvider | null {
    const cfg = r2ConfigFromEnv();
    if (!cfg) return null;
    return new S3CompatibleStorageProvider('cloudflare_r2', cfg);
  }

  buildStorageKey(documentId: string, entityType: string, fileName: string): string {
    return `${this.tenantId}/${entityType}/${documentId}/${fileName}`;
  }

  async persistBytes(
    client: pg.PoolClient,
    input: {
      documentId: string;
      entityType: string;
      fileName: string;
      body: Buffer;
    }
  ): Promise<{ storageKey: string; inlineData: Buffer | null }> {
    const provider = this.storage();
    if (provider) {
      const storageKey = this.buildStorageKey(input.documentId, input.entityType, input.fileName);
      await provider.upload({
        key: storageKey,
        body: input.body,
        metadata: {
          tenant_id: this.tenantId,
          entity_type: input.entityType,
          document_id: input.documentId,
        },
      });
      return { storageKey, inlineData: null };
    }
    return { storageKey: `inline:${input.documentId}`, inlineData: input.body };
  }

  async readBytes(client: pg.PoolClient, row: DocumentMetadataRow): Promise<Buffer> {
    if (row.inline_data && row.inline_data.length > 0) {
      return Buffer.isBuffer(row.inline_data) ? row.inline_data : Buffer.from(row.inline_data);
    }
    if (row.storage_key.startsWith('inline:')) {
      return Buffer.alloc(0);
    }
    const provider = this.storage();
    if (!provider) return Buffer.alloc(0);
    return provider.download(row.storage_key);
  }

  async deleteObject(row: DocumentMetadataRow): Promise<void> {
    if (row.storage_key.startsWith('inline:')) return;
    const provider = this.storage();
    if (!provider) return;
    try {
      await provider.download(row.storage_key);
      // Provider has no delete in interface — object remains until lifecycle policy.
    } catch {
      /* ignore missing object */
    }
  }
}
