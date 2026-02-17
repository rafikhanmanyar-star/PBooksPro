import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

/** Allowed roles for document access (organization users as defined in settings) */
const ALLOWED_DOCUMENT_ROLES = ['admin', 'manager', 'accounts'];

function canAccessDocuments(req: TenantRequest): boolean {
  const role = (req.userRole || req.user?.role || '').trim().toLowerCase();
  return !!role && ALLOWED_DOCUMENT_ROLES.includes(role);
}

// GET all documents (organization users only, by role)
router.get('/', async (req: TenantRequest, res) => {
  if (!canAccessDocuments(req)) {
    return res.status(403).json({ error: 'Forbidden', message: 'Your role does not have access to documents.' });
  }
  try {
    const db = getDb();
    const { entity_type, entity_id } = req.query;

    let query = 'SELECT * FROM documents WHERE tenant_id = $1 AND deleted_at IS NULL';
    const params: any[] = [req.tenantId];

    if (entity_type) {
      query += ' AND entity_type = $2';
      params.push(entity_type);
      if (entity_id) {
        query += ' AND entity_id = $3';
        params.push(entity_id);
      }
    }

    query += ' ORDER BY uploaded_at DESC';

    const documents = await db.query(query, params);
    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// GET document by ID (organization users only, by role)
router.get('/:id', async (req: TenantRequest, res) => {
  if (!canAccessDocuments(req)) {
    return res.status(403).json({ error: 'Forbidden', message: 'Your role does not have access to documents.' });
  }
  try {
    const db = getDb();
    const documents = await db.query(
      'SELECT * FROM documents WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [req.params.id, req.tenantId]
    );

    if (documents.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(documents[0]);
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// GET document file by ID (returns file data; organization users only, by role)
// SECURITY: Use only JWT-derived tenantId so Organization B cannot access Organization A's documents.
router.get('/:id/file', async (req: TenantRequest, res) => {
  if (!canAccessDocuments(req)) {
    return res.status(403).json({ error: 'Forbidden', message: 'Your role does not have access to documents.' });
  }
  try {
    const db = getDb();
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const documents = await db.query(
      'SELECT file_data, file_name, mime_type FROM documents WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [req.params.id, tenantId]
    );

    if (documents.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = documents[0];
    const fileData = doc.file_data;
    const mimeType = doc.mime_type || 'application/octet-stream';

    // Convert base64 to buffer
    const buffer = Buffer.from(fileData, 'base64');

    // Set headers for proper file serving
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${doc.file_name}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.send(buffer);
  } catch (error) {
    console.error('Error fetching document file:', error);
    res.status(500).json({ error: 'Failed to fetch document file' });
  }
});

// POST create/update document (upsert; organization users only, by role)
router.post('/', async (req: TenantRequest, res) => {
  if (!canAccessDocuments(req)) {
    return res.status(403).json({ error: 'Forbidden', message: 'Your role does not have access to upload documents.' });
  }
  try {
    const db = getDb();
    const document = req.body;

    // Validate required fields
    if (!document.name) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Name is required'
      });
    }
    if (!document.type) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Type is required'
      });
    }
    if (!document.entityId) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Entity ID is required'
      });
    }
    if (!document.entityType) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Entity type is required'
      });
    }
    if (!document.fileData) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'File data is required'
      });
    }
    if (!document.fileName) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'File name is required'
      });
    }
    if (!document.fileSize) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'File size is required'
      });
    }
    if (!document.mimeType) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'MIME type is required'
      });
    }

    // Generate ID if not provided
    const documentId = document.id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check if document exists to determine if this is a create or update
    const existing = await db.query(
      'SELECT id, version FROM documents WHERE id = $1 AND tenant_id = $2',
      [documentId, req.tenantId]
    );
    const isUpdate = existing.length > 0;

    // Optimistic locking check for POST update
    const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;
    const serverVersion = isUpdate ? existing[0].version : null;
    if (clientVersion != null && serverVersion != null && clientVersion !== serverVersion) {
      return res.status(409).json({
        error: 'Version conflict',
        message: `Expected version ${clientVersion} but server has version ${serverVersion}.`,
        serverVersion,
      });
    }

    // Use PostgreSQL UPSERT (ON CONFLICT) to handle race conditions
    const result = await db.query(
      `INSERT INTO documents (
        id, tenant_id, user_id, name, type, entity_id, entity_type, file_data, file_name, file_size, mime_type, uploaded_at, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 
                COALESCE((SELECT uploaded_at FROM documents WHERE id = $1), NOW()), 1)
      ON CONFLICT (id) 
      DO UPDATE SET
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        entity_id = EXCLUDED.entity_id,
        entity_type = EXCLUDED.entity_type,
        file_data = EXCLUDED.file_data,
        file_name = EXCLUDED.file_name,
        file_size = EXCLUDED.file_size,
        mime_type = EXCLUDED.mime_type,
        user_id = EXCLUDED.user_id,
        uploaded_at = NOW(),
        version = COALESCE(documents.version, 1) + 1,
        deleted_at = NULL
      WHERE documents.tenant_id = $2 AND (documents.version = $12 OR documents.version IS NULL)
      RETURNING *`,
      [
        documentId,
        req.tenantId,
        req.user?.userId || null,
        document.name,
        document.type,
        document.entityId,
        document.entityType,
        document.fileData,
        document.fileName,
        document.fileSize,
        document.mimeType || 'application/octet-stream',
        serverVersion
      ]
    );

    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.DOCUMENT_UPDATED : WS_EVENTS.DOCUMENT_CREATED, {
      document: result[0],
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('Error creating/updating document:', error);
    res.status(500).json({
      error: 'Failed to create/update document',
      message: error.message || 'Internal server error'
    });
  }
});

// DELETE document (organization users only, by role)
router.delete('/:id', async (req: TenantRequest, res) => {
  if (!canAccessDocuments(req)) {
    return res.status(403).json({ error: 'Forbidden', message: 'Your role does not have access to delete documents.' });
  }
  try {
    const db = getDb();
    const result = await db.query(
      'UPDATE documents SET deleted_at = NOW(), uploaded_at = NOW(), version = COALESCE(version, 1) + 1 WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    emitToTenant(req.tenantId!, WS_EVENTS.DOCUMENT_DELETED, {
      documentId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
