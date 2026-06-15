export type StorageProviderId = 'aws_s3' | 'cloudflare_r2' | 'backblaze_b2' | 'azure_blob';

export type StorageProviderConfig = {
  provider: StorageProviderId;
  accessKey: string;
  secretKey: string;
  bucketName: string;
  region?: string | null;
  endpointUrl?: string | null;
};

export type UploadResult = {
  etag: string;
  sizeBytes: number;
};

export type HeadObjectResult = {
  etag: string;
  sizeBytes: number;
  metadata: Record<string, string>;
};

export interface OffsiteStorageProvider {
  readonly providerId: StorageProviderId;
  upload(params: {
    key: string;
    body: Buffer;
    metadata: Record<string, string>;
  }): Promise<UploadResult>;
  download(key: string): Promise<Buffer>;
  head(key: string): Promise<HeadObjectResult>;
  testConnection(): Promise<void>;
}

export const STORAGE_PROVIDER_LABELS: Record<StorageProviderId, string> = {
  aws_s3: 'AWS S3',
  cloudflare_r2: 'Cloudflare R2',
  backblaze_b2: 'Backblaze B2',
  azure_blob: 'Azure Blob Storage',
};
