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
    
    let query = 'SELECT * FROM budgets WHERE tenant_id = $1';
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
      'SELECT * FROM budgets WHERE id = $1 AND tenant_id = $2',
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

// POST create budget
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const budget = req.body;
    const result = await db.query(
      `INSERT INTO budgets (id, tenant_id, category_id, amount, project_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        budget.id,
        req.tenantId,
        budget.categoryId,
        budget.amount,
        budget.projectId || null
      ]
    );
    const saved = result[0];
    emitToTenant(req.tenantId!, WS_EVENTS.BUDGET_CREATED, {
      budget: saved,
      userId: req.user?.userId,
      username: req.user?.username,
    });
    res.status(201).json(saved);
  } catch (error) {
    console.error('Error creating budget:', error);
    res.status(500).json({ error: 'Failed to create budget' });
  }
});

// PUT update budget
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const budget = req.body;
    const result = await db.query(
      `UPDATE budgets 
       SET category_id = $1, amount = $2, project_id = $3, updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5
       RETURNING *`,
      [
        budget.categoryId,
        budget.amount,
        budget.projectId || null,
        req.params.id,
        req.tenantId
      ]
    );
    
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
      'DELETE FROM budgets WHERE id = $1 AND tenant_id = $2 RETURNING id',
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

