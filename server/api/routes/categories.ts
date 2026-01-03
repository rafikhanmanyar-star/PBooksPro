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

// POST create category
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const category = req.body;
    const result = await db.query(
      `INSERT INTO categories (
        id, tenant_id, name, type, description, is_permanent, is_rental, parent_category_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        category.id,
        req.tenantId,
        category.name,
        category.type,
        category.description || null,
        category.isPermanent || false,
        category.isRental || false,
        category.parentCategoryId || null
      ]
    );
    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
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

