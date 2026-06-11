export type DocumentEntityType =
  | 'agreement'
  | 'cnic'
  | 'receipt'
  | 'vendor_bill'
  | 'payment_proof'
  | 'quotation'
  | 'other';

export type DocumentMetadataRow = {
  id: string;
  tenant_id: string;
  name: string | null;
  type: string | null;
  entity_type: string;
  entity_id: string | null;
  file_name: string;
  storage_key: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  uploaded_at: Date;
  deleted_at: Date | null;
  deleted_by: string | null;
  version: number;
  inline_data: Buffer | null;
  created_at: Date;
  updated_at: Date;
};

export type DocumentApiRecord = Record<string, unknown>;

export function metadataRowToDocumentApi(
  row: DocumentMetadataRow,
  fileDataBase64: string
): DocumentApiRecord {
  const base: DocumentApiRecord = {
    id: row.id,
    name: row.name ?? row.file_name,
    type: row.type ?? row.entity_type,
    entityId: row.entity_id ?? '',
    entityType: row.entity_type,
    fileData: fileDataBase64,
    fileName: row.file_name,
    fileSize: row.file_size ?? 0,
    mimeType: row.mime_type ?? 'application/octet-stream',
    uploadedAt:
      row.uploaded_at instanceof Date ? row.uploaded_at.toISOString() : String(row.uploaded_at),
    uploadedBy: row.uploaded_by ?? undefined,
    version: row.version,
  };
  if (row.deleted_at) {
    base.deletedAt =
      row.deleted_at instanceof Date ? row.deleted_at.toISOString() : String(row.deleted_at);
  }
  return base;
}

export type UpsertDocumentInput = {
  id?: string;
  name: string;
  type: string;
  entityId: string;
  entityType: string;
  fileData: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedBy?: string | null;
  userId?: string | null;
  version?: number;
};

export function parseUpsertDocumentBody(body: Record<string, unknown>): UpsertDocumentInput {
  const fileSizeRaw = body.fileSize ?? body.file_size;
  const fileSize = Number(fileSizeRaw);
  return {
    id: typeof body.id === 'string' && body.id.trim() ? body.id.trim() : undefined,
    name: String(body.name ?? '').trim(),
    type: String(body.type ?? '').trim(),
    entityId: String(body.entityId ?? body.entity_id ?? '').trim(),
    entityType: String(body.entityType ?? body.entity_type ?? '').trim(),
    fileData: String(body.fileData ?? body.file_data ?? ''),
    fileName: String(body.fileName ?? body.file_name ?? body.name ?? '').trim(),
    fileSize: Number.isFinite(fileSize) ? fileSize : 0,
    mimeType: String(body.mimeType ?? body.mime_type ?? 'application/octet-stream').trim(),
    uploadedBy: (body.uploadedBy ?? body.uploaded_by) as string | null | undefined,
    userId: (body.userId ?? body.user_id) as string | null | undefined,
    version: typeof body.version === 'number' ? body.version : undefined,
  };
}
