import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import type {
  OffsiteStorageProvider,
  StorageProviderConfig,
  StorageProviderId,
  UploadResult,
  HeadObjectResult,
} from './types.js';

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function normalizeMetadata(metadata: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(metadata)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

export class S3CompatibleStorageProvider implements OffsiteStorageProvider {
  readonly providerId: StorageProviderId;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(providerId: StorageProviderId, config: StorageProviderConfig) {
    this.providerId = providerId;
    this.bucket = config.bucketName;

    const region = config.region?.trim() || 'us-east-1';
    const endpoint = config.endpointUrl?.trim() || undefined;

    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle: providerId === 'backblaze_b2',
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
    });
  }

  async upload(params: {
    key: string;
    body: Buffer;
    metadata: Record<string, string>;
  }): Promise<UploadResult> {
    const res = await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        Body: params.body,
        Metadata: params.metadata,
        ContentType: 'application/octet-stream',
      })
    );
    const etag = (res.ETag ?? '').replace(/"/g, '');
    return { etag, sizeBytes: params.body.length };
  }

  async download(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key })
    );
    return streamToBuffer(res.Body);
  }

  async head(key: string): Promise<HeadObjectResult> {
    const res = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key })
    );
    return {
      etag: (res.ETag ?? '').replace(/"/g, ''),
      sizeBytes: Number(res.ContentLength ?? 0),
      metadata: normalizeMetadata(res.Metadata ?? {}),
    };
  }

  async testConnection(): Promise<void> {
    const probeKey = `pbooks-probe-${Date.now()}.txt`;
    const body = Buffer.from('pbooks-offsite-probe', 'utf8');
    await this.upload({ key: probeKey, body, metadata: { probe: 'true' } });
    const head = await this.head(probeKey);
    if (head.sizeBytes !== body.length) {
      throw new Error('Upload verification failed: size mismatch.');
    }
  }
}
