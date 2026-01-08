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
      'SELECT * FROM tax_configurations WHERE tenant_id = $1 ORDER BY effective_from DESC',
      [req.tenantId]
    );
    res.json(configs);
  } catch (error) {
    console.error('Error fetching tax configurations:', error);
    res.status(500).json({ error: 'Failed to fetch tax configurations' });
  }
});

router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const configs = await db.query(
      'SELECT * FROM tax_configurations WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (configs.length === 0) {
      return res.status(404).json({ error: 'Tax configuration not found' });
    }
    res.json(configs[0]);
  } catch (error) {
    console.error('Error fetching tax configuration:', error);
    res.status(500).json({ error: 'Failed to fetch tax configuration' });
  }
});

router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const config = req.body;
    const configId = config.id || `tax_config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const existing = await db.query(
      'SELECT id FROM tax_configurations WHERE id = $1 AND tenant_id = $2',
      [configId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    const result = await db.query(
      `INSERT INTO tax_configurations (
        id, tenant_id, user_id, country_code, state_code, effective_from, effective_to,
        tax_slabs, exemptions, credits, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                COALESCE((SELECT created_at FROM tax_configurations WHERE id = $1), NOW()), NOW())
      ON CONFLICT (id) DO UPDATE SET
        country_code = EXCLUDED.country_code, state_code = EXCLUDED.state_code,
        effective_from = EXCLUDED.effective_from, effective_to = EXCLUDED.effective_to,
        tax_slabs = EXCLUDED.tax_slabs, exemptions = EXCLUDED.exemptions,
        credits = EXCLUDED.credits, metadata = EXCLUDED.metadata,
        user_id = EXCLUDED.user_id, updated_at = NOW()
      RETURNING *`,
      [
        configId, req.tenantId, req.user?.userId || null, config.countryCode,
        config.stateCode || null, config.effectiveFrom, config.effectiveTo || null,
        config.taxSlabs ? (typeof config.taxSlabs === 'string' ? config.taxSlabs : JSON.stringify(config.taxSlabs)) : '[]',
        config.exemptions ? (typeof config.exemptions === 'string' ? config.exemptions : JSON.stringify(config.exemptions)) : '[]',
        config.credits ? (typeof config.credits === 'string' ? config.credits : JSON.stringify(config.credits)) : '[]',
        config.metadata ? (typeof config.metadata === 'string' ? config.metadata : JSON.stringify(config.metadata)) : null
      ]
    );
    
    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.TAX_CONFIGURATION_UPDATED : WS_EVENTS.TAX_CONFIGURATION_CREATED, {
      config: result[0], userId: req.user?.userId, username: req.user?.username,
    });
    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('Error creating/updating tax configuration:', error);
    res.status(500).json({ error: 'Failed to create/update tax configuration', message: error.message });
  }
});

router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM tax_configurations WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    if (result.length === 0) {
      return res.status(404).json({ error: 'Tax configuration not found' });
    }
    emitToTenant(req.tenantId!, WS_EVENTS.TAX_CONFIGURATION_DELETED, {
      configId: req.params.id, userId: req.user?.userId, username: req.user?.username,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting tax configuration:', error);
    res.status(500).json({ error: 'Failed to delete tax configuration' });
  }
});

export default router;
