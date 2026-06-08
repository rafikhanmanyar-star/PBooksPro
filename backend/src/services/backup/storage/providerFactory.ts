import type { OffsiteStorageProvider, StorageProviderConfig, StorageProviderId } from './types.js';

export async function createOffsiteStorageProvider(
  config: StorageProviderConfig
): Promise<OffsiteStorageProvider> {
  const { provider, bucketName, accessKey, secretKey } = config;
  if (!bucketName?.trim()) {
    throw new Error('Bucket / container name is required.');
  }
  if (!accessKey?.trim() || !secretKey?.trim()) {
    throw new Error('Access key and secret key are required.');
  }

  switch (provider) {
    case 'aws_s3': {
      const { S3CompatibleStorageProvider } = await import('./s3CompatibleProvider.js');
      return new S3CompatibleStorageProvider('aws_s3', config);
    }
    case 'cloudflare_r2': {
      if (!config.endpointUrl?.trim()) {
        throw new Error('Cloudflare R2 requires an endpoint URL (S3 API endpoint).');
      }
      const { S3CompatibleStorageProvider } = await import('./s3CompatibleProvider.js');
      return new S3CompatibleStorageProvider('cloudflare_r2', config);
    }
    case 'backblaze_b2': {
      if (!config.endpointUrl?.trim()) {
        throw new Error('Backblaze B2 requires an S3-compatible endpoint URL.');
      }
      const { S3CompatibleStorageProvider } = await import('./s3CompatibleProvider.js');
      return new S3CompatibleStorageProvider('backblaze_b2', config);
    }
    case 'azure_blob': {
      const { AzureBlobStorageProvider } = await import('./azureBlobProvider.js');
      return new AzureBlobStorageProvider(config);
    }
    default:
      throw new Error(`Unsupported storage provider: ${String(provider)}`);
  }
}

export function defaultEndpointHint(provider: StorageProviderId): string {
  switch (provider) {
    case 'aws_s3':
      return 'Leave empty for standard AWS endpoints.';
    case 'cloudflare_r2':
      return 'https://<account_id>.r2.cloudflarestorage.com';
    case 'backblaze_b2':
      return 'https://s3.<region>.backblazeb2.com';
    case 'azure_blob':
      return 'Optional — defaults to https://<account>.blob.core.windows.net';
    default:
      return '';
  }
}
