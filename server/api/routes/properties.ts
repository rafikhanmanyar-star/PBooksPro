import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

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

// POST create/update property (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const property = req.body;
    
    // Validate required fields
    if (!property.name) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Name is required'
      });
    }
    
    // Generate ID if not provided
    const propertyId = property.id || `property_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check if property with this ID already exists and belongs to a different tenant
    if (property.id) {
      const existingProperty = await db.query(
        'SELECT tenant_id FROM properties WHERE id = $1',
        [propertyId]
      );
      
      if (existingProperty.length > 0 && existingProperty[0].tenant_id !== req.tenantId) {
        return res.status(403).json({ 
          error: 'Forbidden',
          message: 'A property with this ID already exists in another organization'
        });
      }
    }
    
    // Check if property exists to determine if this is a create or update
    const existing = await db.query(
      'SELECT id FROM properties WHERE id = $1 AND tenant_id = $2',
      [propertyId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    // Use PostgreSQL UPSERT (ON CONFLICT) to handle race conditions
    const result = await db.query(
      `INSERT INTO properties (
        id, tenant_id, name, owner_id, building_id, description, monthly_service_charge, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE((SELECT created_at FROM properties WHERE id = $1), NOW()), NOW())
      ON CONFLICT (id) 
      DO UPDATE SET
        name = EXCLUDED.name,
        owner_id = EXCLUDED.owner_id,
        building_id = EXCLUDED.building_id,
        description = EXCLUDED.description,
        monthly_service_charge = EXCLUDED.monthly_service_charge,
        updated_at = NOW()
      RETURNING *`,
      [
        propertyId,
        req.tenantId,
        property.name,
        property.ownerId,
        property.buildingId,
        property.description || null,
        property.monthlyServiceCharge || null
      ]
    );
    const saved = result[0];
    
    // Emit WebSocket event for real-time sync
    if (isUpdate) {
      emitToTenant(req.tenantId!, WS_EVENTS.PROPERTY_UPDATED, {
        property: saved,
        userId: req.user?.userId,
        username: req.user?.username,
      });
    } else {
      emitToTenant(req.tenantId!, WS_EVENTS.PROPERTY_CREATED, {
        property: saved,
        userId: req.user?.userId,
        username: req.user?.username,
      });
    }
    
    res.status(isUpdate ? 200 : 201).json(saved);
  } catch (error) {
    console.error('Error creating/updating property:', error);
    res.status(500).json({ error: 'Failed to save property' });
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
    
    // Emit WebSocket event for real-time sync
    emitToTenant(req.tenantId!, WS_EVENTS.PROPERTY_UPDATED, {
      property: result[0],
      userId: req.user?.userId,
      username: req.user?.username,
    });
    
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
    
    // Emit WebSocket event for real-time sync
    emitToTenant(req.tenantId!, WS_EVENTS.PROPERTY_DELETED, {
      propertyId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting property:', error);
    res.status(500).json({ error: 'Failed to delete property' });
  }
});

export default router;

