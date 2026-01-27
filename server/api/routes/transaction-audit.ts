import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET transaction audit logs
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { startDate, endDate, userId, transactionId, action, limit, offset } = req.query;
    
    let query = 'SELECT * FROM transaction_audit_log WHERE tenant_id = $1';
    const params: any[] = [req.tenantId];
    let paramIndex = 2;

    if (startDate) {
      query += ` AND created_at >= $${paramIndex++}`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND created_at <= $${paramIndex++}`;
      params.push(endDate);
    }
    if (userId) {
      query += ` AND user_id = $${paramIndex++}`;
      params.push(userId);
    }
    if (transactionId) {
      query += ` AND transaction_id = $${paramIndex++}`;
      params.push(transactionId);
    }
    if (action) {
      query += ` AND action = $${paramIndex++}`;
      params.push(action);
    }

    query += ' ORDER BY created_at DESC';

    if (limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(parseInt(limit as string));
    }
    if (offset) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(parseInt(offset as string));
    }

    const logs = await db.query(query, params);
    res.json(logs);
  } catch (error) {
    console.error('Error fetching transaction audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch transaction audit logs' });
  }
});

// GET single audit log entry
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const logs = await db.query(
      'SELECT * FROM transaction_audit_log WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    
    if (logs.length === 0) {
      return res.status(404).json({ error: 'Audit log not found' });
    }
    
    res.json(logs[0]);
  } catch (error) {
    console.error('Error fetching audit log:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

export default router;

