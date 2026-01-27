import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all categories
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    
    // Ensure system categories exist before fetching
    try {
      const { TenantInitializationService } = await import('../../services/tenantInitializationService.js');
      const initService = new TenantInitializationService(db);
      await initService.ensureSystemCategories(req.tenantId!);
    } catch (initError) {
      // Log but don't fail - categories will still be returned
      console.warn('Warning: Failed to ensure system categories:', initError);
    }
    
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b7c6f470-f7bd-4c58-8eaf-6c9a916f0a38',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'categories.ts:56',message:'POST /categories request entry',data:{tenantId:req.tenantId,hasName:!!req.body.name,hasType:!!req.body.type,hasId:!!req.body.id,name:req.body.name?.substring(0,20),type:req.body.type},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    const db = getDb();
    const category = req.body;
    
    // Generate ID if not provided
    const categoryId = category.id || `category_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('📝 POST /categories - Using category ID:', categoryId);
    
    // Track if this is an update operation
    let isUpdate = false;
    
    // Use transaction for data integrity (upsert behavior)
    const result = await db.transaction(async (client) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/b7c6f470-f7bd-4c58-8eaf-6c9a916f0a38',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'categories.ts:78',message:'Starting category transaction',data:{categoryId,tenantId:req.tenantId,hasName:!!category.name,hasType:!!category.type},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      // Check if category with this ID already exists
      const existing = await client.query(
        'SELECT * FROM categories WHERE id = $1 AND tenant_id = $2',
        [categoryId, req.tenantId]
      );
      
      if (existing.rows.length > 0) {
        // Check if this is a system category (is_permanent = true)
        if (existing.rows[0].is_permanent === true) {
          throw new Error('Cannot update system category');
        }
        
        // Update existing category
        console.log('🔄 POST /categories - Updating existing category:', categoryId);
        isUpdate = true;
        const updateResult = await client.query(
          `UPDATE categories 
           SET name = $1, type = $2, description = $3, is_rental = $4, 
               parent_category_id = $5, user_id = $6, updated_at = NOW()
           WHERE id = $7 AND tenant_id = $8 AND is_permanent = FALSE
           RETURNING *`,
          [
            category.name,
            category.type,
            category.description || null,
            category.isRental || false,
            category.parentCategoryId || null,
            req.user?.userId || null,
            categoryId,
            req.tenantId
          ]
        );
        
        if (updateResult.rows.length === 0) {
          throw new Error('Cannot update system category');
        }
        
        return updateResult.rows[0];
      } else {
        // Create new category
        console.log('➕ POST /categories - Creating new category:', categoryId);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b7c6f470-f7bd-4c58-8eaf-6c9a916f0a38',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'categories.ts:119',message:'Before INSERT category',data:{categoryId,tenantId:req.tenantId,name:category.name,type:category.type,hasDescription:!!category.description,hasUserId:!!req.user?.userId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        const insertResult = await client.query(
          `INSERT INTO categories (
            id, tenant_id, name, type, description, is_permanent, is_rental, parent_category_id, user_id, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
          RETURNING *`,
          [
            categoryId,
            req.tenantId,
            category.name,
            category.type,
            category.description || null,
            category.isPermanent || false,
            category.isRental || false,
            category.parentCategoryId || null,
            req.user?.userId || null
          ]
        );
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b7c6f470-f7bd-4c58-8eaf-6c9a916f0a38',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'categories.ts:137',message:'After INSERT category - success',data:{categoryId,rowsReturned:insertResult.rows.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
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
    
    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.CATEGORY_UPDATED : WS_EVENTS.CATEGORY_CREATED, {
      category: result,
      userId: req.user?.userId,
      username: req.user?.username,
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b7c6f470-f7bd-4c58-8eaf-6c9a916f0a38',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'categories.ts:159',message:'POST /categories error caught',data:{errorMessage:error.message,errorCode:error.code,errorName:error.name,tenantId:req.tenantId,categoryId:req.body?.id,constraint:error.constraint,detail:error.detail},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    if (error.code === '23505') { // Unique violation
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/b7c6f470-f7bd-4c58-8eaf-6c9a916f0a38',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'categories.ts:168',message:'Unique violation error',data:{errorCode:error.code,constraint:error.constraint,detail:error.detail},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
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
    
    // Check if category exists and is a system category
    const existing = await db.query(
      'SELECT is_permanent FROM categories WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    if (existing[0].is_permanent === true) {
      return res.status(403).json({ error: 'Cannot update system category' });
    }
    
    const category = req.body;
    const result = await db.query(
      `UPDATE categories 
       SET name = $1, type = $2, description = $3, 
           is_rental = $4, parent_category_id = $5, updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7 AND is_permanent = FALSE
       RETURNING *`,
      [
        category.name,
        category.type,
        category.description || null,
        category.isRental || false,
        category.parentCategoryId || null,
        req.params.id,
        req.tenantId
      ]
    );
    
    if (result.length === 0) {
      return res.status(403).json({ error: 'Cannot update system category' });
    }
    
    emitToTenant(req.tenantId!, WS_EVENTS.CATEGORY_UPDATED, {
      category: result[0],
      userId: req.user?.userId,
      username: req.user?.username,
    });

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
    
    // Check if category exists and is a system category
    const existing = await db.query(
      'SELECT is_permanent FROM categories WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    if (existing[0].is_permanent === true) {
      return res.status(403).json({ error: 'Cannot delete system category' });
    }
    
    const result = await db.query(
      'DELETE FROM categories WHERE id = $1 AND tenant_id = $2 AND is_permanent = FALSE RETURNING id',
      [req.params.id, req.tenantId]
    );
    
    if (result.length === 0) {
      return res.status(403).json({ error: 'Cannot delete system category' });
    }
    
    emitToTenant(req.tenantId!, WS_EVENTS.CATEGORY_DELETED, {
      categoryId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

export default router;

