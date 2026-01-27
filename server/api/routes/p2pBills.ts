import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { emitToTenant, WS_EVENTS } from '../../services/websocketHelper.js';

const router = Router();
const getDb = () => getDatabaseService();

/**
 * Internal function to calculate due date from payment terms
 */
function calculateDueDate(paymentTerms: string | null): string {
  if (!paymentTerms) {
    return new Date().toISOString().split('T')[0]; // Default to today
  }

  const today = new Date();
  let daysToAdd = 0;

  switch (paymentTerms) {
    case 'Net 30':
      daysToAdd = 30;
      break;
    case 'Net 60':
      daysToAdd = 60;
      break;
    case 'Net 90':
      daysToAdd = 90;
      break;
    case 'Due on Receipt':
      daysToAdd = 0;
      break;
    default:
      daysToAdd = 30; // Default to 30 days
  }

  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + daysToAdd);
  return dueDate.toISOString().split('T')[0];
}

/**
 * Auto-generate bill from approved invoice when PO is marked DELIVERED
 * This is called internally when a PO status changes to DELIVERED
 */
async function autoGenerateBill(invoiceId: string, poId: string, tenantId: string): Promise<any> {
  try {
    const db = getDb();

    // Get approved invoice
    const invoiceResult = await db.query(
      'SELECT * FROM p2p_invoices WHERE id = $1 AND status = $2',
      [invoiceId, 'APPROVED']
    );

    if (!invoiceResult || invoiceResult.length === 0) {
      throw new Error(`Approved invoice not found: ${invoiceId}`);
    }

    const invoice = invoiceResult[0];

    // Get supplier payment_terms
    const supplierResult = await db.query(
      'SELECT payment_terms FROM tenants WHERE id = $1',
      [invoice.supplier_tenant_id]
    );

    const paymentTerms = supplierResult && supplierResult.length > 0 ? supplierResult[0].payment_terms : null;

    // Calculate due_date
    const dueDate = calculateDueDate(paymentTerms);

    // Generate bill number
    const billNumber = `BILL-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const billId = `p2p_bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    // Create bill record
    const billResult = await db.query(
      `INSERT INTO p2p_bills (
        id, bill_number, invoice_id, po_id, buyer_tenant_id, supplier_tenant_id,
        amount, due_date, payment_status, paid_amount, tenant_id, user_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        billId,
        billNumber,
        invoiceId,
        poId,
        invoice.buyer_tenant_id,
        invoice.supplier_tenant_id,
        invoice.amount,
        dueDate,
        'UNPAID',
        0,
        tenantId,
        null,
        now,
        now
      ]
    );

    if (!billResult || billResult.length === 0) {
      throw new Error('Failed to create bill');
    }

    const bill = billResult[0];

    // Emit WebSocket event
    if (tenantId) {
      emitToTenant(tenantId, WS_EVENTS.P2P_BILL_CREATED, bill);
    }

    return bill;
  } catch (error: any) {
    console.error('Error auto-generating bill:', error);
    throw error;
  }
}

/**
 * GET /api/p2p-bills
 * Get all P2P bills for the tenant
 */
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { status, invoiceId, poId } = req.query;

    let query = `
      SELECT * FROM p2p_bills 
      WHERE tenant_id = $1
    `;
    const params: any[] = [req.tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND payment_status = $${paramIndex++}`;
      params.push(status);
    }

    if (invoiceId) {
      query += ` AND invoice_id = $${paramIndex++}`;
      params.push(invoiceId);
    }

    if (poId) {
      query += ` AND po_id = $${paramIndex++}`;
      params.push(poId);
    }

    query += ' ORDER BY created_at DESC';

    const bills = await db.query(query, params);
    res.json(bills);
  } catch (error: any) {
    console.error('Error fetching P2P bills:', error);
    res.status(500).json({ error: 'Failed to fetch P2P bills' });
  }
});

/**
 * GET /api/p2p-bills/:id
 * Get a specific P2P bill
 */
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const bill = await db.query(
      'SELECT * FROM p2p_bills WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );

    if (!bill || bill.length === 0) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    res.json(bill[0]);
  } catch (error: any) {
    console.error('Error fetching P2P bill:', error);
    res.status(500).json({ error: 'Failed to fetch P2P bill' });
  }
});

/**
 * PUT /api/p2p-bills/:id/payment-status
 * Update bill payment status
 */
router.put('/:id/payment-status', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const { paymentStatus, paidAmount, paymentAccountId, transactionId } = req.body;

    if (!paymentStatus) {
      return res.status(400).json({ error: 'paymentStatus is required' });
    }

    const updateFields: string[] = ['payment_status = $1', 'updated_at = NOW()'];
    const updateValues: any[] = [paymentStatus];
    let paramIndex = 2;

    if (paidAmount !== undefined) {
      updateFields.push(`paid_amount = $${paramIndex++}`);
      updateValues.push(paidAmount);
    }

    if (paymentAccountId !== undefined) {
      updateFields.push(`payment_account_id = $${paramIndex++}`);
      updateValues.push(paymentAccountId);
    }

    if (transactionId !== undefined) {
      updateFields.push(`transaction_id = $${paramIndex++}`);
      updateValues.push(transactionId);
    }

    if (paymentStatus === 'PAID' || paymentStatus === 'PARTIALLY_PAID') {
      updateFields.push(`paid_at = $${paramIndex++}`);
      updateValues.push(new Date().toISOString());
    }

    updateValues.push(req.params.id, req.tenantId);

    const result = await db.query(
      `UPDATE p2p_bills 
       SET ${updateFields.join(', ')}
       WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
       RETURNING *`,
      updateValues
    );

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    const updatedBill = result[0];

    // Emit WebSocket event
    if (req.tenantId) {
      emitToTenant(req.tenantId, WS_EVENTS.P2P_BILL_UPDATED, updatedBill);
    }

    res.json(updatedBill);
  } catch (error: any) {
    console.error('Error updating bill payment status:', error);
    res.status(500).json({ error: 'Failed to update bill payment status' });
  }
});

export default router;
export { autoGenerateBill };
