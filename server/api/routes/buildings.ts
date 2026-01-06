import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

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

// POST create/update building (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const building = req.body;
    
    // Validate required fields
    if (!building.name) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Name is required'
      });
    }
    
    // Generate ID if not provided
    const buildingId = building.id || `building_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check if building with this ID already exists and belongs to a different tenant
    if (building.id) {
      const existingBuilding = await db.query(
        'SELECT tenant_id FROM buildings WHERE id = $1',
        [buildingId]
      );
      
      if (existingBuilding.length > 0 && existingBuilding[0].tenant_id !== req.tenantId) {
        return res.status(403).json({ 
          error: 'Forbidden',
          message: 'A building with this ID already exists in another organization'
        });
      }
    }
    
    // Check if building exists to determine if this is a create or update
    const existing = await db.query(
      'SELECT id FROM buildings WHERE id = $1 AND tenant_id = $2',
      [buildingId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    // Use PostgreSQL UPSERT (ON CONFLICT) to handle race conditions
    const result = await db.query(
      `INSERT INTO buildings (id, tenant_id, name, description, color, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE((SELECT created_at FROM buildings WHERE id = $1), NOW()), NOW())
       ON CONFLICT (id) 
       DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         color = EXCLUDED.color,
         updated_at = NOW()
       RETURNING *`,
      [
        buildingId,
        req.tenantId,
        building.name,
        building.description || null,
        building.color || null
      ]
    );
    const saved = result[0];
    
    // Emit WebSocket event for real-time sync
    if (isUpdate) {
      emitToTenant(req.tenantId!, WS_EVENTS.BUILDING_UPDATED, {
        building: saved,
        userId: req.user?.userId,
        username: req.user?.username,
      });
    } else {
      emitToTenant(req.tenantId!, WS_EVENTS.BUILDING_CREATED, {
        building: saved,
        userId: req.user?.userId,
        username: req.user?.username,
      });
    }
    
    res.status(isUpdate ? 200 : 201).json(saved);
  } catch (error) {
    console.error('Error creating/updating building:', error);
    res.status(500).json({ error: 'Failed to save building' });
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
    
    // Emit WebSocket event for real-time sync
    emitToTenant(req.tenantId!, WS_EVENTS.BUILDING_UPDATED, {
      building: result[0],
      userId: req.user?.userId,
      username: req.user?.username,
    });
    
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
    
    // Emit WebSocket event for real-time sync
    emitToTenant(req.tenantId!, WS_EVENTS.BUILDING_DELETED, {
      buildingId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting building:', error);
    res.status(500).json({ error: 'Failed to delete building' });
  }
});

export default router;

