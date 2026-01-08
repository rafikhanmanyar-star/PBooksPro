import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all error logs (read-only, tenant-specific)
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { limit = 100 } = req.query;
    const errors = await db.query(
      'SELECT * FROM error_log WHERE tenant_id = $1 ORDER BY timestamp DESC LIMIT $2',
      [req.tenantId, parseInt(limit as string)]
    );
    res.json(errors);
  } catch (error) {
    console.error('Error fetching error logs:', error);
    res.status(500).json({ error: 'Failed to fetch error logs' });
  }
});

// GET error log by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const errors = await db.query(
      'SELECT * FROM error_log WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (errors.length === 0) {
      return res.status(404).json({ error: 'Error log not found' });
    }
    res.json(errors[0]);
  } catch (error) {
    console.error('Error fetching error log:', error);
    res.status(500).json({ error: 'Failed to fetch error log' });
  }
});

// POST create error log entry (typically called by error logger service)
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const errorLog = req.body;
    const result = await db.query(
      `INSERT INTO error_log (
        tenant_id, user_id, message, stack, component_stack, timestamp
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *`,
      [
        req.tenantId,
        req.user?.userId || errorLog.userId || null,
        errorLog.message || 'Unknown error',
        errorLog.stack || null,
        errorLog.componentStack || null
      ]
    );
    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('Error creating error log entry:', error);
    res.status(500).json({ error: 'Failed to create error log entry', message: error.message });
  }
});

// DELETE error log entry (cleanup)
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM error_log WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    if (result.length === 0) {
      return res.status(404).json({ error: 'Error log not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting error log:', error);
    res.status(500).json({ error: 'Failed to delete error log' });
  }
});

export default router;
