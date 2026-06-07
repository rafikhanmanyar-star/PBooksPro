import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import type {
  OffsiteStorageProvider,
  StorageProviderConfig,
  UploadResult,
  HeadObjectResult,
} from './types.js';

function azureEndpoint(accountName: string, region?: string | null): string {
  const suffix = region?.trim() || 'core.windows.net';
  if (suffix.includes('://')) return suffix.replace(/\/$/, '');
  return `https://${accountName}.blob.${suffix}`;
}

export class AzureBlobStorageProvider implements OffsiteStorageProvider {
  readonly providerId = 'azure_blob' as const;
  private readonly container: string;
  private readonly service: BlobServiceClient;

  constructor(config: StorageProviderConfig) {
    const accountName = config.accessKey.trim();
    const accountKey = config.secretKey.trim();
    if (!accountName || !accountKey) {
      throw new Error('Azure Blob requires storage account name (access key) and account key (secret).');
    }
    this.container = config.bucketName.trim();
    const endpoint = config.endpointUrl?.trim() || azureEndpoint(accountName, config.region);
    const credential = new StorageSharedKeyCredential(accountName, accountKey);
    this.service = new BlobServiceClient(endpoint, credential);
  }

  async upload(params: {
    key: string;
    body: Buffer;
    metadata: Record<string, string>;
  }): Promise<UploadResult> {
    const client = this.service.getContainerClient(this.container).getBlockBlobClient(params.key);
    const res = await client.uploadData(params.body, {
      blobHTTPHeaders: { blobContentType: 'application/octet-stream' },
      metadata: params.metadata,
    });
    const etag = (res.etag ?? '').replace(/"/g, '');
    return { etag, sizeBytes: params.body.length };
  }

  async download(key: string): Promise<Buffer> {
    const client = this.service.getContainerClient(this.container).getBlockBlobClient(key);
    return client.downloadToBuffer();
  }

  async head(key: string): Promise<HeadObjectResult> {
    const client = this.service.getContainerClient(this.container).getBlockBlobClient(key);
    const props = await client.getProperties();
    const metadata: Record<string, string> = {};
    for (const [k, v] of Object.entries(props.metadata ?? {})) {
      if (v != null) metadata[k.toLowerCase()] = String(v);
    }
    return {
      etag: (props.etag ?? '').replace(/"/g, ''),
      sizeBytes: props.contentLength ?? 0,
      metadata,
    };
  }

  async testConnection(): Promise<void> {
    const probeKey = `pbooks-probe-${Date.now()}.txt`;
    const body = Buffer.from('pbooks-offsite-probe', 'utf8');
    await this.upload({ key: probeKey, body, metadata: { probe: 'true' } });
    const head = await this.head(probeKey);
    if (head.sizeBytes !== body.length) {
      throw new Error('Azure upload verification failed: size mismatch.');
    }
  }
}
