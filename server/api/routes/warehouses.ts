import express from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const getDb = () => getDatabaseService();

const router = express.Router();

/** Normalize DB row (snake_case) to client shape (camelCase) for warehouses. */
function normalizeWarehouse(row: any): any {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || '',
    address: row.address ?? undefined,
    userId: row.user_id ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

// GET all warehouses
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    
    const warehouses = await db.query(
      `SELECT * FROM warehouses WHERE tenant_id = $1 ORDER BY name`,
      [req.tenantId]
    );

    res.json((warehouses || []).map(normalizeWarehouse));
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    res.status(500).json({ error: 'Failed to fetch warehouses' });
  }
});

// GET warehouse by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    
    const warehouses = await db.query(
      'SELECT * FROM warehouses WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    
    if (warehouses.length === 0) {
      return res.status(404).json({ error: 'Warehouse not found' });
    }

    res.json(normalizeWarehouse(warehouses[0]));
  } catch (error) {
    console.error('Error fetching warehouse:', error);
    res.status(500).json({ error: 'Failed to fetch warehouse' });
  }
});

// POST create/update warehouse (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    console.log('📥 POST /warehouses - Request received:', {
      tenantId: req.tenantId,
      warehouseData: {
        id: req.body.id,
        name: req.body.name
      }
    });
    
    const db = getDb();
    const warehouse = req.body;
    
    // Validate required fields
    if (!warehouse.name || warehouse.name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Generate ID if not provided
    const warehouseId = warehouse.id || `warehouse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('📝 POST /warehouses - Using warehouse ID:', warehouseId);
    
    let isUpdate = false;
    
    const result = await db.transaction(async (client) => {
      // Check if warehouse with this ID already exists
      const existing = await client.query(
        'SELECT * FROM warehouses WHERE id = $1 AND tenant_id = $2',
        [warehouseId, req.tenantId]
      );
      
      if (existing.rows.length > 0) {
        // Update existing warehouse
        console.log('🔄 POST /warehouses - Updating existing warehouse:', warehouseId);
        isUpdate = true;
        
        // Check if name is being changed and if new name conflicts
        if (existing.rows[0].name !== warehouse.name) {
          const nameConflict = await client.query(
            'SELECT id FROM warehouses WHERE name = $1 AND tenant_id = $2 AND id != $3',
            [warehouse.name.trim(), req.tenantId, warehouseId]
          );
          
          if (nameConflict.rows.length > 0) {
            throw { code: 'DUPLICATE_NAME', message: 'A warehouse with this name already exists' };
          }
        }
        
        const updateResult = await client.query(
          `UPDATE warehouses 
           SET name = $1, address = $2, user_id = $3, updated_at = NOW()
           WHERE id = $4 AND tenant_id = $5
           RETURNING *`,
          [
            warehouse.name.trim(),
            warehouse.address?.trim() || null,
            req.user?.userId || null,
            warehouseId,
            req.tenantId
          ]
        );
        
        return updateResult.rows[0];
      } else {
        // Create new warehouse
        console.log('➕ POST /warehouses - Creating new warehouse:', warehouseId);
        
        // Check for duplicate name
        const nameConflict = await client.query(
          'SELECT id FROM warehouses WHERE name = $1 AND tenant_id = $2',
          [warehouse.name.trim(), req.tenantId]
        );
        
        if (nameConflict.rows.length > 0) {
          throw { code: 'DUPLICATE_NAME', message: 'A warehouse with this name already exists' };
        }
        
        const insertResult = await client.query(
          `INSERT INTO warehouses (id, tenant_id, user_id, name, address, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           RETURNING *`,
          [
            warehouseId,
            req.tenantId,
            req.user?.userId || null,
            warehouse.name.trim(),
            warehouse.address?.trim() || null
          ]
        );
        
        return insertResult.rows[0];
      }
    });
    
    console.log(`✅ POST /warehouses - Warehouse ${isUpdate ? 'updated' : 'created'} successfully:`, result.id);
    
    // Emit WebSocket event for real-time sync
    emitToTenant(req.tenantId!, WS_EVENTS.DATA_UPDATED, {
      type: 'warehouse',
      action: isUpdate ? 'update' : 'create',
      data: normalizeWarehouse(result)
    });
    
    res.json(normalizeWarehouse(result));
  } catch (error: any) {
    console.error('❌ POST /warehouses - Error:', error);
    
    if (error.code === 'DUPLICATE_NAME') {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to save warehouse' });
  }
});

// DELETE warehouse
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    console.log('🗑️ DELETE /warehouses/:id - Deleting warehouse:', req.params.id);
    
    const db = getDb();

    // Check if warehouse is used in purchase bills (if warehouse_id column exists)
    // For now, we'll allow deletion. In the future, we can add validation here
    
    const result = await db.query(
      'DELETE FROM warehouses WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Warehouse not found' });
    }
    
    console.log('✅ DELETE /warehouses/:id - Warehouse deleted successfully');
    
    // Emit WebSocket event for real-time sync
    emitToTenant(req.tenantId!, WS_EVENTS.DATA_UPDATED, {
      type: 'warehouse',
      action: 'delete',
      data: { id: req.params.id }
    });
    
    res.json({ message: 'Warehouse deleted successfully' });
  } catch (error) {
    console.error('❌ DELETE /warehouses/:id - Error:', error);
    res.status(500).json({ error: 'Failed to delete warehouse' });
  }
});

export default router;
