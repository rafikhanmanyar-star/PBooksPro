import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all contacts
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { limit, offset } = req.query;
    const effectiveLimit = Math.min(parseInt(limit as string) || 10000, 10000);
    let query = 'SELECT * FROM contacts WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name LIMIT $2';
    const params: any[] = [req.tenantId, effectiveLimit];
    if (offset) {
      query += ' OFFSET $3';
      params.push(parseInt(offset as string) || 0);
    }
    const contacts = await db.query(query, params);
    res.json(contacts);
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// POST create contact
router.post('/', async (req: TenantRequest, res) => {
  try {
    console.log('📥 POST /contacts - Request received:', {
      tenantId: req.tenantId,
      userId: req.user?.userId,
      contactData: {
        id: req.body.id,
        name: req.body.name,
        type: req.body.type,
        hasDescription: !!req.body.description,
        hasContactNo: !!req.body.contactNo,
        hasCompanyName: !!req.body.companyName,
        hasAddress: !!req.body.address
      }
    });

    const db = getDb();
    const contact = req.body;

    // Validate required fields
    if (!contact.name || !contact.type) {
      console.error('❌ POST /contacts - Validation failed: missing name or type', {
        hasName: !!contact.name,
        hasType: !!contact.type
      });
      return res.status(400).json({
        error: 'Validation error',
        message: 'Name and type are required fields'
      });
    }

    // Generate ID if not provided
    const contactId = contact.id || `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('📝 POST /contacts - Using contact ID:', contactId);

    // Check for duplicate contact name (case-insensitive, trimmed), excluding current ID
    const trimmedName = contact.name.trim();
    const existingContactByName = await db.query(
      'SELECT id, name, type, version FROM contacts WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2) AND id != $3 AND deleted_at IS NULL',
      [req.tenantId, trimmedName, contactId]
    );

    if (existingContactByName.length > 0) {
      console.error('❌ POST /contacts - Duplicate contact name:', {
        name: trimmedName,
        existingContactId: existingContactByName[0].id,
        tenantId: req.tenantId
      });
      return res.status(409).json({
        error: 'Duplicate contact name',
        message: `A contact with the name "${trimmedName}" already exists. Contact names must be unique.`
      });
    }

    const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;

    // Check if contact exists to determine if this is a create or update
    const existing = await db.query(
      'SELECT id, tenant_id, version FROM contacts WHERE id = $1',
      [contactId]
    );

    const isUpdate = existing.length > 0;
    const serverVersion = isUpdate ? existing[0].version : null;

    if (isUpdate && existing[0].tenant_id !== req.tenantId) {
      console.error('❌ POST /contacts - Contact ID exists but belongs to different tenant:', {
        contactId,
        existingTenantId: existing[0].tenant_id,
        currentTenantId: req.tenantId
      });
      return res.status(403).json({
        error: 'Forbidden',
        message: 'A contact with this ID already exists in another organization'
      });
    }

    // Optimistic locking check for POST update
    if (clientVersion != null && serverVersion != null && clientVersion !== serverVersion) {
      return res.status(409).json({
        error: 'Version conflict',
        message: `Expected version ${clientVersion} but server has version ${serverVersion}.`,
        serverVersion,
      });
    }

    // Use PostgreSQL UPSERT (ON CONFLICT) to handle race conditions
    // This prevents unique constraint violations when multiple requests come in simultaneously
    const result = await db.query(
      `INSERT INTO contacts (
        id, tenant_id, name, type, description, contact_no, company_name, address, user_id, 
        created_at, updated_at, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), 1)
      ON CONFLICT (id) 
      DO UPDATE SET
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        description = EXCLUDED.description,
        contact_no = EXCLUDED.contact_no,
        company_name = EXCLUDED.company_name,
        address = EXCLUDED.address,
        user_id = EXCLUDED.user_id,
        updated_at = NOW(),
        version = COALESCE(contacts.version, 1) + 1,
        deleted_at = NULL
      WHERE contacts.tenant_id = $2 AND (contacts.version = $10 OR contacts.version IS NULL)
      RETURNING *`,
      [
        contactId,
        req.tenantId,
        contact.name,
        contact.type,
        contact.description || null,
        contact.contactNo || null,
        contact.companyName || null,
        contact.address || null,
        req.user?.userId || null,
        serverVersion
      ]
    );

    if (!result || result.length === 0) {
      // This can happen if the contact exists but the WHERE clause in DO UPDATE prevents the update
      // In this case, try to fetch the existing contact to verify it belongs to this tenant
      const existingContact = await db.query(
        'SELECT * FROM contacts WHERE id = $1 AND tenant_id = $2',
        [contactId, req.tenantId]
      );

      if (existingContact.length > 0) {
        // Contact exists and belongs to this tenant, but UPDATE didn't happen
        // This shouldn't normally occur, but handle it gracefully
        console.warn('⚠️ POST /contacts - Contact exists but UPDATE returned no rows, using existing contact');
        const savedContact = existingContact[0];

        // Emit WebSocket event
        emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.CONTACT_UPDATED : WS_EVENTS.CONTACT_CREATED, {
          contact: savedContact,
          userId: req.user?.userId,
          username: req.user?.username,
        });

        return res.status(isUpdate ? 200 : 201).json(savedContact);
      }

      console.error('❌ POST /contacts - Query returned no result and contact not found');
      return res.status(500).json({ error: 'Failed to create contact' });
    }

    const savedContact = result[0]; // db.query returns array

    console.log('✅ POST /contacts - Contact saved successfully:', {
      id: savedContact.id,
      name: savedContact.name,
      type: savedContact.type,
      tenantId: req.tenantId
    });

    // Emit WebSocket event for real-time sync
    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.CONTACT_UPDATED : WS_EVENTS.CONTACT_CREATED, {
      contact: savedContact,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.status(isUpdate ? 200 : 201).json(savedContact);
  } catch (error: any) {
    console.error('❌ POST /contacts - Error creating contact:', {
      error: error,
      errorMessage: error.message,
      errorCode: error.code,
      errorStack: error.stack,
      tenantId: req.tenantId,
      contactId: req.body?.id
    });

    // Handle specific database errors
    if (error.code === '23505') { // Unique violation
      console.error('❌ POST /contacts - Unique constraint violation');
      return res.status(409).json({
        error: 'Duplicate contact',
        message: 'A contact with this ID already exists'
      });
    }

    if (error.code === '23503') { // Foreign key violation
      console.error('❌ POST /contacts - Foreign key constraint violation');
      return res.status(400).json({
        error: 'Invalid reference',
        message: 'One or more referenced records do not exist'
      });
    }

    res.status(500).json({
      error: 'Failed to create contact',
      message: error.message || 'Internal server error'
    });
  }
});

// PUT update contact
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    console.log('📥 PUT /contacts/:id - Request received:', {
      contactId: req.params.id,
      tenantId: req.tenantId,
      userId: req.user?.userId,
      contactData: {
        name: req.body.name,
        type: req.body.type,
        hasDescription: !!req.body.description
      }
    });

    const db = getDb();
    const contact = req.body;

    // Validate required fields
    if (!contact.name || !contact.type) {
      console.error('❌ PUT /contacts/:id - Validation failed: missing name or type');
      return res.status(400).json({
        error: 'Validation error',
        message: 'Name and type are required fields'
      });
    }

    // Check for duplicate contact name (case-insensitive, trimmed), excluding the current contact
    const trimmedName = contact.name.trim();
    const existingContactByName = await db.query(
      'SELECT id, name, type FROM contacts WHERE tenant_id = $1 AND id != $2 AND LOWER(TRIM(name)) = LOWER($3)',
      [req.tenantId, req.params.id, trimmedName]
    );

    if (existingContactByName.length > 0) {
      console.error('❌ PUT /contacts/:id - Duplicate contact name:', {
        name: trimmedName,
        contactId: req.params.id,
        existingContactId: existingContactByName[0].id,
        tenantId: req.tenantId
      });
      return res.status(409).json({
        error: 'Duplicate contact name',
        message: `A contact with the name "${trimmedName}" already exists. Contact names must be unique.`
      });
    }

    // Optimistic locking
    const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;
    let putQuery = `
      UPDATE contacts 
      SET name = $1, type = $2, description = $3, contact_no = $4, 
          company_name = $5, address = $6, user_id = $7, updated_at = NOW(),
          version = COALESCE(version, 1) + 1
      WHERE id = $8 AND tenant_id = $9
    `;
    const putParams: any[] = [
      contact.name,
      contact.type,
      contact.description || null,
      contact.contactNo || null,
      contact.companyName || null,
      contact.address || null,
      req.user?.userId || null,
      req.params.id,
      req.tenantId
    ];

    if (clientVersion != null) {
      putQuery += ` AND version = $10`;
      putParams.push(clientVersion);
    }

    putQuery += ` RETURNING *`;

    const result = await db.query(putQuery, putParams);

    if (result.length === 0) {
      console.error('❌ PUT /contacts/:id - Contact not found:', req.params.id);
      return res.status(404).json({
        error: 'Contact not found',
        message: `Contact with ID ${req.params.id} not found or does not belong to your tenant`
      });
    }

    console.log('✅ PUT /contacts/:id - Contact updated successfully:', {
      id: result[0].id,
      name: result[0].name,
      tenantId: req.tenantId
    });

    // Emit WebSocket event for real-time sync
    emitToTenant(req.tenantId!, WS_EVENTS.CONTACT_UPDATED, {
      contact: result[0],
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json(result[0]);
  } catch (error: any) {
    console.error('❌ PUT /contacts/:id - Error updating contact:', {
      error: error,
      errorMessage: error.message,
      errorCode: error.code,
      contactId: req.params.id,
      tenantId: req.tenantId
    });
    res.status(500).json({
      error: 'Failed to update contact',
      message: error.message || 'Internal server error'
    });
  }
});

// DELETE contact
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'UPDATE contacts SET deleted_at = NOW(), updated_at = NOW(), version = COALESCE(version, 1) + 1 WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Emit WebSocket event for real-time sync
    emitToTenant(req.tenantId!, WS_EVENTS.CONTACT_DELETED, {
      contactId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

export default router;

