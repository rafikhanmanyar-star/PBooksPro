import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';

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
    const db = getDb();
    const contact = req.body;
    const result = await db.query(
      `INSERT INTO contacts (
        id, tenant_id, name, type, description, contact_no, company_name, address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        contact.id,
        req.tenantId,
        contact.name,
        contact.type,
        contact.description,
        contact.contactNo,
        contact.companyName,
        contact.address
      ]
    );
    res.json(result[0]);
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// PUT update contact
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const contact = req.body;
    const result = await db.query(
      `UPDATE contacts 
       SET name = $1, type = $2, description = $3, contact_no = $4, 
           company_name = $5, address = $6, updated_at = NOW()
       WHERE id = $7 AND tenant_id = $8
       RETURNING *`,
      [
        contact.name,
        contact.type,
        contact.description,
        contact.contactNo,
        contact.companyName,
        contact.address,
        req.params.id,
        req.tenantId
      ]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(500).json({ error: 'Failed to update contact' });
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
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

export default router;

