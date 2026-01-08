import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { employeeId, startDate, endDate } = req.query;
    let query = 'SELECT * FROM attendance_records WHERE tenant_id = $1';
    const params: any[] = [req.tenantId];
    let paramIndex = 2;
    if (employeeId) {
      query += ` AND employee_id = $${paramIndex++}`;
      params.push(employeeId);
    }
    if (startDate && endDate) {
      query += ` AND date BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      params.push(startDate, endDate);
    }
    query += ' ORDER BY date DESC, employee_id';
    const records = await db.query(query, params);
    res.json(records);
  } catch (error) {
    console.error('Error fetching attendance records:', error);
    res.status(500).json({ error: 'Failed to fetch attendance records' });
  }
});

router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const records = await db.query(
      'SELECT * FROM attendance_records WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (records.length === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }
    res.json(records[0]);
  } catch (error) {
    console.error('Error fetching attendance record:', error);
    res.status(500).json({ error: 'Failed to fetch attendance record' });
  }
});

router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const record = req.body;
    if (!record.employeeId || !record.date) {
      return res.status(400).json({ error: 'Employee ID and date are required' });
    }
    const recordId = record.id || `attendance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const existing = await db.query(
      'SELECT id FROM attendance_records WHERE id = $1 AND tenant_id = $2',
      [recordId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    const result = await db.query(
      `INSERT INTO attendance_records (
        id, tenant_id, user_id, employee_id, date, check_in, check_out, hours_worked,
        status, leave_type, project_id, notes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                COALESCE((SELECT created_at FROM attendance_records WHERE id = $1), NOW()), NOW())
      ON CONFLICT (tenant_id, employee_id, date) DO UPDATE SET
        check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out,
        hours_worked = EXCLUDED.hours_worked, status = EXCLUDED.status,
        leave_type = EXCLUDED.leave_type, project_id = EXCLUDED.project_id,
        notes = EXCLUDED.notes, user_id = EXCLUDED.user_id, updated_at = NOW()
      RETURNING *`,
      [
        recordId, req.tenantId, req.user?.userId || null, record.employeeId, record.date,
        record.checkIn || null, record.checkOut || null, record.hoursWorked || null,
        record.status || 'present', record.leaveType || null, record.projectId || null,
        record.notes || null
      ]
    );
    
    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.ATTENDANCE_RECORD_UPDATED : WS_EVENTS.ATTENDANCE_RECORD_CREATED, {
      record: result[0], userId: req.user?.userId, username: req.user?.username,
    });
    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('Error creating/updating attendance record:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Attendance record already exists for this employee and date' });
    }
    res.status(500).json({ error: 'Failed to create/update attendance record', message: error.message });
  }
});

router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM attendance_records WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    if (result.length === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }
    emitToTenant(req.tenantId!, WS_EVENTS.ATTENDANCE_RECORD_DELETED, {
      recordId: req.params.id, userId: req.user?.userId, username: req.user?.username,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting attendance record:', error);
    res.status(500).json({ error: 'Failed to delete attendance record' });
  }
});

export default router;
