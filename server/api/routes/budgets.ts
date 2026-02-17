import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all budgets
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { projectId } = req.query;

    let query = 'SELECT * FROM budgets WHERE tenant_id = $1 AND deleted_at IS NULL';
    const params: any[] = [req.tenantId];

    if (projectId) {
      query += ' AND project_id = $2';
      params.push(projectId);
    }

    query += ' ORDER BY created_at DESC';

    const budgets = await db.query(query, params);
    res.json(budgets);
  } catch (error) {
    console.error('Error fetching budgets:', error);
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
});

// GET budget by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const budgets = await db.query(
      'SELECT * FROM budgets WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [req.params.id, req.tenantId]
    );

    if (budgets.length === 0) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    res.json(budgets[0]);
  } catch (error) {
    console.error('Error fetching budget:', error);
    res.status(500).json({ error: 'Failed to fetch budget' });
  }
});

// POST create/update budget (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const budget = req.body;

    // Validate required fields
    if (!budget.categoryId) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Category ID is required'
      });
    }
    if (budget.amount === undefined || budget.amount === null) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Amount is required'
      });
    }

    // Generate ID if not provided
    const budgetId = budget.id || `budget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check if budget exists to determine if this is a create or update
    const existing = await db.query(
      'SELECT id, version FROM budgets WHERE id = $1 AND tenant_id = $2',
      [budgetId, req.tenantId]
    );
    const isUpdate = existing.length > 0;

    // Optimistic locking check for POST update
    const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;
    const serverVersion = isUpdate ? existing[0].version : null;
    if (clientVersion != null && serverVersion != null && clientVersion !== serverVersion) {
      return res.status(409).json({
        error: 'Version conflict',
        message: `Expected version ${clientVersion} but server has version ${serverVersion}.`,
        serverVersion,
      });
    }

    // Use PostgreSQL UPSERT (ON CONFLICT) to handle race conditions
    const result = await db.query(
      `INSERT INTO budgets (
        id, tenant_id, category_id, amount, project_id, created_at, updated_at, version
      ) VALUES ($1, $2, $3, $4, $5,
                COALESCE((SELECT created_at FROM budgets WHERE id = $1), NOW()), NOW(), 1)
      ON CONFLICT (id) 
      DO UPDATE SET
        category_id = EXCLUDED.category_id,
        amount = EXCLUDED.amount,
        project_id = EXCLUDED.project_id,
        updated_at = NOW(),
        version = COALESCE(budgets.version, 1) + 1,
        deleted_at = NULL
      WHERE budgets.tenant_id = $2 AND (budgets.version = $6 OR budgets.version IS NULL)
      RETURNING *`,
      [
        budgetId,
        req.tenantId,
        budget.categoryId,
        budget.amount,
        budget.projectId || null,
        serverVersion
      ]
    );

    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.BUDGET_UPDATED : WS_EVENTS.BUDGET_CREATED, {
      budget: result[0],
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('Error creating/updating budget:', error);
    res.status(500).json({
      error: 'Failed to create/update budget',
      message: error.message || 'Internal server error'
    });
  }
});

// PUT update budget
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const budget = req.body;
    const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;

    let updateQuery = `
      UPDATE budgets 
      SET category_id = $1, amount = $2, project_id = $3, updated_at = NOW(),
          version = COALESCE(version, 1) + 1
      WHERE id = $4 AND tenant_id = $5
    `;
    const updateParams: any[] = [
      budget.categoryId,
      budget.amount,
      budget.projectId || null,
      req.params.id,
      req.tenantId
    ];

    if (clientVersion != null) {
      updateQuery += ` AND version = $6`;
      updateParams.push(clientVersion);
    }

    updateQuery += ` RETURNING *`;

    const result = await db.query(updateQuery, updateParams);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    emitToTenant(req.tenantId!, WS_EVENTS.BUDGET_UPDATED, {
      budget: result[0],
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating budget:', error);
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

// DELETE budget
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'UPDATE budgets SET deleted_at = NOW(), updated_at = NOW(), version = COALESCE(version, 1) + 1 WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    emitToTenant(req.tenantId!, WS_EVENTS.BUDGET_DELETED, {
      budgetId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting budget:', error);
    res.status(500).json({ error: 'Failed to delete budget' });
  }
});

export default router;

