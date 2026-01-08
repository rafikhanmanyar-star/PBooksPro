import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all documents
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { entity_type, entity_id } = req.query;
    
    let query = 'SELECT * FROM documents WHERE tenant_id = $1';
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

// GET document by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const documents = await db.query(
      'SELECT * FROM documents WHERE id = $1 AND tenant_id = $2',
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

// POST create/update document (upsert)
router.post('/', async (req: TenantRequest, res) => {
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
      'SELECT id FROM documents WHERE id = $1 AND tenant_id = $2',
      [documentId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    // Use PostgreSQL UPSERT (ON CONFLICT) to handle race conditions
    const result = await db.query(
      `INSERT INTO documents (
        id, tenant_id, user_id, name, type, entity_id, entity_type, file_data, file_name, file_size, mime_type, uploaded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 
                COALESCE((SELECT uploaded_at FROM documents WHERE id = $1), NOW()))
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
        uploaded_at = NOW()
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
        document.mimeType || 'application/octet-stream'
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

// DELETE document
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM documents WHERE id = $1 AND tenant_id = $2 RETURNING id',
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
