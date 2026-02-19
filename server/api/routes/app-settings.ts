import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

// GET all app settings for tenant
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const settings = await db.query(
      'SELECT * FROM app_settings WHERE tenant_id = $1',
      [req.tenantId]
    );
    const settingsMap: any = {};
    settings.forEach((row: any) => {
      settingsMap[row.key] = row.value;
    });
    res.json(settingsMap);
  } catch (error) {
    console.error('Error fetching app settings:', error);
    res.status(500).json({ error: 'Failed to fetch app settings' });
  }
});

// GET app setting by key
router.get('/:key', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const settings = await db.query(
      'SELECT * FROM app_settings WHERE key = $1 AND tenant_id = $2',
      [req.params.key, req.tenantId]
    );
    if (settings.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    res.json({ key: settings[0].key, value: settings[0].value });
  } catch (error) {
    console.error('Error fetching app setting:', error);
    res.status(500).json({ error: 'Failed to fetch app setting' });
  }
});

// POST/PUT create/update app setting (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { key, value } = req.body;
    
    if (!key) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Setting key is required'
      });
    }
    if (!req.tenantId) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Tenant context is required'
      });
    }
    
    const valueStr = typeof value === 'object' ? JSON.stringify(value) : value;
    const result = await db.query(
      `INSERT INTO app_settings (key, tenant_id, value)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT ON CONSTRAINT app_settings_pkey
       DO UPDATE SET value = EXCLUDED.value
       RETURNING *`,
      [key, req.tenantId, valueStr]
    );
    
    emitToTenant(req.tenantId!, WS_EVENTS.APP_SETTING_UPDATED, {
      key: result[0].key, value: result[0].value, userId: req.user?.userId, username: req.user?.username,
    });
    res.json({ key: result[0].key, value: result[0].value });
  } catch (error: any) {
    console.error('Error creating/updating app setting:', error);
    res.status(500).json({ error: 'Failed to create/update app setting', message: error.message });
  }
});

// DELETE app setting
router.delete('/:key', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM app_settings WHERE key = $1 AND tenant_id = $2 RETURNING key',
      [req.params.key, req.tenantId]
    );
    if (result.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    emitToTenant(req.tenantId!, WS_EVENTS.APP_SETTING_UPDATED, {
      key: req.params.key, deleted: true, userId: req.user?.userId, username: req.user?.username,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting app setting:', error);
    res.status(500).json({ error: 'Failed to delete app setting' });
  }
});

export default router;
