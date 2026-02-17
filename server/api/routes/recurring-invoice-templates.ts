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
      'SELECT * FROM recurring_invoice_templates WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
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
      'SELECT * FROM recurring_invoice_templates WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
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

    // Sanitize: convert empty strings to null for optional FK fields
    const contactId = template.contactId || null;
    const propertyId = template.propertyId || null;
    const buildingId = template.buildingId || null;
    const agreementId = template.agreementId || null;
    const userId = req.user?.userId || null;

    // Validate required fields
    if (!contactId || !propertyId) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'contactId and propertyId are required',
        received: { contactId: template.contactId, propertyId: template.propertyId }
      });
    }

    const existing = await db.query(
      'SELECT id, version FROM recurring_invoice_templates WHERE id = $1 AND tenant_id = $2',
      [templateId, req.tenantId]
    );
    const isUpdate = existing.length > 0;

    // Optimistic locking check for POST update
    const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;
    const serverVersion = isUpdate ? existing[0].version : null;
    if (clientVersion != null && serverVersion != null && clientVersion !== serverVersion) {
      return res.status(409).json({
        error: 'Version conflict',
        message: `Expected version ${clientVersion} but server has version ${serverVersion}.`,
        serverVersion,
      });
    }

    const result = await db.query(
      `INSERT INTO recurring_invoice_templates (
        id, tenant_id, user_id, contact_id, property_id, building_id, amount, description_template,
        day_of_month, next_due_date, active, agreement_id, invoice_type, frequency, auto_generate,
        max_occurrences, generated_count, last_generated_date, created_at, updated_at, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
                COALESCE((SELECT created_at FROM recurring_invoice_templates WHERE id = $1), NOW()), NOW(), 1)
      ON CONFLICT (id) DO UPDATE SET
        contact_id = EXCLUDED.contact_id, property_id = EXCLUDED.property_id, building_id = EXCLUDED.building_id,
        amount = EXCLUDED.amount, description_template = EXCLUDED.description_template,
        day_of_month = EXCLUDED.day_of_month, next_due_date = EXCLUDED.next_due_date,
        active = EXCLUDED.active, agreement_id = EXCLUDED.agreement_id, invoice_type = EXCLUDED.invoice_type,
        frequency = EXCLUDED.frequency,
        auto_generate = EXCLUDED.auto_generate, max_occurrences = EXCLUDED.max_occurrences,
        generated_count = EXCLUDED.generated_count, last_generated_date = EXCLUDED.last_generated_date,
        user_id = EXCLUDED.user_id, updated_at = NOW(),
        version = COALESCE(recurring_invoice_templates.version, 1) + 1,
        deleted_at = NULL
      WHERE recurring_invoice_templates.tenant_id = $2 AND (recurring_invoice_templates.version = $19 OR recurring_invoice_templates.version IS NULL)
      RETURNING *`,
      [
        templateId, req.tenantId, userId,
        contactId, propertyId, buildingId,
        template.amount, template.descriptionTemplate || '', template.dayOfMonth || 1,
        template.nextDueDate || new Date().toISOString().split('T')[0],
        template.active !== false, agreementId,
        template.invoiceType || 'Rental', template.frequency || null, template.autoGenerate || false,
        template.maxOccurrences || null, template.generatedCount || 0,
        template.lastGeneratedDate || null,
        serverVersion
      ]
    );

    emitToTenant(req.tenantId!, isUpdate ? WS_EVENTS.RECURRING_INVOICE_TEMPLATE_UPDATED : WS_EVENTS.RECURRING_INVOICE_TEMPLATE_CREATED, {
      template: result[0], userId: req.user?.userId, username: req.user?.username,
    });
    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('Error creating/updating recurring invoice template:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
      table: error.table,
      column: error.column,
      body: req.body,
    });
    res.status(500).json({
      error: 'Failed to create/update recurring invoice template',
      message: error.message,
      code: error.code,
      detail: error.detail,
    });
  }
});

router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'UPDATE recurring_invoice_templates SET deleted_at = NOW(), updated_at = NOW(), version = COALESCE(version, 1) + 1 WHERE id = $1 AND tenant_id = $2 RETURNING id',
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
