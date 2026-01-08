import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const components = await db.query(
      'SELECT * FROM salary_components WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json(components);
  } catch (error) {
    console.error('Error fetching salary components:', error);
    res.status(500).json({ error: 'Failed to fetch salary components' });
  }
});

router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const components = await db.query(
      'SELECT * FROM salary_components WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (components.length === 0) {
      return res.status(404).json({ error: 'Salary component not found' });
    }
    res.json(components[0]);
  } catch (error) {
    console.error('Error fetching salary component:', error);
    res.status(500).json({ error: 'Failed to fetch salary component' });
  }
});

router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const component = req.body;
    const componentId = component.id || `salary_component_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const existing = await db.query(
      'SELECT id FROM salary_components WHERE id = $1 AND tenant_id = $2',
      [componentId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    const result = await db.query(
      `INSERT INTO salary_components (
        id, tenant_id, user_id, name, type, is_taxable, is_system, calculation_type,
        formula, eligibility_rules, effective_from, effective_to, country_code, category,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                COALESCE((SELECT created_at FROM salary_components WHERE id = $1), NOW()), NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, type = EXCLUDED.type, is_taxable = EXCLUDED.is_taxable,
        is_system = EXCLUDED.is_system, calculation_type = EXCLUDED.calculation_type,
        formula = EXCLUDED.formula, eligibility_rules = EXCLUDED.eligibility_rules,
        effective_from = EXCLUDED.effective_from, effective_to = EXCLUDED.effective_to,
        country_code = EXCLUDED.country_code, category = EXCLUDED.category,
        user_id = EXCLUDED.user_id, updated_at = NOW()
      RETURNING *`,
      [
        componentId, req.tenantId, req.user?.userId || null,
        component.name, component.type, component.isTaxable || false,
        component.isSystem || false, component.calculationType || null,
        component.formula || null, component.eligibilityRules ? JSON.stringify(component.eligibilityRules) : null,
        component.effectiveFrom || null, component.effectiveTo || null,
        component.countryCode || null, component.category || null
      ]
    );
    
    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.SALARY_COMPONENT_UPDATED : WS_EVENTS.SALARY_COMPONENT_CREATED, {
      component: result[0], userId: req.user?.userId, username: req.user?.username,
    });
    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('Error creating/updating salary component:', error);
    res.status(500).json({ error: 'Failed to create/update salary component', message: error.message });
  }
});

router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM salary_components WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    if (result.length === 0) {
      return res.status(404).json({ error: 'Salary component not found' });
    }
    emitToTenant(req.tenantId!, WS_EVENTS.SALARY_COMPONENT_DELETED, {
      componentId: req.params.id, userId: req.user?.userId, username: req.user?.username,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting salary component:', error);
    res.status(500).json({ error: 'Failed to delete salary component' });
  }
});

export default router;
