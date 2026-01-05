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
    const contacts = await db.query(
      'SELECT * FROM contacts WHERE tenant_id = $1 ORDER BY name',
      [req.tenantId]
    );
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
    
    // Check if contact with this ID already exists and belongs to a different tenant
    if (contact.id) {
      const existingContact = await db.query(
        'SELECT tenant_id FROM contacts WHERE id = $1',
        [contactId]
      );
      
      if (existingContact.length > 0 && existingContact[0].tenant_id !== req.tenantId) {
        console.error('❌ POST /contacts - Contact ID exists but belongs to different tenant:', {
          contactId,
          existingTenantId: existingContact[0].tenant_id,
          currentTenantId: req.tenantId
        });
        return res.status(403).json({ 
          error: 'Forbidden',
          message: 'A contact with this ID already exists in another organization'
        });
      }
    }
    
    // Use PostgreSQL UPSERT (ON CONFLICT) to handle race conditions
    // This prevents unique constraint violations when multiple requests come in simultaneously
    const result = await db.query(
      `INSERT INTO contacts (
        id, tenant_id, name, type, description, contact_no, company_name, address, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      ON CONFLICT (id) 
      DO UPDATE SET
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        description = EXCLUDED.description,
        contact_no = EXCLUDED.contact_no,
        company_name = EXCLUDED.company_name,
        address = EXCLUDED.address,
        updated_at = NOW()
      WHERE contacts.tenant_id = $2
      RETURNING *`,
      [
        contactId,
        req.tenantId,
        contact.name,
        contact.type,
        contact.description || null,
        contact.contactNo || null,
        contact.companyName || null,
        contact.address || null
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
        emitToTenant(req.tenantId!, WS_EVENTS.CONTACT_CREATED, {
          contact: savedContact,
          userId: req.user?.userId,
          username: req.user?.username,
        });
        
        return res.status(200).json(savedContact);
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
    emitToTenant(req.tenantId!, WS_EVENTS.CONTACT_CREATED, {
      contact: savedContact,
      userId: req.user?.userId,
      username: req.user?.username,
    });
    
    res.status(201).json(savedContact);
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
    
    const result = await db.query(
      `UPDATE contacts 
       SET name = $1, type = $2, description = $3, contact_no = $4, 
           company_name = $5, address = $6, updated_at = NOW()
       WHERE id = $7 AND tenant_id = $8
       RETURNING *`,
      [
        contact.name,
        contact.type,
        contact.description || null,
        contact.contactNo || null,
        contact.companyName || null,
        contact.address || null,
        req.params.id,
        req.tenantId
      ]
    );
    
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
      'DELETE FROM contacts WHERE id = $1 AND tenant_id = $2 RETURNING id',
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

