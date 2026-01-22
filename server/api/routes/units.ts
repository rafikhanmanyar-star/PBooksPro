import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

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

// POST create/update unit (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const unit = req.body;
    
    // Validate required fields
    if (!unit.name) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Name is required'
      });
    }
    
    // Generate ID if not provided
    const unitId = unit.id || `unit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check if unit with this ID already exists and belongs to a different tenant
    if (unit.id) {
      const existingUnit = await db.query(
        'SELECT tenant_id FROM units WHERE id = $1',
        [unitId]
      );
      
      if (existingUnit.length > 0 && existingUnit[0].tenant_id !== req.tenantId) {
        return res.status(403).json({ 
          error: 'Forbidden',
          message: 'A unit with this ID already exists in another organization'
        });
      }
    }
    
    // Check if unit exists to determine if this is a create or update
    const existing = await db.query(
      'SELECT id FROM units WHERE id = $1 AND tenant_id = $2',
      [unitId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    // Use PostgreSQL UPSERT (ON CONFLICT) to handle race conditions
    // Explicitly handle all fields with || null to ensure data preservation (same logic as bills)
    const result = await db.query(
      `INSERT INTO units (id, tenant_id, name, project_id, contact_id, sale_price, description, type, area, floor, user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE((SELECT created_at FROM units WHERE id = $1), NOW()), NOW())
       ON CONFLICT (id) 
       DO UPDATE SET
         name = EXCLUDED.name,
         project_id = EXCLUDED.project_id,
         contact_id = EXCLUDED.contact_id,
         sale_price = EXCLUDED.sale_price,
         description = EXCLUDED.description,
         type = EXCLUDED.type,
         area = EXCLUDED.area,
         floor = EXCLUDED.floor,
         user_id = EXCLUDED.user_id,
         updated_at = NOW()
       RETURNING *`,
      [
        unitId,
        req.tenantId,
        unit.name,
        unit.projectId || null,
        unit.contactId || null,
        unit.salePrice || null,
        unit.description || null,
        unit.type || null,
        unit.area || null,
        unit.floor || null,
        req.user?.userId || null
      ]
    );
    const saved = result[0];
    
    // Emit WebSocket event for real-time sync
    if (isUpdate) {
      emitToTenant(req.tenantId!, WS_EVENTS.UNIT_UPDATED, {
        unit: saved,
        userId: req.user?.userId,
        username: req.user?.username,
      });
    } else {
      emitToTenant(req.tenantId!, WS_EVENTS.UNIT_CREATED, {
        unit: saved,
        userId: req.user?.userId,
        username: req.user?.username,
      });
    }
    
    res.status(isUpdate ? 200 : 201).json(saved);
  } catch (error) {
    console.error('Error creating/updating unit:', error);
    res.status(500).json({ error: 'Failed to save unit' });
  }
});

// PUT update unit
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const unit = req.body;
    // Explicitly handle all fields with || null to ensure data preservation (same logic as bills)
    const result = await db.query(
      `UPDATE units 
       SET name = $1, project_id = $2, contact_id = $3, sale_price = $4, 
           description = $5, type = $6, area = $7, floor = $8, user_id = $9, updated_at = NOW()
       WHERE id = $10 AND tenant_id = $11
       RETURNING *`,
      [
        unit.name,
        unit.projectId || null,
        unit.contactId || null,
        unit.salePrice || null,
        unit.description || null,
        unit.type || null,
        unit.area || null,
        unit.floor || null,
        req.user?.userId || null,
        req.params.id,
        req.tenantId
      ]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    
    // Emit WebSocket event for real-time sync
    emitToTenant(req.tenantId!, WS_EVENTS.UNIT_UPDATED, {
      unit: result[0],
      userId: req.user?.userId,
      username: req.user?.username,
    });
    
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
    
    // Emit WebSocket event for real-time sync
    emitToTenant(req.tenantId!, WS_EVENTS.UNIT_DELETED, {
      unitId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting unit:', error);
    res.status(500).json({ error: 'Failed to delete unit' });
  }
});

export default router;

