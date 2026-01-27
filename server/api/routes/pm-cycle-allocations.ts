import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all PM cycle allocations
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { projectId, cycleId, status } = req.query;
    
    let query = 'SELECT * FROM pm_cycle_allocations WHERE tenant_id = $1';
    const params: any[] = [req.tenantId];
    let paramIndex = 2;
    
    if (projectId) {
      query += ` AND project_id = $${paramIndex++}`;
      params.push(projectId);
    }
    if (cycleId) {
      query += ` AND cycle_id = $${paramIndex++}`;
      params.push(cycleId);
    }
    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    
    query += ' ORDER BY allocation_date DESC, cycle_id DESC';
    
    const allocations = await db.query(query, params);
    res.json(allocations);
  } catch (error) {
    console.error('Error fetching PM cycle allocations:', error);
    res.status(500).json({ error: 'Failed to fetch PM cycle allocations' });
  }
});

// GET PM cycle allocation by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const allocations = await db.query(
      'SELECT * FROM pm_cycle_allocations WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    
    if (allocations.length === 0) {
      return res.status(404).json({ error: 'PM cycle allocation not found' });
    }
    
    res.json(allocations[0]);
  } catch (error) {
    console.error('Error fetching PM cycle allocation:', error);
    res.status(500).json({ error: 'Failed to fetch PM cycle allocation' });
  }
});

// POST create/update PM cycle allocation (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const allocation = req.body;
    
    // Validate required fields
    if (!allocation.projectId) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Project ID is required'
      });
    }
    if (!allocation.cycleId) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Cycle ID is required'
      });
    }
    if (!allocation.cycleLabel) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Cycle label is required'
      });
    }
    if (!allocation.frequency) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Frequency is required'
      });
    }
    if (!allocation.startDate) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Start date is required'
      });
    }
    if (!allocation.endDate) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'End date is required'
      });
    }
    if (allocation.amount === undefined || allocation.amount === null) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Amount is required'
      });
    }
    
    // Generate ID if not provided
    const allocationId = allocation.id || `pm_alloc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check if allocation exists to determine if this is a create or update
    const existing = await db.query(
      'SELECT id FROM pm_cycle_allocations WHERE id = $1 AND tenant_id = $2',
      [allocationId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    // Use PostgreSQL UPSERT (ON CONFLICT) to handle race conditions
    const result = await db.query(
      `INSERT INTO pm_cycle_allocations (
        id, tenant_id, user_id, project_id, cycle_id, cycle_label, frequency,
        start_date, end_date, allocation_date, amount, paid_amount, status,
        bill_id, description, expense_total, fee_rate, excluded_category_ids,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
                COALESCE((SELECT created_at FROM pm_cycle_allocations WHERE id = $1), NOW()), NOW())
      ON CONFLICT (tenant_id, project_id, cycle_id) 
      DO UPDATE SET
        cycle_label = EXCLUDED.cycle_label,
        frequency = EXCLUDED.frequency,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        allocation_date = EXCLUDED.allocation_date,
        amount = EXCLUDED.amount,
        paid_amount = EXCLUDED.paid_amount,
        status = EXCLUDED.status,
        bill_id = EXCLUDED.bill_id,
        description = EXCLUDED.description,
        expense_total = EXCLUDED.expense_total,
        fee_rate = EXCLUDED.fee_rate,
        excluded_category_ids = EXCLUDED.excluded_category_ids,
        user_id = EXCLUDED.user_id,
        updated_at = NOW()
      RETURNING *`,
      [
        allocationId,
        req.tenantId,
        req.user?.userId || null,
        allocation.projectId,
        allocation.cycleId,
        allocation.cycleLabel,
        allocation.frequency,
        allocation.startDate,
        allocation.endDate,
        allocation.allocationDate || new Date().toISOString().split('T')[0],
        allocation.amount || 0,
        allocation.paidAmount || 0,
        allocation.status || 'unpaid',
        allocation.billId || null,
        allocation.description || null,
        allocation.expenseTotal || 0,
        allocation.feeRate || 0,
        allocation.excludedCategoryIds ? JSON.stringify(allocation.excludedCategoryIds) : '[]'
      ]
    );
    
    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.PM_CYCLE_ALLOCATION_UPDATED : WS_EVENTS.PM_CYCLE_ALLOCATION_CREATED, {
      allocation: result[0],
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('Error creating/updating PM cycle allocation:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ 
        error: 'Duplicate allocation',
        message: 'A PM cycle allocation for this project and cycle already exists'
      });
    }
    res.status(500).json({ 
      error: 'Failed to create/update PM cycle allocation',
      message: error.message || 'Internal server error'
    });
  }
});

// DELETE PM cycle allocation
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM pm_cycle_allocations WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'PM cycle allocation not found' });
    }
    
    emitToTenant(req.tenantId!, WS_EVENTS.PM_CYCLE_ALLOCATION_DELETED, {
      allocationId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting PM cycle allocation:', error);
    res.status(500).json({ error: 'Failed to delete PM cycle allocation' });
  }
});

export default router;
