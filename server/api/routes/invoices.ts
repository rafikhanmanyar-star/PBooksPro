import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';
import { clearCache } from '../../middleware/cacheMiddleware.js';

const router = Router();
const getDb = () => getDatabaseService();

function invalidateARCache(tenantId: string) {
  clearCache(`__ar__${tenantId}`);
}

function computeInvoiceStatus(paidAmount: number, invoiceAmount: number): string {
  if (paidAmount >= invoiceAmount - 0.1) return 'Paid';
  if (paidAmount > 0.1) return 'Partially Paid';
  return 'Unpaid';
}

// GET all invoices
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { status, invoiceType, projectId, limit, offset } = req.query;

    let query = 'SELECT * FROM invoices WHERE tenant_id = $1 AND deleted_at IS NULL';
    const params: any[] = [req.tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (invoiceType) {
      query += ` AND invoice_type = $${paramIndex++}`;
      params.push(invoiceType);
    }
    if (projectId) {
      query += ` AND project_id = $${paramIndex++}`;
      params.push(projectId);
    }

    query += ' ORDER BY issue_date DESC';

    const effectiveLimit = Math.min(parseInt(limit as string) || 10000, 10000);
    query += ` LIMIT $${paramIndex++}`;
    params.push(effectiveLimit);
    if (offset) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(parseInt(offset as string) || 0);
    }

    const invoices = await db.query(query, params);
    res.json(invoices);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// GET invoice by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const invoices = await db.query(
      'SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [req.params.id, req.tenantId]
    );

    if (invoices.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json(invoices[0]);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// POST create/update invoice (upsert)
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const invoice = req.body;

    // Validate required fields
    if (!invoice.invoiceNumber) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Invoice number is required'
      });
    }

    // Generate ID if not provided
    const invoiceId = invoice.id || `invoice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check if invoice with this ID already exists and belongs to a different tenant
    if (invoice.id) {
      const existingInvoice = await db.query(
        'SELECT tenant_id FROM invoices WHERE id = $1',
        [invoiceId]
      );

      if (existingInvoice.length > 0 && existingInvoice[0].tenant_id !== req.tenantId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'An invoice with this ID already exists in another organization'
        });
      }
    }

    // Check if invoice exists by ID to determine if this is a create or update
    const existing = await db.query(
      'SELECT id, invoice_number, status, version FROM invoices WHERE id = $1 AND tenant_id = $2',
      [invoiceId, req.tenantId]
    );
    const isUpdate = existing.length > 0;

    // Immutability: reject updates to paid invoices (financial data safety)
    if (isUpdate && existing[0].status === 'Paid') {
      return res.status(403).json({
        error: 'Immutable record',
        message: 'Cannot modify a paid invoice. Posted financial records are immutable.',
        code: 'INVOICE_PAID_IMMUTABLE',
        invoiceId: existing[0].id,
        invoiceNumber: existing[0].invoice_number ?? undefined,
      });
    }

    // Wrap duplicate cleanup + upsert in a transaction to prevent race conditions
    const { saved, isActualUpdate } = await db.transaction(async (client) => {
      const cq = async (text: string, params?: any[]) => (await client.query(text, params)).rows;

      // Handle duplicate invoice_number: if another invoice with the same number exists
      // (e.g. soft-deleted or orphaned), clear it so the new one can be created
      if (!isUpdate && invoice.invoiceNumber) {
        const duplicateByNumber = await cq(
          'SELECT id, deleted_at FROM invoices WHERE tenant_id = $1 AND invoice_number = $2 AND id != $3',
          [req.tenantId, invoice.invoiceNumber, invoiceId]
        );
        if (duplicateByNumber.length > 0) {
          const dup = duplicateByNumber[0];
          if (dup.deleted_at) {
            await cq('DELETE FROM invoices WHERE id = $1 AND tenant_id = $2', [dup.id, req.tenantId]);
          } else {
            await cq(
              'UPDATE invoices SET id = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
              [invoiceId, dup.id, req.tenantId]
            );
            const refreshed = await cq(
              'SELECT id, status, version FROM invoices WHERE id = $1 AND tenant_id = $2',
              [invoiceId, req.tenantId]
            );
            if (refreshed.length > 0) {
              existing.length = 0;
              existing.push(refreshed[0]);
            }
          }
        }
      }

      const txIsActualUpdate = existing.length > 0;

      // Optimistic locking check for POST update
      const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;
      const serverVersion = txIsActualUpdate ? existing[0].version : null;
      if (clientVersion != null && serverVersion != null && clientVersion !== serverVersion) {
        throw { code: 'VERSION_CONFLICT', clientVersion, serverVersion };
      }

      const result = await cq(
        `INSERT INTO invoices (
          id, tenant_id, invoice_number, contact_id, amount, paid_amount, status,
          issue_date, due_date, invoice_type, description, project_id, building_id,
          property_id, unit_id, category_id, agreement_id, security_deposit_charge,
          service_charges, rental_month, user_id, created_at, updated_at, version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
                  COALESCE((SELECT created_at FROM invoices WHERE id = $1), NOW()), NOW(), 1)
        ON CONFLICT (id) 
        DO UPDATE SET
          invoice_number = EXCLUDED.invoice_number,
          contact_id = EXCLUDED.contact_id,
          amount = EXCLUDED.amount,
          paid_amount = EXCLUDED.paid_amount,
          status = EXCLUDED.status,
          issue_date = EXCLUDED.issue_date,
          due_date = EXCLUDED.due_date,
          invoice_type = EXCLUDED.invoice_type,
          description = EXCLUDED.description,
          project_id = EXCLUDED.project_id,
          building_id = EXCLUDED.building_id,
          property_id = EXCLUDED.property_id,
          unit_id = EXCLUDED.unit_id,
          category_id = EXCLUDED.category_id,
          agreement_id = EXCLUDED.agreement_id,
          security_deposit_charge = EXCLUDED.security_deposit_charge,
          service_charges = EXCLUDED.service_charges,
          rental_month = EXCLUDED.rental_month,
          user_id = EXCLUDED.user_id,
          updated_at = NOW(),
          version = COALESCE(invoices.version, 1) + 1,
          deleted_at = NULL
        WHERE invoices.tenant_id = $2 AND (invoices.version = $22 OR invoices.version IS NULL)
        RETURNING *`,
        [
          invoiceId,
          req.tenantId,
          invoice.invoiceNumber,
          invoice.contactId,
          invoice.amount,
          invoice.paidAmount || 0,
          invoice.status,
          invoice.issueDate,
          invoice.dueDate,
          invoice.invoiceType,
          invoice.description || null,
          invoice.projectId || null,
          invoice.buildingId || null,
          invoice.propertyId || null,
          invoice.unitId || null,
          invoice.categoryId || null,
          invoice.agreementId || null,
          invoice.securityDepositCharge || null,
          invoice.serviceCharges || null,
          invoice.rentalMonth || null,
          req.user?.userId || null,
          serverVersion
        ]
      );
      return { saved: result[0], isActualUpdate: txIsActualUpdate };
    });

    if (!saved) {
      // Version mismatch on update — the WHERE clause filtered it out
      return res.status(409).json({
        error: 'Version conflict',
        message: 'Invoice was modified by another session. Please refresh and try again.',
      });
    }

    // Emit WebSocket event for real-time sync
    if (isActualUpdate) {
      emitToTenant(req.tenantId!, WS_EVENTS.INVOICE_UPDATED, {
        invoice: saved,
        userId: req.user?.userId,
        username: req.user?.username,
      });
    } else {
      emitToTenant(req.tenantId!, WS_EVENTS.INVOICE_CREATED, {
        invoice: saved,
        userId: req.user?.userId,
        username: req.user?.username,
      });
    }

    invalidateARCache(req.tenantId!);
    res.status(isActualUpdate ? 200 : 201).json(saved);
  } catch (error: any) {
    if (error.code === 'VERSION_CONFLICT') {
      return res.status(409).json({
        error: 'Version conflict',
        message: `Expected version ${error.clientVersion} but server has version ${error.serverVersion}.`,
        serverVersion: error.serverVersion,
      });
    }
    console.error('Error creating/updating invoice:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Invoice number already exists' });
    }
    res.status(500).json({ error: 'Failed to save invoice' });
  }
});

// PUT update invoice
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const invoice = req.body;

    // Immutability: reject updates to paid invoices
    const current = await db.query(
      'SELECT id, invoice_number, status, version FROM invoices WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (current.length > 0 && current[0].status === 'Paid') {
      return res.status(403).json({
        error: 'Immutable record',
        message: 'Cannot modify a paid invoice. Posted financial records are immutable.',
        code: 'INVOICE_PAID_IMMUTABLE',
        invoiceId: current[0].id,
        invoiceNumber: current[0].invoice_number ?? undefined,
      });
    }

    const clientVersion = req.headers['x-entity-version'] ? parseInt(req.headers['x-entity-version'] as string) : null;

    const paidAmount = invoice.paidAmount || 0;
    const invoiceAmount = invoice.amount || 0;
    const resolvedStatus = computeInvoiceStatus(paidAmount, invoiceAmount);

    let putQuery = `
      UPDATE invoices 
      SET invoice_number = $1, contact_id = $2, amount = $3, paid_amount = $4, 
          status = $5, issue_date = $6, due_date = $7, invoice_type = $8, 
          description = $9, project_id = $10, building_id = $11, property_id = $12,
          unit_id = $13, category_id = $14, agreement_id = $15, 
          security_deposit_charge = $16, service_charges = $17, rental_month = $18,
          user_id = $19, updated_at = NOW(),
          version = COALESCE(version, 1) + 1
      WHERE id = $20 AND tenant_id = $21
    `;
    const putParams: any[] = [
      invoice.invoiceNumber,
      invoice.contactId,
      invoice.amount,
      paidAmount,
      resolvedStatus,
      invoice.issueDate,
      invoice.dueDate,
      invoice.invoiceType,
      invoice.description || null,
      invoice.projectId || null,
      invoice.buildingId || null,
      invoice.propertyId || null,
      invoice.unitId || null,
      invoice.categoryId || null,
      invoice.agreementId || null,
      invoice.securityDepositCharge || null,
      invoice.serviceCharges || null,
      invoice.rentalMonth || null,
      req.user?.userId || null,
      req.params.id,
      req.tenantId
    ];

    if (clientVersion != null) {
      putQuery += ` AND version = $22`;
      putParams.push(clientVersion);
    }

    putQuery += ` RETURNING *`;

    const result = await db.query(putQuery, putParams);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    emitToTenant(req.tenantId!, WS_EVENTS.INVOICE_UPDATED, {
      invoice: result[0],
      userId: req.user?.userId,
      username: req.user?.username,
    });

    invalidateARCache(req.tenantId!);
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// DELETE invoice
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();

    // Immutability: reject deletion of paid invoices
    const current = await db.query(
      'SELECT id, invoice_number, status FROM invoices WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (current.length > 0 && current[0].status === 'Paid') {
      return res.status(403).json({
        error: 'Immutable record',
        message: 'Cannot delete a paid invoice. Posted financial records are immutable.',
        code: 'INVOICE_PAID_IMMUTABLE',
        invoiceId: current[0].id,
        invoiceNumber: current[0].invoice_number ?? undefined,
      });
    }

    const result = await db.query(
      'UPDATE invoices SET deleted_at = NOW(), updated_at = NOW(), version = COALESCE(version, 1) + 1 WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    emitToTenant(req.tenantId!, WS_EVENTS.INVOICE_DELETED, {
      invoiceId: req.params.id,
      userId: req.user?.userId,
      username: req.user?.username,
    });

    invalidateARCache(req.tenantId!);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

export default router;

