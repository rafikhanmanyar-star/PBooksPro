import type pg from 'pg';
import { randomUUID } from 'crypto';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import type { AuditRequestContext } from '../../../services/enterpriseAuditService.js';
import { DocumentStorageService } from './DocumentStorageService.js';
import {
  metadataRowToDocumentApi,
  parseUpsertDocumentBody,
  type DocumentApiRecord,
  type DocumentMetadataRow,
} from '../types/index.js';

export type DocumentListFilters = {
  entityType?: string;
  entityId?: string;
};

function decodeFileData(fileData: string): Buffer {
  const trimmed = fileData.trim();
  if (!trimmed) throw new Error('fileData is required.');
  if (trimmed.startsWith('data:')) {
    const comma = trimmed.indexOf(',');
    if (comma === -1) throw new Error('Invalid data URL in fileData.');
    return Buffer.from(trimmed.slice(comma + 1), 'base64');
  }
  return Buffer.from(trimmed, 'base64');
}

function encodeFileData(buffer: Buffer): string {
  return buffer.toString('base64');
}

export function createDocumentsModuleService(tenantId: string): DocumentsModuleService {
  return new DocumentsModuleService(tenantId);
}

/**
 * Architecture v2 — document CRUD via document_metadata + R2/inline fallback only.
 */
export class DocumentsModuleService {
  private readonly tenantId: string;
  private readonly storage: DocumentStorageService;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
    this.storage = new DocumentStorageService(tenantId);
  }

  async listDocuments(
    client: pg.PoolClient,
    filters?: DocumentListFilters
  ): Promise<DocumentApiRecord[]> {
    const metadataRows = await this.storage.repo.list(client, filters);
    return Promise.all(metadataRows.map((row) => this.metadataToApi(client, row)));
  }

  async getDocumentById(client: pg.PoolClient, id: string): Promise<DocumentApiRecord | null> {
    const meta = await this.storage.repo.getById(client, id);
    if (!meta) return null;
    return this.metadataToApi(client, meta);
  }

  async upsertDocument(
    client: pg.PoolClient,
    body: Record<string, unknown>,
    actorUserId: string | null,
    requestCtx?: AuditRequestContext
  ): Promise<{ row: DocumentApiRecord; conflict: boolean; wasInsert: boolean }> {
    const input = parseUpsertDocumentBody(body);
    if (!input.name) throw new Error('name is required.');
    if (!input.type) throw new Error('type is required.');
    if (!input.entityId) throw new Error('entityId is required.');
    if (!input.entityType) throw new Error('entityType is required.');
    if (!input.fileData) throw new Error('fileData is required.');
    if (!input.fileName) throw new Error('fileName is required.');

    const id =
      input.id ??
      (typeof body.id === 'string' && body.id.trim()
        ? body.id.trim()
        : `doc_${randomUUID().replace(/-/g, '')}`);

    const fileBuffer = decodeFileData(input.fileData);
    const fileSize = input.fileSize > 0 ? input.fileSize : fileBuffer.length;
    const uploadedBy = input.uploadedBy ?? input.userId ?? actorUserId ?? null;

    const existing = await this.storage.repo.getByIdIncludingDeleted(client, id);
    if (!existing) {
      const { storageKey, inlineData } = await this.storage.persistBytes(client, {
        documentId: id,
        entityType: input.entityType,
        fileName: input.fileName,
        body: fileBuffer,
      });
      const inserted = await this.storage.repo.insertMetadata(client, {
        id,
        name: input.name,
        type: input.type,
        entity_type: input.entityType,
        entity_id: input.entityId,
        file_name: input.fileName,
        storage_key: storageKey,
        mime_type: input.mimeType,
        file_size: fileSize,
        uploaded_by: uploadedBy,
        inline_data: inlineData,
      });
      const apiRow = await this.metadataToApi(client, inserted);
      await recordDomainMutation(client, {
        tenantId: this.tenantId,
        userId: actorUserId,
        module: 'documents',
        entityType: 'document',
        entityId: id,
        action: 'create',
        summary: `Document created: ${input.name}`,
        newValue: apiRow,
        version: inserted.version,
        requestCtx,
      });
      return { row: apiRow, conflict: false, wasInsert: true };
    }

    if (existing.deleted_at) {
      await this.storage.repo.restoreSoftDeleted(client, id);
    }

    if (input.version != null && input.version !== existing.version) {
      const apiRow = await this.metadataToApi(client, existing);
      return { row: apiRow, conflict: true, wasInsert: false };
    }

    const { storageKey, inlineData } = await this.storage.persistBytes(client, {
      documentId: id,
      entityType: input.entityType,
      fileName: input.fileName,
      body: fileBuffer,
    });

    const updated = await this.storage.repo.updateMetadata(client, id, {
      name: input.name,
      type: input.type,
      entity_type: input.entityType,
      entity_id: input.entityId,
      file_name: input.fileName,
      storage_key: storageKey,
      mime_type: input.mimeType,
      file_size: fileSize,
      uploaded_by: uploadedBy,
      inline_data: inlineData,
    });
    if (!updated) throw new Error('Document not found.');

    const apiRow = await this.metadataToApi(client, updated);
    await recordDomainMutation(client, {
      tenantId: this.tenantId,
      userId: actorUserId,
      module: 'documents',
      entityType: 'document',
      entityId: id,
      action: 'update',
      summary: `Document updated: ${input.name}`,
      oldValue: { id, version: existing.version },
      newValue: apiRow,
      version: updated.version,
      requestCtx,
    });
    return { row: apiRow, conflict: false, wasInsert: false };
  }

  async softDeleteDocument(
    client: pg.PoolClient,
    id: string,
    expectedVersion: number | undefined,
    actorUserId: string | null,
    requestCtx?: AuditRequestContext
  ): Promise<{ ok: boolean; conflict: boolean }> {
    const meta = await this.storage.repo.getById(client, id);
    if (!meta) return { ok: false, conflict: false };
    if (expectedVersion != null && meta.version !== expectedVersion) {
      return { ok: false, conflict: true };
    }
    const count = await this.storage.repo.softDeleteById(client, id, actorUserId);
    if (count === 0) return { ok: false, conflict: false };
    await recordDomainMutation(client, {
      tenantId: this.tenantId,
      userId: actorUserId,
      module: 'documents',
      entityType: 'document',
      entityId: id,
      action: 'delete',
      summary: `Document deleted: ${meta.name ?? meta.file_name}`,
      oldValue: { id, version: meta.version },
      requestCtx,
    });
    return { ok: true, conflict: false };
  }

  private async metadataToApi(
    client: pg.PoolClient,
    row: DocumentMetadataRow
  ): Promise<DocumentApiRecord> {
    const bytes = await this.storage.readBytes(client, row);
    return metadataRowToDocumentApi(row, encodeFileData(bytes));
  }
}

export {
  metadataRowToDocumentApi,
  parseUpsertDocumentBody,
} from '../types/index.js';

export async function listDocuments(
  client: pg.PoolClient,
  tenantId: string,
  filters?: DocumentListFilters
): Promise<DocumentApiRecord[]> {
  return createDocumentsModuleService(tenantId).listDocuments(client, filters);
}

export async function getDocumentById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<DocumentApiRecord | null> {
  return createDocumentsModuleService(tenantId).getDocumentById(client, id);
}

export async function upsertDocument(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null,
  requestCtx?: AuditRequestContext
): Promise<{ row: DocumentApiRecord; conflict: boolean; wasInsert: boolean }> {
  return createDocumentsModuleService(tenantId).upsertDocument(
    client,
    body,
    actorUserId,
    requestCtx
  );
}

export async function softDeleteDocument(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number,
  actorUserId?: string | null,
  requestCtx?: AuditRequestContext
): Promise<{ ok: boolean; conflict: boolean }> {
  return createDocumentsModuleService(tenantId).softDeleteDocument(
    client,
    id,
    expectedVersion,
    actorUserId ?? null,
    requestCtx
  );
}

export function rowToDocumentApi(row: DocumentApiRecord): DocumentApiRecord {
  return row;
}
