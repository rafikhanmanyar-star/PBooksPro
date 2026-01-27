import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

// Helper to build hierarchical tree structure
function buildInventoryTree(items: any[]): any[] {
  const itemsMap = new Map();
  const roots: any[] = [];

  // First pass: create map of all items
  items.forEach(item => {
    itemsMap.set(item.id, { ...item, children: [] });
  });

  // Second pass: build tree structure
  items.forEach(item => {
    const node = itemsMap.get(item.id);
    if (item.parent_id) {
      const parent = itemsMap.get(item.parent_id);
      if (parent) {
        parent.children.push(node);
      } else {
        // Parent not found, treat as root
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  });

  return roots;
}

// GET all inventory items (flat list or tree structure)
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { tree } = req.query; // ?tree=true for hierarchical structure
    
    const items = await db.query(
      `SELECT * FROM inventory_items WHERE tenant_id = $1 ORDER BY name`,
      [req.tenantId]
    );

    if (tree === 'true') {
      // Return hierarchical tree structure
      const treeData = buildInventoryTree(items);
      res.json(treeData);
    } else {
      // Return flat list
      res.json(items);
    }
  } catch (error) {
    console.error('Error fetching inventory items:', error);
    res.status(500).json({ error: 'Failed to fetch inventory items' });
  }
});

// GET all parent items (must be before /:id to avoid matching "parents" as id)
router.get('/parents/list', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const items = await db.query(
      `SELECT id, name, unit_type, price_per_unit 
       FROM inventory_items 
       WHERE tenant_id = $1 AND parent_id IS NULL 
       ORDER BY name`,
      [req.tenantId]
    );
    res.json(items);
  } catch (error) {
    console.error('Error fetching parent inventory items:', error);
    res.status(500).json({ error: 'Failed to fetch parent inventory items' });
  }
});

// GET inventory item by ID (with children if any)
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    
    // Get the item
    const items = await db.query(
      'SELECT * FROM inventory_items WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    
    if (items.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    const item = items[0];

    // Get children
    const children = await db.query(
      'SELECT * FROM inventory_items WHERE parent_id = $1 AND tenant_id = $2 ORDER BY name',
      [req.params.id, req.tenantId]
    );

    // Get parent name if applicable
    if (item.parent_id) {
      const parents = await db.query(
        'SELECT name FROM inventory_items WHERE id = $1 AND tenant_id = $2',
        [item.parent_id, req.tenantId]
      );
      if (parents.length > 0) {
        item.parent_name = parents[0].name;
      }
    }

    // Get category name if applicable
    if (item.expense_category_id) {
      const categories = await db.query(
        'SELECT name FROM categories WHERE id = $1 AND tenant_id = $2',
        [item.expense_category_id, req.tenantId]
      );
      if (categories.length > 0) {
        item.category_name = categories[0].name;
      }
    }

    res.json({
      ...item,
      children: children
    });
  } catch (error) {
    console.error('Error fetching inventory item:', error);
    res.status(500).json({ error: 'Failed to fetch inventory item' });
  }
});

// POST create/update inventory item (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    console.log('📥 POST /inventory-items - Request received:', {
      tenantId: req.tenantId,
      itemData: {
        id: req.body.id,
        name: req.body.name,
        unitType: req.body.unitType
      }
    });
    
    const db = getDb();
    const item = req.body;
    
    // Validate required fields
    if (!item.name || !item.unitType) {
      return res.status(400).json({ error: 'Name and unit type are required' });
    }

    // Validate unit type
    const validUnitTypes = ['LENGTH_FEET', 'AREA_SQFT', 'VOLUME_CUFT', 'QUANTITY'];
    if (!validUnitTypes.includes(item.unitType)) {
      return res.status(400).json({ error: 'Invalid unit type' });
    }

    // Check for circular parent reference
    if (item.parentId) {
      if (item.id === item.parentId) {
        return res.status(400).json({ error: 'An item cannot be its own parent' });
      }

      // Verify parent exists and belongs to same tenant
      const parents = await db.query(
        'SELECT * FROM inventory_items WHERE id = $1 AND tenant_id = $2',
        [item.parentId, req.tenantId]
      );

      if (parents.length === 0) {
        return res.status(400).json({ error: 'Parent inventory item not found' });
      }

      // Check for circular reference in ancestors
      let currentParentId = item.parentId;
      const visitedIds = new Set([item.id]);
      
      while (currentParentId) {
        if (visitedIds.has(currentParentId)) {
          return res.status(400).json({ error: 'Circular parent reference detected' });
        }
        visitedIds.add(currentParentId);

        const ancestors = await db.query(
          'SELECT parent_id FROM inventory_items WHERE id = $1 AND tenant_id = $2',
          [currentParentId, req.tenantId]
        );

        currentParentId = ancestors.length > 0 ? ancestors[0].parent_id : null;
      }
    }
    
    // Generate ID if not provided
    const itemId = item.id || `inv_item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('📝 POST /inventory-items - Using item ID:', itemId);
    
    let isUpdate = false;
    
    const result = await db.transaction(async (client) => {
      // Check if item with this ID already exists
      const existing = await client.query(
        'SELECT * FROM inventory_items WHERE id = $1 AND tenant_id = $2',
        [itemId, req.tenantId]
      );
      
      if (existing.rows.length > 0) {
        // Update existing item
        console.log('🔄 POST /inventory-items - Updating existing item:', itemId);
        isUpdate = true;
        const updateResult = await client.query(
          `UPDATE inventory_items 
           SET name = $1, parent_id = $2, expense_category_id = $3, unit_type = $4, 
               price_per_unit = $5, description = $6, user_id = $7, updated_at = NOW()
           WHERE id = $8 AND tenant_id = $9
           RETURNING *`,
          [
            item.name,
            item.parentId || null,
            item.expenseCategoryId || null,
            item.unitType,
            item.pricePerUnit || 0,
            item.description || null,
            req.user?.userId || null,
            itemId,
            req.tenantId
          ]
        );
        
        return updateResult.rows[0];
      } else {
        // Create new item
        console.log('➕ POST /inventory-items - Creating new item:', itemId);
        const insertResult = await client.query(
          `INSERT INTO inventory_items (
            id, tenant_id, user_id, name, parent_id, expense_category_id, 
            unit_type, price_per_unit, description, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
          RETURNING *`,
          [
            itemId,
            req.tenantId,
            req.user?.userId || null,
            item.name,
            item.parentId || null,
            item.expenseCategoryId || null,
            item.unitType,
            item.pricePerUnit || 0,
            item.description || null
          ]
        );
        return insertResult.rows[0];
      }
    });
    
    if (!result) {
      console.error('❌ POST /inventory-items - Transaction returned no result');
      return res.status(500).json({ error: 'Failed to create/update inventory item' });
    }
    
    console.log('✅ POST /inventory-items - Item saved successfully:', {
      id: result.id,
      name: result.name,
      tenantId: req.tenantId
    });
    
    // Emit WebSocket event for real-time sync
    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.DATA_UPDATED : WS_EVENTS.DATA_UPDATED, {
      type: 'inventory_item',
      action: isUpdate ? 'update' : 'create',
      data: result
    });
    
    res.status(isUpdate ? 200 : 201).json(result);
  } catch (error) {
    console.error('❌ POST /inventory-items - Error:', error);
    res.status(500).json({ error: 'Failed to create/update inventory item' });
  }
});

// DELETE inventory item
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    console.log('🗑️ DELETE /inventory-items/:id - Deleting item:', req.params.id);
    
    const db = getDb();

    // Check if item has children
    const children = await db.query(
      'SELECT COUNT(*) as count FROM inventory_items WHERE parent_id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );

    if (children[0]?.count > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete inventory item with children. Please delete or reassign child items first.' 
      });
    }
    
    const result = await db.query(
      'DELETE FROM inventory_items WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    
    console.log('✅ DELETE /inventory-items/:id - Item deleted successfully');
    
    // Emit WebSocket event for real-time sync
    emitToTenant(req.tenantId!, WS_EVENTS.DATA_UPDATED, {
      type: 'inventory_item',
      action: 'delete',
      data: { id: req.params.id }
    });
    
    res.json({ message: 'Inventory item deleted successfully' });
  } catch (error) {
    console.error('❌ DELETE /inventory-items/:id - Error:', error);
    res.status(500).json({ error: 'Failed to delete inventory item' });
  }
});

export default router;
