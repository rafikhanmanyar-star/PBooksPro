import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const templates = await db.query(
      'SELECT * FROM recurring_invoice_templates WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json(templates);
  } catch (error) {
    console.error('Error fetching recurring invoice templates:', error);
    res.status(500).json({ error: 'Failed to fetch recurring invoice templates' });
  }
});

router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const templates = await db.query(
      'SELECT * FROM recurring_invoice_templates WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (templates.length === 0) {
      return res.status(404).json({ error: 'Recurring invoice template not found' });
    }
    res.json(templates[0]);
  } catch (error) {
    console.error('Error fetching recurring invoice template:', error);
    res.status(500).json({ error: 'Failed to fetch recurring invoice template' });
  }
});

router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const template = req.body;
    const templateId = template.id || `recurring_template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const existing = await db.query(
      'SELECT id FROM recurring_invoice_templates WHERE id = $1 AND tenant_id = $2',
      [templateId, req.tenantId]
    );
    const isUpdate = existing.length > 0;
    
    const result = await db.query(
      `INSERT INTO recurring_invoice_templates (
        id, tenant_id, user_id, contact_id, property_id, building_id, amount, description_template,
        day_of_month, next_due_date, active, agreement_id, frequency, auto_generate,
        max_occurrences, generated_count, last_generated_date, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                COALESCE((SELECT created_at FROM recurring_invoice_templates WHERE id = $1), NOW()), NOW())
      ON CONFLICT (id) DO UPDATE SET
        contact_id = EXCLUDED.contact_id, property_id = EXCLUDED.property_id, building_id = EXCLUDED.building_id,
        amount = EXCLUDED.amount, description_template = EXCLUDED.description_template,
        day_of_month = EXCLUDED.day_of_month, next_due_date = EXCLUDED.next_due_date,
        active = EXCLUDED.active, agreement_id = EXCLUDED.agreement_id, frequency = EXCLUDED.frequency,
        auto_generate = EXCLUDED.auto_generate, max_occurrences = EXCLUDED.max_occurrences,
        generated_count = EXCLUDED.generated_count, last_generated_date = EXCLUDED.last_generated_date,
        user_id = EXCLUDED.user_id, updated_at = NOW()
      RETURNING *`,
      [
        templateId, req.tenantId, req.user?.userId || null,
        template.contactId, template.propertyId, template.buildingId,
        template.amount, template.descriptionTemplate, template.dayOfMonth,
        template.nextDueDate, template.active !== false, template.agreementId || null,
        template.frequency || null, template.autoGenerate || false,
        template.maxOccurrences || null, template.generatedCount || 0,
        template.lastGeneratedDate || null
      ]
    );
    
    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.RECURRING_INVOICE_TEMPLATE_UPDATED : WS_EVENTS.RECURRING_INVOICE_TEMPLATE_CREATED, {
      template: result[0], userId: req.user?.userId, username: req.user?.username,
    });
    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('Error creating/updating recurring invoice template:', error);
    res.status(500).json({ error: 'Failed to create/update recurring invoice template', message: error.message });
  }
});

router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM recurring_invoice_templates WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    if (result.length === 0) {
      return res.status(404).json({ error: 'Recurring invoice template not found' });
    }
    emitToTenant(req.tenantId!, WS_EVENTS.RECURRING_INVOICE_TEMPLATE_DELETED, {
      templateId: req.params.id, userId: req.user?.userId, username: req.user?.username,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting recurring invoice template:', error);
    res.status(500).json({ error: 'Failed to delete recurring invoice template' });
  }
});

export default router;
