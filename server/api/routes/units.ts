import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all units
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const units = await db.query(
      'SELECT * FROM units WHERE tenant_id = $1 ORDER BY name',
      [req.tenantId]
    );
    res.json(units);
  } catch (error) {
    console.error('Error fetching units:', error);
    res.status(500).json({ error: 'Failed to fetch units' });
  }
});

// GET unit by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const units = await db.query(
      'SELECT * FROM units WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    
    if (units.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    
    res.json(units[0]);
  } catch (error) {
    console.error('Error fetching unit:', error);
    res.status(500).json({ error: 'Failed to fetch unit' });
  }
});

// POST create unit
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const unit = req.body;
    const result = await db.query(
      `INSERT INTO units (id, tenant_id, name, project_id, contact_id, sale_price, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        unit.id,
        req.tenantId,
        unit.name,
        unit.projectId,
        unit.contactId || null,
        unit.salePrice || null,
        unit.description || null
      ]
    );
    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error creating unit:', error);
    res.status(500).json({ error: 'Failed to create unit' });
  }
});

// PUT update unit
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const unit = req.body;
    const result = await db.query(
      `UPDATE units 
       SET name = $1, project_id = $2, contact_id = $3, sale_price = $4, 
           description = $5, updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7
       RETURNING *`,
      [
        unit.name,
        unit.projectId,
        unit.contactId || null,
        unit.salePrice || null,
        unit.description || null,
        req.params.id,
        req.tenantId
      ]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating unit:', error);
    res.status(500).json({ error: 'Failed to update unit' });
  }
});

// DELETE unit
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM units WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting unit:', error);
    res.status(500).json({ error: 'Failed to delete unit' });
  }
});

export default router;

