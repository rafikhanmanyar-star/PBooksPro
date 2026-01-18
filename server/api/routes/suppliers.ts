import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

/**
 * POST /api/suppliers/promote
 * Promote a tenant to supplier by setting is_supplier=true and adding metadata
 */
router.post('/promote', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { tenantId, taxId, paymentTerms, supplierCategory, supplierStatus } = req.body;

    // Validate tenant exists
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    // Get tenant to verify it exists
    const tenant = await db.query(
      'SELECT id, name, is_supplier FROM tenants WHERE id = $1',
      [tenantId]
    );

    if (!tenant || tenant.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Update tenant to supplier with metadata
    const updateFields: string[] = ['is_supplier = TRUE', 'updated_at = NOW()'];
    const updateValues: any[] = [];
    let paramIndex = 1;

    if (taxId !== undefined) {
      updateFields.push(`tax_id = $${paramIndex++}`);
      updateValues.push(taxId);
    }

    if (paymentTerms !== undefined) {
      updateFields.push(`payment_terms = $${paramIndex++}`);
      updateValues.push(paymentTerms);
    }

    if (supplierCategory !== undefined) {
      updateFields.push(`supplier_category = $${paramIndex++}`);
      updateValues.push(supplierCategory);
    }

    if (supplierStatus !== undefined) {
      updateFields.push(`supplier_status = $${paramIndex++}`);
      updateValues.push(supplierStatus);
    }

    updateValues.push(tenantId);

    const updateQuery = `
      UPDATE tenants 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(updateQuery, updateValues);

    if (!result || result.length === 0) {
      return res.status(500).json({ error: 'Failed to update tenant' });
    }

    const updatedTenant = result[0];

    // Emit WebSocket event
    emitToTenant(req.tenantId, WS_EVENTS.SUPPLIER_PROMOTED, {
      tenantId: updatedTenant.id,
      isSupplier: true
    });

    res.json(updatedTenant);
  } catch (error: any) {
    console.error('Error promoting supplier:', error);
    res.status(500).json({ error: 'Failed to promote supplier' });
  }
});

/**
 * GET /api/suppliers
 * Get all suppliers (tenants with is_supplier=true)
 */
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const suppliers = await db.query(
      `SELECT id, name, company_name, email, phone, address, is_supplier, 
              tax_id, payment_terms, supplier_category, supplier_status, created_at
       FROM tenants 
       WHERE is_supplier = TRUE 
       ORDER BY name`
    );
    res.json(suppliers);
  } catch (error: any) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
});

export default router;
