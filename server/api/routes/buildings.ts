import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all buildings
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const buildings = await db.query(
      'SELECT * FROM buildings WHERE tenant_id = $1 ORDER BY name',
      [req.tenantId]
    );
    res.json(buildings);
  } catch (error) {
    console.error('Error fetching buildings:', error);
    res.status(500).json({ error: 'Failed to fetch buildings' });
  }
});

// GET building by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const buildings = await db.query(
      'SELECT * FROM buildings WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    
    if (buildings.length === 0) {
      return res.status(404).json({ error: 'Building not found' });
    }
    
    res.json(buildings[0]);
  } catch (error) {
    console.error('Error fetching building:', error);
    res.status(500).json({ error: 'Failed to fetch building' });
  }
});

// POST create building
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const building = req.body;
    const result = await db.query(
      `INSERT INTO buildings (id, tenant_id, name, description, color)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        building.id,
        req.tenantId,
        building.name,
        building.description || null,
        building.color || null
      ]
    );
    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error creating building:', error);
    res.status(500).json({ error: 'Failed to create building' });
  }
});

// PUT update building
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const building = req.body;
    const result = await db.query(
      `UPDATE buildings 
       SET name = $1, description = $2, color = $3, updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5
       RETURNING *`,
      [
        building.name,
        building.description || null,
        building.color || null,
        req.params.id,
        req.tenantId
      ]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Building not found' });
    }
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating building:', error);
    res.status(500).json({ error: 'Failed to update building' });
  }
});

// DELETE building
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM buildings WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Building not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting building:', error);
    res.status(500).json({ error: 'Failed to delete building' });
  }
});

export default router;

