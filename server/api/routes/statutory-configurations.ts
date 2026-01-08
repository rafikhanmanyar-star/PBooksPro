import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const configs = await db.query(
      'SELECT * FROM statutory_configurations WHERE tenant_id = $1 ORDER BY effective_from DESC',
      [req.tenantId]
    );
    res.json(configs);
  } catch (error) {
    console.error('Error fetching statutory configurations:', error);
    res.status(500).json({ error: 'Failed to fetch statutory configurations' });
  }
});

router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const configs = await db.query(
      'SELECT * FROM statutory_configurations WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (configs.length === 0) {
      return res.status(404).json({ error: 'Statutory configuration not found' });
    }
    res.json(configs[0]);
  } catch (error) {
    console.error('Error fetching statutory configuration:', error);
    res.status(500).json({ error: 'Failed to fetch statutory configuration' });
  }
});

router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const config = req.body;
    const configId = config.id || `statutory_config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const existing = await db.query(
      'SELECT id FROM statutory_configurations WHERE id = $1 AND tenant_id = $2',
      [configId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    const result = await db.query(
      `INSERT INTO statutory_configurations (
        id, tenant_id, user_id, country_code, type, employee_contribution_rate, employer_contribution_rate,
        max_salary_limit, effective_from, effective_to, rules, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                COALESCE((SELECT created_at FROM statutory_configurations WHERE id = $1), NOW()), NOW())
      ON CONFLICT (id) DO UPDATE SET
        country_code = EXCLUDED.country_code, type = EXCLUDED.type,
        employee_contribution_rate = EXCLUDED.employee_contribution_rate,
        employer_contribution_rate = EXCLUDED.employer_contribution_rate,
        max_salary_limit = EXCLUDED.max_salary_limit, effective_from = EXCLUDED.effective_from,
        effective_to = EXCLUDED.effective_to, rules = EXCLUDED.rules,
        user_id = EXCLUDED.user_id, updated_at = NOW()
      RETURNING *`,
      [
        configId, req.tenantId, req.user?.userId || null, config.countryCode, config.type,
        config.employeeContributionRate || null, config.employerContributionRate || null,
        config.maxSalaryLimit || null, config.effectiveFrom, config.effectiveTo || null,
        config.rules ? (typeof config.rules === 'string' ? config.rules : JSON.stringify(config.rules)) : null
      ]
    );
    
    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.STATUTORY_CONFIGURATION_UPDATED : WS_EVENTS.STATUTORY_CONFIGURATION_CREATED, {
      config: result[0], userId: req.user?.userId, username: req.user?.username,
    });
    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('Error creating/updating statutory configuration:', error);
    res.status(500).json({ error: 'Failed to create/update statutory configuration', message: error.message });
  }
});

router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM statutory_configurations WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    if (result.length === 0) {
      return res.status(404).json({ error: 'Statutory configuration not found' });
    }
    emitToTenant(req.tenantId!, WS_EVENTS.STATUTORY_CONFIGURATION_DELETED, {
      configId: req.params.id, userId: req.user?.userId, username: req.user?.username,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting statutory configuration:', error);
    res.status(500).json({ error: 'Failed to delete statutory configuration' });
  }
});

export default router;
