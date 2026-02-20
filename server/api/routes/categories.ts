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

    const { limit, offset } = req.query;
    const effectiveLimit = Math.min(parseInt(limit as string) || 10000, 10000);
    let catQuery = 'SELECT * FROM categories WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name LIMIT $2';
    const catParams: any[] = [req.tenantId, effectiveLimit];
    if (offset) {
      catQuery += ' OFFSET $3';
      catParams.push(parseInt(offset as string) || 0);
    }
    const categories = await db.query(catQuery, catParams);
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
      'SELECT * FROM categories WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
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

    // Validate required fields
    if (!category.name || !category.type) {
      console.error('❌ POST /categories - Validation failed: missing required fields', {
        hasName: !!category.name,
        hasType: !!category.type,
        categoryData: JSON.stringify(category).substring(0, 200),
        tenantId: req.tenantId
      });
      return res.status(400).json({
        error: 'Validation error',
        message: 'Category name and type are required fields'
      });
    }

    // Generate ID if not provided
    const categoryId = category.id || `category_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('📝 POST /categories - Using category ID:', categoryId);

    // Track if this is an update operation
    let isUpdate = false;

    // Use transaction for data integrity (upsert behavior)
    const result = await db.transaction(async (client) => {
      // Check if category with this ID already exists
      const existing = await client.query(
        'SELECT * FROM categories WHERE id = $1 AND tenant_id = $2',
        [categoryId, req.tenantId]
      );

      if (existing.rows.length > 0) {
        // Check if this is a system category (is_permanent = true)
        if (existing.rows[0].is_permanent === true) {
          // System categories are read-only - return the existing category instead of error
          // This allows sync to succeed without trying to update system categories
          console.log('ℹ️ POST /categories - Skipping update of system category:', categoryId);
          return existing.rows[0];
        }

        // Optimistic locking check for POST update
        const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;
        const serverVersion = existing.rows[0].version;
        if (clientVersion != null && serverVersion != null && clientVersion !== serverVersion) {
          const err: any = new Error(`Expected version ${clientVersion} but server has version ${serverVersion}.`);
          err.code = 'VERSION_CONFLICT';
          err.status = 409;
          err.serverVersion = serverVersion;
          throw err;
        }

        // Update existing category
        console.log('🔄 POST /categories - Updating existing category:', categoryId);
        isUpdate = true;
        const updateResult = await client.query(
          `UPDATE categories 
           SET name = $1, type = $2, description = $3, is_rental = $4, 
               parent_category_id = $5, user_id = $6, updated_at = NOW(),
               version = COALESCE(version, 1) + 1,
               deleted_at = NULL
           WHERE id = $7 AND tenant_id = $8 AND is_permanent = FALSE AND (version = $9 OR version IS NULL)
           RETURNING *`,
          [
            category.name,
            category.type,
            category.description || null,
            category.isRental || false,
            category.parentCategoryId || null,
            req.user?.userId || null,
            categoryId,
            req.tenantId,
            serverVersion
          ]
        );

        if (updateResult.rows.length === 0) {
          // This shouldn't happen, but if it does, return existing category
          console.warn('⚠️ POST /categories - Update returned 0 rows, returning existing category:', categoryId);
          return existing.rows[0];
        }

        return updateResult.rows[0];
      } else {
        // Create new category
        console.log('➕ POST /categories - Creating new category:', categoryId);
        const insertResult = await client.query(
          `INSERT INTO categories (
            id, tenant_id, name, type, description, is_permanent, is_rental, 
            parent_category_id, user_id, created_at, updated_at, version
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), 1)
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
    // Enhanced error logging with full details
    console.error('❌ POST /categories - Error Details:', {
      errorMessage: error.message,
      errorCode: error.code,
      errorName: error.name,
      errorStack: error.stack?.substring(0, 500),
      constraint: error.constraint,
      detail: error.detail,
      table: error.table,
      column: error.column,
      tenantId: req.tenantId,
      categoryId: req.body?.id,
      categoryName: req.body?.name,
      categoryType: req.body?.type,
      requestBody: JSON.stringify(req.body).substring(0, 300)
    });

    // Handle version conflict (thrown from optimistic locking check)
    // Also match by message in case code/status are lost during transaction propagation
    const isVersionConflict =
      error.code === 'VERSION_CONFLICT' ||
      error.status === 409 ||
      (typeof error.message === 'string' && /Expected version \d+ but server has version \d+/.test(error.message));
    if (isVersionConflict) {
      return res.status(409).json({
        error: 'Version conflict',
        message: error.message || 'Version conflict',
        serverVersion: error.serverVersion,
      });
    }

    // Handle specific database errors
    if (error.code === '23505') { // Unique violation
      console.error('❌ POST /categories - Unique constraint violation:', {
        constraint: error.constraint,
        detail: error.detail,
        categoryId: req.body?.id
      });
      return res.status(409).json({
        error: 'Duplicate category',
        message: 'A category with this ID already exists'
      });
    }

    if (error.code === '23502') { // NOT NULL violation
      console.error('❌ POST /categories - NOT NULL constraint violation:', {
        column: error.column,
        detail: error.detail,
        categoryData: JSON.stringify(req.body).substring(0, 200)
      });
      return res.status(400).json({
        error: 'Validation error',
        message: `Required field '${error.column}' is missing`
      });
    }

    if (error.code === '23503') { // Foreign key violation
      console.error('❌ POST /categories - Foreign key constraint violation:', {
        constraint: error.constraint,
        detail: error.detail
      });
      return res.status(400).json({
        error: 'Validation error',
        message: 'Invalid reference to related entity'
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
    const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;

    let updateQuery = `
      UPDATE categories 
      SET name = $1, type = $2, description = $3, 
          is_rental = $4, parent_category_id = $5, updated_at = NOW(),
          version = COALESCE(version, 1) + 1
      WHERE id = $6 AND tenant_id = $7 AND is_permanent = FALSE
    `;
    const queryParams: any[] = [
      category.name,
      category.type,
      category.description || null,
      category.isRental || false,
      category.parentCategoryId || null,
      req.params.id,
      req.tenantId
    ];

    if (clientVersion != null) {
      updateQuery += ` AND version = $8`;
      queryParams.push(clientVersion);
    }

    updateQuery += ` RETURNING *`;

    const result = await db.query(updateQuery, queryParams);

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
      'UPDATE categories SET deleted_at = NOW(), updated_at = NOW(), version = COALESCE(version, 1) + 1 WHERE id = $1 AND tenant_id = $2 AND is_permanent = FALSE RETURNING id',
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

