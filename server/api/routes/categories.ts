import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all categories
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const categories = await db.query(
      'SELECT * FROM categories WHERE tenant_id = $1 ORDER BY name',
      [req.tenantId]
    );
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET category by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const categories = await db.query(
      'SELECT * FROM categories WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    
    if (categories.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    res.json(categories[0]);
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({ error: 'Failed to fetch category' });
  }
});

// POST create/update category (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    console.log('📥 POST /categories - Request received:', {
      tenantId: req.tenantId,
      categoryData: {
        id: req.body.id,
        name: req.body.name,
        type: req.body.type
      }
    });
    
    const db = getDb();
    const category = req.body;
    
    // Generate ID if not provided
    const categoryId = category.id || `category_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('📝 POST /categories - Using category ID:', categoryId);
    
    // Use transaction for data integrity (upsert behavior)
    const result = await db.transaction(async (client) => {
      // Check if category with this ID already exists
      const existing = await client.query(
        'SELECT * FROM categories WHERE id = $1 AND tenant_id = $2',
        [categoryId, req.tenantId]
      );
      
      if (existing.rows.length > 0) {
        // Update existing category
        console.log('🔄 POST /categories - Updating existing category:', categoryId);
        const updateResult = await client.query(
          `UPDATE categories 
           SET name = $1, type = $2, description = $3, is_permanent = $4, 
               is_rental = $5, parent_category_id = $6, updated_at = NOW()
           WHERE id = $7 AND tenant_id = $8
           RETURNING *`,
          [
            category.name,
            category.type,
            category.description || null,
            category.isPermanent || false,
            category.isRental || false,
            category.parentCategoryId || null,
            categoryId,
            req.tenantId
          ]
        );
        return updateResult.rows[0];
      } else {
        // Create new category
        console.log('➕ POST /categories - Creating new category:', categoryId);
        const insertResult = await client.query(
          `INSERT INTO categories (
            id, tenant_id, name, type, description, is_permanent, is_rental, parent_category_id, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
          RETURNING *`,
          [
            categoryId,
            req.tenantId,
            category.name,
            category.type,
            category.description || null,
            category.isPermanent || false,
            category.isRental || false,
            category.parentCategoryId || null
          ]
        );
        return insertResult.rows[0];
      }
    });
    
    if (!result) {
      console.error('❌ POST /categories - Transaction returned no result');
      return res.status(500).json({ error: 'Failed to create/update category' });
    }
    
    console.log('✅ POST /categories - Category saved successfully:', {
      id: result.id,
      name: result.name,
      tenantId: req.tenantId
    });
    
    res.status(201).json(result);
  } catch (error: any) {
    console.error('❌ POST /categories - Error:', {
      error: error,
      errorMessage: error.message,
      errorCode: error.code,
      tenantId: req.tenantId,
      categoryId: req.body?.id
    });
    
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ 
        error: 'Duplicate category',
        message: 'A category with this ID already exists'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create/update category',
      message: error.message || 'Internal server error'
    });
  }
});

// PUT update category
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const category = req.body;
    const result = await db.query(
      `UPDATE categories 
       SET name = $1, type = $2, description = $3, is_permanent = $4, 
           is_rental = $5, parent_category_id = $6, updated_at = NOW()
       WHERE id = $7 AND tenant_id = $8
       RETURNING *`,
      [
        category.name,
        category.type,
        category.description || null,
        category.isPermanent || false,
        category.isRental || false,
        category.parentCategoryId || null,
        req.params.id,
        req.tenantId
      ]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// DELETE category
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM categories WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

export default router;

