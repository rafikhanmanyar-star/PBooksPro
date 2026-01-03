import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all properties
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const properties = await db.query(
      'SELECT * FROM properties WHERE tenant_id = $1 ORDER BY name',
      [req.tenantId]
    );
    res.json(properties);
  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
});

// GET property by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const properties = await db.query(
      'SELECT * FROM properties WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    
    if (properties.length === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }
    
    res.json(properties[0]);
  } catch (error) {
    console.error('Error fetching property:', error);
    res.status(500).json({ error: 'Failed to fetch property' });
  }
});

// POST create property
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const property = req.body;
    const result = await db.query(
      `INSERT INTO properties (
        id, tenant_id, name, owner_id, building_id, description, monthly_service_charge
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        property.id,
        req.tenantId,
        property.name,
        property.ownerId,
        property.buildingId,
        property.description || null,
        property.monthlyServiceCharge || null
      ]
    );
    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error creating property:', error);
    res.status(500).json({ error: 'Failed to create property' });
  }
});

// PUT update property
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const property = req.body;
    const result = await db.query(
      `UPDATE properties 
       SET name = $1, owner_id = $2, building_id = $3, description = $4, 
           monthly_service_charge = $5, updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7
       RETURNING *`,
      [
        property.name,
        property.ownerId,
        property.buildingId,
        property.description || null,
        property.monthlyServiceCharge || null,
        req.params.id,
        req.tenantId
      ]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating property:', error);
    res.status(500).json({ error: 'Failed to update property' });
  }
});

// DELETE property
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM properties WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting property:', error);
    res.status(500).json({ error: 'Failed to delete property' });
  }
});

export default router;

